/**
 * SceneNodeOps
 * Node operations within a scene: include, exclude, edit context, style updates
 * Extracted from Scene to keep files under 300 lines
 */

import type { Core } from 'cytoscape';
import type { SceneId, Node, NodeId, EdgeId, DesignId } from '../../core/main-types';

import { graphStore } from '../../storage/graph-store';
import { isEditMode } from '../../storage/app-mode';
import { StyleGenerator } from '../../styles/style-generator';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';
import { circularSpreadSafe } from '../utils/pure/position-expansion';

/**
 * Context needed to open NodeEditor for a specific node
 */
export interface NodeEditContext {
  nodeData: Node;
  design: { id: DesignId; params: Record<string, unknown> };
  scale: number;
  sceneId: SceneId;
  themeId: string;
  position: { x: number; y: number };
  viewportPosition: { x: number; y: number };
}

export class SceneNodeOps {
  #cy: Core;
  /** Provided by Scene — returns current scene ID */
  #getSceneId: () => SceneId | null;
  /** Provided by Scene — returns current theme ID */
  #getThemeId: () => string;
  /** Provided by Scene — collapses node before exclusion */
  #collapseNode: (nodeId: NodeId) => Promise<void>;
  /** Provided by Scene — returns central node of current scene */
  #getCentralNodeId: () => NodeId | null;

  constructor(
    cy: Core,
    getSceneId: () => SceneId | null,
    getThemeId: () => string,
    collapseNode: (nodeId: NodeId) => Promise<void>,
    getCentralNodeId: () => NodeId | null
  ) {
    this.#cy = cy;
    this.#getSceneId = getSceneId;
    this.#getThemeId = getThemeId;
    this.#collapseNode = collapseNode;
    this.#getCentralNodeId = getCentralNodeId;
  }

  /**
   * Get all context needed to open NodeEditor for a node
   * Returns null if node not found in current scene
   */
  getNodeEditContext(nodeId: NodeId): NodeEditContext | null {
    const cyNode = this.#cy.getElementById(nodeId);
    if (cyNode.length === 0) {
      return null;
    }

    const nodeData: Node = {
      id: nodeId,
      title: cyNode.data('title') ?? '',
      tags: cyNode.data('tags') ?? [],
      properties: cyNode.data('properties') ?? {}
    };

    const design = cyNode.data('design') || { id: 'equation-node', params: {} };
    const scale = cyNode.data('scale') ?? 1.0;
    const position = cyNode.position();

    const pan = this.#cy.pan();
    const zoom = this.#cy.zoom();
    const viewportPosition = {
      x: position.x * zoom + pan.x,
      y: position.y * zoom + pan.y
    };

    const sceneId = this.#getSceneId() ?? ('unknown' as SceneId);

    return {
      nodeData,
      design,
      scale,
      sceneId,
      themeId: this.#getThemeId(),
      position,
      viewportPosition
    };
  }

  /**
   * Exclude node from scene (not from database)
   * Also removes connected edges to/from this node
   * Cannot exclude the central node of the scene
   */
  async excludeNode(nodeId: NodeId): Promise<void> {
    if (!isEditMode()) {
      console.warn('Cannot exclude nodes in View mode');
      return;
    }

    const sceneId = this.#getSceneId();
    const scene = sceneId ? graphStore.scenes.find(s => s.id === sceneId) : null;
    if (scene?.centralNodeId === nodeId) {
      console.warn(`Cannot exclude central node ${nodeId} from scene`);
      return;
    }

    const cyNode = this.#cy.getElementById(nodeId);
    if (cyNode.length === 0) {
      console.warn(`Node ${nodeId} not in scene`);
      return;
    }

    // First collapse the node (animated, removes unconnected descendants)
    await this.#collapseNode(nodeId);

    // Then remove the node itself (Cytoscape automatically removes connected edges)
    cyNode.remove();

    if (isDebug('d_scene')) console.log(`Scene: Excluded node ${nodeId} from scene`);
  }

