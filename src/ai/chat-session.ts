/**
 * Chat Session
 * Manages the current conversation with AI
 */

import type { NodeId, SceneId } from '../core/main-types';
import type { ChatMessage, MessageSource } from '../core/chat-types';
import type { AIResponse, ProviderMessage, ProposedAction } from './types';
import type { AIProvider } from './providers/provider';
import type { ProviderType } from '../core/main-types';
import type { SceneContext } from './context-builder';

import { chatStore } from '../storage/chat-store';
import { buildSystemPrompt } from './context-builder';
import { createProvider } from './providers/provider';
import { getSetting } from '../config';
import { eventBus } from '../events/event-bus';
import { isDebug } from '../config/debug-flags';

// ============================================================================
// TYPES
// ============================================================================

export type ChatSessionState = 'idle' | 'loading' | 'sending' | 'error';

export interface ChatSessionEvents {
  onStateChange?: (state: ChatSessionState) => void;
  onMessageAdded?: (message: ChatMessage) => void;
  onConversationLoaded?: (messages: ChatMessage[], nodeId: NodeId) => void;
  onActionsReceived?: (actions: ProposedAction[]) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// CHAT SESSION
// ============================================================================

export class ChatSession {
  #provider: AIProvider | null = null;
  #currentNodeId: NodeId | null = null;
  #currentSceneId: SceneId | null = null;
  #messages: ChatMessage[] = [];
  #pendingActions: ProposedAction[] = [];
  #state: ChatSessionState = 'idle';
  #events: ChatSessionEvents = {};
  #contextBuilder: (() => SceneContext) | null = null;

  /**
   * Set event handlers
   */
  setEvents(events: ChatSessionEvents): void {
    this.#events = events;
  }

  /**
   * Set context builder function (provides current scene state)
   */
  setContextBuilder(builder: () => SceneContext): void {
    this.#contextBuilder = builder;
  }

