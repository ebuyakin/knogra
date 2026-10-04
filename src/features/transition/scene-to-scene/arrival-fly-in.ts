/**
 * ArrivalFlyIn — the 'fly-in' arrival animator (animators.ts)
 *
 * Arriving nodes fly in from past the viewport edge, along the ray from the
 * new central through their target, in cascade layers by graph distance,
 * closest first; their edges fade in with their layer or all after
 * (`transition.arrivalEdgeTiming`).
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene } from '../../../core/main-types';
import type { ArrivalTimings } from '../../../config/transition-settings';
import type { TargetPositions } from '../element-classification-utils';
import type { ArrivalAnimator, ArrivalContext, Position } from './animators';

import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';
import { waitForStep } from '../step-debug';
import { bucketEdges, delay, directionBetween, graphReach, instanceEndpoints, layersByDistance, viewportEdgePoint } from './cascade';
import { addArrivingEdges, addArrivingNodes, applyArrivingEdgeStyles, presentEdges } from './arrival-elements';

type TimingKey = keyof ArrivalTimings;

/** How far past the viewport edge an arriving node starts, in graph units. */
const OFFSCREEN_MARGIN = 50;

export class ArrivalFlyIn implements ArrivalAnimator {
  readonly id = 'fly-in' as const;
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  async run({ nodes, edges, targetScene, targetPositions, viewportCenter }: ArrivalContext): Promise<void> {
    // The new central's position gives every arriving node its direction.
    const newCentralPosition = targetPositions[targetScene.centralNodeId] ?? viewportCenter;
    const edgeTiming = getSetting('transition.arrivalEdgeTiming');

    if (isDebug('d_transition')) console.log(`[Transition.Arrival] nodesToFlyIn: ${nodes.length}, edgesToFadeIn: ${edges.length}, edgeTiming: ${edgeTiming}`);
    await waitForStep('[3.0] Arrival phase starting');

    if (edgeTiming === 'after') {
      // ── Mode A: Nodes cascade fly-in, then edges fade in ──
      await this.#flyInNodes(nodes, [], targetPositions, newCentralPosition, targetScene);
      await waitForStep('[3.1] flyInNodes cascade complete');
      await this.#fadeInEdges(edges, targetScene);
      await waitForStep('[3.2] fadeInEdges complete');
      return;
    }

    // ── Mode B: Nodes cascade fly-in with edges fading per layer ──
    await this.#flyInNodes(nodes, edges, targetPositions, newCentralPosition, targetScene);
    await waitForStep('[3.1+3.2] flyInNodes cascade + edges complete');
  }

