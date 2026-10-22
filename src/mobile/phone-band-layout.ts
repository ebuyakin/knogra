/**
 * Phone band layout (docs/mobile-viewer.md §5.3), the landscape layout
 *
 * A phone in landscape is wide and short, and boxes are wide and short too:
 * a row of them reads as a line, a column does not. So this is not the
 * portrait layout with its axes swapped (that was tried on 2026-10-20 and
 * stacked boxes along their wide side, which holds few and reads badly); it
 * is three horizontal bands:
 *
 *   above     one row of landmarks across the width
 *   middle    the focus, with landmarks beside it, left and right
 *   below     one row of landmarks across the width
 *
 * The same three facts of a stored direction are kept as in portrait: order
 * around the focus, left stays left, above stays above. A landmark goes to
 * the band its direction says; one within `middleBand` of straight left or
 * right may go beside the focus instead, the most horizontal first, as long
 * as it comes out no smaller there than in its row. Within a row the boxes sit left to
 * right in stored order, each where its direction points, pushed apart only
 * as far as clearing each other needs. The row above rests on one line and
 * the row below hangs from one, each box set off that line away from the
 * focus by its steepness, so the row bends slightly around the focus instead
 * of ruling a straight edge (a straight edge was the rule until 2026-10-21;
 * portrait had the stagger already). Beside the focus, at most two a side: one wholly above the
 * centre line and one wholly below, so the line to the far one passes clear
 * of the near one and the fan of lines opens; a lone one is set a little up
 * or down by its direction. The middle band is as tall as the focus or that
 * pair, and the rows stand off its edge.
 *
 * Size is per box, as in portrait (phone-row-layout.ts): each landmark takes the
 * largest scale that fits, never above `scaleMax`. A line of boxes
 * (a row, or one side's beside boxes) shares its width and comes down
 * together when it would overrun. The middle band is a slot like the rows':
 * the usable height shared equally, a third with rows on both sides, never
 * less than the focus. The boxes beside the focus fit that slot, and the
 * rows share what the middle band actually takes from the rest, in equal
 * slots. (Letting the beside boxes grow until the rows had only their
 * minimum was tried on 2026-10-21 and squeezed the rows to nothing beside a
 * pair of images.) A row too long for the width may split in two, the
 * more vertical boxes in the far row; the form that leaves its smallest box
 * largest wins. (One common size for every landmark was the rule until
 * 2026-10-21, found by search; it shrank the title boxes with the image
 * boxes while the screen stayed empty.) The focus keeps a clearance on every
 * side so each line has a shaft to carry its arrowhead.
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
  /** The largest scale of any box, the focus included: below natural size, so that three bands of boxes share a short screen. */
  scaleMax: number;
  /** The smallest scale a landmark may reach. */
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
  /** How far a row's box may be set off the row's line away from the focus, as a fraction of the row's slot, so that the boxes of a row do not sit in a straight line. */
  rowStagger: number;
}

type Band = 'above' | 'middle' | 'below';

interface Landmark {
  box: MapBox;
  /** The stored direction, degrees, 0 east, clockwise on screen. */
  bearing: number;
  /** Size at scale 1. */
  base: Size;
  band: Band;
  /** The half its direction says, kept when it moves to the middle: the row it would otherwise be in. */
  half: 'above' | 'below';
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

/** A landmark's drawn scale. */
type ScaleOf = (landmark: Landmark) => number;

/** At most this many boxes beside the focus on a side: one above the centre line and one below; a third would sit behind one of them on the line from the focus. */
const BESIDE_MAX = 2;

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
  const focusScale = Math.min(params.scaleMax, (params.focusMaxWidth * surface.width) / focusBase.width);
  const frame: Frame = { surface, focusSize: { width: focusBase.width * focusScale, height: focusBase.height * focusScale }, params };

  const landmarks = landmarksOf(tree, endsByEdge, baseSizes);
  const limit = middleHalfLimit(landmarks, frame);
  assignMiddle(landmarks, limit, frame);
  const beside: Beside = { left: besideOf(landmarks, 'left'), right: besideOf(landmarks, 'right') };
  const besideScales = besideScalesOf(beside, limit, frame);
  const { rows, scales } = bestPlan(rowOf(landmarks, -1), rowOf(landmarks, 1), beside, besideScales, frame);
  const scaleOf: ScaleOf = landmark => {
    const scale = scales.get(landmark.box.address);
    if (scale === undefined) throw new Error(`Phone band layout: no scale for ${landmark.box.address}`);
    return scale;
  };

