/**
 * Custom Theme Settings
 * User-configurable theme that overlays a selected base theme.
 * Settings are exposed via the Settings overlay using the standard getSetting() approach.
 *
 * The custom theme appears as "Custom" in the scene theme dropdown.
 * User selects a base theme, then overrides individual properties.
 * Unmodified properties inherit from the base theme.
 *
 * Empty string ('') = inherit from base theme for ALL fields (color and numeric).
 * Any non-empty value is used as an explicit override.
 */

/**
 * Custom theme defaults
 * All empty = fully inherit from base theme
 */
export const CUSTOM_THEME_DEFAULTS = {
  // Base theme to build on
  baseTheme: 'default',

  // Canvas
  canvasColor: '',
  canvasVignetteStrength: '',
  canvasVignetteSpread: '',
  canvasVignetteBlur: '',
  canvasVignetteColor: '',
  canvasVignetteColorOpacity: '',

  // Node
  nodeBackground: '',
  nodeOpacity: '',
  nodeTextColor: '',
  nodeBorderColor: '',
  nodeBorderWidth: '',
  centralBorderColor: '',
  selectedBorderColor: '',
  centralSelectedBorderColor: '',

  // Shadow
  shadowOffsetX: '',
  shadowOffsetY: '',
  shadowBlur: '',
  shadowOpacity: '',
  shadowColor: '',

  // Node vignette
  nodeVignetteStrength: '',
  nodeVignetteSpread: '',
  nodeVignetteBlur: '',
  nodeVignetteColor: '',

  // Edge
  edgeColor: '',
  edgeArrowColor: '',
};
