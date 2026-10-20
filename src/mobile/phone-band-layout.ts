/**
 * Phone band layout (docs/mobile-viewer.md §5.3), the landscape layout
 *
 * A phone held sideways is wide and short, and boxes are wide and short too:
 * a row of them reads as a line, a column does not. So this is not the
 * portrait layout with its axes swapped (that was tried on 2026-10-20 and
 * stacked boxes along their wide side, which holds few and reads badly); it
 * is three horizontal bands:
 *
 *   above     one row of landmarks across the width
 *   middle    the focus, with landmarks beside it, left and right
 *   below     one row of landmarks across the width
 *
 * The same three facts of a stored direction are kept as upright: order
 * around the focus, left stays left, above stays above. A landmark goes to
 * the band its direction says; one within `middleBand` of straight left or
 * right may go beside the focus instead, the most horizontal first, as many
 * as the middle has room for at full size. Within a row the boxes sit left to
 * right in stored order, each where its direction points, pushed apart only
 * as far as clearing each other needs. The row above aligns on its bottom
 * edges and the row below on its top edges, so each shows a straight edge to
 * the focus. Beside the focus, at most two a side: one wholly above the
 * centre line and one wholly below, so the line to the far one passes clear
 * of the near one and the fan of lines opens; a lone one is set a little up
 * or down by its direction. The middle band is as tall as the focus or that
 * pair, and the rows stand off its edge.
 *
 * One common size. A row too long for the width may split in two, the more
 * vertical boxes in the far row, or the map may shrink; whichever leaves the
 * boxes larger wins, found by search since the band's height moves with the
 * size. The focus keeps a clearance on every side so each line has a shaft to
 * carry its arrowhead.
 *
 * Pure. Positions are in pixels at zoom 1, the focus at the origin.
 */

import type { EdgeId, NodeId } from '../core/main-types';
import {
  bearingBetween,
  lineAngle,
  normalizeBearing,
  signedAngleBetween,
  type EdgeEnds,
  type MapLayout,
  type Position,
  type Size,
} from '../features/map-view/geometry';
import { firstLineByAddress, type Address, type MapBox, type MapTree } from '../features/map-view/map-tree';

export interface PhoneBandParams {
  /** The focus is drawn no wider than this fraction of the surface's width. */
  focusMaxWidth: number;
  /** The common scale of the landmarks: as large as fits, between these. */
  landmarkScaleMax: number;
  landmarkScaleMin: number;
  /** Clear space kept between two boxes, in pixels. */
  gap: number;
  /** Clear space kept between a box and the surface's edge, in pixels. */
  edgeMargin: number;
  /** Clear space kept between the focus and any landmark, in pixels, so a line is long enough to carry its arrowhead. */
  focusClearance: number;
  /** Within this many degrees of straight left or right a landmark may sit beside the focus. */
  middleBand: number;
  /** How far a box beside the focus is set up or down for a direction straight up or down, in pixels; scaled by the sine. */
  middleOffset: number;
}

type Band = 'above' | 'middle' | 'below';

interface Landmark {
  box: MapBox;
  /** The stored direction, degrees, 0 east, clockwise on screen. */
  bearing: number;
  /** Size at scale 1. */
  base: Size;
  band: Band;
}

/** A row's boxes left to right. */
interface Row {
  /** -1 above the focus, +1 below. */
  sign: -1 | 1;
  boxes: Landmark[];
}

/** The boxes beside the focus, each side nearest the focus first. */
interface Beside {
  left: Landmark[];
  right: Landmark[];
}

/** At most this many boxes beside the focus on a side: one above the centre line and one below; a third would sit behind one of them on the line from the focus. */
const BESIDE_MAX = 2;
const BISECTION_STEPS = 16;

/** What the placement needs about the surface and the focus. */
interface Frame {
  surface: Size;
  focusSize: Size;
  params: PhoneBandParams;
}

const HALF_TURN = 180;
const WEST = 180;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / HALF_TURN;
}

/** How far a direction is from the horizontal, 0 for straight left or right, 90 for straight up or down. */
function steepness(bearing: number): number {
  return Math.min(Math.abs(signedAngleBetween(0, bearing)), Math.abs(signedAngleBetween(WEST, bearing)));
}