  /**
   * Include existing node in the scene at specified position
   * Node must exist in graph database but not be in scene
   */
  async includeNode(
    nodeId: NodeId,
    position: { x: number; y: number },
    explicitDesign?: { id: string; params: Record<string, unknown> }
  ): Promise<void> {
    if (!isEditMode()) {
      console.warn('Cannot include nodes in View mode');
      return;
    }

    if (this.#cy.getElementById(nodeId).length > 0) {
      console.warn(`Node ${nodeId} already in scene`);
      return;
    }

    const node = graphStore.nodes.find((n: Node) => n.id === nodeId);
    if (!node) {
      console.error(`Node ${nodeId} not found in graph`);
      return;
    }

    // Use explicit design if provided, otherwise determine from settings
    let design: { id: DesignId; params: Record<string, unknown> } | undefined = explicitDesign;

    if (!design) {
      const inheritFromSelected = getSetting('node.inheritDesignFromSelected');
      if (inheritFromSelected) {
        const activeNodeId = this.#cy.scratch('activeNodeId');
        if (activeNodeId) {
          const activeNode = this.#cy.getElementById(activeNodeId);
          if (activeNode.length > 0) {
            design = activeNode.data('design');
          }
        }
      }
    }

    if (!design) {
      design = { id: getSetting('node.defaultDesign') as DesignId, params: {} };
    }

    this.#cy.add({
      group: 'nodes',
      data: {
        ...node,
        design,
        scale: 1.0
      },
      position
    });

    // Apply stylesheet
    const themeId = this.#getThemeId();
    const stylesheet = (this.#cy.style() as any).json();
    const updatedStylesheet = await StyleGenerator.addNodesToStylesheet(
      stylesheet,
      [{ nodeId, nodeData: node, design, scale: 1.0 }],
      themeId
    );
    this.#cy.style().fromJson(updatedStylesheet).update();

    if (isDebug('d_scene')) console.log(`Scene: Included node ${nodeId} at position (${position.x}, ${position.y})`);
  }

  /**
   * Update node's scene-specific style (design and/or scale)
   */
  async updateNodeStyle(
    nodeId: NodeId,
    updates: { design?: { id: string; params: Record<string, unknown> }; scale?: number }
  ): Promise<void> {
    if (!isEditMode()) {
      console.warn('Cannot update node style in View mode');
      return;
    }

    const cyNode = this.#cy.getElementById(nodeId);
    if (cyNode.length === 0) {
      console.warn(`Node ${nodeId} not in scene`);
      return;
    }

    const currentDesign = cyNode.data('design');
    const currentScale = cyNode.data('scale') ?? 1.0;

    const newDesign = updates.design ?? currentDesign;
    const newScale = updates.scale ?? currentScale;

    cyNode.data('design', newDesign);
    cyNode.data('scale', newScale);

    const nodeData: Node = {
      id: nodeId,
      title: cyNode.data('title') ?? '',
      tags: cyNode.data('tags') ?? [],
      properties: cyNode.data('properties') ?? {}
    };

    const themeId = this.#getThemeId();
    const stylesheet = (this.#cy.style() as any).json();
    let updatedStylesheet = await StyleGenerator.updateNodeInStylesheet(
      stylesheet,
      nodeId,
      nodeData,
      newDesign,
      newScale,
      themeId
    );

    this.#cy.style().fromJson(updatedStylesheet).update();

    const designChanged = updates.design !== undefined;
    const scaleChanged = updates.scale !== undefined && updates.scale !== currentScale;
    if (designChanged || scaleChanged) {
      cyNode.removeStyle('width height');
    }

    if (isDebug('d_scene')) console.log(`Scene: Updated node ${nodeId} style (design: ${newDesign.id}, scale: ${newScale})`);
  }

  /**
   * Include an existing graph node in the current scene.
   *
   * Placement & connection rules:
   * - The new node is positioned next to a "placement reference":
   *   the active (focused) node if it is currently in cy, otherwise
   *   the scene's central node.
   * - If a real edge already exists in the graph between the included
   *   node and the placement reference, that existing edge is added to
   *   the scene. Otherwise a fresh edge is created.
   * - Edges between the included node and other scene members are NOT
   *   auto-imported — scene membership stays curated.
   *
   * NOTE: the local "placement reference" is unrelated to the workspace
   * `Node.isAnchor` concept; that flag does not influence this operation.
   *
   * @returns count of edges added (always 0 or 1)
   */
  async includeExistingNode(
    nodeId: NodeId,
    design?: { id: string; params: Record<string, unknown> }
  ): Promise<number> {
    if (!isEditMode()) {
      console.warn('Cannot include existing nodes in View mode');
      return 0;
    }

    // No-op if the node is already in the scene. Without this guard the
    // function would fall through and create a spurious edge to the
    // placement reference.
    if (this.#cy.getElementById(nodeId as string).length > 0) {
      if (isDebug('d_scene')) console.log(`Scene: Node ${nodeId} already in scene, skipping include`);
      return 0;
    }

    // Resolve placement reference: prefer the active (focused) node when it
    // belongs to the current scene; otherwise fall back to the central node.
    // The active node id persists in cy.scratch across scene transitions, so
    // it can legitimately point to a node that is not in the current scene —
    // in that case we treat it as absent.
    const activeNodeId = this.#cy.scratch('activeNodeId') as NodeId | undefined;
    const activeInScene = activeNodeId
      && this.#cy.getElementById(activeNodeId as string).length > 0;
    const placementRef = activeInScene ? activeNodeId : this.#getCentralNodeId();

    if (!placementRef) {
      console.warn(`Cannot include node ${nodeId}: no placement reference (no active node and no central node)`);
      return 0;
    }

    const placementRefCyNode = this.#cy.getElementById(placementRef as string);
    if (placementRefCyNode.length === 0) {
      console.warn(`Placement reference ${placementRef} not in scene`);
      return 0;
    }

    // Calculate collision-free position near placement reference
    const refPos = placementRefCyNode.position();
    const refBBox = placementRefCyNode.boundingBox();
    const refHalfSize = Math.max(refBBox.w, refBBox.h) / 2;
    const childHalfSize = 60; // default half-size for included node
    const margin = 20;
    const minRadius = refHalfSize + childHalfSize + margin;

    const existingPositions = this.#cy.nodes().map(n => n.position());
    const positions = circularSpreadSafe(refPos, 1, existingPositions, minRadius);

    if (positions.length === 0) {
      console.warn(`No valid position found for including node ${nodeId}`);
      return 0;
    }

    // Include the node in scene (handles design, stylesheet, cy.add)
    await this.includeNode(nodeId, positions[0], design);

    // Connect node to its placement reference. Reuse an existing graph edge
    // between the two endpoints if present; otherwise create a new one.
    const existingEdge = graphStore.edges.find(e =>
      (e.sourceId === nodeId && e.targetId === placementRef) ||
      (e.sourceId === placementRef && e.targetId === nodeId)
    );

    if (existingEdge && this.#cy.getElementById(existingEdge.id as string).length === 0) {
      this.#cy.add({
        group: 'edges',
        data: {
          ...existingEdge,
          source: existingEdge.sourceId,
          target: existingEdge.targetId,
          design: { id: 'default', params: {} }
        }
      });
      if (isDebug('d_scene')) console.log(`Scene: Reused existing edge ${existingEdge.id} (${existingEdge.sourceId} ↔ ${existingEdge.targetId})`);
      return 1;
    }

    const edgeId = `e${Date.now()}` as EdgeId;
    this.#cy.add({
      group: 'edges',
      data: {
        id: edgeId,
        title: '',
        sourceId: placementRef,
        targetId: nodeId,
        source: placementRef,
        target: nodeId,
        tags: [],
        properties: {},
        design: { id: 'default', params: {} },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    if (isDebug('d_scene')) console.log(`Scene: Created new edge ${placementRef} → ${nodeId}`);
    return 1;
  }
}
