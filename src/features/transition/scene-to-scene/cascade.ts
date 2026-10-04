/**
 * Cascade helpers
 *
 * What animators share when they move nodes in layers by graph distance from
 * the central node: the BFS over a scene's edges that gives every node its
 * distance and its parent, the neighbour on the path back to the central; the
 * grouping of nodes into layers; the bucketing of edges to the layer of their
 * outermost animated endpoint, with the edges between two non-animated nodes
 * set apart; the point where a ray leaves the viewport; a delay. A library an
 * animator may use, not part of any interface (docs/scene-transitions.md §4.2).
 */

import type { Core } from 'cytoscape';
import type { EdgeId, NodeId, Scene } from '../../../core/main-types';
import type { Position } from './animators';
import { graphStore } from '../../../storage/graph-store';

/** A node's place in the BFS from the central: how far, and through which neighbour. */
export interface Reach {
  distance: number;
  /** Null for the central itself. */
  parent: NodeId | null;
}

/** The distance given to a node the BFS never reached, so it lands in the last layer. */
export const UNREACHED = 999;

export type EndpointsOf = (edgeId: EdgeId) => [NodeId, NodeId] | null;

/** Endpoints from the instance when the edge is drawn, from the store otherwise. */
export function instanceEndpoints(cy: Core): EndpointsOf {
  return edgeId => {
    const edge = cy.getElementById(edgeId);
    if (edge.length > 0) return [edge.source().id() as NodeId, edge.target().id() as NodeId];
    const stored = graphStore.edges.find(candidate => candidate.id === edgeId);
    return stored ? [stored.sourceId, stored.targetId] : null;
  };
}

/** BFS from the central over the scene's edges: every reached node's distance and parent. */
export function graphReach(scene: Scene, centralNodeId: NodeId, endpointsOf: EndpointsOf): Map<NodeId, Reach> {
  const adjacency = new Map<NodeId, NodeId[]>();
  const link = (from: NodeId, to: NodeId): void => {
    const list = adjacency.get(from);
    if (list) list.push(to);
    else adjacency.set(from, [to]);
  };
  for (const edgeId of Object.keys(scene.edges)) {
    const endpoints = endpointsOf(edgeId);
    if (!endpoints) continue;
    link(endpoints[0], endpoints[1]);
    link(endpoints[1], endpoints[0]);
  }

  const reach = new Map<NodeId, Reach>([[centralNodeId, { distance: 0, parent: null }]]);
  const queue: NodeId[] = [centralNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const distance = reach.get(current)!.distance + 1;
    for (const neighbour of adjacency.get(current) ?? []) {
      if (reach.has(neighbour)) continue;
      reach.set(neighbour, { distance, parent: current });
      queue.push(neighbour);
    }
  }
  return reach;
}

export function distanceOf(reach: Map<NodeId, Reach>, nodeId: NodeId): number {
  return reach.get(nodeId)?.distance ?? UNREACHED;
}

export interface Layer {
  distance: number;
  nodes: NodeId[];
}

/** The nodes grouped by distance, closest first or farthest first. */
export function layersByDistance(nodeIds: NodeId[], reach: Map<NodeId, Reach>, order: 'closest-first' | 'farthest-first'): Layer[] {
  const byDistance = new Map<number, NodeId[]>();
  for (const nodeId of nodeIds) {
    const distance = distanceOf(reach, nodeId);
    const nodes = byDistance.get(distance);
    if (nodes) nodes.push(nodeId);
    else byDistance.set(distance, [nodeId]);
  }
  const distances = [...byDistance.keys()].sort((a, b) => (order === 'closest-first' ? a - b : b - a));
  return distances.map(distance => ({ distance, nodes: byDistance.get(distance)! }));
}

export interface EdgeBuckets {
  /** Edges with at least one animated endpoint, keyed by the outermost animated endpoint's distance. */
  byDistance: Map<number, EdgeId[]>;
  /** Edges between two nodes that are not animated: no layer to ride with, handled apart. */
  sharedToShared: EdgeId[];
}

/** Each edge to the layer of its outermost animated endpoint; edges with no animated endpoint set apart. */
export function bucketEdges(edgeIds: EdgeId[], animated: Set<NodeId>, reach: Map<NodeId, Reach>, endpointsOf: EndpointsOf): EdgeBuckets {
  const buckets: EdgeBuckets = { byDistance: new Map(), sharedToShared: [] };
  for (const edgeId of edgeIds) {
    const endpoints = endpointsOf(edgeId);
    if (!endpoints) continue;
    const animatedEnds = endpoints.filter(nodeId => animated.has(nodeId));
    if (animatedEnds.length === 0) {
      buckets.sharedToShared.push(edgeId);
      continue;
    }
    const distance = Math.max(...animatedEnds.map(nodeId => distanceOf(reach, nodeId)));
    const edges = buckets.byDistance.get(distance);
    if (edges) edges.push(edgeId);
    else buckets.byDistance.set(distance, [edgeId]);
  }
  return buckets;
}

export interface Extent {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The unit direction from `from` to `to`; straight up when the two coincide. */
export function directionBetween(from: Position, to: Position): Position {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1) return { x: 0, y: -1 };
  return { x: dx / length, y: dy / length };
}

/** Where a ray from `origin` in `direction` leaves the viewport, `margin` beyond its edge. */
export function viewportEdgePoint(origin: Position, direction: Position, extent: Extent, margin: number): Position {
  const left = extent.x1 - margin;
  const right = extent.x2 + margin;
  const top = extent.y1 - margin;
  const bottom = extent.y2 + margin;

  let minT = Infinity;
  if (direction.x !== 0) {
    for (const edge of [left, right]) {
      const t = (edge - origin.x) / direction.x;
      if (t > 0) minT = Math.min(minT, t);
    }
  }
  if (direction.y !== 0) {
    for (const edge of [top, bottom]) {
      const t = (edge - origin.y) / direction.y;
      if (t > 0) minT = Math.min(minT, t);
    }
  }
  // No intersection should be impossible for a point inside the viewport; a fixed reach keeps the animation sane if it happens.
  const reach = minT === Infinity ? 500 : minT;
  return { x: origin.x + direction.x * reach, y: origin.y + direction.y * reach };
}

export function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}
