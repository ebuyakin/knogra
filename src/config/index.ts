/**
 * Settings - Centralized configuration management
 * Type-safe access to all application settings with localStorage persistence
 * 
 * All settings stored in single localStorage key: knogra.settings
 */

import { FOLD_DEFAULTS } from './fold-settings';
import { TRANSITION_DEFAULTS } from './transition-settings';
import { AI_DEFAULTS } from './ai-settings';
import { NODE_DEFAULTS } from './node-settings';
import { EDGE_DEFAULTS } from './edge-settings';
import { CUSTOM_THEME_DEFAULTS } from './custom-theme-settings';
import { INTERACTION_DEFAULTS } from './interaction-settings';
import { AUTOLAYOUT_DEFAULTS } from './autolayout-settings';
import { ARRANGE_DEFAULTS } from './arrange-settings';
import { SETTINGS_KEY } from './storage-config';

/**
 * All default settings grouped by domain.
 *
 * Exported as `FACTORY_DEFAULTS` for build-time tooling (e.g. tutorial report
 * generation) that needs the canonical factory values without going through
 * the localStorage-bound `getSetting()` path.
 *
 * Treat this object as read-only. Mutating it corrupts subsequent
 * `resetSetting()` / `importSettings()` calls. Internal code clones before
 * mutating (see `getAllSettings()`).
 */
const ALL_DEFAULTS = {
  fold: FOLD_DEFAULTS,
  transition: TRANSITION_DEFAULTS,
  ai: AI_DEFAULTS,
  node: NODE_DEFAULTS,
  edge: EDGE_DEFAULTS,
  customTheme: CUSTOM_THEME_DEFAULTS,
  interaction: INTERACTION_DEFAULTS,
  autolayout: AUTOLAYOUT_DEFAULTS,
  arrange: ARRANGE_DEFAULTS,
};

export { ALL_DEFAULTS as FACTORY_DEFAULTS };

/** Settings object type */
type SettingsObject = typeof ALL_DEFAULTS;

/**
 * Helper type to get the value type for a given setting key
 */
type SettingValue<K extends SettingKey> = 
  K extends `fold.${infer S}` ? S extends keyof typeof FOLD_DEFAULTS ? typeof FOLD_DEFAULTS[S] : never :
  K extends `transition.${infer S}` ? S extends keyof typeof TRANSITION_DEFAULTS ? typeof TRANSITION_DEFAULTS[S] : never :
  K extends `ai.${infer S}` ? S extends keyof typeof AI_DEFAULTS ? typeof AI_DEFAULTS[S] : never :
  K extends `node.${infer S}` ? S extends keyof typeof NODE_DEFAULTS ? typeof NODE_DEFAULTS[S] : never :
  K extends `edge.${infer S}` ? S extends keyof typeof EDGE_DEFAULTS ? typeof EDGE_DEFAULTS[S] : never :
  K extends `customTheme.${infer S}` ? S extends keyof typeof CUSTOM_THEME_DEFAULTS ? typeof CUSTOM_THEME_DEFAULTS[S] : never :
  K extends `interaction.${infer S}` ? S extends keyof typeof INTERACTION_DEFAULTS ? typeof INTERACTION_DEFAULTS[S] : never :
  K extends `autolayout.${infer S}` ? S extends keyof typeof AUTOLAYOUT_DEFAULTS ? typeof AUTOLAYOUT_DEFAULTS[S] : never :
  K extends `arrange.${infer S}` ? S extends keyof typeof ARRANGE_DEFAULTS ? typeof ARRANGE_DEFAULTS[S] : never :
  never;

/**
 * Valid setting keys (dot notation: domain.setting)
 * TypeScript will autocomplete and validate these
 */
export type SettingKey = 
  | `fold.${keyof typeof FOLD_DEFAULTS}`
  | `transition.${keyof typeof TRANSITION_DEFAULTS}`
  | `ai.${keyof typeof AI_DEFAULTS}`
  | `node.${keyof typeof NODE_DEFAULTS}`
  | `edge.${keyof typeof EDGE_DEFAULTS}`
  | `customTheme.${keyof typeof CUSTOM_THEME_DEFAULTS}`
  | `interaction.${keyof typeof INTERACTION_DEFAULTS}`
  | `autolayout.${keyof typeof AUTOLAYOUT_DEFAULTS}`
  | `arrange.${keyof typeof ARRANGE_DEFAULTS}`;

