/**
 * Interaction Settings
 * Configuration for user interaction behaviors
 */

export interface InteractionSettings {
  /** What double-clicking a node does: open editor or navigate to its scene */
  doubleClickNode: 'edit' | 'navigate';
  /** Multiplier for +/- zoom steps, applied to both current-scene and all-scenes zoom */
  zoomStep: number;
}

export const INTERACTION_DEFAULTS: InteractionSettings = {
  doubleClickNode: 'navigate',
  zoomStep: 1.2,
};

/**
 * Window in ms within which two clicks are read as a double-click.
 *
 * Cytoscape hit-tests on a canvas and synthesizes `dblclick`/`dbltap` itself, so the OS
 * double-click speed never reaches it; its own default of 250ms is uncomfortably fast.
 * 500ms matches the Windows system default. No latency cost: nothing in the app listens
 * to `onetap`/`oneclick`, the only events Cytoscape defers by this interval.
 *
 * Not part of `InteractionSettings` — it is passed to the Cytoscape core at construction
 * rather than read per use, and every member of the settings object is surfaced in the
 * settings modal and round-tripped through workspace export/import.
 */
export const DOUBLE_CLICK_INTERVAL_MS = 500;
