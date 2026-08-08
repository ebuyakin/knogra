/**
 * Grid tools — snap the selection into a regular lattice, axis-aligned or
 * turned 45° onto the diagonals.
 *
 * The "official diagram" arrangement. Note that Circle already produces a
 * square for four nodes — but a *rotated* one, since it picks the phase that
 * minimises travel. What makes a diagram read as deliberate is **a fixed
 * orientation**, which is what these tools add: four nodes land as a clean 2×2,
 * or as a clean North/East/South/West diamond, both awkward to achieve by hand.
 *
 * Cell assignment follows the current arrangement rather than overriding it:
 * nodes are sorted by Y into rows, then each row is sorted by X. Four scattered
 * nodes keep their top/bottom and left/right relationships; only the geometry is
 * regularised.
 *
 * The lattice is a **rectangle, not a forced square**: column and row spacing
 * are derived independently, so a naturally wide arrangement stays wide. Each
 * spacing follows the same rule as the circle's radius — the larger of the
 * selection's current spread and the minimum that fits the nodes — so the tool
 * never introduces overlap and never yanks a deliberate layout into a box. The
 * diagonal variant is the one exception: it needs square cells, because only a
 * square rotates into a compass-aligned diamond.
 */

import type { Position } from 'cytoscape';
import type { NodeId } from '../../../core/main-types';
import type { ArrangeInput, ArrangeNode, ArrangeTool } from './types';

function centroidOf(nodes: ArrangeNode[]): Position {
  let x = 0;
  let y = 0;
  for (const node of nodes) {
    x += node.position.x;
    y += node.position.y;
  }
  return { x: x / nodes.length, y: y / nodes.length };
}

