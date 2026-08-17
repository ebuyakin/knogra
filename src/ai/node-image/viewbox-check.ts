/**
 * Did the model use the viewBox it was given?
 *
 * The grid convention is what makes an absolute stroke width mean the same
 * thing across a scene, and the requested aspect is what the node's shape comes
 * from. Neither is enforceable by the prompt alone, so a mismatch is discarded
 * and the user regenerates.
 *
 * **Not part of the sanitizer.** Upload and paste share that path, and an SVG
 * from anywhere else has every right to a 512-unit grid; only a generated image
 * was asked for this one.
 */

import type { NodeImageAspect } from '../../core/node-image-types';
import { NODE_IMAGE_ASPECT_VIEWBOXES } from './prompt/technique-rules';

/** Slack for a model that writes 99.99, not for one that used a different grid. */
const TOLERANCE = 0.05;

/** A human-readable complaint, or null when the geometry is what was asked for. */
export function checkGeneratedViewBox(svg: string, aspect: NodeImageAspect): string | null {
  const viewBox = readViewBox(svg);
  if (!viewBox) return 'The image has no readable viewBox.';

  const expected = NODE_IMAGE_ASPECT_VIEWBOXES[aspect];
  if (matches(viewBox, expected)) return null;

  return `The image was drawn on a "${viewBox.join(' ')}" viewBox instead of the requested "${expected}". Generate again.`;
}

type ViewBox = [number, number, number, number];

/**
 * The root element's viewBox. Read from the text rather than through a parse:
 * the root is the first element in the document, so the first match is its own.
 */
function readViewBox(svg: string): ViewBox | null {
  const match = /viewBox\s*=\s*["']([^"']+)["']/.exec(svg);
  if (!match) return null;

  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) ? (parts as ViewBox) : null;
}

function matches(actual: ViewBox, expected: string): boolean {
  const wanted = expected.trim().split(/[\s,]+/).map(Number);
  return actual.every((value, index) => Math.abs(value - wanted[index]) <= TOLERANCE);
}
