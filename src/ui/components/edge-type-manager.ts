/**
 * Edge Type Manager Dialog
 * Workspace-level relationship type editing.
 */

import type { EdgeStyleSlotId, EdgeType, EdgeTypeId } from '../../core/main-types';
import { getDefaultEdgeStyleSlotId, getEdgeStyleSlotIds } from '../../config/edge-type-settings';
import { graphStore } from '../../storage/graph-store';
import '../../styles/edge-type-manager.css';

interface EdgeTypeManagerOptions {
  onEdgeTypesChanged: () => void;
}

export class EdgeTypeManager {
  #onEdgeTypesChanged: () => void;
  #dialog: HTMLDialogElement | null = null;
  #isDragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;

  constructor(options: EdgeTypeManagerOptions) {
    this.#onEdgeTypesChanged = options.onEdgeTypesChanged;
  }

  show(): void {
    this.#renderDialog();
    this.#dialog?.showModal();
    this.#positionDialog();
  }

  #renderDialog(): void {
    this.#dialog?.remove();

    this.#dialog = document.createElement('dialog');
    this.#dialog.className = 'edge-type-manager-dialog';
    this.#dialog.innerHTML = `
      <div class="edge-type-manager-container">
        <div class="edge-type-manager-header">
          <h2>Edge Type Manager</h2>
          <button class="edge-type-manager-close" aria-label="Close">&times;</button>
        </div>

        <div class="edge-type-manager-table-container">
          <table class="edge-type-manager-table">
            <thead>
              <tr>
                <th class="col-etm-name">Name</th>
                <th class="col-etm-slot">Thematic Style</th>
                <th class="col-etm-override">Override</th>
                <th class="col-etm-color">Color</th>
                <th class="col-etm-opacity">Opacity</th>
                <th class="col-etm-width">Width</th>
                <th class="col-etm-arrow">Arrow</th>
                <th class="col-etm-arrow-size">Arrow Size</th>
                <th class="col-etm-curve">Curve</th>
                <th class="col-etm-count">Edges</th>
              </tr>
            </thead>
            <tbody class="edge-type-manager-body">
              ${this.#renderRows()}
            </tbody>
          </table>
        </div>

        <div class="edge-type-manager-footer">
          <span class="edge-type-manager-status">${graphStore.edgeTypes.length} type(s)</span>
          <div class="edge-type-manager-actions">
            <button class="btn-add-edge-type">Add Type</button>
            <button class="btn-save-edge-types">Save</button>
            <button class="btn-cancel-edge-types">Cancel</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.#dialog);
    this.#attachEventHandlers();
  }

  #renderRows(): string {
    if (graphStore.edgeTypes.length === 0) {
      return '<tr><td colspan="10" class="edge-type-manager-empty">No edge types found</td></tr>';
    }

    return graphStore.edgeTypes.map(edgeType => this.#renderRow(edgeType)).join('');
  }

  #renderRow(edgeType: EdgeType): string {
    const styleOverride = edgeType.styleOverride ?? {};
    const hasStyleOverride = Object.keys(styleOverride).length > 0;
    const controlsDisabled = hasStyleOverride ? '' : 'disabled';

