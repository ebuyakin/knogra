/**
 * Scene Feature
 * Orchestrates scene operations: state, node/edge ops, fold, viewport
 * Delegates node and edge operations to SceneNodeOps and SceneEdgeOps
 */

// core imports
import type { Core } from 'cytoscape';
import type { SceneId, NodeId, EdgeId, FoldedNodeEntry } from '../../core/main-types';

// app modules imports
import { graphStore } from '../../storage/graph-store';
import { graphSaver } from '../../storage/graph-saver';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';

// shared utilities imports
import { collapseNodesCascading } from '../utils/cy/collapse-animator';
import { expandNodeConnections, type ExpandMode } from '../utils/cy/expand-animator';

// scene sub-modules
import { SceneNodeOps } from './node-ops';
import { SceneEdgeOps } from './edge-ops';
import { FoldManager } from './fold-manager';

// re-export types for external consumers
export type { NodeEditContext } from './node-ops';
export type { EdgeEditContext } from './edge-ops';

export class Scene {
  #cy: Core;
  #nodeOps: SceneNodeOps;
  #edgeOps: SceneEdgeOps;
  #foldManager: FoldManager;

  constructor(cy: Core) {
    this.#cy = cy;
    this.#foldManager = new FoldManager(cy);
    this.#nodeOps = new SceneNodeOps(
      cy,
      () => this.getCurrentSceneId(),
      () => this.getThemeId(),
      (nodeId) => this.collapseNodeAnimated(nodeId),
      () => this.getCentralNodeId()
    );
    this.#edgeOps = new SceneEdgeOps(
      cy,
      () => this.getCurrentSceneId(),
      () => this.getThemeId()
    );
  }

  // ==========================================================================
  // STATE
  // ==========================================================================

  /**
   * Handle container resize
   */
  handleResize(): void {
    this.#cy.resize();
    this.fit();
  }

  /**
   * Get current scene ID from Cytoscape scratch space
   */
  getCurrentSceneId(): SceneId | null {
    return this.#cy.scratch('currentSceneId') || null;
  }

  /**
   * Get theme ID for current scene
   */
  getThemeId(): string {
    const sceneId = this.getCurrentSceneId();
    if (sceneId) {
      const scene = graphStore.scenes.find(s => s.id === sceneId);
      if (scene?.themeId) {
        return scene.themeId;
      }
    }
    return 'dark';
  }

  /**
   * Set theme ID for current scene
   */
  async setTheme(themeId: string): Promise<void> {
    const sceneId = this.getCurrentSceneId();
    if (!sceneId) return;

    const scene = graphStore.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    if (!isEditMode()) {
      if (isDebug('d_scene')) console.log(`[Scene] Skipped theme persistence in View mode: ${themeId}`);
      return;
    }

    scene.themeId = themeId;
    await graphStore.updateScene(scene);
    if (isDebug('d_scene')) console.log(`[Scene] Set theme to: ${themeId}`);
  }

  /**
   * Get central node ID for current scene
   */
  getCentralNodeId(): NodeId | null {
    const sceneId = this.getCurrentSceneId();
    if (sceneId) {
      const scene = graphStore.scenes.find(s => s.id === sceneId);
      if (scene) {
        return scene.centralNodeId;
      }
    }
    return null;
  }

  /**
   * Get IDs of all nodes currently in the scene
   */
  getSceneNodeIds(): Set<NodeId> {
    return new Set(this.#cy.nodes().map(n => n.id() as NodeId));
  }

  // ==========================================================================
  // NODE OPERATIONS (delegated to SceneNodeOps)
  // ==========================================================================

  getNodeEditContext(nodeId: NodeId): import('./node-ops').NodeEditContext | null {
    return this.#nodeOps.getNodeEditContext(nodeId);
  }

  async excludeNode(nodeId: NodeId): Promise<void> {
    // Clean up fold state before cy removal so GraphSaver sees consistent scratch.
    // Handles: node is a fold root, or node is a hidden child in another root's set.
    this.#foldManager.cleanupRemovedNode(nodeId);
    return this.#nodeOps.excludeNode(nodeId);
  }

  async includeNode(
    nodeId: NodeId,
    position: { x: number; y: number },
    design?: { id: string; params: Record<string, unknown> }
  ): Promise<void> {
    return this.#nodeOps.includeNode(nodeId, position, design);
  }

  async includeExistingNode(
    nodeId: NodeId,
    design?: { id: string; params: Record<string, unknown> }
  ): Promise<number> {
    return this.#nodeOps.includeExistingNode(nodeId, design);
  }

  async updateNodeStyle(
    nodeId: NodeId,
    updates: { design?: { id: string; params: Record<string, unknown> }; scale?: number }
  ): Promise<void> {
    return this.#nodeOps.updateNodeStyle(nodeId, updates);
  }

  // ==========================================================================
  // EDGE OPERATIONS (delegated to SceneEdgeOps)
  // ==========================================================================

  excludeEdge(edgeId: EdgeId): void {
    return this.#edgeOps.excludeEdge(edgeId);
  }

  getEdgeEditContext(edgeId: EdgeId): import('./edge-ops').EdgeEditContext | null {
    return this.#edgeOps.getEdgeEditContext(edgeId);
  }

  async updateEdgeStyle(
    edgeId: EdgeId,
    params: Record<string, unknown>
  ): Promise<void> {
    return this.#edgeOps.updateEdgeStyle(edgeId, params);
  }

  includeAllIncidentEdges(nodeId: NodeId): number {
    return this.#edgeOps.includeAllIncidentEdges(nodeId);
  }

  // ==========================================================================
  // FOLD OPERATIONS
  // ==========================================================================

  /**
   * Fold node: hide entire subtree (non-destructive)
   */
  async foldNode(nodeId: NodeId): Promise<void> {
    const graphSaveSuspension = graphSaver.suspend('scene:foldNode');
    try {
      await this.#foldManager.fold(nodeId);
    } finally {
      graphSaver.resume(graphSaveSuspension);
    }
    await this.#forceSaveIfEditMode();
    if (isDebug('d_scene')) console.log(`[Scene.foldNode] Complete for ${nodeId}`);
  }

  /**
   * Unfold node: reveal direct children, keep deeper levels hidden
   */
  async unfoldNode(nodeId: NodeId): Promise<void> {
    const graphSaveSuspension = graphSaver.suspend('scene:unfoldNode');
    try {
      await this.#foldManager.unfold(nodeId);
    } finally {
      graphSaver.resume(graphSaveSuspension);
    }
    await this.#forceSaveIfEditMode();
    if (isDebug('d_scene')) console.log(`[Scene.unfoldNode] Complete for ${nodeId}`);
  }

  /** Check if a node is a fold-root */
  isFolded(nodeId: NodeId): boolean {
    return this.#foldManager.isFolded(nodeId);
  }

  /** Get fold state for persistence */
  getFoldState(): Record<NodeId, FoldedNodeEntry[]> {
    return this.#foldManager.getFoldState();
  }

  /** Restore fold state on scene load (reads from cy.scratch) */
  loadFoldState(): void {
    this.#foldManager.loadFoldState();
  }

  /**
   * Collapse node with animation (permanently removes descendants)
   */
  async collapseNodeAnimated(nodeId: NodeId): Promise<void> {
    const graphSaveSuspension = graphSaver.suspend('scene:collapseNodeAnimated');
    try {
      await collapseNodesCascading(this.#cy, nodeId);
    } finally {
      graphSaver.resume(graphSaveSuspension);
    }
    await this.#forceSaveIfEditMode();
    if (isDebug('d_scene')) console.log(`[Scene.collapseNodeAnimated] Complete for ${nodeId}`);
  }

  /**
   * Expand node with animation
   */
  async expandNodeAnimated(nodeId: NodeId, mode: ExpandMode = 'children'): Promise<void> {
    if (isDebug('d_scene')) console.log(`[expandNodeAnimated] Starting for node: ${nodeId}, mode: ${mode}`);

    const cyNode = this.#cy.getElementById(nodeId);
    if (cyNode.length === 0) {
      console.warn(`Node ${nodeId} not in scene`);
      return;
    }

    const graphSaveSuspension = graphSaver.suspend('scene:expandNodeAnimated');
    try {
      await expandNodeConnections(
        this.#cy,
        nodeId,
        mode,
        getSetting('fold.expandDuration')
      );
    } finally {
      graphSaver.resume(graphSaveSuspension);
    }
    await this.#forceSaveIfEditMode();
    if (isDebug('d_scene')) console.log(`Scene: Animated expand complete for ${nodeId}`);
  }

  async #forceSaveIfEditMode(): Promise<void> {
    if (!isEditMode()) return;
    await graphSaver.forceSave();
  }

  // ==========================================================================
  // VIEWPORT
  // ==========================================================================

  /**
   * Fit all elements to viewport with animation
   */
  fit(padding: number = 50, duration: number = 300): void {
    this.#cy.animate({
      fit: { eles: this.#cy.elements(), padding }
    }, {
      duration,
      easing: 'ease-out'
    });
  }

  /**
   * Zoom in/out centered on viewport
   */
  zoom(factor: number, duration: number = 150): void {
    const currentZoom = this.#cy.zoom();
    const newZoom = currentZoom * factor;

    const pan = this.#cy.pan();
    const container = this.#cy.container();
    if (!container) return;

    const centerX = container.clientWidth / 2;
    const centerY = container.clientHeight / 2;

    const modelCenterX = (centerX - pan.x) / currentZoom;
    const modelCenterY = (centerY - pan.y) / currentZoom;

    const newPanX = centerX - modelCenterX * newZoom;
    const newPanY = centerY - modelCenterY * newZoom;

    this.#cy.animate({
      zoom: newZoom,
      pan: { x: newPanX, y: newPanY }
    }, {
      duration,
      easing: 'ease-out'
    });
  }
}
