/**
 * Circle tool — place the selected nodes on a circle centred on their centroid.
 *
 * A *shape* tool, not an alignment: it does not put centres on a line, it puts
 * them on a figure (see docs/layout-architecture.md §1.1). The design goal is
 * "regularise without relocating" — the ring lands roughly where the selection
 * already was, so the gesture reads as tidying rather than teleporting:
 *
 *  - **Centre** = the centroid of the selected node centres.
 *  - **Radius** = the mean current distance from that centroid, floored by the
 *    radius whose circumference actually fits the nodes — otherwise a tight
 *    cluster would produce an overlapping ring.
 *  - **Order** = the current clockwise sequence is preserved, so a hand-arranged
 *    order survives; only the spacing is perfected.
 *  - **Phase** = chosen to minimise total angular travel, so the ring barely
 *    rotates from where the nodes already sat.
 *
 * The scene's central node gets no special treatment: centrality is a semantic
 * property, not a geometric one. To keep a node out of the circle, don't select
 * it; to build a ring *around* it, use auto-layout.
 */

import type { Position } from 'cytoscape';
import type { NodeId } from '../../../core/main-types';
import type { ArrangeInput, ArrangeNode, ArrangeTool } from './types';

const TWO_PI = Math.PI * 2;

/** One node's current position in polar coordinates about the centroid. */
interface PolarNode {
  node: ArrangeNode;
  angle: number;
  radius: number;
}

/**
 * Radius of the node's circumscribed disk (half the bounding-box diagonal).
 * Matches the auto-layout ring formula, so the two stay visually consistent.
 */
function footprintRadius(node: ArrangeNode): number {
  const { width, height } = node.footprint;
  return Math.sqrt(width * width + height * height) / 2;
}

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
 * Smallest radius whose circumference holds every node's reserved footprint —
 * the same circumference-sum rule auto-layout uses for a ring (§4.3).
 */
function minimumFittingRadius(nodes: ArrangeNode[], footprintScale: number, gap: number): number {
  let circumference = 0;
  for (const node of nodes) {
    circumference += 2 * footprintRadius(node) * footprintScale + gap;
  }
  return circumference / TWO_PI;
}

/**
 * Rotation of the evenly spaced ring that minimises the total angular travel:
 * the circular mean of each node's residual between where it is and where its
 * slot would sit at zero phase.
 */
function bestPhase(ordered: PolarNode[], step: number): number {
  let sinSum = 0;
  let cosSum = 0;
  ordered.forEach((polar, index) => {
    const residual = polar.angle - index * step;
    sinSum += Math.sin(residual);
    cosSum += Math.cos(residual);
  });
  return Math.atan2(sinSum, cosSum);
}

function circleTargets(input: ArrangeInput): Map<NodeId, Position> {
  const { nodes, params } = input;
  const centre = centroidOf(nodes);

  // A node sitting exactly on the centroid has no meaningful angle; atan2(0, 0)
  // yields 0, so it simply takes an early slot rather than being dropped.
  const polar: PolarNode[] = nodes.map(node => {
    const dx = node.position.x - centre.x;
    const dy = node.position.y - centre.y;
    return { node, angle: Math.atan2(dy, dx), radius: Math.hypot(dx, dy) };
  });

  const meanRadius = polar.reduce((sum, entry) => sum + entry.radius, 0) / polar.length;
  const radius = Math.max(
    meanRadius,
    minimumFittingRadius(nodes, params.footprintScale ?? 1, params.siblingGap ?? 0)
  );

  const ordered = [...polar].sort((a, b) => a.angle - b.angle);
  const step = TWO_PI / ordered.length;
  const phase = bestPhase(ordered, step);

  const targets = new Map<NodeId, Position>();
  ordered.forEach((entry, index) => {
    const angle = phase + index * step;
    targets.set(entry.node.id, {
      x: centre.x + radius * Math.cos(angle),
      y: centre.y + radius * Math.sin(angle),
    });
  });
  return targets;
}

export const circleTool: ArrangeTool = {
  id: 'circle',
  label: 'Circle',
  shortcut: 'Shift+Q',
  group: 'shape',
  // Two nodes on a circle is just "place them opposite each other" — not a ring.
  minNodes: 3,
  compute: circleTargets,
};
