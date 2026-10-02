/**
 * Bearing seeding
 *
 * Every edge in an existing workspace lacks bearings, and every edge from
 * before the two-ended model lacks its target's end. When a map is laid out,
 * each parent box seeds the unassigned ends of its lines and stores them at
 * once (docs/map-view.md §6.5), so that seeding is the only writer of a
 * bearing besides a drag and a map never rewrites directions merely by being
 * opened.
 *
 * Two cases per end. Coupled: the partner end is assigned, so this end
 * prefers the exact reverse and slides within the allowance to the widest
 * gap among the spokes already at its box. Free: neither end is assigned;
 * the parent's free ends take even slots in its gaps, and which end takes
 * which slot, and the phase of the slots within their gaps, are chosen so
 * the far ends land as clear as possible of the spokes their own boxes have,
 * each far end then set to the exact reverse of its slot. That is what stops
 * the third edge of a triangle being planted into a direction its far end
 * already uses, which one-ended seeding did on every triangle.
 *
 * The map depends on the graph alone, never on a scene's composition: the
 * map is the basis a scene is made from, not the reverse. A normal edit that
 * saves normally, never a whole-graph migration.
 */

import type { Edge, EdgeId, NodeId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';
import { angleAtEnd, distributeBearings, normalizeBearing, pairKeyOf, resolveEnds, reverseBearing, siblingEnds, signedAngleBetween, type EdgeEnds } from './geometry';
import { firstLineByAddress, type Address, type MapBox, type MapLine, type MapTree } from './map-tree';

/** An edge's ends as stored: each may be missing. */
interface StoredEnds {
  source?: number;
  target?: number;
}

/** A line whose leaving end is unassigned, with the node at its far end. */
interface Unseeded {
  line: MapLine;
  far: NodeId;
}

/** With no far-end constraint every candidate is this clear; also the best any candidate can be. */
const CLEAR = 180;
/** The phase of a batch of slots is searched at this many positions across its range. */
const PHASE_STEPS = 13;
/** Up to this many free ends at one box the slot assignment is exhaustive; beyond, greedy. */
const EXHAUSTIVE_LIMIT = 6;

/**
 * Read every line's edge ends, assigning and persisting the missing ones.
 * Parents are visited in tree order; `allEdges` supplies the far ends' other
 * spokes, which may lie off this map. Returns resolved ends for every edge
 * on the map.
 */
export async function ensureBearings(tree: MapTree, edgeById: Map<EdgeId, Edge>, allEdges: Edge[], allowance: number): Promise<Map<EdgeId, EdgeEnds>> {
  const stored = new Map<EdgeId, StoredEnds>();
  for (const edge of allEdges) stored.set(edge.id, { source: edge.bearing, target: edge.bearingBack });
  const edgesByNode = incidence(allEdges);
  const edgesByPair = pairs(allEdges);
  const lineByAddress = firstLineByAddress(tree);
  const touched = new Set<EdgeId>();
  const pair = new Pairs(edgesByPair, stored, touched);
  pair.reconcile();

  for (const parent of tree.boxes) {
    const unseeded = unseededLinesAt(parent, lineByAddress, edgeById, stored);
    if (unseeded.length === 0) continue;
    const spokes = spokesAt(parent, lineByAddress, edgeById, stored);

    const coupled = unseeded.filter(item => partnerEnd(item.line, stored) !== undefined);
    for (const item of coupled) {
      const partner = partnerEnd(item.line, stored)!;
      const angle = slideWithinAllowance(reverseBearing(partner), spokes, allowance);
      setNearEnd(item.line, angle, stored);
      spokes.push(angle);
      pair.share(item.line.edgeId);
    }

    const free = unseeded.filter(item => partnerEnd(item.line, stored) === undefined);
    if (free.length > 0) {
      const farSpokes = free.map(item => spokesOfNode(item.far, item.line.edgeId, edgesByNode, stored));
      const angles = placeFreeEnds(spokes, free.length, farSpokes);
      free.forEach((item, index) => {
        setNearEnd(item.line, angles[index], stored);
        setFarEnd(item.line, reverseBearing(angles[index]), stored);
        spokes.push(angles[index]);
        pair.share(item.line.edgeId);
      });
    }
  }

  for (const edgeId of touched) {
    const edge = edgeById.get(edgeId);
    const ends = stored.get(edgeId);
    if (edge && ends) await graphStore.updateEdge({ ...edge, bearing: ends.source, bearingBack: ends.target });
  }

  const resolved = new Map<EdgeId, EdgeEnds>();
  for (const line of tree.lines) {
    const ends = stored.get(line.edgeId);
    const edgeEnds = ends ? resolveEnds({ bearing: ends.source, bearingBack: ends.target }) : null;
    if (edgeEnds) resolved.set(line.edgeId, edgeEnds);
  }
  return resolved;
}

// ============================================================================
// PAIRS
// ============================================================================

/** Every edge between the same two nodes, keyed by the pair. */
function pairs(edges: Edge[]): Map<string, Edge[]> {
  const byPair = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = pairKeyOf(edge);
    const list = byPair.get(key);
    if (list) list.push(edge);
    else byPair.set(key, [edge]);
  }
  return byPair;
}

