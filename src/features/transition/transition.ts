/**
 * Transition Feature
 * 
 * Top-level orchestrator for animated transitions between scenes.
 * Routes to specialized handlers:
 * - OpenSceneHandler: scene opening (instant + animated)
 * - CloseSceneAnimator: scene closing
 * - PhaseOrchestrator: scene-to-scene 3-phase transitions
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, SceneId, Scene } from '../../core/main-types';
import type { ColorTheme } from '../../core/style-types';
import type { BackgroundRenderer } from '../../background/background-renderer';

import { isDebug } from '../../config/debug-flags';

import { graphStore } from '../../storage/graph-store';
import { graphSaver } from '../../storage/graph-saver';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';
import { getTheme } from '../../styles/themes';
import { StyleGenerator } from '../../styles/style-generator';
import { eventBus } from '../../events/event-bus';

import { findDirectlyConnected } from '../utils/pure/scene-calculations';
import { classifyElements, buildTargetPositions, getHiddenNodeIds } from './element-classification-utils';
import { createSceneFromCurrent } from './scene-factory-utils';

import { OpenCloseOrchestrator } from './opening-closing/open-close-orchestrator';
import { SceneToSceneOrchestrator } from './scene-to-scene/scene-to-scene-orchestrator';
import { FoldStateHandler } from './fold-state-handler';
import { checkSceneInvariant } from './transition-invariants';
import { startTransition } from '../../utils/diagnostics/transition-buffer';

// ============================================================================
// TYPES
// ============================================================================

interface Position {
  x: number;
  y: number;
}

// Debug support: Expose transitionDebug to window for console access
// The actual debug logic is in phase-orchestrator.ts
interface TransitionDebug {
  stepMode: boolean;
  continue: (() => void) | null;
  next: () => void;
}

const transitionDebug: TransitionDebug = {
  stepMode: false,
  continue: null,
  next: () => {
    if (transitionDebug.continue) {
      transitionDebug.continue();
      transitionDebug.continue = null;
    } else {
      console.log('No transition paused. Enable step mode: window.transitionDebug.stepMode = true');
    }
  }
};

// Expose to window for console access
(window as any).transitionDebug = transitionDebug;

/** Convert hex color to "r, g, b" string for rgba() */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// ============================================================================
// TRANSITION CLASS
// ============================================================================

export class Transition {
  #cy: Core;
  #sceneToSceneOrchestrator: SceneToSceneOrchestrator;
  #openCloseOrchestrator: OpenCloseOrchestrator;
  #foldStateHandler: FoldStateHandler;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;

    // Layer 1 orchestrators — each creates its own children
    this.#sceneToSceneOrchestrator = new SceneToSceneOrchestrator(cy, backgroundRenderer);
    this.#openCloseOrchestrator = new OpenCloseOrchestrator(cy, backgroundRenderer);
    this.#foldStateHandler = new FoldStateHandler(cy);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Navigate to a scene by selecting a node (e.g., via 'G' key or context menu)
   * Emits scene:changed event for path feature to track
   */
  async goToSceneByNode(targetNodeId: NodeId, options?: { fade?: boolean }): Promise<void> {
    if (isDebug('d_transition')) console.log(`[d_transition] toNode: Starting transition to node: ${targetNodeId}`);
    
    const useFade = options?.fade ?? getSetting('transition.transitionMode') === 'fade';

    if (useFade) {
      // Fade mode: close → open, no morph
      const targetScene = graphStore.scenes.find(s => s.centralNodeId === targetNodeId);
      if (!targetScene && !isEditMode()) {
        console.warn(`[Transition] Cannot auto-create scene in View mode for node: ${targetNodeId}`);
        return;
      }
      const targetSceneId = targetScene?.id ?? await this.#ensureSceneExists(targetNodeId);
      await this.closeScene({ fade: true });
      await this.openScene(targetSceneId, { fade: true });
      this.#cy.emit('scene:changed', [targetSceneId]);
      return;
    }

    // Animated mode: full morph transition
    const graphSaveSuspension = graphSaver.suspend('transition:goToSceneByNode');
    
    try {
      const targetSceneId = await this.#executeToNode(targetNodeId);
      
      // Emit event for path feature to track history
      if (targetSceneId) {
        this.#cy.emit('scene:changed', [targetSceneId]);
      }
    } finally {
      graphSaver.resume(graphSaveSuspension);
    }
  }

