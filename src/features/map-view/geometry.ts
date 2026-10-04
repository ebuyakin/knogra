/**
 * Map geometry
 *
 * Positions are never stored: a box sits at its parent box's position plus its
 * line's length along its line's angle, with the focus at the origin
 * (docs/map-view.md I1). An edge has one bearing per end, the two coupled
 * within an allowance, and a line is drawn at the angle of the end it leaves
 * from (I2). Pure.
 *
 * The frame is fixed by the screen (§3): landmarks sit on a ring, markers on a
 * leaf around their landmark, and what adapts to crowding is size, not
 * distance: each landmark's sector arc is budgeted between the box, its side
 * markers, the clearances and the air, which sets the landmark's scale, its
 * fan's scale and its leaf's side clearance. The author's scales multiply
 * the derived ones.
 *
 * Two frames. Bearings and lengths live in the true frame. The drawn frame is
 * the true frame with x multiplied by `horizontalStretch` about the focus, so
 * the ring is an ellipse. The same factor in every map keeps directions
 * consistent across re-focuses; opposite stays opposite. `MapLayout.positions`
 * are drawn positions, which is what the instance and the animator use; a
 * drag converts back with `unstretch`.
 *
 * Bearing convention: degrees, 0 = east, increasing clockwise on screen
 * (y down) — the convention `rotate` and `orderChildrenByAngle` use.
 */

import type { EdgeId, NodeId } from '../../core/main-types';
import { firstLineByAddress, type Address, type MapBox, type MapTree } from './map-tree';

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The author's adjustments to one box: a centre-to-centre length, a multiplier on the derived scale, and for a landmark a multiplier on its leaf. */
export interface BoxOverride {
  length?: number;
  scale?: number;
  leaf?: number;
}

/** The author's adjustments to one map, the shape its record stores (docs/map-view.md §6.2). */
export interface MapAdjustments {
  boxes: Record<Address, BoxOverride>;
  /** Multipliers on the derived scale of every landmark or every marker; absent means 1. */
  landmarkScale?: number;
  markerScale?: number;
}

/**
 * The arc a landmark's sector cuts from the ring is spent, tangentially, on
 * the box, a marker on each side of it, the clearance on each side, and the
 * breathing space on each side toward the neighbouring branch. Weights: the
 * landmark's counted once, the other three twice, then normalised.
 */
export interface ArcShares {
  landmark: number;
  marker: number;
  clearance: number;
  breathing: number;
}

export interface MapGeometryParams {
  /** The surface in drawn units at the base zoom, the focus at its centre; what a leaf must fit into. */
  viewport: Size;
  /** The ring's true radius, in graph units: ringRadius of half the surface's height, at the base zoom. */
  ringRadius: number;
  /** x multiplier of the drawn frame; the ring's horizontal semi-axis is ringRadius times this. */
  horizontalStretch: number;
  /** How a landmark's sector arc is shared out; weights, normalised. */
  arcShares: ArcShares;
  /** Clear space between a landmark's side and its markers when the sector is roomy, as a fraction of the landmark's height. */
  leafClearance: number;
  /** The leaf's semi-axis along the focus-to-landmark line as a multiple of its semi-axis across it. */
  leafAspect: number;
  /** A marker's scale as a fraction of its landmark's, before crowding. */
  markerScale: number;
  /** Minimum clearance between neighbouring markers of one fan, as a fraction of their half-diagonal. */
  markerGap: number;
  /** The least fraction of its default a crowded fan's scale may reach. */
  scaleFloor: number;
  /** The least scale a crowded landmark may reach: the readable floor, higher than the markers'. */
  landmarkFloor: number;
  /** How far a landmark may be drawn from its stored direction, in degrees, to keep the ring readable; 0 draws stored directions exactly. */
  landmarkDeviation: number;
}

/**
 * What crowding decided, per landmark: how far it is drawn from its stored
 * direction, its scale, its fan's marker scale and its leaf's side
 * clearances, before the author's multipliers. Computed when a map is
 * presented and frozen for a drag, so that dragging one box never moves,
 * resizes or reshapes the others.
 */
export interface Derived {
  /** Degrees added to the stored direction when drawing, true frame (§3 Drawn directions). */
  deviations: Map<Address, number>;
  landmarks: Map<Address, number>;
  fans: Map<Address, number>;
  sideClearances: Map<Address, SideClearances>;
}

/**
 * A landmark's two sides, named by angular order around the focus: `before`
 * faces the neighbour at the smaller angle, `after` the one at the larger.
 * Angles increase clockwise on screen, so `after` is the clockwise side.
 */
export interface SideClearances {
  before: number;
  after: number;
}

export interface MapLayout {
  /** Drawn positions, the focus at the origin. */
  positions: Map<Address, Position>;
  /** True lengths, what a record stores. */
  lengths: Map<Address, number>;
  /** Rendered scales: derived times the author's multipliers. */
  scales: Map<Address, number>;
  derived: Derived;
}

