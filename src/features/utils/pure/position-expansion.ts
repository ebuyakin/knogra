/**
 * Expansion position calculation utilities
 * Pure functions for calculating child node positions during expansion
 * with collision avoidance
 * NO DEPENDENCIES TO BE INTRODUCED IN THIS FILE (BESIDES TYPES)
 */

import type { ViewportRect } from './donut-placement';

export interface Position {
  x: number;
  y: number;
}

/**
 * Calculate positions in a circle around a center point
 */
export function circularSpread(
  center: Position,
  count: number,
  radius: number
): Position[] {
  if (count === 0) return [];
  if (count === 1) return [{ x: center.x, y: center.y + radius }];

  const positions: Position[] = [];
  const angleStep = (2 * Math.PI) / count;
  const startAngle = -Math.PI / 2; // Start at top

  for (let i = 0; i < count; i++) {
    const angle = startAngle + i * angleStep;
    positions.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    });
  }

  return positions;
}

/**
 * Calculate angular range blocked by an obstacle
 * Uses tangent lines from center to obstacle circle
 */
function calculateAngularBlockage(
  center: Position,
  obstaclePos: Position,
  obstacleRadius: number
): { startAngle: number; endAngle: number } | null {
  const dx = obstaclePos.x - center.x;
  const dy = obstaclePos.y - center.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // If obstacle is at center or very close, block nothing
  if (dist < 0.1) {
    return null;
  }

  // Calculate angle to obstacle center
  const centerAngle = Math.atan2(dy, dx) * (180 / Math.PI);

  // Calculate angular width of obstacle from center's perspective
  // sin(halfAngle) = obstacleRadius / dist
  const halfAngle = Math.asin(Math.min(obstacleRadius / dist, 1)) * (180 / Math.PI);

  // Calculate start and end angles (in degrees)
  let startAngle = centerAngle - halfAngle;
  let endAngle = centerAngle + halfAngle;

  // Normalize to 0-360 range
  startAngle = ((startAngle % 360) + 360) % 360;
  endAngle = ((endAngle % 360) + 360) % 360;

  return { startAngle, endAngle };
}

/**
 * Mark angles as blocked in the boolean array
 * Handles wrap-around (e.g., 350° to 10°)
 */
function markAnglesAsBlocked(
  blockedAngles: boolean[],
  startAngle: number,
  endAngle: number
): void {
  const start = Math.floor(startAngle);
  const end = Math.floor(endAngle);

  if (start <= end) {
    // Normal range (no wrap-around)
    for (let i = start; i <= end; i++) {
      blockedAngles[i] = true;
    }
  } else {
    // Wrap-around case (e.g., 350 to 10)
    for (let i = start; i < 360; i++) {
      blockedAngles[i] = true;
    }
    for (let i = 0; i <= end; i++) {
      blockedAngles[i] = true;
    }
  }
}

/**
 * Find the largest continuous free sector
 */
function findLargestFreeSector(
  blockedAngles: boolean[]
): { start: number; width: number } | null {
  let maxWidth = 0;
  let maxStart = 0;
  let currentStart = -1;
  let currentWidth = 0;

  // Scan twice to handle wrap-around
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 360; i++) {
      if (!blockedAngles[i]) {
        // Free angle
        if (currentStart === -1) {
          currentStart = i;
          currentWidth = 1;
        } else {
          currentWidth++;
        }
      } else {
        // Blocked angle - end of current free sector
        if (currentStart !== -1 && currentWidth > maxWidth) {
          maxWidth = currentWidth;
          maxStart = currentStart;
        }
        currentStart = -1;
        currentWidth = 0;
      }
    }
  }

  // Check final sector
  if (currentStart !== -1 && currentWidth > maxWidth) {
    maxWidth = currentWidth;
    maxStart = currentStart;
  }

  if (maxWidth === 0) {
    return null;
  }

  return { start: maxStart, width: maxWidth };
}