  /**
   * Navigate to a scene from path panel (back/forward, breadcrumb click)
   * Does not record to history (history position is managed by path feature)
   * 
   * Smart routing: if target scene's central node is in the current scene,
   * uses 3-phase transition. Otherwise, uses close → open for a clean switch.
   */
  async goToSceneFromPath(sceneId: SceneId): Promise<void> {
    const scene = graphStore.scenes.find(s => s.id === sceneId);
    if (!scene) {
      console.warn(`[Transition] Scene ${sceneId} not found`);
      return;
    }

    const mode = getSetting('transition.transitionMode');

    if (mode === 'fade') {
      // Fade mode: always close → open, no smart routing
      await this.closeScene();
      await this.openScene(sceneId);
      return;
    }

    // Animated mode: smart routing
    // Check if target's central node is visible in current scene.
    // A folded (hidden) node exists in cy but isn't meaningfully "present" —
    // there's no visual continuity to morph from.
    const centralNode = this.#cy.getElementById(scene.centralNodeId);
    const centralVisible = centralNode.length > 0 && centralNode.visible();

    const currentSceneId = this.#cy.scratch('currentSceneId') as SceneId | undefined;
    const rec = startTransition({
      kind: 'fromPath',
      from: currentSceneId ?? null,
      centralTo: scene.centralNodeId,
      note: centralVisible ? 'adjacent' : 'non-adjacent',
    });

    try {
      if (centralVisible) {
        // Adjacent scene — use 3-phase transition
        if (isDebug('d_transition')) console.log(`[d_transition] goToSceneFromPath: Adjacent: ${sceneId} (central node in scene)`);
        const graphSaveSuspension = graphSaver.suspend('transition:goToSceneFromPath');
        try {
          await this.#executeToNode(scene.centralNodeId);
        } finally {
          graphSaver.resume(graphSaveSuspension);
        }
      } else {
        // Non-adjacent scene — close current, open target fresh
        if (isDebug('d_transition')) console.log(`[d_transition] goToSceneFromPath: Non-adjacent: ${sceneId} (close → open)`);
        await this.closeScene();
        await this.openScene(sceneId);
      }
      rec.complete({ to: sceneId });
    } catch (err) {
      rec.fail(err);
      throw err;
    }
  }

  /**
   * Open a scene from scratch (initial load, no previous scene)
   * Uses dedicated open scene animation sequence
   * @param options.skipAnimation - Skip animation, render instantly (e.g. theme change)
   */
  async openScene(sceneId: SceneId, options?: { skipAnimation?: boolean; fade?: boolean }): Promise<void> {
    if (isDebug('d_transition')) console.log(`[d_transition] openScene: Opening scene: ${sceneId}${options?.skipAnimation ? ' (instant)' : ''}`);
    
    const scene = graphStore.scenes.find(s => s.id === sceneId);
    if (!scene) {
      throw new Error(`Scene ${sceneId} not found`);
    }

    // Notify UI that transition is starting (blocks input)
    eventBus.emit('transitionStart', undefined as void);

    const previousSceneId = this.#cy.scratch('currentSceneId') as SceneId | undefined;
    const rec = startTransition({
      kind: 'openScene',
      from: previousSceneId ?? null,
      centralTo: scene.centralNodeId,
      note: options?.skipAnimation ? 'instant' : (options?.fade ? 'fade' : 'animated'),
    });
    rec.setTarget({ to: sceneId });

    const graphSaveSuspension = graphSaver.suspend('transition:openScene');

    try {
      // Store current scene ID
      this.#cy.scratch('currentSceneId', sceneId);

      // Clear any existing elements
      this.#cy.elements().remove();

      // Apply canvas background from theme
      const themeId = scene.themeId || 'dark';
      const theme = getTheme(themeId);
      const [bgFadeDuration] = getSetting('transition.openBgFadeIn') as [number, number];
      this.#applyCanvasBackground(theme, options?.skipAnimation ? 0 : bgFadeDuration);

      // Initialize base stylesheet with central/selected rules and edge style
      const baseStylesheet = [
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': theme.edge.line.color,
            'target-arrow-color': theme.edge.line.color,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier'
          }
        },
        ...StyleGenerator.buildCentralAndSelectedRules(themeId)
      ];
      this.#cy.style().fromJson(baseStylesheet).update();

