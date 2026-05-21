/**
 * Scene Calculations
 * Pure functions for scene-level calculations (distances, positions, filtering)
 */

import type { NodeId } from '../../../core/main-types';

export interface Position {
  x: number;
  y: number;
}

/**
 * Calculate distance (number of edges) from root to each node using BFS
 * 
 * @pure No side effects
 * @param rootNodeId - Starting node for distance calculation
 * @param nodeIds - Nodes to calculate distances for
 * @param edges - All edges in the graph
 * @returns Map of nodeId → distance from root
 */
export function calculateDistances(
  rootNodeId: NodeId,
  nodeIds: NodeId[],
  edges: Array<{ sourceId: NodeId; targetId: NodeId }>
): Map<NodeId, number> {
  const distances = new Map<NodeId, number>();
  distances.set(rootNodeId, 0);
  
  let queue = [rootNodeId];
  let currentDistance = 0;
  
  while (queue.length > 0) {
    const nextQueue: NodeId[] = [];
    
    for (const nodeId of queue) {
      // Find children in the nodeIds set
      const children = edges
        .filter(e => e.sourceId === nodeId && nodeIds.includes(e.targetId))
        .map(e => e.targetId);
      
      for (const child of children) {
        if (!distances.has(child)) {
          distances.set(child, currentDistance + 1);
          nextQueue.push(child);
        }
      }
    }
    
    queue = nextQueue;
    currentDistance++;
  }
  
  return distances;
}

/**
 * Find maximum distance among a set of nodes
 * 
 * @pure No side effects
 * @param nodeIds - Nodes to check
 * @param distances - Map of nodeId → distance
 * @returns Maximum distance, or 0 if no nodes
 */
export function findMaxDistance(
  nodeIds: Iterable<NodeId>,
  distances: Map<NodeId, number>
): number {
  const distanceValues: number[] = [];
  
  for (const id of nodeIds) {
    const distance = distances.get(id) || 0;
    if (distance > 0) {
      distanceValues.push(distance);
    }
  }
  
  return distanceValues.length > 0 ? Math.max(...distanceValues) : 0;
}

/**
 * Filter nodes by their distance from root
 * 
 * @pure No side effects
 * @param nodeIds - Nodes to filter
 * @param distances - Map of nodeId → distance
 * @param targetDistance - Distance to filter by
 * @returns Nodes at the target distance
 */
export function filterNodesByDistance(
  nodeIds: Iterable<NodeId>,
  distances: Map<NodeId, number>,
  targetDistance: number
): NodeId[] {
  const result: NodeId[] = [];
  
  for (const id of nodeIds) {
    if (distances.get(id) === targetDistance) {
      result.push(id);
    }
  }
  
  return result;
}

/**
 * Find leaf nodes (nodes with no children in the given set)
 * 
 * @pure No side effects
 * @param nodeIds - Nodes to check
 * @param edges - All edges in the graph
 * @param nodeSet - Set of nodes to consider as potential children
 * @returns Nodes that have no children in nodeSet
 */
export function findLeafNodes(
  nodeIds: NodeId[],
  edges: Array<{ sourceId: NodeId; targetId: NodeId }>,
  nodeSet: Set<NodeId>
): NodeId[] {
  return nodeIds.filter(nodeId => {
    const hasChildInSet = edges.some(e => 
      e.sourceId === nodeId && nodeSet.has(e.targetId)
    );
    return !hasChildInSet;
  });
}

/**
 * Find direct children of a node
 * 
 * @pure No side effects
 * @param parentId - Parent node ID
 * @param edges - All edges in the graph
 * @returns Array of child node IDs
 */
export function findDirectChildren(
  parentId: NodeId,
  edges: Array<{ sourceId: NodeId; targetId: NodeId }>
): NodeId[] {
  return edges
    .filter(edge => edge.sourceId === parentId)
    .map(edge => edge.targetId);
}

/**
 * Find direct parents of a node
 * 
 * @pure No side effects
 * @param childId - Child node ID
 * @param edges - All edges in the graph
 * @returns Array of parent node IDs
 */
export function findDirectParents(
  childId: NodeId,
  edges: Array<{ sourceId: NodeId; targetId: NodeId }>
): NodeId[] {
  return edges
    .filter(edge => edge.targetId === childId)
    .map(edge => edge.sourceId);
}

/**
 * Find all directly connected nodes (both parents and children)
 * 
 * @pure No side effects
 * @param nodeId - Node ID
 * @param edges - All edges in the graph
 * @returns Array of connected node IDs (no duplicates)
 */
export function findDirectlyConnected(
  nodeId: NodeId,
  edges: Array<{ sourceId: NodeId; targetId: NodeId }>
): NodeId[] {
  const children = findDirectChildren(nodeId, edges);
  const parents = findDirectParents(nodeId, edges);
  return [...new Set([...children, ...parents])];
}

/**
 * Map an array of positions to node IDs
 * 
 * @pure No side effects
 * @param nodeIds - Array of node IDs
 * @param positions - Array of positions (same length as nodeIds)
 * @returns Map of nodeId → position
 */
export function mapPositionsToNodes(
  nodeIds: NodeId[],
  positions: Position[]
): Map<NodeId, Position> {
  const map = new Map<NodeId, Position>();
  
  nodeIds.forEach((nodeId, index) => {
    if (index < positions.length) {
      map.set(nodeId, positions[index]);
    }
  });
  
  return map;
}

/**
 * Find edges relevant to a set of nodes
 * Returns edges where:
 * - At least one endpoint is in the specified nodeIds
 * - Both endpoints are in the scene
 * - Edge is not already in the scene
 * 
 * @pure No side effects
 * @param nodeIds - Nodes to find edges for (newly added nodes)
 * @param nodesInScene - All nodes currently in scene
 * @param allEdges - All edges in the graph
 * @param edgesInScene - Edges already in scene
 * @returns Edges that should be added to scene
 */
export function findRelevantEdges<T extends { id: string; sourceId: NodeId; targetId: NodeId }>(
  nodeIds: NodeId[],
  nodesInScene: Set<NodeId>,
  allEdges: T[],
  edgesInScene: Set<string>
): T[] {
  return allEdges.filter(edge => {
    // Edge must involve at least one of the specified nodes
    const involvesTargetNode = 
      nodeIds.includes(edge.sourceId) || 
      nodeIds.includes(edge.targetId);
    
    // Both endpoints must be in scene
    const bothInScene = 
      nodesInScene.has(edge.sourceId) && 
      nodesInScene.has(edge.targetId);
    
    // Edge must not already be in scene
    const notAlreadyAdded = !edgesInScene.has(edge.id);
    
    return involvesTargetNode && bothInScene && notAlreadyAdded;
  });
}
