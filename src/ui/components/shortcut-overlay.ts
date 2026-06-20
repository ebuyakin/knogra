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
    this.#setupDrag(header, dialog);

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

    // Center on the Cytoscape viewport.
    const cy = document.getElementById('cy');
    const cyRect = cy?.getBoundingClientRect();
    const dlgRect = dialog.getBoundingClientRect();
    dialog.style.position = 'fixed';
    dialog.style.left = `${Math.max(20, ((cyRect?.left ?? 0) + (cyRect?.width ?? window.innerWidth) / 2) - dlgRect.width / 2)}px`;
    dialog.style.top = `${Math.max(20, ((cyRect?.top ?? 0) + (cyRect?.height ?? window.innerHeight) / 2) - dlgRect.height / 2)}px`;
  }

  #setupDrag(handle: HTMLElement, dialog: HTMLElement): void {
    handle.addEventListener('mousedown', (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('button')) return;

      const rect = dialog.getBoundingClientRect();
      const dragOffsetX = event.clientX - rect.left;
      const dragOffsetY = event.clientY - rect.top;
      document.body.style.cursor = 'move';

      const onMouseMove = (moveEvent: MouseEvent): void => {
        dialog.style.left = `${moveEvent.clientX - dragOffsetX}px`;
        dialog.style.top = `${moveEvent.clientY - dragOffsetY}px`;
      };

      const onMouseUp = (): void => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      event.preventDefault();
    });
  }

  hide(): void {
    if (this.#overlay) {
      this.#overlay.remove();
      this.#overlay = null;
    }
  }
}
