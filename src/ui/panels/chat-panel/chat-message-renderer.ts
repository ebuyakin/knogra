/**
 * Chat Message Renderer
 * Renders messages, notes, errors, and hints into the chat timeline.
 * Handles markdown conversion and MathJax typesetting.
 */

import type { ChatMessage, MessageId, MessageSource } from '../../../core/chat-types';

/** Callback for context menu on a message */
export type MessageContextMenuHandler = (event: MouseEvent, messageId: MessageId, source: MessageSource | undefined) => void;

/** Callback for editing a note (double-click) */
export type NoteEditHandler = (noteEl: HTMLElement, messageId: MessageId, content: string) => void;

// ============================================================================
// PUBLIC API
// ============================================================================

/** Render an AI or legacy message (user or assistant) */
export function renderAIMessage(
  message: ChatMessage,
  container: HTMLElement,
  onContextMenu: MessageContextMenuHandler
): void {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${message.role}`;
  messageEl.dataset.messageId = message.id;

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';

  if (message.role === 'assistant') {
    contentEl.innerHTML = renderMarkdown(message.content);
  } else {
    contentEl.textContent = message.content;
  }

  messageEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    onContextMenu(e, message.id, message.source);
  });

  messageEl.appendChild(contentEl);
  container.appendChild(messageEl);

  if (message.role === 'assistant') {
    typesetMath(contentEl);
  }
}

/** Build a note DOM element (display mode) */
export function buildNoteElement(
  message: ChatMessage,
  onContextMenu: MessageContextMenuHandler,
  onEdit?: NoteEditHandler
): HTMLElement {
  const messageEl = document.createElement('div');
  messageEl.className = 'message note';
  messageEl.dataset.messageId = message.id;

  const timestamp = new Date(message.timestamp);
  const dateStr = timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const headerEl = document.createElement('div');
  headerEl.className = 'note-header';
  headerEl.textContent = `${dateStr}, ${timeStr}`;

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content note-content';
  contentEl.textContent = message.content;

  messageEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    onContextMenu(e, message.id, message.source);
  });

  if (onEdit) {
    messageEl.addEventListener('dblclick', () => {
      onEdit(messageEl, message.id, message.content);
    });
    messageEl.style.cursor = 'default';
  }

  messageEl.appendChild(headerEl);
  messageEl.appendChild(contentEl);
  return messageEl;
}

/** Render a note and append it to the container */
export function renderNote(
  message: ChatMessage,
  container: HTMLElement,
  onContextMenu: MessageContextMenuHandler,
  onEdit?: NoteEditHandler
): void {
  const noteEl = buildNoteElement(message, onContextMenu, onEdit);
  container.appendChild(noteEl);
}

/** Render an error message (red, for runtime failures) */
export function renderError(errorMessage: string, container: HTMLElement): void {
  const messageEl = document.createElement('div');
  messageEl.className = 'message error';

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  contentEl.style.color = '#f85149';
  contentEl.textContent = errorMessage;

  messageEl.appendChild(contentEl);
  container.appendChild(messageEl);
}

/** Render a hint message (gray italic, for guidance) */
export function renderHint(hintMessage: string, container: HTMLElement): void {
  const messageEl = document.createElement('div');
  messageEl.className = 'message hint';

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  contentEl.textContent = hintMessage;

  messageEl.appendChild(contentEl);
  container.appendChild(messageEl);
}

/** Scroll the container to the bottom */
export function scrollToBottom(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

// ============================================================================
// MARKDOWN
// ============================================================================

/** Convert markdown text to HTML */
export function renderMarkdown(text: string): string {
  let html = text;

  // Escape HTML (but preserve our markdown processing)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // Tables (must be before other processing to preserve pipe characters)
  html = renderTables(html);

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers (## ...)
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Bold (**...**) - must come before italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic (*...*) - non-greedy, avoid matching inside words
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Unordered lists (- ... or * ...)
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists (1. ...)
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Paragraphs (double newlines)
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;

  // Single newlines to <br> (but not inside pre/code/table)
  html = html.replace(/([^>\n])\n([^<])/g, '$1<br>$2');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

/** Render markdown tables to HTML */
function renderTables(text: string): string {
  const tableRegex = /^(\|.+\|)\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)+)/gm;

  return text.replace(tableRegex, (_, headerRow, separatorRow, bodyRows) => {
    const alignments = separatorRow.split('|').slice(1, -1).map((cell: string) => {
      const trimmed = cell.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
      if (trimmed.endsWith(':')) return 'right';
      return 'left';
    });

    const headers = headerRow.split('|').slice(1, -1);
    const headerHtml = headers.map((cell: string, i: number) =>
      `<th style="text-align:${alignments[i] || 'left'}">${cell.trim()}</th>`
    ).join('');

    const rows = bodyRows.trim().split('\n');
    const bodyHtml = rows.map((row: string) => {
      const cells = row.split('|').slice(1, -1);
      const cellsHtml = cells.map((cell: string, i: number) =>
        `<td style="text-align:${alignments[i] || 'left'}">${cell.trim()}</td>`
      ).join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');

    return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  });
}

/** Typeset MathJax equations in an element */
export function typesetMath(element: HTMLElement): void {
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([element]).catch((err: Error) => {
      console.warn('[ChatPanel] MathJax typeset error:', err);
    });
  }
}
