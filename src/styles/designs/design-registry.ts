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
import {
  getDefaultNodeStyle,
  DEFAULT_ASPECT,
  DEFAULT_FONT_SIZE,
  DEFAULT_MIN_WIDTH,
  type DefaultNodeParams
} from './default-node';
import { getEquationCompactNodeStyle, type EquationCompactNodeParams } from './equation-compact-node';
import {
  getImageNodeStyle,
  IMAGE_DEFAULT_ASPECT,
  IMAGE_DEFAULT_H_PADDING,
  IMAGE_DEFAULT_TITLE_FONT_SIZE,
  IMAGE_DEFAULT_V_PADDING,
  type ImageNodeParams
} from './image-node';
import { getImageCaptionNodeStyle, type ImageCaptionNodeParams } from './image-caption-node';

/**
 * Design specification with ID and parameters
 */
export type Design =
  | { id: 'default-node'; params?: DefaultNodeParams }
  | { id: 'equation-node'; params?: EquationNodeParams }
  | { id: 'equation-compact-node'; params?: EquationCompactNodeParams }
  | { id: 'image-node'; params?: ImageNodeParams }
  | { id: 'image-caption-node'; params?: ImageCaptionNodeParams }
  | { id: 'circle-node'; params?: CircleNodeParams }
  | { id: 'rectangle-node'; params?: RectangleNodeParams }
  | { id: 'tester-node'; params?: TesterNodeParams };

/**
 * Available designs — derived from the config manifest so there is a single
 * source of truth for the id/label list.
 */
export const AVAILABLE_DESIGNS: { id: DesignId; label: string }[] = DESIGN_MANIFEST;

// =============================================================================
// LAYOUT CONTROLS
// =============================================================================

/**
 * A layout knob a design offers in the node editor's Design tab.
 *
 * `key` is the design param the control writes. A checkbox carries no default
 * because absent means off, which is what keeps unchanged params sparse.
 *
 * `enabledBy` names a checkbox this control depends on, and is deliberately
 * per-design rather than global: an image node's aspect ratio does nothing
 * until the ratio is held, while `default-node` reflows its text toward that
 * ratio either way.
 */
export type NodeLayoutControl =
  | {
      kind: 'number';
      key: string;
      label: string;
      defaultValue: number;
      min: number;
      max: number;
      step: number;
      enabledBy?: string;
    }
  | { kind: 'checkbox'; key: string; label: string };

/**
 * Which layout controls each design exposes.
 *
 * Declared here rather than in the editor for two reasons: the defaults belong
 * to the design modules and are referenced rather than copied, and the tab can
 * render whatever a design declares without ever naming a design id. A design
 * absent from this map simply shows no layout section.
 */
const DESIGN_LAYOUT_CONTROLS: Record<string, NodeLayoutControl[]> = {
  'default-node': [
    { kind: 'checkbox', key: 'fixedAspect', label: 'Fixed Aspect' },
    { kind: 'number', key: 'aspectRatio', label: 'Aspect ratio', defaultValue: DEFAULT_ASPECT, min: 0.3, max: 5, step: 0.05 },
    { kind: 'number', key: 'fontSize', label: 'Font size', defaultValue: DEFAULT_FONT_SIZE, min: 6, max: 48, step: 1 },
    { kind: 'number', key: 'minWidth', label: 'Min Width', defaultValue: DEFAULT_MIN_WIDTH, min: 40, max: 600, step: 5 }
  ],
  'image-node': [
    { kind: 'checkbox', key: 'fixedAspect', label: 'Fixed Aspect' },
    { kind: 'number', key: 'aspectRatio', label: 'Aspect ratio', defaultValue: IMAGE_DEFAULT_ASPECT, min: 0.3, max: 5, step: 0.05, enabledBy: 'fixedAspect' },
    { kind: 'number', key: 'hPadding', label: 'Padding H', defaultValue: IMAGE_DEFAULT_H_PADDING, min: 0, max: 80, step: 1 },
    { kind: 'number', key: 'vPadding', label: 'Padding V', defaultValue: IMAGE_DEFAULT_V_PADDING, min: 0, max: 80, step: 1 }
  ],
  // The caption variant adds the one knob it has that `image-node` does not:
  // its title. The param is `titleFontSize`, not `fontSize` — the control is
  // declared against the design's own key rather than a shared name.
  //
  // Order is the render order of a two-column grid, so the paired paddings
  // share a row and the title's own knob starts the next one.
  'image-caption-node': [
    { kind: 'checkbox', key: 'fixedAspect', label: 'Fixed Aspect' },
    { kind: 'number', key: 'aspectRatio', label: 'Aspect ratio', defaultValue: IMAGE_DEFAULT_ASPECT, min: 0.3, max: 5, step: 0.05, enabledBy: 'fixedAspect' },
    { kind: 'number', key: 'hPadding', label: 'Padding H', defaultValue: IMAGE_DEFAULT_H_PADDING, min: 0, max: 80, step: 1 },
    { kind: 'number', key: 'vPadding', label: 'Padding V', defaultValue: IMAGE_DEFAULT_V_PADDING, min: 0, max: 80, step: 1 },
    { kind: 'number', key: 'titleFontSize', label: 'Font size', defaultValue: IMAGE_DEFAULT_TITLE_FONT_SIZE, min: 6, max: 48, step: 1 }
  ]
};

export function getDesignLayoutControls(designId: DesignId): NodeLayoutControl[] {
  return DESIGN_LAYOUT_CONTROLS[designId] ?? [];
}

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
    
    case 'image-node':
      return getImageNodeStyle(node, design.params || {}, theme);
    
    case 'image-caption-node':
      return getImageCaptionNodeStyle(node, design.params || {}, theme);
    
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