/**
 * Calculate circular spread positions with sector-based collision avoidance
 * Finds the largest free angular sector and places all children there at uniform radius
 * 
 * @param center - Center position (parent node)
 * @param count - Number of positions to calculate
 * @param existingPositions - Existing node positions to avoid
 * @param minRadius - Minimum radius based on parent node size
 * @param nodeSize - Approximate node size for collision detection (default 100)
 * @param maxRadius - Maximum radius to try (default 1000)
 */
export function circularSpreadSafe(
  center: Position,
  count: number,
  existingPositions: Position[],
  minRadius: number,
  nodeSize: number = 100,
  maxRadius: number = 1000
): Position[] {
  if (count === 0) return [];

  // Step 1: Build obstacle map (360 boolean array, one per degree)
  const blockedAngles = new Array(360).fill(false);

  for (const obstaclePos of existingPositions) {
    const blockage = calculateAngularBlockage(center, obstaclePos, nodeSize);
    if (blockage) {
      markAnglesAsBlocked(blockedAngles, blockage.startAngle, blockage.endAngle);
    }
  }

  // Step 2: Find largest free sector
  const freeSector = findLargestFreeSector(blockedAngles);
  
  if (!freeSector || freeSector.width < 10) {
    console.warn('No suitable sector found for expansion');
    return [];
  }

  // Step 3: Calculate required radius for sector
  const sectorAngleRad = (freeSector.width * Math.PI) / 180;
  const requiredSpacing = nodeSize * 1.5; // Safety margin
  const requiredArcLength = count * requiredSpacing;
  const safeRadius = requiredArcLength / sectorAngleRad;

  // Step 4: Apply minimum radius constraint
  const finalRadius = Math.max(safeRadius, minRadius);

  // Check if we exceed max radius
  if (finalRadius > maxRadius) {
    console.warn(`Required radius ${finalRadius} exceeds maximum ${maxRadius}`);
    return [];
  }

  // Step 5: Distribute children evenly in sector
  const positions: Position[] = [];
  const angleStep = freeSector.width / count;

  for (let i = 0; i < count; i++) {
    // Center each child in its angular slice
    const angleDeg = freeSector.start + angleStep * (i + 0.5);
    const angleRad = (angleDeg * Math.PI) / 180;
    
    positions.push({
      x: center.x + finalRadius * Math.cos(angleRad),
      y: center.y + finalRadius * Math.sin(angleRad)
    });
  }

  return positions;
}

/**
 * A neighbouring node treated as a circular obstacle, with its real half-size.
 */
export interface SizedObstacle {
  pos: Position;
  /** Half of the node's larger bounding-box dimension (after scale). */
  half: number;
}

// Single-node placement tuning — see docs/node-placement.md §4, §7.
// Calibrated 2026-07-27: these are the values that look right at node.spacing = 1.
/** Clearance margin between two node bodies, as a fraction of the new node's diameter. */
const SINGLE_CLEAR_FACTOR = 0.05;
/** Breathing room beyond touching, as a fraction of the new node's radius. */
const SINGLE_BREATH_FACTOR = 0.25;

/** Candidate bearings when the reference has no neighbours: the compass order. */
const LONELY_BEARINGS_DEG = [0, 180, 90, 270];

/**
 * Smallest angular distance (deg) between a candidate bearing and an existing
 * spoke. Two connectors this far apart still read as two edges; closer, they
 * cover each other. This gate is the never-coincide guarantee in numbers
 * (docs/node-placement.md §5.1); expansion uses the same 5° as its per-child
 * minimum.
 */
const MIN_SPOKE_CLEARANCE_DEG = 5;

/** A candidate bearing and its angular distance to the nearest existing spoke. */
interface CandidateBearing {
  deg: number;
  clearance: number;
}