      // Set viewport: use saved viewport or fit to content
      this.#openCloseOrchestrator.setViewport(scene);

      if (options?.skipAnimation) {
        await this.#openCloseOrchestrator.openInstant(scene, themeId);
        await this.#foldStateHandler.apply(scene, themeId);
        checkSceneInvariant(this.#cy, scene, 'openScene:instant');
      } else if (options?.fade ?? getSetting('transition.transitionMode') === 'fade') {
        // Fade mode: place everything invisible, apply fold, then fade in visible elements
        await this.#openCloseOrchestrator.openInstant(scene, themeId);
        this.#cy.elements().style({ opacity: 0 });
        const bgCanvas = this.#cy.container()?.querySelector('.background-canvas') as HTMLCanvasElement | null;
        if (bgCanvas) bgCanvas.style.opacity = '0';

        // Apply fold state while everything is invisible — no flash
        await this.#foldStateHandler.apply(scene, themeId);

        // Fade in only visible elements
        const fadeDuration = 250;
        const visible = this.#cy.elements().filter((ele: any) => ele.style('display') !== 'none');
        const fadePromises = visible.map((ele: any) =>
          ele.animation({ style: { opacity: 1 }, duration: fadeDuration }).play().promise()
        );
        if (bgCanvas) {
          bgCanvas.style.transition = `opacity ${fadeDuration}ms ease`;
          bgCanvas.style.opacity = '1';
        }
        await Promise.all(fadePromises);
        if (bgCanvas) bgCanvas.style.transition = '';
        checkSceneInvariant(this.#cy, scene, 'openScene:fade');
      } else {
        await this.#openCloseOrchestrator.openAnimated(scene, themeId);
        await this.#foldStateHandler.apply(scene, themeId);
        checkSceneInvariant(this.#cy, scene, 'openScene:animated');
      }

      // Select the central node so it shows the combined central+selected style
      // and the user can start navigating immediately. Scene-to-scene transitions
      // inherit selection through animation ghosts; openScene has no such path.
      const centralEl = this.#cy.getElementById(scene.centralNodeId);
      if (centralEl.length > 0) {
        this.#cy.$(':selected').unselect();
        centralEl.select();
      }

      // Emit scene changed event
      eventBus.emit('sceneChanged', {
        sceneId: scene.id,
        centralNodeId: scene.centralNodeId
      });

      if (isDebug('d_transition')) console.log(`[d_transition] openScene: Complete: ${sceneId}`);
      rec.complete();
    } catch (err) {
      rec.fail(err);
      throw err;
    } finally {
      graphSaver.resume(graphSaveSuspension);
      eventBus.emit('transitionEnd', undefined as void);
    }
  }

  /**
   * Close the current scene with reverse-open animation:
   * 1. Peripheral nodes + edges fly out from central node
   * 2. Central node shrinks/fades + background fades out
   */
  async closeScene(options?: { fade?: boolean }): Promise<void> {
    const currentSceneId = this.#cy.scratch('currentSceneId') as SceneId | undefined;
    if (!currentSceneId) {
      console.warn('[Transition.closeScene] No current scene to close');
      return;
    }

    const scene = graphStore.scenes.find(s => s.id === currentSceneId);
    if (!scene) {
      console.warn(`[Transition.closeScene] Scene ${currentSceneId} not found`);
      return;
    }

    if (isDebug('d_transition')) console.log(`[d_transition] closeScene: Closing scene: ${currentSceneId}`);
    const rec = startTransition({
      kind: 'closeScene',
      from: currentSceneId,
      centralFrom: scene.centralNodeId,
      note: options?.fade ? 'fade' : 'animated',
    });

    eventBus.emit('transitionStart', undefined as void);
    const graphSaveSuspension = graphSaver.suspend('transition:closeScene');

    try {
      if (options?.fade ?? getSetting('transition.transitionMode') === 'fade') {
        await this.#openCloseOrchestrator.closeFade();
      } else {
        await this.#openCloseOrchestrator.close(scene.centralNodeId);
      }

      if (isDebug('d_transition')) console.log(`[d_transition] closeScene: Complete: ${currentSceneId}`);
      rec.complete();
    } catch (err) {
      rec.fail(err);
      throw err;
    } finally {
      graphSaver.resume(graphSaveSuspension);
      eventBus.emit('transitionEnd', undefined as void);
    }
  }

  // ==========================================================================
  // PRIVATE: CANVAS BACKGROUND
  // ==========================================================================

  /**
   * Apply canvas background color and vignette from theme to the container.
   * Shared by both open-scene and scene-to-scene paths.
   * @param transitionMs - if provided, animate the change over this duration
   */
  #applyCanvasBackground(theme: ColorTheme, transitionMs?: number): void {
    const container = this.#cy.container();
    if (!container) return;

    if (transitionMs && transitionMs > 0) {
      const sec = (transitionMs / 1000).toFixed(2);
      container.style.transition = `background-color ${sec}s ease, box-shadow ${sec}s ease`;
    } else {
      container.style.transition = '';
    }

    const bg = theme.canvas.background;
    container.style.backgroundColor = bg.color;

    const v = bg.vignette;
    if (v && v.strength && v.strength > 0) {
      const spread = v.spread ?? 50;
      const blur = v.blur ?? 200;
      const color = v.color ?? '#000000';
      const alpha = (v.strength * (v.colorOpacity ?? 1)).toFixed(2);
      container.style.boxShadow = `inset 0 0 ${blur}px ${spread}px rgba(${hexToRgb(color)}, ${alpha})`;
    } else {
      container.style.boxShadow = '';
    }
  }

