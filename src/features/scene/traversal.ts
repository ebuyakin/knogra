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

/**
 * Build an undirected adjacency map from the scene edges, restricted to nodes
 * that are actually present in the scene.
 */
function buildUndirectedAdjacency(
  edgesInScene: EdgeConnection[],
  nodesInScene: Set<NodeId>
): Map<NodeId, NodeId[]> {
  const adjacency = new Map<NodeId, NodeId[]>();
  for (const { source, target } of edgesInScene) {
    if (!nodesInScene.has(source) || !nodesInScene.has(target)) continue;
    if (!adjacency.has(source)) adjacency.set(source, []);
    if (!adjacency.has(target)) adjacency.set(target, []);
    adjacency.get(source)!.push(target);
    adjacency.get(target)!.push(source);
  }
  return adjacency;
}

/**
 * Undirected reachability (BFS) from a start node. A single node id may be
 * `blocked` — the traversal never enters it, which lets callers ask "what is
 * still reachable if this node were removed?".
 */
function undirectedReach(
  start: NodeId,
  adjacency: Map<NodeId, NodeId[]>,
  blocked: NodeId | null
): Set<NodeId> {
  const visited = new Set<NodeId>([start]);
  const queue: NodeId[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbour of adjacency.get(current) ?? []) {
      if (neighbour === blocked || visited.has(neighbour)) continue;
      visited.add(neighbour);
      queue.push(neighbour);
    }
  }
  return visited;
}

/**
 * Compute the "private neighbourhood" of a node for the Exclude-neighbours
 * command: every node that is held in the scene *only* through the collapsing
 * node. Traversal is undirected, so both upstream and downstream branches are
 * considered — unlike descendant collapse.
 *
 * A node N is returned iff:
 *   1. N is reachable from the collapsing node (undirected), and
 *   2. once the collapsing node is removed, N is no longer connected to the
 *      central (anchor) node.
 *
 * The collapsing node, the central node, and any node not reachable from the
 * collapsing node are never included. When the collapsing node *is* the central
 * node there is no anchor, so every node connected to it is returned.
 */
export function findPrivateNeighbourhood(
  collapsingNodeId: NodeId,
  centralNodeId: NodeId,
  edgesInScene: EdgeConnection[],
  nodesInScene: Set<NodeId>
): Set<NodeId> {
  const adjacency = buildUndirectedAdjacency(edgesInScene, nodesInScene);

  const reachableFromCollapsing = undirectedReach(collapsingNodeId, adjacency, null);
  const anchorComponent = collapsingNodeId === centralNodeId
    ? new Set<NodeId>()
    : undirectedReach(centralNodeId, adjacency, collapsingNodeId);

  const result = new Set<NodeId>();
  for (const nodeId of reachableFromCollapsing) {
    if (nodeId === collapsingNodeId || nodeId === centralNodeId) continue;
    if (!anchorComponent.has(nodeId)) result.add(nodeId);
  }
  return result;
}
