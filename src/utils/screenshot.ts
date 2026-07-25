/**
 * captureScreenshot — downloads a PNG of the current graph viewport with the
 * background layer included.
 *
 * `cy.png()` only renders Cytoscape's own canvas layers, so the background image
 * (a separate <canvas> the app inserts behind the graph) is never captured. This
 * composites every <canvas> in the Cytoscape container in z-index order — the
 * background canvas first, the graph layers on top — reproducing exactly what is
 * on screen. Used to produce anchor-scene preview images for the marketing site's
 * graph library. Invoked from devtools as `knogra.capturePreview()`.
 * knogra.capturePreview()                            // knogra-preview.png, 2×
 * knogra.capturePreview({ name: 'graph-calculus' })  // names the file
 * knogra.capturePreview({ name: 'graph-chess', scale: 3 })  // sharper
 */

import type { Core } from 'cytoscape';

export interface ScreenshotOptions {
  /** Output pixel scale relative to the CSS viewport size. Default 2. */
  scale?: number;
  /** Downloaded file name, without extension. Default 'knogra-preview'. */
  name?: string;
}

function zIndexOf(el: HTMLElement): number {
  const z = Number.parseInt(getComputedStyle(el).zIndex, 10);
  return Number.isNaN(z) ? 0 : z;
}

/** Nearest ancestor with an opaque background, so transparent regions match the theme. */
function resolveBaseColor(container: HTMLElement): string {
  for (let el: HTMLElement | null = container; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color;
  }
  return '#0d1117';
}

export function captureScreenshot(cy: Core, options: ScreenshotOptions = {}): void {
  const scale = options.scale ?? 2;
  const name = options.name ?? 'knogra-preview';
  const container = cy.container();
  if (!container) {
    console.warn('[screenshot] No Cytoscape container found.');
    return;
  }

  const width = Math.round(container.clientWidth * scale);
  const height = Math.round(container.clientHeight * scale);
  if (width === 0 || height === 0) {
    console.warn('[screenshot] Container has zero size.');
    return;
  }

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) {
    console.warn('[screenshot] Could not get a 2D context.');
    return;
  }

  ctx.fillStyle = resolveBaseColor(container);
  ctx.fillRect(0, 0, width, height);

  // Composite every layer (background canvas + Cytoscape graph layers) in visual
  // order. Layers differ in backing resolution — the background canvas is 1×, the
  // graph layers are device-pixel-ratio scaled — so each is stretched to the
  // common output size. A stable sort keeps DOM order among equal z-indexes, so
  // the background (inserted first, z-index 0) stays behind the graph.
  const layers = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[];
  layers.sort((a, b) => zIndexOf(a) - zIndexOf(b));
  for (const layer of layers) {
    if (layer.width === 0 || layer.height === 0) continue;
    ctx.drawImage(layer, 0, 0, width, height);
  }

  out.toBlob((blob) => {
    if (!blob) {
      console.warn('[screenshot] Failed to encode PNG.');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}
