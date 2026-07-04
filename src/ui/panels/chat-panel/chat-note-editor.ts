/**
 * Chat Note Editor
 * Creates and manages inline note editing within the chat timeline.
 */

import type { NodeId } from '../../../core/main-types';
import type { ChatMessage, MessageId, NoteImageAttachment, NoteImageMimeType } from '../../../core/chat-types';
import { chatStore } from '../../../storage/chat-store';
import { buildNoteElement, scrollToBottom } from './chat-message-renderer';
import type { MessageContextMenuHandler, NoteEditHandler } from './chat-message-renderer';

// ============================================================================
// IMAGE ATTACHMENTS
// ============================================================================

const MAX_NOTE_IMAGE_BYTES = 1 * 1024 * 1024;
const MAX_NOTE_IMAGE_DIMENSION = 4096;
const ALLOWED_NOTE_IMAGE_MIME_TYPES = new Set<NoteImageMimeType>(['image/png', 'image/jpeg', 'image/webp']);
const NOTE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** Read + validate a file into a NoteImageAttachment. Rejects with a user message on failure. */
function readImageAttachment(file: File): Promise<NoteImageAttachment> {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_NOTE_IMAGE_MIME_TYPES.has(file.type as NoteImageMimeType)) {
      reject(new Error('Only PNG, JPEG, and WebP images are allowed.'));
      return;
    }
    if (file.size > MAX_NOTE_IMAGE_BYTES) {
      reject(new Error('Images must be 1 MB or smaller.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image.'));
      img.onload = () => {
        if (img.width > MAX_NOTE_IMAGE_DIMENSION || img.height > MAX_NOTE_IMAGE_DIMENSION) {
          reject(new Error(`Images must be at most ${MAX_NOTE_IMAGE_DIMENSION}px on each side.`));
          return;
        }
        resolve({
          id: generateAttachmentId(),
          type: 'image',
          mimeType: file.type as NoteImageMimeType,
          name: file.name,
          dataUrl,
          width: img.width,
          height: img.height,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/** Controls a single-image attachment zone inside a note editor. */
interface AttachmentZone {
  getAttachments(): NoteImageAttachment[];
  /** True while the native file picker is open (blur-save must be suppressed). */
  isBusy(): boolean;
}

/**
 * Build the attachment toolbar + preview strip inside an editor element.
 * Enforces a single image per note (adding replaces the existing one).
 */
function createAttachmentZone(
  editorEl: HTMLElement,
  initial: NoteImageAttachment[],
  textarea: HTMLTextAreaElement
): AttachmentZone {
  let attachment: NoteImageAttachment | null = initial[0] ?? null;
  let picking = false;

  const zone = document.createElement('div');
  zone.className = 'note-attach-zone';

  const preview = document.createElement('div');
  preview.className = 'note-attach-preview';

  const toolbar = document.createElement('div');
  toolbar.className = 'note-attach-toolbar';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'note-attach-btn';
  addBtn.textContent = 'Add image';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = NOTE_IMAGE_ACCEPT;
  fileInput.style.display = 'none';

  const errorEl = document.createElement('div');
  errorEl.className = 'note-attach-error';

  const render = (): void => {
    preview.innerHTML = '';
    if (attachment) {
      const img = document.createElement('img');
      img.className = 'note-image';
      img.src = attachment.dataUrl;
      img.alt = attachment.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'note-attach-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove image';
      removeBtn.addEventListener('mousedown', (e) => e.preventDefault());
      removeBtn.addEventListener('click', () => {
        attachment = null;
        render();
      });

      const frame = document.createElement('div');
      frame.className = 'note-attach-frame';
      frame.append(img, removeBtn);
      preview.appendChild(frame);
    }
    addBtn.textContent = attachment ? 'Replace image' : 'Add image';
  };

  // Opening the native file dialog blurs the textarea. Guard against the
  // editor's blur-save timer closing the editor while the picker is open.
  const beginPick = (): void => {
    picking = true;
    const onWindowFocus = (): void => {
      window.removeEventListener('focus', onWindowFocus);
      // Let the `change` event fire first, then release the guard and
      // restore focus so Enter/blur save the note normally.
      setTimeout(() => {
        picking = false;
        if (editorEl.isConnected) textarea.focus();
      }, 100);
    };
    window.addEventListener('focus', onWindowFocus);
    fileInput.click();
  };

  addBtn.addEventListener('mousedown', (e) => e.preventDefault());
  addBtn.addEventListener('click', beginPick);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    errorEl.textContent = '';
    try {
      attachment = await readImageAttachment(file);
      render();
    } catch (err) {
      errorEl.textContent = (err as Error).message;
    }
  });

  toolbar.append(addBtn, errorEl);
  zone.append(preview, toolbar, fileInput);
  editorEl.appendChild(zone);
  render();

  return {
    getAttachments: () => (attachment ? [attachment] : []),
    isBusy: () => picking,
  };
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
      saveNote(textarea.value.trim(), editorEl, container, nodeId, onContextMenu, onEdit, zone.getAttachments());
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
          saveNote(content, editorEl, container, nodeId, onContextMenu, onEdit, attachments);
        } else {
          editorEl.remove();
        }
      }
    }, 150);
  });

  editorEl.appendChild(textarea);
  const zone = createAttachmentZone(editorEl, [], textarea);

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
  currentAttachments: NoteImageAttachment[],
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
      updateNote(textarea.value.trim(), messageId, editorEl, nodeId, onContextMenu, onEdit, currentContent, zone.getAttachments());
    }
    if (e.key === 'Escape') {
      // Cancel — restore original note
      editorEl.replaceWith(noteEl);
    }
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => {      if (zone.isBusy()) return;      if (editorEl.isConnected) {
        updateNote(textarea.value.trim(), messageId, editorEl, nodeId, onContextMenu, onEdit, currentContent, zone.getAttachments());
      }
    }, 150);
  });

  editorEl.appendChild(textarea);
  const zone = createAttachmentZone(editorEl, currentAttachments);
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
  onEdit: NoteEditHandler,
  attachments: NoteImageAttachment[]
): Promise<void> {
  if ((!content && attachments.length === 0) || !nodeId) {
    editorEl.remove();
    return;
  }

  const message: ChatMessage = await chatStore.addMessage(nodeId, 'user', content, 'note');
  if (attachments.length > 0) {
    await chatStore.setMessageAttachments(nodeId, message.id, attachments);
    message.attachments = attachments;
  }

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
  originalContent: string,
  attachments: NoteImageAttachment[]
): Promise<void> {
  if (!nodeId) { editorEl.remove(); return; }

  // Empty note (no text, no image) — remove entirely
  if (!content && attachments.length === 0) {
    await chatStore.deleteMessage(nodeId, messageId);
    editorEl.remove();
    return;
  }

  // Persist content (only if changed) and attachments, then re-render
  if (content !== originalContent) {
    await chatStore.updateMessage(nodeId, messageId, content);
  }
  await chatStore.setMessageAttachments(nodeId, messageId, attachments);

  const conversation = await chatStore.getConversation(nodeId);
  const msg = conversation?.messages.find(m => m.id === messageId);
  if (msg) {
    const noteEl = buildNoteElement(msg, onContextMenu, onEdit);
    editorEl.replaceWith(noteEl);
  }
}
