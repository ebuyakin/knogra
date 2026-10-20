/**
 * Phone row layout (docs/mobile-viewer.md §5.3), the portrait layout
 *
 * A stored direction was chosen on a canvas about twice as wide as tall.
 * Honoured to the degree on a screen half as wide as tall it wastes the long
 * axis and spends the short one: the landmarks east and west of the focus
 * shrink to squeeze beside it while the top and bottom of the screen stay
 * empty (seen 2026-10-19). So on a tall screen the direction is kept as three
 * facts, not as an angle:
 *
 *   order     going around the focus, the landmarks come in their stored order
 *   side      a landmark east of the focus is drawn to its right, west to its left
 *   half      above stays above, below stays below
 *
 * A landmark within `horizontalBand` of straight left or right has no half of
 * its own and takes the one that balances the picture. It cannot share the
 * focus's row: the focus plus two boxes never fit across a phone.
 *
 * The picture is then rows: the focus alone in the middle row, at most one
 * landmark on each side of every other row. Rows are spread evenly between
 * the focus and the edge on each side; across its row a landmark sits where
 * its direction points, a nearly vertical one close above the focus, a nearly
 * horizontal one at the edge, and the two in a row are pushed apart if they
 * would touch. A pair too wide to share a row even pushed to the margins is
 * not shrunk: it takes a double-height row, one box in each half, the more
 * horizontal one nearer the focus. One common scale, the maximum unless the
 * rows do not fit the height; width alone never shrinks the map, except for
 * a single box wider than the screen.
 *
 * Every row on a side gets the same band, sized for the tallest box among
 * the landmarks. Box heights are much alike upright, so the shorter boxes
 * keep a little slack around them and the rows keep a regular rhythm; that
 * slack is what the stagger uses. (Sizing each band to its own boxes was
 * tried on 2026-10-20 and gave bigger boxes with no room between them; the
 * regular band is the better trade upright.)
 *
 * Order is kept by construction: each side is one column in clockwise order
 * cut at north and south, the halves and the band are contiguous in that
 * order, and rows fill from the focus outward.
 *
 * Upright only. A phone held sideways is not this problem with the axes
 * swapped: boxes are wide and short, a row of them reads as a line and a
 * column does not; the sideways layout is its own module.
 *
 * Pure. Positions are in pixels at zoom 1, the focus at the origin.
 */

import type { EdgeId, NodeId } from '../core/main-types';
import { lineAngle, normalizeBearing, type EdgeEnds, type MapLayout, type Position, type Size } from '../features/map-view/geometry';
import { firstLineByAddress, type Address, type MapBox, type MapTree } from '../features/map-view/map-tree';

export interface PhoneRowParams {
  /** The focus is drawn no wider than this fraction of the surface's width. */
  focusMaxWidth: number;
  /** The common scale of the landmarks: as large as fits, between these. */
  landmarkScaleMax: number;
  landmarkScaleMin: number;
  /** Clear space kept between two boxes, in pixels. */
  gap: number;
  /** Clear space kept between a box and the surface's edge, in pixels. */
  edgeMargin: number;
  /** Clear space kept between the focus and the nearest row, in pixels: a line is clipped by both boxes, and what shows must be long enough to carry its arrowhead. */
  focusClearance: number;
  /** Within this many degrees of straight left or right a landmark belongs to neither half and goes where there is room. */
  horizontalBand: number;
  /** Rows are never spread farther apart than this fraction of the surface's height, so a lone row stays near the focus. */
  rowPitchMax: number;
  /** How far the two boxes of a row are set off from its line, as a fraction of the row's pitch, so that unequal boxes do not sit in near symmetry. */
  rowStagger: number;
}

type Side = 'left' | 'right';
type Half = 'above' | 'below' | 'either';

interface Landmark {
  box: MapBox;
  /** The stored direction, degrees, 0 east, clockwise on screen. */
  bearing: number;
  /** Size at scale 1. */
  base: Size;
  side: Side;
  half: Half;
}

/** One side's landmarks after the halves are settled, each list nearest the focus first. */
interface Column {
  above: Landmark[];
  below: Landmark[];
}

interface Split {
  right: Column;
  left: Column;
  rowsAbove: number;
  rowsBelow: number;
}

/**
 * A row, measured in units of one box height: a plain row is one unit, a
 * row whose pair is too wide to share it is two, one box in each.
 */
interface Row {
  /** -1 above the focus, +1 below. */
  sign: -1 | 1;
  /** Units between the focus and this row on its side. */
  start: number;
  units: 1 | 2;
  /** Units on this side in all, the measure the side's room is divided by. */
  sideUnits: number;
  left: Landmark | null;
  right: Landmark | null;
}

