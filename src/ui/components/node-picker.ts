/**
 * Node Picker Dialog
 * Modal dialog for selecting an existing node from the graph
 */

import type { NodeId, Node } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';
import '../../styles/node-picker.css';

export class NodePicker {
  #dialog: HTMLDialogElement | null = null;
  #resolve: ((nodeId: NodeId | null) => void) | null = null;

  /**
   * Show node picker dialog
   * @param excludeNodeIds - Set of node IDs to exclude from list (already in scene)
   * @returns Selected node ID or null if cancelled
   */
  show(excludeNodeIds: Set<NodeId>): Promise<NodeId | null> {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.#renderDialog(excludeNodeIds);
      this.#dialog?.showModal();
    });
  }

  #renderDialog(excludeNodeIds: Set<NodeId>): void {
    // Remove existing dialog if any
    this.#dialog?.remove();

    // Create dialog element
    this.#dialog = document.createElement('dialog');
    this.#dialog.className = 'node-picker-dialog';

    // Get available nodes (not in scene)
    const availableNodes = graphStore.nodes.filter(
      (node: Node) => !excludeNodeIds.has(node.id)
    );

    // Build dialog content
    this.#dialog.innerHTML = `
      <div class="node-picker-container">
        <h2>Include Node in Scene</h2>
        <input 
          type="text" 
          class="node-picker-search" 
          placeholder="Search nodes..."
          autofocus
        />
        <div class="node-picker-list">
          ${this.#renderNodeList(availableNodes, '')}
        </div>
        <div class="node-picker-actions">
          <button class="cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    // Add to document
    document.body.appendChild(this.#dialog);

    // Wire up event handlers
    this.#attachEventHandlers(availableNodes);
  }

  #renderNodeList(nodes: Node[], searchTerm: string): string {
    const filteredNodes = searchTerm
      ? nodes.filter(node => 
          node.title.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : nodes;

    if (filteredNodes.length === 0) {
      return '<div class="node-picker-empty">No nodes available</div>';
    }

    return filteredNodes
      .map(
        node => `
        <div class="node-picker-item" data-node-id="${node.id}">
          <div class="node-picker-title">${this.#escapeHtml(node.title)}</div>
          <div class="node-picker-id">${node.id}</div>
        </div>
      `
      )
      .join('');
  }

  #attachEventHandlers(availableNodes: Node[]): void {
    if (!this.#dialog) return;

    // Search input
    const searchInput = this.#dialog.querySelector('.node-picker-search') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      const searchTerm = (e.target as HTMLInputElement).value;
      const listContainer = this.#dialog?.querySelector('.node-picker-list');
      if (listContainer) {
        listContainer.innerHTML = this.#renderNodeList(availableNodes, searchTerm);
      }
    });

    // Cancel button
    const cancelBtn = this.#dialog.querySelector('.cancel-btn');
    cancelBtn?.addEventListener('click', () => this.#close(null));

    // Click outside dialog to cancel
    this.#dialog.addEventListener('click', (e) => {
      if (e.target === this.#dialog) {
        this.#close(null);
      }
    });

    // ESC key to cancel
    this.#dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.#close(null);
      }
    });

    // Delegate click events for node items
    this.#dialog.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const nodeItem = target.closest('.node-picker-item') as HTMLElement;
      if (nodeItem) {
        const nodeId = nodeItem.dataset.nodeId as NodeId;
        this.#close(nodeId);
      }
    });
  }

  #close(nodeId: NodeId | null): void {
    this.#dialog?.close();
    this.#dialog?.remove();
    this.#dialog = null;

    if (this.#resolve) {
      this.#resolve(nodeId);
      this.#resolve = null;
    }
  }

  #escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
