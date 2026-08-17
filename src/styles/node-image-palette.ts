/**
 * Node Image Palette
 *
 * Turns the scene's theme into the short colour list a generation request is
 * allowed to draw with.
 *
 * Lives in `styles/` because it reads a `ColorTheme`, and is called by the
 * generation dialog rather than by the generator: `ai/` receives a resolved
 * palette as a parameter and imports nothing from here.
 *
 * See docs/node-image-generation.md §7.1.
 */

import type { ThemeId } from '../core/main-types';
import type { NodeImagePalette, NodeImagePaletteSize } from '../core/node-image-types';
import type { ColorTheme } from '../core/style-types';
import { getAvailableThemes, getTheme } from './themes';

/**
 * The colours a request against `themeId` may use.
 *
 * Surfaces are **composited over the canvas**, not read raw. A node background
 * is typically a translucent black over a dark canvas, so the colour the image
 * actually sits on is neither of the two hexes in the theme — handing the model
 * the raw value misinforms it about contrast, which is the one thing a surface
 * is in the prompt to establish.
 */
export function resolveNodeImagePalette(
  themeId: ThemeId,
  paletteSize: NodeImagePaletteSize
): NodeImagePalette {
  return nodeImagePaletteFromTheme(getTheme(themeId), paletteSize);
}

/** For callers holding a resolved theme already — the render path looks one up per node otherwise. */
export function nodeImagePaletteFromTheme(
  theme: ColorTheme,
  paletteSize: NodeImagePaletteSize
): NodeImagePalette {
  const canvas = theme.canvas.background.color;

  return {
    surface: compositeOver(theme.node.background.color, theme.node.background.opacity, canvas),
    surfaceAlt: compositeOver(theme.node.backgroundAlt.color, theme.node.backgroundAlt.opacity, canvas),
    // Unspecified sends the whole palette: the constraint stands, only the count
    // is left open.
    ink: paletteSize === 'unspecified' ? [...theme.imagePalette] : theme.imagePalette.slice(0, paletteSize)
  };
}

/** Flattens `color` at `opacity` onto an opaque `backdrop`, returning a hex string. */
function compositeOver(color: string, opacity: number | undefined, backdrop: string): string {
  const alpha = clampAlpha(opacity);
  if (alpha >= 1) return normalizeHex(color);

  const front = parseHex(color);
  const back = parseHex(backdrop);
  if (!front || !back) return normalizeHex(color);

  return toHex(
    front.r * alpha + back.r * (1 - alpha),
    front.g * alpha + back.g * (1 - alpha),
    front.b * alpha + back.b * (1 - alpha)
  );
}

function clampAlpha(opacity: number | undefined): number {
  if (typeof opacity !== 'number' || Number.isNaN(opacity)) return 1;
  return Math.min(1, Math.max(0, opacity));
}

function parseHex(value: string): { r: number; g: number; b: number } | null {
  const hex = expandShorthand(value.trim().replace(/^#/, ''));
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

function expandShorthand(hex: string): string {
  return hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex;
}

function normalizeHex(value: string): string {
  const parsed = parseHex(value);
  return parsed ? toHex(parsed.r, parsed.g, parsed.b) : value;
}

function toHex(r: number, g: number, b: number): string {
  const channel = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

// =============================================================================
// DEV AUDIT
// =============================================================================

/** Below this an ink is not reliably distinguishable from the surface it sits on. */
const MINIMUM_CONTRAST_RATIO = 3;

/**
 * Reports any image colour that is not legible on its own theme's surfaces.
 *
 * The promise that makes thematic substitution safe is that every colour works
 * in every theme, and the palettes are hand-picked, so nothing else would catch
 * a bad pick. Silent when the whole set passes.
 */
export function auditImagePalettes(): void {
  for (const theme of getAvailableThemes()) {
    const { surface, surfaceAlt } = resolveNodeImagePalette(theme.id, 'unspecified');

    theme.imagePalette.forEach((ink, index) => {
      const worst = Math.min(contrastRatio(ink, surface), contrastRatio(ink, surfaceAlt));
      if (worst < MINIMUM_CONTRAST_RATIO) {
        console.warn(
          `[node-image] ${theme.id} ink ${index + 1} (${ink}) contrasts ${worst.toFixed(2)}:1 ` +
          `against its surfaces — below ${MINIMUM_CONTRAST_RATIO}:1.`
        );
      }
    });
  }
}

/** WCAG relative-luminance ratio, 1:1 identical to 21:1 black on white. */
function contrastRatio(a: string, b: string): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const parsed = parseHex(color);
  if (!parsed) return 0;

  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(parsed.r) + 0.7152 * channel(parsed.g) + 0.0722 * channel(parsed.b);
}
