/**
 * OpenSceneAnimator
 * Provides animation primitives for opening a scene (initial load).
 * Used by Transition.openScene() for the initial scene display.
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene, Node } from '../../../core/main-types';
import type { BackgroundRenderer } from '../../../background/background-renderer';
import type { OpenSceneTimings } from '../../../config/transition-settings';

import { graphStore } from '../../../storage/graph-store';
import { getSetting } from '../../../config';
import { StyleGenerator } from '../../../styles/style-generator';
import { resolveSceneEdgeVisualState } from '../../../styles/edge-visual-resolver';

type OpenStageKey = keyof OpenSceneTimings;

interface Position {
  x: number;
  y: number;
}

type TargetPositions = Record<NodeId, Position>;

export class OpenSceneAnimator {
  #cy: Core;
  #backgroundRenderer: BackgroundRenderer;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;
    this.#backgroundRenderer = backgroundRenderer;
  }

  // ==========================================================================
  // PUBLIC METHODS
  // ==========================================================================

  /**
   * Load background images for a scene
   */
  async loadBackground(scene: Scene): Promise<void> {
    if (scene.backgroundImages && scene.backgroundImages.length > 0) {
      await this.#backgroundRenderer.render(scene.backgroundImages);
      const zoom = this.#cy.zoom();
      const pan = this.#cy.pan();
      this.#backgroundRenderer.redraw(zoom, pan);
    } else {
      this.#backgroundRenderer.clear();
    }
  }

  /**
   * Fade in background (uses openBgFadeIn timing)
   */
  async fadeInBackground(): Promise<void> {
    const { duration, delay } = this.#getOpenStageTiming('openBgFadeIn');
    
    const canvas = this.#getBackgroundCanvas();
    if (canvas) {
      await this.#animateCanvasOpacity(canvas, 1, duration);
    }
    
    await this.#delay(delay);
  }

  /**
   * Central node flies from viewport center to its position
   * (Legacy method - kept for compatibility)
   */
  async flyInFromCenter(
    nodeId: NodeId,
    targetPosition: Position,
    scene: Scene
  ): Promise<void> {
    const { duration, delay } = this.#getOpenStageTiming('openCentralFlyIn');
    
    const sceneNodeData = scene.nodes[nodeId];
    if (!sceneNodeData) {
      console.warn(`[OpenSceneAnimator.flyInFromCenter] Node ${nodeId} not in scene`);
      return;
    }
    
    const nodeData = graphStore.nodes.find(n => n.id === nodeId);
    if (!nodeData) {
      console.warn(`[OpenSceneAnimator.flyInFromCenter] Node ${nodeId} not found in graph store`);
      return;
    }
    
    // Get viewport center as starting position
    const extent = this.#cy.extent();
    const startPos = {
      x: (extent.x1 + extent.x2) / 2,
      y: (extent.y1 + extent.y2) / 2
    };
    
    // Add node at viewport center (invisible) with centralNode flag
    this.#cy.add({
      group: 'nodes',
      data: {
        ...nodeData,
        id: nodeId,
        design: sceneNodeData.design,
        scale: sceneNodeData.scale,
        centralNode: 1
      },
      position: startPos,
      style: { opacity: 0 }
    });
    
    // Generate node style for central node
    const currentSceneId = this.#cy.scratch('currentSceneId') as string;
    const currentScene = currentSceneId ? await graphStore.readScene(currentSceneId) : null;
    const themeId = currentScene?.themeId || 'dark';
    
    const nodeStyle = await StyleGenerator.generateNodeStyle(nodeData, sceneNodeData.design, themeId);
    
    // Apply scale
    const effectiveScale = sceneNodeData.scale ?? 1.0;
    if (effectiveScale !== 1.0) {
      nodeStyle.width = nodeStyle.width * effectiveScale;
      nodeStyle.height = nodeStyle.height * effectiveScale;
    }
    
    // Add to stylesheet
    const currentStylesheet = (this.#cy.style() as any).json();
    const newRule = { selector: `node[id = "${nodeId}"]`, style: nodeStyle };
    currentStylesheet.unshift(newRule);
    this.#cy.style().fromJson(currentStylesheet).update();
    
    // Animate to target position
    const node = this.#cy.getElementById(nodeId);
    node.animate({ position: targetPosition, style: { opacity: 1 }, duration, easing: 'ease-out' });
    
    await this.#delay(duration + delay);
    
    // Ensure final position
    node.position(targetPosition);
    node.style('opacity', 1);
  }

  /**
   * Central node zooms in at its position (no movement)
   * Node appears small at final position and grows to full size while fading in
   */
  async zoomInCentralNode(
    nodeId: NodeId,
    targetPosition: Position,
    scene: Scene
  ): Promise<void> {
    const { duration, delay } = this.#getOpenStageTiming('openCentralZoomIn');
    
    const sceneNodeData = scene.nodes[nodeId];
    if (!sceneNodeData) {
      console.warn(`[OpenSceneAnimator.zoomInCentralNode] Node ${nodeId} not in scene`);
      return;
    }
    
    const nodeData = graphStore.nodes.find(n => n.id === nodeId);
    if (!nodeData) {
      console.warn(`[OpenSceneAnimator.zoomInCentralNode] Node ${nodeId} not found in graph store`);
      return;
    }
    
    // Generate node style for central node
    const currentSceneId = this.#cy.scratch('currentSceneId') as string;
    const currentScene = currentSceneId ? await graphStore.readScene(currentSceneId) : null;
    const themeId = currentScene?.themeId || 'dark';
    
    const nodeStyle = await StyleGenerator.generateNodeStyle(nodeData, sceneNodeData.design, themeId);
    
    // Apply scale to get final dimensions
    const effectiveScale = sceneNodeData.scale ?? 1.0;
    if (effectiveScale !== 1.0) {
      nodeStyle.width = nodeStyle.width * effectiveScale;
      nodeStyle.height = nodeStyle.height * effectiveScale;
    }
    
    // Store final dimensions
    const finalWidth = nodeStyle.width;
    const finalHeight = nodeStyle.height;
    
    // Start small (20% of final size)
    const startScale = 0.2;
    const startWidth = finalWidth * startScale;
    const startHeight = finalHeight * startScale;
    
    // Add node at TARGET position, small and invisible, with centralNode flag
    const centralEl = this.#cy.add({
      group: 'nodes',
      data: {
        ...nodeData,
        id: nodeId,
        design: sceneNodeData.design,
        scale: sceneNodeData.scale,
        centralNode: 1
      },
      position: targetPosition
    });
    centralEl.style({ opacity: 0, width: startWidth, height: startHeight });
    
    // Add to stylesheet (with final dimensions for reference)
    const currentStylesheet = (this.#cy.style() as any).json();
    const newRule = { selector: `node[id = "${nodeId}"]`, style: nodeStyle };
    currentStylesheet.unshift(newRule);
    this.#cy.style().fromJson(currentStylesheet).update();
    
    // Animate: grow to full size while fading in
    const node = this.#cy.getElementById(nodeId);
    node.animate({ 
      style: { 
        opacity: 1,
        width: finalWidth,
        height: finalHeight
      }, 
      duration, 
      easing: 'ease-out' 
    });
    
    await this.#delay(duration + delay);
    
    // Ensure final state
    node.style('opacity', 1);
    node.style('width', finalWidth);
    node.style('height', finalHeight);
  }

  /**
   * Other nodes fly in from outside, cascaded by graph distance from central.
   * Closest nodes arrive first, farthest last — scene "builds up" from center.
   */
  async flyInNodes(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    targetPositions: TargetPositions,
    centralPosition: Position,
    scene: Scene
  ): Promise<void> {
    if (nodeIds.length === 0) return;

    const [layerDuration] = getSetting('transition.openLayerDuration') as [number, number];
    const [layerStagger] = getSetting('transition.openLayerStagger') as [number, number];

    // BFS from central node to compute graph distances within this scene
    const distances = this.#computeGraphDistances(scene.centralNodeId, scene);

    // Group nodes by distance layer
    const layers = new Map<number, NodeId[]>();
    for (const id of nodeIds) {
      const dist = distances.get(id) ?? 999;
      if (!layers.has(dist)) layers.set(dist, []);
      layers.get(dist)!.push(id);
    }

    // Closest first (ascending distance)
    const sortedDistances = [...layers.keys()].sort((a, b) => a - b);

    // Assign edges to layers: edge appears with its farthest arriving endpoint
    const arrivingSet = new Set(nodeIds);
    const edgeLayerMap = new Map<number, EdgeId[]>();
    for (const edgeId of edgeIds) {
      const edgeData = graphStore.edges.find(e => e.id === edgeId);
      if (!edgeData) continue;
      // Central/already-present endpoints → distance 0
      const srcDist = arrivingSet.has(edgeData.sourceId) ? (distances.get(edgeData.sourceId) ?? 999) : 0;
      const tgtDist = arrivingSet.has(edgeData.targetId) ? (distances.get(edgeData.targetId) ?? 999) : 0;
      const maxDist = Math.max(srcDist, tgtDist);
      // maxDist === 0: both endpoints already present → nothing to animate.
      // maxDist === 999: edge lies in a cluster disconnected from the central
      // node; bucket it with its endpoints (also in layer 999) so it is still added.
      if (maxDist === 0) continue;
      if (!edgeLayerMap.has(maxDist)) edgeLayerMap.set(maxDist, []);
      edgeLayerMap.get(maxDist)!.push(edgeId);
    }

    // Prepare all nodes: add to Cytoscape at off-screen positions
    const nodesToStyle: { nodeId: NodeId; nodeData: Node; design: { id: string; params: Record<string, unknown> }; scale?: number }[] = [];
    const extent = this.#cy.extent();
    const margin = 50;

    for (const nodeId of nodeIds) {
      const sceneNodeData = scene.nodes[nodeId];
      if (!sceneNodeData) continue;
      const nodeData = graphStore.nodes.find(n => n.id === nodeId);
      if (!nodeData) continue;
      const target = targetPositions[nodeId];
      if (!target) continue;

      let dx = target.x - centralPosition.x;
      let dy = target.y - centralPosition.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) { dx = 0; dy = -1; }
      else { dx /= dist; dy /= dist; }

      const startPos = this.#findViewportEdgePoint(target, { x: dx, y: dy }, extent, margin);

      const nodeEl = this.#cy.add({
        group: 'nodes',
        data: { ...nodeData, id: nodeId, design: sceneNodeData.design, scale: sceneNodeData.scale },
        position: startPos
      });
      nodeEl.style('opacity', 0);

      nodesToStyle.push({ nodeId, nodeData, design: sceneNodeData.design, scale: sceneNodeData.scale });
    }

    // Apply styles to all arriving nodes at once
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
        this.#animateArrivalLayer(layerNodeIds, layerEdgeIds, targetPositions, scene, layerDuration, staggerDelay)
      );
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
  }

  /**
   * Fade in edges (uses openEdgesFadeIn timing)
   */
  async fadeInEdges(edgeIds: EdgeId[], scene: Scene): Promise<void> {
    if (edgeIds.length === 0) return;
    
    const { duration, delay } = this.#getOpenStageTiming('openEdgesFadeIn');
    const themeId = scene.themeId || 'dark';
    
    // Add edges (invisible) with scene-specific design data
    edgeIds.forEach(edgeId => {
      if (this.#cy.getElementById(edgeId).length > 0) return;
      
      const edgeData = graphStore.edges.find(e => e.id === edgeId);
      if (!edgeData) return;

      const sceneEdgeData = scene.edges[edgeId];
      
      const edgeEl = this.#cy.add({
        group: 'edges',
        data: {
          ...edgeData,
          id: edgeId,
          source: edgeData.sourceId,
          target: edgeData.targetId,
          design: sceneEdgeData?.design
        }
      });
      edgeEl.style('opacity', 0);
    });

    // Generate per-edge stylesheet rules from scene designs
    let currentStylesheet = (this.#cy.style() as any).json();
    for (const edgeId of edgeIds) {
      const sceneEdgeData = scene.edges[edgeId];
      if (!StyleGenerator.hasEdgeStyleOverride(sceneEdgeData?.design)) continue;

      const edgeStyle = StyleGenerator.generateEdgeStyleForId(
        edgeId, sceneEdgeData.design, themeId
      );
      currentStylesheet = StyleGenerator.updateEdgeInStylesheet(
        currentStylesheet, edgeId, edgeStyle
      );
    }
    this.#cy.style().fromJson(currentStylesheet).update();
    
    // Animate to visible
    const edges = this.#cy.collection();
    edgeIds.forEach(id => edges.merge(this.#cy.getElementById(id)));
    
    edgeIds.forEach(id => {
      const edge = this.#cy.getElementById(id);
      const targetOpacity = this.#resolveEdgeTargetOpacity(id, scene);
      edge.animate({ style: { opacity: targetOpacity }, duration, easing: 'ease-out' });
    });
    await this.#delay(duration + delay);
    edges.removeStyle('opacity');
  }

  // ==========================================================================
  // PRIVATE: CASCADE HELPERS
  // ==========================================================================

  /** Animate one arrival layer of nodes + edges after a stagger delay. */
  async #animateArrivalLayer(
    nodeIds: NodeId[],
    edgeIds: EdgeId[],
    targetPositions: TargetPositions,
    scene: Scene,
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
    const themeId = scene.themeId || 'dark';
    for (const edgeId of edgeIds) {
      if (this.#cy.getElementById(edgeId).length > 0) continue;
      const edgeData = graphStore.edges.find(e => e.id === edgeId);
      if (!edgeData) continue;
      const sceneEdgeData = scene.edges[edgeId];
      const edgeEl = this.#cy.add({
        group: 'edges',
        data: { ...edgeData, id: edgeId, source: edgeData.sourceId, target: edgeData.targetId, design: sceneEdgeData?.design }
      });
      edgeEl.style('opacity', 0);

      // Apply per-edge style if scene has custom design for this edge
      if (StyleGenerator.hasEdgeStyleOverride(sceneEdgeData?.design)) {
        let currentStylesheet = (this.#cy.style() as any).json();
        const edgeStyle = StyleGenerator.generateEdgeStyleForId(edgeId, sceneEdgeData.design, themeId);
        currentStylesheet = StyleGenerator.updateEdgeInStylesheet(currentStylesheet, edgeId, edgeStyle);
        this.#cy.style().fromJson(currentStylesheet).update();
      }

      const targetOpacity = this.#resolveEdgeTargetOpacity(edgeId, scene);
      edgeEl.animate({ style: { opacity: targetOpacity }, duration, easing: 'ease-out' });
    }

    await this.#delay(duration);
    this.#cy.edges().removeStyle('opacity');
  }

  #resolveEdgeTargetOpacity(edgeId: EdgeId, scene: Scene): number {
    const edgeData = graphStore.edges.find(edge => edge.id === edgeId);
    if (!edgeData) return 1;
    return resolveSceneEdgeVisualState({
      edge: edgeData,
      scene,
      edgeTypes: graphStore.edgeTypes,
      themeId: scene.themeId || 'dark'
    }).opacity;
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

  #getOpenStageTiming(stage: OpenStageKey): { duration: number; delay: number } {
    const [duration, delay] = getSetting(`transition.${stage}`);
    return { duration, delay };
  }

  #delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  #getBackgroundCanvas(): HTMLCanvasElement | null {
    return this.#backgroundRenderer.getMainCanvas();
  }

  #animateCanvasOpacity(canvas: HTMLCanvasElement, targetOpacity: number, duration: number): Promise<void> {
    return new Promise(resolve => {
      canvas.style.transition = `opacity ${duration}ms ease-in-out`;
      canvas.style.opacity = String(targetOpacity);
      setTimeout(resolve, duration);
    });
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
