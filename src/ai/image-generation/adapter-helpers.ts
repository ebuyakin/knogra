/**
 * Shared helpers for image adapters
 *
 * What every vendor adapter needs and none should own: turning the requested
 * shape into a number, snapping it to a vendor's list, and turning the base64
 * every vendor returns into the Blob the re-encoder takes. Kept apart from
 * `image-provider.ts` so the factory there can import the adapters without the
 * adapters importing it back.
 */

import type { ImageShape } from '../../config/ai-settings';
import type { ImageFrame } from './image-provider';

/** Width over height for a shape; 'panel' takes the frame's own proportion. */
export function targetAspect(shape: ImageShape, frame: ImageFrame): number {
  switch (shape) {
    case 'square': return 1;
    case 'portrait': return 3 / 4;
    case 'landscape': return 4 / 3;
    case 'wide': return 16 / 9;
    case 'panel': return frame.height > 0 ? frame.width / frame.height : 1;
  }
}

/**
 * The ratio string ("3:4") from `candidates` nearest to `aspect`, compared in
 * log space so 1:2 and 2:1 are equally far from 1:1.
 */
export function nearestAspectRatio(aspect: number, candidates: readonly string[]): string {
  let best = candidates[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const [w, h] = candidate.split(':').map(Number);
    const distance = Math.abs(Math.log(w / h) - Math.log(aspect));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Every vendor returns base64; this turns it into the Blob the re-encoder takes. */
export function blobFromBase64(data: string, mimeType: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** The reverse, for a vendor that takes a source image inline rather than as a file. */
export function base64FromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the source image.'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}
