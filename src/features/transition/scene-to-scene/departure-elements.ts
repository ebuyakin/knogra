/**
 * Departing elements
 *
 * What every departure animator does around its own motion: shrink a
 * departing old central in place, fade a set of edges, remove what has left.
 * A library a departure animator may use, like cascade.ts; not part of the
 * interface (docs/scene-transitions.md §4.2).
 */

import type { Core } from 'cytoscape';
import type { EdgeId, NodeId } from '../../../core/main-types';
import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';
import { delay } from './cascade';

/** A departing old central shrinks to a fifth of its size in place and fades, on `transition.departureCentralZoomOut`; removed afterwards. */
export async function zoomOutCentral(cy: Core, nodeId: NodeId): Promise<void> {
  const node = cy.getElementById(nodeId);
  if (node.length === 0) {
    if (isDebug('d_departure')) console.log(`[1.2.B.2] zoomOutCentralNode: node ${nodeId} not found`);
    return;
  }

  const [duration, delayAfter] = getSetting('transition.departureCentralZoomOut');
  if (isDebug('d_departure')) console.log(`[1.2.B.2] zoomOutCentralNode: ${nodeId}, duration=${duration}ms`);

  node.animate(
    { style: { opacity: 0, width: node.width() * 0.2, height: node.height() * 0.2 } },
    { duration, easing: 'ease-in' }
  );
  await delay(duration + delayAfter);

  cy.remove(node);
  if (isDebug('d_departure')) console.log('[1.2.B.2] zoomOutCentralNode: complete, node removed');
}

/** Fade the given edges out over `duration`; they stay in the instance for the caller to remove. */
export function fadeOutEdges(cy: Core, edgeIds: EdgeId[], duration: number): Promise<void> {
  for (const edgeId of edgeIds) {
    const edge = cy.getElementById(edgeId);
    if (edge.length > 0) edge.animate({ style: { opacity: 0 }, duration, easing: 'ease-in' });
  }
  return delay(duration);
}

/** Remove the departed nodes and edges in one go; ids no longer in the instance are ignored. */
export function removeDeparted(cy: Core, nodeIds: NodeId[], edgeIds: EdgeId[]): void {
  const departed = cy.collection();
  for (const id of [...nodeIds, ...edgeIds]) departed.merge(cy.getElementById(id));
  cy.remove(departed);
}
