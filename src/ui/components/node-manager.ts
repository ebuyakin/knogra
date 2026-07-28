/**
 * Node Manager Dialog
 * Comprehensive node management: view all nodes, include in scene, open scene, delete
 */

import type { NodeId, NodeInfo, SceneId } from '../../core/main-types';
import type { FeatureAPI } from '../../features/feature-api';
import { isDebug } from '../../config/debug-flags';
import { graphStore } from '../../storage/graph-store';
import { chatStore } from '../../storage/chat-store';
import { isEditMode } from '../../storage/app-mode';
import { validateScenes } from '../../storage/workspace/validate';
import { cascadeSceneDeletion } from '../../storage/scene-deletion';
import { GraphStatisticsModal } from './graph-statistics-modal';
import '../../styles/node-manager.css';

type NodeManagerStatusFilter = 'all' | 'ok' | 'errors' | 'unchecked';
type NodeManagerSortKey = 'default' | 'title' | 'nodeId' | 'sceneCount' | 'connectionCount' | 'anchorDistance' | 'hasOwnScene' | 'isInCurrentScene' | 'chatCount' | 'updatedAt' | 'status';
type NodeManagerSortDirection = 'asc' | 'desc';

export class NodeManager {
  #dialog: HTMLDialogElement | null = null;
  #features: FeatureAPI;
  #selectedNodes: Set<NodeId> = new Set();
  #allNodesInfo: NodeInfo[] = [];
  #filteredNodesInfo: NodeInfo[] = [];
  #chatCounts: Map<NodeId, number> = new Map();
  #sceneValidation: Map<SceneId, string[]> | null = null;
  #statusFilter: NodeManagerStatusFilter = 'all';
  #sortKey: NodeManagerSortKey = 'default';
  #sortDirection: NodeManagerSortDirection = 'asc';
  #statisticsModal = new GraphStatisticsModal();
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
    
    // Load node data from features layer
    this.#allNodesInfo = this.#features.graph.getAllNodesInfo();
    this.#filteredNodesInfo = this.#applySort(this.#allNodesInfo);
    
