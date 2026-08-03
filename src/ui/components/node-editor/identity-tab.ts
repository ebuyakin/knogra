/**
 * Node Editor - Identity tab
 *
 * Read-only service data: which node this is, where it sits, when it changed.
 * Separated from Advanced so the editable JSON has room to breathe and this
 * view has room to grow more diagnostics later.
 */

import type { Node, NodeId } from '../../../core/main-types';
import { el, text } from './editor-fields';
import type { NodeEditorContext } from './node-editor-types';

export interface IdentityTabDeps {
  nodeId: NodeId;
  node: Node;
  context: NodeEditorContext;
}

export function createIdentityTab(deps: IdentityTabDeps): { element: HTMLElement } {
  const element = el('div', 'node-editor-panel');
  const grid = el('div', 'node-editor-identity');

  const { x: modelX, y: modelY } = deps.context.position;
  const { x: viewportX, y: viewportY } = deps.context.viewportPosition;

  addRow(grid, 'Node ID', deps.nodeId);
  addRow(grid, 'Scene ID', deps.context.sceneId);
  addRow(grid, 'Theme', deps.context.themeId);
  addRow(grid, 'Model position', `${Math.round(modelX)}, ${Math.round(modelY)}`);
  addRow(grid, 'Viewport position', `${Math.round(viewportX)}, ${Math.round(viewportY)}`);
  addRow(grid, 'Scale', deps.context.scale.toFixed(2));
  addRow(grid, 'Created', formatStamp(deps.node.createdAt));
  addRow(grid, 'Updated', formatStamp(deps.node.updatedAt));

  element.appendChild(grid);
  return { element };
}

function addRow(grid: HTMLElement, label: string, value: string): void {
  const labelEl = text('div', label);
  labelEl.className = 'node-editor-identity-label';
  const valueEl = text('div', value);
  valueEl.className = 'node-editor-identity-value';
  grid.append(labelEl, valueEl);
}

function formatStamp(stamp: Date | number | string | undefined): string {
  if (!stamp) return '—';
  const date = stamp instanceof Date ? stamp : new Date(stamp);
  return date.toLocaleString();
}
