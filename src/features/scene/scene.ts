/**
 * Scene Feature
 * Orchestrates scene operations: state, node/edge ops, fold, viewport
 * Delegates node and edge operations to SceneNodeOps and SceneEdgeOps
 */

// core imports
import type { Core } from 'cytoscape';
import type { EdgeTypeId, EdgeTypeVisibilityMode, SceneId, NodeId, EdgeId, FoldedNodeEntry } from '../../core/main-types';

// app modules imports
import { graphStore } from '../../storage/graph-store';
import { graphSaver } from '../../storage/graph-saver';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';
import { StyleGenerator } from '../../styles/style-generator';
import { resolveSceneEdgeVisualState } from '../../styles/edge-visual-resolver';

// shared utilities imports
import { collapseNodesCascading, excludeNeighboursCascading } from './collapse-animator';
import { expandNodeConnections, type ExpandMode } from './expand-animator';
import { resolveScenePan } from '../utils/cy/viewport-utils';

// scene sub-modules
import { SceneNodeOps } from './node-ops';
import { SceneEdgeOps } from './edge-ops';
import { FoldManager } from './fold-manager';
import type { TagStyleParams, TagStylePlan } from './tag-style-plan';

// re-export types for external consumers
export type { NodeEditContext } from './node-ops';
export type { EdgeEditContext } from './edge-ops';
export type { TagStyleParams, TagStylePlan } from './tag-style-plan';

export interface EdgeTypeVisibilityEntry {
  typeId: EdgeTypeId;
  name: string;
  count: number;
  mode: EdgeTypeVisibilityMode;
}

/**
 * Upper bound on the zoom the `F` (fit) command may zoom *in* to. Fitting a
 * scene with very few nodes would otherwise blow a single node up to fill the
 * whole screen. This cap is local to the fit command — the user can still zoom
 * in arbitrarily far by hand; it only limits automatic fitting.
 */
