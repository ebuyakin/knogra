/**
 * EdgeTypeVisibilityModal - scene-local show/dim/hide controls for edge types.
 */

import type { EdgeTypeId, EdgeTypeVisibilityMode } from '../../core/main-types';
import type { FeatureAPI } from '../../features/feature-api';
import '../../styles/edge-type-visibility-modal.css';

export class EdgeTypeVisibilityModal {
  #features: FeatureAPI;
  #dialog: HTMLDivElement | null = null;
  #isDragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;

  constructor(features: FeatureAPI) {
    this.#features = features;
  }

  show(): void {
    this.#dialog?.remove();

    const entries = this.#features.scene.getEdgeTypeVisibilityEntries();
    const overlay = document.createElement('div');
    overlay.className = 'edge-type-visibility-overlay';

    const cy = document.getElementById('cy');
    if (cy) {
      const rect = cy.getBoundingClientRect();
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    }

    const dialog = document.createElement('div');
    dialog.className = 'edge-type-visibility-dialog';
    dialog.innerHTML = `
      <div class="edge-type-visibility-header">
        <h2>Edges visibility</h2>
        <button class="edge-type-visibility-close" aria-label="Close">&times;</button>
      </div>
      <div class="edge-type-visibility-body">
        ${entries.length === 0 ? `
          <div class="edge-type-visibility-empty">No edge types in the current scene.</div>
        ` : `
          <table class="edge-type-visibility-table">
            <thead>
              <tr>
                <th>Edge type</th>
                <th>Edges</th>
                <th>Display</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map(entry => this.#renderRow(entry)).join('')}
            </tbody>
          </table>
        `}
      </div>
      <div class="edge-type-visibility-footer">
        <button class="edge-type-visibility-cancel">Cancel</button>
        <button class="edge-type-visibility-save" ${entries.length === 0 ? 'disabled' : ''}>Save</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    this.#dialog = overlay;

    this.#positionDialog();

    const header = dialog.querySelector('.edge-type-visibility-header') as HTMLElement | null;
    if (header) this.#setupDrag(header, dialog);

    const close = (): void => {
      this.#isDragging = false;
      overlay.remove();
      this.#dialog = null;
    };

    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    dialog.querySelector('.edge-type-visibility-close')?.addEventListener('click', close);
    dialog.querySelector('.edge-type-visibility-cancel')?.addEventListener('click', close);
    dialog.querySelector('.edge-type-visibility-save')?.addEventListener('click', () => {
      void this.#save().then(close);
    });
  }

  #renderRow(entry: {
    typeId: EdgeTypeId;
    name: string;
    count: number;
    mode: EdgeTypeVisibilityMode;
  }): string {
    return `
      <tr data-edge-type-id="${this.#escapeAttr(entry.typeId)}">
        <td>${this.#escapeHtml(entry.name)}</td>
        <td class="edge-type-visibility-count">${entry.count}</td>
        <td>
          <select class="edge-type-visibility-mode">
            <option value="show" ${entry.mode === 'show' ? 'selected' : ''}>Show</option>
            <option value="dim" ${entry.mode === 'dim' ? 'selected' : ''}>Dim</option>
            <option value="hide" ${entry.mode === 'hide' ? 'selected' : ''}>Hide</option>
          </select>
        </td>
      </tr>
    `;
  }

  async #save(): Promise<void> {
    if (!this.#dialog) return;

    const updates: Record<EdgeTypeId, EdgeTypeVisibilityMode> = {} as Record<EdgeTypeId, EdgeTypeVisibilityMode>;
    this.#dialog.querySelectorAll('tr[data-edge-type-id]').forEach(row => {
      const typeId = (row as HTMLElement).dataset.edgeTypeId as EdgeTypeId | undefined;
      const select = row.querySelector('.edge-type-visibility-mode') as HTMLSelectElement | null;
      if (!typeId || !select) return;
      updates[typeId] = select.value as EdgeTypeVisibilityMode;
    });

    await this.#features.scene.updateEdgeTypeVisibility(updates);
  }

  #positionDialog(): void {
    if (!this.#dialog) return;

    const cy = document.getElementById('cy');
    const rect = cy?.getBoundingClientRect();
    const leftAreaWidth = rect?.width ?? window.innerWidth;
    const left = ((rect?.left ?? 0) + leftAreaWidth / 2) - this.#dialog.offsetWidth / 2;
    const top = ((rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2) - this.#dialog.offsetHeight / 2;

    this.#dialog.style.left = `${Math.max(20, left)}px`;
    this.#dialog.style.top = `${Math.max(20, top)}px`;
  }

  #setupDrag(handle: HTMLElement, dialog: HTMLElement): void {
    handle.style.cursor = 'move';

    handle.addEventListener('mousedown', (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('button')) return;

      this.#isDragging = true;
      const rect = dialog.getBoundingClientRect();
      this.#dragOffsetX = event.clientX - rect.left;
      this.#dragOffsetY = event.clientY - rect.top;
      document.body.style.cursor = 'move';
      event.preventDefault();
    });

    document.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.#isDragging) return;
      dialog.style.left = `${event.clientX - this.#dragOffsetX}px`;
      dialog.style.top = `${event.clientY - this.#dragOffsetY}px`;
    });

    document.addEventListener('mouseup', () => {
      this.#isDragging = false;
      document.body.style.cursor = '';
    });
  }

  #escapeHtml(value: string): string {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  #escapeAttr(value: string): string {
    return this.#escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}