export function layoutPhoneBands(
  tree: MapTree,
  endsByEdge: Map<EdgeId, EdgeEnds>,
  surface: Size,
  baseSizes: Map<NodeId, Size>,
  params: PhoneBandParams
): MapLayout {
  const focusBox = tree.boxes[0];
  const focusBase = baseSizes.get(focusBox.nodeId) ?? { width: 1, height: 1 };
  const focusScale = Math.min(1, (params.focusMaxWidth * surface.width) / focusBase.width);
  const frame: Frame = { surface, focusSize: { width: focusBase.width * focusScale, height: focusBase.height * focusScale }, params };

  const landmarks = landmarksOf(tree, endsByEdge, baseSizes);
  assignMiddle(landmarks, frame);
  const beside: Beside = { left: besideOf(landmarks, 'left'), right: besideOf(landmarks, 'right') };
  const { rows, scale } = bestPlan(rowOf(landmarks, -1), rowOf(landmarks, 1), beside, frame);

  const positions = new Map<Address, Position>([[focusBox.address, { x: 0, y: 0 }]]);
  const rowEdge = middleHalf(beside, scale, frame) + params.focusClearance;
  placeRows(rows.filter(row => row.sign < 0), rowEdge, scale, frame, positions);
  placeRows(rows.filter(row => row.sign > 0), rowEdge, scale, frame, positions);
  placeBeside(beside.left, -1, scale, frame, positions);
  placeBeside(beside.right, 1, scale, frame, positions);

  const lengths = new Map<Address, number>([[focusBox.address, 0]]);
  const scales = new Map<Address, number>([[focusBox.address, focusScale]]);
  const deviations = new Map<Address, number>();
  for (const landmark of landmarks) {
    const position = positions.get(landmark.box.address);
    if (!position) throw new Error(`Phone band layout: ${landmark.box.address} not placed`);
    lengths.set(landmark.box.address, Math.hypot(position.x, position.y));
    scales.set(landmark.box.address, scale);
    deviations.set(landmark.box.address, signedAngleBetween(landmark.bearing, bearingBetween({ x: 0, y: 0 }, position)));
  }
  return { positions, lengths, scales, derived: { deviations, landmarks: new Map(), fans: new Map(), sideClearances: new Map() } };
}

// ============================================================================
// BANDS
// ============================================================================

/** Every landmark with its stored direction and the band its half says; the middle is assigned afterwards. */
function landmarksOf(tree: MapTree, endsByEdge: Map<EdgeId, EdgeEnds>, baseSizes: Map<NodeId, Size>): Landmark[] {
  const lineByAddress = firstLineByAddress(tree);
  const landmarks: Landmark[] = [];
  for (const box of tree.boxes) {
    if (box.depth !== 1) continue;
    const line = lineByAddress.get(box.address);
    const ends = line ? endsByEdge.get(line.edgeId) : undefined;
    if (!line || !ends) throw new Error(`Phone band layout: no direction for ${box.address}`);
    const bearing = normalizeBearing(lineAngle(ends, line.reversed));
    const base = baseSizes.get(box.nodeId) ?? { width: 1, height: 1 };
    // On screen y grows downward, so a positive sine is below the focus; straight left or right counts as below until the middle takes it.
    landmarks.push({ box, bearing, base, band: Math.sin(toRadians(bearing)) < 0 ? 'above' : 'below' });
  }
  return landmarks;
}

function isLeft(landmark: Landmark): boolean {
  return Math.cos(toRadians(landmark.bearing)) < 0;
}

/** The room beside the focus on one side, from the focus's clearance to the margin. */
function besideRoom({ surface, focusSize, params }: Frame): number {
  return surface.width / 2 - params.edgeMargin - focusSize.width / 2 - params.focusClearance;
}

/**
 * Moves landmarks beside the focus: on each side, those within the middle
 * band, the most horizontal first, while they fit the side's room at full
 * size. The rest stay in the row their half says.
 */
function assignMiddle(landmarks: Landmark[], frame: Frame): void {
  const { params } = frame;
  for (const left of [true, false]) {
    const candidates = landmarks
      .filter(landmark => isLeft(landmark) === left && steepness(landmark.bearing) <= params.middleBand)
      .sort((a, b) => steepness(a.bearing) - steepness(b.bearing));
    let used = 0;
    let taken = 0;
    for (const candidate of candidates) {
      if (taken === BESIDE_MAX) break;
      const width = candidate.base.width * params.landmarkScaleMax;
      const needed = taken === 0 ? width : used + params.gap + width;
      if (needed > besideRoom(frame)) break;
      candidate.band = 'middle';
      used = needed;
      taken += 1;
    }
  }
}

