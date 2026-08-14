import type { NodeId, Scene } from '../../../../core/main-types';
import type { ParsedMermaidNode } from '../../document/diagram';
import { estimateDefaultNodeFootprint, type EstimatedNodeFootprint, type Position } from './shared';

export interface FanLayoutContext {
  /** Node positions from the *parent* scene (the scene centred on this node's
   *  parent), relative to that scene's centre, by mermaidId. Continuity chains
   *  scene-to-scene: each scene preserves its local neighbourhood from the one
   *  above it, not from a single global anchor. */
  parentScenePositionsByMermaidId: Map<string, Position>;
  /** Parent of each node in the anchor's rooted tree, by mermaidId. */
  parentByMermaidId: Map<string, string>;
}

/** Tunable knobs for the fan layout (levels ≥2 of a Mermaid import). */
export interface FanLayoutParams {
  /** Minimum radial distance from a node to its fanned descendants (px); the
   *  radius grows past this when siblings need more room to fit the arc. */
  ringSpacing: number;
  /** Angular width (radians) of a fan: the cap on a child's grandchild cone and
   *  the target spread of the central node's children clump. */
  spreadArc: number;
  /** Maximum angle (radians) between adjacent children of the central node, so
   *  a scene with few children stays compact instead of fanning to `spreadArc`.
   *  Total children spread is capped at min(spreadArc, (count-1)·maxChildAngle). */
  maxChildAngle: number;
  /** Minimum gap between fanned siblings (px). */
  siblingGap: number;
  /** Scales the title-estimated node footprint used for sibling spacing. The
   *  estimator over-reserves space, so values <1 pack siblings tighter (≈0.5
   *  makes similarly-sized siblings nearly touch at gap 0). */
  footprintScale: number;
}

export const FAN_LAYOUT_DEFAULTS: FanLayoutParams = {
  ringSpacing: 200,
  spreadArc: (4 / 3) * Math.PI, // 240°
  maxChildAngle: Math.PI / 3, // 60°
  siblingGap: 0,
  footprintScale: 1,
};

/** Strategy-2 fallback: bearing at which the parent is pinned (top of screen). */
const FALLBACK_PARENT_BEARING = -Math.PI / 2;

/**
 * Wrap fan positions (relative to the central node at the origin) into scene
 * node records.
 */
export function toFanSceneNodes(
  nodes: ParsedMermaidNode[],
  idByMermaidId: Map<string, NodeId>,
  positions: Map<string, Position>
): Scene['nodes'] {
  const sceneNodes: Scene['nodes'] = {};
  for (const node of nodes) {
    const nodeId = idByMermaidId.get(node.mermaidId);
    if (!nodeId) continue;
    const position = positions.get(node.mermaidId);
    if (!position) continue;
    sceneNodes[nodeId] = {
      position,
      scale: 1.0,
      design: { id: 'default-node', params: {} },
    };
  }
  return sceneNodes;
}

/**
 * Fan layout for a Mermaid import sub-scene: a spatial continuation of the
 * parent scene rather than an independent radial layout. The central node sits
 * at the origin and the incoming edge is always preserved — the parent keeps
 * the exact relative offset (direction and length) it had in the parent scene.
 * The central node's children are placed on the far side of that edge: when they
 * were already shown in the parent scene their observed clump is opened into a
 * wider fan (inherit-and-widen), otherwise they are fanned fresh. Each child's
 * grandchildren are fanned within the child's own sector when present (sub-scene
 * depth = 2). Continuity chains scene-to-scene at every level. Only when the
 * parent scene locates neither the node nor its parent does the layout fall
 * back to a fixed local orientation.
 *
 * See `docs/mermaid-fan-layout.md` for the full model, and `radial.ts` /
 * `flow.ts` for the other layouts.
 */