const HALF_TURN = 180;
const FULL_TURN = 360;
const ORIGIN: Position = { x: 0, y: 0 };

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / HALF_TURN;
}

/** Fold any angle in degrees into [0, 360). */
export function normalizeBearing(degrees: number): number {
  const folded = degrees % FULL_TURN;
  return folded < 0 ? folded + FULL_TURN : folded;
}

/** The bearing of `to` as seen from `from`, in the screen convention above. */
export function bearingBetween(from: Position, to: Position): number {
  return normalizeBearing((Math.atan2(to.y - from.y, to.x - from.x) * HALF_TURN) / Math.PI);
}

/** The turn from `from` to `to`, in (-180, 180]; positive is clockwise on screen. */
export function signedAngleBetween(from: number, to: number): number {
  const difference = normalizeBearing(to - from);
  return difference > HALF_TURN ? difference - FULL_TURN : difference;
}

export function reverseBearing(degrees: number): number {
  return normalizeBearing(degrees + HALF_TURN);
}

/**
 * An edge's two ends, resolved (docs/map-view.md I2): `source` is the
 * direction of the target as seen from the source, `target` the direction of
 * the source as seen from the target. Within `map.twinAllowance` of exact
 * opposition; an end that is not stored reads as the exact reverse of the
 * other.
 */
export interface EdgeEnds {
  source: number;
  target: number;
}

/** The node pair an edge joins, whichever way round; parallel edges share it, and with it their ends (§6.1). */
export function pairKeyOf(edge: { sourceId: NodeId; targetId: NodeId }): string {
  return edge.sourceId < edge.targetId ? `${edge.sourceId}|${edge.targetId}` : `${edge.targetId}|${edge.sourceId}`;
}

/** One edge's ends as its parallel sibling stores them: the same two angles, swapped when the sibling runs the other way. */
export function siblingEnds<T extends { source?: number; target?: number }>(ends: T, sameOrientation: boolean): T {
  return sameOrientation ? { ...ends } : { ...ends, source: ends.target, target: ends.source };
}

/** The ends of an edge as stored, or null when neither end is assigned. */
export function resolveEnds(edge: { bearing?: number; bearingBack?: number }): EdgeEnds | null {
  if (edge.bearing !== undefined) return { source: edge.bearing, target: edge.bearingBack ?? reverseBearing(edge.bearing) };
  if (edge.bearingBack !== undefined) return { source: reverseBearing(edge.bearingBack), target: edge.bearingBack };
  return null;
}

/** The angle a line is drawn at: the angle of the end it leaves from, the target's when the edge was walked backwards. */
export function lineAngle(ends: EdgeEnds, reversed: boolean): number {
  return reversed ? ends.target : ends.source;
}

/** The angle of the end that is `atSource`, as seen from that end's node. */
export function angleAtEnd(ends: EdgeEnds, atSource: boolean): number {
  return atSource ? ends.source : ends.target;
}

/**
 * The partner end after its own end moved to `angle`: unchanged while within
 * the allowance of exact opposition, otherwise dragged along to sit at the
 * allowance (I6). At allowance 0 it is the exact reverse, the rigid rule.
 */
export function coupledEnd(partner: number, angle: number, allowance: number): number {
  const reverse = reverseBearing(angle);
  const divergence = signedAngleBetween(reverse, partner);
  if (Math.abs(divergence) <= allowance) return partner;
  return normalizeBearing(reverse + Math.sign(divergence) * allowance);
}

/** An edge's ends after the end at `atSource` moved to `angle`, its partner coupled. */
export function endsAfterMove(ends: EdgeEnds, atSource: boolean, angle: number, allowance: number): EdgeEnds {
  return atSource
    ? { source: angle, target: coupledEnd(ends.target, angle, allowance) }
    : { source: coupledEnd(ends.source, angle, allowance), target: angle };
}

/** A drawn-frame offset back to the true frame. */
export function unstretch(offset: Position, horizontalStretch: number): Position {
  return { x: offset.x / horizontalStretch, y: offset.y };
}

/**
 * Bearings for `count` new lines at once, spread evenly into the gaps between
 * the spokes already there: each gap takes a share of the newcomers in
 * proportion to its width, spaced evenly inside it with the same margin at
 * both ends. With no spokes there are no ends: evenly around the circle
 * starting at east, which the gap rule would get wrong by leaving a double
 * gap across east. One newcomer lands in the middle of the widest gap, which
 * is what the one-at-a-time rule did; many newcomers at once, a reset, come
 * out equally spaced rather than as a sequence of halvings.
 */