/** What the placement needs about the surface and the focus. */
interface Frame {
  surface: Size;
  focusSize: Size;
  params: PhoneRowParams;
}

const HALF_TURN = 180;
const FULL_TURN = 360;
/** Bearings of the compass points, 0 east, clockwise on screen. */
const SOUTH = 90;
const WEST = 180;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / HALF_TURN;
}

function toDegrees(radians: number): number {
  return (radians * HALF_TURN) / Math.PI;
}

/** The signed difference `to - from` in degrees, in (-180, 180]. */
function turnBetween(from: number, to: number): number {
  const turn = normalizeBearing(to - from);
  return turn > HALF_TURN ? turn - FULL_TURN : turn;
}

export function layoutPhoneRows(
  tree: MapTree,
  endsByEdge: Map<EdgeId, EdgeEnds>,
  surface: Size,
  baseSizes: Map<NodeId, Size>,
  params: PhoneRowParams
): MapLayout {
  const focusBox = tree.boxes[0];
  const focusBase = baseSizes.get(focusBox.nodeId) ?? { width: 1, height: 1 };
  const focusScale = Math.min(1, (params.focusMaxWidth * surface.width) / focusBase.width);
  const frame: Frame = { surface, focusSize: { width: focusBase.width * focusScale, height: focusBase.height * focusScale }, params };

  const landmarks = landmarksOf(tree, endsByEdge, baseSizes, params.horizontalBand);
  const split = splitHalves(columnOf(landmarks, 'right'), columnOf(landmarks, 'left'));
  const rows = rowsOf(split, frame);
  const scale = scaleFor(rows, frame);
  const placed = place(rows, scale, frame);

  const positions = new Map<Address, Position>([[focusBox.address, { x: 0, y: 0 }]]);
  const lengths = new Map<Address, number>([[focusBox.address, 0]]);
  const scales = new Map<Address, number>([[focusBox.address, focusScale]]);
  const deviations = new Map<Address, number>();
  for (const landmark of landmarks) {
    const position = placed.get(landmark.box.address);
    if (!position) throw new Error(`Phone row layout: ${landmark.box.address} not placed`);
    positions.set(landmark.box.address, position);
    lengths.set(landmark.box.address, Math.hypot(position.x, position.y));
    scales.set(landmark.box.address, scale);
    deviations.set(landmark.box.address, turnBetween(landmark.bearing, normalizeBearing(toDegrees(Math.atan2(position.y, position.x)))));
  }
  return { positions, lengths, scales, derived: { deviations, landmarks: new Map(), fans: new Map(), sideClearances: new Map() } };
}

// ============================================================================
// SIDES AND HALVES
// ============================================================================

/** Every landmark with its stored direction, its side and, unless it is nearly horizontal, its half. */
function landmarksOf(tree: MapTree, endsByEdge: Map<EdgeId, EdgeEnds>, baseSizes: Map<NodeId, Size>, horizontalBand: number): Landmark[] {
  const lineByAddress = firstLineByAddress(tree);
  const landmarks: Landmark[] = [];
  for (const box of tree.boxes) {
    if (box.depth !== 1) continue;
    const line = lineByAddress.get(box.address);
    const ends = line ? endsByEdge.get(line.edgeId) : undefined;
    if (!line || !ends) throw new Error(`Phone row layout: no direction for ${box.address}`);
    const bearing = normalizeBearing(lineAngle(ends, line.reversed));
    const base = baseSizes.get(box.nodeId) ?? { width: 1, height: 1 };
    landmarks.push({ box, bearing, base, side: sideOf(bearing), half: halfOf(bearing, horizontalBand) });
  }
  return landmarks;
}

/** Straight up and straight down count as right, so a map's one vertical landmark has a column. */
function sideOf(bearing: number): Side {
  return Math.cos(toRadians(bearing)) >= 0 ? 'right' : 'left';
}

function halfOf(bearing: number, horizontalBand: number): Half {
  const fromHorizontal = Math.min(Math.abs(turnBetween(0, bearing)), Math.abs(turnBetween(WEST, bearing)));
  if (fromHorizontal <= horizontalBand) return 'either';
  // On screen y grows downward, so a positive sine is below the focus.
  return Math.sin(toRadians(bearing)) > 0 ? 'below' : 'above';
}

/**
 * One side's landmarks top to bottom. Going clockwise from north the right
 * side runs north, east, south; going on from south the left side runs south,
 * west, north, which read top to bottom is the reverse. Both keys grow from
 * top to bottom, so sorting on them keeps the stored order.
 */
