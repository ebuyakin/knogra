/**
 * Element Classifier
 *
 * Pure functions for analyzing and classifying scene elements during transitions.
 * Determines which nodes and edges are departing, shared, or arriving between scenes,
 * first by inclusion and then by fold visibility; what the fold pass needs from
 * the instance comes in through `InstanceView`, so the module never touches cy.
 * Debug logging behind `d_fold` is the one side effect, kept because the
 * reclassification is where fold bugs have been found.
 */

import type { NodeId, EdgeId, Scene } from '../../core/main-types';
import type { EdgeCollection } from 'cytoscape';
import { isDebug } from '../../config/debug-flags';

// ============================================================================
// TYPES
// ============================================================================

interface Position {
  x: number;
  y: number;
}

/** Elements classified for transition */
export interface TransitionElements {
  departingNodes: NodeId[];
  sharedNodes: NodeId[];
  arrivingNodes: NodeId[];
  departingEdges: EdgeId[];
  sharedEdges: EdgeId[];
  arrivingEdges: EdgeId[];
}

/** Target positions for nodes in new scene */
export type TargetPositions = Record<NodeId, Position>;

// ============================================================================
// CLASSIFICATION FUNCTIONS
// ============================================================================

/**
 * Build set of all hidden node IDs from a scene's fold state.
 * Used to exclude folded nodes from animation sequences and classification.
 * Handles both new format (FoldedNodeEntry) and legacy (plain string) formats.
 */
export function getHiddenNodeIds(scene: Scene): Set<NodeId> {
  const hidden = new Set<NodeId>();
  if (!scene.foldedNodes) return hidden;
  for (const entries of Object.values(scene.foldedNodes)) {
    for (const entry of entries) {
      const id = typeof entry === 'string' ? entry as NodeId : entry.id;
      hidden.add(id);
    }
  }
  return hidden;
}

/**
 * Classify elements between old and new scenes.
 *
 * Nodes:
 * - Departing: in oldScene but not in newScene
 * - Shared: in both scenes
 * - Arriving: in newScene but not in oldScene
 *
 * Edges:
 * - Departing: connects to departing node OR between shared nodes but not in newScene
 * - Shared: in newScene and currently in Cytoscape
 * - Arriving: in newScene but not currently in Cytoscape
 */
export function classifyElements(
  oldScene: Scene,
  newScene: Scene,
  cyEdges: EdgeCollection
): TransitionElements {
  const oldNodeIds = new Set(Object.keys(oldScene.nodes));
  const newNodeIds = new Set(Object.keys(newScene.nodes));
  const newEdgeIds = new Set(Object.keys(newScene.edges));

  const departingNodes: NodeId[] = [];
  const sharedNodes: NodeId[] = [];
  const arrivingNodes: NodeId[] = [];

  // Classify nodes
  for (const nodeId of oldNodeIds) {
    if (newNodeIds.has(nodeId)) {
      sharedNodes.push(nodeId);
    } else {
      departingNodes.push(nodeId);
    }
  }
  for (const nodeId of newNodeIds) {
    if (!oldNodeIds.has(nodeId)) {
      arrivingNodes.push(nodeId);
    }
  }

  // Classify edges currently in Cytoscape
  const departingEdges: EdgeId[] = [];
  const sharedEdges: EdgeId[] = [];
  const departingNodeSet = new Set(departingNodes);

  cyEdges.forEach(edge => {
    const edgeId = edge.id() as EdgeId;
    const sourceId = edge.source().id() as NodeId;
    const targetId = edge.target().id() as NodeId;

    // Edge departs if:
    // 1. It connects to a departing node, OR
    // 2. It's between shared nodes but NOT in the new scene
    if (departingNodeSet.has(sourceId) || departingNodeSet.has(targetId)) {
      departingEdges.push(edgeId);
    } else if (!newEdgeIds.has(edgeId)) {
      // Edge between shared nodes but not in new scene → departing
      departingEdges.push(edgeId);
    } else {
      // Edge is in new scene → shared
      sharedEdges.push(edgeId);
    }
  });

  // Find arriving edges: edges in newScene.edges that are not currently in Cytoscape
  const arrivingEdges: EdgeId[] = [];
  const currentEdgeIds = new Set(cyEdges.map(e => e.id()));

  for (const edgeId of Object.keys(newScene.edges) as EdgeId[]) {
    if (!currentEdgeIds.has(edgeId)) {
      arrivingEdges.push(edgeId);
    }
  }

  return {
    departingNodes,
    sharedNodes,
    arrivingNodes,
    departingEdges,
    sharedEdges,
    arrivingEdges
  };
}