export function distributeBearings(spokes: number[], count: number): number[] {
  if (count <= 0) return [];
  if (spokes.length === 0) return Array.from({ length: count }, (_, index) => (FULL_TURN * index) / count);

  const sorted = spokes.map(normalizeBearing).sort((left, right) => left - right);
  const gaps = sorted.map((start, index) => {
    const next = index + 1 < sorted.length ? sorted[index + 1] : sorted[0] + FULL_TURN;
    return { start, width: next - start };
  });

  // Largest-remainder apportionment of the newcomers among the gaps.
  const total = gaps.reduce((sum, gap) => sum + gap.width, 0);
  const exact = gaps.map(gap => (count * gap.width) / total);
  const shares = exact.map(Math.floor);
  let remaining = count - shares.reduce((sum, share) => sum + share, 0);
  const byRemainder = exact.map((value, index) => ({ index, remainder: value - shares[index] })).sort((left, right) => right.remainder - left.remainder);
  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    shares[index] += 1;
    remaining -= 1;
  }

  const bearings: number[] = [];
  gaps.forEach((gap, index) => {
    for (let slot = 1; slot <= shares[index]; slot++) {
      bearings.push(normalizeBearing(gap.start + (gap.width * slot) / (shares[index] + 1)));
    }
  });
  return bearings;
}

function halfDiagonal(size: Size): number {
  return Math.hypot(size.width, size.height) / 2;
}

// ============================================================================
// LAYOUT
// ============================================================================

/** A box with what the passes need about it. */
interface Placed {
  box: MapBox;
  /** True angle of its line; 0 for the focus. */
  angle: number;
  /** Size at scale 1. */
  base: Size;
  /** True length of its line. */
  length: number;
  /** Derived scale before the author's multipliers. */
  derivedScale: number;
  /** Rendered scale. */
  scale: number;
  /** Landmarks: the leaf's clearance to each side, from that side's half-sector. */
  sideClearances: SideClearances;
}

const NO_CLEARANCE: SideClearances = { before: 0, after: 0 };

/**
 * Lay the tree out. Every line's edge must have a bearing; seeding
 * (docs/map-view.md §6.5) is the caller's job before this runs, and a missing
 * one is a programming error, not a case to paper over. `baseSizes` are the
 * nodes' rendered sizes at scale 1.
 *
 * Landmarks first: on the ring at their bearings, an override replacing the
 * length. Then each landmark's sector budget (docs/map-view.md §3): the arc
 * its sector cuts from the ring is shared between the box, its side markers,
 * the clearances and the air, and each of the three takes its share or its
 * uncrowded default, whichever is smaller. That gives the landmark's scale,
 * its fan's scale and its leaf's side clearance; the fan's scale is lowered
 * further if its markers would not clear each other. Neither scale goes below
 * the floor. With `frozen`, the derived values are taken as given, which is
 * how a drag re-derives the map without resizing or reshaping anything.
 */
