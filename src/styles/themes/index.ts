/**
 * Theme Registry
 * Built-in themes + custom user themes.
 * getTheme() returns a fully populated theme by merging with defaults.
 *
 * This file owns behaviour — the merge cascade, the custom-theme builder and
 * the lookup API. Colour lives in the palette files beside it; the id, label
 * and order of the built-in set live in `config/theme-manifest.ts`.
 */

import type { ColorTheme } from '../../core/style-types';
import type { ThemeId } from '../../core/main-types';
import { getSetting } from '../../config';
import { THEME_MANIFEST, getThemeLabel } from '../../config/theme-manifest';
import { themeStore } from '../../storage/theme-store';
import { DEFAULT_THEME, type BuiltInTheme } from './default-theme';
import { DARK_PALETTES } from './dark-palettes';
import { LIGHT_PALETTES } from './light-palettes';

/**
 * Palette lookup. Deliberately not exported and deliberately not the source of
 * the picker's order — `THEME_MANIFEST` is, so a palette can be moved between
 * files without silently reordering the UI.
 */
const BUILT_IN_PALETTES: Record<string, BuiltInTheme> = {
  ...DARK_PALETTES,
  ...LIGHT_PALETTES,
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
 *
 * Retained for legacy resolution only — the custom theme is no longer offered
 * in the picker or editable in settings, but its `customTheme.*` keys still
 * live in storage and travel with the workspace, so a scene saved against it
 * must still resolve to the appearance its author chose.
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
 * Get a built-in theme by ID (fully merged with DEFAULT_THEME).
 *
 * The display name is applied from the manifest rather than read from the
 * palette, so a theme's label exists in exactly one place.
 */
function getBuiltInTheme(themeId: ThemeId): ColorTheme {
  const palette = BUILT_IN_PALETTES[themeId];
  if (!palette) return DEFAULT_THEME;

  const theme = deepMerge(DEFAULT_THEME, palette as Partial<ColorTheme>);
  theme.name = getThemeLabel(themeId) ?? themeId;
  return theme;
}

// =============================================================================
// THEME REGISTRY API
// =============================================================================

/**
 * Get theme by ID with all properties guaranteed
 * Merges requested theme over DEFAULT_THEME
 */
export function getTheme(themeId: ThemeId): ColorTheme {
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
 * Get all selectable themes, in manifest order.
 *
 * The settings-driven 'custom' theme is deliberately not offered: it was a
 * fourth authoring mechanism alongside the built-in set and the per-node and
 * per-edge overrides, and only ever supported one instance globally.
 * `getTheme('custom')` still resolves it, so scenes and imported workspaces
 * that reference it keep rendering as their author left them.
 */
export function getAvailableThemes(): ColorTheme[] {
  return THEME_MANIFEST.map(entry => getTheme(entry.id));
}

/**
 * Check if a theme ID is a built-in theme
 */
export function isBuiltInTheme(themeId: ThemeId): boolean {
  return themeId in BUILT_IN_PALETTES;
}
