/**
 * Chat Session
 * Manages the current conversation with AI
 */

import type { NodeId, SceneId } from '../core/main-types';
import type { ChatMessage, MessageSource } from '../core/chat-types';
import type { AIResponse, ProviderMessage, ProposedAction } from './types';
import type { AIProvider } from './providers/provider';
import type { SceneContext } from './context-builder';

import { chatStore } from '../storage/chat-store';
import { buildSystemPrompt } from './context-builder';
import { createProvider } from './providers/provider';
import { getSelectedProviderModel, resolveProviderConfig } from './providers/provider-resolution';
import { getSetting } from '../config';
import { eventBus } from '../events/event-bus';
import { isDebug } from '../config/debug-flags';

// ============================================================================
// TYPES
// ============================================================================

export type ChatSessionState = 'idle' | 'loading' | 'sending' | 'error';

/** Stands in for the prose when a reply carried nothing but an action block. */
const BLOCK_ONLY_REPLY = 'Suggestions added to the node shelf.';

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
  /** What was loaded when the map view was entered, restored on leaving it. */
  #beforeMap: { nodeId: NodeId; sceneId: SceneId } | null = null;
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
    this.#provider = createProvider({
      type: getSetting('ai.provider'),
      apiKey,
      model: getSelectedProviderModel()
    });
  }

  /**
   * Check if provider is initialized
   */
  isProviderReady(): boolean {
    return this.#provider !== null;
  }

  /**
   * Check if any AI provider has an API key configured.
   * Does not initialize the provider — just reads settings.
   */
  hasApiKey(): boolean {
    return resolveProviderConfig() !== null;
  }

  /**
   * Try to initialize (or re-initialize) provider from current settings.
   * Called before each chat attempt to pick up any settings changes.
   * Returns true if provider was successfully initialized.
   */
  async tryAutoInit(): Promise<boolean> {
    const config = resolveProviderConfig();

    if (!config) {
      this.#provider = null;
      return false;
    }

    this.#provider = createProvider(config);

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
   * Re-read the current node's messages from storage into the in-memory list,
   * without re-rendering. Used after the note editor writes directly to the
   * store so getMessages() stays authoritative for context-menu lookups.
   */
  async refreshMessages(): Promise<void> {
    if (!this.#currentNodeId) return;
    const conversation = await chatStore.getConversation(this.#currentNodeId);
    this.#messages = conversation?.messages ?? [];
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
      // Built before the user's message is stored, so a refused send leaves no
      // unanswered turn behind.
      const systemPrompt = buildSystemPrompt(this.#buildContext());
      if (!systemPrompt) {
        throw new Error('The node this conversation belongs to is no longer in the graph. Open another scene to continue.');
      }

      // Add user message (displayText shown in chat/stored, content sent to LLM)
      const userMessage = await chatStore.addMessage(
        this.#currentNodeId,
        'user',
        displayText ?? content,
        'ai'
      );
      // In-memory copy uses actual prompt for LLM context
      const llmMessage = displayText ? { ...userMessage, content } : userMessage;
      this.#messages.push(llmMessage);
      this.#events.onMessageAdded?.(userMessage);

      // Convert messages to provider format
      const providerMessages = this.#toProviderMessages();
      if (isDebug('d_chat')) logRequest(systemPrompt, providerMessages);

      // Send to AI
      const response = await this.#provider.sendMessage(providerMessages, systemPrompt);

      if (isDebug('d_chat')) logResponse(response.rawContent ?? response.content);

      if (response.actions.length > 0) {
        this.#pendingActions = response.actions;
        this.#events.onActionsReceived?.(response.actions);
      }

      // The prose is stored as the model wrote it, whatever the request was. A
      // block-only reply would store an empty turn, which providers reject when it
      // is replayed as history, so it gets a fixed line instead.
      const assistantMessage = await chatStore.addMessage(
        this.#currentNodeId,
        'assistant',
        response.content || BLOCK_ONLY_REPLY,
        'ai'
      );
      this.#messages.push(assistantMessage);
      this.#events.onMessageAdded?.(assistantMessage);

      this.#setState('idle');
      return response;

    } catch (error) {
      this.#handleError(error as Error);
      return null;
    }
  }

  /**
   * Ask the model something beside the conversation, with the conversation's
   * full context and none of its persistence: the same system prompt and
   * history a turn would carry, plus `instruction` as the last user message.
   * Nothing is stored, no event fires, the session state does not change, and
   * the next real turn is unaware this happened. Used to draft a note's picture
   * description (docs/ai/chat-image-generation.md §3.1a). The one provider call
   * through this class that writes no turn.
   */
  async draftAside(instruction: string): Promise<string> {
    if (!this.#provider) await this.tryAutoInit();
    const provider = this.#provider;
    if (!provider) throw new Error('Add an AI provider API key in Settings first.');
    if (!this.#currentNodeId) throw new Error('No node loaded');

    const systemPrompt = buildSystemPrompt(this.#buildContext());
    if (!systemPrompt) {
      throw new Error('The node this conversation belongs to is no longer in the graph.');
    }

    const providerMessages: ProviderMessage[] = [
      ...this.#toProviderMessages(),
      { role: 'user', content: instruction }
    ];
    if (isDebug('d_chat')) logRequest(systemPrompt, providerMessages);

    const response = await provider.sendMessage(providerMessages, systemPrompt);
    if (isDebug('d_chat')) logResponse(response.rawContent ?? response.content);

    return response.content.trim();
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
      selectedNodeIds: [],
      navigationHistory: [],
      nodesWithChats: []
    };
  }

  #toProviderMessages(): ProviderMessage[] {
    return this.#messages
      .filter(message => message.source === 'ai' || message.source === undefined)
      .map(message => ({
        role: message.role,
        content: message.content
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

    // The map view: conversations are node-keyed, so the learning space follows
    // the focus; the scene id stays the scene underneath, because the context
    // is still built from it (docs/map-view.md §7.5). Leaving restores what was
    // loaded before entering, unless a scene change has since replaced it.
    eventBus.on('mapViewChanged', ({ active, focusNodeId }) => {
      const sceneId = this.#currentSceneId;
      if (!sceneId) return;
      if (active && focusNodeId) {
        if (!this.#beforeMap && this.#currentNodeId) this.#beforeMap = { nodeId: this.#currentNodeId, sceneId };
        this.loadForNode(focusNodeId, sceneId);
        return;
      }
      if (!active && this.#beforeMap) {
        const { nodeId, sceneId: previousSceneId } = this.#beforeMap;
        this.#beforeMap = null;
        this.loadForNode(nodeId, previousSceneId);
      }
    });
  }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * The request as handed to the provider: the system prompt, then every message
 * in the order sent. Every adapter passes both through unchanged, so this is the
 * text the model reads; only the provider's envelope around it is not shown —
 * the Network tab has that.
 */
function logRequest(systemPrompt: string, messages: ProviderMessage[]): void {
  const size = `system ${systemPrompt.length} chars, ${messages.length} message${messages.length === 1 ? '' : 's'}`;
  console.group(`[ChatSession] Request → provider (${size})`);
  console.log('──── system ────\n' + systemPrompt);
  messages.forEach((message, index) => {
    console.log(`──── message ${index + 1} of ${messages.length}: ${message.role} ────\n` + message.content);
  });
  console.groupEnd();
}

/** The model's reply before the app splits it into prose and actions. */
function logResponse(rawResponse: string): void {
  console.group(`[ChatSession] Response ← provider (${rawResponse.length} chars)`);
  console.log(rawResponse);
  console.groupEnd();
}

// Singleton instance
export const chatSession = new ChatSession();

// Subscribe to events
chatSession.subscribeToEvents();
