/**
 * Chat Note Editor
 * Creates and manages inline note editing within the chat timeline.
 */

import type { NodeId } from '../../../core/main-types';
import type { ChatMessage, MessageId } from '../../../core/chat-types';
import { chatStore } from '../../../storage/chat-store';
import { buildNoteElement, scrollToBottom } from './chat-message-renderer';
import type { MessageContextMenuHandler, NoteEditHandler } from './chat-message-renderer';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create an inline note editor in the chat timeline.
 * Inserts after `afterEl` if provided, or appends at the end.
 */
export function createNoteEditor(
  container: HTMLElement,
  nodeId: NodeId | null,
  onContextMenu: MessageContextMenuHandler,
  onEdit: NoteEditHandler,
  afterEl?: HTMLElement | null
): void {
  // Don't create if one is already open
  if (container.querySelector('.note-editor')) return;

  const editorEl = document.createElement('div');
  editorEl.className = 'message note note-editor';

  const textarea = document.createElement('textarea');
  textarea.className = 'note-input';
  textarea.placeholder = 'Type your note...';
  textarea.rows = 2;

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveNote(textarea.value.trim(), editorEl, container, nodeId, onContextMenu, onEdit);
    }
    if (e.key === 'Escape') {
      editorEl.remove();
    }
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => {
      if (editorEl.isConnected) {
        const content = textarea.value.trim();
        if (content) {
          saveNote(content, editorEl, container, nodeId, onContextMenu, onEdit);
        } else {
          editorEl.remove();
        }
      }
    }, 150);
  });

  editorEl.appendChild(textarea);

  // Insert after the target message, or at the end
  if (afterEl?.nextSibling) {
    container.insertBefore(editorEl, afterEl.nextSibling);
  } else {
    container.appendChild(editorEl);
  }

  scrollToBottom(container);
  textarea.focus();
}

/**
 * Transform an existing note into an inline editor for editing.
 * Replaces the note element with a textarea, restores on save/cancel.
 */
export function editNote(
  noteEl: HTMLElement,
  messageId: MessageId,
  currentContent: string,
  container: HTMLElement,
  nodeId: NodeId | null,
  onContextMenu: MessageContextMenuHandler,
  onEdit: NoteEditHandler
): void {
  // Don't edit if another editor is already open
  if (container.querySelector('.note-editor')) return;

  const editorEl = document.createElement('div');
  editorEl.className = 'message note note-editor';

  const textarea = document.createElement('textarea');
  textarea.className = 'note-input';
  textarea.value = currentContent;
  textarea.rows = Math.max(2, currentContent.split('\n').length);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      updateNote(textarea.value.trim(), messageId, editorEl, nodeId, onContextMenu, onEdit, currentContent);
    }
    if (e.key === 'Escape') {
      // Cancel — restore original note
      editorEl.replaceWith(noteEl);
    }
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => {
      if (editorEl.isConnected) {
        updateNote(textarea.value.trim(), messageId, editorEl, nodeId, onContextMenu, onEdit, currentContent);
      }
    }, 150);
  });

  editorEl.appendChild(textarea);
  noteEl.replaceWith(editorEl);
  textarea.focus();
  // Place cursor at end
  textarea.selectionStart = textarea.value.length;
}

// ============================================================================
// PRIVATE
// ============================================================================

async function saveNote(
  content: string,
  editorEl: HTMLElement,
  container: HTMLElement,
  nodeId: NodeId | null,
  onContextMenu: MessageContextMenuHandler,
  onEdit: NoteEditHandler
): Promise<void> {
  if (!content || !nodeId) {
    editorEl.remove();
    return;
  }

  const message: ChatMessage = await chatStore.addMessage(nodeId, 'user', content, 'note');

  // Replace editor with rendered note in the same position
  const noteEl = buildNoteElement(message, onContextMenu, onEdit);
  editorEl.replaceWith(noteEl);
  scrollToBottom(container);
}

async function updateNote(
  content: string,
  messageId: MessageId,
  editorEl: HTMLElement,
  nodeId: NodeId | null,
  onContextMenu: MessageContextMenuHandler,
  onEdit: NoteEditHandler,
  originalContent: string
): Promise<void> {
  if (!nodeId) { editorEl.remove(); return; }

  // Empty content — remove the note entirely
  if (!content) {
    await chatStore.deleteMessage(nodeId, messageId);
    editorEl.remove();
    return;
  }

  // No change — just restore display
  if (content === originalContent) {
    const conversation = await chatStore.getConversation(nodeId);
    const msg = conversation?.messages.find(m => m.id === messageId);
    if (msg) {
      const noteEl = buildNoteElement(msg, onContextMenu, onEdit);
      editorEl.replaceWith(noteEl);
    }
    return;
  }

  // Save updated content
  await chatStore.updateMessage(nodeId, messageId, content);
  const conversation = await chatStore.getConversation(nodeId);
  const msg = conversation?.messages.find(m => m.id === messageId);
  if (msg) {
    const noteEl = buildNoteElement(msg, onContextMenu, onEdit);
    editorEl.replaceWith(noteEl);
  }
}