  /**
   * Initialize the AI provider
   */
  async initProvider(apiKey: string): Promise<void> {
    const providerType = getSetting('ai.provider');
    const model = providerType === 'openrouter'
      ? getSetting('ai.openrouterModel')
      : getSetting('ai.geminiModel');
    
    this.#provider = createProvider({
      type: providerType,
      apiKey,
      model
    });
  }

  /**
   * Check if provider is initialized
   */
  isProviderReady(): boolean {
    return this.#provider !== null;
  }

  /**
   * Resolve which provider to use and its API key.
   * If selected provider has a key, use it. Otherwise, fall back to
   * whichever provider has a key configured.
   */
  #resolveProvider(): { providerType: ProviderType; apiKey: string } | null {
    const selectedProvider = getSetting('ai.provider') as ProviderType;
    const geminiKey = getSetting('ai.geminiApiKey') as string;
    const openrouterKey = getSetting('ai.openrouterApiKey') as string;

    // Prefer selected provider if it has a key
    if (selectedProvider === 'openrouter' && openrouterKey) {
      return { providerType: 'openrouter', apiKey: openrouterKey };
    }
    if (selectedProvider === 'gemini' && geminiKey) {
      return { providerType: 'gemini', apiKey: geminiKey };
    }

    // Fall back to whichever has a key
    if (openrouterKey) return { providerType: 'openrouter', apiKey: openrouterKey };
    if (geminiKey) return { providerType: 'gemini', apiKey: geminiKey };

    return null;
  }

  /**
   * Check if any AI provider has an API key configured.
   * Does not initialize the provider — just reads settings.
   */
  hasApiKey(): boolean {
    return this.#resolveProvider() !== null;
  }

  /**
   * Try to initialize (or re-initialize) provider from current settings.
   * Called before each chat attempt to pick up any settings changes.
   * Returns true if provider was successfully initialized.
   */
  async tryAutoInit(): Promise<boolean> {
    const resolved = this.#resolveProvider();

    if (!resolved) {
      this.#provider = null;
      return false;
    }

    const { providerType, apiKey } = resolved;
    const model = providerType === 'openrouter'
      ? getSetting('ai.openrouterModel')
      : getSetting('ai.geminiModel');

    this.#provider = createProvider({
      type: providerType,
      apiKey,
      model
    });

    return this.#provider !== null;
  }

  /**
   * Load conversation for a node
   */
  async loadForNode(nodeId: NodeId, sceneId: SceneId): Promise<void> {
    this.#setState('loading');
    
    try {
      this.#currentNodeId = nodeId;
      this.#currentSceneId = sceneId;
      this.#pendingActions = []; // Clear actions when switching nodes
      
      const conversation = await chatStore.getConversation(nodeId);
      this.#messages = conversation?.messages ?? [];
      
      // Notify listeners of loaded conversation
      this.#events.onConversationLoaded?.(this.#messages, nodeId);
      
      this.#setState('idle');
    } catch (error) {
      this.#handleError(error as Error);
    }
  }

  /**
   * Get current messages
   */
  getMessages(): ChatMessage[] {
    return [...this.#messages];
  }

  /**
   * Get current node ID
   */
  getCurrentNodeId(): NodeId | null {
    return this.#currentNodeId;
  }

  /**
   * Get current state
   */
  getState(): ChatSessionState {
    return this.#state;
  }

  /**
   * Get pending actions from last AI response
   */
  getPendingActions(): ProposedAction[] {
    return [...this.#pendingActions];
  }

  /**
   * Clear a specific action (after execution)
   */
  removeAction(index: number): void {
    this.#pendingActions.splice(index, 1);
  }

  /**
   * Clear all pending actions
   */
  clearActions(): void {
    this.#pendingActions = [];
  }

  /**
   * Send a message and get AI response
   */
  async sendMessage(content: string, displayText?: string): Promise<AIResponse | null> {
    if (!this.#provider) {
      this.#handleError(new Error('AI provider not initialized'));
      return null;
    }

    if (!this.#currentNodeId) {
      this.#handleError(new Error('No node loaded'));
      return null;
    }

    this.#setState('sending');

    try {
      // Add user message (displayText shown in chat/stored, content sent to LLM)
      const userMessage = await chatStore.addMessage(
        this.#currentNodeId,
        'user',
        displayText ?? content
      );
      // In-memory copy uses actual prompt for LLM context
      const llmMessage = displayText ? { ...userMessage, content } : userMessage;
      this.#messages.push(llmMessage);
      this.#events.onMessageAdded?.(userMessage);

      // Build context
      const context = this.#buildContext();
      const systemPrompt = buildSystemPrompt(context);

      // Convert messages to provider format
      const providerMessages = this.#toProviderMessages();

      // Send to AI
      const response = await this.#provider.sendMessage(providerMessages, systemPrompt);

      // Add assistant message
      const assistantMessage = await chatStore.addMessage(
        this.#currentNodeId,
        'assistant',
        response.content
      );
      this.#messages.push(assistantMessage);
      this.#events.onMessageAdded?.(assistantMessage);

      // Store and notify about actions
      if (response.actions.length > 0) {
        this.#pendingActions = response.actions;
        this.#events.onActionsReceived?.(response.actions);
      }

      this.#setState('idle');
      return response;

    } catch (error) {
      this.#handleError(error as Error);
      return null;
    }
  }

  /**
   * Clear current conversation
   */
  async clearConversation(): Promise<void> {
    if (!this.#currentNodeId) return;

    await chatStore.deleteConversation(this.#currentNodeId);
    this.#messages = [];
  }

  /**
   * Clear messages by source types, keeping the rest
   */
  async clearBySources(sources: Set<MessageSource | undefined>): Promise<void> {
    if (!this.#currentNodeId) return;

    await chatStore.deleteMessagesBySources(this.#currentNodeId, sources);
    this.#messages = this.#messages.filter(m => !sources.has(m.source));
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  #setState(state: ChatSessionState): void {
    this.#state = state;
    this.#events.onStateChange?.(state);
  }

  #handleError(error: Error): void {
    console.error('[ChatSession]', error);
    this.#state = 'error';
    this.#events.onError?.(error);
  }

  #buildContext(): SceneContext {
    // Use external context builder if provided
    if (this.#contextBuilder) {
      return this.#contextBuilder();
    }

    // Fallback minimal context
    return {
      centralNodeId: this.#currentNodeId!,
      sceneId: this.#currentSceneId!,
      visibleNodeIds: [this.#currentNodeId!],
      navigationHistory: [],
      nodesWithChats: []
    };
  }

  #toProviderMessages(): ProviderMessage[] {
    return this.#messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * Subscribe to EventBus events
   * Called once after instantiation
   */
  subscribeToEvents(): void {
    eventBus.on('sceneChanged', ({ sceneId, centralNodeId }) => {
      if (isDebug('d_chat')) console.log(`[ChatSession] Scene changed to ${sceneId}, loading chat for node ${centralNodeId}`);
      this.loadForNode(centralNodeId, sceneId);
    });
  }
}

// Singleton instance
export const chatSession = new ChatSession();

// Subscribe to events
chatSession.subscribeToEvents();
