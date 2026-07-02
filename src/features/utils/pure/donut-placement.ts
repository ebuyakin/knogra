/**
 * Expansion Fan Placement
 *
 * Places an expanding node's newly-included graph-neighbours (its "children")
 * into the scene. Implements docs/node-expansion-spec.md.
 *
 * All angles are measured at the parent P. Constraints are SOFT — satisfied when
 * possible, relaxed only when forced, because the camera is fixed and cannot
 * pan/zoom to compensate.
 *
 * Three tiers, first success wins:
 *   1. Primary    — place children into the best free sector, respecting existing
 *                   nodes AND existing edges as obstacles (§4.1–4.6).
 *   2. Fallback 1 — no sector wide enough: recompute sectors from nodes only and
 *                   let connectors cross existing edges (§4.7).
 *   3. Fallback 2 — still nothing: greedily pack children outward along the axis,
 *                   alternating around it (§4.8).
 *
 * Terminology: an "existing edge" is an obstacle already in the scene; a
 * "connector" is a NEW parent→child edge we route, never an obstacle.
 *
 * NO DEPENDENCIES TO BE INTRODUCED IN THIS FILE (BESIDES TYPES)
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Minimum acceptable per-child angle (sector width / N) before falling back. */
const T_MIN_DEG = 5;

/** Sector-score weights: angular room vs. on-screen visibility (§4.4). */
const W_WIDTH = 0.4;
const W_AREA = 0.6;

/** Sector width (degrees) at which the width term saturates (§4.4). */
const WIDTH_REF_DEG = 120;

/** Angular step (degrees) for sampling a sector's on-screen area. */
const AREA_SAMPLE_DEG = 5;

/** Radial resolution (pixels) for sliding a child outward along its ray. */
const RADIUS_STEP = 12;

/**
 * Minimum centre-to-centre distance between two siblings, as a fraction of the
 * child size. Below 1 a little overlap is tolerated for a more compact fan.
 */
const SIBLING_MIN_FACTOR = 0.95;

/**
 * A sibling gap this fraction of `siblingMin` counts as only a "slight" overlap —
 * acceptable to keep a child on-screen rather than pushing it out of view (§4.6.3).
 */
const SLIGHT_OVERLAP_FACTOR = 0.7;

/** Clearance kept between a placed child and any existing node (also widens node arcs). */
const NODE_MARGIN = 40;

/** Clearance kept between a placed child / connector and any existing edge. */
const EDGE_MARGIN = 24;

/**
 * When the expanding node sits within this multiple of `minRadius` of the
 * reference centre, the outward axis is ill-defined; we grow away from the
 * obstacle centroid instead (or straight up if there are no obstacles).
 */
const CENTER_DEADZONE_FACTOR = 1.0;

const EPS = 1e-3;

// ============================================================================
// TYPES
// ============================================================================

export interface Position {
  x: number;
  y: number;
}

/** An existing node treated as a circular obstacle. */
export interface NodeObstacle {
  pos: Position;
  size: number;
}

/** An existing edge treated as a line-segment obstacle. */
export interface EdgeObstacle {
  a: Position;
  b: Position;
  /** True if the edge is connected to the expanding node itself. Such edges share
   *  the parent endpoint, so they are skipped when testing the new connecting
   *  edges (which would otherwise always read as touching at the parent). */
  incidentToParent?: boolean;
}

/** Visible viewport in model (graph) coordinates. */
export interface ViewportRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FanPlacementInput {
  /** Position of the expanding (parent) node. */
  parentPos: Position;
  /** Number of children to place. */
  childCount: number;
  /** Diameter used for each child when reserving space. */
  childSize: number;
  /** Existing nodes to avoid (must NOT include the parent). */
  nodeObstacles: NodeObstacle[];
  /** Existing edges to avoid. */
  edgeObstacles: EdgeObstacle[];
  /** Smallest radius from the parent at which a child may sit. */
  minRadius: number;
  /** Largest radius the search will grow to before giving up. */
  maxRadius: number;
  /** Scene centre used only to bias the outward-growth tiebreaker. */
  referenceCenter: Position;
  /** Visible viewport in model coords, or null to ignore on-screen preference. */
  viewport: ViewportRect | null;
}

// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

