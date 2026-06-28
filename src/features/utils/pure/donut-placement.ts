/**
 * Compact Cluster Placement Algorithm
 *
 * Places newly-included child nodes around a parent, keeping them together as a
 * single compact group in the nearest open space — close to the parent, clear of
 * existing nodes, and inside the viewport when possible.
 *
 * Approach:
 * 1. Keep children at minRadius, wrapping around the parent as needed; only push
 *    out (into a ring) when they can't all fit at minRadius.
 * 2. Slide that group around the parent and choose the centre direction that lands
 *    in the most open space and grows away from the existing nodes.
 * 3. Place the group there, each child at the smallest safe radius for its slot.
 *
 * NO DEPENDENCIES TO BE INTRODUCED IN THIS FILE (BESIDES TYPES)
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Buffer zone around existing obstacles (pixels) - keeps new nodes separated from existing */
const OBSTACLE_MARGIN = 40;

/** Buffer zone between siblings (pixels) - can be tighter since they're related */
const SIBLING_MARGIN = 10;

/** Angular resolution for arc scanning (degrees) */
const SCAN_STEP = 5;

/** Angular resolution for fallback search (degrees) */
const SEARCH_STEP = 3;

/** Max outward angular nudges (× SEARCH_STEP) when a child's ideal slot is blocked. */
const MAX_NUDGE_STEPS = 8;

/** Pixel-weighted bias preferring the group to expand away from existing nodes (the scene centre). */
const AWAY_BIAS_WEIGHT = 60;

// ============================================================================
// TYPES
// ============================================================================

export interface Position {
  x: number;
  y: number;
}

