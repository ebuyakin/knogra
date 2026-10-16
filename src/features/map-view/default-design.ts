/**
 * Default design
 *
 * The design a node gets wherever no scene has chosen one, which on the map is
 * everywhere (docs/map-view.md I5, §6.3): the node's own `defaultDesign` when
 * set, otherwise a content rule — the configured equation design for a node
 * with an equation, the titled image design for a node with an image, the
 * configured default design for the rest.
 *
 * `grow-arrange.ts` and `scene-factory-utils.ts` still answer the same question
 * with their own rules; folding them onto this one is a separate step, left
 * open at v1 because it changes existing behaviour and needs its own
 * verification.
 */

import type { DesignId, Node } from '../../core/main-types';
import { getSetting } from '../../config';

export interface NodeDesign {
  id: DesignId;
  params: Record<string, unknown>;
}

/** The one image design that also shows the title, which a map needs to stay readable. */
const IMAGE_DESIGN_ID = 'image-caption-node' as DesignId;

export function resolveDefaultDesign(node: Node): NodeDesign {
  if (node.defaultDesign) return { id: node.defaultDesign.id, params: { ...node.defaultDesign.params } };

  const properties = node.properties as Record<string, unknown> | undefined;
  if (properties?.equation) return { id: getSetting('node.equationDesign'), params: {} };
  if (properties?.imageId) return { id: IMAGE_DESIGN_ID, params: {} };
  return { id: getSetting('node.defaultDesign'), params: {} };
}