  const positions = new Map<Address, Position>([[focusBox.address, { x: 0, y: 0 }]]);
  const rowEdge = middleHalf(beside, scaleOf, frame) + params.focusClearance;
  const room = rowsRoom(beside, scaleOf, frame);
  for (const sign of [-1, 1]) {
    const sideRows = rows.filter(row => row.sign === sign);
    placeRows(sideRows, rowEdge, slotOf(sideRows.length, room, params.gap), scaleOf, frame, positions);
  }
  placeBeside(beside.left, -1, scaleOf, frame, positions);
  placeBeside(beside.right, 1, scaleOf, frame, positions);

  const lengths = new Map<Address, number>([[focusBox.address, 0]]);
  scales.set(focusBox.address, focusScale);
  const deviations = new Map<Address, number>();
  for (const landmark of landmarks) {
    const position = positions.get(landmark.box.address);
    if (!position) throw new Error(`Phone band layout: ${landmark.box.address} not placed`);
    lengths.set(landmark.box.address, Math.hypot(position.x, position.y));
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
    const half = Math.sin(toRadians(bearing)) < 0 ? 'above' : 'below';
    landmarks.push({ box, bearing, base, band: half, half });
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
 * Half the height the middle band may take: the usable height shared
 * equally with the rows, a third with rows on both sides, a half with rows
 * on one, all of it with none; never less than the focus. Reckoned before
 * any landmark moves to the middle, while every one is in a row.
 */
function middleHalfLimit(landmarks: Landmark[], { surface, focusSize, params }: Frame): number {
  const sides = (landmarks.some(landmark => landmark.band === 'above') ? 1 : 0) + (landmarks.some(landmark => landmark.band === 'below') ? 1 : 0);
  const usable = surface.height - 2 * params.edgeMargin - sides * params.focusClearance;
  return Math.max(focusSize.height, usable / (sides + 1)) / 2;
}

/** The largest scale at which a box fits the middle band up and down: a pair stacks about the centre line, a lone box sits at its offset, as middleHalf reckons them. */
function besideFit(landmark: Landmark, paired: boolean, limit: number, params: PhoneBandParams): number {
  const offset = Math.abs(Math.sin(toRadians(landmark.bearing))) * params.middleOffset;
  return paired ? (limit - params.gap / 2) / landmark.base.height : (2 * (limit - offset)) / landmark.base.height;
}

/**
 * Moves landmarks beside the focus: on each side, those within the middle
 * band, the most horizontal first, as long as each of the side's boxes comes
 * out no smaller beside the focus than it would in its row, one row a side
 * assumed. The rest stay in the row their half says.
 */
function assignMiddle(landmarks: Landmark[], limit: number, frame: Frame): void {
  const { surface, params } = frame;
  const across = surface.width - 2 * params.edgeMargin;
  const rowRoom = surface.height / 2 - params.edgeMargin - params.focusClearance - limit;
  const inRow = (landmark: Landmark): number => {
    const row = landmarks.filter(other => other === landmark || other.band === landmark.half);
    return Math.min(rowRoom / landmark.base.height, lineShare(row, across, params));
  };
  for (const left of [true, false]) {
    const candidates = landmarks
      .filter(landmark => isLeft(landmark) === left && steepness(landmark.bearing) <= params.middleBand)
      .sort((a, b) => steepness(a.bearing) - steepness(b.bearing));
    const taken: Landmark[] = [];
    for (const candidate of candidates) {
      if (taken.length === BESIDE_MAX) break;
      const group = [...taken, candidate];
      const share = lineShare(group, besideRoom(frame), params);
      const paired = group.length === 2;
      if (!group.every(landmark => Math.min(share, besideFit(landmark, paired, limit, params)) >= inRow(landmark))) break;
      candidate.band = 'middle';
      taken.push(candidate);
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

/** The tallest drawn box in a line. */
function lineHeight(boxes: Landmark[], scaleOf: ScaleOf): number {
  return Math.max(0, ...boxes.map(box => box.base.height * scaleOf(box)));
}

/** What boxes in a line take across: their drawn widths and the gaps between. */
function lineWidth(boxes: Landmark[], scaleOf: ScaleOf, gap: number): number {
  if (boxes.length === 0) return 0;
  return boxes.reduce((sum, box) => sum + box.base.width * scaleOf(box), 0) + (boxes.length - 1) * gap;
}

/**
 * Half the middle band's height: the focus, or on either side the pair
 * stacked about the centre line (each clear of it by half a gap) or the lone
 * box at its offset, whichever reaches farthest.
 */
function middleHalf(beside: Beside, scaleOf: ScaleOf, { focusSize, params }: Frame): number {
  const reach = (side: Landmark[]): number => {
    if (side.length === 0) return 0;
    if (side.length === 1) return Math.abs(Math.sin(toRadians(side[0].bearing))) * params.middleOffset + lineHeight(side, scaleOf) / 2;
    return params.gap / 2 + lineHeight(side, scaleOf);
  };
  return Math.max(focusSize.height / 2, reach(beside.left), reach(beside.right));
}

/** The height one side's rows have, beyond the middle band and the clearance, to the margin. */
function rowsRoom(beside: Beside, scaleOf: ScaleOf, frame: Frame): number {
  const { surface, params } = frame;
  return surface.height / 2 - params.edgeMargin - params.focusClearance - middleHalf(beside, scaleOf, frame);
}

/** A side's rows share its room in equal slots, a gap between. */
function slotOf(count: number, room: number, gap: number): number {
  return count === 0 ? 0 : (room - (count - 1) * gap) / count;
}

/** The scale a line's boxes share across `room`: the maximum, or less for all of them in the same proportion when they would overrun it. */
function lineShare(boxes: Landmark[], room: number, params: PhoneBandParams): number {
  const { scaleMax, gap } = params;
  const gaps = Math.max(0, boxes.length - 1) * gap;
  const needed = lineWidth(boxes, () => scaleMax, gap);
  return needed > room ? scaleMax * ((room - gaps) / (needed - gaps)) : scaleMax;
}

/** The scales of the boxes beside the focus: each side's line shares the side's room across, and each box fits the middle band up and down. */
function besideScalesOf(beside: Beside, limit: number, frame: Frame): Map<Address, number> {
  const { params } = frame;
  const scales = new Map<Address, number>();
  for (const side of [beside.left, beside.right]) {
    const share = lineShare(side, besideRoom(frame), params);
    for (const landmark of side) {
      scales.set(landmark.box.address, Math.max(params.landmarkScaleMin, Math.min(share, besideFit(landmark, side.length === 2, limit, params))));
    }
  }
  return scales;
}

/**
 * The scales of the rows' boxes, given the middle band: each side's rows
 * share the height left beyond the band in equal slots; within a row the
 * boxes share the width. Each box takes the largest scale both allow.
 */
function rowScalesOf(rows: Row[], beside: Beside, besideScales: Map<Address, number>, frame: Frame): Map<Address, number> {
  const { surface, params } = frame;
  const besideScale: ScaleOf = landmark => besideScales.get(landmark.box.address) ?? params.landmarkScaleMin;
  const room = rowsRoom(beside, besideScale, frame);
  const across = surface.width - 2 * params.edgeMargin;
  const scales = new Map<Address, number>();
  for (const sign of [-1, 1]) {
    const sideRows = rows.filter(row => row.sign === sign);
    if (sideRows.length === 0) continue;
    const slot = slotOf(sideRows.length, room, params.gap);
    for (const row of sideRows) {
      const share = lineShare(row.boxes, across, params);
      for (const landmark of row.boxes) {
        scales.set(landmark.box.address, Math.max(params.landmarkScaleMin, Math.min(share, slot / landmark.base.height)));
      }
    }
  }
  return scales;
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
    const width = box.base.width * params.scaleMax;
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

interface Plan {
  rows: Row[];
  /** Every landmark's scale, the beside boxes' included. */
  scales: Map<Address, number>;
  /** The smallest scale among the rows' boxes; the measure a plan is judged by. */
  least: number;
}

/**
 * The rows and their sizes: each side as one row or two, every combination
 * sized, and the one that leaves its smallest box largest wins; at a tie the
 * fewer rows.
 */
function bestPlan(above: Row, below: Row, beside: Beside, besideScales: Map<Address, number>, frame: Frame): Plan {
  const forms = (row: Row): Row[][] => {
    if (row.boxes.length === 0) return [[]];
    const split = splitOf(row, frame);
    return split ? [[row], split] : [[row]];
  };
  let best: Plan | null = null;
  for (const aboveRows of forms(above)) {
    for (const belowRows of forms(below)) {
      const rows = [...aboveRows, ...belowRows];
      const rowScales = rowScalesOf(rows, beside, besideScales, frame);
      const least = Math.min(Infinity, ...rowScales.values());
      if (!best || least > best.least || (least === best.least && rows.length < best.rows.length)) {
        best = { rows, scales: new Map([...besideScales, ...rowScales]), least };
      }
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
 * row does not fit even so (only at the minimum scale) the boxes overrun the margin
 * rather than each other.
 */
function rowXs(boxes: Landmark[], scaleOf: ScaleOf, frame: Frame): number[] {
  const { gap } = frame.params;
  const xs = boxes.map(box => Math.cos(toRadians(box.bearing)) * reachOf(box, scaleOf(box), frame));
  const width = (box: Landmark): number => box.base.width * scaleOf(box);
  const apart = (index: number): number => (width(boxes[index - 1]) + width(boxes[index])) / 2 + gap;
  for (let index = 1; index < xs.length; index++) xs[index] = Math.max(xs[index], xs[index - 1] + apart(index));
  const last = xs.length - 1;
  xs[last] = Math.min(xs[last], reachOf(boxes[last], scaleOf(boxes[last]), frame));
  for (let index = last - 1; index >= 0; index--) xs[index] = Math.min(xs[index], xs[index + 1] - apart(index + 1));
  return xs;
}

/**
 * Rows on one side, the near one first, each in its slot: its boxes' edges
 * facing the focus on the line at `rowEdge`, the far row's a slot and a gap
 * beyond. A box is set off that line away from the focus by its steepness,
 * a nearly vertical one the most and a nearly horizontal one not at all, so
 * the row bends slightly around the focus instead of ruling a straight line;
 * never beyond the room the box leaves in its slot.
 */
function placeRows(rows: Row[], rowEdge: number, slot: number, scaleOf: ScaleOf, frame: Frame, positions: Map<Address, Position>): void {
  const { params } = frame;
  let edge = rowEdge;
  for (const row of rows) {
    const xs = rowXs(row.boxes, scaleOf, frame);
    row.boxes.forEach((landmark, index) => {
      const height = landmark.base.height * scaleOf(landmark);
      const stagger = Math.max(0, Math.min(params.rowStagger * slot, slot - height)) * Math.abs(Math.sin(toRadians(landmark.bearing)));
      positions.set(landmark.box.address, { x: xs[index], y: row.sign * (edge + height / 2 + stagger) });
    });
    edge += slot + params.gap;
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
function placeBeside(beside: Landmark[], sign: -1 | 1, scaleOf: ScaleOf, frame: Frame, positions: Map<Address, Position>): void {
  if (beside.length === 0) return;
  const { focusSize, params } = frame;
  const rise = (landmark: Landmark): number => Math.sin(toRadians(landmark.bearing));
  const upper = beside.length === 2 && rise(beside[1]) < rise(beside[0]) ? beside[1] : beside[0];
  const spare = Math.max(0, (besideRoom(frame) - lineWidth(beside, scaleOf, params.gap)) / beside.length);
  let edge = focusSize.width / 2 + params.focusClearance;
  for (const landmark of beside) {
    const width = landmark.base.width * scaleOf(landmark);
    const height = landmark.base.height * scaleOf(landmark);
    const y = beside.length === 2 ? (landmark === upper ? -1 : 1) * (params.gap / 2 + height / 2) : rise(landmark) * params.middleOffset;
    edge += spare;
    positions.set(landmark.box.address, { x: sign * (edge + width / 2), y });
    edge += width + params.gap;
  }
}