const FIT_MAX_ZOOM = 1.5;

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
   * Handle container resize.
   * Keeps the authored zoom and re-centers the current scene on the new
   * container size (P-A). No autofit — resizing must not rescale the scene.
   */
  handleResize(): void {
    this.#cy.resize();
    const sceneId = this.getCurrentSceneId();
    const scene = sceneId ? graphStore.scenes.find(s => s.id === sceneId) : null;
    if (!scene) return;
    this.#cy.viewport({
      zoom: scene.viewport.zoom,
      pan: resolveScenePan(scene, this.#cy)
    });
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
   * Apply a theme to EVERY scene in the workspace. A named cross-scene write,
   * mirroring scaleAllScenesZoom: loops all scenes and persists each. The
   * caller is responsible for re-rendering the current scene afterwards.
   */
  async setThemeForAllScenes(themeId: string): Promise<void> {
    if (!isEditMode()) {
      if (isDebug('d_scene')) console.log(`[Scene] Skipped bulk theme persistence in View mode: ${themeId}`);
      return;
    }

    for (const scene of graphStore.scenes) {
      if (scene.themeId === themeId) continue;
      await graphStore.updateScene({ ...scene, themeId, updatedAt: new Date() });
    }
    if (isDebug('d_scene')) console.log(`[Scene] Applied theme to all scenes: ${themeId}`);
  }

  /**
   * Number of scenes in the workspace (used for bulk-operation confirmations).
   */
  getSceneCount(): number {
    return graphStore.scenes.length;
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

  planTaggedStyleApplication(params: TagStyleParams): TagStylePlan {
    return this.#nodeOps.planTaggedStyleApplication(params);
  }

  async applyStyleToTaggedNodes(
    style: { design: { id: string; params: Record<string, unknown> }; scale: number },
    params: TagStyleParams
  ): Promise<void> {
    return this.#nodeOps.applyStyleToTaggedNodes(style, params);
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
    params: Record<string, unknown> | null
  ): Promise<void> {
    return this.#edgeOps.updateEdgeStyle(edgeId, params);
  }

  async updateEdgeCurve(
    edgeId: EdgeId,
    curveParams: Record<string, unknown> | null
  ): Promise<void> {
    return this.#edgeOps.updateEdgeCurve(edgeId, curveParams);
  }

  async adjustEdgeBend(
    edgeId: EdgeId,
    command: 'strengthDown' | 'strengthUp' | 'positionTowardSource' | 'positionTowardTarget',
    options?: { largeStep?: boolean }
  ): Promise<boolean> {
    return this.#edgeOps.adjustEdgeBend(edgeId, command, options);
  }

  async resetEdgeCurveOverride(edgeId: EdgeId): Promise<boolean> {
    return this.#edgeOps.resetEdgeCurveOverride(edgeId);
  }

  includeAllIncidentEdges(nodeId: NodeId): number {
    return this.#edgeOps.includeAllIncidentEdges(nodeId);
  }

  includeAllSceneEdges(): number {
    return this.#edgeOps.includeAllSceneEdges();
  }

  getEdgeTypeVisibilityEntries(): EdgeTypeVisibilityEntry[] {
    const sceneId = this.getCurrentSceneId();
    const scene = sceneId ? graphStore.scenes.find(s => s.id === sceneId) : null;
    const visibility = scene?.edgeTypeVisibility ?? {};
    const counts = new Map<EdgeTypeId, number>();

    this.#cy.edges().forEach(edge => {
      const typeId = edge.data('typeId') as EdgeTypeId | undefined;
      if (!typeId) return;
      counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([typeId, count]) => {
        const edgeType = graphStore.edgeTypes.find(type => type.id === typeId);
        return {
          typeId,
          name: edgeType?.name ?? typeId,
          count,
          mode: visibility[typeId] ?? 'show'
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async updateEdgeTypeVisibility(
    updates: Record<EdgeTypeId, EdgeTypeVisibilityMode>
  ): Promise<void> {
    const sceneId = this.getCurrentSceneId();
    if (!sceneId) return;

    const scene = graphStore.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    const visibility = Object.fromEntries(
      Object.entries(updates).filter((entry): entry is [EdgeTypeId, EdgeTypeVisibilityMode] => entry[1] !== 'show')
    ) as Record<EdgeTypeId, EdgeTypeVisibilityMode>;

    scene.edgeTypeVisibility = Object.keys(visibility).length > 0 ? visibility : undefined;
    await graphStore.updateScene(scene);

    const stylesheet = (this.#cy.style() as any).json();
    const updatedStylesheet = StyleGenerator.updateEdgeTypeVisibilityInStylesheet(
      stylesheet,
      scene.edgeTypeVisibility
    );
    this.#cy.style().fromJson(updatedStylesheet).update();
    this.#cy.edges().forEach(edge => {
      const edgeData = graphStore.edges.find(graphEdge => graphEdge.id === edge.id());
      if (!edgeData) return;
      const targetOpacity = resolveSceneEdgeVisualState({
        edge: edgeData,
        scene,
        edgeTypes: graphStore.edgeTypes,
        themeId: scene.themeId || 'dark'
      }).opacity;
      edge.stop();
      edge.animate(
        { style: { opacity: targetOpacity } },
        {
          duration: 150,
          easing: 'ease-out',
          complete: () => edge.removeStyle('opacity')
        }
      );
    });
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
   * Exclude a node's private neighbourhood with animation: collapses every node
   * held in the scene only through this node (in any direction), keeping nodes
   * still anchored to the central node. The selected node and central node stay.
   */
  async excludeNeighboursAnimated(nodeId: NodeId): Promise<void> {
    const graphSaveSuspension = graphSaver.suspend('scene:excludeNeighboursAnimated');
    try {
      await excludeNeighboursCascading(this.#cy, nodeId);
    } finally {
      graphSaver.resume(graphSaveSuspension);
    }
    await this.#forceSaveIfEditMode();
    if (isDebug('d_scene')) console.log(`[Scene.excludeNeighboursAnimated] Complete for ${nodeId}`);
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
   * Fit all elements to viewport with animation.
   *
   * Unlike Cytoscape's native `cy.fit()` (which zooms in up to the global
   * `maxZoom`), the target zoom is capped at FIT_MAX_ZOOM so scenes with only a
   * few nodes are not blown up to fill the screen. Falls back to native fit when
   * there is nothing to measure.
   */
  fit(padding: number = 50, duration: number = 300): void {
    const elements = this.#cy.elements();
    const container = this.#cy.container();
    if (elements.length === 0 || !container) {
      this.#cy.animate({
        fit: { eles: elements, padding }
      }, {
        duration,
        easing: 'ease-out'
      });
      return;
    }

    const bounds = elements.boundingBox();
    const availW = Math.max(container.clientWidth - 2 * padding, 1);
    const availH = Math.max(container.clientHeight - 2 * padding, 1);
    const bboxW = Math.max(bounds.w, 1);
    const bboxH = Math.max(bounds.h, 1);
    const rawZoom = Math.min(availW / bboxW, availH / bboxH, FIT_MAX_ZOOM);
    const zoom = rawZoom > 0 && Number.isFinite(rawZoom) ? rawZoom : 1;

    const centerX = bounds.x1 + bounds.w / 2;
    const centerY = bounds.y1 + bounds.h / 2;

    this.#cy.animate({
      zoom,
      pan: {
        x: container.clientWidth / 2 - centerX * zoom,
        y: container.clientHeight / 2 - centerY * zoom
      }
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
    this.#animateZoomTo(currentZoom * factor, duration);
  }

  /**
   * Reset zoom to 1 and center the current scene in a single viewport animation.
   * This is intentionally scene-local behavior for the `0` command.
   */
  resetZoom(duration: number = 500): void {
    const elements = this.#cy.elements();
    if (elements.length === 0) {
      this.#animateZoomTo(1, duration);
      return;
    }

    const container = this.#cy.container();
    if (!container) {
      this.#animateZoomTo(1, duration);
      return;
    }

    const bounds = elements.boundingBox();
    const centerX = bounds.x1 + bounds.w / 2;
    const centerY = bounds.y1 + bounds.h / 2;

    this.#cy.animate({
      zoom: 1,
      pan: {
        x: container.clientWidth / 2 - centerX,
        y: container.clientHeight / 2 - centerY
      }
    }, {
      duration,
      easing: 'ease-out'
    });
  }

  /**
   * Scale the stored zoom of EVERY scene by the same factor. Because a single
   * factor is applied uniformly, the relative zoom ratios between scenes — and
   * therefore the authored transition framing — are preserved. Persists each
   * scene and refreshes the current scene's live viewport immediately.
   */
  scaleAllScenesZoom(factor: number): void {
    if (!(factor > 0) || !Number.isFinite(factor)) return;

    for (const scene of graphStore.scenes) {
      const zoom = scene.viewport?.zoom;
      if (typeof zoom !== 'number' || zoom <= 0) continue;
      void graphStore.updateScene({
        ...scene,
        viewport: { ...scene.viewport, zoom: zoom * factor },
        updatedAt: new Date()
      });
    }

    this.#animateZoomTo(this.#cy.zoom() * factor, 150);
  }

  /**
   * Normalize all scenes so the CURRENT scene renders at zoom 1, scaling every
   * other scene by the same factor to keep relative framing intact.
   */
  normalizeAllScenesToCurrent(): void {
    const sceneId = this.getCurrentSceneId();
    if (!sceneId) return;
    const scene = graphStore.scenes.find(s => s.id === sceneId);
    const refZoom = scene?.viewport?.zoom;
    if (typeof refZoom !== 'number' || refZoom <= 0) return;
    this.scaleAllScenesZoom(1 / refZoom);
  }

  #animateZoomTo(newZoom: number, duration: number): void {
    const currentZoom = this.#cy.zoom();
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
