/**
 * Auto-layout geometry
 *
 * Recursive angular sector allocation over a BFS spanning tree rooted at the
 * scene's central node. Each subtree is confined to its parent's angular wedge
 * (sized proportionally to the subtree's leaf count), which keeps children near
 * their parent and edges short — a greedy proxy for total-edge-length
 * minimisation, not an exact solver.
 *
 * Intentionally forked (2026-07-05) from `src/storage/mermaid/layout.ts`. The
 * two are kept parallel but independent: the importer *estimates* node
 * footprints from title text (nodes do not exist yet), whereas auto-layout is
 * fed the *real* rendered footprints of live nodes and adds sector allocation.
 * If they ever converge, extract a shared geometry core deliberately.
 */

import type { NodeId } from '../../core/main-types';

export interface Position {
  x: number;
  y: number;
}

export interface LayoutInputNode {
  id: NodeId;
  footprint: { width: number; height: number };
}

export interface LayoutInputEdge {
  sourceId: NodeId;
  targetId: NodeId;
  order: number;
}

export interface RadialSectorParams {
  /** Base radial distance between consecutive depth rings (px). */
  ringSpacing: number;
  /** Minimum gap enforced between sibling nodes on the same ring (px). */
  siblingGap: number;
}

interface TreeNode {
  id: NodeId;
  depth: number;
  children: TreeNode[];
  leafWeight: number;
  /** Half-diagonal of the node's footprint. */
  footprintRadius: number;
  angleStart: number;
  angleEnd: number;
}

/**
 * Compute node positions relative to the central node, which is placed at the
 * origin (0, 0). Callers offset the whole map by the central node's current
 * position so the scene does not jump.
 */
export function computeRadialSectorLayout(
  nodes: LayoutInputNode[],
  edges: LayoutInputEdge[],
  centralId: NodeId,
  params: RadialSectorParams
): Map<NodeId, Position> {
  const positions = new Map<NodeId, Position>();
  if (nodes.length === 0) return positions;

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  if (!nodeById.has(centralId)) return positions;

  const root = buildSpanningForest(nodes, edges, centralId, nodeById);
  computeLeafWeights(root);
  // Root's children partition the full circle, starting at the top.
  assignAngles(root, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI);
  const ringRadii = computeRingRadii(root, params);
  placeNodes(root, ringRadii, positions);

  return positions;
}

/**
 * BFS spanning tree rooted at the central node. Every non-central node gets a
 * single parent (its BFS predecessor); non-tree edges are ignored for
 * placement. Disconnected components are attached as depth-1 subtrees of the
 * centre so each still receives its own wedge.
 */
function buildSpanningForest(
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

function footprintRadius(footprint: { width: number; height: number }): number {
  return Math.sqrt((footprint.width / 2) ** 2 + (footprint.height / 2) ** 2);
}

/** Post-order: a leaf weighs 1, an internal node weighs the sum of its leaves. */
function computeLeafWeights(node: TreeNode): number {
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
function assignAngles(node: TreeNode, start: number, end: number): void {
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

/**
 * One radius per depth ring. A ring is pushed outward until every node at that
 * depth fits inside its own angular wedge (so siblings cannot overlap) and it
 * clears the previous ring by at least `ringSpacing`.
 */
function computeRingRadii(root: TreeNode, params: RadialSectorParams): number[] {
  const nodesByDepth: TreeNode[][] = [];
  const walk = (node: TreeNode): void => {
    (nodesByDepth[node.depth] ??= []).push(node);
    node.children.forEach(walk);
  };
  walk(root);

  const radii: number[] = [0];
  for (let depth = 1; depth < nodesByDepth.length; depth++) {
    let required = radii[depth - 1] + params.ringSpacing;
    for (const node of nodesByDepth[depth]) {
      const angularWidth = node.angleEnd - node.angleStart;
      if (angularWidth <= 1e-6) continue;
      const arcNeeded = 2 * node.footprintRadius + params.siblingGap;
      const radiusForFit = arcNeeded / angularWidth;
      if (radiusForFit > required) required = radiusForFit;
    }
    radii[depth] = Math.ceil(required);
  }

  return radii;
}

function placeNodes(node: TreeNode, ringRadii: number[], out: Map<NodeId, Position>): void {
  const angle = (node.angleStart + node.angleEnd) / 2;
  const radius = ringRadii[node.depth] ?? 0;
  out.set(node.id, {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
  });
  for (const child of node.children) placeNodes(child, ringRadii, out);
}
