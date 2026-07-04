/**
 * Theme Registry
 * Built-in themes + custom user themes
 * getTheme() returns fully populated theme by merging with defaults
 */

import type { ColorTheme, EdgeStyle } from '../core/style-types';
import { getSetting } from '../config';
import { themeStore } from '../storage/theme-store';

function makeEdgeStyle(
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

function makeStrongEdgeStyle(
  lineColor: string,
  lineSecondaryColor: string,
  labelColor: string,
  width: number,
  opacity = 1
): EdgeStyle {
  return makeEdgeStyle(lineColor, lineSecondaryColor, labelColor, width, opacity, 'diamond');
}

function makeSecondaryEdgeStyle(
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

const DEFAULT_THEME: ColorTheme = {
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

// =============================================================================
// DEEP MERGE UTILITY
// =============================================================================

/** Deep merge two objects (source overrides target) */
function deepMerge(target: ColorTheme, source: Partial<ColorTheme>): ColorTheme {
  const result = JSON.parse(JSON.stringify(target)) as ColorTheme;

  function merge(t: Record<string, unknown>, s: Record<string, unknown>): void {
    for (const key in s) {
      const sv = s[key];
      const tv = t[key];
      if (sv !== undefined && sv !== null && typeof sv === 'object' && !Array.isArray(sv) &&
          tv !== undefined && tv !== null && typeof tv === 'object' && !Array.isArray(tv)) {
        merge(tv as Record<string, unknown>, sv as Record<string, unknown>);
      } else if (sv !== undefined) {
        t[key] = sv;
      }
    }
  }

  merge(result as unknown as Record<string, unknown>, source as unknown as Record<string, unknown>);
  return result;
}

// =============================================================================
// BUILT-IN THEMES (only specify values that differ from DEFAULT_THEME)
// =============================================================================

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

type BuiltInTheme = DeepPartial<ColorTheme> & { id: string; name: string };

export const BUILT_IN_THEMES: Record<string, BuiltInTheme> = {

  // ── Black & White ─────────────────────────────────────────────────────
  'default': {
    id: 'default',
    name: 'Black & White',
    canvas: {
      background: {
        vignette: { strength: 0.25, spread: 40, blur: 180, color: '#000000' }
      }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#9aa4af', '#4d5662', '#9aa4af', 2),
      'edge-style-2': makeStrongEdgeStyle('#b4bcc6', '#8b949e', '#b4bcc6', 2, 0.9),
      'edge-style-3': makeSecondaryEdgeStyle('#a7afb8', '#6e7681', '#a7afb8', 2, 0.9)
    }
  },

  // ── Dark (blue) ───────────────────────────────────────────────────────
  'dark': {
    id: 'dark',
    name: 'Dark',
    canvas: {
      background: {
        color: '#0a1628',
        vignette: { strength: 0.5, spread: 50, blur: 100, color: '#0c0c0d' }
      }
    },
    node: {
      background: { color: '#0e2844', opacity: 0.5 },
      backgroundAlt: { color: '#1e3a5f', opacity: 0.5 }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#84a6d4', '#385a7c', '#84a6d4', 2, 0.82),
      'edge-style-2': makeStrongEdgeStyle('#5cbde0', '#1679a8', '#5cbde0', 3.25, 0.82),
      'edge-style-3': makeSecondaryEdgeStyle('#dda45a', '#a45a18', '#dda45a', 2.5, 0.8)
    }
  },

  // ── Light ─────────────────────────────────────────────────────────────
  'light': {
    id: 'light',
    name: 'Light',
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

  // ── High Contrast ─────────────────────────────────────────────────────
  'high-contrast': {
    id: 'high-contrast',
    name: 'High Contrast',
    canvas: {
      background: {
        color: '#1b1a1a',
        vignette: { strength: 0.6, spread: 50, blur: 120, color: '#000000' }
      }
    },
    node: {
      background: { color: '#0a0c10' },
      backgroundAlt: { color: '#1a1d24' },
      text: { color: '#ffffff' },
      textSecondary: { color: '#c9d1d9' },
      border: { color: '#ffffff' },
      borderCentral: { color: '#00ff00' },
      borderSelected: { color: '#ff0000' },
      borderCentralSelected: { color: '#7f7f00' },
      accent: { color: '#ffff00' }
    },
    edge: {
      line: { color: '#ffffff' },
      lineSecondary: { color: '#c9d1d9' },
      arrow: { color: '#ffffff' },
      label: { color: '#ffffff' }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#f0f3f6', '#8b949e', '#f0f3f6', 2.5, 0.92),
      'edge-style-2': makeStrongEdgeStyle('#8ee63c', '#00aa00', '#8ee63c', 4, 0.92),
      'edge-style-3': makeSecondaryEdgeStyle('#f2d24a', '#aa8800', '#f2d24a', 3, 0.92)
    },
    decoration: {
      background: { color: '#1a1d24' },
      text: { color: '#ffffff' }
    }
  },

  // ── Warm Dark (amber/rust) ────────────────────────────────────────────
  'warm-dark': {
    id: 'warm-dark',
    name: 'Warm Dark',
    canvas: {
      background: {
        color: '#392615',
        vignette: { strength: 0.5, spread: 50, blur: 100, color: '#0a0604' }
      }
    },
    node: {
      background: { color: '#2a1a0e', opacity: 0.6 },
      backgroundAlt: { color: '#3d2816', opacity: 0.6 },
      text: { color: '#f0dcc8' },
      textSecondary: { color: '#a08060' },
      border: { color: '#4a3520' },
      borderCentral: { color: '#d4943a' },
      borderSelected: { color: '#e06040' },
      borderCentralSelected: { color: '#da7a3d' },
      accent: { color: '#e8a848' }
    },
    edge: {
      line: { color: '#8a6848' },
      lineSecondary: { color: '#5a4530' },
      arrow: { color: '#8a6848' },
      label: { color: '#a08060' }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#a17056', '#5a4530', '#a08060', 2, 0.8),
      'edge-style-2': makeStrongEdgeStyle('#c68f42', '#9a5f18', '#c68f42', 3.25, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#cf5a3c', '#8c2f22', '#cf5a3c', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#1e1410' },
      text: { color: '#a08060' }
    }
  },

  // ── Ocean (teal/cyan) ─────────────────────────────────────────────────
  'ocean': {
    id: 'ocean',
    name: 'Ocean',
    canvas: {
      background: {
        color: '#0a1a1e',
        vignette: { strength: 0.4, spread: 50, blur: 200, color: '#040e12' }
      }
    },
    node: {
      background: { color: '#0c2a30', opacity: 0.55 },
      backgroundAlt: { color: '#163a40', opacity: 0.55 },
      text: { color: '#d0f0f0' },
      textSecondary: { color: '#6a9ca0' },
      border: { color: '#204850' },
      borderCentral: { color: '#30c8b0' },
      borderSelected: { color: '#e06860' },
      borderCentralSelected: { color: '#889888' },
      accent: { color: '#40d8c0' }
    },
    edge: {
      line: { color: '#508890' },
      lineSecondary: { color: '#305860' },
      arrow: { color: '#508890' },
      label: { color: '#6a9ca0' }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#5f98a0', '#305860', '#6a9ca0', 2, 0.8),
      'edge-style-2': makeStrongEdgeStyle('#4dbeab', '#168a7a', '#4dbeab', 3.25, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#cf6560', '#94352f', '#cf6560', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#0e2024' },
      text: { color: '#6a9ca0' }
    }
  },

  // ── Midnight Purple (violet/lavender) ─────────────────────────────────
  'midnight-purple': {
    id: 'midnight-purple',
    name: 'Midnight Purple',
    canvas: {
      background: {
        color: '#100a1e',
        vignette: { strength: 0.45, spread: 50, blur: 200, color: '#060310' }
      }
    },
    node: {
      background: { color: '#1a1030', opacity: 0.55 },
      backgroundAlt: { color: '#2a1a48', opacity: 0.55 },
      text: { color: '#dcd0f0' },
      textSecondary: { color: '#8878a8' },
      border: { color: '#d0c8e0', width: 1 },
      borderCentral: { color: '#a070e0' },
      borderSelected: { color: '#e06870' },
      borderCentralSelected: { color: '#c06ca8' },
      accent: { color: '#b080f0' },
      shadow: { offsetX: 0, offsetY: 0, blur: 0, opacity: 0, color: '#000000' }
    },
    edge: {
      line: { color: '#7060a0' },
      lineSecondary: { color: '#484068' },
      arrow: { color: '#7060a0' },
      label: { color: '#8878a8' }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#8a7dc0', '#484068', '#8878a8', 2, 0.8),
      'edge-style-2': makeStrongEdgeStyle('#9d78d0', '#7048b8', '#9d78d0', 3.25, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#c86680', '#8f2f38', '#c86680', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#140e24' },
      text: { color: '#8878a8' }
    }
  },

  // ── Forest (green/emerald/gold) ───────────────────────────────────────
  'forest': {
    id: 'forest',
    name: 'Forest',
    canvas: {
      background: {
        color: '#0c1a10',
        vignette: { strength: 0.4, spread: 50, blur: 200, color: '#040c06' }
      }
    },
    node: {
      background: { color: '#102818', opacity: 0.55 },
      backgroundAlt: { color: '#1a3820', opacity: 0.55 },
      text: { color: '#d0e8d0' },
      textSecondary: { color: '#6a9870' },
      border: { color: '#2a4830' },
      borderCentral: { color: '#48b868' },
      borderSelected: { color: '#d8a030' },
      borderCentralSelected: { color: '#90ac4c' },
      accent: { color: '#50c870' }
    },
    edge: {
      line: { color: '#508858' },
      lineSecondary: { color: '#305838' },
      arrow: { color: '#508858' },
      label: { color: '#6a9870' }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#6f8f72', '#305838', '#6a9870', 2, 0.8),
      'edge-style-2': makeStrongEdgeStyle('#57b06f', '#2b8740', '#57b06f', 3.25, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#c28f34', '#8d6412', '#c28f34', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#0e1e14' },
      text: { color: '#6a9870' }
    }
  },

  // ── Slate (neutral grey/blue-grey) ────────────────────────────────────
  'slate': {
    id: 'slate',
    name: 'Slate',
    canvas: {
      background: {
        color: '#14161a',
        vignette: { strength: 0.3, spread: 50, blur: 200, color: '#08090c' }
      }
    },
    node: {
      background: { color: '#1e2028', opacity: 0.55 },
      backgroundAlt: { color: '#282a34', opacity: 0.55 },
      text: { color: '#d8dae0' },
      textSecondary: { color: '#808898' },
      border: { color: '#363840' },
      borderCentral: { color: '#7090c0' },
      borderSelected: { color: '#d07060' },
      borderCentralSelected: { color: '#a08090' },
      accent: { color: '#80a0d0' }
    },
    edge: {
      line: { color: '#606878' },
      lineSecondary: { color: '#404650' },
      arrow: { color: '#606878' },
      label: { color: '#808898' }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#7a8494', '#404650', '#808898', 2, 0.8),
      'edge-style-2': makeStrongEdgeStyle('#7690bb', '#4f6f9e', '#7690bb', 3.25, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#c0725d', '#8e3d34', '#c0725d', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#181a20' },
      text: { color: '#808898' }
    }
  },

  // ── Ember (deep red/crimson/orange) ───────────────────────────────────
  'ember': {
    id: 'ember',
    name: 'Ember',
    canvas: {
      background: {
        color: '#1a0c0a',
        vignette: { strength: 0.45, spread: 50, blur: 200, color: '#0c0404' }
      }
    },
    node: {
      background: { color: '#2a1210', opacity: 0.55 },
      backgroundAlt: { color: '#401a16', opacity: 0.55 },
      text: { color: '#f0d8d0' },
      textSecondary: { color: '#a07068' },
      border: { color: '#4a2820' },
      borderCentral: { color: '#e05830' },
      borderSelected: { color: '#f0a030' },
      borderCentralSelected: { color: '#e87c30' },
      accent: { color: '#f07040' }
    },
    edge: {
      line: { color: '#905848' },
      lineSecondary: { color: '#583830' },
      arrow: { color: '#905848' },
      label: { color: '#a07068' }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#a56e5d', '#583830', '#a07068', 2, 0.8),
      'edge-style-2': makeStrongEdgeStyle('#d9673c', '#a23b20', '#d9673c', 3.25, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#c9883a', '#9c6316', '#c9883a', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#1e100e' },
      text: { color: '#a07068' }
    }
  }
};

// =============================================================================
// CUSTOM THEME BUILDER
// =============================================================================

/** Empty string = inherit from base theme. Any non-empty value = override. */
function override(value: string, base: string): string {
  return value !== '' ? value : base;
}
function numOr(value: string, base: number): number {
  return value !== '' ? Number(value) : base;
}

/**
 * Build custom theme from user settings overlaid on selected base theme
 * Empty fields inherit from base; non-empty fields override.
 */
function buildCustomTheme(): ColorTheme {
  const baseId = getSetting('customTheme.baseTheme') as string;
  const base = getBuiltInTheme(baseId);

  return deepMerge(base, {
    id: 'custom',
    name: 'Custom',
    canvas: {
      background: {
        color: override(getSetting('customTheme.canvasColor') as string, base.canvas.background.color),
        vignette: {
          strength: numOr(getSetting('customTheme.canvasVignetteStrength') as string, base.canvas.background.vignette?.strength ?? 0),
          spread: numOr(getSetting('customTheme.canvasVignetteSpread') as string, base.canvas.background.vignette?.spread ?? 50),
          blur: numOr(getSetting('customTheme.canvasVignetteBlur') as string, base.canvas.background.vignette?.blur ?? 200),
          color: override(getSetting('customTheme.canvasVignetteColor') as string, base.canvas.background.vignette?.color ?? '#000000'),
          colorOpacity: numOr(getSetting('customTheme.canvasVignetteColorOpacity') as string, base.canvas.background.vignette?.colorOpacity ?? 1),
        }
      }
    },
    node: {
      background: {
        color: override(getSetting('customTheme.nodeBackground') as string, base.node.background.color),
        opacity: numOr(getSetting('customTheme.nodeOpacity') as string, base.node.background.opacity ?? 1),
        vignette: {
          strength: numOr(getSetting('customTheme.nodeVignetteStrength') as string, base.node.background.vignette?.strength ?? 0),
          spread: numOr(getSetting('customTheme.nodeVignetteSpread') as string, base.node.background.vignette?.spread ?? 50),
          blur: numOr(getSetting('customTheme.nodeVignetteBlur') as string, base.node.background.vignette?.blur ?? 200),
          color: override(getSetting('customTheme.nodeVignetteColor') as string, base.node.background.vignette?.color ?? '#000000'),
        }
      },
      text: {
        color: override(getSetting('customTheme.nodeTextColor') as string, base.node.text.color),
      },
      border: {
        color: override(getSetting('customTheme.nodeBorderColor') as string, base.node.border.color),
        width: numOr(getSetting('customTheme.nodeBorderWidth') as string, base.node.border.width ?? 0),
      },
      borderCentral: {
        color: override(getSetting('customTheme.centralBorderColor') as string, base.node.borderCentral.color),
      },
      borderSelected: {
        color: override(getSetting('customTheme.selectedBorderColor') as string, base.node.borderSelected.color),
      },
      borderCentralSelected: {
        color: override(getSetting('customTheme.centralSelectedBorderColor') as string, base.node.borderCentralSelected.color),
      },
      shadow: {
        offsetX: numOr(getSetting('customTheme.shadowOffsetX') as string, base.node.shadow.offsetX),
        offsetY: numOr(getSetting('customTheme.shadowOffsetY') as string, base.node.shadow.offsetY),
        blur: numOr(getSetting('customTheme.shadowBlur') as string, base.node.shadow.blur),
        opacity: numOr(getSetting('customTheme.shadowOpacity') as string, base.node.shadow.opacity),
        color: override(getSetting('customTheme.shadowColor') as string, base.node.shadow.color),
      }
    },
    edge: {
      line: {
        color: override(getSetting('customTheme.edgeColor') as string, base.edge.line.color),
      },
      arrow: {
        color: override(getSetting('customTheme.edgeArrowColor') as string, base.edge.arrow.color),
      }
    }
  } as Partial<ColorTheme>);
}

/**
 * Get a built-in theme by ID (fully merged with DEFAULT_THEME)
 */
function getBuiltInTheme(themeId: string): ColorTheme {
  const builtIn = BUILT_IN_THEMES[themeId];
  if (builtIn) {
    return deepMerge(DEFAULT_THEME, builtIn as Partial<ColorTheme>);
  }
  return DEFAULT_THEME;
}

// =============================================================================
// THEME REGISTRY API
// =============================================================================

/**
 * Get theme by ID with all properties guaranteed
 * Merges requested theme over DEFAULT_THEME
 */
export function getTheme(themeId: string): ColorTheme {
  // Custom theme is built dynamically from settings
  if (themeId === 'custom') {
    return buildCustomTheme();
  }

  const customTheme = themeStore.getTheme(themeId);
  if (customTheme) {
    return deepMerge(DEFAULT_THEME, customTheme);
  }

  return getBuiltInTheme(themeId);
}

/**
 * Get all available themes (built-in + custom user theme)
 */
export function getAvailableThemes(): ColorTheme[] {
  const builtIn = Object.values(BUILT_IN_THEMES).map(t => getTheme(t.id));
  const custom = [buildCustomTheme()];
  return [...builtIn, ...custom];
}

/**
 * Check if a theme ID is a built-in theme
 */
export function isBuiltInTheme(themeId: string): boolean {
  return themeId in BUILT_IN_THEMES;
}

// Legacy export for backward compatibility
export const COLOR_THEMES = BUILT_IN_THEMES;
