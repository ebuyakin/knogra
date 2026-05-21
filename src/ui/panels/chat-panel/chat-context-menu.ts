/**
 * Chat Context Menu
 * Builds and displays context menus for the chat panel.
 * Handles message-level and panel-level menus.
 */

import type { MessageId, MessageSource } from '../../../core/chat-types';
import { chatSession } from '../../../ai/chat-session';

// ============================================================================
// TYPES
// ============================================================================

export interface ContextMenuActions {
  onDelete: (messageId: MessageId) => void;
  onAddNote: (afterEl: HTMLElement | null) => void;
  onEditNote: (messageEl: HTMLElement, messageId: MessageId) => void;
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

const MENU_STYLE = `
  position: fixed;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 4px 0;
  z-index: 1000;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
`;

const BTN_STYLE = `
  display: block;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  color: #c9d1d9;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
`;

function createMenu(x: number, y: number): HTMLElement {
  const existingMenu = document.querySelector('.chat-context-menu');
  existingMenu?.remove();

  const menu = document.createElement('div');
  menu.className = 'chat-context-menu';
  menu.style.cssText = `${MENU_STYLE} left: ${x}px; top: ${y}px;`;
  return menu;
}

function createMenuButton(label: string, color?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = color
    ? BTN_STYLE.replace('color: #c9d1d9', `color: ${color}`)
    : BTN_STYLE;
  btn.onmouseover = () => btn.style.background = '#30363d';
  btn.onmouseout = () => btn.style.background = 'none';
  return btn;
}

function mountMenu(menu: HTMLElement): void {
  document.body.appendChild(menu);

  const closeMenu = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

// ============================================================================
// BLOCK HELPERS
// ============================================================================

const BLOCK_TAGS = new Set([
  'P', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'MJX-CONTAINER'
]);

/** Find the nearest block-level element at the click point */
function getBlockAtPoint(event: MouseEvent): HTMLElement | null {
  const target = event.target as HTMLElement;
  if (!target) return null;

  let el: HTMLElement | null = target;
  while (el && !el.classList.contains('message-content')) {
    if (BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
}

/** Extract visible text from an element */
function extractBlockText(element: HTMLElement): string {
  return (element.textContent ?? '').trim();
}

/** Copy text to clipboard with fallback */
function copyToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => copyFallback(text));
  } else {
    copyFallback(text);
  }
}

function copyFallback(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Show context menu for a message, varying items by source */
export function showMessageContextMenu(
  event: MouseEvent,
  messageId: MessageId,
  source: MessageSource | undefined,
  actions: ContextMenuActions
): void {
  const clickedMessageEl = (event.target as HTMLElement).closest('.message') as HTMLElement | null;
  const menu = createMenu(event.clientX, event.clientY);
  const isNote = source === 'note';
  const isTutorial = source === 'tutorial';

  // Copy Block (AI and tutorial only)
  if (!isNote) {
    const block = getBlockAtPoint(event);
    if (block) {
      const copyBlockBtn = createMenuButton('Copy block');
      copyBlockBtn.onclick = () => {
        copyToClipboard(extractBlockText(block));
        menu.remove();
      };
      menu.appendChild(copyBlockBtn);
    }
  }

  // Copy
  const copyLabel = isNote ? 'Copy note' : 'Copy message';
  const copyMsgBtn = createMenuButton(copyLabel);
  copyMsgBtn.onclick = () => {
    const msg = chatSession.getMessages().find(m => m.id === messageId);
    if (msg) copyToClipboard(msg.content);
    menu.remove();
  };
  menu.appendChild(copyMsgBtn);

  // Edit note (notes only)
  if (isNote && clickedMessageEl) {
    const editBtn = createMenuButton('Edit note');
    editBtn.onclick = () => {
      menu.remove();
      actions.onEditNote(clickedMessageEl, messageId);
    };
    menu.appendChild(editBtn);
  }

  // Delete (notes and AI, not tutorial)
  if (!isTutorial) {
    const deleteLabel = isNote ? 'Delete note' : 'Delete message';
    const deleteBtn = createMenuButton(deleteLabel, '#f85149');
    deleteBtn.onclick = () => {
      actions.onDelete(messageId);
      menu.remove();
    };
    menu.appendChild(deleteBtn);
  }

  // Add Note (always)
  const noteBtn = createMenuButton('Add note');
  noteBtn.onclick = () => {
    menu.remove();
    actions.onAddNote(clickedMessageEl);
  };
  menu.appendChild(noteBtn);

  mountMenu(menu);
}

/** Show context menu for the panel background: Add Note */
export function showPanelContextMenu(
  event: MouseEvent,
  actions: ContextMenuActions
): void {
  const menu = createMenu(event.clientX, event.clientY);

  const noteBtn = createMenuButton('Add note');
  noteBtn.onclick = () => {
    menu.remove();
    actions.onAddNote(null);
  };
  menu.appendChild(noteBtn);

  mountMenu(menu);
}
