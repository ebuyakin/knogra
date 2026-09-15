/**
 * Single-node placement, read from the live scene.
 *
 * The geometry lives in the pure `placeSingleNode`; this is the step that feeds
 * it from Cytoscape — the reference node's box, every other node as an
 * obstacle, the visible viewport. Graph (add child/parent, shelf create) and
 * Scene (include existing, node manager) share this one reading instead of
 * carrying a copy each. Features may not import each other (architecture §4.2);
 * a cy utility is the sanctioned meeting point.
 *
 * The new node's size is passed in, not computed here: size is a style outcome
 * (StyleGenerator.measureNode) and cy utilities do not reach into Styles.
 *
 * Implements docs/node-placement.md §4 and §9.
 */

import type { Core, NodeSingular } from 'cytoscape';
import { placeSingleNode, type Position, type SizedObstacle } from '../pure/position-expansion';

/** Rendered box of a node, after scale. */
export interface NodeSize {
  width: number;
  height: number;
}

/** Bounding-circle radius of a box: contains its corners in every direction. */
function boundingRadius(width: number, height: number): number {
  return 0.5 * Math.hypot(width, height);
}

/**
 * Position for one new node next to `reference`, clear of every other node in
 * the scene and inside the visible viewport.
 *
 * @param reference   The node the new one attaches to; must be in the scene.
 * @param newNodeSize The new node's rendered box, from StyleGenerator.measureNode.
 * @param spacing     The `node.spacing` setting; read by the caller, since cy
 *                    utilities do not read config.
 */
export function placeSingleNodeInScene(
  cy: Core,
  reference: NodeSingular,
  newNodeSize: NodeSize,
  spacing: number
): Position {
  const referenceBox = reference.boundingBox();
  const obstacles: SizedObstacle[] = cy.nodes()
    .filter(n => n.id() !== reference.id())
    .map((n: NodeSingular) => {
      const box = n.boundingBox();
      return { pos: n.position(), half: boundingRadius(box.w, box.h) };
    });

  return placeSingleNode(
    reference.position(),
    boundingRadius(referenceBox.w, referenceBox.h),
    boundingRadius(newNodeSize.width, newNodeSize.height),
    obstacles,
    spacing,
    cy.extent()
  );
}