    this.#renderDialog();
    this.#renderTableBody();
    this.#dialog?.showModal();
    this.#positionDialog();
    void this.#loadChatCounts();
  }

  /**
   * Load per-node chat message counts asynchronously and repaint the table.
   * The dialog opens immediately; the Chat column fills once counts resolve
   * (mirrors how scene-status dots stay grey until validation runs).
   */
  async #loadChatCounts(): Promise<void> {
    try {
      this.#chatCounts = await chatStore.getConversationMessageCounts();
    } catch {
      this.#chatCounts = new Map();
      return;
    }
    this.#filteredNodesInfo = this.#applySort(this.#filteredNodesInfo);
    this.#renderTableBody();
  }

  /**
   * Sort nodes: 1) anchor first, 2) isInCurrentScene, 3) alphabetically by title
   */
  #sortNodes(nodes: NodeInfo[]): NodeInfo[] {
    return [...nodes].sort((a, b) => this.#compareDefault(a, b));
  }

  #compareDefault(a: NodeInfo, b: NodeInfo): number {
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
                <th class="col-checkbox" title="Select rows for bulk actions"><input type="checkbox" class="select-all" /></th>
                <th class="col-title sortable" data-sort-key="title" title="Node title. (A) marks the graph anchor."><span class="node-manager-th-content">Title <span class="sort-indicator"></span></span></th>
                <th class="col-node-id sortable" data-sort-key="nodeId" title="Internal stable node identifier"><span class="node-manager-th-content">Node ID <span class="sort-indicator"></span></span></th>
                <th class="col-scenes sortable" data-sort-key="sceneCount" title="Number of scenes that include this node"><span class="node-manager-th-content">Scenes <span class="sort-indicator"></span></span></th>
                <th class="col-connections sortable" data-sort-key="connectionCount" title="Number of graph edges connected to this node"><span class="node-manager-th-content">Conn <span class="sort-indicator"></span></span></th>
                <th class="col-anchor-distance sortable" data-sort-key="anchorDistance" title="Shortest graph distance from the anchor node; — means disconnected"><span class="node-manager-th-content">Dist <span class="sort-indicator"></span></span></th>
                <th class="col-own-scene sortable" data-sort-key="hasOwnScene" title="Whether this node has its own scene as the central node"><span class="node-manager-th-content">Own <span class="sort-indicator"></span></span></th>
                <th class="col-in-scene sortable" data-sort-key="isInCurrentScene" title="Whether this node is included in the current scene"><span class="node-manager-th-content">Here <span class="sort-indicator"></span></span></th>
                <th class="col-chat sortable" data-sort-key="chatCount" title="Number of chat messages associated with this node"><span class="node-manager-th-content">Chat <span class="sort-indicator"></span></span></th>
                <th class="col-edited sortable" data-sort-key="updatedAt" title="Last content edit (title, tags, properties). Design, position and chat are tracked separately."><span class="node-manager-th-content">Edited <span class="sort-indicator"></span></span></th>
                <th class="col-status sortable" data-sort-key="status" title="Scene integrity status for this node's own scene"><span class="node-manager-th-content">Status <span class="sort-indicator"></span></span></th>
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
            <button class="btn-statistics">Stat</button>
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
    this.#updateSortIndicators();
  }

  #renderTableBody(): void {
    const tbody = this.#dialog?.querySelector('.node-manager-body');
    if (!tbody) return;

    if (this.#filteredNodesInfo.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="node-manager-empty">No nodes found</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.#filteredNodesInfo.map(info => {
      const anchorMarker = info.node.isAnchor ? ' <span class="anchor-marker">(A)</span>' : '';
      const statusCell = this.#renderStatusCell(info);
      const anchorDistance = info.anchorDistance ?? '—';
      const chatCount = this.#chatCounts.get(info.node.id) ?? 0;
      const chatCell = chatCount > 0 ? String(chatCount) : '';
      const editedCell = info.node.updatedAt ? this.#formatTimestamp(info.node.updatedAt) : '—';
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
        <td class="col-anchor-distance ${info.anchorDistance === null ? 'disconnected' : ''}">${anchorDistance}</td>
        <td class="col-own-scene">
          <span class="indicator ${info.hasOwnScene ? 'active' : ''}"></span>
        </td>
        <td class="col-in-scene">
          <span class="indicator ${info.isInCurrentScene ? 'active' : ''}"></span>
        </td>
        <td class="col-chat">${chatCell}</td>
        <td class="col-edited">${editedCell}</td>
        <td class="col-status">${statusCell}</td>
      </tr>
    `;
    }).join('');
  }

  /**
   * Format a timestamp as a compact local date-time: DD-MM-YY HH:MM.
   */
  #formatTimestamp(timestamp: Date | number | string): string {
    const date = new Date(timestamp);
    const pad = (value: number): string => String(value).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = pad(date.getFullYear() % 100);
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${day}-${month}-${year} ${hours}:${minutes}`;
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
    this.#filteredNodesInfo = this.#applySort(result);

    this.#renderTableBody();
  }

  #applySort(nodes: NodeInfo[]): NodeInfo[] {
    if (this.#sortKey === 'default') return this.#sortNodes(nodes);

    const direction = this.#sortDirection === 'asc' ? 1 : -1;
    return [...nodes].sort((left, right) => {
      const comparison = this.#compareBySortKey(left, right, this.#sortKey);
      if (comparison !== 0) return comparison * direction;
      return this.#compareDefault(left, right);
    });
  }

  #compareBySortKey(left: NodeInfo, right: NodeInfo, sortKey: NodeManagerSortKey): number {
    switch (sortKey) {
      case 'title': return left.node.title.localeCompare(right.node.title);
      case 'nodeId': return left.node.id.localeCompare(right.node.id);
      case 'sceneCount': return left.sceneCount - right.sceneCount;
      case 'connectionCount': return left.connectionCount - right.connectionCount;
      case 'anchorDistance': return this.#compareNullableNumbers(left.anchorDistance, right.anchorDistance);
      case 'hasOwnScene': return Number(left.hasOwnScene) - Number(right.hasOwnScene);
      case 'isInCurrentScene': return Number(left.isInCurrentScene) - Number(right.isInCurrentScene);
      case 'chatCount': return (this.#chatCounts.get(left.node.id) ?? 0) - (this.#chatCounts.get(right.node.id) ?? 0);
      case 'updatedAt': return this.#compareNullableNumbers(
        left.node.updatedAt ? new Date(left.node.updatedAt).getTime() : null,
        right.node.updatedAt ? new Date(right.node.updatedAt).getTime() : null,
      );
      case 'status': return this.#statusRank(left) - this.#statusRank(right);
      default: return this.#compareDefault(left, right);
    }
  }

  #compareNullableNumbers(left: number | null, right: number | null): number {
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  }

  #statusRank(info: NodeInfo): number {
    const status = this.#getSceneStatus(info);
    if (status === 'errors') return 0;
    if (status === 'unchecked') return 1;
    if (status === 'ok') return 2;
    return 3;
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

    // Graph statistics button
    const statisticsBtn = this.#dialog.querySelector('.btn-statistics');
    statisticsBtn?.addEventListener('click', () => this.#statisticsModal.show(this.#features.graph.getGraphStatistics()));

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

    // Sortable column headers
    this.#dialog.querySelectorAll('th.sortable[data-sort-key]').forEach(header => {
      header.addEventListener('click', () => {
        this.#handleSortHeaderClick((header as HTMLElement).dataset.sortKey as NodeManagerSortKey);
      });
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

  #handleSortHeaderClick(sortKey: NodeManagerSortKey): void {
    if (this.#sortKey !== sortKey) {
      this.#sortKey = sortKey;
      this.#sortDirection = 'asc';
    } else if (this.#sortDirection === 'asc') {
      this.#sortDirection = this.#sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.#sortKey = 'default';
      this.#sortDirection = 'asc';
    }

    const searchInput = this.#dialog?.querySelector('.node-manager-search-input') as HTMLInputElement;
    this.#filterNodes(searchInput?.value ?? '');
    this.#updateSelectionUI();
    this.#updateSortIndicators();
  }

  #updateSortIndicators(): void {
    this.#dialog?.querySelectorAll('th.sortable[data-sort-key]').forEach(header => {
      const element = header as HTMLElement;
      const isActive = element.dataset.sortKey === this.#sortKey;
      element.classList.toggle('sorted', isActive);
      const indicator = element.querySelector('.sort-indicator');
      if (indicator) indicator.textContent = isActive ? (this.#sortDirection === 'asc' ? '▲' : '▼') : '';
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
    // Path mode blocks navigation and deletion (paths-architecture §14.5, §14.6).
    // Open Scene bypasses the transition funnel (it uses close+open directly), so
    // for that action this check is the enforcement, not merely an affordance.
    const pathMode = this.#features.path.isPathMode();

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
      openSceneBtn.disabled = !canOpen || pathMode;
    }

    // Delete and Clear Scenes are blocked when the current scene's central node
    // is among the selection — avoids destructive operations on live Cytoscape state.
    const currentCentralId = this.#features.scene.getCentralNodeId();
    const selectedArr = Array.from(this.#selectedNodes);
    const includesCurrentCentral = currentCentralId !== null
      && selectedArr.includes(currentCentralId);

    if (deleteBtn) deleteBtn.disabled = !editMode || !hasSelection || includesCurrentCentral || pathMode;

    // Clear Scenes: at least one selected node must have its own scene,
    // and the current scene's central node must not be in the selection.
    if (clearScenesBtn) {
      const anyHasScene = selectedArr.some(id =>
        this.#allNodesInfo.find(i => i.node.id === id)?.hasOwnScene === true
      );
      clearScenesBtn.disabled = !editMode || !anyHasScene || includesCurrentCentral || pathMode;
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
    this.#sortKey = 'default';
    this.#sortDirection = 'asc';
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

    // This path uses closeScene+openScene rather than the transition funnel, so
    // the Path feature's navigation guard does not cover it (paths-architecture
    // §14.4). Enforced here instead of widening the lock to openScene, which the
    // path panel's own Home button needs.
    if (this.#features.path.isPathMode()) return;

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
    // Scene deletion is blocked in path mode (paths-architecture §14.6). This
    // calls cascadeSceneDeletion directly rather than going through a feature
    // (pre-existing debt, architecture §3.8), so the guard has to live here.
    if (this.#features.path.isPathMode()) return;
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
      .map(info => {
        const chatCount = this.#chatCounts.get(info.node.id) ?? 0;
        const edited = info.node.updatedAt ? new Date(info.node.updatedAt).toLocaleDateString() : '';
        return `${info.node.title}\t${info.node.id}\t${chatCount}\t${edited}`;
      })
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

    // Reload data
    this.#allNodesInfo = this.#features.graph.getAllNodesInfo();

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
