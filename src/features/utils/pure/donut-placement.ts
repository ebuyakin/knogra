/**
 * Grouped Angular Placement Algorithm
 * 
 * Places child nodes around a parent, keeping them together as a cohesive group.
 * 
 * Core Principle: Children stay grouped in contiguous arcs, evenly spaced angularly.
 * Radial distance varies per child to avoid overlap.
 * 
 * Algorithm:
 * 1. Scan all angles to find which have usable depth (considering obstacles + viewport)
 * 2. Identify contiguous "free arcs" and sort by width
 * 3. Try to fit all children in the largest arc with equal angular spacing
 * 4. If not possible, distribute children proportionally across multiple arcs
 * 5. Within each arc, place children at evenly-spaced angles, varying distance as needed
 * 
 * NO DEPENDENCIES TO BE INTRODUCED IN THIS FILE (BESIDES TYPES)
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Buffer zone around existing obstacles (pixels) - keeps new nodes separated from existing */
const OBSTACLE_MARGIN = 80;

/** Buffer zone between siblings (pixels) - can be tighter since they're related */
const SIBLING_MARGIN = 10;

/** Angular resolution for arc scanning (degrees) */
const SCAN_STEP = 5;

/** Angular resolution for fallback search (degrees) */
const SEARCH_STEP = 3;

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

interface FreeArc {
  startAngle: number;
  endAngle: number;
  width: number;
}

