/**
 * Arrange Settings
 * Configuration for the selection-scoped arrange tools (align, shape, spacing).
 *
 * Distinct from `autolayout-settings.ts` on purpose: arrange tools are
 * geometric transforms on the current selection, anchored on the selection's
 * own centroid, whereas auto-layout is a scene-wide algorithm rooted at the
 * central node. See docs/layout-architecture.md §1.1.
 *
 * Access via getSetting('arrange.settingName') in config/index.ts
 */

export const ARRANGE_DEFAULTS = {
  /** Selection spacing: multiplicative step applied per Tighten/Spread command.
   *  Selected node positions scale by this factor about their centroid, so the
   *  distance between them grows or shrinks while their size is untouched.
   *  `1/spacingStep` exactly reverses `spacingStep`.
   *
   *  Not to be confused with `autolayout.densityStep`, which changes apparent
   *  node *size* across the whole scene and leaves distances on screen alone. */
  spacingStep: 1.15,

  /** Selection rotation: angular step (degrees) applied per Rotate command,
   *  turning the selected nodes rigidly about their own centroid.
   *
   *  Its own key rather than `autolayout.rotateStep`, which turns the whole
   *  scene about its central node: the two commands differ in scope, and a
   *  coarse scene rotation pairs naturally with a finer selection one. */
  rotateStep: 15,
};
