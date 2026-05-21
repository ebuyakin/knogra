/**
 * Background image types for canvas-based backgrounds
 * Part of the Knogra type system — see main-types.ts for full index.
 *
 * This file owns:
 *   - Background image appearance (ImageVisualAppearance)
 *   - Selective color (SelectiveColorAdjustment, ColorRangeAdjustment)
 *   - Blend modes (BlendMode)
 *   - Opacity masks (GradientMask, MaskStop)
 *   - Scene placement (SceneBackgroundImage)
 *
 * Does NOT own:
 *   - Color gradients for node fills (→ style-types.ts: GradientStop, GradientConfig)
 *   - Node/edge styling (→ style-types.ts)
 *   - Data model entities (→ main-types.ts)
 */

import type { BackgroundImageId } from './main-types';

// =============================================================================
// SELECTIVE COLOR ADJUSTMENT
// =============================================================================

/**
 * Adjustment for a specific color range (hue/saturation/lightness)
 */
export interface ColorRangeAdjustment {
  hue?: number;        // -30 to +30 (shift toward neighboring colors)
  saturation?: number; // 0-2 (1 = no change, <1 = desaturate, >1 = boost)
  lightness?: number;  // 0-2 (1 = no change, <1 = darken, >1 = brighten)
}

/**
 * Selective color adjustments for 4 primary color ranges
 * Covers full spectrum: Red ↔ Yellow ↔ Green ↔ Cyan ↔ Blue ↔ Magenta ↔ Red
 */
export interface SelectiveColorAdjustment {
  red?: ColorRangeAdjustment;     // Reds, magentas, pinks (hue ~330-30°)
  yellow?: ColorRangeAdjustment;  // Yellows, oranges (hue ~30-90°)
  green?: ColorRangeAdjustment;   // Greens, cyans (hue ~90-180°)
  blue?: ColorRangeAdjustment;    // Blues, purples (hue ~180-330°)
}

// =============================================================================
// IMAGE VISUAL APPEARANCE
// =============================================================================

/**
 * Visual appearance settings for background images
 * Used in: SceneBackgroundImage.appearance, ColorTheme.imageDefaults
 */
export interface ImageVisualAppearance {
  // Opacity & Blend
  opacity?: number;           // 0-1, overall transparency
  blendMode?: BlendMode;      // CSS composite operation
  
  // Global Adjustments (affect all colors equally)
  brightness?: number;        // 0-2 (1 = no change)
  contrast?: number;          // 0-2 (1 = no change)
  saturation?: number;        // 0-2 (1 = no change, affects all colors)
  hue?: number;               // 0-360, rotate all colors
  
  // Selective Color (adjust specific color ranges independently)
  selectiveColor?: SelectiveColorAdjustment;
  
  // Edge Effects
  blur?: number;              // 0-10 pixels
  borderFade?: number;        // 0-1, edge fade amount
  mask?: GradientMask;        // Gradient-based opacity mask
}

// =============================================================================
// SCENE BACKGROUND IMAGE
// =============================================================================

/**
 * Configuration for a background image placed in a scene
 */
export interface SceneBackgroundImage {
  // Identity
  id: string;                          // Unique ID for this placement
  imageId: BackgroundImageId;          // References BackgroundImage in store
  
  // Geometry
  position: { x: number; y: number };  // Position in graph coordinates
  size: { width: number; height: number };  // Size in graph coordinates
  zIndex: number;                      // Stacking order (lower = behind)
  
  // Appearance (all visual settings)
  appearance: ImageVisualAppearance;
}

// =============================================================================
// BLEND MODES
// =============================================================================

/**
 * CSS blend modes for compositing
 * Matches GlobalCompositeOperation from Canvas API
 */
export type BlendMode = 
  | 'source-over'      // normal
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'source-in'
  | 'source-out'
  | 'source-atop'
  | 'destination-over'
  | 'destination-in'
  | 'destination-out'
  | 'destination-atop'
  | 'lighter'
  | 'copy'
  | 'xor';

// =============================================================================
// GRADIENT MASK
// =============================================================================

/**
 * Gradient mask for creating opacity gradients (morphing/blending effects)
 */
export interface GradientMask {
  type: 'linear' | 'radial';
  angle?: number;        // For linear gradient (degrees, 0 = left-to-right)
  center?: { x: number; y: number };  // For radial gradient (0-1 normalized coords)
  stops: MaskStop[];     // Opacity stops defining transparency at different positions
}

/**
 * Opacity mask stop (for GradientMask)
 * Note: NOT the same as style-types GradientStop which has color+offset.
 * MaskStop has opacity+offset — it controls transparency, not color.
 */
export interface MaskStop {
  offset: number;    // 0-1, position in gradient
  opacity: number;   // 0-1, opacity at this position
}