function distance(a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function polarToCartesian(center: Position, angleDeg: number, radius: number): Position {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + radius * Math.cos(angleRad),
    y: center.y + radius * Math.sin(angleRad)
  };
}

/** Normalise an angle to [-180, 180). */
function normalizeDeg(a: number): number {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

/** Direction (degrees) of the vector `from → to`. */
function dirDeg(from: Position, to: Position): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/** Shortest distance from point `p` to the segment `a`–`b`. */
function pointSegmentDistance(p: Position, a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** True if segments `p1`–`p2` and `p3`–`p4` properly cross. */
function segmentsIntersect(p1: Position, p2: Position, p3: Position, p4: Position): boolean {
  const cross = (a: Position, b: Position, c: Position): number =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/** Shortest distance between segments `a1`–`a2` and `b1`–`b2` (0 if they cross). */
function segmentSegmentDistance(a1: Position, a2: Position, b1: Position, b2: Position): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointSegmentDistance(a1, b1, b2),
    pointSegmentDistance(a2, b1, b2),
    pointSegmentDistance(b1, a1, a2),
    pointSegmentDistance(b2, a1, a2)
  );
}

// ============================================================================
// BLOCKED ARCS  (obstacles → compass, §4.2)
// ============================================================================

/** An angular interval blocked by an obstacle, as a centre and half-width (degrees). */
interface Arc {
  center: number;
  half: number;
}

/**
 * Compute the arcs (measured at the parent) that obstacles block. Existing nodes
 * always block a size-aware arc; existing non-incident edges block the shorter
 * arc between their endpoints, but only when `includeEdges` is true. Edges
 * incident to the parent are ignored (they coincide with their far node's arc).
 */
function computeBlockedArcs(
  parentPos: Position,
  nodes: NodeObstacle[],
  edges: EdgeObstacle[],
  includeEdges: boolean
): Arc[] {
  const arcs: Arc[] = [];

  for (const n of nodes) {
    const d = distance(parentPos, n.pos);
    if (d < EPS) continue;
    const ratio = Math.min(1, (n.size / 2 + NODE_MARGIN) / d);
    const half = (Math.asin(ratio) * 180) / Math.PI;
    if (half > EPS) arcs.push({ center: dirDeg(parentPos, n.pos), half });
  }

  if (includeEdges) {
    for (const e of edges) {
      if (e.incidentToParent) continue;
      const a1 = dirDeg(parentPos, e.a);
      const a2 = dirDeg(parentPos, e.b);
      const delta = normalizeDeg(a2 - a1);
      const half = Math.abs(delta) / 2;
      if (half > EPS) arcs.push({ center: normalizeDeg(a1 + delta / 2), half });
    }
  }

  return arcs;
}

// ============================================================================
// VIEWPORT BOUNDARY  (§4.2)
// ============================================================================

/**
 * Arcs (measured at P) for directions that would push a child off-screen at
 * `minRadius`, one per viewport wall. This makes the visible frame a soft
 * boundary so the free sectors open toward on-screen space. Empty when P is
 * comfortably inside the frame; a wall the node is already past is skipped, so it
 * cannot veto every direction.
 */
function viewportArcs(P: Position, minRadius: number, childRadius: number, vp: ViewportRect): Arc[] {
  const walls: Array<{ normal: number; clearance: number }> = [
    { normal: 0, clearance: vp.x2 - P.x - childRadius },   // right  (+x)
    { normal: 180, clearance: P.x - vp.x1 - childRadius }, // left   (−x)
    { normal: 90, clearance: vp.y2 - P.y - childRadius },  // bottom (+y)
    { normal: 270, clearance: P.y - vp.y1 - childRadius }  // top    (−y)
  ];

  const arcs: Arc[] = [];
  for (const w of walls) {
    const ratio = w.clearance / minRadius;
    if (ratio >= 1 || ratio <= -1) continue;
    const half = (Math.acos(ratio) * 180) / Math.PI;
    if (half > EPS) arcs.push({ center: w.normal, half });
  }
  return arcs;
}

// ============================================================================
// FREE SECTORS  (§4.3)
// ============================================================================

/** A free angular sector: a start angle in [0, 360) and a CCW width (degrees). */
interface Sector {
  start: number;
  width: number;
}

/**
 * The complement of the union of blocked arcs around the full circle. Returns the
 * free sectors, each an arc with a start and width. An empty input means nothing
 * is blocked (the caller handles that as the ring case); a fully blocked circle
 * returns no sectors.
 */
function freeSectors(arcs: Arc[]): Sector[] {
  if (arcs.length === 0) return [];

  const intervals: Array<[number, number]> = [];
  for (const arc of arcs) {
    if (arc.half >= 180) return []; // one arc blocks everything
    const c = ((arc.center % 360) + 360) % 360;
    const lo = c - arc.half;
    const hi = c + arc.half;
    if (lo < 0) {
      intervals.push([0, hi]);
      intervals.push([lo + 360, 360]);
    } else if (hi > 360) {
      intervals.push([lo, 360]);
      intervals.push([0, hi - 360]);
    } else {
      intervals.push([lo, hi]);
    }
  }

  intervals.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1] + EPS) {
      last[1] = Math.max(last[1], iv[1]);
    } else {
      merged.push([iv[0], iv[1]]);
    }
  }

  const sectors: Sector[] = [];
  for (let i = 0; i < merged.length; i++) {
    const cur = merged[i];
    const next = merged[(i + 1) % merged.length];
    const gapStart = cur[1];
    const width = i < merged.length - 1 ? next[0] - gapStart : next[0] + 360 - gapStart;
    if (width > EPS) sectors.push({ start: gapStart % 360, width });
  }

  return sectors;
}