  // ==========================================================================
  // PRIVATE: SCENE-TO-SCENE TRANSITION
  // ==========================================================================

  /**
   * Internal implementation of toNode (wrapped by GraphSaver disable/enable)
   * Returns the target scene ID for history recording
   */
  async #executeToNode(targetNodeId: NodeId): Promise<SceneId | null> {
    // Notify UI components that transition is starting.
    // transitionEnd is guaranteed via finally — no freeze on exception or early return.
    eventBus.emit('transitionStart', undefined as void);

    const rec = startTransition({
      kind: 'toNode',
      from: (this.#cy.scratch('currentSceneId') as SceneId | undefined) ?? null,
    });

    try {
    // Get current scene
    const currentSceneId = this.#cy.scratch('currentSceneId') as SceneId | undefined;
    if (!currentSceneId) {
      console.warn('No current scene, cannot transition');
      rec.note('aborted: no current scene');
      rec.complete();
      return null;
    }
    
    const currentScene = graphStore.scenes.find(s => s.id === currentSceneId);
    if (!currentScene) {
      console.warn(`Current scene ${currentSceneId} not found`);
      rec.note(`aborted: scene ${currentSceneId} not found`);
      rec.complete();
      return null;
    }
    
    rec.setCentrals({ from: currentScene.centralNodeId });
    
    // Get viewport center
    const extent = this.#cy.extent();
    const viewportCenter: Position = {
      x: (extent.x1 + extent.x2) / 2,
      y: (extent.y1 + extent.y2) / 2
    };
    
    // Resolve target scene
    let targetScene = this.#findSceneByCenter(targetNodeId);
    let isNewScene = false;
    
    // Helper to log scene positions
    const logScenePositions = (label: string, sceneId: string): void => {
      if (!isDebug('d_transition')) return;
      const scene = graphStore.scenes.find(s => s.id === sceneId);
      if (scene) {
        const pos = Object.entries(scene.nodes)
          .map(([id, data]) => `${id}:[${Math.round(data.position.x)},${Math.round(data.position.y)}]`)
          .join(', ');
        console.log(`[d_transition] ${label} ${sceneId}: {${pos}}`);
      }
    };
    
    // Log scene-4 positions BEFORE creating new scene
    logScenePositions('BEFORE createScene, scene-4 positions:', 'scene-4');
    
    if (!targetScene) {
      if (!isEditMode()) {
        console.warn(`[Transition] Cannot auto-create scene in View mode for node: ${targetNodeId}`);
        rec.note('aborted: view mode, cannot auto-create');
        rec.complete();
        return null;
      }
      if (isDebug('d_transition')) console.log('[d_transition] No existing scene found, auto-creating');
      const connectedNodes = findDirectlyConnected(targetNodeId, graphStore.edges);
      if (isDebug('d_transition')) console.log(`[d_transition] Connected nodes for ${targetNodeId}: ${connectedNodes.join(', ')}`);
      targetScene = createSceneFromCurrent(
        targetNodeId,
        currentScene,
        viewportCenter,
        [targetNodeId, ...connectedNodes]
      );
      isNewScene = true;
      
      // Log scene-4 positions AFTER creating new scene
      logScenePositions('AFTER createScene, scene-4 positions:', 'scene-4');
    } else {
      if (isDebug('d_transition')) console.log(`[d_transition] Found existing scene: ${targetScene.id}`);
      // Log target scene positions for debugging
      if (isDebug('d_transition')) {
        const positionsLog = Object.entries(targetScene.nodes)
          .map(([id, data]) => `${id}:[${Math.round(data.position.x)},${Math.round(data.position.y)}]`)
          .join(', ');
        console.log(`[d_transition] Target scene positions from graphStore: {${positionsLog}}`);
      }
    }

    rec.setTarget({ to: targetScene.id, isNewScene });
    rec.setCentrals({ to: targetScene.centralNodeId });
    
    // DEBUG: Log edges for both scenes
    if (isDebug('d_transition')) {
      console.log(`[d_transition] currentScene (${currentScene.id}) edges:`, Object.keys(currentScene.edges));
      console.log(`[d_transition] targetScene (${targetScene.id}) edges:`, Object.keys(targetScene.edges));
      console.log(`[d_transition] Cytoscape edges:`, this.#cy.edges().map(e => e.id()));
    }
    
    // Log scene-4 positions BEFORE transition
    logScenePositions('BEFORE transition phases, scene-4 positions:', 'scene-4');
    
    // Classify elements and build target positions
    const elements = classifyElements(currentScene, targetScene, this.#cy.edges());
    const { positions: targetPositions, scales: targetScales } = buildTargetPositions(targetScene);

    // Reclassify elements based on fold visibility (not just inclusion).
    // A node's animation role depends on its visibility in source AND target:
    //   visible→visible  = shared (morph)
    //   visible→hidden   = departing (fly out; FoldStateHandler re-adds hidden)
    //   hidden→visible   = arriving (fly in)
    //   hidden→hidden    = silent (FoldStateHandler handles)
    //   hidden→absent    = silent (remove from cy without animation)
    //   absent→hidden    = silent (FoldStateHandler adds hidden)
    const hiddenInSource = getHiddenNodeIds(currentScene);
    const hiddenInTarget = getHiddenNodeIds(targetScene);
    if (isDebug('d_fold')) {
      console.log(`[d_fold] Hidden in source (${currentScene.id}):`, [...hiddenInSource]);
      console.log(`[d_fold] Hidden in target (${targetScene.id}):`, [...hiddenInTarget]);
      console.log(`[d_fold] Pre-reclassify — shared: ${elements.sharedNodes.length}, departing: ${elements.departingNodes.length}, arriving: ${elements.arrivingNodes.length}`);
    }
    if (hiddenInSource.size > 0 || hiddenInTarget.size > 0) {
      // Reclassify shared nodes
      const reclassifiedShared: NodeId[] = [];
      for (const id of elements.sharedNodes) {
        const hidSrc = hiddenInSource.has(id);
        const hidTgt = hiddenInTarget.has(id);
        if (!hidSrc && !hidTgt) {
          reclassifiedShared.push(id);
          if (isDebug('d_fold')) console.log(`[d_fold]   ${id}: visible→visible (shared)`);
        }
        else if (!hidSrc && hidTgt) {
          elements.departingNodes.push(id);
          if (isDebug('d_fold')) console.log(`[d_fold]   ${id}: visible→hidden (→departing)`);
        }
        else if (hidSrc && !hidTgt) {
          elements.arrivingNodes.push(id);
          if (isDebug('d_fold')) console.log(`[d_fold]   ${id}: hidden→visible (→arriving), in cy: ${this.#cy.getElementById(id as string).length > 0}`);
        }
        else {
          if (isDebug('d_fold')) console.log(`[d_fold]   ${id}: hidden→hidden (silent)`);
        }
      }
      elements.sharedNodes = reclassifiedShared;

      // Remove hidden departing nodes (hidden→absent: silent cy removal, no animation)
      elements.departingNodes = elements.departingNodes.filter(id => !hiddenInSource.has(id));

      // Remove hidden arriving nodes (absent→hidden: FoldStateHandler handles)
      elements.arrivingNodes = elements.arrivingNodes.filter(id => !hiddenInTarget.has(id));

      if (isDebug('d_fold')) {
        console.log(`[d_fold] Post-reclassify — shared: ${elements.sharedNodes.length}, departing: ${elements.departingNodes.length}, arriving: ${elements.arrivingNodes.length}`);
        console.log(`[d_fold]   departing:`, elements.departingNodes);
        console.log(`[d_fold]   arriving:`, elements.arrivingNodes);
      }

      // Edges follow their endpoints: when a node is reclassified shared→arriving
      // or shared→departing, its edges in sharedEdges must move with it so they
      // animate in/out instead of being orphaned. Without this, edges touching a
      // newly-arriving node are stranded in sharedEdges and silently dropped from
      // cy by stowaway-removal — corrupting scene.edges on the next save.
      const arrivingNodeSet = new Set(elements.arrivingNodes);
      const departingNodeSet = new Set(elements.departingNodes);
      const stillSharedEdges: EdgeId[] = [];
      for (const edgeId of elements.sharedEdges) {
        const cyEdge = this.#cy.getElementById(edgeId as string);
        let src: NodeId, tgt: NodeId;
        if (cyEdge.length > 0) {
          src = cyEdge.source().id() as NodeId;
          tgt = cyEdge.target().id() as NodeId;
        } else {
          const edgeData = graphStore.edges.find(e => e.id === edgeId);
          if (!edgeData) continue;
          src = edgeData.sourceId;
          tgt = edgeData.targetId;
        }
        // Departing wins over arriving: an edge between a departing and an
        // arriving node should fade out (the departing endpoint disappears first).
        if (departingNodeSet.has(src) || departingNodeSet.has(tgt)) {
          elements.departingEdges.push(edgeId);
          if (isDebug('d_fold')) console.log(`[d_fold]   edge ${edgeId}: shared→departing`);
        } else if (arrivingNodeSet.has(src) || arrivingNodeSet.has(tgt)) {
          elements.arrivingEdges.push(edgeId);
          if (isDebug('d_fold')) console.log(`[d_fold]   edge ${edgeId}: shared→arriving`);
        } else {
          stillSharedEdges.push(edgeId);
        }
      }
      elements.sharedEdges = stillSharedEdges;

      // Remove hidden stowaways that will arrive visibly.
      // FoldStateHandler.apply() from the previous transition may have added hidden nodes to cy.
      // If they are now classified as "arriving," remove them so ArrivalAnimator can add them fresh.
      for (const id of elements.arrivingNodes) {
        const el = this.#cy.getElementById(id as string);
        if (el.length > 0 && el.style('display') === 'none') {
          if (isDebug('d_fold')) console.log(`[d_fold] Removing hidden stowaway before arrival: ${id}`);
          el.connectedEdges().remove();
          el.remove();
        }
      }

      // Reclassify edges: an edge animates only if both endpoints are in an animated category
      const animatedNodes = new Set([
        ...elements.departingNodes, ...elements.sharedNodes, ...elements.arrivingNodes
      ]);
      const getEdgeEndpoints = (edgeId: EdgeId): [NodeId, NodeId] | null => {
        const cyEdge = this.#cy.getElementById(edgeId as string);
        if (cyEdge.length > 0) {
          return [cyEdge.source().id() as NodeId, cyEdge.target().id() as NodeId];
        }
        const edgeData = graphStore.edges.find(e => e.id === edgeId);
        if (!edgeData) return null;
        return [edgeData.sourceId, edgeData.targetId];
      };
      const isEdgeAnimated = (edgeId: EdgeId): boolean => {
        const endpoints = getEdgeEndpoints(edgeId);
        if (!endpoints) return false;
        return animatedNodes.has(endpoints[0]) && animatedNodes.has(endpoints[1]);
      };
      elements.departingEdges = elements.departingEdges.filter(isEdgeAnimated);
      elements.sharedEdges = elements.sharedEdges.filter(isEdgeAnimated);
      elements.arrivingEdges = elements.arrivingEdges.filter(isEdgeAnimated);
    }

    if (isDebug('d_transition')) console.log('[d_transition] Elements:', elements);
    if (isDebug('d_transition')) console.log('[d_transition] Target positions from scene:', targetScene.id, targetPositions);

    rec.classify({
      shared: { nodes: elements.sharedNodes.slice(), edges: elements.sharedEdges.slice() },
      departing: { nodes: elements.departingNodes.slice(), edges: elements.departingEdges.slice() },
      arriving: { nodes: elements.arrivingNodes.slice(), edges: elements.arrivingEdges.slice() },
    });
    if (targetScene.viewport?.zoom > 0) {
      rec.viewport({ fromZoom: this.#cy.zoom(), toZoom: targetScene.viewport.zoom });
    }

    // Execute the 3-phase transition via orchestrator
    await this.#sceneToSceneOrchestrator.executeDeparture(elements, currentScene, targetScene, viewportCenter);

    // Swap central node styling before movement — hints causality:
    // "we chose a new center, now everything rearranges"
    const targetThemeId = targetScene.themeId || 'dark';
    await this.#updateCentralNodeStyle(currentScene.centralNodeId, targetScene.centralNodeId, targetThemeId);

    // Crossfade canvas background to target theme during shared movement
    const targetTheme = getTheme(targetThemeId);
    const morphDuration = getSetting('transition.morphDuration');
    this.#applyCanvasBackground(targetTheme, morphDuration[0]);

    await this.#sceneToSceneOrchestrator.executeSharedMovement(elements, currentScene, targetScene, targetPositions, targetScales, isNewScene);
    await this.#sceneToSceneOrchestrator.executeArrival(elements, targetScene, targetPositions, viewportCenter);

    // Apply fold state for target scene: add hidden nodes, hide them, write scratch
    await this.#foldStateHandler.apply(targetScene, targetThemeId);

    // Verify cy matches target scene before resume — catches any class of bug
    // that leaves cy out of sync, which would otherwise corrupt the DB silently
    // on the next GraphSaver sync.
    checkSceneInvariant(this.#cy, targetScene, 'executeToNode');

    // Log scene-4 positions AFTER transition
    logScenePositions('AFTER transition phases, scene-4 positions:', 'scene-4');
    
    // Rebuild central/selected rules in stylesheet with target scene's theme
    const stylesheet = (this.#cy.style() as any).json();
    // Remove old central/selected rules
    const filteredStylesheet = stylesheet.filter(
      (r: { selector: string }) =>
        r.selector !== 'node[?centralNode]' &&
        r.selector !== 'node:selected' &&
        r.selector !== 'node[?centralNode]:selected'
    );
    // Append fresh rules at the end
    const updatedStylesheet = [
      ...filteredStylesheet,
      ...StyleGenerator.buildCentralAndSelectedRules(targetThemeId)
    ];
    this.#cy.style().fromJson(updatedStylesheet).update();
    
    // Update current scene ID
    this.#cy.scratch('currentSceneId', targetScene.id);
    
    // DEBUG: Log what's in Cytoscape after transition
    if (isDebug('d_transition')) {
      console.log(`[d_transition] After transition, Cytoscape edges:`, this.#cy.edges().map(e => e.id()));
      console.log(`[d_transition] targetScene.edges should be:`, Object.keys(targetScene.edges));
    }
    
    // Save auto-created scene to database (use updateScene for upsert behavior)
    if (isNewScene && isEditMode()) {
      await graphStore.updateScene(targetScene);
      if (isDebug('d_transition')) console.log(`[d_transition] Saved new scene: ${targetScene.id}`);
      
      // Log scene-4 positions AFTER saving new scene
      logScenePositions('AFTER updateScene, scene-4 positions:', 'scene-4');
    }
    
    if (isDebug('d_transition')) console.log(`[d_transition] toNode: Complete, now at scene: ${targetScene.id}`);

    // Notify subscribers of scene change (only on success)
    eventBus.emit('sceneChanged', {
      sceneId: targetScene.id,
      centralNodeId: targetScene.centralNodeId
    });

    rec.complete();
    return targetScene.id;

    } catch (err) {
      rec.fail(err);
      throw err;
    } finally {
      // Always unblock UI — prevents permanent freeze on exception or early return
      eventBus.emit('transitionEnd', undefined as void);
    }
  }

  // ==========================================================================
  // PRIVATE: SCENE RESOLUTION
  // ==========================================================================

  #findSceneByCenter(centralNodeId: NodeId): Scene | null {
    return graphStore.scenes.find(s => s.centralNodeId === centralNodeId) ?? null;
  }

  /**
   * Find or auto-create a scene for a node (used by fade mode).
   * If scene doesn't exist, creates one from the current scene context and saves it.
   */
  async #ensureSceneExists(targetNodeId: NodeId): Promise<SceneId> {
    const existing = this.#findSceneByCenter(targetNodeId);
    if (existing) return existing.id;
    if (!isEditMode()) {
      throw new Error(`Cannot auto-create scene in View mode for node: ${targetNodeId}`);
    }

    const currentSceneId = this.#cy.scratch('currentSceneId') as SceneId | undefined;
    const currentScene = currentSceneId
      ? graphStore.scenes.find(s => s.id === currentSceneId)
      : undefined;

    if (!currentScene) {
      throw new Error(`Cannot auto-create scene: no current scene context`);
    }

    const extent = this.#cy.extent();
    const viewportCenter: Position = {
      x: (extent.x1 + extent.x2) / 2,
      y: (extent.y1 + extent.y2) / 2
    };

    const connectedNodes = findDirectlyConnected(targetNodeId, graphStore.edges);
    const newScene = createSceneFromCurrent(
      targetNodeId,
      currentScene,
      viewportCenter,
      [targetNodeId, ...connectedNodes]
    );

    await graphStore.updateScene(newScene);
    if (isDebug('d_transition')) console.log(`[d_transition] Auto-created scene for fade: ${newScene.id}`);
    return newScene.id;
  }

  // ==========================================================================
  // PRIVATE: CENTRAL NODE STYLING
  // ==========================================================================

  /**
   * Update central node styling via data flag toggle.
   * Cytoscape re-evaluates selectors automatically when data changes.
   * The node[?centralNode] rule in the stylesheet handles the visual update.
   */
  async #updateCentralNodeStyle(oldCentralId: NodeId, newCentralId: NodeId, _themeId: string): Promise<void> {
    // Remove flag from old central node
    const oldNode = this.#cy.getElementById(oldCentralId);
    if (oldNode.length > 0) {
      oldNode.removeData('centralNode');
      if (isDebug('d_transition')) console.log(`[d_transition] Removed centralNode flag from ${oldCentralId}`);
    }

    // Set flag on new central node
    const newNode = this.#cy.getElementById(newCentralId);
    if (newNode.length > 0) {
      newNode.data('centralNode', 1);
      if (isDebug('d_transition')) console.log(`[d_transition] Set centralNode flag on ${newCentralId}`);
    } else {
      console.warn(`[updateCentralNodeStyle] New central node ${newCentralId} not found in Cytoscape`);
    }
  }
}
