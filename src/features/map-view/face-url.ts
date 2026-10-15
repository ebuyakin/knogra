/**
 * Face URL
 *
 * A design returns a node's face as an SVG data URL: the whole SVG, percent-
 * encoded, inside the style value. Cytoscape rehashes an element's whole
 * style, that string included, on every style change, so a tween that fades
 * a few dozen equation faces per frame cannot keep 60 Hz
 * (docs/node-design-system.md, Layer 1). The map gives its boxes a blob URL
 * for the same image instead: about sixty characters whatever the SVG's size,
 * loaded by the renderer as a data URL is.
 *
 * One URL per distinct face, cached for the page session and never revoked:
 * the map is rebuilt on every enter and re-focus, and a face converted once
 * stays converted. The cost is one SVG's worth of memory per distinct face
 * the session has mapped.
 *
 * Each URL starts loading as an Image the moment it is made, and the Image is
 * kept with it. Cytoscape draws a box's face only once its own Image for the
 * URL is complete, and draws the box bare until then; a URL the browser has
 * already loaded completes at once, so the map's first frame has its faces
 * (seen 2026-10-15: a bare-box flash at the swap on the first enter after a
 * reload, when every blob URL was new to the browser). The preload must make
 * the same request Cytoscape will make: it loads non-data URLs with
 * `crossOrigin = 'anonymous'` (its `background-image-crossorigin` default),
 * and the browser's memory cache keys on the request mode as well as the URL,
 * so a preload without it was a miss and the flash stayed.
 */

const SVG_DATA_URL_PREFIX = 'data:image/svg+xml;charset=utf-8,';

interface FaceUrl {
  url: string;
  /** Held so the browser keeps the decoded image for Cytoscape's own load of the same URL. */
  image: HTMLImageElement;
}

const byFace = new Map<string, FaceUrl>();

/** The blob URL for an SVG data URL; any other string is returned as it is. */
export function blobUrlForFace(face: string): string {
  if (!face.startsWith(SVG_DATA_URL_PREFIX)) return face;
  const cached = byFace.get(face);
  if (cached) return cached.url;
  const svg = decodeURIComponent(face.slice(SVG_DATA_URL_PREFIX.length));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  byFace.set(face, { url, image });
  return url;
}
