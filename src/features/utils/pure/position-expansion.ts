/**
 * Expansion position calculation utilities
 * Pure functions for calculating child node positions during expansion
 * with collision avoidance
 * NO DEPENDENCIES TO BE INTRODUCED IN THIS FILE (BESIDES TYPES)
 */

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