// ============================================================================
// CLEARANCE & VISIBILITY
// ============================================================================

/**
 * True if a child centred at `p` clears every obstacle: the child body against
 * existing nodes (and, unless `ignoreEdges`, existing edges), and its connector
 * P→p against existing nodes (always) and non-incident existing edges (unless
 * `ignoreEdges`). This is only a safety net inside a genuine free sector.
 */
function obstacleClear(
  parentPos: Position,
  p: Position,
  childRadius: number,
  nodes: NodeObstacle[],
  edges: EdgeObstacle[],
  ignoreEdges: boolean
): boolean {
  for (const n of nodes) {
    if (distance(p, n.pos) < childRadius + n.size / 2 + NODE_MARGIN) return false;
    if (pointSegmentDistance(n.pos, parentPos, p) < n.size / 2 + EDGE_MARGIN) return false;
  }
  if (!ignoreEdges) {
    for (const e of edges) {
      if (pointSegmentDistance(p, e.a, e.b) < childRadius + EDGE_MARGIN) return false;
      if (!e.incidentToParent && segmentSegmentDistance(parentPos, p, e.a, e.b) < EDGE_MARGIN) {
        return false;
      }
    }
  }
  return true;
}

/** True if a child (with its half-size margin) sits fully inside the viewport. */
function isOnScreen(p: Position, childRadius: number, vp: ViewportRect | null): boolean {
  if (!vp) return true;
  return (
    p.x - childRadius >= vp.x1 &&
    p.x + childRadius <= vp.x2 &&
    p.y - childRadius >= vp.y1 &&
    p.y + childRadius <= vp.y2
  );
}

/** Smallest distance from `p` to any already-placed sibling (Infinity if none). */
function minDistToPlaced(p: Position, placed: Position[]): number {
  let m = Infinity;
  for (const q of placed) m = Math.min(m, distance(p, q));
  return m;
}

/**
 * Distance from `P` along `thetaDeg` to where the ray exits the viewport, capped
 * at `rCap`. Zero if the ray leaves the viewport before `minRadius` (no useful
 * visible space in that direction).
 */
function rayViewportExit(
  P: Position,
  thetaDeg: number,
  vp: ViewportRect,
  rCap: number,
  minRadius: number
): number {
  const t = (thetaDeg * Math.PI) / 180;
  const dx = Math.cos(t);
  const dy = Math.sin(t);
  let tmin = -Infinity;
  let tmax = Infinity;

  if (Math.abs(dx) < 1e-12) {
    if (P.x < vp.x1 || P.x > vp.x2) return 0;
  } else {
    let t1 = (vp.x1 - P.x) / dx;
    let t2 = (vp.x2 - P.x) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dy) < 1e-12) {
    if (P.y < vp.y1 || P.y > vp.y2) return 0;
  } else {
    let t1 = (vp.y1 - P.y) / dy;
    let t2 = (vp.y2 - P.y) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }

  if (tmax < tmin || tmax <= 0) return 0;
  if (tmax < minRadius) return 0;
  return Math.min(tmax, rCap);
}

