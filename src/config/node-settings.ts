/**
 * Node Settings
 * Configuration for node creation and design selection
 */

import type { DesignId } from '../core/main-types';

/**
 * Supported range for a node's scene-scoped `scale`. Shared by the node
 * editor's slider and the `<` / `>` shortcut so both agree on the limits.
 * Fixed bounds rather than settings: they delimit what the design system can
 * render legibly, not a matter of taste.
 *
 * Scale stretches the design's rendered SVG (see `StyleGenerator`), it does not
 * re-render it, so the upper end trades sharpness for size: text softens as the
 * bitmap is upsampled, and the theme/selection `border-width` stays constant in
 * pixels rather than growing with the node.
 */
export const NODE_SCALE_MIN = 0.2;
export const NODE_SCALE_MAX = 5.0;

/**
 * Node settings defaults
 */
export const NODE_DEFAULTS = {
  /** Whether to inherit design from selected node when adding free node */
  inheritDesignFromSelected: true,
  
  /** Whether to inherit design from source node when adding child/parent */
  inheritDesignForConnected: true,
  
  /** Default design to use when not inheriting (or no node selected) */
  defaultDesign: 'default-node' as DesignId,

  /** Design to use when an editor workflow adds an equation to a node */
  equationDesign: 'equation-compact-node' as DesignId,
  
  /** Design for shelf items that have an equation */
  shelfDesignWithEquation: 'equation-compact-node' as DesignId,
  
  /** Design for shelf items without equation */
  shelfDesignBasic: 'default-node' as DesignId,

  /**
   * Multiplier for the distance at which a newly added node is placed next to
   * its parent (scales both the breathing room and the inter-node clearance).
   * 1.0 = default spacing; lower packs tighter, higher spreads out.
   * Affects newly placed nodes only — existing layouts are not reflowed.
   * See docs/node-placement.md §4.
   */
  spacing: 1.0,

  /**
   * Multiplicative step for the Enlarge / Shrink shortcut (`>` / `<`), applied
   * to the selected nodes' `scale`. A ratio rather than an increment so the
   * step is perceptually uniform and exactly self-inverse, and so a selection
   * of differently sized nodes keeps its relative sizes.
   */
  scaleStep: 1.1,
};