/**
 * Build target positions and scales from scene.
 * Extracts the target state that elements should transition to.
 */
export function buildTargetPositions(scene: Scene): {
  positions: TargetPositions;
  scales: Record<NodeId, number>;
} {
  const positions: TargetPositions = {};
  const scales: Record<NodeId, number> = {};

  for (const [nodeId, nodeData] of Object.entries(scene.nodes)) {
    // Clone so Cytoscape's in-place mutation of position objects during animation
    // can't corrupt graphStore.scenes[i].nodes[id].position. See snapshot 2026-05-14.
    positions[nodeId as NodeId] = { x: nodeData.position.x, y: nodeData.position.y };
    if (nodeData.scale !== undefined) {
      scales[nodeId as NodeId] = nodeData.scale;
    }
  }

  return { positions, scales };
}

// ============================================================================
// FOLD-AWARE RECLASSIFICATION
// ============================================================================

/**
 * What reclassification needs from the instance, without touching it: an
 * edge's endpoints, from the instance when the edge is drawn and from the
 * store otherwise, and whether a node is drawn at all (a debug detail).
 */
export interface InstanceView {
  endpointsOf(edgeId: EdgeId): [NodeId, NodeId] | null;
  isPresent(nodeId: NodeId): boolean;
}

/** Whether either scene folds anything; when neither does, classification by inclusion is the whole story. */
export function foldsDiffer(currentScene: Scene, targetScene: Scene): boolean {
  return getHiddenNodeIds(currentScene).size > 0 || getHiddenNodeIds(targetScene).size > 0;
}

/**
 * Reclassify by fold visibility, not just inclusion. A node's animation role
 * depends on its visibility in source AND target:
 *   visible→visible  = shared (morph)
 *   visible→hidden   = departing (fly out; FoldStateHandler re-adds hidden)
 *   hidden→visible   = arriving (fly in)
 *   hidden→hidden    = silent (FoldStateHandler handles)
 *   hidden→absent    = silent (remove from cy without animation)
 *   absent→hidden    = silent (FoldStateHandler adds hidden)
 * Edges follow their endpoints: when a node is reclassified shared→arriving or
 * shared→departing, its edges in sharedEdges move with it so they animate in
 * or out instead of being orphaned; without this, edges touching a
 * newly-arriving node are stranded in sharedEdges and silently dropped from
 * cy by stowaway removal, corrupting scene.edges on the next save.
 * Mutates `elements` in place.
 */