/**
 * Sector score (§4.4): a weighted blend of how wide the sector is and how much of
 * it is on-screen, each normalised to [0, 1] so the weights are comparable.
 */
function sectorScore(
  P: Position,
  sector: Sector,
  minRadius: number,
  maxRadius: number,
  vp: ViewportRect | null
): number {
  const widthNorm = Math.min(1, sector.width / WIDTH_REF_DEG);

  let areaNorm = 0;
  if (vp) {
    const vpArea = (vp.x2 - vp.x1) * (vp.y2 - vp.y1);
    if (vpArea > 0) {
      const diag = Math.hypot(vp.x2 - vp.x1, vp.y2 - vp.y1);
      const rCap = Math.min(maxRadius, diag);
      const dRad = (AREA_SAMPLE_DEG * Math.PI) / 180;
      let area = 0;
      for (let a = 0; a <= sector.width; a += AREA_SAMPLE_DEG) {
        const r = rayViewportExit(P, sector.start + a, vp, rCap, minRadius);
        area += 0.5 * Math.max(0, r * r - minRadius * minRadius) * dRad;
      }
      areaNorm = Math.min(1, area / vpArea);
    }
  }

  return W_WIDTH * widthNorm + W_AREA * areaNorm;
}

/**
 * Resolve the outward axis (degrees): the direction from the reference centre
 * (the scene's central node) through the expanding node. When the node sits on
 * that centre the line is ill-defined, so we grow away from the centroid of
 * existing nodes instead, defaulting to straight up when there are none.
 */
function resolveOutwardAxis(
  parentPos: Position,
  referenceCenter: Position,
  nodes: NodeObstacle[],
  minRadius: number
): number {
  if (distance(parentPos, referenceCenter) >= minRadius * CENTER_DEADZONE_FACTOR) {
    return (Math.atan2(parentPos.y - referenceCenter.y, parentPos.x - referenceCenter.x) * 180) / Math.PI;
  }

  if (nodes.length > 0) {
    let cx = 0;
    let cy = 0;
    for (const n of nodes) {
      cx += n.pos.x;
      cy += n.pos.y;
    }
    cx /= nodes.length;
    cy /= nodes.length;
    if (distance(parentPos, { x: cx, y: cy }) > 1) {
      return (Math.atan2(parentPos.y - cy, parentPos.x - cx) * 180) / Math.PI;
    }
  }

  return -90; // straight up
}

// ============================================================================
// PLACEMENT  (§4.6)
// ============================================================================

/**
 * Slide one child outward along `angleDeg`, boundary-first among its siblings. It
 * stops at the first radius that is `siblingMin` clear of every placed sibling and
 * clears obstacles. To stay visible (§4.6.3) it prefers an on-screen radius with
 * only slight sibling overlap over an off-screen fully-clear one.
 */
function placeChildOnRay(
  P: Position,
  angleDeg: number,
  placed: Position[],
  childRadius: number,
  siblingMin: number,
  minRadius: number,
  maxRadius: number,
  nodes: NodeObstacle[],
  edges: EdgeObstacle[],
  vp: ViewportRect | null,
  ignoreEdges: boolean
): Position {
  let firstClear: { p: Position; onScreen: boolean } | null = null;
  let visibleSlight: Position | null = null;
  let last = polarToCartesian(P, angleDeg, minRadius);

  for (let r = minRadius; r <= maxRadius; r += RADIUS_STEP) {
    const p = polarToCartesian(P, angleDeg, r);
    last = p;
    if (!obstacleClear(P, p, childRadius, nodes, edges, ignoreEdges)) continue;

    const onScreen = isOnScreen(p, childRadius, vp);
    const gap = minDistToPlaced(p, placed);
    if (gap >= siblingMin) {
      firstClear = { p, onScreen };
      break;
    }
    if (onScreen && visibleSlight === null && gap >= siblingMin * SLIGHT_OVERLAP_FACTOR) {
      visibleSlight = p;
    }
  }

  if (firstClear === null) return visibleSlight ?? last;
  if (firstClear.onScreen) return firstClear.p;
  return visibleSlight ?? firstClear.p;
}