export function computeFanScenePositions(
  nodes: ParsedMermaidNode[],
  centralMermaidId: string,
  context: FanLayoutContext,
  params: FanLayoutParams
): Map<string, Position> {
  const { parentScenePositionsByMermaidId, parentByMermaidId } = context;

  const parentId = parentByMermaidId.get(centralMermaidId);
  const children = nodes
    .filter(node => parentByMermaidId.get(node.mermaidId) === centralMermaidId)
    .sort((left, right) => left.order - right.order);
  const grandchildrenByChild = new Map<string, ParsedMermaidNode[]>();
  for (const child of children) {
    grandchildrenByChild.set(
      child.mermaidId,
      nodes
        .filter(node => parentByMermaidId.get(node.mermaidId) === child.mermaidId)
        .sort((left, right) => left.order - right.order)
    );
  }

  const positions = new Map<string, Position>();
  positions.set(centralMermaidId, { x: 0, y: 0 });

  const centralInParent = parentScenePositionsByMermaidId.get(centralMermaidId);
  const parentInParent = parentId ? parentScenePositionsByMermaidId.get(parentId) : undefined;
  // The incoming (parent→central) edge is preserved whenever the parent scene
  // locates this node and its parent — true for every real descent. Whether the
  // children are *inherited* from the parent scene or fanned fresh is a separate
  // decision, made by `childrenPrePositioned`.
  const hasIncomingEdge = Boolean(centralInParent && (!parentId || parentInParent));
  const childrenPrePositioned =
    children.length > 0 && children.every(child => parentScenePositionsByMermaidId.has(child.mermaidId));

  if (hasIncomingEdge && centralInParent) {
    // Preserve the incoming edge: pin the parent at its exact offset so the
    // parent→central direction and length match the parent scene.
    let awayBearing = FALLBACK_PARENT_BEARING + Math.PI;
    if (parentId && parentInParent) {
      const parentOffset = subtract(parentInParent, centralInParent);
      positions.set(parentId, parentOffset);
      awayBearing = Math.atan2(-parentOffset.y, -parentOffset.x);
    }
    if (childrenPrePositioned) {
      // Children were shown in the parent scene: open their tight clump into a
      // wider fan, keeping their observed direction (inherit-and-widen).
      placeSpreadChildren(children, grandchildrenByChild, parentScenePositionsByMermaidId, centralInParent, positions, params);
    } else {
      // Children were not in the parent scene: fan them fresh on the far side of
      // the incoming edge.
      fanAround({ x: 0, y: 0 }, awayBearing, params.spreadArc, children, positions, params);
    }
  } else {
    // No parent-scene information at all — re-derive the cone locally with a
    // fixed orientation. Only reached for degenerate scenes with no parent.
    if (parentId && nodes.some(node => node.mermaidId === parentId)) {
      positions.set(parentId, fromPolar({ x: 0, y: 0 }, FALLBACK_PARENT_BEARING, params.ringSpacing));
    }
    fanAround({ x: 0, y: 0 }, FALLBACK_PARENT_BEARING + Math.PI, params.spreadArc, children, positions, params);
  }

  const childBearings = new Map<string, number>();
  for (const child of children) {
    const childPosition = positions.get(child.mermaidId);
    if (childPosition) childBearings.set(child.mermaidId, Math.atan2(childPosition.y, childPosition.x));
  }

  for (const child of children) {
    const childPosition = positions.get(child.mermaidId);
    const bearing = childBearings.get(child.mermaidId);
    if (!childPosition || bearing === undefined) continue;
    const arc = grandchildFanArc(child.mermaidId, bearing, childBearings, params.spreadArc);
    fanAround(childPosition, bearing, arc, grandchildrenByChild.get(child.mermaidId) ?? [], positions, params);
  }

  return positions;
}

/**
 * Place A's children with their angular spread widened, centred on the clump's
 * original direction, and pulled inward to a uniform radius that just fits them
 * on the widened arc. In the parent scene these children were squeezed into a
 * narrow wedge, which forces a large radius; opening the wedge here means that
 * same count needs far less radius, so recomputing it lets the descent read as a
 * genuine zoom-in instead of leaving the children small and sparse. The radius
 * is only ever pulled *inward* (never past the inherited distance), so the
 * incoming-edge continuity is never worsened. A child carrying grandchildren
 * gets a radial allowance so its brood, fanned outward within its own sector,
 * does not crowd the central node.
 */