export function layoutMapTree(
  tree: MapTree,
  endsByEdge: Map<EdgeId, EdgeEnds>,
  adjustments: MapAdjustments,
  params: MapGeometryParams,
  baseSizes: Map<NodeId, Size>,
  frozen?: Derived
): MapLayout {
  const overrides = adjustments.boxes;
  const lineByAddress = firstLineByAddress(tree);
  const placed = new Map<Address, Placed>();

  // Angles and base sizes for every box; lengths for landmarks, which need no scale.
  for (const box of tree.boxes) {
    const base = baseSizes.get(box.nodeId) ?? { width: 0, height: 0 };
    if (box.parentAddress === null) {
      placed.set(box.address, { box, angle: 0, base, length: 0, derivedScale: 1, scale: 1, sideClearances: NO_CLEARANCE });
      continue;
    }
    const line = lineByAddress.get(box.address)!;
    const ends = endsByEdge.get(line.edgeId);
    if (!ends) throw new Error(`Map geometry: edge ${line.edgeId} has no bearing`);
    const angle = lineAngle(ends, line.reversed);
    const length = box.depth === 1 ? (overrides[box.address]?.length ?? params.ringRadius) : 0;
    placed.set(box.address, { box, angle, base, length, derivedScale: 1, scale: 1, sideClearances: NO_CLEARANCE });
  }

  const landmarks = [...placed.values()].filter(entry => entry.box.depth === 1).sort((left, right) => left.angle - right.angle);
  const fans = new Map<Address, Placed[]>();
  for (const entry of placed.values()) {
    if (entry.box.depth !== 2) continue;
    const fan = fans.get(entry.box.parentAddress!);
    if (fan) fan.push(entry);
    else fans.set(entry.box.parentAddress!, [entry]);
  }

  const derived: Derived = frozen ?? { deviations: new Map(), landmarks: new Map(), fans: new Map(), sideClearances: new Map() };
  if (!frozen) {
    for (const [address, deviation] of relaxRing(landmarks, params)) derived.deviations.set(address, deviation);
  }
  // Stored directions are targets; a landmark is drawn where the relaxation put it, its fan moving with it as a whole.
  for (const landmark of landmarks) landmark.angle = normalizeBearing(landmark.angle + (derived.deviations.get(landmark.box.address) ?? 0));
  landmarks.sort((left, right) => left.angle - right.angle);
  if (!frozen) {
    for (const landmark of landmarks) {
      const budget = sectorBudget(landmark, landmarks, fans.get(landmark.box.address) ?? [], params);
      derived.landmarks.set(landmark.box.address, budget.landmarkScale);
      derived.sideClearances.set(landmark.box.address, budget.sideClearances);
      derived.fans.set(landmark.box.address, budget.fanScale);
    }
  }
  for (const landmark of landmarks) {
    landmark.derivedScale = derived.landmarks.get(landmark.box.address) ?? 1;
    landmark.sideClearances = derived.sideClearances.get(landmark.box.address) ?? NO_CLEARANCE;
    landmark.scale = landmark.derivedScale * (adjustments.landmarkScale ?? 1) * (overrides[landmark.box.address]?.scale ?? 1);
  }

  // The leaf follows the fan's scale, so the scale is settled first and the markers placed at it.
  for (const [parentAddress, fan] of fans) {
    const landmark = placed.get(parentAddress)!;
    const budgeted = derived.fans.get(parentAddress) ?? params.markerScale * landmark.derivedScale;
    const fanScale = frozen ? budgeted : fitFan(landmark, fan, budgeted, adjustments, params);
    if (!frozen) derived.fans.set(parentAddress, fanScale);
    placeFan(landmark, fan, fanScale, adjustments, params);
    for (const marker of fan) {
      marker.derivedScale = fanScale;
      marker.scale = renderedMarkerScale(marker, fanScale, adjustments);
    }
  }

  const positions = new Map<Address, Position>();
  const lengths = new Map<Address, number>();
  const scales = new Map<Address, number>();
  for (const box of tree.boxes) {
    const entry = placed.get(box.address)!;
    scales.set(box.address, entry.scale);
    if (box.parentAddress === null) {
      positions.set(box.address, { x: 0, y: 0 });
      continue;
    }
    lengths.set(box.address, entry.length);
    positions.set(box.address, offsetAlong(positions.get(box.parentAddress)!, entry.angle, entry.length, params.horizontalStretch));
  }

  return { positions, lengths, scales, derived };
}

/** The drawn offset of a true length along a true angle. */
function offsetAlong(origin: Position, angleDegrees: number, length: number, horizontalStretch: number): Position {
  const radians = toRadians(angleDegrees);
  return { x: origin.x + Math.cos(radians) * length * horizontalStretch, y: origin.y + Math.sin(radians) * length };
}

/**
 * A marker's true length: its near edge sits on the landmark's leaf along
 * its own ray. Measured in the drawn frame, where the boxes are, and
 * converted to a true length. The marker is taken at `markerScale`, the
 * fan's, so the leaf shrinks with its markers.
 */
function leafLength(leaf: LeafEllipse, marker: Placed, markerScale: number, horizontalStretch: number): number {
  const ray = drawnDirection(marker.angle, horizontalStretch);
  const drawn = ellipseRadius(leaf, ray.direction) + edgeDistance(scaled(marker.base, markerScale), ray.direction);
  return drawn / ray.drawnPerTrue;
}

/** The leaf, in the drawn frame: an ellipse centred on the landmark with its major axis on the focus-to-landmark line. */
interface LeafEllipse {
  /** Unit drawn direction from the focus through the landmark. */
  axis: Position;
  /** Semi-axes along the axis and across it. */
  along: number;
  /** Semi-axes across, one per side: two half-ellipses sharing the axis. */
  across: SideClearances;
}

/**
 * The leaf is an ellipse around the landmark, not the box's outline pushed
 * out, which read as a rectangle around a wide box (2026-09-27). Its
 * semi-axis across, per side, is the box's half-extent across the axis plus
 * the clearance the sector budget allowed on that side, so a near neighbour
 * squeezes the leaf on its side only and the room on the other side is
 * used (2026-09-28: two half-ellipses sharing the axis); its semi-axis
 * along is the larger across times `leafAspect`, the leaf's shape being a
 * setting like the ring's stretch. Each half is then enlarged, keeping its
 * shape, until the box's corners on its side keep that side's clearance,
 * which is also what keeps a wide sideways box inside a leaf whose aspect
 * would otherwise cut through its ends; the shared axis takes the larger
 * enlargement. Symmetric front and back: an egg shortened toward the focus
 * was tried and made the corner rule inflate the front to satisfy the back.
 * The semi-axis along is then capped so the leaf and its farthest marker
 * stay inside the surface at the base zoom: a landmark near the top or
 * bottom has a long arc and a leaf to match, and the room ahead of it is
 * the one thing the arc does not know. Last, the author's `multiplier` for
 * this leaf (`,` and `.`), which may exceed the surface as the scene's
 * spread may, but never brings the leaf inside the box. The box is at its
 * rendered size, so W grows the leaf with it; the clearances are the
 * budget's, so W does not also inflate the air.
 */
