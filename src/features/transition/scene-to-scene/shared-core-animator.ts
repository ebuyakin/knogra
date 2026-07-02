/**
 * SharedCoreAnimator
 * Phase 2: Handles shared movement animations for scene transitions.
 * All transformations (background, position, design) run in parallel.
 */

import type { Core } from 'cytoscape';
import type { NodeId, Scene } from '../../../core/main-types';
import type { BackgroundRenderer } from '../../../background/background-renderer';
import type { SharedBackgroundTiming } from '../../../config/transition-settings';

import { graphStore } from '../../../storage/graph-store';
import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';
import { BackgroundOperator } from './shared-core-animation/background-operator';
import { StyleGenerator } from '../../../styles/style-generator';
import { resolveSceneEdgeVisualState } from '../../../styles/edge-visual-resolver';
import { TransitionAnalysisOperator, type TransitionAnalysis } from './shared-core-animation/transition-analysis-operator';
import { GhostOperator } from './shared-core-animation/ghost-operator';
import { waitForStep } from './scene-to-scene-orchestrator';
import { resolveScenePan } from '../../utils/cy/viewport-utils';

interface Position {
  x: number;
  y: number;
}

type TargetPositions = Record<NodeId, Position>;

/** Pre-calculated crossfade durations/delays from overlap percentage. */
interface CrossfadeTiming {
  fadeOutDuration: number;
  fadeInDelay: number;
  fadeInDuration: number;
}

/**
 * Convert overlap percentage (0–100) to concrete ms timings.
 * Overlap centered around 50%: fadeOutEnd = 50% + overlap/2,
 * fadeInStart = 50% - overlap/2.
 */
function calculateCrossfadeTiming(overlapPercent: number, duration: number): CrossfadeTiming {
  const overlapFraction = overlapPercent / 100;
  const fadeOutEndRatio = 0.5 + overlapFraction / 2;
  const fadeInStartRatio = 0.5 - overlapFraction / 2;
  return {
    fadeOutDuration: duration * fadeOutEndRatio,
    fadeInDelay: duration * fadeInStartRatio,
    fadeInDuration: duration * (1 - fadeInStartRatio)
  };
}

/** Cubic ease-in-out matching Cytoscape's 'ease-in-out-cubic'. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** A shared element moved in render (screen) space during the morph. */
interface Mover {
  ele: any;
  r0: Position;
  r1: Position;
  target: Position;
  w0?: number;
  h0?: number;
  w1?: number;
  h1?: number;
}

