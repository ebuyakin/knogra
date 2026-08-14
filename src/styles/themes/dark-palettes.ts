/**
 * Dark Palettes
 * The twelve dark built-in themes, in picker order.
 *
 * Each entry specifies only what differs from `DEFAULT_THEME`. Labels live in
 * `config/theme-manifest.ts`, not here.
 *
 * Two conventions hold across the set:
 *  - `borderSelected` is always a *complementary* hue to `borderCentral`, never
 *    a lighter version of it, so the central and selected states can be told
 *    apart at a glance rather than by careful comparison.
 *  - Node backgrounds run at 0.5–0.6 opacity so the canvas vignette reads
 *    through and nodes sit in the scene rather than on top of it.
 */

import {
  makeEdgeStyle,
  makeSecondaryEdgeStyle,
  makeStrongEdgeStyle,
  type BuiltInTheme,
} from './default-theme';

export const DARK_PALETTES: Record<string, BuiltInTheme> = {

  // ── Black & White ─────────────────────────────────────────────────────
  'default': {
    id: 'default',
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

  // ── Slate (neutral grey/blue-grey) ────────────────────────────────────
  'slate': {
    id: 'slate',
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

  // ── High Contrast ─────────────────────────────────────────────────────
  'high-contrast': {
    id: 'high-contrast',
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

  // ── Dark (blue) ───────────────────────────────────────────────────────
  'dark': {
    id: 'dark',
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

  // ── Ocean (teal/cyan) ─────────────────────────────────────────────────
  'ocean': {
    id: 'ocean',
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

  // ── Forest (green/emerald/gold) ───────────────────────────────────────
  'forest': {
    id: 'forest',
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

  // ── Warm Dark (amber/rust) ────────────────────────────────────────────
  'warm-dark': {
    id: 'warm-dark',
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

  // ── Espresso (muted coffee brown, copper/sage) ────────────────────────
  // Warm Dark's quiet sibling: that theme is a saturated mid-tone amber, this
  // one is genuinely dark and low-chroma, so warmth reads without glare.
  'espresso': {
    id: 'espresso',
    canvas: {
      background: {
        color: '#17110f',
        vignette: { strength: 0.4, spread: 50, blur: 200, color: '#080504' }
      }
    },
    node: {
      background: { color: '#241b17', opacity: 0.58 },
      backgroundAlt: { color: '#332721', opacity: 0.58 },
      text: { color: '#e8ddd4' },
      textSecondary: { color: '#9a887a' },
      border: { color: '#3d302a' },
      borderCentral: { color: '#c98b62' },
      borderSelected: { color: '#8aa07a' },
      borderCentralSelected: { color: '#a89070' },
      accent: { color: '#d49b72' }
    },
    edge: {
      line: { color: '#7d6b5e' },
      lineSecondary: { color: '#4c3f37' },
      arrow: { color: '#7d6b5e' },
      label: { color: '#9a887a' }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#96826f', '#4c3f37', '#9a887a', 2, 0.8),
      'edge-style-2': makeStrongEdgeStyle('#c4835a', '#8a5330', '#c4835a', 3.25, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#8faa7c', '#5a7248', '#8faa7c', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#1c1512' },
      text: { color: '#9a887a' }
    }
  },

  // ── Ember (deep red/crimson/orange) ───────────────────────────────────
  'ember': {
    id: 'ember',
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
  },

  // ── Wine (deep plum/rose, gold selection) ─────────────────────────────
  // The one hue the dark set was missing.
  'wine': {
    id: 'wine',
    canvas: {
      background: {
        color: '#180a12',
        vignette: { strength: 0.45, spread: 50, blur: 200, color: '#080306' }
      }
    },
    node: {
      background: { color: '#2c1020', opacity: 0.55 },
      backgroundAlt: { color: '#42182e', opacity: 0.55 },
      text: { color: '#f2d8e4' },
      textSecondary: { color: '#a8788e' },
      border: { color: '#4c2038' },
      borderCentral: { color: '#e0609e' },
      borderSelected: { color: '#e8b040' },
      borderCentralSelected: { color: '#c07a72' },
      accent: { color: '#ee74a8' }
    },
    edge: {
      line: { color: '#96607c' },
      lineSecondary: { color: '#5c3848' },
      arrow: { color: '#96607c' },
      label: { color: '#a8788e' }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#a87e94', '#5c3848', '#a8788e', 2, 0.8),
      'edge-style-2': makeStrongEdgeStyle('#d9558f', '#a02060', '#d9558f', 3.25, 0.8),
      'edge-style-3': makeSecondaryEdgeStyle('#c9a03a', '#8f6a12', '#c9a03a', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#1e0e18' },
      text: { color: '#a8788e' }
    }
  },

  // ── Midnight Purple (violet/lavender) ─────────────────────────────────
  // The only theme with the shadow off and a visible node border: a flat, 2D
  // look rather than the lit depth every other dark theme uses.
  'midnight-purple': {
    id: 'midnight-purple',
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

  // ── Nebula (near-black indigo, polychrome accents) ────────────────────
  // Distinct by strategy rather than hue: every other dark theme draws its
  // accents from one family, this one deliberately spends cyan, magenta and
  // lime against a neutral indigo so the three node states are unmistakable.
  'nebula': {
    id: 'nebula',
    canvas: {
      background: {
        color: '#0b0d18',
        vignette: { strength: 0.5, spread: 45, blur: 220, color: '#03040a' }
      }
    },
    node: {
      background: { color: '#141a30', opacity: 0.55 },
      backgroundAlt: { color: '#1e2848', opacity: 0.55 },
      text: { color: '#dfe6f5' },
      textSecondary: { color: '#7d88ab' },
      border: { color: '#2a3358' },
      borderCentral: { color: '#2ee6d0' },
      borderSelected: { color: '#ff5fa2' },
      borderCentralSelected: { color: '#9fd45c' },
      accent: { color: '#5cc8ff' }
    },
    edge: {
      line: { color: '#5f6c99' },
      lineSecondary: { color: '#39436b' },
      arrow: { color: '#5f6c99' },
      label: { color: '#7d88ab' }
    },
    edgeStyleSlots: {
      'edge-style-1': makeEdgeStyle('#7784b3', '#39436b', '#7d88ab', 2, 0.8),
      'edge-style-2': makeStrongEdgeStyle('#2ec9d8', '#127a92', '#2ec9d8', 3.25, 0.82),
      'edge-style-3': makeSecondaryEdgeStyle('#e0669f', '#962f63', '#e0669f', 2.5, 0.8)
    },
    decoration: {
      background: { color: '#101426' },
      text: { color: '#7d88ab' }
    }
  }
};
