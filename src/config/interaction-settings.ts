/**
 * Interaction Settings
 * Configuration for user interaction behaviors
 */

export interface InteractionSettings {
  /** What double-clicking a node does: open editor or navigate to its scene */
  doubleClickNode: 'edit' | 'navigate';
}

export const INTERACTION_DEFAULTS: InteractionSettings = {
  doubleClickNode: 'edit',
};
