/**
 * Align tools — put the selected nodes' centres on a common line.
 *
 * "Align" keeps its literal meaning here: a line, nothing else. Placement on a
 * shape (circle, arc) and gap equalisation (distribute) are separate groups.
 * See docs/layout-architecture.md §1.1.
 */

import type { Position } from 'cytoscape';
import type { NodeId } from '../../../core/main-types';
import type { ArrangeInput, ArrangeNode, ArrangeTool } from './types';

/** Row/Column: every node adopts the mean centre coordinate on the shared axis. */
function axisTargets(nodes: ArrangeNode[], axis: 'row' | 'column'): Map<NodeId, Position> {
  let sum = 0;
  for (const node of nodes) {
    sum += axis === 'row' ? node.position.y : node.position.x;
  }
  const mean = sum / nodes.length;

  const targets = new Map<NodeId, Position>();
  for (const node of nodes) {
    const { x, y } = node.position;
    targets.set(node.id, axis === 'row' ? { x, y: mean } : { x: mean, y });
  }
  return targets;
}

/**
 * Diagonal: the min-X and max-X nodes fix a line and stay put; every node is
 * orthogonally projected onto it (both X and Y move).
 */
function diagonalTargets(nodes: ArrangeNode[]): Map<NodeId, Position> {
  let start: Position | null = null;
  let end: Position | null = null;
  for (const node of nodes) {
    if (!start || node.position.x < start.x) start = node.position;
    if (!end || node.position.x > end.x) end = node.position;
  }
  if (!start || !end) return new Map();

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return new Map(); // endpoints coincide — no line to align to

  const targets = new Map<NodeId, Position>();
  for (const node of nodes) {
    const t = ((node.position.x - start.x) * dx + (node.position.y - start.y) * dy) / lengthSq;
    targets.set(node.id, { x: start.x + t * dx, y: start.y + t * dy });
  }
  return targets;
}

export const alignRowTool: ArrangeTool = {
  id: 'align-row',
  label: 'Align row',
  shortcut: 'T',
  group: 'align',
  minNodes: 2,
  compute: (input: ArrangeInput) => axisTargets(input.nodes, 'row'),
};

export const alignColumnTool: ArrangeTool = {
  id: 'align-column',
  label: 'Align column',
  shortcut: 'U',
  group: 'align',
  minNodes: 2,
  compute: (input: ArrangeInput) => axisTargets(input.nodes, 'column'),
};

export const alignDiagonalTool: ArrangeTool = {
  id: 'align-diagonal',
  label: 'Align diagonal',
  shortcut: 'Y',
  // Two nodes already define the line, so a diagonal needs a third to project.
  minNodes: 3,
  group: 'align',
  compute: (input: ArrangeInput) => diagonalTargets(input.nodes),
};
