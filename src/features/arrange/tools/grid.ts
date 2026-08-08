/**
 * Grid tool — snap the selection into a regular axis-aligned lattice.
 *
 * The "official diagram" arrangement. Note that Circle already produces a
 * square for four nodes — but a *rotated* one, since it picks the phase that
 * minimises travel. What makes a diagram read as deliberate is **axis
 * alignment**, which is what this tool adds. Four nodes therefore land as a
 * clean 2×2, which is awkward to achieve by hand.
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
 * never introduces overlap and never yanks a deliberate layout into a box.
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

function gridTargets(input: ArrangeInput): Map<NodeId, Position> {
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

  const columnStep = latticeStep(spreadOf(nodes, 'x'), columns, widest, gap);
  const rowStep = latticeStep(spreadOf(nodes, 'y'), rows, tallest, gap);

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
  compute: gridTargets,
};
