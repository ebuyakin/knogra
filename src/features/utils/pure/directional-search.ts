/**
 * Directional Search
 * Pure geometry for "which node lies nearest in this direction".
 * NO DEPENDENCIES TO BE INTRODUCED IN THIS FILE (BESIDES TYPES)
 */

import type { NodeId } from '../../../core/main-types';
import type { Position } from './scene-calculations';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface SearchCandidate {
  id: NodeId;
  position: Position;
}

/**
 * Cone half-widths tried in order. A tight cone keeps the jump predictable when
 * the scene is dense; widening once rescues sparse scenes where the strict cone
 * finds nothing at all.
 */
const CONE_HALF_ANGLES_DEG = [45, 75];

/**
 * Nearest candidate in the given direction, searching progressively wider cones.
 *
 * @pure No side effects
 */
export function findClosestInDirection(
  candidates: SearchCandidate[],
  origin: Position,
  direction: Direction
): NodeId | null {
  for (const halfAngleDeg of CONE_HALF_ANGLES_DEG) {
    const found = findClosestInCone(candidates, origin, direction, halfAngleDeg);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Nearest candidate within ±halfAngleDeg of the direction axis.
 *
 * A candidate qualifies when it lies ahead along the axis and its sideways
 * offset stays inside the cone; among those, the closest by straight-line
 * distance wins. Exported separately so the cone rule can be exercised on its
 * own.
 *
 * @pure No side effects
 */
export function findClosestInCone(
  candidates: SearchCandidate[],
  origin: Position,
  direction: Direction,
  halfAngleDeg: number
): NodeId | null {
  // tan(halfAngle) = the largest sideways offset allowed per unit of forward distance.
  const maxRatio = Math.tan((halfAngleDeg * Math.PI) / 180);

  let bestId: NodeId | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const dx = candidate.position.x - origin.x;
    const dy = candidate.position.y - origin.y;
    if (dx === 0 && dy === 0) continue;

    const { forward, sideways } = project(dx, dy, direction);
    if (forward <= 0) continue;
    if (sideways > forward * maxRatio) continue;

    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = candidate.id;
    }
  }

  return bestId;
}

/** Split an offset into distance along the direction axis and across it. */
function project(dx: number, dy: number, direction: Direction): { forward: number; sideways: number } {
  switch (direction) {
    case 'up': return { forward: -dy, sideways: Math.abs(dx) };
    case 'down': return { forward: dy, sideways: Math.abs(dx) };
    case 'right': return { forward: dx, sideways: Math.abs(dy) };
    case 'left': return { forward: -dx, sideways: Math.abs(dy) };
  }
}
