/**
 * Viewport Calculations
 * Pure functions for calculating viewport positions
 * NO DEPENDENCIES TO BE INTRODUCED IN THIS FILE (BESIDES TYPES)
 */

import type { Scene } from '../../core/main-types';

/**
 * Calculate initial viewport for zoom-in animation
 */
export function calculateInitialViewport(
  scene: Scene,
  containerSize: { width: number; height: number }
): { zoom: number; pan: { x: number; y: number } } | null {
  const hasBackgroundImage = scene.backgroundImages && scene.backgroundImages.length > 0;

  if (hasBackgroundImage && scene.backgroundImages) {
    const bg = scene.backgroundImages[0];
    const centerX = bg.position.x + bg.size.width / 2;
    const centerY = bg.position.y + bg.size.height / 2;

    const viewportCenter = {
      x: containerSize.width / 2,
      y: containerSize.height / 2
    };

    const initialZoom = 0.1;

    return {
      zoom: initialZoom,
      pan: {
        x: viewportCenter.x - centerX * initialZoom,
        y: viewportCenter.y - centerY * initialZoom
      }
    };
  }

  return null;
}

/**
 * Calculate final viewport for scene animation
 */
export function calculateFinalViewport(
  scene: Scene,
  containerSize: { width: number; height: number }
): { zoom: number; pan: { x: number; y: number } } | null {
  const hasBackgroundImage = scene.backgroundImages && scene.backgroundImages.length > 0;

  if (hasBackgroundImage && scene.backgroundImages) {
    const bg = scene.backgroundImages[0];
    const bbox = {
      width: bg.size.width,
      height: bg.size.height,
      centerX: bg.position.x + bg.size.width / 2,
      centerY: bg.position.y + bg.size.height / 2
    };

    // Calculate final zoom (cover mode)
    const zoomX = containerSize.width / bbox.width;
    const zoomY = containerSize.height / bbox.height;
    const targetZoom = Math.max(zoomX, zoomY) * 1.0;

    const viewportCenter = {
      x: containerSize.width / 2,
      y: containerSize.height / 2
    };

    const targetPan = {
      x: viewportCenter.x - bbox.centerX * targetZoom,
      y: viewportCenter.y - bbox.centerY * targetZoom
    };

    return {
      zoom: targetZoom,
      pan: targetPan
    };
  }

  return null;
}
