/**
 * Shadow Utilities
 * Centralized shadow configuration and SVG filter generation.
 * Shadow config comes from the theme — every theme defines shadow.
 */

import type { ShadowStyleProps } from '../../core/style-types';

/**
 * Calculate padding needed to accommodate shadow
 * Returns padding to add to SVG dimensions
 */
export function getShadowPadding(shadow: ShadowStyleProps): number {
  return shadow.blur + Math.max(shadow.offsetX, shadow.offsetY);
}

/**
 * Build SVG drop shadow filter definition
 * Returns the filter definition and filter ID
 */
export function buildShadowFilter(shadow: ShadowStyleProps): { def: string; id: string } {
  const id = 'dropShadow';
  
  // Convert hex color + opacity to rgba
  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };
  
  const rgb = hexToRgb(shadow.color);
  const floodColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${shadow.opacity})`;
  
  const def = `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
    <feDropShadow dx="${shadow.offsetX}" dy="${shadow.offsetY}" stdDeviation="${shadow.blur}" flood-color="${floodColor}"/>
  </filter>`;
  
  return { def, id };
}
