/**
 * Full Path Generator
 *
 * Orders every scene in the workspace into one sequence, so an author can walk
 * the whole collection and confirm nothing was forgotten (paths-architecture §16).
 *
 * **Traverses the graph, not scene membership.** A scene is a curated view: it
 * need not contain every edge that exists between its nodes, so scene membership
 * is not a sound model of connectivity. Scenes are also reachable outside
 * transitions (via the node manager), so scene adjacency is not the only
 * navigation relation either. The traversal therefore runs over nodes and edges,
 * and scenes are applied only as a filter at the end.
 *
 * **Completeness is structural, not incidental.** The traversal produces a
 * readable order; the final sweep guarantees coverage. Postcondition:
 * `result.length === scenes.length`. That guarantee is what makes the output
 * usable as an audit instrument rather than merely a nice tour.
 *
 * Pure — no Cytoscape, no store access. Callers supply the data.
 */

import type { Edge, Node, NodeId, Scene, SceneId } from '../../core/main-types';

/**
 * Build a sequence covering every scene in the workspace.
 *
 * @param nodes All graph nodes.
 * @param edges All graph edges.
 * @param scenes All scenes.
 * @param rootNodeId Preferred starting node. Falls back to the oldest node when
 *   null or absent from the graph.
 * @returns Scene ids, every scene exactly once.
 */
export function generateFullPath(
  nodes: Node[],
  edges: Edge[],
  scenes: Scene[],
  rootNodeId: NodeId | null
): SceneId[] {
  if (scenes.length === 0) return [];

  const sceneByCentralNode = indexScenesByCentralNode(scenes);
  const adjacency = buildAdjacency(nodes, edges);
  const orderedNodeIds = depthFirstOrder(nodes, adjacency, rootNodeId);

  const result: SceneId[] = [];
  const included = new Set<SceneId>();

  // Nodes in traversal order, keeping only those that own a scene. A node
  // without a scene is a legitimate leaf the author never drilled into, not an
  // omission to report.
  for (const nodeId of orderedNodeIds) {
    const sceneId = sceneByCentralNode.get(nodeId);
    if (sceneId === undefined || included.has(sceneId)) continue;
    result.push(sceneId);
    included.add(sceneId);
  }

  // Coverage sweep: append anything the traversal could not reach — a scene
  // whose central node was deleted from the graph, or is otherwise unreachable.
  // Without this the result would depend on the traversal being exhaustive.
  for (const scene of scenes) {
    if (included.has(scene.id)) continue;
    result.push(scene.id);
    included.add(scene.id);
  }

  return result;
}

/** Scene lookup by the node each scene is built around. */
function indexScenesByCentralNode(scenes: Scene[]): Map<NodeId, SceneId> {
  const index = new Map<NodeId, SceneId>();
  for (const scene of scenes) {
    // First scene wins if several claim one central node — a data defect, but
    // the traversal must stay deterministic in its presence.
    if (!index.has(scene.centralNodeId)) {
      index.set(scene.centralNodeId, scene.id);
    }
  }
  return index;
}

/**
 * Neighbours of each node, outgoing before incoming.
 *
 * Direction shapes readability, not coverage: following `source → target` first
 * tends to descend from general to specific in a hand-built knowledge graph,
 * which reads as parent-before-child. Incoming edges are then followed so that
 * nothing in a weakly-connected component is missed.
 */
function buildAdjacency(nodes: Node[], edges: Edge[]): Map<NodeId, NodeId[]> {
  const outgoing = new Map<NodeId, NodeId[]>();
  const incoming = new Map<NodeId, NodeId[]>();
  const known = new Set<NodeId>(nodes.map(node => node.id));

  for (const edge of edges) {
    // Skip edges that dangle after a partial delete, and self-loops (which can
    // only add a node already on the stack).
    if (!known.has(edge.sourceId) || !known.has(edge.targetId)) continue;
    if (edge.sourceId === edge.targetId) continue;

    pushInto(outgoing, edge.sourceId, edge.targetId);
    pushInto(incoming, edge.targetId, edge.sourceId);
  }

  const order = nodeOrderIndex(nodes);
  const adjacency = new Map<NodeId, NodeId[]>();

  for (const node of nodes) {
    const out = sortByCreation(outgoing.get(node.id) ?? [], order);
    const inc = sortByCreation(incoming.get(node.id) ?? [], order);
    adjacency.set(node.id, dedupe([...out, ...inc]));
  }

  return adjacency;
}

/**
 * Depth-first order over the whole graph.
 *
 * Restarts at the oldest unvisited node whenever a component is exhausted, so
 * disconnected components are all covered.
 */
function depthFirstOrder(
  nodes: Node[],
  adjacency: Map<NodeId, NodeId[]>,
  rootNodeId: NodeId | null
): NodeId[] {
  const order = nodeOrderIndex(nodes);
  const byCreation = [...nodes].sort((a, b) => compareCreation(a.id, b.id, order));

  const visited = new Set<NodeId>();
  const result: NodeId[] = [];

  const roots: NodeId[] = [];
  if (rootNodeId !== null && order.has(rootNodeId)) roots.push(rootNodeId);
  for (const node of byCreation) roots.push(node.id);

  for (const root of roots) {
    if (visited.has(root)) continue;
    visitComponent(root, adjacency, visited, result);
  }

  return result;
}

/**
 * Iterative depth-first walk from one root.
 *
 * Iterative rather than recursive: a chain of a few thousand nodes would risk a
 * stack overflow, and the workspaces this feature exists for are large.
 * Neighbours are pushed in reverse so the stack pops them in adjacency order.
 */
function visitComponent(
  root: NodeId,
  adjacency: Map<NodeId, NodeId[]>,
  visited: Set<NodeId>,
  result: NodeId[]
): void {
  const stack: NodeId[] = [root];

  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (visited.has(nodeId)) continue;

    visited.add(nodeId);
    result.push(nodeId);

    const neighbours = adjacency.get(nodeId) ?? [];
    for (let i = neighbours.length - 1; i >= 0; i--) {
      if (!visited.has(neighbours[i])) {
        stack.push(neighbours[i]);
      }
    }
  }
}

/**
 * Position of each node in creation order.
 *
 * Node `createdAt` rather than edge `createdAt`: every node carries one, whereas
 * edge timestamps are absent on some imported graphs. Array position is the
 * tie-break, so nodes with equal or missing timestamps still order consistently
 * across runs — a regenerated path must match the previous one if the graph has
 * not changed.
 */
function nodeOrderIndex(nodes: Node[]): Map<NodeId, { time: number; seq: number }> {
  const index = new Map<NodeId, { time: number; seq: number }>();
  nodes.forEach((node, seq) => {
    const time = node.createdAt ? new Date(node.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
    index.set(node.id, { time: Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time, seq });
  });
  return index;
}

function compareCreation(
  a: NodeId,
  b: NodeId,
  order: Map<NodeId, { time: number; seq: number }>
): number {
  const left = order.get(a);
  const right = order.get(b);
  if (!left || !right) return 0;
  if (left.time !== right.time) return left.time - right.time;
  return left.seq - right.seq;
}

function sortByCreation(
  nodeIds: NodeId[],
  order: Map<NodeId, { time: number; seq: number }>
): NodeId[] {
  return [...nodeIds].sort((a, b) => compareCreation(a, b, order));
}

function pushInto(map: Map<NodeId, NodeId[]>, key: NodeId, value: NodeId): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  map.set(key, [value]);
}

function dedupe(nodeIds: NodeId[]): NodeId[] {
  return [...new Set(nodeIds)];
}