export class SharedCoreAnimator {
  #cy: Core;
  #backgroundOperator: BackgroundOperator;
  #analyzer: TransitionAnalysisOperator;
  #ghostOperator: GhostOperator;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;
    this.#backgroundOperator = new BackgroundOperator(cy, backgroundRenderer);
    this.#analyzer = new TransitionAnalysisOperator(cy);
    this.#ghostOperator = new GhostOperator(cy);
  }

  // ==========================================================================
  // SHARED PHASE EXECUTION (New Parallel Logic)
  // ==========================================================================

  async executeSharedPhase(
    sharedElements: NodeId[],
    currentScene: Scene,
    targetScene: Scene,
    targetPositions: TargetPositions,
    targetScales: Record<NodeId, number>,
    isNewScene: boolean
  ): Promise<void> {
    const { morphDuration, morphDelay, crossfadeTiming } = this.#getMorphTiming();
    const bgTiming = getSetting('transition.sharedBackgroundTiming') as SharedBackgroundTiming;

    // 2.0: Analyze shared elements
    const analysis = this.#analyzer.analyze(sharedElements, currentScene, targetScene);
    await waitForStep('[2.0] Analyze complete — ghosts not yet created');

    // 2.1: Create ghosts (old-design clones)
    await this.#ghostOperator.createGhosts(analysis, currentScene);
    await waitForStep('[2.1] Ghosts created — real elements not yet switched');

    // 2.2: Switch real elements to new design (hidden at opacity 0)
    await this.#setupRealElementsForCrossfade(analysis, targetScene);
    await waitForStep('[2.2] Real elements switched to new design (hidden) — before animations');

    // 2.3: Background fade-out (sequential mode only)
    if (bgTiming === 'sequential') {
      await this.#backgroundOperator.fadeOutBackground();
      await this.#backgroundOperator.loadBackground(targetScene);
      this.#backgroundOperator.setCanvasOpacity(0);
      await waitForStep('[2.3] Background faded out (sequential) — before parallel animations');
    }

    // 2.4: Execute parallel animations
    const animations: Promise<void>[] = [];

    // A. Background crossfade (parallel mode only)
    if (bgTiming === 'parallel') {
      animations.push(this.#backgroundOperator.crossfadeBackground(targetScene, morphDuration));
    }

    // B + C. Node motion and viewport, driven together in render (screen) space
    //        so shared elements follow straight-line rendered trajectories even
    //        when the two scenes differ in zoom/pan (see #animateSharedMotion).
    const morphToViewport = !isNewScene && targetScene.viewport?.zoom > 0;
    const targetZoom = morphToViewport ? targetScene.viewport.zoom : this.#cy.zoom();
    const targetPan = morphToViewport ? resolveScenePan(targetScene, this.#cy) : this.#cy.pan();
    if (morphToViewport && isDebug('d_transition')) {
      console.log(`[d_transition] Viewport animation: current zoom=${this.#cy.zoom().toFixed(4)} → target zoom=${targetZoom.toFixed(4)}`);
    }
    animations.push(
      this.#animateSharedMotion(analysis, targetPositions, targetScales, targetZoom, targetPan, morphDuration)
    );

    // C. Node crossfades (opacity only — position handled by #animateSharedMotion)
    animations.push(this.#animateNodeCrossfades(analysis, crossfadeTiming));

    // D. Edges (tween + crossfade)
    animations.push(this.#animateEdges(analysis, targetScene, morphDuration, crossfadeTiming));

    await Promise.all(animations);
    await waitForStep('[2.4] Parallel animations complete — before cleanup');

    // 2.5: Cleanup ghosts and their stylesheet rules
    this.#removeGhostStylesheetRules();
    this.#ghostOperator.cleanup();
    this.#finalizeRealElements(analysis);

    // 2.5b: Update stylesheet for moveOnly nodes with scale changes
    await this.#commitMoveOnlyScales(analysis.nodes.moveOnly, targetScales, targetScene);

    // 2.6: Background fade-in (sequential mode only)
    if (bgTiming === 'sequential') {
      await this.#backgroundOperator.fadeInBackground();
    }

    // Update node/edge data to reflect new state (deferred from setup)
    this.#commitNodeData(analysis);
    this.#commitEdgeData(analysis, targetScene);

    await this.#delay(morphDelay);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  #getMorphTiming(): { morphDuration: number; morphDelay: number; crossfadeTiming: CrossfadeTiming } {
    const [duration, delay] = getSetting('transition.morphDuration') as [number, number];
    const overlapPercent = getSetting('transition.morphCrossfadeOverlap') as number;
    return {
      morphDuration: duration,
      morphDelay: delay,
      crossfadeTiming: calculateCrossfadeTiming(overlapPercent, duration)
    };
  }

  /**
   * Hide real crossfade elements and update stylesheet to new design.
   * Also adds ghost stylesheet rules so both ghosts and real nodes are
   * styled via the stylesheet. Only opacity is set as a bypass.
   * Node data updates are deferred to #commitNodeData after animation.
   */
  async #setupRealElementsForCrossfade(
    analysis: TransitionAnalysis,
    targetScene: Scene
  ): Promise<void> {
    const themeId = targetScene.themeId || 'dark';

    // 1. Clear all inline bypasses and hide real crossfade elements.
    this.#cy.startBatch();
    for (const change of analysis.nodes.crossfade) {
      const node = this.#cy.getElementById(change.nodeId);
      if (node.length > 0) {
        node.removeStyle();
        node.style('opacity', 0);
      }
    }
    for (const change of analysis.edges.crossfade) {
      const edge = this.#cy.getElementById(change.edgeId);
      if (edge.length > 0) {
        edge.removeStyle();
        edge.style('opacity', 0);
      }
    }
    this.#cy.endBatch();

    // 2. Build combined stylesheet: real nodes (new design) + ghosts (old design)
    const currentStylesheet = (this.#cy.style() as any).json();

    // DIAG: log per-edge rules in current stylesheet
    if (isDebug('d_ghost')) {
      for (const change of analysis.edges.crossfade) {
        const sel = `edge[id = "${change.edgeId}"]`;
        const rule = currentStylesheet.find((r: any) => r.selector === sel);
        console.log(`[d_ghost] ${change.edgeId}: currentRule=`, rule ? rule.style : 'NONE');
      }
    }
    const stylesheetNodes = analysis.nodes.crossfade
      .map(c => ({
        nodeId: c.nodeId,
        nodeData: graphStore.nodes.find(n => n.id === c.nodeId)!,
        design: c.newDesign,
        scale: c.newScale
      }))
      .filter(n => !!n.nodeData);

    let updatedStylesheet = await StyleGenerator.addNodesToStylesheet(
      currentStylesheet,
      stylesheetNodes,
      themeId
    );

    // Update base 'edge' rule to target theme (for tween edges that rely on it)
    const baseEdgeRule = StyleGenerator.generateEdgeStyle(themeId);
    const baseEdgeIndex = updatedStylesheet.findIndex((r: any) => r.selector === 'edge');
    if (baseEdgeIndex !== -1) {
      updatedStylesheet[baseEdgeIndex] = baseEdgeRule;
    }

    updatedStylesheet = StyleGenerator.updateEdgeTypesInStylesheet(
      updatedStylesheet,
      graphStore.edgeTypes,
      themeId
    );
    updatedStylesheet = StyleGenerator.updateEdgeTypeVisibilityInStylesheet(
      updatedStylesheet,
      targetScene.edgeTypeVisibility
    );

    for (const change of analysis.edges.crossfade) {
      const newStyle = this.#resolveEdgeTargetStyle(change.edgeId, targetScene);
      updatedStylesheet = StyleGenerator.updateEdgeInStylesheet(
        updatedStylesheet,
        change.edgeId,
        newStyle
      );
    }

    // Update per-edge stylesheet rules for tween edges (new target style)
    for (const edgeId of analysis.edges.tween) {
      const targetDesign = targetScene.edges?.[edgeId]?.design;
      if (!StyleGenerator.hasEdgeStyleOverride(targetDesign)) continue;
      const newStyle = this.#resolveEdgeTargetStyle(edgeId, targetScene);
      updatedStylesheet = StyleGenerator.updateEdgeInStylesheet(
        updatedStylesheet,
        edgeId as any,
        newStyle
      );
    }

    // Add ghost rules AFTER existing rules so they aren't overridden
    // by the base 'edge' selector (Cytoscape: later rules win)
    const ghostRules = this.#ghostOperator.getStylesheetRules();
    updatedStylesheet = [...updatedStylesheet, ...ghostRules];

    // Append central/selected rules at the very end (must win over per-node rules)
    // Filter out any existing central/selected rules first to avoid duplicates
    updatedStylesheet = updatedStylesheet.filter(
      (r: any) =>
        r.selector !== 'node[?centralNode]' &&
        r.selector !== 'node:selected' &&
        r.selector !== 'node[?centralNode]:selected'
    );
    updatedStylesheet = [
      ...updatedStylesheet,
      ...StyleGenerator.buildCentralAndSelectedRules(themeId)
    ];

    // 3. Apply combined stylesheet and reveal ghosts
    // DIAG: log ghost rules and per-edge rules in final stylesheet
    if (isDebug('d_ghost')) {
      for (const change of analysis.edges.crossfade) {
        const realSel = `edge[id = "${change.edgeId}"]`;
        const realRule = updatedStylesheet.find((r: any) => r.selector === realSel);
        console.log(`[d_ghost] ${change.edgeId}: finalRule=`, realRule ? realRule.style : 'NONE');

        const ghostId = this.#ghostOperator.getGhostFor(change.edgeId)?.id();
        if (ghostId) {
          const ghostSel = `edge[id = "${ghostId}"]`;
          const ghostRule = updatedStylesheet.find((r: any) => r.selector === ghostSel);
          console.log(`[d_ghost] ${change.edgeId}: ghostId=${ghostId} ghostRule=`, ghostRule ? JSON.stringify(ghostRule.style) : 'NONE');
        } else {
          console.log(`[d_ghost] ${change.edgeId}: NO GHOST FOUND`);
        }
      }
    }
    this.#cy.style().fromJson(updatedStylesheet).update();
    this.#ghostOperator.revealGhosts();

    // DIAG: log computed style after update (both real and ghost)
    if (isDebug('d_ghost')) {
      for (const change of analysis.edges.crossfade) {
        const edge = this.#cy.getElementById(change.edgeId);
        console.log(`[d_ghost] ${change.edgeId}: REAL AFTER color=${edge.style('line-color')} curve=${edge.style('curve-style')} opacity=${edge.style('opacity')}`);

        const ghost = this.#ghostOperator.getGhostFor(change.edgeId);
        if (ghost?.length > 0) {
          console.log(`[d_ghost] ${change.edgeId}: GHOST AFTER color=${ghost.style('line-color')} curve=${ghost.style('curve-style')} opacity=${ghost.style('opacity')}`);
        }
      }
    }
  }

  /**
   * Ensure all crossfade and tween elements are finalized after animation.
   * Removes inline overrides so stylesheet takes control.
   */
  #finalizeRealElements(analysis: TransitionAnalysis): void {
    this.#cy.startBatch();
    for (const change of analysis.nodes.crossfade) {
      this.#cy.getElementById(change.nodeId).removeStyle('opacity');
    }
    for (const change of analysis.edges.crossfade) {
      this.#cy.getElementById(change.edgeId).removeStyle('opacity');
    }
    // Remove tween animation bypasses so stylesheet rules take over
    for (const edgeId of analysis.edges.tween) {
      this.#cy.getElementById(edgeId).removeStyle('line-color width line-opacity target-arrow-color opacity');
    }
    this.#cy.endBatch();
  }

  /** Remove ghost stylesheet rules after animation. */
  #removeGhostStylesheetRules(): void {
    const stylesheet = (this.#cy.style() as any).json();
    const cleaned = stylesheet.filter(
      (r: any) => !r.selector?.includes('ghost_')
    );
    this.#cy.style().fromJson(cleaned).update();
  }

  /**
   * Commit node data (design/scale) after animations are done.
   * Deferred from setup to avoid conflicting with animation.
   */
  #commitNodeData(analysis: TransitionAnalysis): void {
    this.#cy.startBatch();
    for (const change of analysis.nodes.crossfade) {
      const node = this.#cy.getElementById(change.nodeId);
      if (node.length > 0) {
        node.data('design', change.newDesign);
        node.data('scale', change.newScale);
        node.removeStyle('width height');
      }
    }
    this.#cy.endBatch();
  }

  /**
   * Update stylesheet for moveOnly nodes whose scale changed.
   * Must run BEFORE removeStyle('width height') so the node falls back
   * to the correct stylesheet dimensions instead of the old ones.
   */
  async #commitMoveOnlyScales(
    moveOnlyNodes: NodeId[],
    targetScales: Record<NodeId, number>,
    targetScene: Scene
  ): Promise<void> {
    const themeId = targetScene.themeId || 'dark';
    let stylesheet = (this.#cy.style() as any).json();
    const changed: { nodeId: NodeId; newScale: number }[] = [];

    for (const nodeId of moveOnlyNodes) {
      const node = this.#cy.getElementById(nodeId);
      if (node.length === 0) continue;

      const oldScale = node.data('scale') || 1.0;
      const newScale = targetScales[nodeId] || 1.0;
      if (oldScale === newScale) continue;

      const nodeData = graphStore.nodes.find(n => n.id === nodeId);
      if (!nodeData) continue;

      const design = node.data('design');
      stylesheet = await StyleGenerator.updateNodeInStylesheet(
        stylesheet, nodeId, nodeData, design, newScale, themeId
      );
      changed.push({ nodeId, newScale });
    }

    if (changed.length > 0) {
      this.#cy.style().fromJson(stylesheet).update();

      this.#cy.startBatch();
      for (const { nodeId, newScale } of changed) {
        const node = this.#cy.getElementById(nodeId);
        node.data('scale', newScale);
        node.removeStyle('width height');
        if (isDebug('d_transition')) {
          console.log(`[d_transition] moveOnly ${nodeId}: stylesheet updated, scale committed to ${newScale}, width=${node.width().toFixed(1)}`);
        }
      }
      this.#cy.endBatch();
    }
  }

  /**
   * Commit edge design data after animations are done.
   * Ensures cyEdge.data('design') matches the target scene so graphSaver
   * persists the correct design when it next syncs.
   */
  #commitEdgeData(analysis: TransitionAnalysis, targetScene: Scene): void {
    this.#cy.startBatch();
    for (const change of analysis.edges.crossfade) {
      const edge = this.#cy.getElementById(change.edgeId);
      if (edge.length > 0) {
        edge.data('design', change.newParams);
      }
    }
    // Also commit data for tween edges (color/width changes)
    for (const edgeId of analysis.edges.tween) {
      const edge = this.#cy.getElementById(edgeId);
      if (edge.length > 0) {
        const newDesign = targetScene.edges?.[edgeId]?.design ?? null;
        edge.data('design', newDesign);
      }
    }
    this.#cy.endBatch();
  }

  /**
   * Phase 2 core motion: move all shared elements AND the viewport together,
   * driven in render (screen) space via a single rAF loop.
   *
   * Each shared node's RENDERED position is interpolated on a straight line
   * from start to target; the model position written each frame is back-solved
   * against that frame's animated viewport (`model = (rendered - pan) / zoom`).
   * This keeps the on-screen trajectory straight even when the departing and
   * arriving scenes differ in zoom/pan — animating model position and zoom
   * independently would bend the path, because the rendered position is the
   * product `zoom(t)·position(t)`, which is non-linear in time.
   *
   * Opacity crossfades and edge tweens are time-based and handled separately.
   */
  #animateSharedMotion(
    analysis: TransitionAnalysis,
    targetPositions: TargetPositions,
    targetScales: Record<NodeId, number>,
    targetZoom: number,
    targetPan: Position,
    duration: number
  ): Promise<void> {
    return new Promise(resolve => {
      const cy = this.#cy;
      const z0 = cy.zoom();
      const pan0: Position = { ...cy.pan() };
      const z1 = targetZoom;
      const pan1: Position = { x: targetPan.x, y: targetPan.y };
      const viewportMoves = z0 !== z1 || pan0.x !== pan1.x || pan0.y !== pan1.y;

      const movers: Mover[] = [];
      const addMover = (
        ele: any,
        target: Position | undefined,
        scaleFrom?: number,
        scaleTo?: number
      ): void => {
        if (!ele || ele.length === 0 || !target) return;
        const p0 = ele.position();
        const mover: Mover = {
          ele,
          r0: { x: z0 * p0.x + pan0.x, y: z0 * p0.y + pan0.y },
          r1: { x: z1 * target.x + pan1.x, y: z1 * target.y + pan1.y },
          target: { x: target.x, y: target.y }
        };
        if (scaleFrom !== undefined && scaleTo !== undefined && scaleFrom !== scaleTo) {
          const ratio = scaleTo / scaleFrom;
          mover.w0 = ele.width();
          mover.h0 = ele.height();
          mover.w1 = mover.w0 * ratio;
          mover.h1 = mover.h0 * ratio;
        }
        movers.push(mover);
      };

      // Move-only nodes: position (+ scale if changed)
      for (const nodeId of analysis.nodes.moveOnly) {
        const node = cy.getElementById(nodeId);
        const oldScale = node.data('scale') || 1.0;
        const newScale = targetScales[nodeId] || 1.0;
        addMover(node, targetPositions[nodeId], oldScale, newScale);
      }

      // Crossfade nodes: real + ghost move to the same target (opacity handled elsewhere)
      for (const change of analysis.nodes.crossfade) {
        const targetPos = targetPositions[change.nodeId];
        addMover(cy.getElementById(change.nodeId), targetPos);
        addMover(this.#ghostOperator.getGhostFor(change.nodeId), targetPos);
      }

      if (!viewportMoves && movers.length === 0) {
        resolve();
        return;
      }

      const start = performance.now();
      const step = (now: number): void => {
        const raw = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
        const e = easeInOutCubic(raw);
        const z = z0 + e * (z1 - z0);
        const px = pan0.x + e * (pan1.x - pan0.x);
        const py = pan0.y + e * (pan1.y - pan0.y);

        cy.startBatch();
        if (viewportMoves) cy.viewport({ zoom: z, pan: { x: px, y: py } });
        for (const m of movers) {
          const rx = m.r0.x + e * (m.r1.x - m.r0.x);
          const ry = m.r0.y + e * (m.r1.y - m.r0.y);
          m.ele.position({ x: (rx - px) / z, y: (ry - py) / z });
          if (m.w1 !== undefined) {
            m.ele.style({
              width: m.w0! + e * (m.w1 - m.w0!),
              height: m.h0! + e * (m.h1! - m.h0!)
            });
          }
        }
        cy.endBatch();

        if (raw < 1) {
          requestAnimationFrame(step);
          return;
        }

        // Snap to exact final state to avoid rounding drift.
        cy.startBatch();
        if (viewportMoves) cy.viewport({ zoom: z1, pan: { x: pan1.x, y: pan1.y } });
        for (const m of movers) {
          m.ele.position({ x: m.target.x, y: m.target.y });
          if (m.w1 !== undefined) m.ele.style({ width: m.w1, height: m.h1! });
        }
        cy.endBatch();
        resolve();
      };

      requestAnimationFrame(step);
    });
  }

  /** Crossfade opacity for shared nodes (ghost fades out, real fades in). */
  async #animateNodeCrossfades(
    analysis: TransitionAnalysis,
    timing: CrossfadeTiming
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const change of analysis.nodes.crossfade) {
      const ghost = this.#ghostOperator.getGhostFor(change.nodeId);
      if (ghost.length > 0) {
        promises.push(new Promise<void>(res => {
          const fadeOut = ghost.animation(
            { style: { opacity: 0 } },
            { duration: timing.fadeOutDuration, easing: 'ease-in' }
          );
          fadeOut.play();
          fadeOut.promise().then(() => res());
        }));
      }

      const realNode = this.#cy.getElementById(change.nodeId);
      if (realNode.length > 0) {
        promises.push(this.#delayedFadeIn(realNode, timing.fadeInDelay, timing.fadeInDuration));
      }
    }

    await Promise.all(promises);
  }

  async #animateEdges(
    analysis: TransitionAnalysis,
    targetScene: Scene,
    duration: number,
    timing: CrossfadeTiming
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    // 1. Tween edges: animate color, width, opacity
    for (const edgeId of analysis.edges.tween) {
      const edge = this.#cy.getElementById(edgeId);
      if (edge.length === 0) continue;

      const targetStyle = this.#resolveEdgeTargetStyle(edgeId, targetScene);

      const animStyle = {
        'line-color': targetStyle['line-color'],
        'width': targetStyle['width'],
        'line-opacity': targetStyle['line-opacity'] ?? 1,
        'target-arrow-color': targetStyle['target-arrow-color'],
        'opacity': typeof targetStyle.opacity === 'number' ? targetStyle.opacity : 1
      };

      promises.push(this.#runAnimation(edge, { style: animStyle }, duration));
    }

    // 2. Crossfade edges: ghost fades out, real fades in (using .delay().animate())
    for (const change of analysis.edges.crossfade) {
      const ghostEdge = this.#ghostOperator.getGhostFor(change.edgeId);
      const realEdge = this.#cy.getElementById(change.edgeId);

      if (ghostEdge.length > 0) {
        promises.push(this.#runAnimation(
          ghostEdge, { style: { opacity: 0 } }, timing.fadeOutDuration
        ));
      }
      if (realEdge.length > 0) {
        promises.push(this.#delayedFadeIn(
          realEdge,
          timing.fadeInDelay,
          timing.fadeInDuration,
          this.#resolveEdgeTargetOpacity(change.edgeId, targetScene)
        ));
      }
    }

    await Promise.all(promises);
  }

  // Central node styling is handled by transition.ts after all phases complete.
  // No #unlockCentralNode needed here — avoids double-application.

  #runAnimation(ele: any, params: any, duration: number): Promise<void> {
    return new Promise(resolve => {
      ele.animate(params, {
        duration,
        easing: 'ease-in-out-cubic',
        complete: () => resolve()
      });
    });
  }

  #resolveEdgeTargetStyle(edgeId: string, scene: Scene): Record<string, unknown> {
    const edgeData = graphStore.edges.find(edge => edge.id === edgeId);
    if (!edgeData) return StyleGenerator.generateEdgeStyle(scene.themeId || 'dark').style;
    return resolveSceneEdgeVisualState({
      edge: edgeData,
      scene,
      edgeTypes: graphStore.edgeTypes,
      themeId: scene.themeId || 'dark'
    }).style;
  }

  #resolveEdgeTargetOpacity(edgeId: string, scene: Scene): number {
    const targetStyle = this.#resolveEdgeTargetStyle(edgeId, scene);
    return typeof targetStyle.opacity === 'number' ? targetStyle.opacity : 1;
  }

  /** Wait, then fade element from opacity 0 to its target opacity. Uses .animation().play() for clean timing. */
  #delayedFadeIn(ele: any, delayMs: number, fadeDuration: number, targetOpacity = 1): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        const fadeIn = ele.animation(
          { style: { opacity: targetOpacity } },
          { duration: fadeDuration, easing: 'ease-out' }
        );
        fadeIn.play();
        fadeIn.promise().then(resolve);
      }, delayMs);
    });
  }

  async #delay(ms: number): Promise<void> {
    if (ms <= 0) return;
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // BACKGROUND DELEGATIONS (used by PhaseOrchestrator)
  // ==========================================================================

  async loadBackground(scene: Scene): Promise<void> {
    return this.#backgroundOperator.loadBackground(scene);
  }

  clearBackground(): void {
    this.#backgroundOperator.clearBackground();
  }
}