function placeSpreadChildren(
  children: ParsedMermaidNode[],
  grandchildrenByChild: Map<string, ParsedMermaidNode[]>,
  parentScenePositionsByMermaidId: Map<string, Position>,
  centralInParent: Position,
  out: Map<string, Position>,
  params: FanLayoutParams
): void {
  const polar = children.map(child => {
    const offset = subtract(parentScenePositionsByMermaidId.get(child.mermaidId)!, centralInParent);
    return {
      id: child.mermaidId,
      radius: Math.hypot(offset.x, offset.y),
      bearing: Math.atan2(offset.y, offset.x),
    };
  });
  if (polar.length === 0) return;

  const centre = Math.atan2(
    polar.reduce((sum, item) => sum + Math.sin(item.bearing), 0) / polar.length,
    polar.reduce((sum, item) => sum + Math.cos(item.bearing), 0) / polar.length
  );
  const halfSpread = Math.max(...polar.map(item => Math.abs(angularDifference(item.bearing, centre))));
  const targetHalfSpread = Math.min(params.spreadArc, (polar.length - 1) * params.maxChildAngle) / 2;
  const finalHalfSpread = Math.max(halfSpread, targetHalfSpread);
  const expansion = halfSpread > 1e-3 ? Math.max(1, targetHalfSpread / halfSpread) : 1;

  // Fit the children on their (now widened) arc exactly as a fresh fan would,
  // then clamp so we never push a child past its inherited radius.
  const arcWidened = 2 * finalHalfSpread;
  const childFitRadius = fanRingRadius(children, arcWidened, params);
  // A child's grandchildren fan within its own sector; estimate that sector from
  // the widened arc so a child with a large brood stays far enough out that the
  // brood clears the central node.
  const estSectorArc =
    children.length > 1 ? Math.min(params.spreadArc, arcWidened / (children.length - 1)) : params.spreadArc;
  let grandchildFloor = 0;
  for (const child of children) {
    const brood = grandchildrenByChild.get(child.mermaidId) ?? [];
    if (brood.length === 0) continue;
    grandchildFloor = Math.max(grandchildFloor, fanRingRadius(brood, estSectorArc, params));
  }
  const minInherited = Math.min(...polar.map(item => item.radius));
  const radius = Math.min(minInherited, Math.max(childFitRadius, grandchildFloor));

  for (const item of polar) {
    const bearing = centre + angularDifference(item.bearing, centre) * expansion;
    out.set(item.id, {
      x: Math.round(Math.cos(bearing) * radius),
      y: Math.round(Math.sin(bearing) * radius),
    });
  }
}

/**
 * Angular width available to a child's grandchildren: the child's own sector,
 * taken as the angular distance to its nearest sibling (so a child's
 * grandchildren stay within the wedge bounded by the bisectors to its
 * neighbours and never overlap a sibling's brood). A lone child gets the full
 * `FAN_MAX_ARC`.
 */
function grandchildFanArc(childId: string, bearing: number, childBearings: Map<string, number>, maxArc: number): number {
  let nearestGap = Number.POSITIVE_INFINITY;
  for (const [otherId, otherBearing] of childBearings) {
    if (otherId === childId) continue;
    const gap = Math.abs(angularDifference(bearing, otherBearing));
    if (gap < nearestGap) nearestGap = gap;
  }
  return Number.isFinite(nearestGap) ? Math.min(nearestGap, maxArc) : maxArc;
}

/**
 * Radius at which `count` items span at most `arc` given their footprints: the
 * ring is pushed outward just far enough that the sibling spacing (`step`) fits
 * within the arc, never below `ringSpacing`.
 */
function fanRingRadius(items: ParsedMermaidNode[], arc: number, params: FanLayoutParams): number {
  const count = items.length;
  if (count === 0) return params.ringSpacing;
  const step =
    items.reduce(
      (sum, item) => sum + 2 * params.footprintScale * footprintRadius(estimateDefaultNodeFootprint(item)) + params.siblingGap,
      0
    ) / count;
  return Math.max(params.ringSpacing, ((count - 1) * step) / Math.max(arc, 1e-3));
}

/**
 * Place `items` on an arc of width `arc` centred on `bearing` around `centre`.
 * The ring radius is pushed outward just far enough that the spread never
 * exceeds `arc` (a single item lands straight along `bearing`).
 */
function fanAround(
  centre: Position,
  bearing: number,
  arc: number,
  items: ParsedMermaidNode[],
  out: Map<string, Position>,
  params: FanLayoutParams
): void {
  const count = items.length;
  if (count === 0) return;

  const step = items.reduce(
    (sum, item) => sum + 2 * params.footprintScale * footprintRadius(estimateDefaultNodeFootprint(item)) + params.siblingGap,
    0
  ) / count;
  const radius = fanRingRadius(items, arc, params);

  for (let index = 0; index < count; index++) {
    const theta = bearing + (index - (count - 1) / 2) * (step / radius);
    out.set(items[index].mermaidId, {
      x: Math.round(centre.x + Math.cos(theta) * radius),
      y: Math.round(centre.y + Math.sin(theta) * radius),
    });
  }
}

function angularDifference(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function fromPolar(centre: Position, bearing: number, radius: number): Position {
  return {
    x: Math.round(centre.x + Math.cos(bearing) * radius),
    y: Math.round(centre.y + Math.sin(bearing) * radius),
  };
}

function subtract(point: Position, origin: Position): Position {
  return { x: point.x - origin.x, y: point.y - origin.y };
}

function footprintRadius(footprint: EstimatedNodeFootprint): number {
  return Math.sqrt((footprint.width / 2) ** 2 + (footprint.height / 2) ** 2);
}