function leafEllipse(landmark: Placed, markerSizes: Size[], multiplier: number, params: MapGeometryParams): LeafEllipse {
  const axis = drawnDirection(landmark.angle, params.horizontalStretch).direction;
  const size = scaled(landmark.base, landmark.scale);
  const clearances = landmark.sideClearances;
  const halfAcross = edgeDistance(size, { x: -axis.y, y: axis.x });
  const across: SideClearances = { before: halfAcross + clearances.before, after: halfAcross + clearances.after };
  const leaf: LeafEllipse = { axis, along: Math.max(across.before, across.after) * params.leafAspect, across };

  const factor: SideClearances = { before: 1, after: 1 };
  for (const [signX, signY] of CORNERS) {
    const corner = { x: (signX * size.width) / 2, y: (signY * size.height) / 2 };
    const distance = Math.hypot(corner.x, corner.y);
    if (distance === 0) continue;
    const direction = { x: corner.x / distance, y: corner.y / distance };
    const side = sideOf(leaf, direction);
    const radius = ellipseRadius(leaf, direction);
    if (radius > 0) factor[side] = Math.max(factor[side], (distance + clearances[side]) / radius);
  }
  // Room ahead: from the landmark to the surface's edge along the axis, less the farthest marker's own depth.
  const centre = offsetAlong(ORIGIN, landmark.angle, landmark.length, params.horizontalStretch);
  const markerDepth = Math.max(0, ...markerSizes.map(markerSize => 2 * edgeDistance(markerSize, axis)));
  const room = rayToViewport(centre, axis, params.viewport) - markerDepth - Math.min(clearances.before, clearances.after);
  const along = Math.min(leaf.along * Math.max(factor.before, factor.after), room);

  const halfAlong = edgeDistance(size, axis);
  return {
    axis,
    along: Math.max(halfAlong + Math.min(clearances.before, clearances.after), along * multiplier),
    across: {
      before: Math.max(halfAcross + clearances.before, across.before * factor.before * multiplier),
      after: Math.max(halfAcross + clearances.after, across.after * factor.after * multiplier),
    },
  };
}

/** Which side of the leaf's axis a unit drawn direction leaves on: clockwise on screen is `after`. */
function sideOf(leaf: LeafEllipse, direction: Position): keyof SideClearances {
  return direction.x * leaf.axis.y - direction.y * leaf.axis.x < 0 ? 'after' : 'before';
}

/** From `origin` along a unit direction to the edge of the surface, which is centred on the focus at the origin. */
function rayToViewport(origin: Position, direction: Position, viewport: Size): number {
  const toX = direction.x !== 0 ? ((Math.sign(direction.x) * viewport.width) / 2 - origin.x) / direction.x : Infinity;
  const toY = direction.y !== 0 ? ((Math.sign(direction.y) * viewport.height) / 2 - origin.y) / direction.y : Infinity;
  return Math.min(toX, toY);
}

const CORNERS: Array<[number, number]> = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/** The leaf's radius along a unit drawn direction, on the half-ellipse of the side the direction leaves on. */
function ellipseRadius(leaf: LeafEllipse, direction: Position): number {
  const cos = direction.x * leaf.axis.x + direction.y * leaf.axis.y;
  const sin = direction.x * leaf.axis.y - direction.y * leaf.axis.x;
  const across = leaf.across[sideOf(leaf, direction)];
  const denominator = Math.hypot(across * cos, leaf.along * sin);
  return denominator > 0 ? (leaf.along * across) / denominator : leaf.along;
}

/** A true angle as a unit drawn direction, with how much longer a true length is once drawn along it. */
function drawnDirection(angleDegrees: number, horizontalStretch: number): { direction: Position; drawnPerTrue: number } {
  const radians = toRadians(angleDegrees);
  const drawnPerTrue = Math.hypot(Math.cos(radians) * horizontalStretch, Math.sin(radians));
  return { direction: { x: (Math.cos(radians) * horizontalStretch) / drawnPerTrue, y: Math.sin(radians) / drawnPerTrue }, drawnPerTrue };
}

/** From a box's centre to its edge along a unit direction; a rectangle is symmetric, so the reversed direction gives the same. */
function edgeDistance(size: Size, direction: Position): number {
  const viaX = direction.x !== 0 ? size.width / 2 / Math.abs(direction.x) : Infinity;
  const viaY = direction.y !== 0 ? size.height / 2 / Math.abs(direction.y) : Infinity;
  return Math.min(viaX, viaY);
}

/** A marker's rendered scale: the fan's derived scale under the author's multipliers. */
function renderedMarkerScale(marker: Placed, fanScale: number, adjustments: MapAdjustments): number {
  return fanScale * (adjustments.markerScale ?? 1) * (adjustments.boxes[marker.box.address]?.scale ?? 1);
}

