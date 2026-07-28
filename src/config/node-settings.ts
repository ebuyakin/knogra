/**
 * Node Settings
 * Configuration for node creation and design selection
 */

import type { DesignId } from '../core/main-types';

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
};
