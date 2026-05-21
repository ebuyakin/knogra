/**
 * Fold Settings
 * Configuration for node fold/unfold operations (collapse/expand)
 */

/**
 * User-configurable fold settings
 * Access via getSetting('fold.settingName') in config/index.ts
 */
export const FOLD_DEFAULTS = {
  // Animation settings
  collapseDuration: 300,
  collapseDelayBetweenLayers: 0,
  collapseEdgeFadeDelay: 1500,  // Delay after fading out extra edges before collapse
  expandDuration: 600,
  expandEdgeFadeDelay: 300,  // Delay before fading in extra edges after expansion
  easingCollapse: 'ease-in' as const,
  easingExpand: 'ease-out' as const,
  
  // Placement settings
  minRadiusMultiplier: 1.0,   // Children placed at least (parentSize * multiplier) away
  
  // Behavior settings
  expandShowAllEdges: true,   // Include all edges when expanding (not just parent→child)
  collapseRemoveAll: false,   // Remove all descendants (ignore external edges)
};

/**
 * Hardcoded constraints
 * Not exposed to users in current version
 */
export const FOLD_HARDCODED = {
  minDuration: 100,
  maxDuration: 2000,
} as const;
