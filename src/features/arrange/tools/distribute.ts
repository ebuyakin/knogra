/**
 * Distribute tools — equalise the gaps between the selected nodes.
 *
 * "Equal" means **equal whitespace between adjacent bounding boxes**, not equal
 * centre spacing: Knogra footprints vary enormously (an equation node beside a
 * circle node), and even centre spacing would leave visibly uneven gaps. See
 * docs/layout-architecture.md §1.1.
 *
 * Two invariants, both deliberate:
 *
 *  - **The extreme nodes stay put.** Only the interior redistributes, so the
 *    operation is idempotent and never drags the group somewhere new. When the
 *    nodes are too wide for the span the computed gap goes negative and they
 *    overlap — the anchors still hold, and Spread (`.`) is the remedy. Clamping
 *    the gap at zero would have to move an anchor, breaking the invariant.
 *  - **Nothing moves perpendicular to the axis.** Distribute changes only the
 *    coordinate along the axis; flattening onto a line is Align's job. That is
 *    what lets the two be composed — align into a row, then distribute it, or
 *    distribute a scatter without collapsing it.
 */

import type { Position } from 'cytoscape';
import type { NodeId } from '../../../core/main-types';
import type { ArrangeInput, ArrangeNode, ArrangeTool } from './types';

/** A node reduced to its position and size along the distribution axis. */
interface AxialSpan {
  node: ArrangeNode;
  /** Centre coordinate along the axis. */
  centre: number;
  /** Size along the axis. */
  extent: number;
}

/**
 * Lay the spans out end to end with a constant gap, keeping the first and last
 * exactly where they are. Returns the new centre for each, in the given order.
 */
function evenCentres(spans: AxialSpan[]): number[] {
  const first = spans[0];
  const last = spans[spans.length - 1];
  const start = first.centre - first.extent / 2;
  const end = last.centre + last.extent / 2;

  let occupied = 0;
  for (const span of spans) occupied += span.extent;
  const gap = (end - start - occupied) / (spans.length - 1);

  const centres: number[] = [];
  let cursor = start;
  for (const span of spans) {
    centres.push(cursor + span.extent / 2);
    cursor += span.extent + gap;
  }
  return centres;
}

function distributeOnAxis(nodes: ArrangeNode[], axis: 'horizontal' | 'vertical'): Map<NodeId, Position> {
  const spans: AxialSpan[] = nodes
    .map(node => ({
      node,
      centre: axis === 'horizontal' ? node.position.x : node.position.y,
      extent: axis === 'horizontal' ? node.footprint.width : node.footprint.height,
    }))
    .sort((a, b) => a.centre - b.centre);

  const centres = evenCentres(spans);

  const targets = new Map<NodeId, Position>();
  spans.forEach((span, index) => {
    const { x, y } = span.node.position;
    // The perpendicular coordinate is carried through untouched.
    targets.set(span.node.id, axis === 'horizontal' ? { x: centres[index], y } : { x, y: centres[index] });
  });
  return targets;
}

function distributeOnDiagonal(nodes: ArrangeNode[]): Map<NodeId, Position> {
  // The line direction comes from the min-X and max-X nodes — the same rule as
  // align-diagonal, so the two tools agree on what "the diagonal" is.
  let lineStart = nodes[0];
  let lineEnd = nodes[0];
  for (const node of nodes) {
    if (node.position.x < lineStart.position.x) lineStart = node;
    if (node.position.x > lineEnd.position.x) lineEnd = node;
  }

  const dx = lineEnd.position.x - lineStart.position.x;
  const dy = lineEnd.position.y - lineStart.position.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return new Map(); // endpoints coincide — no line to distribute along

  const ux = dx / length;
  const uy = dy / length;
  const origin = lineStart.position;

  // Perpendicular offsets are kept so the tool never flattens the selection;
  // the anchors are the extremes *along the line*, which need not be the two
  // nodes that defined its direction.
  const perpendicular = new Map<NodeId, Position>();
  const spans: AxialSpan[] = nodes
    .map(node => {
      const rx = node.position.x - origin.x;
      const ry = node.position.y - origin.y;
      const along = rx * ux + ry * uy;
      perpendicular.set(node.id, { x: rx - along * ux, y: ry - along * uy });
      return {
        node,
        centre: along,
        // Support width of an axis-aligned box along the line direction.
        extent: node.footprint.width * Math.abs(ux) + node.footprint.height * Math.abs(uy),
      };
    })
    .sort((a, b) => a.centre - b.centre);

  const centres = evenCentres(spans);

  const targets = new Map<NodeId, Position>();
  spans.forEach((span, index) => {
    const offset = perpendicular.get(span.node.id) as Position;
    targets.set(span.node.id, {
      x: origin.x + centres[index] * ux + offset.x,
      y: origin.y + centres[index] * uy + offset.y,
    });
  });
  return targets;
}

/** Fewer than three nodes has no interior to redistribute. */
const MIN_NODES = 3;

export const distributeHorizontalTool: ArrangeTool = {
  id: 'distribute-horizontal',
  label: 'Distribute horizontally',
  shortcut: 'Shift+T',
  group: 'distribute',
  minNodes: MIN_NODES,
  compute: (input: ArrangeInput) => distributeOnAxis(input.nodes, 'horizontal'),
};

export const distributeVerticalTool: ArrangeTool = {
  id: 'distribute-vertical',
  label: 'Distribute vertically',
  shortcut: 'Shift+U',
  group: 'distribute',
  minNodes: MIN_NODES,
  compute: (input: ArrangeInput) => distributeOnAxis(input.nodes, 'vertical'),
};

export const distributeDiagonalTool: ArrangeTool = {
  id: 'distribute-diagonal',
  label: 'Distribute diagonally',
  shortcut: 'Shift+Y',
  group: 'distribute',
  minNodes: MIN_NODES,
  compute: (input: ArrangeInput) => distributeOnDiagonal(input.nodes),
};
