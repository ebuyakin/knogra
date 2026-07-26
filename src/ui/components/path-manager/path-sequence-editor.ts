/**
 * Path Sequence Editor
 *
 * Modal for reworking one saved path: rename it, reorder or drop scenes, or
 * delete it outright. This is the *only* way a saved path changes — walking a
 * path never mutates it (paths-architecture §14.2), so editing is deliberate.
 *
 * Ported from `path-picker.ts`. The one behavioural change is persistence: writes
 * go through the Path feature rather than straight to `pathStore`, which retires
 * the direct-store-write debt flagged in architecture §3.8.
 */

import type { Path, PathId, SceneId } from '../../../core/main-types';
import type { FeatureAPI } from '../../../features/feature-api';
import { attachDismiss, buildOverlay, escapeHtml, renderEmpty, sceneLabel } from './path-modal-shell';

export interface PathSequenceEditorCallbacks {
  /** Path was saved; receives the persisted record. */
  onSave?: (updated: Path) => void;
  /** Path was deleted. */
  onDelete?: () => void;
}

export class PathSequenceEditor {
  #features: FeatureAPI;
  #overlay: HTMLDivElement | null = null;
  #body: HTMLDivElement | null = null;
  #nameInput: HTMLInputElement | null = null;
  #pathId: PathId | null = null;
  #scenes: SceneId[] = [];
  #originalName: string = '';
  #detachDismiss: (() => void) | null = null;
  #callbacks: PathSequenceEditorCallbacks = {};

  constructor(features: FeatureAPI) {
    this.#features = features;
  }

  open(path: Path, callbacks?: PathSequenceEditorCallbacks): void {
    if (this.#overlay) return;

    this.#pathId = path.id as PathId;
    // Work on a copy: edits must be discardable until Save.
    this.#scenes = [...path.scenes];
    this.#originalName = path.name;
    this.#callbacks = callbacks ?? {};

    const { overlay, modal, body, footer } = buildOverlay('Edit Path');
    this.#overlay = overlay;
    this.#body = body;
    modal.classList.add('path-editor-modal');

    this.#renderNameRow(body, path.name);

    const scenesHeader = document.createElement('div');
    scenesHeader.className = 'path-editor-section-header';
    scenesHeader.textContent = 'Scenes';
    body.appendChild(scenesHeader);

    const list = document.createElement('div');
    list.className = 'path-editor-scenes';
    body.appendChild(list);
    this.#renderScenes(list);

    this.#renderFooter(footer);

    this.#detachDismiss = attachDismiss(overlay, () => this.close());
    document.body.appendChild(overlay);
  }

  close(): void {
    this.#detachDismiss?.();
    this.#detachDismiss = null;
    this.#overlay?.remove();
    this.#overlay = null;
    this.#body = null;
    this.#nameInput = null;
    this.#pathId = null;
    this.#scenes = [];
    this.#callbacks = {};
  }

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  #renderNameRow(body: HTMLDivElement, name: string): void {
    const row = document.createElement('div');
    row.className = 'path-editor-name-row';
    row.innerHTML = `<label>Name</label>`;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = name;
    input.className = 'path-editor-name-input';
    row.appendChild(input);

    this.#nameInput = input;
    body.appendChild(row);
  }

  #renderScenes(list: HTMLDivElement): void {
    list.innerHTML = '';
    if (this.#scenes.length === 0) {
      renderEmpty(list, 'No scenes in this path');
      return;
    }

    this.#scenes.forEach((sceneId, index) => {
      const row = document.createElement('div');
      row.className = 'path-editor-scene-row';
      const label = sceneLabel(sceneId);
      row.innerHTML = `
        <span class="path-editor-scene-num">${index + 1}</span>
        <span class="path-editor-scene-title" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
        <div class="path-editor-scene-actions">
          <button class="path-editor-iconbtn" data-action="up" title="Move up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="path-editor-iconbtn" data-action="down" title="Move down" ${index === this.#scenes.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="path-editor-iconbtn path-editor-iconbtn-danger" data-action="remove" title="Remove from path">✕</button>
        </div>
      `;
      row.querySelector('[data-action="up"]')?.addEventListener('click', () => this.#move(index, index - 1));
      row.querySelector('[data-action="down"]')?.addEventListener('click', () => this.#move(index, index + 1));
      row.querySelector('[data-action="remove"]')?.addEventListener('click', () => this.#remove(index));
      list.appendChild(row);
    });
  }

  #renderFooter(footer: HTMLDivElement): void {
    footer.innerHTML = `
      <button class="path-editor-btn path-editor-btn-danger" data-action="delete">Delete path</button>
      <div class="path-editor-footer-right">
        <button class="path-editor-btn" data-action="cancel">Cancel</button>
        <button class="path-editor-btn path-editor-btn-primary" data-action="save">Save</button>
      </div>
    `;
    footer.querySelector('[data-action="delete"]')?.addEventListener('click', () => void this.#deletePath());
    footer.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.close());
    footer.querySelector('[data-action="save"]')?.addEventListener('click', () => void this.#save());
  }

  #rerender(): void {
    const list = this.#body?.querySelector('.path-editor-scenes') as HTMLDivElement | null;
    if (list) this.#renderScenes(list);
  }

  // ==========================================================================
  // MUTATIONS (local until Save)
  // ==========================================================================

  #move(from: number, to: number): void {
    if (to < 0 || to >= this.#scenes.length) return;
    const [moved] = this.#scenes.splice(from, 1);
    this.#scenes.splice(to, 0, moved);
    this.#rerender();
  }

  #remove(index: number): void {
    this.#scenes.splice(index, 1);
    this.#rerender();
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  async #save(): Promise<void> {
    if (!this.#pathId) return;

    const existing = this.#features.path.getSaved(this.#pathId);
    if (!existing) return;

    const name = (this.#nameInput?.value ?? this.#originalName).trim() || this.#originalName;
    const updated: Path = { ...existing, name, scenes: this.#scenes };

    // Refused for the path being walked. The list disables Edit in that case, so
    // this only fires if path mode began after the editor opened.
    const saved = await this.#features.path.updateSaved(updated);
    if (!saved) {
      alert('This path is being walked. Exit path mode before editing it.');
      return;
    }

    // Re-read so the caller sees the store-assigned updatedAt.
    const persisted = this.#features.path.getSaved(this.#pathId) ?? updated;
    const onSave = this.#callbacks.onSave;
    this.close();
    onSave?.(persisted);
  }

  async #deletePath(): Promise<void> {
    if (!this.#pathId) return;

    const name = this.#nameInput?.value || this.#originalName;
    if (!confirm(`Delete path "${name}"?`)) return;

    // deleteSaved exits path mode first if this is the path being walked.
    await this.#features.path.deleteSaved(this.#pathId);
    const onDelete = this.#callbacks.onDelete;
    this.close();
    onDelete?.();
  }
}
