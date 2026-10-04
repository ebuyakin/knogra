/**
 * DepartureFlyOut — the 'fly-out' departure animator (animators.ts)
 *
 * Departing nodes fly out past the viewport edge, away from the old central,
 * in cascade layers by graph distance, farthest first; their edges fade with
 * their layer or all before (`transition.departureEdgeTiming`); a departing
 * old central shrinks in place after the others have gone.
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene } from '../../../core/main-types';
import type { DepartureTimings } from '../../../config/transition-settings';
import type { DepartureAnimator, DepartureContext, Position } from './animators';

import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';
import { waitForStep } from '../step-debug';
import { bucketEdges, delay, directionBetween, graphReach, instanceEndpoints, layersByDistance, viewportEdgePoint, type Extent } from './cascade';
import { removeDeparted, zoomOutCentral } from './departure-elements';

type TimingKey = keyof DepartureTimings;

/** How far past the viewport edge a departing node flies, in graph units. */
const OFFSCREEN_MARGIN = 50;

export class DepartureFlyOut implements DepartureAnimator {
  readonly id = 'fly-out' as const;
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  async run({ nodes, edges, currentScene, targetScene, viewportCenter }: DepartureContext): Promise<void> {
    const oldCentralDeparting = !targetScene.nodes[currentScene.centralNodeId];
    const edgeTiming = getSetting('transition.departureEdgeTiming');

    // The old central's position gives every departing node its direction.
    const oldCentralNode = this.#cy.getElementById(currentScene.centralNodeId);
    const oldCentralPosition: Position = oldCentralNode.length > 0 ? oldCentralNode.position() : viewportCenter;

    if (isDebug('d_transition')) console.log(`[Transition.Departure] oldCentralDeparting: ${oldCentralDeparting}, edgeTiming: ${edgeTiming}`);
    await waitForStep('[1.0] Departure phase starting');

    if (edgeTiming === 'before') {
      // ── Mode A: Edges fade out first, then nodes cascade ──
      await this.#fadeOutEdges(edges);
      await waitForStep('[1.1] fadeOutEdges complete');

      if (oldCentralDeparting) {
        // Branch B: the old central departs after the others, shrinking in place
        const nonCentralDeparting = nodes.filter(id => id !== currentScene.centralNodeId);
        await this.#flyOutNodes(nonCentralDeparting, [], currentScene.centralNodeId, oldCentralPosition, currentScene);
        await waitForStep('[1.2.B.1] flyOutNodes cascade (non-central) complete');
        await zoomOutCentral(this.#cy, currentScene.centralNodeId);
        await waitForStep('[1.2.B.2] zoomOutCentralNode complete');
      } else {
        // Branch A: the old central stays (is shared)
        await this.#flyOutNodes(nodes, [], currentScene.centralNodeId, oldCentralPosition, currentScene);
        await waitForStep('[1.2.A] flyOutNodes cascade complete');
      }
      return;
    }

    // ── Mode B: Edges fade in parallel with nodes (cascaded per layer) ──
    if (oldCentralDeparting) {
      // Branch B: the old central departs after the others; its edges fade with it
      const centralId = currentScene.centralNodeId;
      const nonCentralDeparting = nodes.filter(id => id !== centralId);
      const centralEdges: EdgeId[] = [];
      const nonCentralEdges: EdgeId[] = [];
      for (const edgeId of edges) {
        const edge = this.#cy.getElementById(edgeId);
        if (edge.length === 0) continue;
        if (edge.source().id() === centralId || edge.target().id() === centralId) centralEdges.push(edgeId);
        else nonCentralEdges.push(edgeId);
      }

      await this.#flyOutNodes(nonCentralDeparting, nonCentralEdges, centralId, oldCentralPosition, currentScene);
      await waitForStep('[1.2.B.1] flyOutNodes cascade + edges (non-central) complete');
      await Promise.all([zoomOutCentral(this.#cy, centralId), this.#fadeOutEdges(centralEdges)]);
      await waitForStep('[1.2.B.2] zoomOutCentralNode + fadeOutEdges (central) complete');
      return;
    }

    // Branch A: the old central stays (is shared)
    await this.#flyOutNodes(nodes, edges, currentScene.centralNodeId, oldCentralPosition, currentScene);
    await waitForStep('[1.2.A] flyOutNodes cascade + edges complete');
  }

  /**
   * Stage 1.1: Fade out edges connected to departing nodes
   */
  async #fadeOutEdges(edgeIds: EdgeId[]): Promise<void> {
    if (edgeIds.length === 0) {
      if (isDebug('d_departure')) console.log('[1.1] fadeOutEdges: no edges to fade');
      return;
    }

    const { duration, delay: delayAfter } = this.#getTiming('departureEdgesFadeOut');
    if (isDebug('d_departure')) console.log(`[1.1] fadeOutEdges: ${edgeIds.length} edges, duration=${duration}ms, delay=${delayAfter}ms`);

    const edges = this.#cy.collection();
    edgeIds.forEach(id => edges.merge(this.#cy.getElementById(id)));

    edges.animate({ style: { opacity: 0 }, duration, easing: 'ease-in' });
    await delay(duration + delayAfter);

    this.#cy.remove(edges);
    if (isDebug('d_departure')) console.log('[1.1] fadeOutEdges: complete, edges removed');
  }

  /**
   * Stage 1.2.A/B.1: Fly departing nodes out in cascade layers.
   * Nodes at greater graph distance from central depart first.
   * Edges fade with their outermost endpoint's layer; edges between two
   * staying nodes have no layer and fade with the first.
   */
  async #flyOutNodes(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    centralNodeId: NodeId,
    centralPosition: Position,
    currentScene: Scene
  ): Promise<void> {
    if (nodeIds.length === 0 && edgeIds.length === 0) {
      if (isDebug('d_departure')) console.log('[1.2] flyOutNodes: nothing to do');
      return;
    }

    const [layerDuration] = getSetting('transition.departureLayerDuration');
    const [layerStagger] = getSetting('transition.departureLayerStagger');

    const endpointsOf = instanceEndpoints(this.#cy);
    const reach = graphReach(currentScene, centralNodeId, endpointsOf);
    const layers = layersByDistance(nodeIds, reach, 'farthest-first');
    const buckets = bucketEdges(edgeIds, new Set(nodeIds), reach, endpointsOf);

    if (isDebug('d_departure')) {
      const layerSummary = layers.map(layer => `d${layer.distance}:[${layer.nodes.join(',')}]`).join(' ');
      console.log(`[1.2] flyOutNodes: ${nodeIds.length} nodes, ${layers.length} layers, ${buckets.sharedToShared.length} shared-shared edges, stagger=${layerStagger}ms, duration=${layerDuration}ms | ${layerSummary}`);
    }

    const extent = this.#cy.extent();
    const layerPromises: Promise<void>[] = [];
    if (buckets.sharedToShared.length > 0) {
      layerPromises.push(this.#animateLayer([], buckets.sharedToShared, centralPosition, extent, layerDuration, 0));
    }
    layers.forEach((layer, index) => {
      layerPromises.push(this.#animateLayer(layer.nodes, buckets.byDistance.get(layer.distance) ?? [], centralPosition, extent, layerDuration, index * layerStagger));
    });
    await Promise.all(layerPromises);

    removeDeparted(this.#cy, nodeIds, edgeIds);
    if (isDebug('d_departure')) console.log('[1.2] flyOutNodes: complete, nodes+edges removed');
  }

  /** Animate one layer of nodes + edges after a stagger delay. */
  async #animateLayer(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    centralPosition: Position,
    extent: Extent,
    duration: number,
    staggerDelay: number
  ): Promise<void> {
    await delay(staggerDelay);

    for (const id of nodeIds) {
      const node = this.#cy.getElementById(id);
      if (node.length === 0) continue;
      const position = node.position();
      const targetPosition = viewportEdgePoint(position, directionBetween(centralPosition, position), extent, OFFSCREEN_MARGIN);
      node.animate({ position: targetPosition, style: { opacity: 0 }, duration, easing: 'ease-in' });
    }

    for (const edgeId of edgeIds) {
      const edge = this.#cy.getElementById(edgeId);
      if (edge.length === 0) continue;
      edge.animate({ style: { opacity: 0 }, duration, easing: 'ease-in' });
    }

    await delay(duration);
  }

  #getTiming(key: TimingKey): { duration: number; delay: number } {
    const [duration, delayAfter] = getSetting(`transition.${key}`);
    return { duration, delay: delayAfter };
  }
}
