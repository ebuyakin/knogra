/**
 * Canvas theme
 *
 * The one thing it does is paint a theme's canvas background colour and
 * vignette onto a Cytoscape container, with or without a CSS transition. Used
 * by the scene engine for every open (instant) and transition (crossfaded over
 * the morphing phase), and by the map view for its own surface, so the two
 * canvases carry the same paint. The background image is a different thing
 * and lives in the background layer; this is the colour under it.
 */

import type { ColorTheme } from '../core/style-types';

/** Convert hex color to "r, g, b" string for rgba() */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/**
 * Apply canvas background color and vignette from theme to the container.
 * @param transitionMs - if provided and positive, animate the change over this duration
 */
export function applyCanvasTheme(container: HTMLElement | null, theme: ColorTheme, transitionMs?: number): void {
  if (!container) return;

  if (transitionMs && transitionMs > 0) {
    const sec = (transitionMs / 1000).toFixed(2);
    container.style.transition = `background-color ${sec}s ease, box-shadow ${sec}s ease`;
  } else {
    container.style.transition = '';
  }

  const bg = theme.canvas.background;
  container.style.backgroundColor = bg.color;

  const v = bg.vignette;
  if (v && v.strength && v.strength > 0) {
    const spread = v.spread ?? 50;
    const blur = v.blur ?? 200;
    const color = v.color ?? '#000000';
    const alpha = (v.strength * (v.colorOpacity ?? 1)).toFixed(2);
    container.style.boxShadow = `inset 0 0 ${blur}px ${spread}px rgba(${hexToRgb(color)}, ${alpha})`;
  } else {
    container.style.boxShadow = '';
  }
}