/**
 * Candidate bearings (deg) for a new node, most preferred first. Each gap between
 * neighbour bearings is halved repeatedly — midpoint, quarter points, eighth
 * points … — until the clearance to the nearest spoke would drop below
 * `MIN_SPOKE_CLEARANCE_DEG`; all candidates are then ranked by that clearance,
 * globally, so a wide gap's eighth point outranks a narrow gap's midpoint.
 * Deterministic: equal clearances keep clockwise-from-East order (stable sort).
 * In a dense ring where no gap passes the gate, the widest gap's midpoint is the
 * only candidate. See docs/node-placement.md §5.1.
 */
function candidateBearingsDeg(refPos: Position, obstacles: SizedObstacle[]): number[] {
  const angles = obstacles
    .map(o => (Math.atan2(o.pos.y - refPos.y, o.pos.x - refPos.x) * 180) / Math.PI)
    .map(deg => ((deg % 360) + 360) % 360)
    .sort((a, b) => a - b);
  if (angles.length === 0) return LONELY_BEARINGS_DEG;

  const gaps: Array<{ start: number; width: number }> = [];
  for (let i = 0; i < angles.length; i++) {
    const a1 = angles[i];
    const a2 = i + 1 < angles.length ? angles[i + 1] : angles[0] + 360;
    if (a2 - a1 > 1e-6) gaps.push({ start: a1, width: a2 - a1 });
  }

  const candidates: CandidateBearing[] = [];
  for (const g of gaps) {
    for (let parts = 2; g.width / parts >= MIN_SPOKE_CLEARANCE_DEG; parts *= 2) {
      const clearance = g.width / parts;
      for (let k = 1; k < parts; k += 2) {
        candidates.push({ deg: (g.start + (g.width * k) / parts) % 360, clearance });
      }
    }
  }
  candidates.sort((a, b) => b.clearance - a.clearance);
  if (candidates.length > 0) return candidates.map(c => c.deg);

  const widest = gaps.reduce((best, g) => (g.width > best.width ? g : best), gaps[0]);
  return [(widest.start + widest.width / 2) % 360];
}

/** Nearest point to `p` at which a node of radius `half` sits fully inside `vp`. */
function clampToViewport(p: Position, half: number, vp: ViewportRect | null): Position {
  if (vp === null) return p;
  return {
    x: clampAxis(p.x, vp.x1 + half, vp.x2 - half),
    y: clampAxis(p.y, vp.y1 + half, vp.y2 - half)
  };
}

