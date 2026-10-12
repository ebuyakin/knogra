/**
 * Chat Note Editor
 * Creates and manages inline note editing within the chat timeline.
 * The Image panel inside the editor is `note-attachment-zone.ts`; generating a
 * picture for a saved note is `note-image-generation.ts`.
 */

import type { NodeId } from '../../../core/main-types';
import type { ChatMessage, MessageId, ChatImageAttachment } from '../../../core/chat-types';
import { chatStore } from '../../../storage/chat-store';
import { chatSession } from '../../../ai/chat-session';
import { buildNoteElement, scrollToBottom } from './chat-message-renderer';
import type { MessageContextMenuHandler, NoteEditHandler } from './chat-message-renderer';
import { createAttachmentZone } from './note-attachment-zone';
import { generateImageIntoNote } from './note-image-generation';

/** A note as it stands after a save: the record and the element now showing it. */
interface SavedNote {
  message: ChatMessage;
  noteEl: HTMLElement;
}

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
  afterEl?: HTMLElement | null,
  defaultQuery: string = ''
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
      void saveNote(textarea.value.trim(), editorEl, container, nodeId, onContextMenu, onEdit, zone.getAttachments());
    }
    if (e.key === 'Escape') {
      editorEl.remove();
    }
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => {
      if (zone.isBusy()) return;
      if (editorEl.isConnected) {
        const content = textarea.value.trim();
        const attachments = zone.getAttachments();
        if (content || attachments.length > 0) {
          void saveNote(content, editorEl, container, nodeId, onContextMenu, onEdit, attachments);
        } else {
          editorEl.remove();
        }
      }
    }, 150);
  });

  // Run: save now, with the prompt as the text when nothing else was typed,
  // and generate for the saved note.
  const onRun = async (text: string): Promise<void> => {
    const saved = await saveNote(textarea.value.trim() || text, editorEl, container, nodeId, onContextMenu, onEdit, zone.getAttachments());
    if (saved && nodeId) generateImageIntoNote({ nodeId, ...saved, onContextMenu, onEdit }, text);
  };

  editorEl.appendChild(textarea);
  const zone = createAttachmentZone(editorEl, [], textarea, defaultQuery, (text) => { void onRun(text); });

  // Insert after the target message, or at the end
  if (afterEl?.nextSibling) {
    container.insertBefore(editorEl, afterEl.nextSibling);
  } else {
    container.appendChild(editorEl);
  }

  fitHeightToContent(textarea);
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
  currentAttachments: ChatImageAttachment[],
  container: HTMLElement,
  nodeId: NodeId | null,
  onContextMenu: MessageContextMenuHandler,
  onEdit: NoteEditHandler,
  defaultQuery: string = ''
): void {
  // Don't edit if another editor is already open
  if (container.querySelector('.note-editor')) return;

  const editorEl = document.createElement('div');
  editorEl.className = 'message note note-editor';

  const textarea = document.createElement('textarea');
  textarea.className = 'note-input';
  textarea.value = currentContent;
  textarea.rows = 2;

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void updateNote(textarea.value.trim(), messageId, editorEl, nodeId, onContextMenu, onEdit, currentContent, zone.getAttachments());
    }
    if (e.key === 'Escape') {
      // Cancel — restore original note
      editorEl.replaceWith(noteEl);
    }
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => {
      if (zone.isBusy()) return;
      if (editorEl.isConnected) {
        void updateNote(textarea.value.trim(), messageId, editorEl, nodeId, onContextMenu, onEdit, currentContent, zone.getAttachments());
      }
    }, 150);
  });

  const onRun = async (text: string): Promise<void> => {
    const saved = await updateNote(textarea.value.trim() || text, messageId, editorEl, nodeId, onContextMenu, onEdit, currentContent, zone.getAttachments());
    if (saved && nodeId) generateImageIntoNote({ nodeId, ...saved, onContextMenu, onEdit }, text);
  };

  editorEl.appendChild(textarea);
  const zone = createAttachmentZone(editorEl, currentAttachments, textarea, defaultQuery, (text) => { void onRun(text); });
  noteEl.replaceWith(editorEl);
  fitHeightToContent(textarea);
  textarea.focus();
  // Place cursor at end
  textarea.selectionStart = textarea.value.length;
}

/**
 * Size the textarea to its text, now and as it is typed. `rows` counts
 * newlines, not wrapped lines, so a long note opened for editing came back
 * two rows tall. Needs the element in the DOM: scrollHeight is a layout value.
 */
function fitHeightToContent(textarea: HTMLTextAreaElement): void {
  const fit = (): void => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener('input', fit);
  fit();
}

// ============================================================================
// PRIVATE
// ============================================================================

/** Save a new note and show it in the editor's place. Null when there was nothing to save. */
async function saveNote(
  content: string,
  editorEl: HTMLElement,
  container: HTMLElement,
  nodeId: NodeId | null,
  onContextMenu: MessageContextMenuHandler,
  onEdit: NoteEditHandler,
  attachments: ChatImageAttachment[]
): Promise<SavedNote | null> {
  if ((!content && attachments.length === 0) || !nodeId) {
    editorEl.remove();
    return null;
  }

  const message: ChatMessage = await chatStore.addMessage(nodeId, 'user', content, 'note');
  if (attachments.length > 0) {
    await chatStore.setMessageAttachments(nodeId, message.id, attachments);
    message.attachments = attachments;
  }
  await chatSession.refreshMessages();

  // Replace editor with rendered note in the same position
  const noteEl = buildNoteElement(message, onContextMenu, onEdit);
  editorEl.replaceWith(noteEl);
  scrollToBottom(container);
  return { message, noteEl };
}

/** Persist an edited note and show it in the editor's place. Null when the note was emptied and removed. */
async function updateNote(
  content: string,
  messageId: MessageId,
  editorEl: HTMLElement,
  nodeId: NodeId | null,
  onContextMenu: MessageContextMenuHandler,
  onEdit: NoteEditHandler,
  originalContent: string,
  attachments: ChatImageAttachment[]
): Promise<SavedNote | null> {
  if (!nodeId) { editorEl.remove(); return null; }

  // Empty note (no text, no image) — remove entirely
  if (!content && attachments.length === 0) {
    await chatStore.deleteMessage(nodeId, messageId);
    await chatSession.refreshMessages();
    editorEl.remove();
    return null;
  }

  // Persist content (only if changed) and attachments, then re-render
  if (content !== originalContent) {
    await chatStore.updateMessage(nodeId, messageId, content);
  }
  await chatStore.setMessageAttachments(nodeId, messageId, attachments);
  await chatSession.refreshMessages();

  const conversation = await chatStore.getConversation(nodeId);
  const message = conversation?.messages.find(m => m.id === messageId);
  if (!message) return null;

  const noteEl = buildNoteElement(message, onContextMenu, onEdit);
  editorEl.replaceWith(noteEl);
  return { message, noteEl };
}