/**
 * Place the children into the chosen sector: evenly spaced rays centred on the
 * bisector with a half-gap margin off each wall, filled boundary-first so central
 * children stagger outward past their neighbours.
 */
function placeInSector(
  P: Position,
  sector: Sector,
  count: number,
  childSize: number,
  minRadius: number,
  maxRadius: number,
  nodes: NodeObstacle[],
  edges: EdgeObstacle[],
  vp: ViewportRect | null,
  ignoreEdges: boolean
): Position[] {
  const childRadius = childSize / 2;
  const siblingMin = childSize * SIBLING_MIN_FACTOR;
  const deltaAngle = sector.width / count;
  const bisector = sector.start + sector.width / 2;

  const angles: number[] = [];
  for (let i = 0; i < count; i++) {
    angles.push(bisector + deltaAngle * (i - (count - 1) / 2));
  }

  const order = angles
    .map((_, i) => i)
    .sort((i, j) => Math.abs(j - (count - 1) / 2) - Math.abs(i - (count - 1) / 2));

  const positions = new Array<Position>(count);
  const placed: Position[] = [];
  for (const idx of order) {
    const p = placeChildOnRay(
      P,
      angles[idx],
      placed,
      childRadius,
      siblingMin,
      minRadius,
      maxRadius,
      nodes,
      edges,
      vp,
      ignoreEdges
    );
    positions[idx] = p;
    placed.push(p);
  }
  return positions;
}

/**
 * Ring case (§4.3): no obstacles at all, so place the children evenly around the
 * full circle starting from the outward axis, at a radius that keeps them from
 * overlapping each other.
 */
function placeRing(
  P: Position,
  count: number,
  outwardAxis: number,
  childSize: number,
  minRadius: number
): Position[] {
  const step = 360 / count;
  const siblingMin = childSize * SIBLING_MIN_FACTOR;
  const sinHalf = Math.sin((Math.PI * step) / 360);
  const ringRadius = sinHalf > EPS ? Math.max(minRadius, siblingMin / (2 * sinHalf)) : minRadius;

  const positions: Position[] = [];
  for (let i = 0; i < count; i++) {
    positions.push(polarToCartesian(P, outwardAxis + i * step, ringRadius));
  }
  return positions;
}

// ============================================================================
// FALLBACK 2  (greedy outward pack, alternating, §4.8)
// ============================================================================

/** Offsets 0, +δ, −δ, +2δ, −2δ, … for `count` children. */
function alternatingOffsets(count: number, delta: number): number[] {
  const out = [0];
  let k = 1;
  while (out.length < count) {
    out.push(k * delta);
    if (out.length < count) out.push(-k * delta);
    k++;
  }
  return out.slice(0, count);
}

/**
 * True if a child centred at `p` overlaps no existing node body. Unlike
 * `obstacleClear` this ignores the connector `P→p` and existing edges — it is the
 * §4.8 "clears obstacles" test, where only the child body matters.
 */
function nodeBodyClear(p: Position, childRadius: number, nodes: NodeObstacle[]): boolean {
  for (const n of nodes) {
    if (distance(p, n.pos) < childRadius + n.size / 2 + NODE_MARGIN) return false;
  }
  return true;
}

/**
 * Nearest position from `minRadius` outward on `angleDeg` whose body clears every
 * node and sits `siblingMin` from all placed children; `minRadius` if none clears.
 */
function nearestPackRadius(
  P: Position,
  angleDeg: number,
  childRadius: number,
  siblingMin: number,
  minRadius: number,
  maxRadius: number,
  nodes: NodeObstacle[],
  placed: Position[]
): Position {
  for (let r = minRadius; r <= maxRadius; r += RADIUS_STEP) {
    const p = polarToCartesian(P, angleDeg, r);
    if (nodeBodyClear(p, childRadius, nodes) && minDistToPlaced(p, placed) >= siblingMin) {
      return p;
    }
  }
  return polarToCartesian(P, angleDeg, minRadius);
}