/** Clamp `v` into [lo, hi]; when the node is larger than the viewport (lo > hi), centre it. */
function clampAxis(v: number, lo: number, hi: number): number {
  if (lo > hi) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Place ONE node next to a reference node. Implements docs/node-placement.md.
 *
 * Direction: candidate bearings between neighbour spokes, ranked by angular
 * clearance from the nearest spoke (see `candidateBearingsDeg`); the widest gap's
 * bisector comes first. Every candidate keeps at least `MIN_SPOKE_CLEARANCE_DEG`
 * from every spoke, so connectors never cover each other (no angular grid, no
 * aliasing). Radius: the preferred distance if it clears, otherwise the nearest
 * larger radius along that bearing that clears every node. All radii and
 * clearances derive from node sizes, so the layout scales with the design system.
 *
 * The viewport is a hard constraint, applied in three passes: a clean on-screen
 * spot on the best bearing that has one; else the preferred distance on the best
 * bearing that is on screen, overlap tolerated; else the preferred spot pulled
 * inside the viewport. A single node overlapping is tolerable; a node the user
 * cannot see is not. With no viewport the walk is unbounded by the screen and
 * the saturated-scene fallback is the preferred spot itself.
 *
 * @param refPos    Reference node centre.
 * @param refHalf   Reference node bounding-circle radius (after scale).
 * @param newHalf   New node bounding-circle radius.
 * @param obstacles Every other in-scene node as {pos, half}. The reference need
 *                  not be excluded — a zero-distance obstacle is ignored.
 * @param spacing   User multiplier for breathing room and clearance (1 = default).
 * @param viewport  Visible area in model coordinates (`cy.extent()`), or null.
 */
export function placeSingleNode(
  refPos: Position,
  refHalf: number,
  newHalf: number,
  obstacles: SizedObstacle[],
  spacing: number = 1,
  viewport: ViewportRect | null = null
): Position {
  const childSize = newHalf * 2;
  const gClear = childSize * SINGLE_CLEAR_FACTOR * spacing;
  const gBreath = newHalf * SINGLE_BREATH_FACTOR;
  // `spacing` scales the WHOLE preferred distance, not just the margin: the
  // margin is small next to the (unscaled) node radii, so scaling it alone barely
  // moved the layout. Floored at minRadius because the reference node is not in
  // the obstacle list — without the floor a small multiplier would drop the new
  // node on top of its own parent.
  const minRadius = refHalf + newHalf + gClear;
  const rPref = Math.max(minRadius, (refHalf + newHalf + gBreath) * spacing);
  const dR = Math.max(6, newHalf * 0.5);

  // Precompute obstacle set; drop the reference itself (zero distance) and track
  // the farthest neighbour to bound the search.
  let maxObstDist = 0;
  const obs: SizedObstacle[] = [];
  for (const o of obstacles) {
    const dist = Math.hypot(o.pos.x - refPos.x, o.pos.y - refPos.y);
    if (dist < 1) continue;
    obs.push(o);
    if (dist > maxObstDist) maxObstDist = dist;
  }
  const searchCap = Math.max(rPref * 4, maxObstDist + childSize);

  // A candidate centre clears iff its body stays gClear from every obstacle body.
  const clears = (p: Position): boolean => {
    for (const o of obs) {
      const need = newHalf + o.half + gClear;
      const dx = o.pos.x - p.x;
      const dy = o.pos.y - p.y;
      if (dx * dx + dy * dy < need * need) return false;
    }
    return true;
  };

  // The viewport edges are axis-aligned, so what must fit is the node's box, not
  // its bounding circle. Callers derive `newHalf` as half the longer side × √2;
  // dividing it back out gives half the longer side — exact for a square node,
  // conservative on the short axis of a wide one. The circle radius itself
  // rejected every spot level with an anchor near the top or bottom edge.
  const screenInset = newHalf / Math.SQRT2;
  const onScreen = (p: Position): boolean =>
    viewport === null ||
    (p.x - screenInset >= viewport.x1 && p.x + screenInset <= viewport.x2 &&
     p.y - screenInset >= viewport.y1 && p.y + screenInset <= viewport.y2);

  const at = (bearingDeg: number, r: number): Position => {
    const rad = (bearingDeg * Math.PI) / 180;
    return { x: refPos.x + r * Math.cos(rad), y: refPos.y + r * Math.sin(rad) };
  };

  const bearings = candidateBearingsDeg(refPos, obs);

  // Pass 1 — on each bearing, most preferred first, the nearest radius from the
  // preferred distance outward that clears every node. A bearing is abandoned
  // the moment its spot leaves the viewport: every spot further out is off-screen too.
  for (const bearingDeg of bearings) {
    for (let r = rPref; r <= searchCap; r += dR) {
      const p = at(bearingDeg, r);
      if (!onScreen(p)) break;
      if (clears(p)) return p;
    }
  }

  // Pass 2 — no clean spot on screen: the preferred distance on the most
  // preferred bearing that is on screen, overlap tolerated. Still strictly
  // between spokes, so the connector still cannot cover an existing edge.
  for (const bearingDeg of bearings) {
    const p = at(bearingDeg, rPref);
    if (onScreen(p)) return p;
  }

  // Pass 3 — the anchor itself is within a node's size of the viewport edge:
  // the preferred spot, pulled inside the viewport. The one path where the
  // connector may coincide with an existing edge; accepted as exotic.
  return clampToViewport(at(bearings[0], rPref), screenInset, viewport);
}
