/**
 * Visual style type definitions for Knogra
 * Part of the Knogra type system — see main-types.ts for full index.
 *
 * This file owns:
 *   - Style primitives (TextStyleProps, BorderStyleProps, ShadowStyleProps,
 *     GradientStop, GradientConfig, VignetteConfig, BackgroundStyleProps)
 *   - Per-node overrides (ColorOverrides, VisualEffects)
 *   - Composite styles (NodeStyle, EdgeStyle)
 *   - Theme (ColorTheme)
 *   - Cytoscape output (CytoscapeNodeStyle)
 *
 * Does NOT own:
 *   - Data model entities (→ main-types.ts)
 *   - Design registry / catalog (→ design-types.ts)
 *   - Background image appearance (→ background-types.ts)
 *
 * Organization: bottom-up, from smallest primitives to the top-level theme.
 *
 *   TextStyleProps ─────────────────────────────────────────┐
 *   BorderStyleProps ───────────────────────────────────────┤
 *   ShadowStyleProps ───────────────────────────────────────┤
 *   GradientStop → GradientConfig ──┐                      │
 *   VignetteConfig ─────────────────┼→ BackgroundStyleProps─┤
 *                                                           │
 *   ColorOverrides (per-node color substitutions) ──────────┤
 *   VisualEffects  (per-node effect adjustments) ───────────┤
 *                                                           │
 *   NodeStyle (background + text + border + shadow) ────────┤
 *   EdgeStyle (line + arrow + label) ───────────────────────┤
 *                                                           ↓
 *                                          ColorTheme (canvas + node + edge)
 *
 *   CytoscapeNodeStyle (output format for Cytoscape rendering)
 */

import type { ImageVisualAppearance } from './background-types';
import type { EdgeStyleSlotId } from './main-types';

// =============================================================================
// 1. STYLE PRIMITIVES — atomic building blocks
// =============================================================================

/** Text styling */
export interface TextStyleProps {
  color: string;
  opacity?: number;       // 0.0 - 1.0, default 1.0
}

/** Border styling */
export interface BorderStyleProps {
  color: string;
  width?: number;         // pixels, default 0
}

/** Shadow styling (SVG drop shadow) */
export interface ShadowStyleProps {
  offsetX: number;        // horizontal offset in pixels
  offsetY: number;        // vertical offset in pixels
  blur: number;           // blur radius (stdDeviation)
  opacity: number;        // 0.0 - 1.0 (0 = no shadow)
  color: string;          // hex color
}

/** Color gradient stop (for node/edge fills) */
export interface GradientStop {
  offset: number;        // 0.0 - 1.0 (position along gradient)
  color: string;         // Hex color
  opacity?: number;      // 0.0 - 1.0, default 1.0
}

/** Gradient configuration */
export interface GradientConfig {
  type: 'solid' | 'linear' | 'radial';
  angle?: number;        // For linear: 0-360 degrees (default 180 = top to bottom)
  stops?: GradientStop[];
}

/** Vignette (edge darkening effect for backgrounds) */
export interface VignetteConfig {
  strength?: number;       // 0.0 - 1.0, opacity at edges (default 0 = off)
  spread?: number;         // px, solid border inset from edges (default 50)
  blur?: number;           // px, feather distance beyond spread (default 200)
  color?: string;          // shade color hex (default '#000000')
  colorOpacity?: number;   // 0.0 - 1.0, base opacity of shade color (default 1.0)
}

/** Background styling — the richest primitive, composes gradient + vignette */
export interface BackgroundStyleProps {
  color: string;
  opacity?: number;       // 0.0 - 1.0, default 1.0
  brightness?: number;    // 0.0 - 2.0, default 1.0
  saturation?: number;    // 0.0 - 2.0, default 1.0
  hue?: number;           // 0 - 360 degrees, default 0
  gradient?: GradientConfig;  // Optional gradient, default = solid
  vignette?: VignetteConfig;  // Optional edge darkening, default = off
}

// =============================================================================
// 2. PER-NODE OVERRIDES — optional per-node adjustments over theme defaults
// =============================================================================

/** Per-node color substitutions (replace specific theme colors) */
export interface ColorOverrides {
  background?: string;
  backgroundAlt?: string;
  text?: string;
  border?: string;
}

/** Per-node visual effect adjustments (override theme opacity/brightness/etc.) */
export interface VisualEffects {
  backgroundOpacity?: number;     // 0.0–1.0, default from theme
  backgroundAltOpacity?: number;  // 0.0–1.0, default from theme
  textOpacity?: number;           // 0.0–1.0, default 1.0
  brightness?: number;            // 0.5–1.5, default 1.0
  saturation?: number;            // 0.0–2.0, default 1.0
  hue?: number;                   // 0–360 degrees rotation
}

// =============================================================================
// 3. COMPOSITE STYLES — assembled from primitives, define a complete look
// =============================================================================

/** Complete node styling — defines all visual aspects of a node */
export interface NodeStyle {
  background: BackgroundStyleProps;
  backgroundAlt: BackgroundStyleProps;
  text: TextStyleProps;
  textSecondary: TextStyleProps;
  border: BorderStyleProps;
  borderCentral: BorderStyleProps;
  borderSelected: BorderStyleProps;
  borderCentralSelected: BorderStyleProps;
  accent: BackgroundStyleProps;
  shadow: ShadowStyleProps;
}

/** Complete edge styling */
export interface EdgeStyle {
  line: BackgroundStyleProps;
  lineSecondary: BackgroundStyleProps;
  arrow: BackgroundStyleProps;
  label: TextStyleProps;
  width?: number;  // pixels, default 2
  arrowShape?: string;
  arrowScale?: number;
  curveStyle?: string;
}

// =============================================================================
// 4. COLOR THEME — top-level container, one per scene
// =============================================================================

/** Complete color theme definition — applied scene-wide */
export interface ColorTheme {
  id: string;
  name: string;
  isCustom?: boolean;

  canvas: {
    background: BackgroundStyleProps;
  };

  node: NodeStyle;

  edge: EdgeStyle;

  /** Three theme-owned edge styles that workspace edge types can reference. */
  edgeStyleSlots?: Record<EdgeStyleSlotId, EdgeStyle>;

  decoration: {
    background: BackgroundStyleProps;
    text: TextStyleProps;
  };

  /** Default appearance for background images added to scenes */
  imageDefaults?: ImageVisualAppearance;
}

// =============================================================================
// 5. CYTOSCAPE OUTPUT — what design render functions return
// =============================================================================

/** Cytoscape node style properties — returned by design render functions */
export interface CytoscapeNodeStyle {
  'background-image': string;
  'background-color'?: string;
  'background-opacity'?: number;
  'width': number;
  'height': number;
  'shape': string;
  'background-fit': string;
  'background-clip': string;
  'border-width': number;
  'border-color': string;
  'ghost'?: string;
  'ghost-offset-x'?: number;
  'ghost-offset-y'?: number;
  'ghost-opacity'?: number;
}
