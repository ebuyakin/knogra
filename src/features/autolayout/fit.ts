/**
 * Auto-layout viewport fit
 *
 * Computes the zoom/pan that frames a final layout inside the Cytoscape
 * container, using the same math as Cytoscape's native fit so framing matches
 * `Scene.fit()`. Feature-local shared helper: used by both `autolayout.ts`
 * (plain re-arrange) and `grow-arrange.ts` (grow & arrange).
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import type { Position } from './algorithms/types';
import type { ViewportTarget } from '../utils/cy/node-position-animator';

/** Viewport padding (px) around the fitted layout, matching Scene.fit(). */
export const FIT_PADDING = 50;

/** Upper zoom cap so sparse layouts are not blown up, matching Scene.fit(). */
export const FIT_MAX_ZOOM = 1.5;

/**
 * Compute the zoom/pan that fits the given node targets (with their footprints)
 * into the container. Mirrors Cytoscape's fit, clamped to the instance's
 * min/max zoom.
 */
export function computeFitViewport(
  targets: Map<NodeId, Position>,
  footprints: Map<NodeId, { width: number; height: number }>,
  cy: Core
): ViewportTarget {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const [nodeId, position] of targets) {
    const footprint = footprints.get(nodeId);
    if (!footprint) continue;
    const halfWidth = footprint.width / 2;
    const halfHeight = footprint.height / 2;
    x1 = Math.min(x1, position.x - halfWidth);
    x2 = Math.max(x2, position.x + halfWidth);
    y1 = Math.min(y1, position.y - halfHeight);
    y2 = Math.max(y2, position.y + halfHeight);
  }

  const width = cy.width();
  const height = cy.height();
  const boxWidth = Math.max(1, x2 - x1);
  const boxHeight = Math.max(1, y2 - y1);

  let zoom = Math.min((width - 2 * FIT_PADDING) / boxWidth, (height - 2 * FIT_PADDING) / boxHeight, FIT_MAX_ZOOM);
  zoom = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), zoom));

  return {
    zoom,
    pan: {
      x: (width - zoom * (x1 + x2)) / 2,
      y: (height - zoom * (y1 + y2)) / 2,
    },
  };
}
