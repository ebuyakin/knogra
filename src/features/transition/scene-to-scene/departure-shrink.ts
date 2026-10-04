/**
 * DepartureShrink — the 'shrink' departure animator (animators.ts)
 *
 * A departing node shrinks into its parent: it slides to the current position
 * of the neighbour on its path back to the central (cascade.graphReach),
 * fading out, its edges fading with it; a node with no path fades in place.
 * Layers farthest first, one after another, so a parent is still there when
 * its children fold into it; the departure layer duration times each layer,
 * and the stagger and edge timing settings are fly-out's. A departing old
 * central shrinks in place after the others, as under fly-out. The mirror of
 * 'grow'; on leaving the map it folds the landmarks the target lacks into
 * the focus (map-view.md §8).
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId } from '../../../core/main-types';
import type { DepartureAnimator, DepartureContext } from './animators';

import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';
import { waitForStep } from '../step-debug';
import { bucketEdges, graphReach, instanceEndpoints, layersByDistance, type Reach } from './cascade';
import { fadeOutEdges, removeDeparted, zoomOutCentral } from './departure-elements';

export class DepartureShrink implements DepartureAnimator {
  readonly id = 'shrink' as const;
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  async run({ nodes, edges, currentScene, targetScene }: DepartureContext): Promise<void> {
    if (nodes.length === 0 && edges.length === 0) {
      if (isDebug('d_departure')) console.log('[1.2] shrink: nothing to depart');
      return;
    }

    const [layerDuration] = getSetting('transition.departureLayerDuration');
    const centralId = currentScene.centralNodeId;
    const centralDeparting = !targetScene.nodes[centralId] && nodes.includes(centralId);
    const others = centralDeparting ? nodes.filter(id => id !== centralId) : nodes;

    const endpointsOf = instanceEndpoints(this.#cy);
    const reach = graphReach(currentScene, centralId, endpointsOf);
    const layers = layersByDistance(others, reach, 'farthest-first');
    const buckets = bucketEdges(edges, new Set(nodes), reach, endpointsOf);
    // Edges whose only departing endpoint is the central sit at distance 0, which no layer has; they fade with the central.
    const centralEdges = centralDeparting ? buckets.byDistance.get(0) ?? [] : [];

    if (isDebug('d_departure') || isDebug('d_transition')) {
      const layerSummary = layers.map(layer => `d${layer.distance}:[${layer.nodes.join(',')}]`).join(' ');
      console.log(`[Transition.Departure] shrink: ${nodes.length} nodes, ${layers.length} layers, central departing=${centralDeparting}, duration=${layerDuration}ms per layer | ${layerSummary}`);
    }
    await waitForStep('[1.0] Departure phase starting (shrink)');

    // Edges between two nodes that stay fade with the first layer; the layers themselves run one after another.
    const sharedToShared = fadeOutEdges(this.#cy, buckets.sharedToShared, layerDuration);
    for (const layer of layers) {
      await this.#shrinkLayer(layer.nodes, buckets.byDistance.get(layer.distance) ?? [], reach, layerDuration);
    }
    await sharedToShared;
    if (centralDeparting) {
      await Promise.all([zoomOutCentral(this.#cy, centralId), fadeOutEdges(this.#cy, centralEdges, layerDuration)]);
    }

    removeDeparted(this.#cy, nodes, edges);
    await waitForStep('[1.2] shrink cascade complete');
  }

  /** One layer: its nodes slide into their parents' current positions fading out, its edges fade alongside. */
  async #shrinkLayer(nodeIds: NodeId[], edgeIds: EdgeId[], reach: Map<NodeId, Reach>, duration: number): Promise<void> {
    for (const nodeId of nodeIds) {
      const node = this.#cy.getElementById(nodeId);
      if (node.length === 0) continue;
      const parentId = reach.get(nodeId)?.parent;
      const parent = parentId ? this.#cy.getElementById(parentId) : null;
      // A copy: the parent's position object is the parent's own.
      const into = parent && parent.length > 0 ? { ...parent.position() } : { ...node.position() };
      node.animate({ position: into, style: { opacity: 0 }, duration, easing: 'ease-in' });
    }
    await fadeOutEdges(this.#cy, edgeIds, duration);
  }
}