/**
 * Parallel edges share their ends (docs/map-view.md §6.1): a box has one
 * direction, so every edge of the pair carries the same two angles, swapped
 * for an edge that runs the other way. `share` copies one edge's ends to its
 * siblings after they were set; `reconcile` does it once for pairs that
 * predate the rule, where only the first edge was ever seeded.
 */
class Pairs {
  #edgesByPair: Map<string, Edge[]>;
  #stored: Map<EdgeId, StoredEnds>;
  #touched: Set<EdgeId>;

  constructor(edgesByPair: Map<string, Edge[]>, stored: Map<EdgeId, StoredEnds>, touched: Set<EdgeId>) {
    this.#edgesByPair = edgesByPair;
    this.#stored = stored;
    this.#touched = touched;
  }

  reconcile(): void {
    for (const edges of this.#edgesByPair.values()) {
      if (edges.length < 2) continue;
      const reference = edges.find(edge => {
        const ends = this.#stored.get(edge.id);
        return ends !== undefined && (ends.source !== undefined || ends.target !== undefined);
      });
      if (reference) this.share(reference.id, edges);
    }
  }

  share(edgeId: EdgeId, edges?: Edge[]): void {
    this.#touched.add(edgeId);
    const ends = this.#stored.get(edgeId);
    const siblings = edges ?? this.#siblingsOf(edgeId);
    if (!ends || !siblings) return;
    const reference = siblings.find(edge => edge.id === edgeId);
    if (!reference) return;
    for (const sibling of siblings) {
      if (sibling.id === edgeId) continue;
      const copy = siblingEnds(ends, sibling.sourceId === reference.sourceId);
      const current = this.#stored.get(sibling.id);
      if (current?.source === copy.source && current?.target === copy.target) continue;
      this.#stored.set(sibling.id, copy);
      this.#touched.add(sibling.id);
    }
  }

  #siblingsOf(edgeId: EdgeId): Edge[] | undefined {
    for (const edges of this.#edgesByPair.values()) {
      if (edges.some(edge => edge.id === edgeId)) return edges;
    }
    return undefined;
  }
}

// ============================================================================
// ENDS
// ============================================================================

/** Whether the line leaves from its edge's source end. */
function leavesFromSource(line: MapLine): boolean {
  return !line.reversed;
}

function nearEnd(line: MapLine, stored: Map<EdgeId, StoredEnds>): number | undefined {
  const ends = stored.get(line.edgeId);
  return leavesFromSource(line) ? ends?.source : ends?.target;
}

function partnerEnd(line: MapLine, stored: Map<EdgeId, StoredEnds>): number | undefined {
  const ends = stored.get(line.edgeId);
  return leavesFromSource(line) ? ends?.target : ends?.source;
}

function setNearEnd(line: MapLine, angle: number, stored: Map<EdgeId, StoredEnds>): void {
  const ends = stored.get(line.edgeId) ?? {};
  if (leavesFromSource(line)) ends.source = angle;
  else ends.target = angle;
  stored.set(line.edgeId, ends);
}

function setFarEnd(line: MapLine, angle: number, stored: Map<EdgeId, StoredEnds>): void {
  const ends = stored.get(line.edgeId) ?? {};
  if (leavesFromSource(line)) ends.target = angle;
  else ends.source = angle;
  stored.set(line.edgeId, ends);
}

