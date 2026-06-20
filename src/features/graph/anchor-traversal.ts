import type { Edge, Node, NodeId } from '../../core/main-types';

export type AnchorLinkResult =
  | { status: 'linked'; nodeIds: NodeId[]; titles: string[] }
  | { status: 'no-anchor' }
  | { status: 'missing-target' }
  | { status: 'disconnected'; anchorTitle: string; targetTitle: string };

export interface AnchorTraversal {
  anchorNode: Node;
  nodesById: Map<NodeId, Node>;
  previous: Map<NodeId, NodeId | null>;
  distances: Map<NodeId, number>;
}

export function getAnchorDistances(nodes: Node[], edges: Edge[]): Map<NodeId, number> {
  return getAnchorTraversal(nodes, edges)?.distances ?? new Map<NodeId, number>();
}

export function getLinkToAnchor(nodeId: NodeId, nodes: Node[], edges: Edge[]): AnchorLinkResult {
  const traversal = getAnchorTraversal(nodes, edges);
  const nodesById = traversal?.nodesById ?? new Map<NodeId, Node>(nodes.map(node => [node.id, node]));
  const targetNode = nodesById.get(nodeId);
  if (!targetNode) {
    return { status: 'missing-target' };
  }

  if (!traversal) {
    return { status: 'no-anchor' };
  }

  if (traversal.anchorNode.id === nodeId) {
    return { status: 'linked', nodeIds: [traversal.anchorNode.id], titles: [traversal.anchorNode.title] };
  }

  if (!traversal.previous.has(nodeId)) {
    return {
      status: 'disconnected',
      anchorTitle: traversal.anchorNode.title,
      targetTitle: targetNode.title
    };
  }

  const nodeIds: NodeId[] = [];
  let currentId: NodeId | null = nodeId;
  while (currentId) {
    nodeIds.push(currentId);
    currentId = traversal.previous.get(currentId) ?? null;
  }
  nodeIds.reverse();

  return {
    status: 'linked',
    nodeIds,
    titles: nodeIds.map(id => nodesById.get(id)?.title ?? id)
  };
}

export function getAnchorTraversal(nodes: Node[], edges: Edge[]): AnchorTraversal | null {
  const nodesById = new Map<NodeId, Node>(nodes.map(node => [node.id, node]));
  const anchorNode = nodes.find(node => node.isAnchor === true);
  if (!anchorNode) return null;

  const adjacency = buildUndirectedAdjacency(nodes, edges, nodesById);
  const queue: NodeId[] = [anchorNode.id];
  const previous = new Map<NodeId, NodeId | null>([[anchorNode.id, null]]);
  const distances = new Map<NodeId, number>([[anchorNode.id, 0]]);

  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index];
    const currentDistance = distances.get(currentId) ?? 0;

    for (const neighborId of adjacency.get(currentId) ?? []) {
      if (previous.has(neighborId)) continue;
      previous.set(neighborId, currentId);
      distances.set(neighborId, currentDistance + 1);
      queue.push(neighborId);
    }
  }

  return { anchorNode, nodesById, previous, distances };
}

function buildUndirectedAdjacency(
  nodes: Node[],
  edges: Edge[],
  nodesById: Map<NodeId, Node>
): Map<NodeId, NodeId[]> {
  const adjacency = new Map<NodeId, NodeId[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodesById.has(edge.sourceId) || !nodesById.has(edge.targetId)) continue;
    adjacency.get(edge.sourceId)?.push(edge.targetId);
    adjacency.get(edge.targetId)?.push(edge.sourceId);
  }

  for (const neighbors of adjacency.values()) {
    neighbors.sort((leftId, rightId) => {
      const leftTitle = nodesById.get(leftId)?.title ?? leftId;
      const rightTitle = nodesById.get(rightId)?.title ?? rightId;
      return leftTitle.localeCompare(rightTitle) || leftId.localeCompare(rightId);
    });
  }

  return adjacency;
}