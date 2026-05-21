/**
 * Design registry - simplified API for node styling
 */

import type { Node, DesignId } from '../../core/main-types';
import type { ColorTheme, CytoscapeNodeStyle } from '../../core/style-types';
import { DESIGN_MANIFEST } from '../../config/design-manifest';
import { getEquationNodeStyle, type EquationNodeParams } from './equation-node';
import { getCircleNodeStyle, type CircleNodeParams } from './circle-node';
import { getRectangleNodeStyle, type RectangleNodeParams } from './rectangle-node';
import { getTesterNodeStyle, type TesterNodeParams } from './tester-node';
import { getDefaultNodeStyle, type DefaultNodeParams } from './default-node';
import { getEquationCompactNodeStyle, type EquationCompactNodeParams } from './equation-compact-node';

/**
 * Design specification with ID and parameters
 */
export type Design =
  | { id: 'default-node'; params?: DefaultNodeParams }
  | { id: 'equation-node'; params?: EquationNodeParams }
  | { id: 'equation-compact-node'; params?: EquationCompactNodeParams }
  | { id: 'circle-node'; params?: CircleNodeParams }
  | { id: 'rectangle-node'; params?: RectangleNodeParams }
  | { id: 'tester-node'; params?: TesterNodeParams };

/**
 * Available designs — derived from the config manifest so there is a single
 * source of truth for the id/label list.
 */
export const AVAILABLE_DESIGNS: { id: DesignId; label: string }[] = DESIGN_MANIFEST;

/**
 * Get Cytoscape style for a node based on design specification
 */
export async function getNodeStyle(
  node: Node,
  design: Design,
  theme: ColorTheme
): Promise<CytoscapeNodeStyle> {
  switch (design.id) {
    case 'default-node':
      return getDefaultNodeStyle(node, design.params || {}, theme);
    
    case 'equation-node':
      return getEquationNodeStyle(node, design.params || {}, theme);
    
    case 'equation-compact-node':
      return getEquationCompactNodeStyle(node, design.params || {}, theme);
    
    case 'circle-node':
      return getCircleNodeStyle(node, design.params || {}, theme);
    
    case 'rectangle-node':
      return getRectangleNodeStyle(node, design.params || {}, theme);
    
    case 'tester-node':
      return getTesterNodeStyle(node, design.params || {}, theme);
    
    default: {
      const exhaustiveCheck: never = design;
      throw new Error(`Unknown design: ${exhaustiveCheck}`);
    }
  }
}
