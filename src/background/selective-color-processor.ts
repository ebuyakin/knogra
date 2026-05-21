/**
 * Selective Color Processor
 * 
 * Applies per-color-range adjustments (hue, saturation, lightness) to an image.
 * Used for processing background images with selective color settings.
 */

import type { SelectiveColorAdjustment } from '../core/background-types';

type ColorRange = 'red' | 'yellow' | 'green' | 'blue';

/**
 * Process an image with selective color adjustments.
 * Returns a new canvas with the processed image.
 */
export function processSelectiveColor(
  source: HTMLImageElement | HTMLCanvasElement,
  selectiveColor: SelectiveColorAdjustment
): HTMLCanvasElement {
  // Create output canvas matching source dimensions
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d')!;
  
  // Draw source image
  ctx.drawImage(source, 0, 0);
  
  // Get pixel data
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  
  // Process each pixel
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // Alpha (pixels[i + 3]) is preserved unchanged
    
    // Convert to HSL
    let [h, s, l] = rgbToHsl(r, g, b);
    
    // Determine which color range this pixel belongs to
    const range = getColorRange(h);
    
    if (range && selectiveColor[range]) {
      const adjustment = selectiveColor[range]!;
      
      // Apply hue shift (additive, in degrees)
      if (adjustment.hue !== undefined) {
        h = (h + adjustment.hue + 360) % 360;
      }
      
      // Apply saturation multiplier
      if (adjustment.saturation !== undefined) {
        s = Math.min(1, Math.max(0, s * adjustment.saturation));
      }
      
      // Apply lightness multiplier
      if (adjustment.lightness !== undefined) {
        l = Math.min(1, Math.max(0, l * adjustment.lightness));
      }
    }
    
    // Convert back to RGB
    const [newR, newG, newB] = hslToRgb(h, s, l);
    
    pixels[i] = newR;
    pixels[i + 1] = newG;
    pixels[i + 2] = newB;
  }
  
  // Write processed pixels back
  ctx.putImageData(imageData, 0, 0);
  
  return canvas;
}

/**
 * Determine which color range a hue value falls into.
 * Hue is 0-360 degrees on the color wheel.
 * 
 * Ranges (approximate):
 * - Red: 330-30 (wraps around 0)
 * - Yellow: 30-90
 * - Green: 90-180
 * - Blue: 180-270
 * - Purple/Magenta: 270-330 (currently not adjustable, returns null)
 */
function getColorRange(hue: number): ColorRange | null {
  // Normalize hue to 0-360
  hue = ((hue % 360) + 360) % 360;
  
  if (hue >= 330 || hue < 30) return 'red';
  if (hue >= 30 && hue < 90) return 'yellow';
  if (hue >= 90 && hue < 180) return 'green';
  if (hue >= 180 && hue < 270) return 'blue';
  
  // 270-330 is purple/magenta - not currently adjustable
  return null;
}

/**
 * Convert RGB (0-255) to HSL (h: 0-360, s: 0-1, l: 0-1)
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  
  if (max === min) {
    // Achromatic (gray)
    return [0, 0, l];
  }
  
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default: // b
      h = ((r - g) / d + 4) / 6;
      break;
  }
  
  return [h * 360, s, l];
}

/**
 * Convert HSL (h: 0-360, s: 0-1, l: 0-1) to RGB (0-255)
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h / 360;
  
  if (s === 0) {
    // Achromatic (gray)
    const gray = Math.round(l * 255);
    return [gray, gray, gray];
  }
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  
  const r = hueToRgb(p, q, h + 1/3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1/3);
  
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}
