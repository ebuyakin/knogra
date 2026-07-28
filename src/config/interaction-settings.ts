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
