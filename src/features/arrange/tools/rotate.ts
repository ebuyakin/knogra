/**
 * Rotate tools — turn the selected nodes rigidly about their own centroid.
 *
 * A rigid transform: every selected node keeps its distance from the centroid
 * and from every other selected node, so the arrangement is preserved exactly
 * and only its orientation changes. Node glyphs themselves do not turn — only
 * their positions do — because Cytoscape nodes are axis-aligned.
 *
 * The selection-scoped counterpart to the scene-wide Rotate command
 * (`autolayout.rotate`), which turns every visible node about the *central*
 * node. Here the pivot is the selection's own centroid, per the arrange
 * invariants: centrality is a semantic property, not a geometric one. To turn
 * a group around one particular node, that node has to be the centroid — i.e.
 * rotate is for turning a formation, not for orbiting a hub.
 *
 * `-degrees` exactly reverses `degrees`, so the opposite command is a true undo.
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

/**
 * @param sign `+1` for clockwise, `-1` for counter-clockwise. Positive angles
 *   read as clockwise because graph coordinates run y-downwards — the same
 *   convention as the scene-wide rotate.
 */
function rotationTargets(input: ArrangeInput, sign: 1 | -1): Map<NodeId, Position> {
  const degrees = (input.params.rotationDegrees ?? 0) * sign;
  if (degrees % 360 === 0) return new Map();

  const pivot = centroidOf(input.nodes);
  const theta = (degrees * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const targets = new Map<NodeId, Position>();
  for (const node of input.nodes) {
    const dx = node.position.x - pivot.x;
    const dy = node.position.y - pivot.y;
    targets.set(node.id, {
      x: pivot.x + dx * cos - dy * sin,
      y: pivot.y + dx * sin + dy * cos,
    });
  }
  return targets;
}

export const rotateClockwiseTool: ArrangeTool = {
  id: 'rotate-cw',
  label: 'Clockwise',
  shortcut: 'O',
  group: 'rotate',
  minNodes: 2,
  selfReversible: true,
  compute: (input: ArrangeInput) => rotationTargets(input, 1),
};

export const rotateCounterClockwiseTool: ArrangeTool = {
  id: 'rotate-ccw',
  label: 'Counter-clockwise',
  shortcut: 'Shift+O',
  group: 'rotate',
  minNodes: 2,
  selfReversible: true,
  compute: (input: ArrangeInput) => rotationTargets(input, -1),
};