// ============================================================================
// SPOKES
// ============================================================================

/** The first lines of the boxes under a box whose leaving end has no bearing yet, in tree order; a box's other lines share its direction. */
function unseededLinesAt(box: MapBox, lineByAddress: Map<Address, MapLine>, edgeById: Map<EdgeId, Edge>, stored: Map<EdgeId, StoredEnds>): Unseeded[] {
  const lines: Unseeded[] = [];
  for (const line of lineByAddress.values()) {
    if (line.parentAddress !== box.address || nearEnd(line, stored) !== undefined) continue;
    const edge = edgeById.get(line.edgeId);
    if (!edge) continue;
    lines.push({ line, far: leavesFromSource(line) ? edge.targetId : edge.sourceId });
  }
  return lines;
}

/** Angles of every box already placed under a box, from each box's first line, and the box's own line's end at this box, pointing back. */
function spokesAt(box: MapBox, lineByAddress: Map<Address, MapLine>, edgeById: Map<EdgeId, Edge>, stored: Map<EdgeId, StoredEnds>): number[] {
  const spokes: number[] = [];
  for (const line of lineByAddress.values()) {
    if (line.parentAddress !== box.address) continue;
    const angle = nearEnd(line, stored);
    if (angle !== undefined) spokes.push(angle);
  }
  const incoming = lineByAddress.get(box.address);
  if (incoming) {
    const edge = edgeById.get(incoming.edgeId);
    const ends = stored.get(incoming.edgeId);
    const resolved = ends ? resolveEnds({ bearing: ends.source, bearingBack: ends.target }) : null;
    // This box is the child of its incoming line, so its end is the one the line does not leave from.
    if (edge && resolved) spokes.push(angleAtEnd(resolved, incoming.reversed));
  }
  return spokes;
}

/** The angles at a node of every one of its edges whose end there is assigned, one per pair, `except` the pair of one edge; the far end's view of its own box. */
function spokesOfNode(nodeId: NodeId, except: EdgeId, edgesByNode: Map<NodeId, Edge[]>, stored: Map<EdgeId, StoredEnds>): number[] {
  const spokes: number[] = [];
  const seenPairs = new Set<string>();
  const exceptEdge = (edgesByNode.get(nodeId) ?? []).find(edge => edge.id === except);
  if (exceptEdge) seenPairs.add(pairKeyOf(exceptEdge));
  for (const edge of edgesByNode.get(nodeId) ?? []) {
    const key = pairKeyOf(edge);
    if (seenPairs.has(key)) continue;
    const ends = stored.get(edge.id);
    const resolved = ends ? resolveEnds({ bearing: ends.source, bearingBack: ends.target }) : null;
    if (!resolved) continue;
    seenPairs.add(key);
    spokes.push(angleAtEnd(resolved, edge.sourceId === nodeId));
  }
  return spokes;
}

function incidence(edges: Edge[]): Map<NodeId, Edge[]> {
  const byNode = new Map<NodeId, Edge[]>();
  for (const edge of edges) {
    for (const nodeId of [edge.sourceId, edge.targetId]) {
      const list = byNode.get(nodeId);
      if (list) list.push(edge);
      else byNode.set(nodeId, [edge]);
    }
  }
  return byNode;
}

// ============================================================================
// PLACEMENT
// ============================================================================

/** The angular distance from `angle` to the nearest spoke; `CLEAR` with no spokes. */
function clearance(angle: number, spokes: number[]): number {
  let least = CLEAR;
  for (const spoke of spokes) least = Math.min(least, Math.abs(signedAngleBetween(angle, spoke)));
  return least;
}

/**
 * The angle within `allowance` of `preferred` that is farthest from every
 * spoke. Clearance is piecewise linear in the angle, so its maximum over the
 * interval is at an endpoint, at `preferred`, or midway between two adjacent
 * spokes that fall inside the interval; those are the candidates tried.
 */
