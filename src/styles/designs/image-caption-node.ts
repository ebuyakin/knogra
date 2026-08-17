/**
 * Image Caption Node Design
 * Two-section layout: title bar + SVG pictogram.
 *
 * The same drawing as `image-node` with the title bar added, and it reuses the
 * title treatment of `equation-compact-node` so the two read as siblings.
 * See docs/nodes-svg-images.md §5.1.
 */

import type { Node } from '../../core/main-types';
import type { ColorTheme, CytoscapeNodeStyle } from '../../core/style-types'
import { renderImageNodeStyle, type ImageNodeParams } from './image-node'

export type ImageCaptionNodeParams = ImageNodeParams;

export async function getImageCaptionNodeStyle(
  node: Node,
  params: ImageCaptionNodeParams,
  theme: ColorTheme
): Promise<CytoscapeNodeStyle> {
  return renderImageNodeStyle(node, params, theme, true);
}