function columnOf(landmarks: Landmark[], side: Side): Landmark[] {
  const key = (landmark: Landmark): number =>
    side === 'right' ? normalizeBearing(landmark.bearing + SOUTH) : normalizeBearing(SOUTH - landmark.bearing);
  return landmarks.filter(landmark => landmark.side === side).sort((a, b) => key(a) - key(b));
}

/**
 * Settles the nearly horizontal landmarks. In a column read top to bottom the
 * `above` ones come first, then the undecided band, then the `below` ones; the
 * only freedom is how many of the band go up. The two columns are decided
 * together because a row holds one of each: the choice that needs the fewest
 * rows on the fuller side wins (that side sets the scale), then the fewest
 * rows in all, then the one sending more of the band up.
 */
function splitHalves(right: Landmark[], left: Landmark[]): Split {
  const bandRight = bandOf(right);
  const bandLeft = bandOf(left);
  let best: Split | null = null;
  let bestScore: [number, number] | null = null;
  for (let upRight = bandRight.size; upRight >= 0; upRight--) {
    for (let upLeft = bandLeft.size; upLeft >= 0; upLeft--) {
      const candidate = splitAt(right, bandRight.start + upRight, left, bandLeft.start + upLeft);
      const score: [number, number] = [Math.max(candidate.rowsAbove, candidate.rowsBelow), candidate.rowsAbove + candidate.rowsBelow];
      if (bestScore && (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] >= bestScore[1]))) continue;
      best = candidate;
      bestScore = score;
    }
  }
  if (!best) throw new Error('Phone row layout: no split');
  return best;
}

/** Where the nearly horizontal landmarks sit in a column read top to bottom, and how many there are. */
function bandOf(column: Landmark[]): { start: number; size: number } {
  const start = column.findIndex(landmark => landmark.half !== 'above');
  if (start === -1) return { start: column.length, size: 0 };
  const size = column.slice(start).filter(landmark => landmark.half === 'either').length;
  return { start, size };
}

/** The columns cut at the given indices: everything before a cut is above the focus, nearest the focus first. */
function splitAt(right: Landmark[], cutRight: number, left: Landmark[], cutLeft: number): Split {
  const rightColumn: Column = { above: right.slice(0, cutRight).reverse(), below: right.slice(cutRight) };
  const leftColumn: Column = { above: left.slice(0, cutLeft).reverse(), below: left.slice(cutLeft) };
  return {
    right: rightColumn,
    left: leftColumn,
    rowsAbove: Math.max(rightColumn.above.length, leftColumn.above.length),
    rowsBelow: Math.max(rightColumn.below.length, leftColumn.below.length),
  };
}

/** The rows, each filled from the focus outward on both sides; a row whose pair is too wide gets two units. */
function rowsOf(split: Split, frame: Frame): Row[] {
  const rows: Row[] = [];
  for (const sign of [-1, 1] as const) {
    const right = sign < 0 ? split.right.above : split.right.below;
    const left = sign < 0 ? split.left.above : split.left.below;
    const count = Math.max(right.length, left.length);
    const side: Row[] = [];
    let start = 0;
    for (let index = 0; index < count; index++) {
      const pair = { left: left[index] ?? null, right: right[index] ?? null };
      const units = isWidePair(pair.left, pair.right, frame) ? 2 : 1;
      side.push({ sign, start, units, sideUnits: 0, ...pair });
      start += units;
    }
    for (const row of side) row.sideUnits = start;
    rows.push(...side);
  }
  return rows;
}

/** Whether two boxes at the maximum scale cannot share a row even pushed to the margins. */
function isWidePair(left: Landmark | null, right: Landmark | null, { surface, params }: Frame): boolean {
  if (!left || !right) return false;
  return (left.base.width + right.base.width) * params.landmarkScaleMax + params.gap > surface.width - 2 * params.edgeMargin;
}

// ============================================================================
// SIZE AND PLACE
// ============================================================================

/** The vertical room for rows on one side of the focus: from the focus's edge plus its clearance to the surface's margin. */
function sideRoom({ surface, focusSize, params }: Frame): number {
  return surface.height / 2 - params.edgeMargin - focusSize.height / 2 - params.focusClearance;
}

/** The largest common scale at which each side's units fit its room and every box alone fits the width, not below the floor. */
function scaleFor(rows: Row[], frame: Frame): number {
  const { surface, params } = frame;
  const { landmarkScaleMax, landmarkScaleMin, gap, edgeMargin } = params;
  const landmarks = rows.flatMap(row => [row.left, row.right]).filter((landmark): landmark is Landmark => landmark !== null);
  if (landmarks.length === 0) return landmarkScaleMax;
  let scale = landmarkScaleMax;
  const tallest = Math.max(...landmarks.map(landmark => landmark.base.height));
  for (const row of rows) scale = Math.min(scale, (sideRoom(frame) / row.sideUnits - gap) / tallest);
  for (const landmark of landmarks) scale = Math.min(scale, (surface.width - 2 * edgeMargin) / landmark.base.width);
  return Math.max(landmarkScaleMin, scale);
}

