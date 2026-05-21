/**
 * ArrivalAnimator
 * Phase 3: Handles arrival animations for scene transitions
 * - Node fly in
 * - Edge fade in
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene, Node } from '../../../core/main-types';
import type { ArrivalTimings } from '../../../config/transition-settings';

import { graphStore } from '../../../storage/graph-store';
import { getSetting } from '../../../config';
import { StyleGenerator } from '../../../styles/style-generator';
import { isDebug } from '../../../config/debug-flags';

type TimingKey = keyof ArrivalTimings;

interface Position {
  x: number;
  y: number;
}

type TargetPositions = Record<NodeId, Position>;

export class ArrivalAnimator {
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  /**
   * Stage 3.1: Fly arriving nodes in from outside viewport, cascaded by graph distance.
   * Closest nodes to central arrive first, farthest last.
   * Edges fade in with their innermost (closest) endpoint's layer.
   */
  async flyInNodes(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    targetPositions: TargetPositions,
    centralPosition: Position,
    scene: Scene
  ): Promise<void> {
    // Mirror of departure-animator's early-return: only short-circuit when
    // BOTH arriving nodes and arriving edges are empty. Bailing on nodes alone
    // skips the shared-to-shared edge branch below and silently drops edges
    // whose endpoints are both shared between scenes (regression of Bug 2).
    if (nodeIds.length === 0 && edgeIds.length === 0) {
      if (isDebug('d_arrival')) console.log('[3.1] flyInNodes: nothing to arrive');
      return;
    }

    const [layerDuration] = getSetting('transition.arrivalLayerDuration') as [number, number];
    const [layerStagger] = getSetting('transition.arrivalLayerStagger') as [number, number];

    // BFS from central node to compute graph distances (within target scene)
    const distances = this.#computeGraphDistances(scene.centralNodeId, scene);
    const arrivingSet = new Set(nodeIds);

    // Group arriving nodes by distance layer
    const layers = new Map<number, NodeId[]>();
    for (const id of nodeIds) {
      const dist = distances.get(id) ?? 999;
      if (!layers.has(dist)) layers.set(dist, []);
      layers.get(dist)!.push(id);
    }

    // Sort layers: closest first (ascending distance) — opposite of departure
    const sortedDistances = [...layers.keys()].sort((a, b) => a - b);

    if (isDebug('d_arrival')) {
      const layerSummary = sortedDistances.map(d => `d${d}:[${layers.get(d)!.join(',')}]`).join(' ');
      console.log(`[3.1] flyInNodes: ${nodeIds.length} nodes, ${sortedDistances.length} layers, stagger=${layerStagger}ms, duration=${layerDuration}ms | ${layerSummary}`);
    }

    // Assign each edge to a layer based on its arriving endpoints.
    // Non-arriving endpoints (shared/central) are already on screen → distance 0.
    // Edge appears with its farthest arriving endpoint, so both nodes are visible.
    const edgeLayerMap = new Map<number, EdgeId[]>();
    // Edges between two shared nodes — both endpoints already on screen, no
    // node-layer to attach to. Still must be added to cy (otherwise the
    // arriving edge silently vanishes and the post-transition invariant trips).
    // Faded in immediately, in parallel with the first cascade layer.
    const sharedToSharedEdges: EdgeId[] = [];
    for (const edgeId of edgeIds) {
      const edgeData = graphStore.edges.find(e => e.id === edgeId);
      if (!edgeData) continue;
      const srcArriving = arrivingSet.has(edgeData.sourceId);
      const tgtArriving = arrivingSet.has(edgeData.targetId);
      // Skip if either endpoint is not arriving AND not already in cy —
      // this handles folded nodes whose edges appear here but whose endpoints
      // won't be in cy until FoldStateHandler.apply() runs after this phase.
      const srcInCy = srcArriving || this.#cy.getElementById(edgeData.sourceId as string).length > 0;
      const tgtInCy = tgtArriving || this.#cy.getElementById(edgeData.targetId as string).length > 0;
      if (!srcInCy || !tgtInCy) continue;
      // Both endpoints shared → no arriving node to bucket with; handle separately.
      if (!srcArriving && !tgtArriving) {
        sharedToSharedEdges.push(edgeId);
        continue;
      }
      const srcDist = srcArriving ? (distances.get(edgeData.sourceId) ?? 999) : 0;
      const tgtDist = tgtArriving ? (distances.get(edgeData.targetId) ?? 999) : 0;
      // maxDist === 999: edge lies in a cluster disconnected from the central
      // node; bucket it with its endpoints (also in layer 999) so it is still added.
      const maxDist = Math.max(srcDist, tgtDist);
      if (!edgeLayerMap.has(maxDist)) edgeLayerMap.set(maxDist, []);
      edgeLayerMap.get(maxDist)!.push(edgeId);
    }

    // Get viewport bounds for starting position calculation
    const extent = this.#cy.extent();
    const margin = 50;

    // Prepare all nodes: add to Cytoscape at off-screen positions, apply styles
    const nodesToStyle: { nodeId: NodeId; nodeData: Node; design: { id: string; params: Record<string, unknown> }; scale?: number }[] = [];

    for (const nodeId of nodeIds) {
      const sceneNodeData = scene.nodes[nodeId];
      if (!sceneNodeData) {
        console.warn(`[ArrivalAnimator.flyInNodes] Node ${nodeId} not in target scene nodes`);
        continue;
      }
      const nodeData = graphStore.nodes.find(n => n.id === nodeId);
      if (!nodeData) {
        console.warn(`[ArrivalAnimator.flyInNodes] Node ${nodeId} not found in graph store`);
        continue;
      }
      const target = targetPositions[nodeId];
      if (!target) {
        console.warn(`[ArrivalAnimator.flyInNodes] No target position for ${nodeId}`);
        continue;
      }

      // Check if node already exists in cy (indicates a classification bug)
      const existingEl = this.#cy.getElementById(nodeId as string);
      if (existingEl.length > 0) {
        const display = existingEl.style('display');
        console.warn(`[d_fold] ArrivalAnimator: node ${nodeId} already in cy! display=${display}. Skipping add.`);
        continue;
      }

      // Calculate off-screen start position
      let dx = target.x - centralPosition.x;
      let dy = target.y - centralPosition.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) { dx = 0; dy = -1; }
      else { dx /= dist; dy /= dist; }
      const startPos = this.#findViewportEdgePoint(target, { x: dx, y: dy }, extent, margin);

      // Add node at start position, invisible
      const nodeEl = this.#cy.add({
        group: 'nodes',
        data: { ...nodeData, id: nodeId, design: sceneNodeData.design, scale: sceneNodeData.scale },
        position: startPos
      });
      nodeEl.style('opacity', 0);

      nodesToStyle.push({ nodeId, nodeData, design: sceneNodeData.design, scale: sceneNodeData.scale });
    }

    // Apply proper styles to all arriving nodes at once
    if (nodesToStyle.length > 0) {
      const themeId = scene.themeId || 'dark';
      const currentStylesheet = (this.#cy.style() as any).json();
      const updatedStylesheet = await StyleGenerator.addNodesToStylesheet(currentStylesheet, nodesToStyle, themeId);
      this.#cy.style().fromJson(updatedStylesheet).update();
    }

    // Launch layers with stagger — closest first
    const layerPromises: Promise<void>[] = [];
    for (let i = 0; i < sortedDistances.length; i++) {
      const dist = sortedDistances[i];
      const layerNodeIds = layers.get(dist)!;
      const layerEdgeIds = edgeLayerMap.get(dist) ?? [];
      const staggerDelay = i * layerStagger;

      layerPromises.push(
        this.#animateArrivalLayer(layerNodeIds, layerEdgeIds, targetPositions, layerDuration, staggerDelay)
      );
    }

    // Fade in shared-to-shared edges in parallel with the first layer.
    if (sharedToSharedEdges.length > 0) {
      layerPromises.push(this.#animateArrivalLayer([], sharedToSharedEdges, targetPositions, layerDuration, 0));
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
  async fadeInEdges(edgeIds: EdgeId[]): Promise<void> {
    if (edgeIds.length === 0) {
      if (isDebug('d_arrival')) console.log('[3.2] fadeInEdges: no edges to fade in');
      return;
    }
    
    const { duration, delay } = this.#getTiming('arrivalEdgesFadeIn');
    if (isDebug('d_arrival')) console.log(`[3.2] fadeInEdges: ${edgeIds.length} edges, duration=${duration}ms`);
    
    // Add edges (invisible) — they don't exist in Cytoscape yet
    edgeIds.forEach(edgeId => {
      if (this.#cy.getElementById(edgeId).length > 0) return;
      
      const edgeData = graphStore.edges.find(e => e.id === edgeId);
      if (!edgeData) {
        console.warn(`[ArrivalAnimator.fadeInEdges] Edge ${edgeId} not found in graph store`);
        return;
      }
      
      const edgeEl = this.#cy.add({
        group: 'edges',
        data: {
          ...edgeData,
          id: edgeId,
          source: edgeData.sourceId,
          target: edgeData.targetId
        }
      });
      edgeEl.style('opacity', 0);
    });
    
    // Animate to visible
    const edges = this.#cy.collection();
    edgeIds.forEach(id => edges.merge(this.#cy.getElementById(id)));
    
    edges.animate({ style: { opacity: 1 }, duration, easing: 'ease-out' });
    await this.#delay(duration + delay);
    if (isDebug('d_arrival')) console.log('[3.2] fadeInEdges: complete');
  }

  // ==========================================================================
  // PRIVATE: CASCADE HELPERS
  // ==========================================================================

  /** Animate one arrival layer of nodes + edges after a stagger delay. */
  async #animateArrivalLayer(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    targetPositions: TargetPositions,
    duration: number,
    staggerDelay: number
  ): Promise<void> {
    if (staggerDelay > 0) {
      await this.#delay(staggerDelay);
    }

    // Animate nodes flying in to target positions
    for (const nodeId of nodeIds) {
      const node = this.#cy.getElementById(nodeId);
      const target = targetPositions[nodeId];
      if (node.length > 0 && target) {
        node.animate({ position: target, style: { opacity: 1 }, duration, easing: 'ease-out' });
      }
    }

    // Add and fade in edges (parallel with their layer's nodes)
    for (const edgeId of edgeIds) {
      if (this.#cy.getElementById(edgeId).length > 0) continue;
      const edgeData = graphStore.edges.find(e => e.id === edgeId);
      if (!edgeData) continue;
      const edgeEl = this.#cy.add({
        group: 'edges',
        data: { ...edgeData, id: edgeId, source: edgeData.sourceId, target: edgeData.targetId }
      });
      edgeEl.style('opacity', 0);
      edgeEl.animate({ style: { opacity: 1 }, duration, easing: 'ease-out' });
    }

    await this.#delay(duration);
  }

  /**
   * BFS from central node to compute graph distances within the scene.
   * Only traverses edges present in the scene.
   */
  #computeGraphDistances(centralNodeId: NodeId, scene: Scene): Map<NodeId, number> {
    const distances = new Map<NodeId, number>();
    distances.set(centralNodeId, 0);

    // Build adjacency from scene edges
    const adjacency = new Map<NodeId, NodeId[]>();
    for (const edgeId of Object.keys(scene.edges)) {
      const edgeData = graphStore.edges.find(e => e.id === edgeId);
      if (!edgeData) continue;
      const src = edgeData.sourceId;
      const tgt = edgeData.targetId;
      if (!adjacency.has(src)) adjacency.set(src, []);
      if (!adjacency.has(tgt)) adjacency.set(tgt, []);
      adjacency.get(src)!.push(tgt);
      adjacency.get(tgt)!.push(src);
    }

    // BFS
    const queue: NodeId[] = [centralNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDist = distances.get(current)!;
      for (const neighbor of (adjacency.get(current) ?? [])) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, currentDist + 1);
          queue.push(neighbor);
        }
      }
    }

    return distances;
  }

  // ==========================================================================
  // PRIVATE UTILITIES
  // ==========================================================================

  #getTiming(key: TimingKey): { duration: number; delay: number } {
    const [duration, delay] = getSetting(`transition.${key}`);
    return { duration, delay };
  }

  #delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Find where a ray from a point in a given direction exits the viewport
   * Returns a point just outside the viewport edge
   */
  #findViewportEdgePoint(
    origin: Position,
    direction: { x: number; y: number },
    extent: { x1: number; y1: number; x2: number; y2: number },
    margin: number
  ): Position {
    // Extend viewport bounds by margin
    const left = extent.x1 - margin;
    const right = extent.x2 + margin;
    const top = extent.y1 - margin;
    const bottom = extent.y2 + margin;
    
    // Find intersection with each edge and take the closest positive t
    let minT = Infinity;
    
    // Left edge (x = left): t = (left - origin.x) / direction.x
    if (direction.x !== 0) {
      const t = (left - origin.x) / direction.x;
      if (t > 0) minT = Math.min(minT, t);
    }
    
    // Right edge (x = right)
    if (direction.x !== 0) {
      const t = (right - origin.x) / direction.x;
      if (t > 0) minT = Math.min(minT, t);
    }
    
    // Top edge (y = top)
    if (direction.y !== 0) {
      const t = (top - origin.y) / direction.y;
      if (t > 0) minT = Math.min(minT, t);
    }
    
    // Bottom edge (y = bottom)
    if (direction.y !== 0) {
      const t = (bottom - origin.y) / direction.y;
      if (t > 0) minT = Math.min(minT, t);
    }
    
    // If no intersection found (shouldn't happen), fallback to origin offset
    if (minT === Infinity) {
      return {
        x: origin.x + direction.x * 500,
        y: origin.y + direction.y * 500
      };
    }
    
    // Return point at intersection
    return {
      x: origin.x + direction.x * minT,
      y: origin.y + direction.y * minT
    };
  }
}
