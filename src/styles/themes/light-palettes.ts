/**
 * Light Palettes
 * The four light built-in themes, in picker order.
 *
 * The dark recipe inverts badly on paper, so light themes depart from it in
 * three ways:
 *
 *  - **Nodes are cards, not washes.** Dark themes run `background.opacity` at
 *    0.5–0.6 so the canvas glow reads through; at that opacity on a light
 *    canvas a node all but disappears, so lights use 0.85 plus a 1px tinted
 *    border to give the card an edge.
 *  - **Depth comes from the border, not the shadow.** The default 0.7-opacity
 *    black shadow reads as dirt on paper. `paper` keeps a minimal 1/1/2 tinted
 *    one; `meadow` and `iris` switch it off entirely and stay flat, relying on
 *    the 1px border for the card edge. Shadow padding is added to the node's
 *    width and height, so switching it off also tightens layout spacing.
 *  - **`imageDefaults` are corrected.** The default `brightness: 0.5` exists to
 *    stop background images overpowering a dark canvas; on a light one it just
 *    dims them into mud.
 *
 * `light` predates these rules and deliberately still breaks all three: it is
 * the original light theme, and changing it would alter workspaces under the
 * authors who already chose it.
 *
 * Known limitation for the whole set: the app's chrome — panels, modals, menus
 * — is static CSS with no theme binding, so it stays dark under every theme.
 * A light theme therefore means a light canvas inside dark chrome.
 */

import {
  makeEdgeStyle,
  makeSecondaryEdgeStyle,
  makeStrongEdgeStyle,
  type BuiltInTheme,
} from './default-theme';

