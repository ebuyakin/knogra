/**
 * ShortcutOverlay — F1 help dialog showing all keyboard shortcuts.
 * Reads from SHORTCUT_CATEGORIES (single source of truth).
 */

import { SHORTCUT_CATEGORIES } from '../../config/shortcut-definitions';
import '../../styles/shortcut-overlay.css';

export class ShortcutOverlay {
  #overlay: HTMLDivElement | null = null;

  toggle(): void {
    if (this.#overlay) {
      this.hide();
    } else {
      this.show();
    }
  }

  isOpen(): boolean {
    return this.#overlay !== null;
  }

  show(): void {
    if (this.#overlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'shortcut-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.hide(); });

    const dialog = document.createElement('div');
    dialog.className = 'shortcut-dialog';

    // Header
    const header = document.createElement('div');
    header.className = 'shortcut-header';
    header.innerHTML = '<span class="shortcut-title">Keyboard Shortcuts</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'shortcut-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    // Hint
    const hint = document.createElement('div');
    hint.className = 'shortcut-hint';
    hint.textContent = 'Most commands are also available via right-click context menu.';
    dialog.appendChild(hint);

    // Content — two explicit columns so sections stack without grid-row gaps
    const content = document.createElement('div');
    content.className = 'shortcut-content';

    const leftCol = document.createElement('div');
    leftCol.className = 'shortcut-col';
    const rightCol = document.createElement('div');
    rightCol.className = 'shortcut-col';

    SHORTCUT_CATEGORIES.forEach((category, i) => {
      const col = i % 2 === 0 ? leftCol : rightCol;
      const section = document.createElement('div');
      section.className = 'shortcut-section';

      const heading = document.createElement('div');
      heading.className = 'shortcut-section-title';
      heading.textContent = category.title;
      section.appendChild(heading);

      for (const shortcut of category.shortcuts) {
        const row = document.createElement('div');
        row.className = 'shortcut-row';

        const key = document.createElement('span');
        key.className = 'shortcut-key';
        key.textContent = shortcut.key;

        const desc = document.createElement('span');
        desc.className = 'shortcut-desc';
        desc.textContent = shortcut.description;

        row.append(key, desc);
        section.appendChild(row);
      }

      col.appendChild(section);
    });

    content.appendChild(leftCol);
    content.appendChild(rightCol);

    dialog.appendChild(content);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    this.#overlay = overlay;

    // Center on Cytoscape viewport (left of chat panel)
    const chatPanel = document.getElementById('chat');
    const chatWidth = chatPanel?.offsetWidth || 350;
    const leftAreaWidth = window.innerWidth - chatWidth;
    const dlgRect = dialog.getBoundingClientRect();
    dialog.style.position = 'fixed';
    dialog.style.left = `${Math.max(20, (leftAreaWidth - dlgRect.width) / 2)}px`;
    dialog.style.top = `${Math.max(20, (window.innerHeight - dlgRect.height) / 2)}px`;
  }

  hide(): void {
    if (this.#overlay) {
      this.#overlay.remove();
      this.#overlay = null;
    }
  }
}
