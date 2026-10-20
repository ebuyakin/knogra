/**
 * Notes pane (docs/mobile-viewer.md §9)
 *
 * The focus's saved notes and conversation, read only, rendered by the app's
 * own message renderer so formulas, images and formatting look as they do on
 * the desktop. The renderer's handlers for context menus and editing are
 * given nothing to do. Loaded when the pane is opened, so travel on the map
 * changes what the next opening shows.
 */

import type { NodeId } from '../core/main-types';
import { graphStore } from '../storage/graph-store';
import { chatStore } from '../storage/chat-store';
import { renderAIMessage, renderNote, type MessageContextMenuHandler } from '../ui/panels/chat-panel/chat-message-renderer';
import '../styles/chat-panel.css';

/** Read only: a long press or right click on a message does nothing here. */
const NO_CONTEXT_MENU: MessageContextMenuHandler = () => undefined;

export class NotesPane {
  #title: HTMLElement;
  #body: HTMLElement;
  #shownNodeId: NodeId | null = null;

  constructor(root: HTMLElement) {
    const title = root.querySelector<HTMLElement>('#notes-title');
    const body = root.querySelector<HTMLElement>('#notes-body');
    if (!title || !body) throw new Error('Notes pane: title or body not found');
    this.#title = title;
    this.#body = body;
  }

  /** Show a node's notes and conversation; nothing is re-rendered for the node already shown. */
  async showNode(nodeId: NodeId | null): Promise<void> {
    if (nodeId === null || nodeId === this.#shownNodeId) return;
    this.#shownNodeId = nodeId;
    const node = graphStore.nodes.find(candidate => candidate.id === nodeId);
    this.#title.textContent = node?.title ?? '';
    this.#body.innerHTML = '';

    const conversation = await chatStore.getConversation(nodeId);
    // The node may have changed while the store was read.
    if (this.#shownNodeId !== nodeId) return;
    const messages = conversation?.messages ?? [];
    if (messages.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pane-note';
      empty.textContent = 'No notes for this concept.';
      this.#body.appendChild(empty);
      return;
    }
    for (const message of messages) {
      if (message.source === 'note') renderNote(message, this.#body, NO_CONTEXT_MENU);
      else renderAIMessage(message, this.#body, NO_CONTEXT_MENU);
    }
    this.#body.scrollTop = 0;
  }
}