  /**
   * Stage 3.1: Fly arriving nodes in from outside viewport, cascaded by graph distance.
   * Closest nodes to central arrive first, farthest last.
   * Edges fade in with their outermost arriving endpoint's layer, so both ends
   * are visible; edges between two shared nodes have no layer and fade in with
   * the first.
   */
  async #flyInNodes(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    targetPositions: TargetPositions,
    centralPosition: Position,
    scene: Scene
  ): Promise<void> {
    // Mirror of departure-fly-out's early-return: only short-circuit when
    // BOTH arriving nodes and arriving edges are empty. Bailing on nodes alone
    // skips the shared-to-shared edges and silently drops edges whose
    // endpoints are both shared between scenes (regression of Bug 2).
    if (nodeIds.length === 0 && edgeIds.length === 0) {
      if (isDebug('d_arrival')) console.log('[3.1] flyInNodes: nothing to arrive');
      return;
    }

    const [layerDuration] = getSetting('transition.arrivalLayerDuration');
    const [layerStagger] = getSetting('transition.arrivalLayerStagger');

    const endpointsOf = instanceEndpoints(this.#cy);
    const reach = graphReach(scene, scene.centralNodeId, endpointsOf);
    const arriving = new Set(nodeIds);
    const layers = layersByDistance(nodeIds, reach, 'closest-first');
    const buckets = bucketEdges(presentEdges(this.#cy, edgeIds, arriving, endpointsOf), arriving, reach, endpointsOf);

    if (isDebug('d_arrival')) {
      const layerSummary = layers.map(layer => `d${layer.distance}:[${layer.nodes.join(',')}]`).join(' ');
      console.log(`[3.1] flyInNodes: ${nodeIds.length} nodes, ${layers.length} layers, stagger=${layerStagger}ms, duration=${layerDuration}ms | ${layerSummary}`);
    }

    const extent = this.#cy.extent();
    await addArrivingNodes(this.#cy, nodeIds, scene, targetPositions, (_nodeId, target) =>
      viewportEdgePoint(target, directionBetween(centralPosition, target), extent, OFFSCREEN_MARGIN)
    );

    const layerPromises: Promise<void>[] = [];
    layers.forEach((layer, index) => {
      layerPromises.push(this.#animateArrivalLayer(layer.nodes, buckets.byDistance.get(layer.distance) ?? [], targetPositions, scene, layerDuration, index * layerStagger));
    });
    if (buckets.sharedToShared.length > 0) {
      layerPromises.push(this.#animateArrivalLayer([], buckets.sharedToShared, targetPositions, scene, layerDuration, 0));
    }
    await Promise.all(layerPromises);

    // Ensure final positions and opacity
    for (const nodeId of nodeIds) {
      const node = this.#cy.getElementById(nodeId);
      const target = targetPositions[nodeId];
      if (node.length > 0 && target) {
        node.position(target);
        node.style('opacity', 1);
      }
    }

    if (isDebug('d_arrival')) console.log('[3.1] flyInNodes: complete');
  }

  /**
   * Stage 3.2: Fade in edges connected to arriving nodes
   */
  async #fadeInEdges(edgeIds: EdgeId[], scene: Scene): Promise<void> {
    if (edgeIds.length === 0) {
      if (isDebug('d_arrival')) console.log('[3.2] fadeInEdges: no edges to fade in');
      return;
    }

    const { duration, delay: delayAfter } = this.#getTiming('arrivalEdgesFadeIn');
    if (isDebug('d_arrival')) console.log(`[3.2] fadeInEdges: ${edgeIds.length} edges, duration=${duration}ms`);

    addArrivingEdges(this.#cy, edgeIds, scene);
    applyArrivingEdgeStyles(this.#cy, edgeIds, scene);

    const edges = this.#cy.collection();
    edgeIds.forEach(id => edges.merge(this.#cy.getElementById(id)));

    edges.animate({ style: { opacity: 1 }, duration, easing: 'ease-out' });
    await delay(duration + delayAfter);
    if (isDebug('d_arrival')) console.log('[3.2] fadeInEdges: complete');
  }

  /** Animate one arrival layer of nodes + edges after a stagger delay. */
  async #animateArrivalLayer(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    targetPositions: TargetPositions,
    scene: Scene,
    duration: number,
    staggerDelay: number
  ): Promise<void> {
    await delay(staggerDelay);

    for (const nodeId of nodeIds) {
      const node = this.#cy.getElementById(nodeId);
      const target = targetPositions[nodeId];
      if (node.length > 0 && target) {
        node.animate({ position: target, style: { opacity: 1 }, duration, easing: 'ease-out' });
      }
    }

    // This layer's edges, added invisible with their rules applied before the
    // fade so each arrives with its own geometry, not the default edge-type style.
    const addedEdgeIds = addArrivingEdges(this.#cy, edgeIds, scene);
    applyArrivingEdgeStyles(this.#cy, addedEdgeIds, scene);
    for (const edgeId of addedEdgeIds) {
      this.#cy.getElementById(edgeId).animate({ style: { opacity: 1 }, duration, easing: 'ease-out' });
    }

    await delay(duration);
  }

  #getTiming(key: TimingKey): { duration: number; delay: number } {
    const [duration, delayAfter] = getSetting(`transition.${key}`);
    return { duration, delay: delayAfter };
  }
}