interface ChildPlacement {
  originalIndex: number;
  size: number;
  position?: Position;
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

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
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

/**
 * Check if a ray has any usable position (ignoring siblings, just obstacles + viewport)
 * Returns { usable: boolean, reason?: string } for debugging
 */
function isRayUsableWithReason(
  parentPos: Position,
  angleDeg: number,
  childRadius: number,
  obstacles: Obstacle[],
  minRadius: number,
  maxRadius: number,
  viewport: Viewport | undefined
): { usable: boolean; reason?: string } {
  // Check at various distances
  for (let r = minRadius; r <= maxRadius; r += 10) {
    const pos = polarToCartesian(parentPos, angleDeg, r);
    
    // Check viewport
    if (viewport) {
      if (pos.x - childRadius < viewport.x1) continue;
      if (pos.x + childRadius > viewport.x2) continue;
      if (pos.y - childRadius < viewport.y1) continue;
      if (pos.y + childRadius > viewport.y2) continue;
    }
    
    // Check obstacles
    let blocked = false;
    for (const obs of obstacles) {
      if (circlesOverlap(pos, childRadius, obs.pos, obs.size / 2, OBSTACLE_MARGIN)) {
        blocked = true;
        break;
      }
    }
    
    if (!blocked) {
      return { usable: true };
    }
  }
  
  // Determine why blocked at minRadius
  const pos = polarToCartesian(parentPos, angleDeg, minRadius);
  
  if (viewport) {
    if (pos.x - childRadius < viewport.x1) return { usable: false, reason: 'viewport-left' };
    if (pos.x + childRadius > viewport.x2) return { usable: false, reason: 'viewport-right' };
    if (pos.y - childRadius < viewport.y1) return { usable: false, reason: 'viewport-top' };
    if (pos.y + childRadius > viewport.y2) return { usable: false, reason: 'viewport-bottom' };
  }
  
  for (const obs of obstacles) {
    if (circlesOverlap(pos, childRadius, obs.pos, obs.size / 2, OBSTACLE_MARGIN)) {
      return { usable: false, reason: `obstacle:${obs.id || 'unknown'}` };
    }
  }
  
  return { usable: false, reason: 'unknown' };
}

// ============================================================================
// ARC FINDING
// ============================================================================

/**
 * Find contiguous free arcs by scanning all angles
 */
function findFreeArcs(
  parentPos: Position,
  childRadius: number,
  obstacles: Obstacle[],
  minRadius: number,
  maxRadius: number,
  viewport: Viewport | undefined
): FreeArc[] {
  // Scan all angles to find which are usable, with reasons for blocked ones
  const usable: boolean[] = [];
  const blockedReasons: string[] = [];
  
  for (let angle = 0; angle < 360; angle += SCAN_STEP) {
    const result = isRayUsableWithReason(parentPos, angle, childRadius, obstacles, minRadius, maxRadius, viewport);
    usable.push(result.usable);
    if (!result.usable) {
      blockedReasons.push(`${angle}°:${result.reason}`);
    }
  }
  
  // Debug: show usable rays and blocked reasons (uncomment for debugging)
  // const usableAngles = usable.map((u, i) => u ? i * SCAN_STEP : null).filter(a => a !== null);
  // console.log('[findFreeArcs] Usable rays:', usableAngles.join('°, ') + '°');
  // console.log('[findFreeArcs] Blocked rays:', blockedReasons.join(', '));
  
  // Find contiguous runs of usable angles
  const arcs: FreeArc[] = [];
  let arcStart = -1;
  const count = usable.length;
  
  for (let i = 0; i < count; i++) {
    const isUsable = usable[i];
    
    if (isUsable && arcStart === -1) {
      arcStart = i;
    } else if (!isUsable && arcStart !== -1) {
      const startAngle = arcStart * SCAN_STEP;
      const endAngle = i * SCAN_STEP;
      const width = (i - arcStart) * SCAN_STEP;
      if (width > 0) {
        arcs.push({ startAngle, endAngle, width });
      }
      arcStart = -1;
    }
  }
  
  // Handle arc that extends to end of scan
  if (arcStart !== -1) {
    const startAngle = arcStart * SCAN_STEP;
    arcs.push({ startAngle, endAngle: 360, width: 360 - startAngle });
  }
  
  // Handle wrap-around: check if last arc (ending at 360°) connects to first arc
  if (arcs.length >= 2) {
    const lastArc = arcs[arcs.length - 1];
    const firstArc = arcs[0];
    
    // Check if they're adjacent (last ends at 360°, first starts near 0°)
    if (lastArc.endAngle === 360 && firstArc.startAngle < SCAN_STEP * 2) {
      // Check if the angle at 0° is actually usable (connecting them)
      if (usable[0]) {
        // Merge: new arc from lastArc.start to firstArc.end, wrapping around
        const mergedWidth = lastArc.width + firstArc.width;
        arcs[0] = {
          startAngle: lastArc.startAngle,
          endAngle: firstArc.endAngle,
          width: mergedWidth
        };
        arcs.pop(); // Remove the last arc (now merged)
      }
    }
  } else if (arcs.length === 1 && arcs[0].endAngle === 360 && usable[0]) {
    // Single arc that wraps around to connect with itself at 0°
    // Check if it's actually a full circle
    if (arcs[0].startAngle === 0) {
      arcs[0].width = 360;
    }
  }
  
  // If nothing found, return full circle as fallback
  if (arcs.length === 0) {
    arcs.push({ startAngle: 0, endAngle: 360, width: 360 });
  }
  
  // Sort by width (largest first)
  arcs.sort((a, b) => b.width - a.width);
  
  return arcs;
}

// ============================================================================
// CHILD DISTRIBUTION
// ============================================================================

/**
 * Distribute N children across arcs, strongly preferring to keep them together
 * Since children can be placed at varying distances, we can fit more than
 * the simple chord-based calculation suggests.
 */
function distributeChildrenToArcs(
  arcs: FreeArc[],
  childCount: number,
  _childSize: number,
  _minRadius: number
): { arc: FreeArc; count: number }[] {
  if (arcs.length === 0) return [];
  
  // ALWAYS try to fit all children in the largest arc first
  // The varying-distance placement will handle collisions
  const largestArc = arcs[0];
  
  // Only split if the arc is very small (less than 10° per child)
  const degreesPerChild = largestArc.width / childCount;
  
  if (degreesPerChild >= 10) {
    // Enough angular room - put all in one arc
    return [{ arc: largestArc, count: childCount }];
  }
  
  // Arc is too narrow, need to split across multiple arcs
  const distribution: { arc: FreeArc; count: number }[] = [];
  let remaining = childCount;
  
  for (const arc of arcs) {
    if (remaining <= 0) break;
    
    // How many can fit with at least 10° spacing?
    const maxHere = Math.max(1, Math.floor(arc.width / 10));
    const assignHere = Math.min(remaining, maxHere);
    
    if (assignHere > 0) {
      distribution.push({ arc, count: assignHere });
      remaining -= assignHere;
    }
  }
  
  // If we still have remaining, force them into the largest arc
  if (remaining > 0 && distribution.length > 0) {
    distribution[0].count += remaining;
  }
  
  return distribution;
}

/**
 * Generate evenly-spaced angles within an arc for N children
 */
function generateAnglesInArc(arc: FreeArc, count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [arc.startAngle + arc.width / 2];
  
  const padding = arc.width / (count + 1);
  const angles: number[] = [];
  
  for (let i = 0; i < count; i++) {
    const angle = arc.startAngle + padding * (i + 1);
    angles.push(normalizeAngle(angle));
  }
  
  return angles;
}

// ============================================================================
// MAIN ALGORITHM
// ============================================================================

/**
 * Place children in grouped arcs with even angular spacing
 */
function placeChildrenGrouped(
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
  
  // Find free arcs
  const freeArcs = findFreeArcs(parentPos, childRadius, obstacles, minRadius, maxRadius, viewport);
  
  // console.log('[placement] Free arcs:', freeArcs.map(a => `${a.startAngle}°-${a.endAngle}° (${a.width}°)`).join(', '));
  
  // Distribute children to arcs
  const distribution = distributeChildrenToArcs(freeArcs, childCount, maxChildSize, minRadius);
  
  // console.log('[placement] Distribution:', distribution.map(d => `${d.count} in ${d.arc.startAngle}°-${d.arc.endAngle}°`).join(', '));
  
  // Create child placement objects
  const children: ChildPlacement[] = sizes.map((size, i) => ({ originalIndex: i, size }));
  
  // Place children in each arc
  const placedPositions: Position[] = [];
  const placedRadii: number[] = [];
  let childIndex = 0;
  
  for (const { arc, count } of distribution) {
    const angles = generateAnglesInArc(arc, count);
    
    // console.log(`[placement] Arc ${arc.startAngle}°-${arc.endAngle}°: angles = ${angles.map(a => a.toFixed(0) + '°').join(', ')}`);
    
    for (const angle of angles) {
      if (childIndex >= children.length) break;
      
      const child = children[childIndex];
      const thisRadius = child.size / 2;
      
      // Try the assigned angle first
      let safeDistance = findSafeDistance(
        parentPos, angle, thisRadius, obstacles,
        placedPositions, placedRadii,
        minRadius, maxRadius, viewport
      );
      
      let usedAngle = angle;
      
      // If assigned angle is blocked, scan ALL angles to find any safe position
      // Priority #2: No overlap with existing nodes (must be enforced)
      if (safeDistance === null) {
        // console.log(`  Child ${childIndex + 1}: ${angle.toFixed(0)}° blocked, searching all angles...`);
        
        for (let searchAngle = 0; searchAngle < 360; searchAngle += SEARCH_STEP) {
          safeDistance = findSafeDistance(
            parentPos, searchAngle, thisRadius, obstacles,
            placedPositions, placedRadii,
            minRadius, maxRadius, viewport
          );
          
          if (safeDistance !== null) {
            usedAngle = searchAngle;
            break;
          }
        }
      }
      
      // If still no position found, try again WITHOUT viewport constraint
      // (better to place outside viewport than at extreme distance)
      // Use the originally assigned angle first to maintain even distribution
      if (safeDistance === null) {
        safeDistance = findSafeDistance(
          parentPos, angle, thisRadius, obstacles,
          placedPositions, placedRadii,
          minRadius, maxRadius, undefined  // no viewport constraint
        );
        usedAngle = angle;
        
        // If assigned angle still blocked (by obstacles/siblings), then search
        if (safeDistance === null) {
          for (let searchAngle = 0; searchAngle < 360; searchAngle += SEARCH_STEP) {
            safeDistance = findSafeDistance(
              parentPos, searchAngle, thisRadius, obstacles,
              placedPositions, placedRadii,
              minRadius, maxRadius, undefined  // no viewport constraint
            );
            
            if (safeDistance !== null) {
              usedAngle = searchAngle;
              break;
            }
          }
        }
      }
      
      if (safeDistance !== null) {
        const pos = polarToCartesian(parentPos, usedAngle, safeDistance);
        child.position = pos;
        placedPositions.push(pos);
        placedRadii.push(thisRadius);
        // console.log(`  Child ${childIndex + 1}: ${usedAngle.toFixed(0)}° @ ${safeDistance}px`);
      } else {
        // ABSOLUTE LAST RESORT: No valid position exists anywhere
        // This should only happen if the entire space is blocked by obstacles
        // Place at minRadius with even angular distribution
        const fallbackAngle = childIndex * (360 / children.length);
        const pos = polarToCartesian(parentPos, fallbackAngle, minRadius);
        child.position = pos;
        placedPositions.push(pos);
        placedRadii.push(thisRadius);
        console.warn(`  Child ${childIndex + 1}: Fallback placement at ${fallbackAngle.toFixed(0)}° @ ${minRadius}px`);
      }
      
      childIndex++;
    }
  }
  
  // Restore original order
  children.sort((a, b) => a.originalIndex - b.originalIndex);
  
  return children.map(c => c.position!);
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
  
  return placeChildrenGrouped(
    parentPos,
    childCount,
    childSizes,
    obstacles,
    minRadius,
    maxRadius,
    viewport
  );
}
