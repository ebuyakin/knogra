/**
 * Node Manager Dialog
 * Comprehensive node management: view all nodes, include in scene, open scene, delete
 */

import type { NodeId, NodeInfo, SceneId } from '../../core/main-types';
import type { FeatureAPI } from '../../features/feature-api';
import { isDebug } from '../../config/debug-flags';
import { graphStore } from '../../storage/graph-store';
import { isEditMode } from '../../storage/app-mode';
import { validateScenes } from '../../storage/workspace/validate';
import { cascadeSceneDeletion } from '../../storage/scene-deletion';
import '../../styles/node-manager.css';

type NodeManagerStatusFilter = 'all' | 'ok' | 'errors' | 'unchecked';

export class NodeManager {
  #dialog: HTMLDialogElement | null = null;
  #features: FeatureAPI;
  #selectedNodes: Set<NodeId> = new Set();
  #allNodesInfo: NodeInfo[] = [];
  #filteredNodesInfo: NodeInfo[] = [];
  #sceneValidation: Map<SceneId, string[]> | null = null;
  #statusFilter: NodeManagerStatusFilter = 'all';
  #isDragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;

  constructor(features: FeatureAPI) {
    this.#features = features;
  }

  /**
   * Show node manager dialog
   * @param graphPosition - Position in graph coordinates for including nodes
   */
  show(graphPosition: { x: number; y: number }): void {
    void graphPosition;
    this.#selectedNodes.clear();
    
    // Load node data from features layer and sort
    this.#allNodesInfo = this.#sortNodes(this.#features.graph.getAllNodesInfo());
    this.#filteredNodesInfo = [...this.#allNodesInfo];
    
    this.#renderDialog();
    this.#renderTableBody();
    this.#dialog?.showModal();
    this.#positionDialog();
  }