/** The row on one side of the focus, left to right: clockwise from west over the top for above, from east under the bottom for below. */
function rowOf(landmarks: Landmark[], sign: -1 | 1): Row {
  const band: Band = sign < 0 ? 'above' : 'below';
  const key = (landmark: Landmark): number => (sign < 0 ? landmark.bearing : WEST - landmark.bearing);
  return { sign, boxes: landmarks.filter(landmark => landmark.band === band).sort((a, b) => key(a) - key(b)) };
}

/** The boxes beside the focus on one side, nearest the focus first: the most horizontal nearest. */
function besideOf(landmarks: Landmark[], side: 'left' | 'right'): Landmark[] {
  return landmarks
    .filter(landmark => landmark.band === 'middle' && isLeft(landmark) === (side === 'left'))
    .sort((a, b) => steepness(a.bearing) - steepness(b.bearing));
}

// ============================================================================
// SIZE
// ============================================================================

function tallest(boxes: Landmark[]): number {
  return Math.max(0, ...boxes.map(box => box.base.height));
}

/** What boxes in a line take across, at `scale`: their widths and the gaps between. */
function lineWidth(boxes: Landmark[], scale: number, gap: number): number {
  if (boxes.length === 0) return 0;
  return boxes.reduce((sum, box) => sum + box.base.width * scale, 0) + (boxes.length - 1) * gap;
}

/**
 * Half the middle band's height at `scale`: the focus, or on either side the
 * pair stacked about the centre line (each clear of it by half a gap) or the
 * lone box at its offset, whichever reaches farthest.
 */
function middleHalf(beside: Beside, scale: number, { focusSize, params }: Frame): number {
  const reach = (side: Landmark[]): number => {
    if (side.length === 0) return 0;
    if (side.length === 1) return Math.abs(Math.sin(toRadians(side[0].bearing))) * params.middleOffset + (side[0].base.height * scale) / 2;
    return params.gap / 2 + tallest(side) * scale;
  };
  return Math.max(focusSize.height / 2, reach(beside.left), reach(beside.right));
}

/** What one side's rows take vertically at `scale`, from the clearance line outward. */
function rowsHeight(rows: Row[], scale: number, gap: number): number {
  if (rows.length === 0) return 0;
  return rows.reduce((sum, row) => sum + tallest(row.boxes) * scale, 0) + (rows.length - 1) * gap;
}

/** Whether everything fits the surface at `scale`: rows across, rows and the middle band up and down, the beside boxes in their room. */
function fits(rows: Row[], beside: Beside, scale: number, frame: Frame): boolean {
  const { surface, params } = frame;
  const across = surface.width - 2 * params.edgeMargin;
  if (rows.some(row => lineWidth(row.boxes, scale, params.gap) > across)) return false;
  if (lineWidth(beside.left, scale, params.gap) > besideRoom(frame) || lineWidth(beside.right, scale, params.gap) > besideRoom(frame)) return false;
  const room = surface.height / 2 - params.edgeMargin - params.focusClearance - middleHalf(beside, scale, frame);
  for (const sign of [-1, 1]) {
    if (rowsHeight(rows.filter(row => row.sign === sign), scale, params.gap) > room) return false;
  }
  return true;
}

