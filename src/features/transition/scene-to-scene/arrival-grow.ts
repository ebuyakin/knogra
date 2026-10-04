/**
 * ArrivalGrow — the 'grow' arrival animator (animators.ts)
 *
 * An arriving node grows out of its parent: it starts at the target position
 * of the neighbour on its path back to the central (cascade.graphReach),
 * invisible, and slides to its own place fading in; a node with no path grows
 * out of the central. Layers closest first, one after another, each starting
 * when the previous has landed, so a parent is in place when its children set
 * out; the arrival layer duration times each layer, and the stagger setting
 * is fly-in's, since a fixed stagger would launch children from a parent
 * still in flight. Edges fade in with their layer. On the map's scene this is
 * the re-focus's arriving move: landmarks out of the focus, markers out of
 * their landmarks (map-view.md §5.2, §8). The edge timing setting is fly-in's
 * too; here edges always ride with their layer.
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene } from '../../../core/main-types';
import type { TargetPositions } from '../element-classification-utils';
import type { ArrivalAnimator, ArrivalContext, Position } from './animators';

import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';
import { waitForStep } from '../step-debug';
import { bucketEdges, delay, graphReach, instanceEndpoints, layersByDistance, type Reach } from './cascade';
import { addArrivingEdges, addArrivingNodes, applyArrivingEdgeStyles, presentEdges } from './arrival-elements';

export class ArrivalGrow implements ArrivalAnimator {
  readonly id = 'grow' as const;
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  async run({ nodes, edges, targetScene, targetPositions, viewportCenter }: ArrivalContext): Promise<void> {
    if (nodes.length === 0 && edges.length === 0) {
      if (isDebug('d_arrival')) console.log('[3.1] grow: nothing to arrive');
      return;
    }

    const [layerDuration] = getSetting('transition.arrivalLayerDuration');

    const endpointsOf = instanceEndpoints(this.#cy);
    const reach = graphReach(targetScene, targetScene.centralNodeId, endpointsOf);
    const arriving = new Set(nodes);
    const layers = layersByDistance(nodes, reach, 'closest-first');
    const buckets = bucketEdges(presentEdges(this.#cy, edges, arriving, endpointsOf), arriving, reach, endpointsOf);
    const centralPosition = targetPositions[targetScene.centralNodeId] ?? viewportCenter;

    if (isDebug('d_arrival') || isDebug('d_transition')) {
      const layerSummary = layers.map(layer => `d${layer.distance}:[${layer.nodes.join(',')}]`).join(' ');
      console.log(`[Transition.Arrival] grow: ${nodes.length} nodes, ${layers.length} layers, duration=${layerDuration}ms per layer | ${layerSummary}`);
    }
    await waitForStep('[3.0] Arrival phase starting (grow)');

    await addArrivingNodes(this.#cy, nodes, targetScene, targetPositions, nodeId => originOf(nodeId, reach, targetPositions, centralPosition));

    // Edges between two nodes already in place fade in with the first layer; the layers themselves run one after another.
    const sharedToShared = buckets.sharedToShared.length > 0
      ? this.#growLayer([], buckets.sharedToShared, targetPositions, targetScene, layerDuration)
      : Promise.resolve();
    for (const layer of layers) {
      await this.#growLayer(layer.nodes, buckets.byDistance.get(layer.distance) ?? [], targetPositions, targetScene, layerDuration);
    }
    await sharedToShared;

    // Snap to the exact final state so rounding never leaves a node a pixel off
    for (const nodeId of nodes) {
      const node = this.#cy.getElementById(nodeId);
      const target = targetPositions[nodeId];
      if (node.length > 0 && target) {
        node.position(target);
        node.style('opacity', 1);
      }
    }
    await waitForStep('[3.1] grow cascade + edges complete');
  }

  /** One layer: its nodes slide from their parents to their places fading in, its edges fade in alongside. */
  async #growLayer(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    targetPositions: TargetPositions,
    scene: Scene,
    duration: number
  ): Promise<void> {
    for (const nodeId of nodeIds) {
      const node = this.#cy.getElementById(nodeId);
      const target = targetPositions[nodeId];
      if (node.length > 0 && target) {
        node.animate({ position: target, style: { opacity: 1 }, duration, easing: 'ease-out' });
      }
    }

    const addedEdgeIds = addArrivingEdges(this.#cy, edgeIds, scene);
    applyArrivingEdgeStyles(this.#cy, addedEdgeIds, scene);
    for (const edgeId of addedEdgeIds) {
      this.#cy.getElementById(edgeId).animate({ style: { opacity: 1 }, duration, easing: 'ease-out' });
    }

    await delay(duration);
  }
}

/** Where a node grows from: its parent's target position, or the central's when it has no parent. */
function originOf(nodeId: NodeId, reach: Map<NodeId, Reach>, targetPositions: TargetPositions, centralPosition: Position): Position {
  const parent = reach.get(nodeId)?.parent;
  const origin = parent ? targetPositions[parent] : undefined;
  return origin ?? centralPosition;
}
