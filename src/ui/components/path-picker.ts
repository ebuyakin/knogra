/**
 * Path Picker / Editor Modals + Context Menu
 *
 * PathContextMenu - small right-click menu over the path panel
 * PathPicker      - click a saved path to act on it (load or edit)
 * PathEditor      - rename, reorder scenes, remove scenes, or delete a saved path
 *
 * All overlays cover only the cytoscape area (#cy), not the full viewport.
 */

import type { Path, PathId, SceneId } from '../../core/main-types';
import { pathStore } from '../../storage/path-store';
import { graphStore } from '../../storage/graph-store';
import '../../styles/path-picker.css';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Display label for a scene (central node title). */
function sceneLabel(sceneId: SceneId): string {
  const scene = graphStore.scenes.find(s => s.id === sceneId);
  if (!scene) return 'Unknown scene';
  const node = graphStore.nodes.find(n => n.id === scene.centralNodeId);
  return node?.title || scene.title || 'Unknown';
}

/**
 * Build an overlay anchored to #cy so it doesn't cover the chat panel.
 * Falls back to viewport if #cy is missing.
 */
function buildOverlay(title: string): { overlay: HTMLDivElement; modal: HTMLDivElement; body: HTMLDivElement; footer: HTMLDivElement } {
  const overlay = document.createElement('div');
  overlay.className = 'path-picker-overlay';

  const cy = document.getElementById('cy');
  if (cy) {
    const rect = cy.getBoundingClientRect();
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  const modal = document.createElement('div');
  modal.className = 'path-picker-modal';

  const header = document.createElement('div');
  header.className = 'path-picker-header';
  header.innerHTML = `<h2>${escapeHtml(title)}</h2>`;

  const body = document.createElement('div');
  body.className = 'path-picker-body';

  const footer = document.createElement('div');
  footer.className = 'path-picker-footer';

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);

  return { overlay, modal, body, footer };
}

function renderEmpty(host: HTMLDivElement, message: string): void {
  host.innerHTML = `<p class="path-picker-empty">${escapeHtml(message)}</p>`;
}

// ---------------------------------------------------------------------------
// PathContextMenu
// ---------------------------------------------------------------------------

interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export class PathContextMenu {
  #menu: HTMLDivElement | null = null;

  open(x: number, y: number, items: ContextMenuItem[]): void {
    this.close();

    const menu = document.createElement('div');
    menu.className = 'path-ctx-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    for (const it of items) {
      const el = document.createElement('div');
      el.className = 'path-ctx-menu-item';
      if (it.disabled) el.classList.add('disabled');
      el.textContent = it.label;
      if (!it.disabled) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.close();
          it.onClick();
        });
      }
      menu.appendChild(el);
    }

    document.body.appendChild(menu);
    this.#menu = menu;

    // Adjust if overflows viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`;
    }

    // Dismiss on outside click / Escape (defer click handler so the
    // current contextmenu event doesn't immediately close us).
    setTimeout(() => {
      document.addEventListener('click', this.#dismiss, { once: true });
      document.addEventListener('keydown', this.#handleKeydown);
    }, 0);
  }

  close(): void {
    this.#menu?.remove();
    this.#menu = null;
    document.removeEventListener('keydown', this.#handleKeydown);
  }

  #dismiss = (): void => this.close();
  #handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };
}

// ---------------------------------------------------------------------------
// PathPicker - pick a saved path; caller decides what to do with it
// ---------------------------------------------------------------------------

type PickHandler = (path: Path) => void;

export class PathPicker {
  #overlay: HTMLDivElement | null = null;
  #onPick: PickHandler | null = null;

  open(title: string, onPick: PickHandler): void {
    if (this.#overlay) return;
    this.#onPick = onPick;

    const { overlay, body } = buildOverlay(title);
    this.#overlay = overlay;

    const paths = pathStore.getAllPaths();
    if (paths.length === 0) {
      renderEmpty(body, 'No saved paths');
    } else {
      for (const p of paths) {
        const item = document.createElement('div');
        item.className = 'path-picker-item';
        item.innerHTML = `
          <span class="path-picker-item-title">${escapeHtml(p.name)}</span>
          <span class="path-picker-item-meta">${p.scenes.length} scenes</span>
        `;
        item.addEventListener('click', () => {
          const cb = this.#onPick;
          this.close();
          cb?.(p);
        });
        body.appendChild(item);
      }
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    document.body.appendChild(overlay);
    document.addEventListener('keydown', this.#handleKeydown);
  }

  close(): void {
    this.#overlay?.remove();
    this.#overlay = null;
    this.#onPick = null;
    document.removeEventListener('keydown', this.#handleKeydown);
  }

  #handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  };
}

// ---------------------------------------------------------------------------
// PathEditor - rename, reorder, remove scenes, or delete the path
// ---------------------------------------------------------------------------

export class PathEditor {
  #overlay: HTMLDivElement | null = null;
  #body: HTMLDivElement | null = null;
  #nameInput: HTMLInputElement | null = null;
  #pathId: PathId | null = null;
  #scenes: SceneId[] = [];
  #originalName: string = '';
  #onSave: ((updated: Path) => void) | null = null;
  #onDelete: (() => void) | null = null;

  open(path: Path, callbacks?: { onSave?: (updated: Path) => void; onDelete?: () => void }): void {
    if (this.#overlay) return;
    this.#pathId = path.id as PathId;
    this.#scenes = [...path.scenes];
    this.#originalName = path.name;
    this.#onSave = callbacks?.onSave ?? null;
    this.#onDelete = callbacks?.onDelete ?? null;

    const { overlay, modal, body, footer } = buildOverlay('Edit Path');
    this.#overlay = overlay;
    this.#body = body;
    modal.classList.add('path-editor-modal');

    // Name row
    const nameRow = document.createElement('div');
    nameRow.className = 'path-editor-name-row';
    nameRow.innerHTML = `<label>Name</label>`;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = path.name;
    input.className = 'path-editor-name-input';
    nameRow.appendChild(input);
    this.#nameInput = input;
    body.appendChild(nameRow);

    // Scenes section
    const scenesHeader = document.createElement('div');
    scenesHeader.className = 'path-editor-section-header';
    scenesHeader.textContent = 'Scenes';
    body.appendChild(scenesHeader);

    const list = document.createElement('div');
    list.className = 'path-editor-scenes';
    body.appendChild(list);
    this.#renderScenes(list);

    // Footer: Delete on left, Save/Cancel on right
    footer.innerHTML = `
      <button class="path-editor-btn path-editor-btn-danger" data-action="delete">Delete path</button>
      <div class="path-editor-footer-right">
        <button class="path-editor-btn" data-action="cancel">Cancel</button>
        <button class="path-editor-btn path-editor-btn-primary" data-action="save">Save</button>
      </div>
    `;
    footer.querySelector('[data-action="delete"]')?.addEventListener('click', () => this.#deletePath());
    footer.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.close());
    footer.querySelector('[data-action="save"]')?.addEventListener('click', () => this.#save());

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    document.body.appendChild(overlay);
    document.addEventListener('keydown', this.#handleKeydown);
  }

  close(): void {
    this.#overlay?.remove();
    this.#overlay = null;
    this.#body = null;
    this.#nameInput = null;
    this.#pathId = null;
    this.#scenes = [];
    this.#onSave = null;
    this.#onDelete = null;
    document.removeEventListener('keydown', this.#handleKeydown);
  }

  #renderScenes(list: HTMLDivElement): void {
    list.innerHTML = '';
    if (this.#scenes.length === 0) {
      renderEmpty(list, 'No scenes in this path');
      return;
    }

    this.#scenes.forEach((sceneId, idx) => {
      const row = document.createElement('div');
      row.className = 'path-editor-scene-row';
      const label = sceneLabel(sceneId);
      row.innerHTML = `
        <span class="path-editor-scene-num">${idx + 1}</span>
        <span class="path-editor-scene-title" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
        <div class="path-editor-scene-actions">
          <button class="path-editor-iconbtn" data-action="up"    title="Move up"   ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="path-editor-iconbtn" data-action="down"  title="Move down" ${idx === this.#scenes.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="path-editor-iconbtn path-editor-iconbtn-danger" data-action="remove" title="Remove from path">✕</button>
        </div>
      `;
      row.querySelector('[data-action="up"]')?.addEventListener('click', () => this.#move(idx, idx - 1));
      row.querySelector('[data-action="down"]')?.addEventListener('click', () => this.#move(idx, idx + 1));
      row.querySelector('[data-action="remove"]')?.addEventListener('click', () => this.#remove(idx));
      list.appendChild(row);
    });
  }

  #move(from: number, to: number): void {
    if (to < 0 || to >= this.#scenes.length) return;
    const [moved] = this.#scenes.splice(from, 1);
    this.#scenes.splice(to, 0, moved);
    this.#rerender();
  }

  #remove(idx: number): void {
    this.#scenes.splice(idx, 1);
    this.#rerender();
  }

  #rerender(): void {
    if (!this.#body) return;
    const list = this.#body.querySelector('.path-editor-scenes') as HTMLDivElement | null;
    if (list) this.#renderScenes(list);
  }

  async #save(): Promise<void> {
    if (!this.#pathId) return;
    const existing = pathStore.getPath(this.#pathId);
    if (!existing) return;

    const newName = (this.#nameInput?.value ?? this.#originalName).trim() || this.#originalName;
    const updated: Path = { ...existing, name: newName, scenes: this.#scenes };
    await pathStore.updatePath(updated);
    // Re-fetch so the caller sees the updatedAt timestamp set by the store.
    const saved = pathStore.getPath(this.#pathId) ?? updated;
    const cb = this.#onSave;
    this.close();
    cb?.(saved);
  }

  async #deletePath(): Promise<void> {
    if (!this.#pathId) return;
    const name = this.#nameInput?.value || this.#originalName;
    if (!confirm(`Delete path "${name}"?`)) return;
    await pathStore.deletePath(this.#pathId);
    const cb = this.#onDelete;
    this.close();
    cb?.();
  }

  #handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  };
}
