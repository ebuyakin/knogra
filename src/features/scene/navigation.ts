/**
 * Scene Navigation
 * Moves the selection between nodes by direction. Reads the live scene,
 * defers the "which node" decision to the pure directional search.
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import { isDebug } from '../../config/debug-flags';
import {
  findClosestInDirection,
  type Direction,
  type SearchCandidate
} from '../utils/pure/directional-search';

/**
 * Move the selection one step in the given direction.
 *
 * With nothing selected there is no origin to search from, so the first node
 * becomes the starting point instead. Returns the newly selected node, or null
 * when the selection did not move.
 */
export function moveSelectionDirectional(cy: Core, direction: Direction): NodeId | null {
  const selected = cy.nodes(':selected');

  if (selected.length === 0) {
    const firstNode = cy.nodes().first();
    if (firstNode.length === 0) return null;
    firstNode.select();
    return firstNode.id() as NodeId;
  }

  const currentNode = selected.first();
  const origin = currentNode.position();

  if (isDebug('d_nav')) {
    console.log(`[nav] Current: ${currentNode.id()} at (${origin.x.toFixed(0)}, ${origin.y.toFixed(0)}), direction: ${direction}`);
  }

  const candidates: SearchCandidate[] = [];
  cy.nodes().forEach(node => {
    if (node.id() === currentNode.id()) return;
    if (node.hidden()) return;
    candidates.push({ id: node.id() as NodeId, position: node.position() });
  });

  const targetId = findClosestInDirection(candidates, origin, direction);

  if (isDebug('d_nav')) console.log(`[nav] Best: ${targetId ?? 'none'}`);

  if (targetId === null) return null;

  currentNode.unselect();
  cy.getElementById(targetId).select();
  return targetId;
}