function slideWithinAllowance(preferred: number, spokes: number[], allowance: number): number {
  if (allowance <= 0 || spokes.length === 0) return preferred;
  const candidates = [preferred, normalizeBearing(preferred - allowance), normalizeBearing(preferred + allowance)];
  const sorted = spokes.map(normalizeBearing).sort((left, right) => left - right);
  sorted.forEach((spoke, index) => {
    const next = index + 1 < sorted.length ? sorted[index + 1] : sorted[0] + 360;
    const midpoint = normalizeBearing((spoke + next) / 2);
    if (Math.abs(signedAngleBetween(preferred, midpoint)) <= allowance) candidates.push(midpoint);
  });
  return best(candidates, candidate => clearance(candidate, spokes));
}

/**
 * Angles for `count` free ends at one box: even slots in the box's gaps
 * (`distributeBearings`), then which end takes which slot chosen for the far
 * ends, maximising the worst far-end clearance, then the sum. With no spokes
 * at all the whole set may also turn, a pure rotation that costs the parent
 * nothing; with spokes it may not: shifting the set toward a spoke halves
 * the margin there, and the parent's evenness is what is looked at (a
 * shifted fan put a marker on its landmark's trunk, 2026-09-28).
 */
function placeFreeEnds(spokes: number[], count: number, farSpokes: number[][]): number[] {
  const slots = distributeBearings(spokes, count);
  if (farSpokes.every(list => list.length === 0)) return slots;

  const range = spokes.length === 0 ? 180 / count : 0;
  const steps = range > 0 ? PHASE_STEPS : 1;
  let bestAngles = slots;
  let bestScore: [number, number] = [-1, -1];
  for (let step = 0; step < steps; step++) {
    const phase = steps === 1 ? 0 : -range + (2 * range * step) / (steps - 1);
    const shifted = slots.map(slot => normalizeBearing(slot + phase));
    const order = assignSlots(shifted, farSpokes);
    const angles = order.map(slotIndex => shifted[slotIndex]);
    const score = scoreOf(angles, farSpokes);
    if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
      bestScore = score;
      bestAngles = angles;
    }
  }
  return bestAngles;
}

/** For each free end, the index of the slot it takes; exhaustive for a few, greedy by scarcest end first beyond. */
function assignSlots(slots: number[], farSpokes: number[][]): number[] {
  const count = slots.length;
  const fit = (end: number, slot: number): number => clearance(reverseBearing(slots[slot]), farSpokes[end]);
  if (count <= EXHAUSTIVE_LIMIT) {
    let bestOrder: number[] = [];
    let bestScore: [number, number] = [-1, -1];
    for (const order of permutations(count)) {
      const score = scoreOf(order.map(slotIndex => slots[slotIndex]), farSpokes);
      if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
        bestScore = score;
        bestOrder = order;
      }
    }
    return bestOrder;
  }
  const taken = new Set<number>();
  const order = new Array<number>(count).fill(-1);
  const ends = [...Array(count).keys()].sort((left, right) => farSpokes[right].length - farSpokes[left].length);
  for (const end of ends) {
    const open = [...Array(count).keys()].filter(slot => !taken.has(slot));
    const slot = best(open, candidate => fit(end, candidate));
    taken.add(slot);
    order[end] = slot;
  }
  return order;
}

/** Worst far-end clearance first, then the sum; the pair compares lexicographically. */
function scoreOf(angles: number[], farSpokes: number[][]): [number, number] {
  let worst = CLEAR;
  let sum = 0;
  angles.forEach((angle, index) => {
    const clear = clearance(reverseBearing(angle), farSpokes[index]);
    worst = Math.min(worst, clear);
    sum += clear;
  });
  return [worst, sum];
}

function best<T>(candidates: T[], score: (candidate: T) => number): T {
  let winner = candidates[0];
  let winning = -Infinity;
  for (const candidate of candidates) {
    const value = score(candidate);
    if (value > winning) {
      winning = value;
      winner = candidate;
    }
  }
  return winner;
}

function* permutations(count: number): Generator<number[]> {
  const order = [...Array(count).keys()];
  function* permute(k: number): Generator<number[]> {
    if (k === count) {
      yield [...order];
      return;
    }
    for (let i = k; i < count; i++) {
      [order[k], order[i]] = [order[i], order[k]];
      yield* permute(k + 1);
      [order[k], order[i]] = [order[i], order[k]];
    }
  }
  yield* permute(0);
}
