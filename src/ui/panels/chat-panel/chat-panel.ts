/**
 * Chat Panel
 * Orchestrator for the chat timeline: wires AI controls, message rendering,
 * context menus, and note editing. Delegates to sub-modules.
 */

import type { Core } from 'cytoscape';
import type { NodeId, SceneId } from '../../../core/main-types';
import type { ProposedAction } from '../../../ai/types';
import type { ChatMessage, MessageSource, ChatImageAttachment } from '../../../core/chat-types';
import type { SceneContext } from '../../../ai/context-builder';

import { chatSession } from '../../../ai/chat-session';
import { chatStore } from '../../../storage/chat-store';
import { localiseAttachment } from '../../../ai/image-search/image-search';
import { QUICK_ACTIONS, resolveQuickActionMessage } from '../../../ai/prompts';
import { getSetting } from '../../../config';

import {
  renderAIMessage, renderNote, renderError, renderHint, scrollToBottom
} from './chat-message-renderer';
import { showMessageContextMenu, showPanelContextMenu } from './chat-context-menu';
import { createNoteEditor, editNote } from './chat-note-editor';
import type { ContextMenuActions } from './chat-context-menu';
import type { MessageContextMenuHandler, NoteEditHandler } from './chat-message-renderer';

import '../../../styles/chat-panel.css';

// ============================================================================
// CHAT PANEL
// ============================================================================

export class ChatPanel {
  #messagesContainer: HTMLElement;
  #input: HTMLTextAreaElement;
  #quickActionsContainer: HTMLElement;
  #cy: Core;
  #onActionsReceived: ((actions: ProposedAction[]) => void) | null = null;

