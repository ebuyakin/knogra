/**
 * Note image generation
 *
 * Run, after the note is saved: a status line under the note while the image
 * model works, then the picture written onto the saved note and the note
 * re-rendered. When the note already has an image, the text is an instruction
 * and that image is the starting point; the result takes its place. The editor
 * is already closed when this starts, so the user is not left with something
 * that looks like it still needs finishing (docs/ai/chat-image-generation.md §2).
 *
 * Writes through chatStore like the editor does, which is the named debt of
 * architecture.md §3.8, neither widened nor fixed here.
 */

import type { NodeId } from '../../../core/main-types';
import type { ChatImageAttachment, ChatMessage } from '../../../core/chat-types';
import { chatStore } from '../../../storage/chat-store';
import { chatSession } from '../../../ai/chat-session';
import { generateNoteImage } from '../../../ai/image-generation/image-generation';
import { getSetting } from '../../../config';
import { buildNoteElement } from './chat-message-renderer';
import type { MessageContextMenuHandler, NoteEditHandler } from './chat-message-renderer';

/**
 * The height a note image may take on screen, as a fraction of the window.
 * Must agree with `.note-image { max-height }` in chat-panel.css: the frame
 * handed to generation is the box the picture will be displayed in.
 */
const NOTE_IMAGE_MAX_HEIGHT_FRACTION = 0.7;

export interface NoteImageTarget {
  nodeId: NodeId;
  /** The saved note the picture belongs to. */
  message: ChatMessage;
  /** Its rendered element, replaced once the picture is in. */
  noteEl: HTMLElement;
  onContextMenu: MessageContextMenuHandler;
  onEdit: NoteEditHandler;
}

/**
 * Draw `text` for a saved note, or change the note's image as `text` says when
 * it has one. Returns at once; the status line reports progress and failure.
 */
export function generateImageIntoNote(target: NoteImageTarget, text: string): void {
  const source = target.message.attachments?.[0];
  const status = document.createElement('div');
  status.className = 'note-image-status';
  status.textContent = source ? 'Changing image…' : 'Generating image…';
  // Under the note's text and above its image, where the editor's controls
  // were: what is happening sits between the words and the picture they act on.
  const attachments = target.noteEl.querySelector('.note-attachments');
  if (attachments) {
    target.noteEl.insertBefore(status, attachments);
  } else {
    target.noteEl.appendChild(status);
  }
  status.scrollIntoView({ block: 'nearest' });

  void run(target, text, source, status);
}

async function run(
  target: NoteImageTarget,
  text: string,
  source: ChatImageAttachment | undefined,
  status: HTMLElement
): Promise<void> {
  const { nodeId, message } = target;
  try {
    const attachment = await generateNoteImage(text, measureFrame(target.noteEl), source);

    if (getSetting('ai.imageClearPrompt')) {
      await chatStore.updateMessage(nodeId, message.id, '');
    }
    await chatStore.setMessageAttachments(nodeId, message.id, [attachment]);
    await chatSession.refreshMessages();

    const conversation = await chatStore.getConversation(nodeId);
    const saved = conversation?.messages.find(m => m.id === message.id);
    status.remove();
    if (saved && target.noteEl.isConnected) {
      const noteEl = buildNoteElement(saved, target.onContextMenu, target.onEdit);
      target.noteEl.replaceWith(noteEl);
      revealWhenLoaded(noteEl);
    }
  } catch (err) {
    status.textContent = `Image generation failed: ${(err as Error).message} (click to dismiss)`;
    status.classList.add('note-image-status--error');
    status.addEventListener('click', () => status.remove());
  }
}

/**
 * Scroll the timeline so the note's bottom edge meets the panel's, once the
 * image has its size. Not "to the end": the note may sit mid-conversation. The
 * element's height is unknown until the image decodes, so the scroll waits for
 * its load event.
 */
function revealWhenLoaded(noteEl: HTMLElement): void {
  const reveal = (): void => noteEl.scrollIntoView({ block: 'end', behavior: 'smooth' });
  const image = noteEl.querySelector<HTMLImageElement>('img.note-image');
  if (!image || image.complete) {
    reveal();
    return;
  }
  image.addEventListener('load', reveal, { once: true });
}

/**
 * The box the picture will be shown in: the note's width (the editor's, when
 * drafting), and the height the display rule allows. Measured at the moment of
 * use, so the 'panel' shape follows the panel as it is now.
 */
export function measureFrame(noteEl: HTMLElement): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(noteEl.clientWidth)),
    height: Math.max(1, Math.round(window.innerHeight * NOTE_IMAGE_MAX_HEIGHT_FRACTION))
  };
}
