/**
 * Theme Manifest
 * The id, display label and order of every built-in theme.
 *
 * Single source of truth for all three. Palette files in `styles/themes/`
 * supply colour and nothing else — they carry no name — and the theme picker,
 * the settings dropdown and `getAvailableThemes()` all read their list and
 * their order from here. Adding a theme means one entry here plus one literal
 * in the matching palette file; there is no second list to keep in step.
 *
 * Lives in config/ for the same reason as `design-manifest.ts`: setting
 * definitions need the id/label list without importing the styles runtime.
 *
 * Order is dark themes first, light themes last. The app's chrome is dark, so
 * the dark set is the default territory and the light block reads as a
 * deliberate departure rather than a scattering.
 */

import type { ThemeId } from '../core/main-types';

export interface ThemeManifestEntry {
  id: ThemeId;
  label: string;
}

export const THEME_MANIFEST: ThemeManifestEntry[] = [
  // Dark. `dark` leads because it is the theme new scenes are seeded with
  // (see `storage/seed-workspace.ts`), so the list opens on the one a user
  // is most likely already looking at.
  { id: 'dark', label: 'Dark Blue (default)' },
  { id: 'default', label: 'Black & White' },
  { id: 'slate', label: 'Slate' },
  { id: 'high-contrast', label: 'High Contrast' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'forest', label: 'Forest' },
  { id: 'warm-dark', label: 'Warm Dark' },
  { id: 'espresso', label: 'Espresso' },
  { id: 'ember', label: 'Ember' },
  { id: 'wine', label: 'Wine' },
  { id: 'midnight-purple', label: 'Midnight Purple' },
  { id: 'nebula', label: 'Nebula' },
  // Light
  { id: 'light', label: 'Light' },
  { id: 'paper', label: 'Paper' },
  { id: 'meadow', label: 'Meadow' },
  { id: 'iris', label: 'Iris' },
];

/** Display label for a built-in theme id, or undefined for custom/unknown ids. */
export function getThemeLabel(themeId: ThemeId): string | undefined {
  return THEME_MANIFEST.find(entry => entry.id === themeId)?.label;
}