/** The largest value in [low, high] that passes `ok`, by bisection; `low` when nothing passes. */
function largestFitting(low: number, high: number, ok: (value: number) => boolean): number {
  if (ok(high)) return high;
  if (!ok(low)) return low;
  let lo = low;
  let hi = high;
  for (let step = 0; step < BISECTION_STEPS; step++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * A row's two-row form: the most vertical boxes go to the far row while they
 * fit the width at full size, the rest stay near. Null when the row cannot be
 * split that way.
 */
function splitOf(row: Row, { surface, params }: Frame): Row[] | null {
  if (row.boxes.length < 2) return null;
  const byVertical = [...row.boxes].sort((a, b) => steepness(b.bearing) - steepness(a.bearing));
  const far = new Set<Landmark>();
  let used = 0;
  for (const box of byVertical) {
    const width = box.base.width * params.landmarkScaleMax;
    const needed = far.size === 0 ? width : used + params.gap + width;
    if (needed > surface.width - 2 * params.edgeMargin) break;
    far.add(box);
    used = needed;
  }
  if (far.size === 0 || far.size === row.boxes.length) return null;
  return [
    { sign: row.sign, boxes: row.boxes.filter(box => !far.has(box)) },
    { sign: row.sign, boxes: row.boxes.filter(box => far.has(box)) },
  ];
}

/**
 * The rows and the size: each side as one row or two, every combination
 * fitted, and the one that leaves the boxes largest wins; at equal size the
 * fewer rows. The size is found by search, since the middle band's height
 * depends on it.
 */
function bestPlan(above: Row, below: Row, beside: Beside, frame: Frame): { rows: Row[]; scale: number } {
  const { landmarkScaleMin, landmarkScaleMax } = frame.params;
  const forms = (row: Row): Row[][] => {
    if (row.boxes.length === 0) return [[]];
    const split = splitOf(row, frame);
    return split ? [[row], split] : [[row]];
  };
  let best: { rows: Row[]; scale: number } | null = null;
  for (const aboveRows of forms(above)) {
    for (const belowRows of forms(below)) {
      const rows = [...aboveRows, ...belowRows];
      const scale = largestFitting(landmarkScaleMin, landmarkScaleMax, candidate => fits(rows, beside, candidate, frame));
      if (!best || scale > best.scale || (scale === best.scale && rows.length < best.rows.length)) best = { rows, scale };
    }
  }
  if (!best) throw new Error('Phone band layout: no plan');
  return best;
}

// ============================================================================
// PLACE
// ============================================================================

/** How far from the centre a box may sit without crossing the side margin. */
function reachOf(landmark: Landmark, scale: number, { surface, params }: Frame): number {
  return Math.max(0, surface.width / 2 - params.edgeMargin - (landmark.base.width * scale) / 2);
}

/**
 * A row's x positions: each box where its direction points, then pushed
 * right and pushed left until neighbours clear each other, in order. When the
 * row does not fit even so (only at the floor) the boxes overrun the margin
 * rather than each other.
 */
function rowXs(boxes: Landmark[], scale: number, frame: Frame): number[] {
  const { gap } = frame.params;
  const xs = boxes.map(box => Math.cos(toRadians(box.bearing)) * reachOf(box, scale, frame));
  const apart = (index: number): number => ((boxes[index - 1].base.width + boxes[index].base.width) * scale) / 2 + gap;
  for (let index = 1; index < xs.length; index++) xs[index] = Math.max(xs[index], xs[index - 1] + apart(index));
  const last = xs.length - 1;
  xs[last] = Math.min(xs[last], reachOf(boxes[last], scale, frame));
  for (let index = last - 1; index >= 0; index--) xs[index] = Math.min(xs[index], xs[index + 1] - apart(index + 1));
  return xs;
}

/** Rows on one side, the near one first: its boxes' edges facing the focus on the line at `rowEdge`, the far row's beyond it by the gap. */
function placeRows(rows: Row[], rowEdge: number, scale: number, frame: Frame, positions: Map<Address, Position>): void {
  const { params } = frame;
  let edge = rowEdge;
  for (const row of rows) {
    const xs = rowXs(row.boxes, scale, frame);
    row.boxes.forEach((landmark, index) => {
      positions.set(landmark.box.address, { x: xs[index], y: row.sign * (edge + (landmark.base.height * scale) / 2) });
    });
    edge += tallest(row.boxes) * scale + params.gap;
  }
}

/**
 * The boxes beside the focus on one side, nearest first, spread over the
 * side's room: the far box at the margin, the room left over shared out
 * before each box, so the lines run long and the side is used. A pair sits
 * one wholly above the centre line and one wholly below, the more upward
 * direction up, so the line to the far box passes clear of the near one. A
 * lone box is set up or down by its direction.
 */
function placeBeside(beside: Landmark[], sign: -1 | 1, scale: number, frame: Frame, positions: Map<Address, Position>): void {
  if (beside.length === 0) return;
  const { focusSize, params } = frame;
  const rise = (landmark: Landmark): number => Math.sin(toRadians(landmark.bearing));
  const upper = beside.length === 2 && rise(beside[1]) < rise(beside[0]) ? beside[1] : beside[0];
  const spare = Math.max(0, (besideRoom(frame) - lineWidth(beside, scale, params.gap)) / beside.length);
  let edge = focusSize.width / 2 + params.focusClearance;
  for (const landmark of beside) {
    const width = landmark.base.width * scale;
    const height = landmark.base.height * scale;
    const y = beside.length === 2 ? (landmark === upper ? -1 : 1) * (params.gap / 2 + height / 2) : rise(landmark) * params.middleOffset;
    edge += spare;
    positions.set(landmark.box.address, { x: sign * (edge + width / 2), y });
    edge += width + params.gap;
  }
}
