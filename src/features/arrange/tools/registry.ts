/**
 * Arrange tool registry
 *
 * Single source of truth for the available tools, mirroring
 * `autolayout/algorithms/registry.ts`. Adding a tool is: write the file,
 * add its id to `ArrangeToolId`, add one line here. Menus are generated from
 * `listTools()`, so no UI change is needed.
 *
 * Unlike the scene-layout registry, the choice of tool is not a user setting —
 * it is decided by the command the user invokes — so there is no `config`
 * catalog and no fallback: `ArrangeToolId` makes every lookup total.
 */

import { alignColumnTool, alignDiagonalTool, alignRowTool } from './align';
import { distributeDiagonalTool, distributeHorizontalTool, distributeVerticalTool } from './distribute';
import { circleTool } from './circle';
import { gridDiagonalTool, gridTool } from './grid';
import { rotateClockwiseTool, rotateCounterClockwiseTool } from './rotate';
import { spreadTool, tightenTool } from './spacing';
import type { ArrangeGroup, ArrangeTool, ArrangeToolId } from './types';

/** Caption shown above each group in generated menus. */
export const ARRANGE_GROUP_LABELS: Record<ArrangeGroup, string> = {
  align: 'Align',
  distribute: 'Distribute',
  shape: 'Shape',
  rotate: 'Rotate',
  spacing: 'Spacing',
};

/**
 * Declaration order is display order: `Object.values` preserves insertion order
 * for string keys, so the menu follows this literal. Align and Distribute sit
 * together because they compose (align a row, then distribute it).
 */
const TOOLS: Record<ArrangeToolId, ArrangeTool> = {
  'align-row': alignRowTool,
  'align-column': alignColumnTool,
  'align-diagonal': alignDiagonalTool,
  'distribute-horizontal': distributeHorizontalTool,
  'distribute-vertical': distributeVerticalTool,
  'distribute-diagonal': distributeDiagonalTool,
  'circle': circleTool,
  'grid': gridTool,
  'grid-diagonal': gridDiagonalTool,
  'rotate-cw': rotateClockwiseTool,
  'rotate-ccw': rotateCounterClockwiseTool,
  'tighten': tightenTool,
  'spread': spreadTool,
};

export function resolveTool(id: ArrangeToolId): ArrangeTool {
  return TOOLS[id];
}

/** Every tool, in display order. */
export function listTools(): readonly ArrangeTool[] {
  return Object.values(TOOLS);
}

/** The smallest selection any tool can act on — the gate for the whole family. */
export function minimumSelection(): number {
  return Math.min(...listTools().map(tool => tool.minNodes));
}