/**
 * Last resort (§4.8): the node is boxed in, so pack the children outward along the
 * axis, alternating ±δ around it. Each child's body clears every node (the
 * connector may cross nodes and edges here) and sits `siblingMin` from every
 * placed child. `δ` is sized from where child 1 *actually* lands — which may be
 * pushed out past a nearby node — so the fan is no wider than that distance needs.
 * If nothing clears within `maxRadius`, a child stays at `minRadius` (compact,
 * accepting overlap) rather than being flung to the far cap.
 */
function packOutward(
  P: Position,
  count: number,
  axis: number,
  childSize: number,
  minRadius: number,
  maxRadius: number,
  nodes: NodeObstacle[]
): Position[] {
  const childRadius = childSize / 2;
  const siblingMin = childSize * SIBLING_MIN_FACTOR;
  const positions: Position[] = [];

  // Child 1 on the axis first; its actual radius sizes the fan.
  positions.push(nearestPackRadius(P, axis, childRadius, siblingMin, minRadius, maxRadius, nodes, positions));
  const actualRadius = distance(P, positions[0]);
  const delta = (2 * Math.asin(Math.min(1, siblingMin / (2 * actualRadius))) * 180) / Math.PI;
  const offsets = alternatingOffsets(count, delta);

  for (let i = 1; i < count; i++) {
    positions.push(
      nearestPackRadius(P, axis + offsets[i], childRadius, siblingMin, minRadius, maxRadius, nodes, positions)
    );
  }
  return positions;
}

// ============================================================================
// EXPORT
// ============================================================================

/** Pick the highest-scoring sector that passes the per-child width gate (§4.3). */
function chooseSector(
  sectors: Sector[],
  count: number,
  P: Position,
  minRadius: number,
  maxRadius: number,
  vp: ViewportRect | null
): Sector | null {
  let best: Sector | null = null;
  let bestScore = -Infinity;
  for (const s of sectors) {
    if (s.width / count < T_MIN_DEG) continue;
    const score = sectorScore(P, s, minRadius, maxRadius, vp);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/**
 * Place an expanding node's new children (docs/node-expansion-spec.md). Tries the
 * best free sector first, then a nodes-only sector allowing connectors to cross
 * existing edges, then a greedy alternating outward pack.
 */
export function placeExpansionFan(input: FanPlacementInput): Position[] {
  const {
    parentPos,
    childCount,
    childSize,
    nodeObstacles,
    edgeObstacles,
    minRadius,
    maxRadius,
    referenceCenter,
    viewport
  } = input;

  if (childCount <= 0) return [];

  const childRadius = childSize / 2;
  const outwardAxis = resolveOutwardAxis(parentPos, referenceCenter, nodeObstacles, minRadius);
  const vpArcs = viewport ? viewportArcs(parentPos, minRadius, childRadius, viewport) : [];

  // Primary — free sectors respecting existing nodes, edges, and the viewport.
  const primaryArcs = [
    ...computeBlockedArcs(parentPos, nodeObstacles, edgeObstacles, true),
    ...vpArcs
  ];
  if (primaryArcs.length === 0) {
    return placeRing(parentPos, childCount, outwardAxis, childSize, minRadius);
  }
  const primary = chooseSector(freeSectors(primaryArcs), childCount, parentPos, minRadius, maxRadius, viewport);
  if (primary) {
    return placeInSector(parentPos, primary, childCount, childSize, minRadius, maxRadius, nodeObstacles, edgeObstacles, viewport, false);
  }

  // Fallback 1 — keep nodes and the viewport, drop existing edges; connectors may
  // now cross existing edges.
  const nodeArcs = [
    ...computeBlockedArcs(parentPos, nodeObstacles, edgeObstacles, false),
    ...vpArcs
  ];
  if (nodeArcs.length === 0) {
    return placeRing(parentPos, childCount, outwardAxis, childSize, minRadius);
  }
  const relaxed = chooseSector(freeSectors(nodeArcs), childCount, parentPos, minRadius, maxRadius, viewport);
  if (relaxed) {
    return placeInSector(parentPos, relaxed, childCount, childSize, minRadius, maxRadius, nodeObstacles, edgeObstacles, viewport, true);
  }

  // Fallback 2 — the node is boxed in; greedy alternating outward pack (viewport
  // and existing edges relaxed).
  return packOutward(parentPos, childCount, outwardAxis, childSize, minRadius, maxRadius, nodeObstacles);
}