    return `
      <tr data-edge-type-id="${this.#escapeHtml(edgeType.id)}">
        <td><input class="etm-name" value="${this.#escapeHtml(edgeType.name)}" /></td>
        <td>${this.#renderSlotSelect(edgeType.thematicStyleSlotId)}</td>
        <td class="col-etm-override"><input type="checkbox" class="etm-override-enabled" ${hasStyleOverride ? 'checked' : ''} /></td>
        <td><input type="color" class="etm-style-control etm-color" value="${this.#styleString(styleOverride, 'line-color', '#808080')}" ${controlsDisabled} /></td>
        <td><input type="number" class="etm-style-control etm-opacity" min="0" max="1" step="0.05" value="${this.#styleNumber(styleOverride, 'line-opacity', 1)}" ${controlsDisabled} /></td>
        <td><input type="number" class="etm-style-control etm-width" min="0.5" max="10" step="0.5" value="${this.#styleNumber(styleOverride, 'width', 2)}" ${controlsDisabled} /></td>
        <td>${this.#renderArrowSelect(this.#styleString(styleOverride, 'target-arrow-shape', 'triangle'), controlsDisabled)}</td>
        <td><input type="number" class="etm-style-control etm-arrow-scale" min="0.5" max="3" step="0.1" value="${this.#styleNumber(styleOverride, 'arrow-scale', 1)}" ${controlsDisabled} /></td>
        <td>${this.#renderCurveSelect(this.#styleString(styleOverride, 'curve-style', 'bezier'), controlsDisabled)}</td>
        <td class="col-etm-count">${this.#countEdgesForType(edgeType.id)}</td>
      </tr>
    `;
  }

  #renderSlotSelect(selectedSlotId: EdgeStyleSlotId): string {
    return `
      <select class="etm-slot">
        ${getEdgeStyleSlotIds().map(slotId => `
          <option value="${slotId}" ${slotId === selectedSlotId ? 'selected' : ''}>${this.#formatSlotLabel(slotId)}</option>
        `).join('')}
      </select>
    `;
  }

  #renderArrowSelect(selectedArrowShape: string, disabled: string): string {
    const options = ['triangle', 'diamond', 'circle', 'tee', 'none'];
    return `
      <select class="etm-style-control etm-arrow-shape" ${disabled}>
        ${options.map(option => `
          <option value="${option}" ${option === selectedArrowShape ? 'selected' : ''}>${this.#capitalize(option)}</option>
        `).join('')}
      </select>
    `;
  }

  #renderCurveSelect(selectedCurveStyle: string, disabled: string): string {
    const options = ['bezier', 'straight', 'unbundled-bezier', 'segments', 'round-segments', 'taxi', 'round-taxi', 'haystack'];
    return `
      <select class="etm-style-control etm-curve-style" ${disabled}>
        ${options.map(option => `
          <option value="${option}" ${option === selectedCurveStyle ? 'selected' : ''}>${this.#formatCurveLabel(option)}</option>
        `).join('')}
      </select>
    `;
  }

  #attachEventHandlers(): void {
    if (!this.#dialog) return;

    const header = this.#dialog.querySelector('.edge-type-manager-header') as HTMLElement | null;
    if (header) this.#setupDrag(header, this.#dialog);

    this.#dialog.querySelector('.edge-type-manager-close')?.addEventListener('click', () => this.#close());
    this.#dialog.querySelector('.btn-cancel-edge-types')?.addEventListener('click', () => this.#close());
    this.#dialog.querySelector('.btn-add-edge-type')?.addEventListener('click', () => void this.#addEdgeType());
    this.#dialog.querySelector('.btn-save-edge-types')?.addEventListener('click', () => void this.#saveEdgeTypes());
    this.#dialog.addEventListener('change', event => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains('etm-override-enabled')) return;
      const row = target.closest('tr[data-edge-type-id]');
      if (row) this.#setOverrideControlsEnabled(row, (target as HTMLInputElement).checked);
    });
  }

  async #addEdgeType(): Promise<void> {
    const now = new Date();
    const id = this.#createUniqueEdgeTypeId('edge-type');
    const edgeType: EdgeType = {
      id,
      name: 'New type',
      thematicStyleSlotId: getDefaultEdgeStyleSlotId(),
      createdAt: now,
      updatedAt: now
    };

    await graphStore.createEdgeType(edgeType);
    this.#onEdgeTypesChanged();
    this.#appendRow(edgeType);
  }

  async #saveEdgeTypes(): Promise<void> {
    if (!this.#dialog) return;

    const rows = Array.from(this.#dialog.querySelectorAll('tr[data-edge-type-id]'));
    for (const row of rows) {
      const edgeTypeId = (row as HTMLElement).dataset.edgeTypeId as EdgeTypeId | undefined;
      if (!edgeTypeId) continue;

      const existing = graphStore.edgeTypes.find(edgeType => edgeType.id === edgeTypeId);
      if (!existing) continue;

      const name = this.#getInputValue(row, '.etm-name').trim();
      if (!name) {
        alert('Edge type name cannot be empty.');
        return;
      }

      const thematicStyleSlotId = this.#getSelectValue(row, '.etm-slot', getDefaultEdgeStyleSlotId()) as EdgeStyleSlotId;
      const styleOverride = this.#isOverrideEnabled(row)
        ? this.#collectStyleOverride(row)
        : undefined;

      await graphStore.updateEdgeType({
        ...existing,
        name,
        thematicStyleSlotId,
        styleOverride,
        updatedAt: new Date()
      });
    }

    this.#onEdgeTypesChanged();
    this.#refreshTable();
  }

  #refreshTable(): void {
    const tbody = this.#dialog?.querySelector('.edge-type-manager-body');
    if (tbody) tbody.innerHTML = this.#renderRows();

    const status = this.#dialog?.querySelector('.edge-type-manager-status');
    if (status) status.textContent = `${graphStore.edgeTypes.length} type(s)`;
  }

  #appendRow(edgeType: EdgeType): void {
    const tbody = this.#dialog?.querySelector('.edge-type-manager-body');
    if (!tbody) return;

    if (tbody.querySelector('.edge-type-manager-empty')) {
      tbody.innerHTML = '';
    }

    tbody.insertAdjacentHTML('beforeend', this.#renderRow(edgeType));

    const status = this.#dialog?.querySelector('.edge-type-manager-status');
    if (status) status.textContent = `${graphStore.edgeTypes.length} type(s)`;
  }

  #positionDialog(): void {
    if (!this.#dialog) return;
    const chatPanel = document.getElementById('chat');
    const chatWidth = chatPanel?.offsetWidth || 350;
    const leftAreaWidth = window.innerWidth - chatWidth;
    const left = (leftAreaWidth - this.#dialog.offsetWidth) / 2;
    const top = (window.innerHeight - this.#dialog.offsetHeight) / 2;
    this.#dialog.style.left = `${Math.max(20, left)}px`;
    this.#dialog.style.top = `${Math.max(20, top)}px`;
  }

  #close(): void {
    this.#dialog?.close();
    this.#dialog?.remove();
    this.#dialog = null;
  }

  #createUniqueEdgeTypeId(prefix: string): EdgeTypeId {
    const usedIds = new Set(graphStore.edgeTypes.map(edgeType => edgeType.id));
    let index = graphStore.edgeTypes.length + 1;
    let id = `${prefix}-${index}` as EdgeTypeId;
    while (usedIds.has(id)) {
      index += 1;
      id = `${prefix}-${index}` as EdgeTypeId;
    }
    return id;
  }

  #countEdgesForType(edgeTypeId: EdgeTypeId): number {
    return graphStore.edges.filter(edge => edge.typeId === edgeTypeId).length;
  }

  #getInputValue(row: Element, selector: string): string {
    return ((row.querySelector(selector) as HTMLInputElement | null)?.value ?? '');
  }

  #getSelectValue(row: Element, selector: string, fallback: string): string {
    return ((row.querySelector(selector) as HTMLSelectElement | null)?.value ?? fallback);
  }

  #collectStyleOverride(row: Element): Record<string, unknown> {
    const color = this.#getInputValue(row, '.etm-color');
    return {
      'line-color': color,
      'target-arrow-color': color,
      'line-opacity': this.#getNumberValue(row, '.etm-opacity', 1),
      'width': this.#getNumberValue(row, '.etm-width', 2),
      'target-arrow-shape': this.#getSelectValue(row, '.etm-arrow-shape', 'triangle'),
      'arrow-scale': this.#getNumberValue(row, '.etm-arrow-scale', 1),
      'curve-style': this.#getSelectValue(row, '.etm-curve-style', 'bezier')
    };
  }

  #getNumberValue(row: Element, selector: string, fallback: number): number {
    const value = Number(this.#getInputValue(row, selector));
    return Number.isFinite(value) ? value : fallback;
  }

  #isOverrideEnabled(row: Element): boolean {
    return !!(row.querySelector('.etm-override-enabled') as HTMLInputElement | null)?.checked;
  }

  #setOverrideControlsEnabled(row: Element, enabled: boolean): void {
    row.querySelectorAll('.etm-style-control').forEach(control => {
      (control as HTMLInputElement | HTMLSelectElement).disabled = !enabled;
    });
  }

  #styleString(styleOverride: Record<string, unknown>, key: string, fallback: string): string {
    const value = styleOverride[key];
    return typeof value === 'string' ? value : fallback;
  }

  #styleNumber(styleOverride: Record<string, unknown>, key: string, fallback: number): number {
    const value = styleOverride[key];
    return typeof value === 'number' ? value : fallback;
  }

  #formatSlotLabel(slotId: EdgeStyleSlotId): string {
    const slotNumber = slotId.replace('edge-style-', '');
    return `Thematic Style ${slotNumber}`;
  }

  #formatCurveLabel(curveStyle: string): string {
    return curveStyle
      .split('-')
      .map(part => this.#capitalize(part))
      .join(' ');
  }

  #capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  #escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  #setupDrag(handle: HTMLElement, dialog: HTMLElement): void {
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', (event: MouseEvent) => {
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
}