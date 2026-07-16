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
  /** Scales the reserved node footprint used when sizing ring radii. The
   *  half-diagonal footprint over-reserves space; values <1 pack rings and
   *  siblings tighter, >1 looser. */
  footprintScale: 1,
  /** Sequencing of siblings around a ring: edge insertion order vs. the node's
   *  current on-screen angular order (preserves a hand-arranged sequence). */
  ringOrder: 'edge' as 'edge' | 'angular',
  /** Scene rotation: angular step (degrees) applied per rotate command. */
  rotateStep: 15,
  /** Scene density: multiplicative step applied per spread/tighten command.
   *  Positions scale by this factor about the central node (and the viewport
   *  zooms by its inverse), so a scene can be de-crowded or packed without
   *  touching per-node `scale`. `1/densityStep` exactly reverses `densityStep`. */
  densityStep: 1.15,
  animate: true,
  animationDuration: 600,
  /** Grow & Arrange: neighbourhood traversal direction from the central node. */
  growDirection: 'both' as 'both' | 'children' | 'parents',
  /** Grow & Arrange: entrant count above which a confirmation is required. */
  growConfirmThreshold: 30,
};

/**
 * Catalog of available scene-layout algorithms (ids + display labels). Single
 * source of truth for the layout dropdown; the implementations live in
 * `src/features/autolayout/algorithms/` and are keyed by these same ids.
 */
export const AUTOLAYOUT_ALGORITHMS = [
  { id: 'radial', label: 'Radial (outer-ring spreading)' },
] as const;
