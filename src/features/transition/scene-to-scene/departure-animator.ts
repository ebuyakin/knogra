/**
 * DepartureAnimator
 * Phase 1: Handles departure animations for scene transitions
 * - Edge fade out
 * - Node fly out
 * - Central node zoom out
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene } from '../../../core/main-types';
import type { DepartureTimings } from '../../../config/transition-settings';

import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';

type TimingKey = keyof DepartureTimings;

interface Position {
  x: number;
  y: number;
}

export class DepartureAnimator {
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  /**
   * Stage 1.1: Fade out edges connected to departing nodes
   */
  async fadeOutEdges(edgeIds: EdgeId[]): Promise<void> {
    if (edgeIds.length === 0) {
      if (isDebug('d_departure')) console.log('[1.1] fadeOutEdges: no edges to fade');
      return;
    }
    
    const { duration, delay } = this.#getTiming('departureEdgesFadeOut');
    if (isDebug('d_departure')) console.log(`[1.1] fadeOutEdges: ${edgeIds.length} edges, duration=${duration}ms, delay=${delay}ms`);
    
    const edges = this.#cy.collection();
    edgeIds.forEach(id => edges.merge(this.#cy.getElementById(id)));
    
    edges.animate({ style: { opacity: 0 }, duration, easing: 'ease-in' });
    await this.#delay(duration + delay);
    
    // Remove edges after animation
    this.#cy.remove(edges);
    if (isDebug('d_departure')) console.log('[1.1] fadeOutEdges: complete, edges removed');
  }

  /**
   * Stage 1.2.A/B.1: Fly departing nodes out in cascade layers.
   * Nodes at greater graph distance from central depart first.
   * Edges fade with their outermost endpoint's layer.
   */
  async flyOutNodes(
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

    const [layerDuration] = getSetting('transition.departureLayerDuration') as [number, number];
    const [layerStagger] = getSetting('transition.departureLayerStagger') as [number, number];

    // BFS from central node to compute graph distances (within current scene)
    const distances = this.#computeGraphDistances(centralNodeId, currentScene);
    const departingSet = new Set(nodeIds);

    // Group departing nodes by distance layer
    const layers = new Map<number, NodeId[]>();
    for (const id of nodeIds) {
      const dist = distances.get(id) ?? 999;
      if (!layers.has(dist)) layers.set(dist, []);
      layers.get(dist)!.push(id);
    }

    // Sort layers: farthest first (descending distance)
    const sortedDistances = [...layers.keys()].sort((a, b) => b - a);

    // Assign each edge to a layer.
    //   - Anchored edges (≥1 endpoint departing): layer = outermost endpoint's distance.
    //   - Shared-to-shared edges (both endpoints stay in cy): fade immediately
    //     in parallel with the first cascade layer; otherwise they'd pop out
    //     abruptly at the end (or, with zero departing nodes, never fade at all).
    const sharedToSharedEdges: EdgeId[] = [];
    const edgeLayerMap = new Map<number, EdgeId[]>();
    for (const edgeId of edgeIds) {
      const edge = this.#cy.getElementById(edgeId);
      if (edge.length === 0) continue;
      const srcId = edge.source().id() as NodeId;
      const tgtId = edge.target().id() as NodeId;
      const srcDist = departingSet.has(srcId) ? (distances.get(srcId) ?? 999) : -1;
      const tgtDist = departingSet.has(tgtId) ? (distances.get(tgtId) ?? 999) : -1;
      const maxDist = Math.max(srcDist, tgtDist);
      if (maxDist < 0) {
        sharedToSharedEdges.push(edgeId);
      } else {
        if (!edgeLayerMap.has(maxDist)) edgeLayerMap.set(maxDist, []);
        edgeLayerMap.get(maxDist)!.push(edgeId);
      }
    }

    if (isDebug('d_departure')) {
      const layerSummary = sortedDistances.map(d => `d${d}:[${layers.get(d)!.join(',')}]`).join(' ');
      console.log(`[1.2] flyOutNodes: ${nodeIds.length} nodes, ${sortedDistances.length} layers, ${sharedToSharedEdges.length} shared-shared edges, stagger=${layerStagger}ms, duration=${layerDuration}ms | ${layerSummary}`);
    }

    // Get viewport bounds for fly-out target calculation
    const extent = this.#cy.extent();
    const margin = 50;

    // Launch layers with stagger — each layer is a Promise
    const layerPromises: Promise<void>[] = [];

    // Layer for shared→shared edges (no node anchor): fade immediately, in
    // parallel with the first cascade layer. Mirrors arrival-animator's handling.
    if (sharedToSharedEdges.length > 0) {
      layerPromises.push(
        this.#animateLayer(
          [], sharedToSharedEdges, centralPosition, extent, margin,
          layerDuration, 0
        )
      );
    }

    for (let i = 0; i < sortedDistances.length; i++) {
      const dist = sortedDistances[i];
      const layerNodeIds = layers.get(dist)!;
      const layerEdgeIds = edgeLayerMap.get(dist) ?? [];
      const staggerDelay = i * layerStagger;

      const layerPromise = this.#animateLayer(
        layerNodeIds, layerEdgeIds, centralPosition, extent, margin,
        layerDuration, staggerDelay
      );
      layerPromises.push(layerPromise);
    }

    // Wait for all layers to finish
    await Promise.all(layerPromises);

    // Remove all departed nodes and edges
    const toRemove = this.#cy.collection();
    nodeIds.forEach(id => toRemove.merge(this.#cy.getElementById(id)));
    edgeIds.forEach(id => toRemove.merge(this.#cy.getElementById(id)));
    this.#cy.remove(toRemove);

    if (isDebug('d_departure')) console.log('[1.2] flyOutNodes: complete, nodes+edges removed');
  }

  /**
   * Stage 1.2.B.2: Zoom out central node (shrink at position)
   * Used when old central is departing
   */
  async zoomOutCentralNode(nodeId: NodeId): Promise<void> {
    const node = this.#cy.getElementById(nodeId);
    if (node.length === 0) {
      if (isDebug('d_departure')) console.log(`[1.2.B.2] zoomOutCentralNode: node ${nodeId} not found`);
      return;
    }
    
    const { duration, delay } = this.#getTiming('departureCentralZoomOut');
    if (isDebug('d_departure')) console.log(`[1.2.B.2] zoomOutCentralNode: ${nodeId}, duration=${duration}ms`);
    
    // Get current dimensions
    const currentWidth = node.width();
    const currentHeight = node.height();
    
    // Shrink to 20% of current size while fading out
    const targetWidth = currentWidth * 0.2;
    const targetHeight = currentHeight * 0.2;
    
    node.animate({
      style: {
        opacity: 0,
        width: targetWidth,
        height: targetHeight
      }
    }, {
      duration,
      easing: 'ease-in'
    });
    
    await this.#delay(duration + delay);
    
    // Remove the node after animation
    this.#cy.remove(node);
    if (isDebug('d_departure')) console.log('[1.2.B.2] zoomOutCentralNode: complete, node removed');
  }

  // ==========================================================================
  // PRIVATE: CASCADE HELPERS
  // ==========================================================================

  /** Animate one layer of nodes + edges after a stagger delay. */
  async #animateLayer(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    centralPosition: Position,
    extent: { x1: number; y1: number; x2: number; y2: number },
    margin: number,
    duration: number,
    staggerDelay: number
  ): Promise<void> {
    if (staggerDelay > 0) {
      await this.#delay(staggerDelay);
    }

    // Animate nodes flying out
    for (const id of nodeIds) {
      const node = this.#cy.getElementById(id);
      if (node.length === 0) continue;

      const pos = node.position();
      let dx = pos.x - centralPosition.x;
      let dy = pos.y - centralPosition.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1) { dx = 0; dy = -1; }
      else { dx /= dist; dy /= dist; }

      const targetPos = this.#findViewportEdgePoint(pos, { x: dx, y: dy }, extent, margin);
      node.animate({ position: targetPos, style: { opacity: 0 }, duration, easing: 'ease-in' });
    }

    // Animate edges fading out (in parallel with their layer's nodes)
    for (const edgeId of edgeIds) {
      const edge = this.#cy.getElementById(edgeId);
      if (edge.length === 0) continue;
      edge.animate({ style: { opacity: 0 }, duration, easing: 'ease-in' });
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
    const sceneEdgeIds = Object.keys(scene.edges);
    for (const edgeId of sceneEdgeIds) {
      const edgeData = scene.edges[edgeId];
      if (!edgeData) continue;
      // Scene edges store sourceId/targetId — look them up from graphStore
      const edge = this.#cy.getElementById(edgeId);
      if (edge.length === 0) continue;
      const src = edge.source().id() as NodeId;
      const tgt = edge.target().id() as NodeId;
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
      const neighbors = adjacency.get(current) ?? [];
      for (const neighbor of neighbors) {
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
