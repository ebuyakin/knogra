/**
 * OpenCloseOrchestrator
 *
 * Layer 1 orchestrator for scene opening and closing.
 * Owns OpenSceneAnimator and CloseSceneAnimator (Layer 2).
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene, Node } from '../../../core/main-types';
import type { BackgroundRenderer } from '../../../background/background-renderer';

import { graphStore } from '../../../storage/graph-store';
import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';
import { StyleGenerator } from '../../../styles/style-generator';
import { resolveSceneEdgeVisualState } from '../../../styles/edge-visual-resolver';
import { OpenSceneAnimator } from './open-scene-animator';
import { CloseSceneAnimator } from './close-scene-animator';
import { getHiddenNodeIds } from '../element-classification-utils';

export class OpenCloseOrchestrator {
  #cy: Core;
  #openAnimator: OpenSceneAnimator;
  #closeAnimator: CloseSceneAnimator;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;
    this.#openAnimator = new OpenSceneAnimator(cy, backgroundRenderer);
    this.#closeAnimator = new CloseSceneAnimator(cy, backgroundRenderer);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Open scene instantly — add all elements at final positions, no animation
   */
  async openInstant(scene: Scene, themeId: string): Promise<void> {
    const nodeIds = Object.keys(scene.nodes) as NodeId[];
    const nodesToStyle: { nodeId: NodeId; nodeData: Node; design: { id: string; params: Record<string, unknown> }; scale?: number }[] = [];

    // Add all nodes at their final positions
    for (const nodeId of nodeIds) {
      const sceneNodeData = scene.nodes[nodeId];
      if (!sceneNodeData) continue;

      const nodeData = graphStore.nodes.find(n => n.id === nodeId);
      if (!nodeData) continue;

      this.#cy.add({
        group: 'nodes',
        data: {
          ...nodeData,
          id: nodeId,
          design: sceneNodeData.design,
          scale: sceneNodeData.scale,
          ...(nodeId === scene.centralNodeId ? { centralNode: 1 } : {})
        },
        // Clone: Cytoscape mutates the stored position object in place during
        // drag/animation, which would corrupt graphStore.scenes[...].nodes[...].position.
        position: { x: sceneNodeData.position.x, y: sceneNodeData.position.y }
      });

      nodesToStyle.push({
        nodeId,
        nodeData,
        design: sceneNodeData.design,
        scale: sceneNodeData.scale
      });
    }

    // Apply node styles
    if (nodesToStyle.length > 0) {
      const currentStylesheet = (this.#cy.style() as any).json();
      const updatedStylesheet = await StyleGenerator.addNodesToStylesheet(
        currentStylesheet, nodesToStyle, themeId
      );
      this.#cy.style().fromJson(updatedStylesheet).update();
    }

    // Add all edges
    const sceneEdgeIds = Object.keys(scene.edges) as EdgeId[];
    let edgeStylesheet = (this.#cy.style() as any).json();

    for (const edgeId of sceneEdgeIds) {
      const edgeData = graphStore.edges.find(e => e.id === edgeId);
      if (!edgeData) continue;

      const sceneEdgeData = scene.edges[edgeId];

      this.#cy.add({
        group: 'edges',
        data: {
          ...edgeData,
          id: edgeId,
          source: edgeData.sourceId,
          target: edgeData.targetId,
          design: sceneEdgeData?.design
        }
      });

      if (StyleGenerator.hasEdgeStyleOverride(sceneEdgeData?.design)) {
        const edgeStyle = StyleGenerator.generateEdgeStyleForId(
          edgeId, sceneEdgeData.design, themeId
        );
        edgeStylesheet = StyleGenerator.updateEdgeInStylesheet(
          edgeStylesheet, edgeId, edgeStyle
        );
      }
    }
    this.#cy.style().fromJson(edgeStylesheet).update();

    // Load background (no fade)
    if (scene.backgroundImages && scene.backgroundImages.length > 0) {
      await this.#openAnimator.loadBackground(scene);
      const bgCanvas = this.#cy.container()?.querySelector('canvas');
      if (bgCanvas) (bgCanvas as HTMLCanvasElement).style.opacity = '1';
    }
  }

  /**
   * Open scene with full animation sequence
   */
  async openAnimated(scene: Scene, _themeId: string): Promise<void> {
    // Build target positions
    const targetPositions: Record<NodeId, { x: number; y: number }> = {};
    for (const [nodeId, nodeData] of Object.entries(scene.nodes)) {
      // Clone to prevent Cytoscape from mutating graphStore-backed position refs.
      targetPositions[nodeId as NodeId] = { x: nodeData.position.x, y: nodeData.position.y };
    }

    // Get edges that are explicitly included in this scene
    const sceneEdgeIds: EdgeId[] = Object.keys(scene.edges) as EdgeId[];

    // Animation sequence:
    // 1. Load and fade in background
    if (scene.backgroundImages && scene.backgroundImages.length > 0) {
      const canvas = this.#cy.container()?.querySelector('canvas');
      if (canvas) {
        (canvas as HTMLCanvasElement).style.opacity = '0';
      }
      await this.#openAnimator.loadBackground(scene);
      await this.#openAnimator.fadeInBackground();
    }

    // 2. Central node zooms in at its position
    const centralPosition = targetPositions[scene.centralNodeId];
    if (centralPosition) {
      await this.#openAnimator.zoomInCentralNode(scene.centralNodeId, centralPosition, scene);
    }

    // 3. Other nodes fly in from outside (exclude folded nodes)
    // 4. Edges fade in per layer (cascaded with nodes)
    const hiddenNodeIds = this.getHiddenNodeIds(scene);
    const otherNodeIds = Object.keys(scene.nodes)
      .filter(id => id !== scene.centralNodeId && !hiddenNodeIds.has(id as NodeId)) as NodeId[];
    
    // Filter edges: exclude any edge where either endpoint is a folded (hidden) node
    const visibleEdgeIds = sceneEdgeIds.filter(edgeId => {
      const edgeData = graphStore.edges.find(e => e.id === edgeId);
      if (!edgeData) return false;
      return !hiddenNodeIds.has(edgeData.sourceId) && !hiddenNodeIds.has(edgeData.targetId);
    });

    const edgeMode = getSetting('transition.openEdgeMode');
    
    if (edgeMode === 'parallel') {
      // Edges cascade per layer inside flyInNodes
      await this.#openAnimator.flyInNodes(otherNodeIds, visibleEdgeIds, targetPositions, centralPosition, scene);
    } else {
      // Nodes cascade first, then edges fade in separately
      await this.#openAnimator.flyInNodes(otherNodeIds, [], targetPositions, centralPosition, scene);
      await this.#openAnimator.fadeInEdges(visibleEdgeIds, scene);
    }
  }

  /**
   * Close the current scene with reverse-open animation:
   * 1. Peripheral nodes + edges fly out from central node
   * 2. Central node shrinks/fades + background fades out
   * 3. Cleanup: remove all elements, clear scene ID
   */
  async close(centralNodeId: NodeId): Promise<void> {
    // Look up current scene for BFS distance calculation
    const currentSceneId = this.#cy.scratch('currentSceneId') as string | null;
    const scene = currentSceneId
      ? graphStore.scenes.find(s => s.id === currentSceneId) ?? null
      : null;

    // Phase 1: Peripheral nodes + edges cascade fly-out (farthest first)
    if (scene) {
      await this.#closeAnimator.flyOutNodesAndEdges(centralNodeId, scene);
    }

    // Phase 2: Central node shrinks/fades + background fades
    await this.#closeAnimator.fadeOutCentralAndBackground(centralNodeId);

    // Cleanup: clear remaining elements, reset scene state
    this.#cy.elements().remove();
    this.#cy.scratch('currentSceneId', null);
    this.#cy.scratch('foldedNodes', {});
  }

  /**
   * Close scene with a quick fade — all elements fade to opacity 0, then are removed.
   * No cascading, no fly-out. Used when transition.transitionMode is 'fade'.
   */
  async closeFade(): Promise<void> {
    const fadeDuration = 250;

    // Fade all elements to opacity 0
    const elements = this.#cy.elements();
    if (elements.length > 0) {
      await Promise.all(
        elements.map((ele: any) =>
          ele.animation({ style: { opacity: 0 }, duration: fadeDuration }).play().promise()
        )
      );
    }

    // Fade background canvas
    const bgCanvas = this.#cy.container()?.querySelector('.background-canvas') as HTMLCanvasElement | null;
    if (bgCanvas) {
      bgCanvas.style.transition = `opacity ${fadeDuration}ms ease`;
      bgCanvas.style.opacity = '0';
      await new Promise(resolve => setTimeout(resolve, fadeDuration));
      bgCanvas.style.transition = '';
    }

    // Cleanup
    this.#cy.elements().remove();
    this.#cy.scratch('currentSceneId', null);
    this.#cy.scratch('foldedNodes', {});
  }

  /**
   * Open scene with a quick fade — place all elements at final positions, then fade in.
   * No cascading, no fly-in, no central zoom. Used when transition.transitionMode is 'fade'.
   */
  async openFade(scene: Scene, themeId: string): Promise<void> {
    // Place everything using the same logic as openInstant
    await this.openInstant(scene, themeId);

    // Set all elements to opacity 0
    const elements = this.#cy.elements();
    elements.style({ opacity: 0 });

    // Set background to opacity 0
    const bgCanvas = this.#cy.container()?.querySelector('.background-canvas') as HTMLCanvasElement | null;
    if (bgCanvas) {
      bgCanvas.style.opacity = '0';
    }

    // Fade everything in
    const fadeDuration = 250;
    const fadePromises = elements.map((ele: any) => {
      if (!ele.isEdge?.()) {
        return ele.animation({ style: { opacity: 1 }, duration: fadeDuration }).play().promise();
      }

      const edgeData = graphStore.edges.find(edge => edge.id === ele.id());
      const targetOpacity = edgeData
        ? resolveSceneEdgeVisualState({ edge: edgeData, scene, edgeTypes: graphStore.edgeTypes, themeId }).opacity
        : 1;
      return ele.animation({ style: { opacity: targetOpacity }, duration: fadeDuration }).play().promise();
    });

    // Fade background in parallel
    if (bgCanvas) {
      bgCanvas.style.transition = `opacity ${fadeDuration}ms ease`;
      bgCanvas.style.opacity = '1';
    }

    await Promise.all(fadePromises);
    this.#cy.edges().removeStyle('opacity');

    if (bgCanvas) {
      bgCanvas.style.transition = '';
    }
  }

  /**
   * Set viewport from saved scene viewport or fit to content
   */
  setViewport(scene: Scene): void {
    // Check if scene has valid saved viewport
    if (scene.viewport && scene.viewport.zoom && scene.viewport.zoom > 0) {
      this.#cy.viewport({
        zoom: scene.viewport.zoom,
        pan: scene.viewport.pan
      });
      if (isDebug('d_transition')) console.log(`[OpenCloseOrchestrator] Using saved viewport: zoom=${scene.viewport.zoom}`);
    } else {
      // Fit to content with padding
      const padding = getSetting('transition.openFitPadding');
      this.#cy.fit(undefined, padding);
      if (isDebug('d_transition')) console.log(`[OpenCloseOrchestrator] Fit to content with padding=${padding}`);
    }
  }

  /**
   * Build set of all hidden node IDs from scene fold state.
   * Delegates to shared utility in element-classification-utils.
   */
  getHiddenNodeIds(scene: Scene): Set<NodeId> {
    return getHiddenNodeIds(scene);
  }
}