export const LIGHT_PALETTES: Record<string, BuiltInTheme> = {

  // ── Light (cool grey — the original light theme) ───────────────────────
  'light': {
    id: 'light',
    // Light surfaces invert the rule: these are the dark end of the range, not
    // the bright end, or nothing would be visible on near-white paper.
    imagePalette: ['#1f2328', '#0969da', '#1a7f37', '#656d76'],
    canvas: {
      background: {
        color: '#f0f3f6',
        vignette: { strength: 0.5, spread: 40, blur: 100, color: '#7c8085' }
      }
    },
    node: {
      background: { color: '#e8f4ff' },
      backgroundAlt: { color: '#f6f8fa' },
      text: { color: '#1f2328' },
      textSecondary: { color: '#656d76' },
      border: { color: '#d0d7de' },
      borderCentral: { color: '#1a7f37', width: 2 },
      borderSelected: { color: '#cf222e', width: 2 },
      borderCentralSelected: { color: '#745032', width: 2 },
      accent: { color: '#0969da' }
    },
    edge: {
      line: { color: '#4f545b' },
      lineSecondary: { color: '#afb8c1' },
      arrow: { color: '#4f545b' },
      label: { color: '#4f545b' },
      width: 2
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#5a6068', '#afb8c1', '#5a6068', 2, 0.78),
      'edge-style-2': makeStrongEdgeStyle('#2f6bb0', '#54aeff', '#2f6bb0', 3, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#a67600', '#d4a72c', '#7d4e00', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#f6f8fa' },
      text: { color: '#656d76' }
    }
  },

  // ── Paper (warm cream/sepia, burnt orange + olive) ────────────────────
  // The furthest a light theme gets from the cool grey above: warm stock, low
  // blue light, reading-desk feel.
  'paper': {
    id: 'paper',
    imagePalette: ['#2e2822', '#a15c1e', '#4f6b3a', '#6f6355'],
    canvas: {
      background: {
        color: '#f6f1e7',
        vignette: { strength: 0.35, spread: 45, blur: 150, color: '#b3a288' }
      }
    },
    node: {
      background: { color: '#fffdf7', opacity: 0.85 },
      backgroundAlt: { color: '#efe7d7', opacity: 0.85 },
      text: { color: '#2e2822' },
      textSecondary: { color: '#6f6355' },
      border: { color: '#ddd0b9', width: 1 },
      borderCentral: { color: '#a15c1e', width: 2 },
      borderSelected: { color: '#4f6b3a', width: 2 },
      borderCentralSelected: { color: '#7a6a2c', width: 2 },
      accent: { color: '#b06a20' },
      // Smaller than the legacy `light` theme's inherited 2/2/3: 3px of padding
      // against its 5. Opacity is up from 0.16 because a tight shadow needs
      // more of it to register at all.
      shadow: { offsetX: 1, offsetY: 1, blur: 2, opacity: 0.22, color: '#6b5a3e' }
    },
    edge: {
      line: { color: '#7a6c58' },
      lineSecondary: { color: '#c3b7a2' },
      arrow: { color: '#7a6c58' },
      label: { color: '#6f6355' },
      width: 2
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#7a6c58', '#c3b7a2', '#6f6355', 2, 0.78),
      'edge-style-2': makeStrongEdgeStyle('#a15c1e', '#d99a55', '#8a4c14', 3, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#4f6b3a', '#8fa877', '#405831', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#efe8d9' },
      text: { color: '#6f6355' }
    },
    imageDefaults: { opacity: 0.45, brightness: 1.05, saturation: 0.85 }
  },

  // ── Meadow (soft sage, emerald + ochre) ───────────────────────────────
  'meadow': {
    id: 'meadow',
    imagePalette: ['#22301f', '#1e7a4a', '#a06a14', '#5c6b58'],
    canvas: {
      background: {
        color: '#eef4ec',
        vignette: { strength: 0.35, spread: 45, blur: 150, color: '#96ab93' }
      }
    },
    node: {
      background: { color: '#fbfefa', opacity: 0.85 },
      backgroundAlt: { color: '#e2ecdf', opacity: 0.85 },
      text: { color: '#22301f' },
      textSecondary: { color: '#5c6b58' },
      border: { color: '#cddcc8', width: 1 },
      borderCentral: { color: '#1e7a4a', width: 2 },
      borderSelected: { color: '#b4530f', width: 2 },
      borderCentralSelected: { color: '#6b7a2c', width: 2 },
      accent: { color: '#2f8f57' },
      shadow: { offsetX: 0, offsetY: 0, blur: 0, opacity: 0, color: '#000000' }
    },
    edge: {
      line: { color: '#5c7256' },
      lineSecondary: { color: '#b3c4ae' },
      arrow: { color: '#5c7256' },
      label: { color: '#5c6b58' },
      width: 2
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#5c7256', '#b3c4ae', '#5c6b58', 2, 0.78),
      'edge-style-2': makeStrongEdgeStyle('#1e7a4a', '#63b688', '#186340', 3, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#a06a14', '#d0a659', '#84570f', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#e6eee3' },
      text: { color: '#5c6b58' }
    },
    imageDefaults: { opacity: 0.45, brightness: 1.05, saturation: 0.85 }
  },

  // ── Iris (pale violet, violet + gold) ─────────────────────────────────
  // Light counterpart to Midnight Purple, for the same palette in a bright room.
  'iris': {
    id: 'iris',
    imagePalette: ['#262036', '#6d4bc4', '#a8761a', '#5f5875'],
    canvas: {
      background: {
        color: '#f0edf8',
        vignette: { strength: 0.35, spread: 45, blur: 150, color: '#a096c2' }
      }
    },
    node: {
      background: { color: '#fcfbff', opacity: 0.85 },
      backgroundAlt: { color: '#e6e1f2', opacity: 0.85 },
      text: { color: '#262036' },
      textSecondary: { color: '#5f5875' },
      border: { color: '#d4cee5', width: 1 },
      borderCentral: { color: '#6d4bc4', width: 2 },
      borderSelected: { color: '#b07a1a', width: 2 },
      borderCentralSelected: { color: '#8a5a9c', width: 2 },
      accent: { color: '#7c5ad0' },
      shadow: { offsetX: 0, offsetY: 0, blur: 0, opacity: 0, color: '#000000' }
    },
    edge: {
      line: { color: '#6a6285' },
      lineSecondary: { color: '#bdb6d0' },
      arrow: { color: '#6a6285' },
      label: { color: '#5f5875' },
      width: 2
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#6a6285', '#bdb6d0', '#5f5875', 2, 0.78),
      'edge-style-2': makeStrongEdgeStyle('#6d4bc4', '#a68ce6', '#5a3ca6', 3, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#a8761a', '#d7b05c', '#8a6012', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#e8e4f4' },
      text: { color: '#5f5875' }
    },
    imageDefaults: { opacity: 0.45, brightness: 1.05, saturation: 0.85 }
  }
};