export function reclassifyForFold(elements: TransitionElements, currentScene: Scene, targetScene: Scene, view: InstanceView): void {
  const hiddenInSource = getHiddenNodeIds(currentScene);
  const hiddenInTarget = getHiddenNodeIds(targetScene);
  if (isDebug('d_fold')) {
    console.log(`[d_fold] Hidden in source (${currentScene.id}):`, [...hiddenInSource]);
    console.log(`[d_fold] Hidden in target (${targetScene.id}):`, [...hiddenInTarget]);
    console.log(`[d_fold] Pre-reclassify — shared: ${elements.sharedNodes.length}, departing: ${elements.departingNodes.length}, arriving: ${elements.arrivingNodes.length}`);
  }

  // Reclassify shared nodes
  const reclassifiedShared: NodeId[] = [];
  for (const id of elements.sharedNodes) {
    const hidSrc = hiddenInSource.has(id);
    const hidTgt = hiddenInTarget.has(id);
    if (!hidSrc && !hidTgt) {
      reclassifiedShared.push(id);
      if (isDebug('d_fold')) console.log(`[d_fold]   ${id}: visible→visible (shared)`);
    }
    else if (!hidSrc && hidTgt) {
      elements.departingNodes.push(id);
      if (isDebug('d_fold')) console.log(`[d_fold]   ${id}: visible→hidden (→departing)`);
    }
    else if (hidSrc && !hidTgt) {
      elements.arrivingNodes.push(id);
      if (isDebug('d_fold')) console.log(`[d_fold]   ${id}: hidden→visible (→arriving), in cy: ${view.isPresent(id)}`);
    }
    else {
      if (isDebug('d_fold')) console.log(`[d_fold]   ${id}: hidden→hidden (silent)`);
    }
  }
  elements.sharedNodes = reclassifiedShared;

  // Remove hidden departing nodes (hidden→absent: silent cy removal, no animation)
  elements.departingNodes = elements.departingNodes.filter(id => !hiddenInSource.has(id));

  // Remove hidden arriving nodes (absent→hidden: FoldStateHandler handles)
  elements.arrivingNodes = elements.arrivingNodes.filter(id => !hiddenInTarget.has(id));

  if (isDebug('d_fold')) {
    console.log(`[d_fold] Post-reclassify — shared: ${elements.sharedNodes.length}, departing: ${elements.departingNodes.length}, arriving: ${elements.arrivingNodes.length}`);
    console.log(`[d_fold]   departing:`, elements.departingNodes);
    console.log(`[d_fold]   arriving:`, elements.arrivingNodes);
  }

  // Edges follow their endpoints. Departing wins over arriving: an edge between
  // a departing and an arriving node should fade out (the departing endpoint
  // disappears first).
  const arrivingNodeSet = new Set(elements.arrivingNodes);
  const departingNodeSet = new Set(elements.departingNodes);
  const stillSharedEdges: EdgeId[] = [];
  for (const edgeId of elements.sharedEdges) {
    const endpoints = view.endpointsOf(edgeId);
    if (!endpoints) continue;
    const [src, tgt] = endpoints;
    if (departingNodeSet.has(src) || departingNodeSet.has(tgt)) {
      elements.departingEdges.push(edgeId);
      if (isDebug('d_fold')) console.log(`[d_fold]   edge ${edgeId}: shared→departing`);
    } else if (arrivingNodeSet.has(src) || arrivingNodeSet.has(tgt)) {
      elements.arrivingEdges.push(edgeId);
      if (isDebug('d_fold')) console.log(`[d_fold]   edge ${edgeId}: shared→arriving`);
    } else {
      stillSharedEdges.push(edgeId);
    }
  }
  elements.sharedEdges = stillSharedEdges;
}

/** Keep only the edges whose both endpoints are in an animated category; the rest are the fold handler's. Mutates `elements` in place. */
export function keepAnimatedEdges(elements: TransitionElements, view: InstanceView): void {
  const animatedNodes = new Set([
    ...elements.departingNodes, ...elements.sharedNodes, ...elements.arrivingNodes
  ]);
  const isEdgeAnimated = (edgeId: EdgeId): boolean => {
    const endpoints = view.endpointsOf(edgeId);
    if (!endpoints) return false;
    return animatedNodes.has(endpoints[0]) && animatedNodes.has(endpoints[1]);
  };
  elements.departingEdges = elements.departingEdges.filter(isEdgeAnimated);
  elements.sharedEdges = elements.sharedEdges.filter(isEdgeAnimated);
  elements.arrivingEdges = elements.arrivingEdges.filter(isEdgeAnimated);
}