/** Distance between the extreme node centres along one axis. */
function spreadOf(nodes: ArrangeNode[], axis: 'x' | 'y'): number {
  let min = Infinity;
  let max = -Infinity;
  for (const node of nodes) {
    const value = node.position[axis];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min;
}

/**
 * Uniform step between lattice lines: whichever is larger of the selection's
 * existing spread per interval and the step that fits the biggest node.
 */
function latticeStep(currentSpread: number, lines: number, largestExtent: number, gap: number): number {
  const preserved = lines > 1 ? currentSpread / (lines - 1) : 0;
  return Math.max(preserved, largestExtent + gap);
}

/**
 * @param fixedStep When given, used for both axes instead of deriving them from
 *   the selection. The diagonal variant needs it: its spacing has to be worked
 *   out in world coordinates (see `diagonalGridTargets`), and its cells must be
 *   square — rotating a *rectangle* by 45° puts its corners at oblique angles.
 */
function latticeTargets(input: ArrangeInput, fixedStep?: number): Map<NodeId, Position> {
  const { nodes, params } = input;
  const footprintScale = params.footprintScale ?? 1;
  const gap = params.siblingGap ?? 0;

  const columns = Math.ceil(Math.sqrt(nodes.length));
  const rows = Math.ceil(nodes.length / columns);

  // Rows first (top to bottom), then left to right within each row — so the
  // existing arrangement decides who ends up where.
  const byRow = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const ordered: ArrangeNode[] = [];
  for (let row = 0; row < rows; row++) {
    const slice = byRow.slice(row * columns, (row + 1) * columns);
    slice.sort((a, b) => a.position.x - b.position.x);
    ordered.push(...slice);
  }

  let widest = 0;
  let tallest = 0;
  for (const node of nodes) {
    widest = Math.max(widest, node.footprint.width * footprintScale);
    tallest = Math.max(tallest, node.footprint.height * footprintScale);
  }

  let columnStep = latticeStep(spreadOf(nodes, 'x'), columns, widest, gap);
  let rowStep = latticeStep(spreadOf(nodes, 'y'), rows, tallest, gap);
  if (fixedStep !== undefined) {
    columnStep = fixedStep;
    rowStep = fixedStep;
  }

  // Centre the full lattice on the selection's centroid. A short final row keeps
  // its column positions rather than being centred, so the columns stay aligned.
  const centre = centroidOf(nodes);
  const originX = centre.x - ((columns - 1) / 2) * columnStep;
  const originY = centre.y - ((rows - 1) / 2) * rowStep;

  const targets = new Map<NodeId, Position>();
  ordered.forEach((node, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    targets.set(node.id, {
      x: originX + column * columnStep,
      y: originY + row * rowStep,
    });
  });
  return targets;
}

export const gridTool: ArrangeTool = {
  id: 'grid',
  label: 'Grid',
  group: 'shape',
  // Below four there is no lattice worth forming — three nodes would give an
  // L-shape, not a grid.
  minNodes: 4,
  compute: (input: ArrangeInput) => latticeTargets(input),
};

/** Half a right angle — the lattice's tilt for the diagonal variant. */
const DIAGONAL_ANGLE = Math.PI / 4;

function rotateAbout(position: Position, centre: Position, cos: number, sin: number): Position {
  const dx = position.x - centre.x;
  const dy = position.y - centre.y;
  return {
    x: centre.x + dx * cos - dy * sin,
    y: centre.y + dx * sin + dy * cos,
  };
}

/**
 * World-space pitch of the diamond lattice — the horizontal and vertical
 * distance between neighbouring lattice lines, from which the rotated-frame
 * step follows as `pitch·√2`.
 *
 * Rotated 45°, the lattice lands on a **checkerboard**: world positions
 * `(i+j)·pitch` across and `(i−j)·pitch` down, so occupied cells are `2·pitch`
 * apart horizontally and vertically, and `(pitch, pitch)` apart diagonally.
 * Three conditions therefore keep boxes clear, and the third is the reason the
 * naive "reserve the node's width along the diagonal" rule sizes so badly: a
 * diagonal neighbour only has to clear in **one** of the two axes, so the
 * binding term is the node's *smaller* dimension, not its diagonal extent.
 */
function diagonalPitch(nodes: ArrangeNode[], footprintScale: number, gap: number): number {
  let widest = 0;
  let tallest = 0;
  for (const node of nodes) {
    widest = Math.max(widest, node.footprint.width * footprintScale);
    tallest = Math.max(tallest, node.footprint.height * footprintScale);
  }
  return Math.max(
    (widest + gap) / 2,              // horizontal neighbours, 2·pitch apart
    (tallest + gap) / 2,             // vertical neighbours, 2·pitch apart
    Math.min(widest, tallest) + gap  // diagonal neighbours, clearing on one axis
  );
}

/**
 * The same lattice, computed in a 45°-rotated frame: rotate the selection back
 * by 45°, lay out the grid, rotate the result forward again. Four nodes then
 * land on the compass points — North / East / South / West — which is the
 * arrangement this variant exists for; nine give a 3×3 diamond lattice.
 *
 * **Sizing is computed in world coordinates, not inherited from the grid.** The
 * axis-aligned grid keeps its result inside the space the selection already
 * occupied by deriving each step from the current spread along that axis; doing
 * the same in the rotated frame compounds two √2 factors and the diamond
 * inflates off-screen. Instead the pitch is set directly so that the lattice's
 * world bounding box — `(columns + rows − 2)·pitch` on both sides, since a
 * diamond is as tall as it is wide — matches the selection's larger current
 * spread, floored by what actually fits (`diagonalPitch`).
 *
 * Cell assignment still happens in the rotated frame, so the selection's
 * existing diagonal orientation decides which node ends up North.
 */
function diagonalGridTargets(input: ArrangeInput): Map<NodeId, Position> {
  const { nodes, params } = input;
  const centre = centroidOf(nodes);
  const cos = Math.cos(DIAGONAL_ANGLE);
  const sin = Math.sin(DIAGONAL_ANGLE);

  const columns = Math.ceil(Math.sqrt(nodes.length));
  const rows = Math.ceil(nodes.length / columns);

  const spans = columns + rows - 2;
  const currentSpread = Math.max(spreadOf(nodes, 'x'), spreadOf(nodes, 'y'));
  const preservedPitch = spans > 0 ? currentSpread / spans : 0;
  const pitch = Math.max(
    preservedPitch,
    diagonalPitch(nodes, params.footprintScale ?? 1, params.siblingGap ?? 0)
  );

  const rotated: ArrangeNode[] = nodes.map(node => ({
    id: node.id,
    position: rotateAbout(node.position, centre, cos, -sin),
    footprint: node.footprint,   // unused: the step is fixed, not fitted
  }));

  // Rotating about the centroid leaves the centroid where it is, so the lattice
  // the grid centred in the rotated frame comes back centred on the same point.
  const targets = new Map<NodeId, Position>();
  const step = pitch * Math.SQRT2;
  for (const [nodeId, position] of latticeTargets({ nodes: rotated, params }, step)) {
    targets.set(nodeId, rotateAbout(position, centre, cos, sin));
  }
  return targets;
}

export const gridDiagonalTool: ArrangeTool = {
  id: 'grid-diagonal',
  label: 'Diagonal grid',
  group: 'shape',
  minNodes: 4,
  compute: diagonalGridTargets,
};
