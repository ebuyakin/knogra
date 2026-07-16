/**
 * Radial layout — outer-ring spreading
 *
 * Recursive angular sector allocation over a BFS spanning tree rooted at the
 * scene's central node, with two defining traits (docs/autolayout-architecture.md
 * §4.3–§4.4):
 *   - Ring radius is set by the *total* footprint of a ring (circumference/sum),
 *     not the worst-case node — so one node in a thin wedge no longer inflates
 *     the whole ring; at worst it overlaps a neighbour slightly.
 *   - Inner rings are spread evenly inside the outermost radius (filling the
 *     centre) rather than hugging it, with `ringSpacing` as a minimum gap.
 */

import type { NodeId } from '../../../core/main-types';
import type { LayoutInput, LayoutParams, Position, SceneLayout } from './types';
import {
  assignAngles,
  buildSpanningForest,
  computeLeafWeights,
  orderChildrenByAngle,
  type TreeNode,
} from './radial-shared';

/**
 * Compute node positions relative to the central node, which is placed at the
 * origin (0, 0). Callers offset the whole map by the central node's current
 * position so the scene does not jump.
 */
function compute(input: LayoutInput): Map<NodeId, Position> {
  const { nodes, edges, centralId, params } = input;
  const positions = new Map<NodeId, Position>();
  if (nodes.length === 0) return positions;

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  if (!nodeById.has(centralId)) return positions;

  const root = buildSpanningForest(nodes, edges, centralId, nodeById);
  if (params.ringOrder === 'angular') {
    const posById = new Map<NodeId, Position>();
    for (const node of nodes) {
      if (node.currentPos) posById.set(node.id, node.currentPos);
    }
    const center = nodeById.get(centralId)?.currentPos ?? { x: 0, y: 0 };
    orderChildrenByAngle(root, posById, center);
  }
  computeLeafWeights(root);
  // Root's children partition the full circle, starting at the top.
  assignAngles(root, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI);
  const ringRadii = computeRingRadii(root, params);
  placeNodes(root, ringRadii, positions);

  return positions;
}

/**
 * One radius per depth ring.
 *
 * Radius 1 (minimum): each ring's minimum radius is the one whose circumference
 * holds the *total* footprint of the ring's nodes (`Σ arc / 2π`). This packs the
 * ring; a node in an unusually thin wedge may overlap a neighbour rather than
 * force the whole ring outward.
 *
 * Radius 2 (placement): keep the outermost ring at its minimum, then spread the
 * inner rings evenly between the centre and that outer radius — pushing a ring
 * back out only when its own minimum demands it. `ringSpacing` is the minimum
 * inter-ring gap, never an exact one.
 */
function computeRingRadii(root: TreeNode, params: LayoutParams): number[] {
  const nodesByDepth: TreeNode[][] = [];
  const walk = (node: TreeNode): void => {
    (nodesByDepth[node.depth] ??= []).push(node);
    node.children.forEach(walk);
  };
  walk(root);

  const depthCount = nodesByDepth.length;

  // Circumference-based minimum radius per ring (Σ footprint arc / 2π). The
  // reserved footprint is scaled by footprintScale (<1 packs tighter).
  const footprintScale = params.footprintScale ?? 1;
  const minFit: number[] = [0];
  for (let depth = 1; depth < depthCount; depth++) {
    let arcSum = 0;
    for (const node of nodesByDepth[depth]) {
      arcSum += 2 * footprintScale * node.footprintRadius + params.siblingGap;
    }
    minFit[depth] = arcSum / (2 * Math.PI);
  }

  // Hard minimums (inside-out): each ring at least a ringSpacing beyond the
  // previous, and never below its own footprint minimum. Fixes the outer radius.
  const hardMin: number[] = [0];
  for (let depth = 1; depth < depthCount; depth++) {
    hardMin[depth] = Math.max(hardMin[depth - 1] + params.ringSpacing, minFit[depth]);
  }

  const radii: number[] = new Array(depthCount).fill(0);
  const outer = depthCount - 1;
  if (outer >= 1) {
    const rMax = hardMin[outer];
    radii[outer] = rMax;
    // Redistribute inner rings (outside-in): pull each toward its even target,
    // clamped so it never crosses the outer neighbour's minimum gap and never
    // drops below its own footprint minimum.
    for (let depth = outer - 1; depth >= 1; depth--) {
      const evenTarget = (rMax * depth) / outer;
      const upper = radii[depth + 1] - params.ringSpacing;
      radii[depth] = Math.max(minFit[depth], Math.min(evenTarget, upper));
    }
  }

  return radii.map(radius => Math.ceil(radius));
}

function placeNodes(node: TreeNode, ringRadii: number[], out: Map<NodeId, Position>): void {
  const angle = (node.angleStart + node.angleEnd) / 2;
  const radius = ringRadii[node.depth] ?? 0;
  out.set(node.id, {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
  });
  for (const child of node.children) placeNodes(child, ringRadii, out);
}

export const outerRingSpreadingLayout: SceneLayout = { id: 'radial', compute };
