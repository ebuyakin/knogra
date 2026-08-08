/**
 * Spacing tools — Tighten / Spread the selection about its own centroid.
 *
 * Changes the **distance between** the selected nodes; their size is untouched.
 * This is the deliberate opposite of the scene-wide Enlarge / Shrink command
 * (`autolayout.scaleScene`), which changes apparent node *size* and leaves
 * on-screen distances alone. See docs/layout-architecture.md §1.1.
 *
 * A pure similarity transform about the centroid, so `1/factor` exactly
 * reverses `factor`: the opposite command is a true undo. Unselected nodes and
 * the viewport are untouched, which is why — unlike `scaleScene` — there is no
 * compensating zoom: the selection genuinely moves relative to its surroundings.
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
 * @param invert `true` for Tighten (pull in), `false` for Spread (push out).
 */
function spacingTargets(input: ArrangeInput, invert: boolean): Map<NodeId, Position> {
  const step = input.params.spacingStep ?? 1;
  if (step <= 0 || step === 1) return new Map();

  const factor = invert ? 1 / step : step;
  const centre = centroidOf(input.nodes);

  const targets = new Map<NodeId, Position>();
  for (const node of input.nodes) {
    targets.set(node.id, {
      x: centre.x + (node.position.x - centre.x) * factor,
      y: centre.y + (node.position.y - centre.y) * factor,
    });
  }
  return targets;
}

export const tightenTool: ArrangeTool = {
  id: 'tighten',
  label: 'Tighten',
  shortcut: ',',
  group: 'spacing',
  minNodes: 2,
  compute: (input: ArrangeInput) => spacingTargets(input, true),
};

export const spreadTool: ArrangeTool = {
  id: 'spread',
  label: 'Spread',
  shortcut: '.',
  group: 'spacing',
  minNodes: 2,
  compute: (input: ArrangeInput) => spacingTargets(input, false),
};