/**
 * Put the fan's markers on the leaf at the given fan scale; a dragged length
 * stays. Leaf and markers are taken at their rendered sizes, so the author's
 * W, M, `<` and `>` move the markers with the edges they grow (§3 Manual
 * scales); the ring never moves.
 */
function placeFan(landmark: Placed, fan: Placed[], fanScale: number, adjustments: MapAdjustments, params: MapGeometryParams): void {
  const overrides = adjustments.boxes;
  const renderedScales = new Map(fan.map(marker => [marker, renderedMarkerScale(marker, fanScale, adjustments)]));
  const markerSizes = fan.map(marker => scaled(marker.base, renderedScales.get(marker)!));
  const leaf = leafEllipse(landmark, markerSizes, overrides[landmark.box.address]?.leaf ?? 1, params);
  for (const marker of fan) {
    marker.length = overrides[marker.box.address]?.length ?? leafLength(leaf, marker, renderedScales.get(marker)!, params.horizontalStretch);
  }
}

/** What a landmark's sector budget decided. */
interface SectorBudget {
  landmarkScale: number;
  fanScale: number;
  sideClearances: SideClearances;
}

/**
 * Share a landmark's sector arc out (docs/map-view.md §3), per side. The
 * sector reaches half way to each ring neighbour, and its two halves differ
 * when the neighbours are unevenly spaced, which they are whenever a node's
 * edges were seeded on several maps. Each half's arc is its drawn length at
 * the landmark's radius, so the horizontal stretch counts. Along the
 * tangent, the box takes its share of the arc or its full size, the largest
 * marker its share or its default size, the clearance its share or its
 * uncrowded value, each whichever is smaller; what is left is breathing
 * space. The box and the fan are symmetric about the landmark, so their
 * scales come from the narrower half, as if the sector were twice it; the
 * clearance is per side, so the leaf uses the room where it is
 * (2026-09-28; the average of the two halves let a leaf reach into a narrow
 * side by what the wide side had paid for). Sizes along the tangent are
 * pitches, see `pitchAlong`: a box pointing up spends its width, one
 * pointing sideways its height, one on a diagonal something between, so a
 * crowded ring's landmarks differ in scale by direction. Scales never go
 * below the floor.
 */
function sectorBudget(landmark: Placed, landmarks: Placed[], fan: Placed[], params: MapGeometryParams): SectorBudget {
  const radians = toRadians(landmark.angle);
  const stretch = params.horizontalStretch;
  // The ring's drawn tangent at the landmark, and the drawn length of one radian of ring there.
  const tangentLength = Math.hypot(-Math.sin(radians) * stretch, Math.cos(radians));
  const tangent = { x: (-Math.sin(radians) * stretch) / tangentLength, y: Math.cos(radians) / tangentLength };
  const halves = halfSectors(landmark, landmarks);
  const arcPerDegree = (Math.PI / HALF_TURN) * landmark.length * tangentLength;
  const halfArcs: SideClearances = { before: halves.before * arcPerDegree, after: halves.after * arcPerDegree };
  const narrowArc = 2 * Math.min(halfArcs.before, halfArcs.after);

  const shares = normalisedShares(params.arcShares);
  const landmarkPitch = pitchAlong(landmark.base, tangent);
  const landmarkScale = landmarkPitch > 0 ? withinScale((shares.landmark * narrowArc) / landmarkPitch, 1, params.landmarkFloor) : 1;
  const nominal = params.markerScale * landmarkScale;
  const markerPitch = Math.max(0, ...fan.map(marker => pitchAlong(marker.base, tangent)));
  const fanScale = markerPitch > 0 ? withinScale((shares.marker * narrowArc) / markerPitch, nominal, params.scaleFloor) : nominal;
  const roomy = params.leafClearance * landmark.base.height * landmarkScale;
  const sideClearances: SideClearances = {
    before: Math.min(roomy, shares.clearance * 2 * halfArcs.before),
    after: Math.min(roomy, shares.clearance * 2 * halfArcs.after),
  };
  return { landmarkScale, fanScale, sideClearances };
}

/**
 * How far each landmark is drawn from its stored direction so that the ring
 * stays readable (docs/map-view.md §3 Drawn directions). A landmark's need
 * is the half-sector at which the budget would give it the readable floor:
 * its pitch along the tangent at that floor, over the box's share, through
 * the arc per degree at its radius.
 *
 * The ring is cut at its widest gap and read as a line. Landmarks are taken
 * in order; one that would sit closer to the block before it than their
 * needs allow joins that block, which is then placed as a whole so that its
 * members' displacements cancel, and a block that now touches the block
 * before it merges with it. So three landmarks on one direction become one
 * block, spaced by their needs and centred on where they were, rather than
 * two pushed apart and a third left behind (the pairwise relaxation tried
 * first did that, 2026-10-02). Order is kept by construction. Displacements
 * are capped last, so a ring that is genuinely full saturates its caps and
 * the budget shrinks what is left. `landmarks` sorted by stored angle.
 */
