/**
 * Element Classifier
 *
 * Pure functions for analyzing and classifying scene elements during transitions.
 * Determines which nodes and edges are departing, shared, or arriving between scenes.
 * Also provides fold-state utilities for excluding hidden nodes from classification.
 */

import type { NodeId, EdgeId, Scene } from '../../core/main-types';
import type { EdgeCollection } from 'cytoscape';

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
