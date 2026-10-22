/**
 * Line crossings (docs/mobile-viewer.md §5.3)
 *
 * Which landmarks of a laid-out one-ring map have their line from the focus
 * passing through another landmark's box, and where along the line. The
 * layouts place boxes by direction and size and never look at the lines, so
 * on a crowded map a line to a far row runs behind a box of the near row. The
 * drawing hides such a line where it passes (phone-map.ts); a count over a
 * library of maps says how crowded the layouts really are.
 *
 * Pure geometry over the layout's output: a box is the rectangle of its
 * natural size at its scale around its position, a line the segment from the
 * focus's centre to the landmark's centre. The drawn line is the part of that
 * segment outside both end boxes, and the crossing is reported as fractions
 * of the drawn line, which is what the drawing positions a gradient by.
 */

import type { NodeId } from '../core/main-types';
import type { MapLayout, Position, Size } from '../features/map-view/geometry';
import type { Address, MapTree } from '../features/map-view/map-tree';

interface Rectangle {
  address: Address;
  centre: Position;
  size: Size;
}

/** The interval of t, for points `from + t * (to - from)`, on which the segment is inside something. */
type Interval = [number, number];

/** One stretch of a line behind a box, as fractions of the drawn line from the focus's edge to the landmark's edge. */
export interface Hole {
  start: number;
  end: number;
}

/** A line that runs behind other landmarks' boxes: its holes in order from the focus, overlapping ones merged, and the drawn line's length in pixels. */
export interface CrossedLine {
  holes: Hole[];
  length: number;
}

/** By landmark address: where its line is hidden behind other landmarks' boxes. Landmarks whose line passes clear are absent. */
export function crossedLines(tree: MapTree, layout: MapLayout, baseSizes: Map<NodeId, Size>): Map<Address, CrossedLine> {
  const rectangles = new Map<Address, Rectangle>();
  for (const box of tree.boxes) {
    const centre = layout.positions.get(box.address);
    const base = baseSizes.get(box.nodeId);
    if (!centre || !base) continue;
    const scale = layout.scales.get(box.address) ?? 1;
    rectangles.set(box.address, { address: box.address, centre, size: { width: base.width * scale, height: base.height * scale } });
  }
  const focus = rectangles.get(tree.boxes[0].address);
  if (!focus) return new Map();
  const landmarks = tree.boxes.filter(box => box.depth === 1).map(box => rectangles.get(box.address)).filter((r): r is Rectangle => r !== undefined);

  const crossed = new Map<Address, CrossedLine>();
  for (const landmark of landmarks) {
    // The drawn line, in t: from where the segment leaves the focus to where it enters the landmark.
    const drawnStart = segmentInside(focus.centre, landmark.centre, focus)?.[1] ?? 0;
    const drawnEnd = segmentInside(focus.centre, landmark.centre, landmark)?.[0] ?? 1;
    if (drawnEnd <= drawnStart) continue;
    const intervals: Interval[] = [];
    for (const other of landmarks) {
      if (other === landmark) continue;
      const inside = segmentInside(focus.centre, landmark.centre, other);
      if (inside) intervals.push(inside);
    }
    if (intervals.length === 0) continue;
    const span = drawnEnd - drawnStart;
    const fraction = (t: number): number => Math.max(0, Math.min(1, (t - drawnStart) / span));
    const holes = mergeIntervals(intervals).map(([start, end]) => ({ start: fraction(start), end: fraction(end) }));
    const length = span * Math.hypot(landmark.centre.x - focus.centre.x, landmark.centre.y - focus.centre.y);
    crossed.set(landmark.address, { holes, length });
  }
  return crossed;
}

/** The intervals in order, each overlapping or touching pair joined into one. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * The part of the segment from `from` to `to` inside the rectangle, as an
 * interval of t within [0, 1], or null when the segment misses it. On each
 * axis the points inside the rectangle's span form one interval of t, and the
 * segment is inside where the two intervals and [0, 1] overlap.
 */
function segmentInside(from: Position, to: Position, rectangle: Rectangle): Interval | null {
  const spanX = axisInterval(from.x, to.x, rectangle.centre.x - rectangle.size.width / 2, rectangle.centre.x + rectangle.size.width / 2);
  const spanY = axisInterval(from.y, to.y, rectangle.centre.y - rectangle.size.height / 2, rectangle.centre.y + rectangle.size.height / 2);
  if (!spanX || !spanY) return null;
  const start = Math.max(0, spanX[0], spanY[0]);
  const end = Math.min(1, spanX[1], spanY[1]);
  return start <= end ? [start, end] : null;
}

/** The interval of t for which `from + t * (to - from)` lies in [low, high] on one axis; null when it never does. */
function axisInterval(from: number, to: number, low: number, high: number): Interval | null {
  const delta = to - from;
  if (delta === 0) return from >= low && from <= high ? [-Infinity, Infinity] : null;
  const a = (low - from) / delta;
  const b = (high - from) / delta;
  return [Math.min(a, b), Math.max(a, b)];
}