/** How far from the centre a box of this landmark may sit without crossing the margin. */
function reachOf(landmark: Landmark, scale: number, { surface, params }: Frame): number {
  return Math.max(0, surface.width / 2 - params.edgeMargin - (landmark.base.width * scale) / 2);
}

/** Across the row, where the direction points: the cosine of the bearing, scaled to the reach. */
function directedX(landmark: Landmark, scale: number, frame: Frame): number {
  return Math.cos(toRadians(landmark.bearing)) * reachOf(landmark, scale, frame);
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Every landmark's position: the centre of its row's unit on its side, its
 * directed x; the pair of a plain row pushed apart to clear each other, the
 * pair of a double row one unit each.
 */
function place(rows: Row[], scale: number, frame: Frame): Map<Address, Position> {
  const { surface, focusSize, params } = frame;
  const room = sideRoom(frame);
  const positions = new Map<Address, Position>();
  for (const row of rows) {
    const pitch = Math.min(room / row.sideUnits, params.rowPitchMax * surface.height);
    const yAt = (unit: number): number => row.sign * (focusSize.height / 2 + params.focusClearance + (unit + 0.5) * pitch);
    if (row.units === 2 && row.left && row.right) {
      const [near, far] = nearerFirst(row.left, row.right);
      positions.set(near.box.address, { x: directedX(near, scale, frame), y: yAt(row.start) });
      positions.set(far.box.address, { x: directedX(far, scale, frame), y: yAt(row.start + 1) });
      continue;
    }
    const y = yAt(row.start);
    let xLeft = row.left ? directedX(row.left, scale, frame) : 0;
    let xRight = row.right ? directedX(row.right, scale, frame) : 0;
    let stagger = 0;
    if (row.left && row.right) {
      const need = ((row.left.base.width + row.right.base.width) * scale) / 2 + params.gap;
      const short = need - (xRight - xLeft);
      if (short > 0) {
        // Each takes half; whatever the margin refuses one of them, the other takes.
        xLeft = clamp(xLeft - short / 2, reachOf(row.left, scale, frame));
        xRight = clamp(xLeft + need, reachOf(row.right, scale, frame));
        xLeft = clamp(xRight - need, reachOf(row.left, scale, frame));
      }
      stagger = staggerOf(row.left, row.right, scale, pitch, params);
    }
    if (row.left) positions.set(row.left.box.address, { x: xLeft, y: y - row.sign * stagger * nearSign(row.left, row.right) });
    if (row.right) positions.set(row.right.box.address, { x: xRight, y: y - row.sign * stagger * nearSign(row.right, row.left) });
  }
  return positions;
}

/**
 * Of a pair, the more horizontal one sits nearer the focus, the more vertical
 * one farther out, as their directions say; at equal steepness the smaller
 * one is nearer. Decides which box of a double row takes the near unit, and
 * which way each box of a plain row is set off.
 */
function nearerFirst(left: Landmark, right: Landmark): [Landmark, Landmark] {
  const rise = (landmark: Landmark): number => Math.abs(Math.sin(toRadians(landmark.bearing)));
  const area = (landmark: Landmark): number => landmark.base.width * landmark.base.height;
  if (rise(left) !== rise(right)) return rise(left) < rise(right) ? [left, right] : [right, left];
  return area(left) <= area(right) ? [left, right] : [right, left];
}

/** +1 if `landmark` is the nearer of the pair, -1 if the farther; 0 without a partner. */
function nearSign(landmark: Landmark, partner: Landmark | null): number {
  if (!partner) return 0;
  return nearerFirst(landmark, partner)[0] === landmark ? 1 : -1;
}

/**
 * How far a plain row's pair is set off its line, one box toward the focus
 * and one away: the wanted fraction of the pitch, but no more than the slack
 * either box has in its band, so the row never closes on its neighbours. On
 * a crowded map the slack is nil and the pair stays aligned.
 */
function staggerOf(left: Landmark, right: Landmark, scale: number, pitch: number, params: PhoneRowParams): number {
  const slack = (landmark: Landmark): number => pitch / 2 - (landmark.base.height * scale) / 2 - params.gap;
  return Math.max(0, Math.min(params.rowStagger * pitch, slack(left), slack(right)));
}