  constructor(cy: Core) {
    this.#cy = cy;

    const chatContainer = document.getElementById('chat');
    if (!chatContainer) throw new Error('Chat container #chat not found');

    const messagesContainer = chatContainer.querySelector('.chat-messages');
    if (!messagesContainer) throw new Error('.chat-messages not found');
    this.#messagesContainer = messagesContainer as HTMLElement;

    const input = chatContainer.querySelector('.chat-input');
    if (!input) throw new Error('.chat-input not found');
    this.#input = input as HTMLTextAreaElement;

    const inputContainer = chatContainer.querySelector('.chat-input-container');
    if (inputContainer) {
      this.#quickActionsContainer = document.createElement('div');
      this.#quickActionsContainer.className = 'quick-actions';
      inputContainer.insertBefore(this.#quickActionsContainer, this.#input);
      this.#renderQuickActions();
    } else {
      this.#quickActionsContainer = document.createElement('div');
    }

    this.#messagesContainer.innerHTML = '';
    this.#setupEventListeners();
    this.#setupChatSessionEvents();
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  onActionsReceived(callback: (actions: ProposedAction[]) => void): void {
    this.#onActionsReceived = callback;
  }

  async loadForScene(sceneId: SceneId, centralNodeId: NodeId): Promise<void> {
    this.#messagesContainer.innerHTML = '';
    await chatSession.loadForNode(centralNodeId, sceneId);
    // Messages are rendered by onConversationLoaded event handler

    this.#scrollChat();
    this.#updatePlaceholder(centralNodeId);
    this.#updateAIControls();
  }

  async initProvider(apiKey: string): Promise<void> {
    await chatSession.initProvider(apiKey);
  }

  isProviderReady(): boolean {
    return chatSession.isProviderReady();
  }

  // ==========================================================================
  // PRIVATE: HELPERS
  // ==========================================================================

  /** Scroll chat to top or bottom based on user setting */
  #scrollChat(): void {
    if (getSetting('ai.chatScrollPosition') === 'top') {
      this.#messagesContainer.scrollTop = 0;
    } else {
      scrollToBottom(this.#messagesContainer);
    }
  }

  /** Title of the current central node, used as the default image-search query. */
  #currentNodeTitle(): string {
    const nodeId = chatSession.getCurrentNodeId();
    if (!nodeId) return '';
    return (this.#cy.getElementById(nodeId).data('title') as string | undefined)?.trim() ?? '';
  }

  // ==========================================================================
  // PRIVATE: SETUP
  // ==========================================================================

  #renderQuickActions(): void {
    this.#quickActionsContainer.innerHTML = '';

    for (const action of QUICK_ACTIONS) {
      const button = document.createElement('button');
      button.className = 'quick-action-btn';
      button.dataset.action = action.id;
      button.title = action.id === 'clear' ? 'Clear chat history' : (action.displayText ?? action.prompt);
      button.innerHTML = `<span class="quick-action-label">${action.label}</span>`;

      button.addEventListener('click', () => {
        if (action.prompt === '__clear__') {
          this.#clearChat();
        } else {
          const message = resolveQuickActionMessage(action);
          this.#sendQuickAction(message.prompt, message.displayText);
        }
      });

      this.#quickActionsContainer.appendChild(button);
    }
  }

  #setupEventListeners(): void {
    this.#input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.#sendMessage();
      }
    });

    this.#messagesContainer.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.#messagesContainer || target.closest('.message') === null) {
        e.preventDefault();
        showPanelContextMenu(e, this.#contextMenuActions());
      }
    });
  }

  #setupChatSessionEvents(): void {
    chatSession.setEvents({
      onStateChange: (state) => {
        this.#input.disabled = state === 'sending' || state === 'loading';
        if (state === 'sending') {
          this.#input.placeholder = 'Thinking...';
        } else {
          this.#updatePlaceholder(chatSession.getCurrentNodeId());
        }
      },
      onMessageAdded: (message) => {
        this.#renderMessage(message);
        scrollToBottom(this.#messagesContainer);
      },
      onConversationLoaded: (messages, nodeId) => {
        this.#messagesContainer.innerHTML = '';
        for (const message of messages) {
          this.#renderMessage(message);
        }
        this.#scrollChat();
        this.#updatePlaceholder(nodeId);
        void this.#localiseRetrievedImages(nodeId);
      },
      onActionsReceived: (actions) => {
        this.#onActionsReceived?.(actions);
      },
      onError: (error) => {
        renderError(error.message, this.#messagesContainer);
      }
    });

    chatSession.setContextBuilder(() => this.#buildCurrentContext());
  }

  // ==========================================================================
  // PRIVATE: AI ACTIONS
  // ==========================================================================

  async #sendMessage(): Promise<void> {
    const content = this.#input.value.trim();
    if (!content) return;

    const initialized = await chatSession.tryAutoInit();
    if (!initialized) {
      renderHint('To use the AI assistant, add your API key in Settings (⌘,) under AI Assistant.', this.#messagesContainer);
      return;
    }

    this.#input.value = '';
    await chatSession.sendMessage(content);
  }

  async #sendQuickAction(prompt: string, displayText?: string): Promise<void> {
    const initialized = await chatSession.tryAutoInit();
    if (!initialized) {
      renderHint('To use the AI assistant, add your API key in Settings (⌘,) under AI Assistant.', this.#messagesContainer);
      return;
    }

    this.#setQuickActionsEnabled(false);
    await chatSession.sendMessage(prompt, displayText);
    this.#setQuickActionsEnabled(true);
  }

  async #clearChat(): Promise<void> {
    const nodeId = chatSession.getCurrentNodeId();
    if (!nodeId) return;

    // Build confirmation dialog
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;min-width:280px;color:#e6edf3;font-size:14px';

    const title = document.createElement('div');
    title.textContent = 'Clear chat history';
    title.style.cssText = 'font-weight:600;margin-bottom:14px;font-size:15px';

    const makeCheckbox = (label: string, checked: boolean): { row: HTMLElement; input: HTMLInputElement } => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      row.appendChild(input);
      row.appendChild(document.createTextNode(label));
      return { row, input };
    };

    const aiCheck = makeCheckbox('AI dialog', true);
    const notesCheck = makeCheckbox('Notes', true);

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:6px 14px;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;cursor:pointer';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Clear';
    confirmBtn.style.cssText = 'padding:6px 14px;background:#da3633;border:1px solid #da3633;border-radius:6px;color:#fff;cursor:pointer';

    buttons.append(cancelBtn, confirmBtn);
    dialog.append(title, aiCheck.row, notesCheck.row, buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cleanup = (): void => { overlay.remove(); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    cancelBtn.addEventListener('click', cleanup);

    confirmBtn.addEventListener('click', async () => {
      cleanup();
      const sources = new Set<MessageSource | undefined>();
      if (aiCheck.input.checked) sources.add('ai').add(undefined); // undefined = legacy messages
      if (notesCheck.input.checked) sources.add('note');

      if (sources.size === 0) return;

      await chatSession.clearBySources(sources);
      this.#messagesContainer.innerHTML = '';

      // Re-render remaining messages
      const conversation = await chatStore.getConversation(nodeId);
      if (conversation) {
        for (const msg of conversation.messages) {
          this.#renderMessage(msg);
        }
      }
    });
  }

  #setQuickActionsEnabled(enabled: boolean): void {
    const buttons = this.#quickActionsContainer.querySelectorAll('button');
    buttons.forEach(btn => {
      (btn as HTMLButtonElement).disabled = !enabled;
    });
  }

  // ==========================================================================
  // PRIVATE: RENDERING DISPATCH
  // ==========================================================================

  #renderMessage(message: ChatMessage): void {
    if (message.source === 'note') {
      renderNote(message, this.#messagesContainer, this.#messageContextMenuHandler, this.#noteEditHandler);
      return;
    }
    renderAIMessage(message, this.#messagesContainer, this.#messageContextMenuHandler);
  }

  /**
   * Heal link-only retrieved images to stored bytes once, in the background,
   * when a node's chat is opened (lazy localise). No-op unless the offline
   * setting is on. Persists to storage only; the already-rendered link keeps
   * showing, so there is no DOM churn — stored bytes serve the next open.
   */
  async #localiseRetrievedImages(nodeId: NodeId): Promise<void> {
    if (!getSetting('ai.storeRetrievedImages')) return;

    const conversation = await chatStore.getConversation(nodeId);
    if (!conversation) return;

    for (const message of conversation.messages) {
      const attachments = message.attachments;
      if (!attachments?.length) continue;

      const targets = attachments.filter(
        att => att.origin === 'retrieved' && !att.dataUrl && att.sourceUrl
      );
      if (targets.length === 0) continue;

      const localised = await Promise.all(targets.map(localiseAttachment));
      if (localised.every(result => result === null)) continue;

      const byId = new Map<string, ChatImageAttachment>();
      targets.forEach((att, i) => {
        const result = localised[i];
        if (result) byId.set(att.id, result);
      });
      const updated = attachments.map(att => byId.get(att.id) ?? att);
      await chatStore.setMessageAttachments(nodeId, message.id, updated);
    }
  }

  /** Bound handler for context menu on any message */
  #messageContextMenuHandler: MessageContextMenuHandler = (event, messageId, source) => {
    showMessageContextMenu(event, messageId, source, this.#contextMenuActions());
  };

  /** Bound handler for double-click edit on notes */
  #noteEditHandler: NoteEditHandler = (noteEl, messageId, content, attachments) => {
    editNote(
      noteEl, messageId, content, attachments,
      this.#messagesContainer,
      chatSession.getCurrentNodeId(),
      this.#messageContextMenuHandler,
      this.#noteEditHandler,
      this.#currentNodeTitle()
    );
  };

  #contextMenuActions(): ContextMenuActions {
    return {
      onDelete: (messageId) => this.#deleteMessage(messageId),
      onAddNote: (afterEl) => createNoteEditor(
        this.#messagesContainer,
        chatSession.getCurrentNodeId(),
        this.#messageContextMenuHandler,
        this.#noteEditHandler,
        afterEl,
        this.#currentNodeTitle()
      ),
      onEditNote: (messageEl, messageId) => {
        const msg = chatSession.getMessages().find(m => m.id === messageId);
        if (msg) this.#noteEditHandler(messageEl, messageId, msg.content, msg.attachments ?? []);
      },
    };
  }

  async #deleteMessage(messageId: string): Promise<void> {
    const nodeId = chatSession.getCurrentNodeId();
    if (!nodeId) return;

    await chatStore.deleteMessage(nodeId, messageId);

    const messageEl = this.#messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
    messageEl?.remove();

    await chatSession.loadForNode(nodeId, this.#cy.scratch('currentSceneId'));
  }

  // ==========================================================================
  // PRIVATE: UI STATE
  // ==========================================================================

  #updatePlaceholder(nodeId: NodeId | null): void {
    if (!nodeId) {
      this.#input.placeholder = 'Ask about this node...';
      return;
    }

    const node = this.#cy.getElementById(nodeId);
    const title = node.data('title') ?? 'this node';

    if (chatSession.hasApiKey()) {
      this.#input.placeholder = `Ask about ${title}...`;
    } else {
      this.#input.placeholder = 'Set up AI key in Settings (⌘,)';
    }
  }

  #updateAIControls(): void {
    const hasKey = chatSession.hasApiKey();
    const buttons = this.#quickActionsContainer.querySelectorAll('.quick-action-btn');

    this.#input.disabled = !hasKey;
    this.#input.classList.toggle('ai-disabled', !hasKey);

    buttons.forEach(btn => {
      const button = btn as HTMLButtonElement;
      const action = button.dataset.action;
      const alwaysOn = action === 'clear';
      button.disabled = alwaysOn ? false : !hasKey;
      button.classList.toggle('ai-disabled', alwaysOn ? false : !hasKey);
    });
  }

  // ==========================================================================
  // PRIVATE: CONTEXT
  // ==========================================================================

  #buildCurrentContext(): SceneContext {
    const sceneId = this.#cy.scratch('currentSceneId') as SceneId;
    const centralNodeId = chatSession.getCurrentNodeId()!;

    const visibleNodeIds: NodeId[] = [];
    this.#cy.nodes().forEach(node => {
      visibleNodeIds.push(node.id() as NodeId);
    });

    const selectedNodeIds: NodeId[] = [];
    this.#cy.nodes(':selected').forEach(node => {
      selectedNodeIds.push(node.id() as NodeId);
    });

    const nodesWithChats: NodeId[] = [];
    const navigationHistory: NodeId[] = [];

    return {
      centralNodeId,
      sceneId,
      visibleNodeIds,
      selectedNodeIds,
      navigationHistory,
      nodesWithChats
    };
  }
}
