/**
 * Arrange tool contract
 *
 * The selection-scoped counterpart to `autolayout/algorithms/types.ts`. An
 * arrange tool is a **pure geometric function**: it receives the selected nodes'
 * centres and rendered footprints and returns their new centres. It never sees
 * Cytoscape, never reads edges, and never touches the viewport — all of that
 * stays in the `Arrange` class.
 *
 * Deliberately independent of the auto-layout types despite the similar shape:
 * the two feature slices must not import from each other, and duplicating a
 * four-field geometry interface is cheaper than a shared dependency.
 */

import type { Position } from 'cytoscape';
import type { NodeId } from '../../../core/main-types';

/** Stable ids for the available tools; also the keys used by callers. */
export type ArrangeToolId =
  | 'align-row'
  | 'align-column'
  | 'align-diagonal'
  | 'distribute-horizontal'
  | 'distribute-vertical'
  | 'distribute-diagonal'
  | 'circle'
  | 'grid'
  | 'tighten'
  | 'spread';

/**
 * Menu grouping. Tools of one group are listed together and separated from the
 * next group by a divider, so the UI never hard-codes the tool list.
 */
export type ArrangeGroup = 'align' | 'distribute' | 'shape' | 'spacing';

/** One selected node, as an arrange tool sees it. Geometry only. */
export interface ArrangeNode {
  id: NodeId;
  /** Node centre, graph coordinates. */
  position: Position;
  /** Rendered bounding box — lets tools reserve space for a node. */
  footprint: { width: number; height: number };
}

/**
 * Knobs available to tools. A superset: each tool reads only what it needs, and
 * new tools add **optional** fields rather than changing the shape. Values are
 * resolved from settings by `Arrange` so the tools stay pure.
 */
export interface ArrangeParams {
  /** Minimum padding reserved per node when a tool must fit nodes on a ring. */
  siblingGap?: number;
  /** Multiplier on the reserved node footprint; <1 packs tighter, >1 looser. */
  footprintScale?: number;
  /** Multiplicative distance step for Tighten/Spread, already raised to the
   *  number of coalesced presses. */
  spacingStep?: number;
}

export interface ArrangeInput {
  nodes: ArrangeNode[];
  params: ArrangeParams;
}

/**
 * Returns the new centre for each node it wishes to move. Nodes omitted from
 * the map stay where they are; an empty map means "nothing to do" (a degenerate
 * input, e.g. coincident nodes) and is a valid, silent result.
 */
export type ArrangeComputeFn = (input: ArrangeInput) => Map<NodeId, Position>;

export interface ArrangeTool {
  id: ArrangeToolId;
  /** Display label, without the shortcut hint. */
  label: string;
  /** Keyboard shortcut, shown as a hint in menus. Omitted for menu-only tools. */
  shortcut?: string;
  group: ArrangeGroup;
  /** Below this many selected nodes the tool is disabled and does nothing. */
  minNodes: number;
  compute: ArrangeComputeFn;
}