function relaxRing(landmarks: Placed[], params: MapGeometryParams): Map<Address, number> {
  const count = landmarks.length;
  const deviations = new Map<Address, number>(landmarks.map(landmark => [landmark.box.address, 0]));
  if (count < 2 || params.landmarkDeviation <= 0) return deviations;

  const shares = normalisedShares(params.arcShares);
  const halfNeeds = landmarks.map(landmark => {
    const radians = toRadians(landmark.angle);
    const tangentLength = Math.hypot(-Math.sin(radians) * params.horizontalStretch, Math.cos(radians));
    const tangent = { x: (-Math.sin(radians) * params.horizontalStretch) / tangentLength, y: Math.cos(radians) / tangentLength };
    const arcPerDegree = (Math.PI / HALF_TURN) * landmark.length * tangentLength;
    const pitch = pitchAlong(landmark.base, tangent);
    return shares.landmark > 0 && arcPerDegree > 0 ? (params.landmarkFloor * pitch) / (2 * shares.landmark * arcPerDegree) : 0;
  });

  // Cut at the widest gap, then unroll the stored angles into one increasing run.
  const gaps = landmarks.map((landmark, index) => normalizeBearing(landmarks[(index + 1) % count].angle - landmark.angle));
  const cut = gaps.indexOf(Math.max(...gaps));
  const order = [...Array(count).keys()].map(step => (cut + 1 + step) % count);
  const unrolled: number[] = [landmarks[order[0]].angle];
  for (let step = 1; step < count; step++) unrolled.push(unrolled[step - 1] + gaps[order[step - 1]]);

  // Blocks of landmarks that touch: each member at the block's offset plus its relative place, the offset cancelling the displacements.
  interface Block { members: number[]; relative: number[]; offset: number }
  const blocks: Block[] = [];
  const placeOf = (block: Block, member: number): number => block.offset + block.relative[member];
  for (let step = 0; step < count; step++) {
    blocks.push({ members: [step], relative: [0], offset: unrolled[step] });
    while (blocks.length >= 2) {
      const last = blocks[blocks.length - 1];
      const previous = blocks[blocks.length - 2];
      const lastOfPrevious = previous.members.length - 1;
      const need = halfNeeds[order[previous.members[lastOfPrevious]]] + halfNeeds[order[last.members[0]]];
      if (placeOf(last, 0) >= placeOf(previous, lastOfPrevious) + need) break;
      const base = previous.relative[lastOfPrevious] + need;
      const merged: Block = {
        members: [...previous.members, ...last.members],
        relative: [...previous.relative, ...last.relative.map(value => base + value)],
        offset: 0,
      };
      merged.offset = merged.members.reduce((sum, member, index) => sum + unrolled[member] - merged.relative[index], 0) / merged.members.length;
      blocks.splice(blocks.length - 2, 2, merged);
    }
  }

  // Compress, never clamp. A block whose members would move farther than the cap
  // is shrunk as a whole toward the stored angles until its largest displacement
  // is the cap: members keep their order and their proportions. Capping each
  // member on its own could swap two neighbours (seen 2026-10-03). The drawn
  // order is the stored order (§3 Drawn directions).
  const cap = params.landmarkDeviation;
  const places = new Array<number>(count);
  for (const block of blocks) {
    const displacements = block.members.map((member, index) => placeOf(block, index) - unrolled[member]);
    const largest = Math.max(...displacements.map(Math.abs));
    const factor = largest > cap ? cap / largest : 1;
    block.members.forEach((member, index) => {
      places[member] = unrolled[member] + displacements[index] * factor;
    });
  }

  // The run must not close the gap it was cut at, or the last landmark would
  // pass the first on the other side; the whole run is compressed the same way.
  const first = order[0];
  const last = order[count - 1];
  const gapNeeded = halfNeeds[first] + halfNeeds[last];
  const storedSpan = unrolled[count - 1] - unrolled[0];
  const placedSpan = places[count - 1] - places[0];
  const spanAllowed = Math.max(storedSpan, FULL_TURN - gapNeeded);
  if (placedSpan > spanAllowed) {
    const factor = placedSpan > storedSpan ? (spanAllowed - storedSpan) / (placedSpan - storedSpan) : 0;
    for (let step = 0; step < count; step++) places[step] = unrolled[step] + (places[step] - unrolled[step]) * factor;
  }

  for (let step = 0; step < count; step++) {
    // Should be impossible after the two compressions; said aloud rather than silently drawn if it ever is.
    if (step > 0 && places[step] < places[step - 1]) {
      console.warn(`[Map geometry] relaxRing reordered ${landmarks[order[step - 1]].box.address} and ${landmarks[order[step]].box.address}`);
    }
    deviations.set(landmarks[order[step]].box.address, places[step] - unrolled[step]);
  }
  return deviations;
}

