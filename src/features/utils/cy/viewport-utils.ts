/**
 * ViewportUtils
 * Resolves a scene's viewport pan against the CURRENT Cytoscape container
 * size. A scene stores its framing as `viewport.focalPoint` — the graph-space
 * point the author placed at the container center. Because that point is in
 * graph coordinates it is independent of container size and zoom, so the
 * framing survives resize and zoom changes. Pan is then derived fresh:
 * `pan = center - focalPoint * zoom`.
 *
 * Legacy scenes without `focalPoint` derive one from the stored pixel pan,
 * assuming it was captured at the current container size (fallback (b)).
 */

import type { Core } from 'cytoscape';
import type { Scene } from '../../../core/main-types';

interface Position {
  x: number;
  y: number;
}

/**
 * Pan that places a graph-space focal point at the container center.
 */
function centerPan(focalPoint: Position, zoom: number, width: number, height: number): Position {
  return {
    x: width / 2 - focalPoint.x * zoom,
    y: height / 2 - focalPoint.y * zoom
  };
}

/**
 * Resolve the pan to use when restoring a scene's viewport (scene open,
 * scene-to-scene arrival, or resize), centering the scene's stored focal point
 * on the CURRENT container size. Falls back to the stored pan if zoom is
 * invalid or the container isn't available.
 */
export function resolveScenePan(scene: Scene, cy: Core): Position {
  const zoom = scene.viewport?.zoom;
  const container = cy.container();
  if (!zoom || zoom <= 0 || !container) {
    return scene.viewport?.pan ?? { x: 0, y: 0 };
  }

  const width = container.clientWidth;
  const height = container.clientHeight;

  // Legacy scenes: derive the focal point from the stored pan, assuming it was
  // captured at the current container size. Re-centering on it is a no-op at
  // this size and preserves authored framing until the scene is re-saved.
  const storedPan = scene.viewport.pan ?? { x: 0, y: 0 };
  const focalPoint = scene.viewport.focalPoint ?? {
    x: (width / 2 - storedPan.x) / zoom,
    y: (height / 2 - storedPan.y) / zoom
  };

  return centerPan(focalPoint, zoom, width, height);
}
