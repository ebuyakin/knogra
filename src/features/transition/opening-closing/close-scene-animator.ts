/**
 * CloseSceneAnimator
 * Animation primitives for closing a scene (reverse of OpenSceneAnimator).
 * 
 * Phase 1: Peripheral nodes + edges fly out away from central node
 * Phase 2: Central node shrinks/fades + background fades out
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene } from '../../../core/main-types';
import type { BackgroundRenderer } from '../../../background/background-renderer';
import type { CloseSceneTimings } from '../../../config/transition-settings';

import { graphStore } from '../../../storage/graph-store';
import { getSetting } from '../../../config';

type CloseStageKey = keyof CloseSceneTimings;

interface Position {
  x: number;
  y: number;
}

export class CloseSceneAnimator {
  #cy: Core;
  #backgroundRenderer: BackgroundRenderer;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;
    this.#backgroundRenderer = backgroundRenderer;
  }

  // ==========================================================================
  // PHASE 1: Peripheral nodes + edges fly out
  // ==========================================================================

  /**
   * Fly out all non-central nodes away from central, cascaded by graph distance.
   * Farthest nodes depart first, closest last — scene "unravels" from periphery.
   * Edges fade with their outermost endpoint's layer.
   */
  async flyOutNodesAndEdges(
    centralNodeId: NodeId,
    scene: Scene
  ): Promise<void> {
    const centralNode = this.#cy.getElementById(centralNodeId);
    if (centralNode.length === 0) return;

    const [layerDuration] = getSetting('transition.closeLayerDuration') as [number, number];
    const [layerStagger] = getSetting('transition.closeLayerStagger') as [number, number];

    const centralPos = centralNode.position();
    const extent = this.#cy.extent();
    const margin = 50;

    // Collect peripheral nodes (non-central, non-ghost)
    const peripheralNodes = this.#cy.nodes().filter(
      n => n.id() !== centralNodeId && !n.hasClass('ghost')
    );

    if (peripheralNodes.length === 0) return;

    // BFS from central node to compute graph distances
    const distances = this.#computeGraphDistances(centralNodeId, scene);

    // Group peripheral nodes by distance layer
    const layers = new Map<number, NodeId[]>();
    peripheralNodes.forEach(node => {
      const nodeId = node.id() as NodeId;
      const dist = distances.get(nodeId) ?? 999;
      if (!layers.has(dist)) layers.set(dist, []);
      layers.get(dist)!.push(nodeId);
    });

    // Sort layers: farthest first (descending distance)
    const sortedDistances = [...layers.keys()].sort((a, b) => b - a);

    // Collect all visible edges and assign to layers by outermost endpoint
    const allEdges = this.#cy.edges().filter(e => !e.hasClass('ghost'));
    const peripheralSet = new Set<string>(peripheralNodes.map(n => n.id()));
    const edgeLayerMap = new Map<number, EdgeId[]>();

    allEdges.forEach(edge => {
      const edgeId = edge.id() as EdgeId;
      const srcId = edge.source().id() as NodeId;
      const tgtId = edge.target().id() as NodeId;
      const srcDist = peripheralSet.has(srcId) ? (distances.get(srcId) ?? 999) : 0;
      const tgtDist = peripheralSet.has(tgtId) ? (distances.get(tgtId) ?? 999) : 0;
      const maxDist = Math.max(srcDist, tgtDist);
      if (!edgeLayerMap.has(maxDist)) edgeLayerMap.set(maxDist, []);
      edgeLayerMap.get(maxDist)!.push(edgeId);
    });

    // Launch layers with stagger — farthest first
    const layerPromises: Promise<void>[] = [];
    for (let i = 0; i < sortedDistances.length; i++) {
      const dist = sortedDistances[i];
      const layerNodeIds = layers.get(dist)!;
      const layerEdgeIds = edgeLayerMap.get(dist) ?? [];
      const staggerDelay = i * layerStagger;

      layerPromises.push(
        this.#animateDepartureLayer(layerNodeIds, layerEdgeIds, centralPos, extent, margin, layerDuration, staggerDelay)
      );
    }

    // Also fade central-connected edges (distance 0) with the last layer
    const centralEdges = edgeLayerMap.get(0) ?? [];
    if (centralEdges.length > 0) {
      const lastStagger = sortedDistances.length * layerStagger;
      layerPromises.push(this.#fadeOutEdges(centralEdges, layerDuration, lastStagger));
    }

    await Promise.all(layerPromises);

    // Remove all peripheral nodes and edges
    peripheralNodes.remove();
    allEdges.remove();
  }

  // ==========================================================================
  // PHASE 2: Central node shrinks/fades + background fades
  // ==========================================================================

  /**
   * Shrink and fade out the central node while fading the background.
   */
  async fadeOutCentralAndBackground(centralNodeId: NodeId): Promise<void> {
    const { duration, delay } = this.#getStageTiming('closeCentralFadeOut');

    const centralNode = this.#cy.getElementById(centralNodeId);
    const canvas = this.#getBackgroundCanvas();

    const promises: Promise<void>[] = [];

    // Central node: shrink to 20% + fade out
    if (centralNode.length > 0) {
      const currentWidth = centralNode.numericStyle('width');
      const currentHeight = centralNode.numericStyle('height');

      const targetWidth = currentWidth * 0.2;
      const targetHeight = currentHeight * 0.2;

      const p = new Promise<void>(resolve => {
        centralNode.animate({
          style: {
            opacity: 0,
            width: targetWidth,
            height: targetHeight
          },
          duration,
          easing: 'ease-in',
          complete: () => resolve()
        });
      });
      promises.push(p);
    }

    // Background: fade out
    if (canvas) {
      promises.push(this.#animateCanvasOpacity(canvas, 0, duration));
    }

    await Promise.all(promises);

    // Remove central node
    if (centralNode.length > 0) {
      centralNode.remove();
    }

    await this.#delay(delay);
  }

  // ==========================================================================
  // PRIVATE: CASCADE HELPERS
  // ==========================================================================

  /** Animate one departure layer of nodes + edges after a stagger delay. */
  async #animateDepartureLayer(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    centralPos: Position,
    extent: { x1: number; y1: number; x2: number; y2: number },
    margin: number,
    duration: number,
    staggerDelay: number
  ): Promise<void> {
    if (staggerDelay > 0) {
      await this.#delay(staggerDelay);
    }

    for (const nodeId of nodeIds) {
      const node = this.#cy.getElementById(nodeId);
      if (node.length === 0) continue;

      const pos = node.position();
      let dx = pos.x - centralPos.x;
      let dy = pos.y - centralPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) { dx = 0; dy = -1; }
      else { dx /= dist; dy /= dist; }

      const exitPos = this.#findViewportEdgePoint(pos, { x: dx, y: dy }, extent, margin);
      node.animate({ position: exitPos, style: { opacity: 0 }, duration, easing: 'ease-in' });
    }

    for (const edgeId of edgeIds) {
      const edge = this.#cy.getElementById(edgeId);
      if (edge.length === 0) continue;
      edge.animate({ style: { opacity: 0 }, duration, easing: 'ease-in' });
    }

    await this.#delay(duration);
  }

  /** Fade out a set of edges after a stagger delay. */
  async #fadeOutEdges(edgeIds: EdgeId[], duration: number, staggerDelay: number): Promise<void> {
    if (staggerDelay > 0) {
      await this.#delay(staggerDelay);
    }
    for (const edgeId of edgeIds) {
      const edge = this.#cy.getElementById(edgeId);
      if (edge.length === 0) continue;
      edge.animate({ style: { opacity: 0 }, duration, easing: 'ease-in' });
    }
    await this.#delay(duration);
  }

  /**
   * BFS from central node to compute graph distances within the scene.
   */
  #computeGraphDistances(centralNodeId: NodeId, scene: Scene): Map<NodeId, number> {
    const distances = new Map<NodeId, number>();
    distances.set(centralNodeId, 0);

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

  #getStageTiming(stage: CloseStageKey): { duration: number; delay: number } {
    const [duration, delay] = getSetting(`transition.${stage}`);
    return { duration, delay };
  }

  #delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  #getBackgroundCanvas(): HTMLCanvasElement | null {
    return this.#backgroundRenderer.getMainCanvas();
  }

  #animateCanvasOpacity(
    canvas: HTMLCanvasElement,
    targetOpacity: number,
    duration: number
  ): Promise<void> {
    return new Promise(resolve => {
      canvas.style.transition = `opacity ${duration}ms ease-in-out`;
      canvas.style.opacity = String(targetOpacity);
      setTimeout(resolve, duration);
    });
  }

  /**
   * Find where a ray from origin in given direction exits the viewport.
   * Returns a point just outside the viewport edge.
   */
  #findViewportEdgePoint(
    origin: Position,
    direction: { x: number; y: number },
    extent: { x1: number; y1: number; x2: number; y2: number },
    margin: number
  ): Position {
    const left = extent.x1 - margin;
    const right = extent.x2 + margin;
    const top = extent.y1 - margin;
    const bottom = extent.y2 + margin;

    let minT = Infinity;

    if (direction.x !== 0) {
      const t1 = (left - origin.x) / direction.x;
      const t2 = (right - origin.x) / direction.x;
      if (t1 > 0) minT = Math.min(minT, t1);
      if (t2 > 0) minT = Math.min(minT, t2);
    }
    if (direction.y !== 0) {
      const t1 = (top - origin.y) / direction.y;
      const t2 = (bottom - origin.y) / direction.y;
      if (t1 > 0) minT = Math.min(minT, t1);
      if (t2 > 0) minT = Math.min(minT, t2);
    }

    if (minT === Infinity) {
      return {
        x: origin.x + direction.x * 500,
        y: origin.y + direction.y * 500
      };
    }

    return {
      x: origin.x + direction.x * minT,
      y: origin.y + direction.y * minT
    };
  }
}