/** A landmark's half-sectors in degrees: half the angular gap to the previous neighbour and to the next, `landmarks` sorted by angle; a half turn each alone. */
function halfSectors(landmark: Placed, landmarks: Placed[]): SideClearances {
  if (landmarks.length < 2) return { before: HALF_TURN, after: HALF_TURN };
  const index = landmarks.indexOf(landmark);
  const previous = landmarks[(index + landmarks.length - 1) % landmarks.length];
  const next = landmarks[(index + 1) % landmarks.length];
  return { before: normalizeBearing(landmark.angle - previous.angle) / 2, after: normalizeBearing(next.angle - landmark.angle) / 2 };
}

/** The shares as fractions of the arc: the landmark once, the other three on both sides. */
function normalisedShares(shares: ArcShares): { landmark: number; marker: number; clearance: number } {
  const total = shares.landmark + 2 * (shares.marker + shares.clearance + shares.breathing);
  if (total <= 0) return { landmark: 1, marker: 0, clearance: 0 };
  return { landmark: shares.landmark / total, marker: shares.marker / total, clearance: shares.clearance / total };
}

/** `value` capped at `ceiling`, and no lower than `floor` of the ceiling. */
function withinScale(value: number, ceiling: number, floor: number): number {
  return Math.max(ceiling * floor, Math.min(ceiling, value));
}

/**
 * A box's pitch along a unit direction: the offset at which a copy of it,
 * moved that way, clears it. Boxes are axis-aligned, so they clear on
 * either axis, and along a diagonal they slide past each other long before
 * their shadows on the direction would separate; the shadow (width × |x| +
 * height × |y|) was tried first and shrank every diagonal landmark for a
 * collision that could not happen.
 */
function pitchAlong(size: Size, direction: Position): number {
  return 2 * edgeDistance(size, direction);
}

/** Enough to place the fan scale within a hundredth of a percent of its range. */
const BISECTION_STEPS = 14;

/**
 * The marker scale of one fan: the budget's, lowered until every pair of
 * neighbouring markers clears by `markerGap`; never below the floor of its
 * default, where overlap is accepted. The leaf shrinks with the markers, so
 * each scale tried places the fan afresh. Bisection between a scale that fits
 * and one that does not always returns one that fits, whether or not fitting
 * is monotone in the scale. The caller places the fan at the result.
 */
function fitFan(landmark: Placed, fan: Placed[], budgeted: number, adjustments: MapAdjustments, params: MapGeometryParams): number {
  const floor = params.markerScale * landmark.derivedScale * params.scaleFloor;
  const fits = (markerScale: number): boolean => {
    placeFan(landmark, fan, markerScale, adjustments, params);
    return markersClear(fan, markerScale, params);
  };
  if (fits(budgeted)) return budgeted;
  if (budgeted <= floor || !fits(floor)) return Math.min(budgeted, floor);
  let fitting = floor;
  let failing = budgeted;
  for (let step = 0; step < BISECTION_STEPS; step++) {
    const middle = (fitting + failing) / 2;
    if (fits(middle)) fitting = middle;
    else failing = middle;
  }
  return fitting;
}

/** Whether every pair of markers neighbouring in angle clears by `markerGap` at the given scale, where the fan is placed. */
function markersClear(fan: Placed[], markerScale: number, params: MapGeometryParams): boolean {
  if (fan.length < 2) return true;
  const sorted = [...fan].sort((left, right) => left.angle - right.angle);
  return sorted.every((left, index) => {
    const right = sorted[(index + 1) % sorted.length];
    const a = offsetAlong(ORIGIN, left.angle, left.length, params.horizontalStretch);
    const b = offsetAlong(ORIGIN, right.angle, right.length, params.horizontalStretch);
    return boxPairScale(scaled(left.base, markerScale), scaled(right.base, markerScale), a, b, params.markerGap) >= 1;
  });
}

function scaled(size: Size, scale: number): Size {
  return { width: size.width * scale, height: size.height * scale };
}

/**
 * The largest scale up to 1 at which two boxes of the given sizes at scale 1,
 * at fixed positions, clear by `gap` half-diagonals on either axis: box and
 * gap shrink together, so each axis gives a bound and the easier axis wins.
 */
function boxPairScale(left: Size, right: Size, a: Position, b: Position, gap: number): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const gapAtOne = gap * (halfDiagonal(left) + halfDiagonal(right)) / 2;
  const needX = (left.width + right.width) / 2 + gapAtOne;
  const needY = (left.height + right.height) / 2 + gapAtOne;
  const viaX = needX > 0 ? dx / needX : Infinity;
  const viaY = needY > 0 ? dy / needY : Infinity;
  return Math.min(1, Math.max(viaX, viaY));
}