export interface Viewport {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Obstacle {
  id?: string;
  pos: Position;
  size: number;
}

// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

function distance(a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function circlesOverlap(
  pos1: Position, radius1: number,
  pos2: Position, radius2: number,
  margin: number
): boolean {
  return distance(pos1, pos2) < (radius1 + radius2 + margin);
}

function polarToCartesian(center: Position, angleDeg: number, radius: number): Position {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + radius * Math.cos(angleRad),
    y: center.y + radius * Math.sin(angleRad)
  };
}

// ============================================================================
// RAY CHECKING
// ============================================================================

/**
 * Check if a position is valid (within viewport, not overlapping obstacles or siblings)
 */
function isPositionValid(
  pos: Position,
  childRadius: number,
  obstacles: Obstacle[],
  placedSiblings: Position[],
  siblingRadii: number[],
  viewport: Viewport | undefined
): boolean {
  // Check viewport
  if (viewport) {
    if (pos.x - childRadius < viewport.x1 ||
        pos.x + childRadius > viewport.x2 ||
        pos.y - childRadius < viewport.y1 ||
        pos.y + childRadius > viewport.y2) {
      return false;
    }
  }
  
  // Check obstacles
  for (const obs of obstacles) {
    if (circlesOverlap(pos, childRadius, obs.pos, obs.size / 2, OBSTACLE_MARGIN)) {
      return false;
    }
  }
  
  // Check siblings
  for (let i = 0; i < placedSiblings.length; i++) {
    if (circlesOverlap(pos, childRadius, placedSiblings[i], siblingRadii[i], SIBLING_MARGIN)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Find the minimum safe distance on a ray, or null if blocked entirely
 */
function findSafeDistance(
  parentPos: Position,
  angleDeg: number,
  childRadius: number,
  obstacles: Obstacle[],
  placedSiblings: Position[],
  siblingRadii: number[],
  minRadius: number,
  maxRadius: number,
  viewport: Viewport | undefined
): number | null {
  for (let r = minRadius; r <= maxRadius; r += 10) {
    const pos = polarToCartesian(parentPos, angleDeg, r);
    if (isPositionValid(pos, childRadius, obstacles, placedSiblings, siblingRadii, viewport)) {
      return r;
    }
  }
  return null;
}

// ============================================================================
// CLUSTER PLACEMENT (current algorithm)
// ============================================================================

/**
 * Minimum centre-to-centre angular spacing (degrees) so two children of the
 * given radius don't overlap when both sit at `radius` from the parent.
 */
function angularStepDeg(radius: number, childRadius: number, margin: number): number {
  const minChord = 2 * childRadius + margin;
  const ratio = Math.min(1, Math.max(0, minChord / (2 * radius)));
  return (2 * Math.asin(ratio) * 180) / Math.PI;
}

/**
 * Signed clearance of a candidate position: distance to the nearest obstacle
 * edge and viewport edge. Larger = more open space around the position.
 */
function clearanceAt(
  pos: Position,
  childRadius: number,
  obstacles: Obstacle[],
  viewport: Viewport | undefined
): number {
  let clear = Infinity;
  for (const obs of obstacles) {
    const gap = distance(pos, obs.pos) - (childRadius + obs.size / 2);
    if (gap < clear) clear = gap;
  }
  if (viewport) {
    clear = Math.min(
      clear,
      pos.x - childRadius - viewport.x1,
      viewport.x2 - (pos.x + childRadius),
      pos.y - childRadius - viewport.y1,
      viewport.y2 - (pos.y + childRadius)
    );
  }
  return clear;
}

interface FanResult {
  /** Final positions in original child order; null where no spot was found. */
  positions: (Position | null)[];
  placedCount: number;
  sumClearance: number;
  sumExtraRadius: number;
}

/**
 * Try to place all children as a compact fan centred on `centerAngle`.
 *
 * Children occupy fixed angular slots (`step` apart) around the centre and are
 * placed centre-outward so inner slots claim space first. Each child takes the
 * smallest safe radius at/beyond `baseRadius`; if its slot is blocked it nudges
 * a few degrees outward before being left unplaced. Mutates nothing.
 */
function attemptFan(
  parentPos: Position,
  centerAngle: number,
  sizes: number[],
  step: number,
  obstacles: Obstacle[],
  baseRadius: number,
  maxRadius: number,
  viewport: Viewport | undefined
): FanResult {
  const n = sizes.length;
  const mid = (n - 1) / 2;
  const positions: (Position | null)[] = new Array(n).fill(null);
  const placedPos: Position[] = [];
  const placedR: number[] = [];

  let placedCount = 0;
  let sumClearance = 0;
  let sumExtraRadius = 0;

  // Place from the centre of the fan outward so inner slots claim space first.
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));

  for (const i of order) {
    const thisRadius = sizes[i] / 2;
    const slotAngle = centerAngle + (i - mid) * step;
    const nudgeSign = i < mid ? -1 : 1; // nudge outward, away from the fan centre

    let angle = slotAngle;
    let r = findSafeDistance(
      parentPos, angle, thisRadius, obstacles,
      placedPos, placedR, baseRadius, maxRadius, viewport
    );

    for (let k = 1; r === null && k <= MAX_NUDGE_STEPS; k++) {
      angle = slotAngle + nudgeSign * k * SEARCH_STEP;
      r = findSafeDistance(
        parentPos, angle, thisRadius, obstacles,
        placedPos, placedR, baseRadius, maxRadius, viewport
      );
    }

    if (r === null) continue; // leave unplaced; caller applies a last resort

    const pos = polarToCartesian(parentPos, angle, r);
    positions[i] = pos;
    placedPos.push(pos);
    placedR.push(thisRadius);
    placedCount++;
    sumExtraRadius += r - baseRadius;
    sumClearance += clearanceAt(pos, thisRadius, obstacles, viewport);
  }

  return { positions, placedCount, sumClearance, sumExtraRadius };
}

/**
 * Pick the centre direction for the fan: the direction whose compact group
 * lands in the most open local pocket near the parent.
 *
 * Scans all directions, scoring each by how many children fit (primary) and by
 * open space minus extra radius (secondary). Prefers keeping the group inside
 * the viewport, only spilling outside it when that places strictly more nodes.
 */
function chooseClusterDirection(
  parentPos: Position,
  sizes: number[],
  step: number,
  obstacles: Obstacle[],
  baseRadius: number,
  maxRadius: number,
  viewport: Viewport | undefined,
  awayAngle: number | null
): { angle: number; viewport: Viewport | undefined } {
  const evaluate = (vp: Viewport | undefined): { angle: number; placedCount: number; quality: number } => {
    let best = { angle: 0, placedCount: -1, quality: -Infinity };
    for (let theta = 0; theta < 360; theta += SCAN_STEP) {
      const fan = attemptFan(parentPos, theta, sizes, step, obstacles, baseRadius, maxRadius, vp);
      let quality = fan.sumClearance - fan.sumExtraRadius;
      if (awayAngle !== null) {
        // Mild preference for growing away from the scene centre / obstacles.
        quality += AWAY_BIAS_WEIGHT * Math.cos(((theta - awayAngle) * Math.PI) / 180);
      }
      if (
        fan.placedCount > best.placedCount ||
        (fan.placedCount === best.placedCount && quality > best.quality)
      ) {
        best = { angle: theta, placedCount: fan.placedCount, quality };
      }
    }
    return best;
  };

  const withVp = evaluate(viewport);
  if (withVp.placedCount === sizes.length || viewport === undefined) {
    return { angle: withVp.angle, viewport };
  }

  // Couldn't fit everyone inside the viewport — allow spilling outside it,
  // but only if that actually places strictly more children.
  const noVp = evaluate(undefined);
  if (noVp.placedCount > withVp.placedCount) {
    return { angle: noVp.angle, viewport: undefined };
  }
  return { angle: withVp.angle, viewport };
}

/**
 * Place children as one compact group in the nearest open pocket around the
 * parent. Replaces the older "spread across the widest arc" approach.
 */
function placeChildrenCluster(
  parentPos: Position,
  childCount: number,
  childSizes: number[],
  obstacles: Obstacle[],
  minRadius: number,
  maxRadius: number,
  viewport: Viewport | undefined
): Position[] {
  if (childCount === 0) return [];

  const sizes = childSizes.length === childCount
    ? childSizes
    : new Array(childCount).fill(childSizes[0] || 100);

  const maxChildSize = Math.max(...sizes);
  const childRadius = maxChildSize / 2;
  const minChord = 2 * childRadius + SIBLING_MARGIN;

  // Spacing and radius: keep children as close to the parent as possible. They
  // wrap around the parent as needed; only when they can't all fit at minRadius
  // (even as a full ring) do we push out just enough to form one.
  const naturalStep = angularStepDeg(minRadius, childRadius, SIBLING_MARGIN);
  let step: number;
  let baseRadius: number;
  if (childCount <= 1) {
    step = 0;
    baseRadius = minRadius;
  } else if (childCount * naturalStep <= 360) {
    step = naturalStep;
    baseRadius = minRadius;
  } else {
    step = 360 / childCount;
    const sinHalf = Math.sin((step * Math.PI / 180) / 2);
    baseRadius = sinHalf > 0 ? Math.max(minRadius, minChord / (2 * sinHalf)) : minRadius;
  }

  // Prefer growing the group away from existing nodes (i.e. the scene centre).
  let awayAngle: number | null = null;
  if (obstacles.length > 0) {
    let cx = 0;
    let cy = 0;
    for (const obs of obstacles) {
      cx += obs.pos.x;
      cy += obs.pos.y;
    }
    cx /= obstacles.length;
    cy /= obstacles.length;
    awayAngle = (Math.atan2(parentPos.y - cy, parentPos.x - cx) * 180) / Math.PI;
  }

  // Aim the group at the most open local pocket, then place it there.
  const chosen = chooseClusterDirection(
    parentPos, sizes, step, obstacles, baseRadius, maxRadius, viewport, awayAngle
  );
  const fan = attemptFan(
    parentPos, chosen.angle, sizes, step, obstacles, baseRadius, maxRadius, chosen.viewport
  );

  // Last resort for any child with no clear spot at its ideal slot.
  const mid = (childCount - 1) / 2;
  const result: Position[] = [];
  for (let i = 0; i < childCount; i++) {
    const placed = fan.positions[i];
    if (placed) {
      result.push(placed);
    } else {
      const slotAngle = chosen.angle + (i - mid) * step;
      result.push(polarToCartesian(parentPos, slotAngle, baseRadius));
      console.warn(`[placement] Child ${i + 1}: no clear spot; placed at slot ${slotAngle.toFixed(0)}° @ ${baseRadius.toFixed(0)}px`);
    }
  }

  return result;
}

// ============================================================================
// EXPORT
// ============================================================================

export function placeChildrenDonutSimple(
  parentPos: Position,
  childCount: number,
  obstacles: Obstacle[],
  minRadius: number,
  childSize: number,
  viewport: Viewport,
  maxRadius: number
): Position[] {
  const childSizes = new Array(childCount).fill(childSize);
  
  return placeChildrenCluster(
    parentPos,
    childCount,
    childSizes,
    obstacles,
    minRadius,
    maxRadius,
    viewport
  );
}