/**
 * Get all settings from localStorage (merged with defaults)
 */
function getAllSettings(): SettingsObject {
  const stored = localStorage.getItem(SETTINGS_KEY);
  // Clone defaults so downstream mutations (setSetting, resetSetting) don't
  // corrupt the canonical ALL_DEFAULTS object.
  if (!stored) return structuredClone(ALL_DEFAULTS);

  try {
    const parsed = JSON.parse(stored);
    // Deep merge with defaults
    return {
      fold: { ...ALL_DEFAULTS.fold, ...parsed.fold },
      transition: { ...ALL_DEFAULTS.transition, ...parsed.transition },
      ai: { ...ALL_DEFAULTS.ai, ...parsed.ai },
      node: { ...ALL_DEFAULTS.node, ...parsed.node },
      edge: { ...ALL_DEFAULTS.edge, ...parsed.edge },
      customTheme: { ...ALL_DEFAULTS.customTheme, ...parsed.customTheme },
      interaction: { ...ALL_DEFAULTS.interaction, ...parsed.interaction },
      autolayout: { ...ALL_DEFAULTS.autolayout, ...parsed.autolayout },
      arrange: { ...ALL_DEFAULTS.arrange, ...parsed.arrange },
    };
  } catch {
    return ALL_DEFAULTS;
  }
}

/**
 * Save all settings to localStorage
 */
function saveAllSettings(settings: SettingsObject): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Get setting value
 * Returns user preference from localStorage if set, otherwise returns default
 * 
 * @example
 * const duration = getSetting('fold.animationDuration'); // 300
 */
export function getSetting<K extends SettingKey>(key: K): SettingValue<K> {
  const [domain, setting] = key.split('.') as [keyof SettingsObject, string];
  const allSettings = getAllSettings();
  const domainSettings = allSettings[domain] as Record<string, unknown>;
  return domainSettings[setting] as SettingValue<K>;
}

/**
 * Set setting value
 * Saves user preference to localStorage
 * 
 * @example
 * setSetting('fold.animationDuration', 500);
 */
export function setSetting<K extends SettingKey>(key: K, value: unknown): void {
  const [domain, setting] = key.split('.') as [keyof SettingsObject, string];
  const allSettings = getAllSettings();
  (allSettings[domain] as Record<string, unknown>)[setting] = value;
  saveAllSettings(allSettings);
}

/**
 * Reset setting to default value
 * Reverts to hardcoded default
 */
export function resetSetting(key: SettingKey): void {
  const [domain, setting] = key.split('.') as [keyof SettingsObject, string];
  const allSettings = getAllSettings();
  const defaults = ALL_DEFAULTS[domain] as Record<string, unknown>;
  (allSettings[domain] as Record<string, unknown>)[setting] = defaults[setting];
  saveAllSettings(allSettings);
}

/**
 * Reset all settings to defaults
 * Clears all user preferences
 */
export function resetAllSettings(): void {
  localStorage.removeItem(SETTINGS_KEY);
}

/**
 * Export all settings (for workspace export)
 */
export function exportSettings(): SettingsObject {
  return getAllSettings();
}

/**
 * Import settings (for workspace import)
 */
export function importSettings(settings: Partial<SettingsObject>): void {
  const merged: SettingsObject = {
    fold: { ...ALL_DEFAULTS.fold, ...settings.fold },
    transition: { ...ALL_DEFAULTS.transition, ...settings.transition },
    ai: { ...ALL_DEFAULTS.ai, ...settings.ai },
    node: { ...ALL_DEFAULTS.node, ...settings.node },
    edge: { ...ALL_DEFAULTS.edge, ...settings.edge },
    customTheme: { ...ALL_DEFAULTS.customTheme, ...settings.customTheme },
    interaction: { ...ALL_DEFAULTS.interaction, ...settings.interaction },
    autolayout: { ...ALL_DEFAULTS.autolayout, ...settings.autolayout },
    arrange: { ...ALL_DEFAULTS.arrange, ...settings.arrange },
  };
  saveAllSettings(merged);
}
