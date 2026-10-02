/**
 * Map tree
 *
 * Walks the graph from a focus node into the tree of boxes and lines a map
 * shows: every edge followed in either direction, never straight back to the
 * node just come from, to a depth of two. A box is an address (node ids from
 * the focus joined by `/`), not a node, so a node reached two ways has two
 * boxes (twins), and a pair of nodes joined by several edges has one box and
 * several lines. Pure: plain data in, plain data out.
 *
 * See docs/map-view.md §2–§3.
 */

import type { Edge, EdgeId, Node, NodeId } from '../../core/main-types';

/** Node ids from the focus joined by `/`, e.g. `A/B/C`. A box's identity. */
export type Address = string;

/** Hops from the focus. The map shows nothing beyond MAP_DEPTH. */
export type MapDepth = 0 | 1 | 2;
export const MAP_DEPTH: MapDepth = 2;

export interface MapBox {
  address: Address;
  nodeId: NodeId;
  depth: MapDepth;
  /** Null for the focus box only. */
  parentAddress: Address | null;
}

/** A line's identity: its child box's address and its edge, since parallel edges give one box several lines. */
export type LineKey = string;

/** Joins a box to its parent box, one per edge between the two nodes; the lines of one box share the box's direction (§6.1). */
export interface MapLine {
  key: LineKey;
  address: Address;
  edgeId: EdgeId;
  parentAddress: Address;
  /** True when the edge was walked from its target to its source, so the line leaves from the target's end (I2). */
  reversed: boolean;
}

export interface MapTree {
  focusNodeId: NodeId;
  boxes: MapBox[];
  lines: MapLine[];
  /** Every node with more than one box, and the boxes' addresses. */
  twins: Map<NodeId, Address[]>;
}

export function lineKeyOf(address: Address, edgeId: EdgeId): LineKey {
  return `${address}#${edgeId}`;
}

/** The lines of the given boxes, in tree order. */
export function linesOfBoxes(tree: MapTree, addresses: Address[]): MapLine[] {
  const wanted = new Set(addresses);
  return tree.lines.filter(line => wanted.has(line.address));
}

/** Each box's first line, the one geometry reads the box's direction from; the others share it. */
export function firstLineByAddress(tree: MapTree): Map<Address, MapLine> {
  const byAddress = new Map<Address, MapLine>();
  for (const line of tree.lines) {
    if (!byAddress.has(line.address)) byAddress.set(line.address, line);
  }
  return byAddress;
}

/** Restricts the walk (docs/map-view.md §5.4). An excluded edge is not followed; an excluded node is not entered. */
export interface MapWalkFilter {
  includeEdge: (edge: Edge) => boolean;
  includeNode: (node: Node) => boolean;
}

export const WALK_EVERYTHING: MapWalkFilter = {
  includeEdge: () => true,
  includeNode: () => true,
};

export function joinAddress(parentAddress: Address, nodeId: NodeId): Address {
  return `${parentAddress}/${nodeId}`;
}

export function lastNodeOfAddress(address: Address): NodeId {
  const parts = address.split('/');
  return parts[parts.length - 1] as NodeId;
}

export function buildMapTree(
  focusNodeId: NodeId,
  nodes: Node[],
  edges: Edge[],
  filter: MapWalkFilter = WALK_EVERYTHING
): MapTree {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const incident = buildIncidence(edges, nodeById, filter);

  const focusBox: MapBox = { address: String(focusNodeId), nodeId: focusNodeId, depth: 0, parentAddress: null };
  const boxes: MapBox[] = [focusBox];
  const lines: MapLine[] = [];
  const seenAddresses = new Set<Address>([focusBox.address]);

  // Breadth-first so a box's depth is the shortest walk to it; each box carries
  // the node it came from, which it may not walk straight back to, by any edge.
  const queue: Array<{ box: MapBox; cameFrom: NodeId | null }> = [{ box: focusBox, cameFrom: null }];
  while (queue.length > 0) {
    const { box, cameFrom } = queue.shift()!;
    if (box.depth >= MAP_DEPTH) continue;

    for (const edge of incident.get(box.nodeId) ?? []) {
      const reversed = edge.targetId === box.nodeId;
      const childNodeId = reversed ? edge.sourceId : edge.targetId;
      if (childNodeId === cameFrom) continue;
      const address = joinAddress(box.address, childNodeId);
      // Parallel edges between the same pair give one box several lines: an
      // address is a node path, so the box exists once and every edge joins it.
      lines.push({ key: lineKeyOf(address, edge.id), address, edgeId: edge.id, parentAddress: box.address, reversed });
      if (seenAddresses.has(address)) continue;
      seenAddresses.add(address);

      const child: MapBox = { address, nodeId: childNodeId, depth: (box.depth + 1) as MapDepth, parentAddress: box.address };
      boxes.push(child);
      queue.push({ box: child, cameFrom: box.nodeId });
    }
  }

  return { focusNodeId, boxes, lines, twins: collectTwins(boxes) };
}

/** Edges by endpoint, with excluded edges, unknown endpoints, self-loops and excluded nodes left out. */
function buildIncidence(edges: Edge[], nodeById: Map<NodeId, Node>, filter: MapWalkFilter): Map<NodeId, Edge[]> {
  const incident = new Map<NodeId, Edge[]>();
  const link = (nodeId: NodeId, edge: Edge): void => {
    const list = incident.get(nodeId);
    if (list) list.push(edge);
    else incident.set(nodeId, [edge]);
  };

  for (const edge of edges) {
    if (edge.sourceId === edge.targetId) continue;
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) continue;
    if (!filter.includeEdge(edge) || !filter.includeNode(source) || !filter.includeNode(target)) continue;
    link(edge.sourceId, edge);
    link(edge.targetId, edge);
  }
  return incident;
}

function collectTwins(boxes: MapBox[]): Map<NodeId, Address[]> {
  const addressesByNode = new Map<NodeId, Address[]>();
  for (const box of boxes) {
    const addresses = addressesByNode.get(box.nodeId);
    if (addresses) addresses.push(box.address);
    else addressesByNode.set(box.nodeId, [box.address]);
  }
  const twins = new Map<NodeId, Address[]>();
  for (const [nodeId, addresses] of addressesByNode) {
    if (addresses.length > 1) twins.set(nodeId, addresses);
  }
  return twins;
}
