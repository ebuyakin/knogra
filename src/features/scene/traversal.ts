/**
 * Scene Traversal Utilities
 * Pure functions for analyzing node connectivity and relationships within a scene
 */

import type { NodeId, Edge, EdgeConnection } from '../../core/main-types';

/**
 * Find all descendants of a node via BFS traversal
 * Only includes descendants that are currently in the scene
 * 
 * @param nodeId - Starting node
 * @param allEdges - All edges in the database
 * @param nodesInScene - Set of node IDs currently in the scene
 * @returns Set of descendant node IDs
 */
export function findDescendants(
  nodeId: NodeId,
  allEdges: Edge[],
  nodesInScene: Set<NodeId>
): Set<NodeId> {
  const descendants = new Set<NodeId>();
  const queue: NodeId[] = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const edgesFromCurrent = allEdges.filter(e => e.sourceId === current);

    for (const edge of edgesFromCurrent) {
      const childId = edge.targetId;
      const inScene = nodesInScene.has(childId);
      const alreadyProcessed = descendants.has(childId);
      
      // Exclude the root node itself (handles cycles back to root)
      if (inScene && !alreadyProcessed && childId !== nodeId) {
        descendants.add(childId);
        queue.push(childId);
      }
    }
  }

  return descendants;
}

/**
 * Check if a node has connections to nodes outside a given set
 * 
 * @param nodeId - Node to check
 * @param excludeSet - Set of nodes to exclude (consider as "inside")
 * @param edgesInScene - Edges currently in the scene
 * @returns True if node has connections to nodes outside excludeSet
 */
export function hasConnectionsOutside(
  nodeId: NodeId,
  excludeSet: Set<NodeId>,
  edgesInScene: EdgeConnection[]
): boolean {
  // Find all edges connected to this node
  const connectedEdges = edgesInScene.filter(
    edge => edge.source === nodeId || edge.target === nodeId
  );

  // Check if any edge connects to a node outside excludeSet
  for (const edge of connectedEdges) {
    // Determine which node is the "other" end of this edge
    const otherNodeId = (edge.source === nodeId) ? edge.target : edge.source;
    
    // If the other node is outside the excludeSet, this node has external connections
    if (!excludeSet.has(otherNodeId)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a node has connections to any node in a given set
 * 
 * @param nodeId - Node to check
 * @param targetSet - Set of target nodes to check for connections
 * @param edgesInScene - Edges currently in the scene
 * @returns True if node connects to any node in targetSet
 */
export function hasConnectionsTo(
  nodeId: NodeId,
  targetSet: Set<NodeId>,
  edgesInScene: EdgeConnection[]
): boolean {
  // Find all edges connected to this node
  const connectedEdges = edgesInScene.filter(
    edge => edge.source === nodeId || edge.target === nodeId
  );
  
  for (const edge of connectedEdges) {
    // Determine which node is the "other" end
    const otherNodeId = (edge.source === nodeId) ? edge.target : edge.source;
    
    // Check if the other node is in the target set
    if (targetSet.has(otherNodeId)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Determine which descendants should be kept when collapsing a parent node
 * Uses iterative algorithm:
 * 1. Keep descendants with direct external connections
 * 2. Iteratively keep descendants connected to kept nodes
 * 
 * @param descendants - Set of all descendant nodes
 * @param excludeSet - Set containing parent + descendants (the subtree)
 * @param edgesInScene - Edges currently in the scene
 * @returns Set of descendant node IDs that should be kept
 */
export function determineNodesToKeep(
  descendants: Set<NodeId>,
  excludeSet: Set<NodeId>,
  edgesInScene: EdgeConnection[]
): Set<NodeId> {
  const nodesToKeep = new Set<NodeId>();

  // Step 1: Find descendants with direct external connections
  for (const descId of descendants) {
    if (hasConnectionsOutside(descId, excludeSet, edgesInScene)) {
      nodesToKeep.add(descId);
    }
  }

  // Step 2: Iteratively keep descendants connected to kept nodes
  let changed = true;
  while (changed) {
    changed = false;
    for (const descId of descendants) {
      if (!nodesToKeep.has(descId)) {
        // Check if connected to any kept node
        if (hasConnectionsTo(descId, nodesToKeep, edgesInScene)) {
          nodesToKeep.add(descId);
          changed = true;
        }
      }
    }
  }

  return nodesToKeep;
}
