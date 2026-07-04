/**
 * Auto-layout Settings
 * Configuration for automatic re-arrangement of the current scene.
 *
 * Access via getSetting('autolayout.settingName') in config/index.ts
 */

/**
 * User-configurable auto-layout settings.
 *
 * `layoutType` is a select with a single option today; it is the extension
 * point for a growing collection of layout algorithms.
 */
export const AUTOLAYOUT_DEFAULTS = {
  layoutType: 'radial' as 'radial',
  ringSpacing: 220,
  siblingGap: 40,
  animate: true,
  animationDuration: 600,
};
