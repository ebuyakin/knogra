/**
 * Default Theme
 * The etalon every palette is written against, plus the two things palette
 * files need to express themselves: the shape of a partial override, and the
 * edge-style constructors.
 *
 * `DEFAULT_THEME` defines every property. Palettes are deep-merged over it, so
 * they specify only what differs — which is why a palette can be read as a
 * description of its own character rather than a full theme.
 *
 * Types only, no runtime imports: this file and the palettes beside it are data.
 */

import type { ColorTheme, EdgeStyle, ThemeImagePalette } from '../../core/style-types';

// =============================================================================
// PALETTE OVERRIDE SHAPE
// =============================================================================

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * A palette entry: any subset of a theme, plus the id that identifies it.
 *
 * No `name` — the display label comes from `THEME_MANIFEST` in config, so a
 * theme's label is stated once and cannot drift from the picker's copy of it.
 *
 * `imagePalette` is the one field a palette may **not** omit. Inheriting it
 * would be silent — a theme would draw its images in another theme's colours
 * and nobody would find out until someone generated one — so the compiler asks
 * every palette for its own.
 */
export type BuiltInTheme = DeepPartial<ColorTheme> & {
  id: string;
  imagePalette: ThemeImagePalette;
};

// =============================================================================
// EDGE STYLE HELPERS
// =============================================================================

export function makeEdgeStyle(
  lineColor: string,
  lineSecondaryColor: string,
  labelColor: string,
  _width: number,
  opacity = 1,
  arrowShape = 'triangle',
  _arrowScale = 1,
  _curveStyle = 'bezier'
): EdgeStyle {
  return {
    line: { color: lineColor, opacity, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' } },
    lineSecondary: { color: lineSecondaryColor, opacity, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' } },
    arrow: { color: lineColor, opacity, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' } },
    label: { color: labelColor, opacity: 1 },
    width: 2,
    arrowShape,
    arrowScale: 1,
    curveStyle: 'bezier'
  };
}

export function makeStrongEdgeStyle(
  lineColor: string,
  lineSecondaryColor: string,
  labelColor: string,
  width: number,
  opacity = 1
): EdgeStyle {
  return makeEdgeStyle(lineColor, lineSecondaryColor, labelColor, width, opacity, 'diamond');
}

export function makeSecondaryEdgeStyle(
  lineColor: string,
  lineSecondaryColor: string,
  labelColor: string,
  width: number,
  opacity = 1
): EdgeStyle {
  return makeEdgeStyle(lineColor, lineSecondaryColor, labelColor, width, opacity, 'circle');
}

// =============================================================================
// DEFAULT THEME (etalon - all properties defined)
// =============================================================================

export const DEFAULT_THEME: ColorTheme = {
  id: 'default',
  name: 'Default',
  canvas: {
    background: { color: '#0d1117', opacity: 1, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' } }
  },
  node: {
    background: { color: '#000000', opacity: 0.5, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' }, vignette: { strength: 0 } },
    backgroundAlt: { color: '#333333', opacity: 0.5, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' } },
    text: { color: '#e6edf3', opacity: 1 },
    textSecondary: { color: '#7d8590', opacity: 1 },
    border: { color: '#30363d', width: 0 },
    borderCentral: { color: '#4a9eff', width: 1 },
    borderSelected: { color: '#f9826c', width: 1 },
    borderCentralSelected: { color: '#a190b5', width: 1 },
    accent: { color: '#58a6ff', opacity: 1, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' } },
    shadow: { offsetX: 2, offsetY: 2, blur: 3, opacity: 0.7, color: '#000000' }
  },
  edge: {
    line: { color: '#7d8590', opacity: 1, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' } },
    lineSecondary: { color: '#484f58', opacity: 1, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' } },
    arrow: { color: '#7d8590', opacity: 1, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' } },
    label: { color: '#7d8590', opacity: 1 },
    width: 2
  },
  edgeStyleSlots: {
    'edge-style-1': makeEdgeStyle('#9aa4af', '#4d5662', '#9aa4af', 2, 0.8),
    'edge-style-2': makeStrongEdgeStyle('#b4bcc6', '#8b949e', '#b4bcc6', 2, 0.8),
    'edge-style-3': makeSecondaryEdgeStyle('#a7afb8', '#6e7681', '#a7afb8', 2, 0.8)
  },
  decoration: {
    background: { color: '#161b22', opacity: 1, brightness: 1, saturation: 1, hue: 0, gradient: { type: 'solid' } },
    text: { color: '#7d8590', opacity: 1 }
  },
  imagePalette: ['#e6edf3', '#58a6ff', '#f0883e', '#8b949e'],
  imageDefaults: {
    opacity: 0.7,
    blendMode: 'source-over',
    brightness: 0.5,
    contrast: 1.0,
    saturation: 0.8,
    hue: 0,
    blur: 0,
    borderFade: 0.1
  }
};
