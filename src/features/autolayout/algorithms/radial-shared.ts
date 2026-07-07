/**
 * Radial-family shared helpers
 *
 * Reusable building blocks for radial layout algorithms: a BFS spanning forest
 * rooted at the central node, leaf-weight computation, angular-wedge allocation,
 * and the footprint radius. A new radial variant (e.g. equal sectors) reuses
 * these and swaps only the rule it cares about.
 *
 * See `docs/autolayout-architecture.md` §4.1–§4.2.
 */

import type { NodeId } from '../../../core/main-types';
import type { LayoutInputNode, LayoutInputEdge } from './types';

export interface TreeNode {
  id: NodeId;
  depth: number;
  children: TreeNode[];
  leafWeight: number;
  /** Half-diagonal of the node's footprint. */
  footprintRadius: number;
  angleStart: number;
  angleEnd: number;
}

export function footprintRadius(footprint: { width: number; height: number }): number {
  return Math.sqrt((footprint.width / 2) ** 2 + (footprint.height / 2) ** 2);
}

/**
 * BFS spanning tree rooted at the central node. Every non-central node gets a
 * single parent (its BFS predecessor); non-tree edges are ignored for
 * placement. Disconnected components are attached as depth-1 subtrees of the
 * centre so each still receives its own wedge.
 */
export function buildSpanningForest(
  nodes: LayoutInputNode[],
  edges: LayoutInputEdge[],
  centralId: NodeId,
  nodeById: Map<NodeId, LayoutInputNode>
): TreeNode {
  const adjacency = new Map<NodeId, NodeId[]>();
  for (const node of nodes) adjacency.set(node.id, []);

  for (const edge of [...edges].sort((left, right) => left.order - right.order)) {
    if (edge.sourceId === edge.targetId) continue;
    if (!adjacency.has(edge.sourceId) || !adjacency.has(edge.targetId)) continue;
    adjacency.get(edge.sourceId)!.push(edge.targetId);
    adjacency.get(edge.targetId)!.push(edge.sourceId);
  }

  const makeTreeNode = (id: NodeId, depth: number): TreeNode => ({
    id,
    depth,
    children: [],
    leafWeight: 0,
    footprintRadius: footprintRadius(nodeById.get(id)!.footprint),
    angleStart: 0,
    angleEnd: 0,
  });

  const visited = new Set<NodeId>();
  const growSubtree = (subtreeRoot: TreeNode): void => {
    const queue: TreeNode[] = [subtreeRoot];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighborId of adjacency.get(current.id) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const child = makeTreeNode(neighborId, current.depth + 1);
        current.children.push(child);
        queue.push(child);
      }
    }
  };

  const root = makeTreeNode(centralId, 0);
  visited.add(centralId);
  growSubtree(root);

  // Attach any node not reachable from the centre as its own depth-1 subtree.
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    const componentRoot = makeTreeNode(node.id, 1);
    root.children.push(componentRoot);
    growSubtree(componentRoot);
  }

  return root;
}

/** Post-order: a leaf weighs 1, an internal node weighs the sum of its leaves. */
export function computeLeafWeights(node: TreeNode): number {
  if (node.children.length === 0) {
    node.leafWeight = 1;
    return 1;
  }
  let sum = 0;
  for (const child of node.children) sum += computeLeafWeights(child);
  node.leafWeight = sum;
  return sum;
}

/** Subdivide each node's angular wedge among its children by leaf weight. */
export function assignAngles(node: TreeNode, start: number, end: number): void {
  node.angleStart = start;
  node.angleEnd = end;
  if (node.children.length === 0) return;

  const totalWeight = node.children.reduce((sum, child) => sum + child.leafWeight, 0) || 1;
  const span = end - start;
  let cursor = start;
  for (const child of node.children) {
    const childSpan = span * (child.leafWeight / totalWeight);
    assignAngles(child, cursor, cursor + childSpan);
    cursor += childSpan;
  }
}