  /**
   * Sort nodes: 1) anchor first, 2) isInCurrentScene, 3) alphabetically by title
   */
  #sortNodes(nodes: NodeInfo[]): NodeInfo[] {
    return [...nodes].sort((a, b) => {
      // First priority: anchor node comes first
      const aIsAnchor = a.node.isAnchor === true;
      const bIsAnchor = b.node.isAnchor === true;
      if (aIsAnchor !== bIsAnchor) {
        return aIsAnchor ? -1 : 1;
      }
      // Second priority: nodes in current scene come first
      if (a.isInCurrentScene !== b.isInCurrentScene) {
        return a.isInCurrentScene ? -1 : 1;
      }
      // Third priority: alphabetical by title
      return a.node.title.localeCompare(b.node.title);
    });
  }

  /**
   * Position dialog in center of graph area (left of chat panel)
   */
  #positionDialog(): void {
    if (!this.#dialog) return;
    
    // Get the left area (everything except chat panel)
    const chatPanel = document.getElementById('chat');
    const chatWidth = chatPanel?.offsetWidth || 350;
    const viewportWidth = window.innerWidth;
    const leftAreaWidth = viewportWidth - chatWidth;
    
    const dialogWidth = this.#dialog.offsetWidth;
    const dialogHeight = this.#dialog.offsetHeight;
    
    const left = (leftAreaWidth - dialogWidth) / 2;
    const top = (window.innerHeight - dialogHeight) / 2;
    
    this.#dialog.style.left = `${Math.max(20, left)}px`;
    this.#dialog.style.top = `${Math.max(20, top)}px`;
  }

  #renderDialog(): void {
    // Remove existing dialog if any
    this.#dialog?.remove();

    // Create dialog element
    this.#dialog = document.createElement('dialog');
    this.#dialog.className = 'node-manager-dialog';

    // Build dialog content
    this.#dialog.innerHTML = `
      <div class="node-manager-container">
        <div class="node-manager-header">
          <h2>Node Manager</h2>
          <button class="node-manager-close" aria-label="Close">&times;</button>
        </div>
        
        <div class="node-manager-search">
          <input 
            type="text" 
            class="node-manager-search-input" 
            placeholder="Search nodes..."
            autofocus
          />
        </div>
        
        <div class="node-manager-table-container">
          <table class="node-manager-table">
            <thead>
              <tr>
                <th class="col-checkbox"><input type="checkbox" class="select-all" /></th>
                <th class="col-title">Title</th>
                <th class="col-node-id">Node ID</th>
                <th class="col-scenes">Scenes</th>
                <th class="col-connections">Conn</th>
                <th class="col-own-scene">Own</th>
                <th class="col-in-scene">Here</th>
                <th class="col-status" title="Scene integrity status">Status</th>
              </tr>
            </thead>
            <tbody class="node-manager-body">
              <!-- Node rows will be rendered here -->
            </tbody>
          </table>
        </div>

        <div class="node-manager-status-filter">
          <label for="nm-status-select">Status:</label>
          <select id="nm-status-select" class="status-filter-select">
            <option value="all">All</option>
            <option value="ok">OK</option>
            <option value="errors">Errors</option>
            <option value="unchecked">Not validated</option>
          </select>
        </div>
        
        <div class="node-manager-footer">
          <span class="node-manager-selection-count">Selected: 0</span>
          <div class="node-manager-actions">
            <button class="btn-open-scene" disabled>Open Scene</button>
            <button class="btn-include" disabled>Include in Scene</button>
            <button class="btn-validate">Validate Data</button>
            <button class="btn-copy-list" title="Copy checked rows; if none checked, copies the filtered list">Copy List</button>
            <button class="btn-clear-scenes" disabled>Clear Scenes</button>
            <button class="btn-delete" disabled>Delete Nodes</button>
            <button class="btn-cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;

    // Add to document
    document.body.appendChild(this.#dialog);

    // Wire up event handlers
    this.#attachEventHandlers();
  }

  #renderTableBody(): void {
    const tbody = this.#dialog?.querySelector('.node-manager-body');
    if (!tbody) return;

    if (this.#filteredNodesInfo.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="node-manager-empty">No nodes found</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.#filteredNodesInfo.map(info => {
      const anchorMarker = info.node.isAnchor ? ' <span class="anchor-marker">(A)</span>' : '';
      const statusCell = this.#renderStatusCell(info);
      return `
      <tr data-node-id="${info.node.id}" class="${this.#selectedNodes.has(info.node.id) ? 'selected' : ''}">
        <td class="col-checkbox">
          <input type="checkbox" class="node-checkbox" ${this.#selectedNodes.has(info.node.id) ? 'checked' : ''} />
        </td>
        <td class="col-title">
          ${this.#escapeHtml(info.node.title)}${anchorMarker}
        </td>
        <td class="col-node-id" title="${this.#escapeHtml(info.node.id)}">
          ${this.#escapeHtml(info.node.id)}
        </td>
        <td class="col-scenes">${info.sceneCount}</td>
        <td class="col-connections">${info.connectionCount}</td>
        <td class="col-own-scene">
          <span class="indicator ${info.hasOwnScene ? 'active' : ''}"></span>
        </td>
        <td class="col-in-scene">
          <span class="indicator ${info.isInCurrentScene ? 'active' : ''}"></span>
        </td>
        <td class="col-status">${statusCell}</td>
      </tr>
    `;
    }).join('');
  }

  /**
   * Render the scene integrity status dot for a node's own scene.
   * - grey: no own scene, or not yet validated
   * - green: scene exists and passed validation
   * - red: scene has integrity errors (tooltip lists them)
   */
  #renderStatusCell(info: NodeInfo): string {
    if (!info.hasOwnScene) {
      return `<span class="scene-status-dot grey" title="No scene"></span>`;
    }
    if (!this.#sceneValidation) {
      return `<span class="scene-status-dot grey" title="Not validated"></span>`;
    }
    const scene = graphStore.scenes.find(s => s.centralNodeId === info.node.id);
    if (!scene) {
      return `<span class="scene-status-dot grey" title="No scene"></span>`;
    }
    const errors = this.#sceneValidation.get(scene.id);
    if (!errors || errors.length === 0) {
      return `<span class="scene-status-dot green" title="Scene OK"></span>`;
    }
    const tooltip = this.#escapeHtml(`${errors.length} error(s):\n` + errors.join('\n')).replace(/\n/g, '&#10;');
    return `<span class="scene-status-dot red" title="${tooltip}" data-scene-id="${scene.id}"></span>`;
  }

  #filterNodes(searchTerm: string): void {
    const term = searchTerm.toLowerCase().trim();

    let result = this.#allNodesInfo;
    if (term) {
      result = result.filter(info =>
        info.node.title.toLowerCase().includes(term) ||
        info.node.id.toLowerCase().includes(term)
      );
    }
    if (this.#statusFilter !== 'all') {
      result = result.filter(info => this.#matchesStatusFilter(info));
    }
    this.#filteredNodesInfo = [...result];

    this.#renderTableBody();
  }

  /** True if the node matches the current Status dropdown filter. */
  #matchesStatusFilter(info: NodeInfo): boolean {
    const status = this.#getSceneStatus(info);
    switch (this.#statusFilter) {
      case 'ok': return status === 'ok';
      case 'errors': return status === 'errors';
      case 'unchecked': return status === 'unchecked';
      default: return true;
    }
  }

  /** Resolve the effective status for a node's own scene. */
  #getSceneStatus(info: NodeInfo): 'no-scene' | 'unchecked' | 'ok' | 'errors' {
    if (!info.hasOwnScene) return 'no-scene';
    if (!this.#sceneValidation) return 'unchecked';
    const scene = graphStore.scenes.find(s => s.centralNodeId === info.node.id);
    if (!scene) return 'no-scene';
    const errs = this.#sceneValidation.get(scene.id);
    return !!errs && errs.length > 0 ? 'errors' : 'ok';
  }

  #attachEventHandlers(): void {
    if (!this.#dialog) return;

    // Close button
    const closeBtn = this.#dialog.querySelector('.node-manager-close');
    closeBtn?.addEventListener('click', () => this.#close());

    // Drag by header
    const header = this.#dialog.querySelector('.node-manager-header') as HTMLElement | null;
    if (header) this.#setupDrag(header, this.#dialog);

    // Cancel button
    const cancelBtn = this.#dialog.querySelector('.btn-cancel');
    cancelBtn?.addEventListener('click', () => this.#close());

    // Include in Scene button
    const includeBtn = this.#dialog.querySelector('.btn-include');
    includeBtn?.addEventListener('click', () => this.#handleIncludeInScene());

    // Open Scene button
    const openSceneBtn = this.#dialog.querySelector('.btn-open-scene');
    openSceneBtn?.addEventListener('click', () => this.#handleOpenScene());

    // Delete button
    const deleteBtn = this.#dialog.querySelector('.btn-delete');
    deleteBtn?.addEventListener('click', () => this.#handleDelete());

    // Validate Scenes button
    const validateBtn = this.#dialog.querySelector('.btn-validate');
    validateBtn?.addEventListener('click', () => this.#handleValidateScenes());

    // Clear Scenes button
    const clearScenesBtn = this.#dialog.querySelector('.btn-clear-scenes');
    clearScenesBtn?.addEventListener('click', () => this.#handleClearScenes());

    // Copy List button
    const copyListBtn = this.#dialog.querySelector('.btn-copy-list');
    copyListBtn?.addEventListener('click', () => this.#handleCopyList());

    // Status filter dropdown
    const statusSelect = this.#dialog.querySelector('.status-filter-select') as HTMLSelectElement;
    statusSelect?.addEventListener('change', (e) => {
      this.#statusFilter = (e.target as HTMLSelectElement).value as NodeManagerStatusFilter;
      const searchInput = this.#dialog?.querySelector('.node-manager-search-input') as HTMLInputElement;
      this.#filterNodes(searchInput?.value ?? '');
      this.#updateSelectionUI();
    });

    // Close on backdrop click
    this.#dialog.addEventListener('click', (e) => {
      if (e.target === this.#dialog) {
        this.#close();
      }
    });

    // Close on Escape
    this.#dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.#close();
      }
    });

    // Search input
    const searchInput = this.#dialog.querySelector('.node-manager-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      this.#filterNodes((e.target as HTMLInputElement).value);
    });

    // Select all checkbox
    const selectAllCheckbox = this.#dialog.querySelector('.select-all') as HTMLInputElement;
    selectAllCheckbox?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.#selectAll(checked);
    });

    // Individual row checkboxes (delegated)
    const tbody = this.#dialog.querySelector('.node-manager-body');
    tbody?.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('node-checkbox')) {
        const row = target.closest('tr');
        const nodeId = row?.dataset.nodeId as NodeId;
        if (nodeId) {
          this.#toggleNodeSelection(nodeId);
        }
      }
    });

    // Row click to toggle selection
    tbody?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Show validation errors when clicking a red status dot
      const errorDot = target.closest('.scene-status-dot.red');
      if (errorDot instanceof HTMLElement && errorDot.dataset.sceneId && this.#sceneValidation) {
        const sceneErrors = this.#sceneValidation.get(errorDot.dataset.sceneId as SceneId);
        if (sceneErrors && sceneErrors.length > 0) {
          alert(`Scene errors (${sceneErrors.length}):\n\n${sceneErrors.join('\n')}`);
        }
        return;
      }

      // Don't toggle if clicking on checkbox itself
      if (target.classList.contains('node-checkbox')) return;
      
      const row = target.closest('tr');
      const nodeId = row?.dataset.nodeId as NodeId;
      if (nodeId) {
        this.#toggleNodeSelection(nodeId);
      }
    });
  }

  #toggleNodeSelection(nodeId: NodeId): void {
    if (this.#selectedNodes.has(nodeId)) {
      this.#selectedNodes.delete(nodeId);
    } else {
      this.#selectedNodes.add(nodeId);
    }
    this.#updateSelectionUI();
  }

  #selectAll(selected: boolean): void {
    this.#selectedNodes.clear();
    if (selected) {
      for (const info of this.#filteredNodesInfo) {
        this.#selectedNodes.add(info.node.id);
      }
    }
    this.#updateSelectionUI();
  }

  #updateSelectionUI(): void {
    // Update row classes and checkboxes
    const rows = this.#dialog?.querySelectorAll('.node-manager-body tr[data-node-id]');
    rows?.forEach(row => {
      const nodeId = (row as HTMLElement).dataset.nodeId as NodeId;
      const checkbox = row.querySelector('.node-checkbox') as HTMLInputElement;
      const isSelected = this.#selectedNodes.has(nodeId);
      
      row.classList.toggle('selected', isSelected);
      if (checkbox) {
        checkbox.checked = isSelected;
      }
    });

    // Update select-all checkbox
    const selectAllCheckbox = this.#dialog?.querySelector('.select-all') as HTMLInputElement;
    if (selectAllCheckbox) {
      const allSelected = this.#filteredNodesInfo.length > 0 && 
                          this.#filteredNodesInfo.every(info => this.#selectedNodes.has(info.node.id));
      const someSelected = this.#filteredNodesInfo.some(info => this.#selectedNodes.has(info.node.id));
      
      selectAllCheckbox.checked = allSelected;
      selectAllCheckbox.indeterminate = someSelected && !allSelected;
    }

    // Update selection count
    this.#updateSelectionCount();

    // Update button states
    this.#updateButtonStates();
  }

  #updateButtonStates(): void {
    const editMode = isEditMode();
    const hasSelection = this.#selectedNodes.size > 0;
    const singleSelection = this.#selectedNodes.size === 1;

    const includeBtn = this.#dialog?.querySelector('.btn-include') as HTMLButtonElement;
    const openSceneBtn = this.#dialog?.querySelector('.btn-open-scene') as HTMLButtonElement;
    const deleteBtn = this.#dialog?.querySelector('.btn-delete') as HTMLButtonElement;
    const clearScenesBtn = this.#dialog?.querySelector('.btn-clear-scenes') as HTMLButtonElement;

    if (includeBtn) includeBtn.disabled = !editMode || !hasSelection;

    // Open Scene: only when single node selected AND it has its own scene
    if (openSceneBtn) {
      let canOpen = false;
      if (singleSelection) {
        const nodeId = Array.from(this.#selectedNodes)[0];
        const info = this.#allNodesInfo.find(i => i.node.id === nodeId);
        canOpen = !!info?.hasOwnScene;
      }
      openSceneBtn.disabled = !canOpen;
    }

    // Delete and Clear Scenes are blocked when the current scene's central node
    // is among the selection — avoids destructive operations on live Cytoscape state.
    const currentCentralId = this.#features.scene.getCentralNodeId();
    const selectedArr = Array.from(this.#selectedNodes);
    const includesCurrentCentral = currentCentralId !== null
      && selectedArr.includes(currentCentralId);

    if (deleteBtn) deleteBtn.disabled = !editMode || !hasSelection || includesCurrentCentral;

    // Clear Scenes: at least one selected node must have its own scene,
    // and the current scene's central node must not be in the selection.
    if (clearScenesBtn) {
      const anyHasScene = selectedArr.some(id =>
        this.#allNodesInfo.find(i => i.node.id === id)?.hasOwnScene === true
      );
      clearScenesBtn.disabled = !editMode || !anyHasScene || includesCurrentCentral;
    }
  }

  #close(): void {
    this.#dialog?.close();
    this.#dialog?.remove();
    this.#dialog = null;
    this.#selectedNodes.clear();
    this.#allNodesInfo = [];
    this.#filteredNodesInfo = [];
    this.#sceneValidation = null;
    this.#statusFilter = 'all';
  }

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  async #handleIncludeInScene(): Promise<void> {
    if (!isEditMode()) return;
    if (this.#selectedNodes.size === 0) return;

    const selectedIds = Array.from(this.#selectedNodes);

    // Include each node sequentially with collision-free placement
    for (const nodeId of selectedIds) {
      await this.#features.scene.includeExistingNode(nodeId);
    }

    if (isDebug('d_scene')) console.log(`[NodeManager] Included ${selectedIds.length} node(s) in scene`);
    this.#close();
  }

  async #handleOpenScene(): Promise<void> {
    if (this.#selectedNodes.size !== 1) return;

    const nodeId = Array.from(this.#selectedNodes)[0];

    // Find the scene where this node is central
    const targetScene = this.#features.graph.findSceneByCentralNode(nodeId);
    if (!targetScene) {
      console.warn(`[NodeManager] No scene found for node: ${nodeId}`);
      return;
    }
    
    // Close dialog first (transition will change the view)
    this.#close();
    
    // Close current scene, then open target scene
    await this.#features.transition.closeScene();
    await this.#features.transition.openScene(targetScene.id);
    
    if (isDebug('d_scene')) console.log(`[NodeManager] Opened scene ${targetScene.id} for node: ${nodeId}`);
  }

  async #handleDelete(): Promise<void> {
    if (!isEditMode()) return;
    if (this.#selectedNodes.size === 0) return;

    const selectedIds = Array.from(this.#selectedNodes);
    
    // Separate nodes in current scene from those not in current scene
    const nodesInScene: NodeId[] = [];
    const nodesToDelete: NodeId[] = [];
    
    for (const nodeId of selectedIds) {
      const info = this.#allNodesInfo.find(i => i.node.id === nodeId);
      if (info?.isInCurrentScene) {
        nodesInScene.push(nodeId);
      } else {
        nodesToDelete.push(nodeId);
      }
    }

    // Warn if some nodes are in current scene
    if (nodesInScene.length > 0) {
      const skipMsg = nodesInScene.length === 1
        ? '1 node is in the current scene and will be skipped. Use context menu to delete it.'
        : `${nodesInScene.length} nodes are in the current scene and will be skipped. Use context menu to delete them.`;
      alert(skipMsg);
    }

    // Nothing to delete?
    if (nodesToDelete.length === 0) {
      return;
    }

    // Confirm deletion
    const count = nodesToDelete.length;
    const message = count === 1
      ? 'Delete this node? This will also remove all connected edges and exclude it from all scenes.'
      : `Delete ${count} nodes? This will also remove all connected edges and exclude them from all scenes.`;

    if (!confirm(message)) return;

    // Delete each node using the database-only method
    let deleted = 0;
    let errors: string[] = [];
    
    for (const nodeId of nodesToDelete) {
      const result = await this.#features.graph.deleteNodeFromGraph(nodeId);
      if (result.success) {
        deleted++;
      } else if (result.error) {
        errors.push(`${nodeId}: ${result.error}`);
      }
    }

    if (isDebug('d_scene')) console.log(`[NodeManager] Deleted ${deleted} node(s)`);
    if (errors.length > 0) {
      console.warn(`[NodeManager] Errors:`, errors);
    }
    
    // Refresh data and UI instead of closing
    this.#refreshData();
  }

  /**
   * Run integrity validation on all scenes.
   * Results are cached in #sceneValidation and visualized via the Status column.
   */
  #handleValidateScenes(): void {
    const graphData = {
      nodes: graphStore.nodes,
      edges: graphStore.edges,
      scenes: graphStore.scenes,
      backgroundImages: graphStore.backgroundImages
    };
    this.#sceneValidation = validateScenes(graphData);

    const totalErrors = [...this.#sceneValidation.values()].reduce((s, e) => s + e.length, 0);
    const badScenes = [...this.#sceneValidation.values()].filter(e => e.length > 0).length;
    if (isDebug('d_scene')) {
      console.log(`[NodeManager] Validated ${this.#sceneValidation.size} scene(s): ${badScenes} with errors, ${totalErrors} total issues`);
    }

    // Re-apply filters (errors-only may now take effect) and redraw
    const searchInput = this.#dialog?.querySelector('.node-manager-search-input') as HTMLInputElement;
    this.#filterNodes(searchInput?.value ?? '');
    this.#updateSelectionUI();
  }

  /**
   * Clear scenes for selected nodes.
   * Each scene is deleted via cascadeSceneDeletion (also cleans up paths).
   * Chat and shelf are preserved (they are keyed by nodeId, not sceneId).
   * Selected nodes must not include the current scene's central node —
   * that is enforced by #updateButtonStates.
   */
  async #handleClearScenes(): Promise<void> {
    if (!isEditMode()) return;
    if (this.#selectedNodes.size === 0) return;

    // Collect scenes that actually exist for selected nodes
    const sceneIds: SceneId[] = [];
    for (const nodeId of this.#selectedNodes) {
      const scene = graphStore.scenes.find(s => s.centralNodeId === nodeId);
      if (scene) sceneIds.push(scene.id);
    }
    if (sceneIds.length === 0) return;

    const count = sceneIds.length;
    const message = count === 1
      ? 'Clear this scene? The scene layout will be deleted and rebuilt from scratch on next navigation. Nodes, edges, chat, and shelf are preserved.'
      : `Clear ${count} scenes? Scene layouts will be deleted and rebuilt from scratch on next navigation. Nodes, edges, chat, and shelf are preserved.`;
    if (!confirm(message)) return;

    let cleared = 0;
    for (const sceneId of sceneIds) {
      try {
        await cascadeSceneDeletion(sceneId);
        this.#sceneValidation?.delete(sceneId);
        cleared++;
      } catch (err) {
        console.error(`[NodeManager] Failed to clear scene ${sceneId}:`, err);
      }
    }

    if (isDebug('d_scene')) console.log(`[NodeManager] Cleared ${cleared}/${sceneIds.length} scene(s)`);

    this.#refreshData();
  }

  /**
   * Copy node list to the clipboard (one node per line, tab-separated title + id).
   * If rows are checked, copies only those; otherwise copies the filtered list.
   */
  #handleCopyList(): void {
    const source = this.#selectedNodes.size > 0
      ? this.#filteredNodesInfo.filter(info => this.#selectedNodes.has(info.node.id))
      : this.#filteredNodesInfo;

    const text = source
      .map(info => `${info.node.title}\t${info.node.id}`)
      .join('\n');

    const btn = this.#dialog?.querySelector('.btn-copy-list') as HTMLButtonElement | null;

    const flash = (msg: string): void => {
      if (!btn) return;
      const original = 'Copy List';
      btn.textContent = msg;
      setTimeout(() => { btn.textContent = original; }, 1500);
    };

    // Fallback via hidden textarea appended inside the dialog — keeping the
    // selection inside the focused modal avoids focus-related copy failures.
    const execFallback = (): boolean => {
      const host = this.#dialog ?? document.body;
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
      host.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    };

    const report = (ok: boolean): void => {
      flash(ok ? 'Copied!' : 'Copy failed');
      if (isDebug('d_scene')) {
        console.log(`[NodeManager] Copy ${ok ? 'succeeded' : 'failed'}: ${source.length} node(s)`);
      }
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => report(true))
        .catch(() => report(execFallback()));
    } else {
      report(execFallback());
    }
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Refresh node data and re-render table
   */
  #refreshData(): void {
    // Clear selection
    this.#selectedNodes.clear();

    // Reload and sort data
    this.#allNodesInfo = this.#sortNodes(this.#features.graph.getAllNodesInfo());

    // Re-apply current filters (search + errors-only) and redraw
    const searchInput = this.#dialog?.querySelector('.node-manager-search-input') as HTMLInputElement;
    this.#filterNodes(searchInput?.value ?? '');
    this.#updateSelectionUI();
  }

  #updateSelectionCount(): void {
    const countEl = this.#dialog?.querySelector('.node-manager-selection-count');
    if (countEl) {
      countEl.textContent = `Selected: ${this.#selectedNodes.size}`;
    }
  }

  #escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    // Also escape quotes so the result is safe inside HTML attribute values (title="...")
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  #setupDrag(handle: HTMLElement, dialog: HTMLElement): void {
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', (e: MouseEvent) => {
      this.#isDragging = true;
      const rect = dialog.getBoundingClientRect();
      this.#dragOffsetX = e.clientX - rect.left;
      this.#dragOffsetY = e.clientY - rect.top;
      document.body.style.cursor = 'move';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.#isDragging) return;
      dialog.style.left = `${e.clientX - this.#dragOffsetX}px`;
      dialog.style.top = `${e.clientY - this.#dragOffsetY}px`;
    });

    document.addEventListener('mouseup', () => {
      this.#isDragging = false;
      document.body.style.cursor = '';
    });
  }
}
