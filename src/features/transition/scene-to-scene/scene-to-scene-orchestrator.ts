/**
 * SceneToSceneOrchestrator
 *
 * Layer 1 orchestrator of the three-phase transition from one scene to
 * another on the instance (scene-transitions.md §4.2): classification, then
 * departure, morphing, arrival, each run by the animator the recipe names
 * (recipe.ts, animators.ts), with the glue between them that belongs to no
 * phase: the central flag swapped and the canvas theme crossfaded before
 * morphing, fold state, the invariant and the stylesheet reconciliation after
 * arrival. `transition` takes both scenes as objects and leaves the instance
 * showing the second; it never decides which scene is current, never saves
 * and never announces, which is Transition's.
 *
 * Creates its Layer 2 animators through the registry, one per id, kept for
 * reuse, and knows no implementation; owns its FoldStateHandler.
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene } from '../../../core/main-types';
import type { TransitionElements, InstanceView } from '../element-classification-utils';
import type { BackgroundRenderer } from '../../../background/background-renderer';
import type { ArrivalAnimator, DepartureAnimator, MorphingAnimator, Position } from './animators';
import type { TransitionRecipe } from './recipe';

import { graphStore } from '../../../storage/graph-store';
import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';
import { getTheme } from '../../../styles/themes';
import { StyleGenerator } from '../../../styles/style-generator';

import { resolveRecipe } from './recipe';
import { createArrivalAnimator, createDepartureAnimator, createMorphingAnimator } from './animator-registry';
import { FoldStateHandler } from '../fold-state-handler';
import { checkSceneInvariant } from '../transition-invariants';
import { applyCanvasTheme } from '../../../styles/canvas-theme';
import { classifyElements, buildTargetPositions, foldsDiffer, reclassifyForFold, keepAnimatedEdges } from '../element-classification-utils';

// ============================================================================
// TYPES
// ============================================================================

/** What a transition classified and how the viewport moved, for the dev transition record Transition keeps. */
export interface TransitionReport {
  shared: { nodes: NodeId[]; edges: EdgeId[] };
  departing: { nodes: NodeId[]; edges: EdgeId[] };
  arriving: { nodes: NodeId[]; edges: EdgeId[] };
  viewport: { fromZoom: number; toZoom: number } | null;
}

/** What a caller may ask of one transition beyond the two scenes. */
export interface TransitionRequest {
  /** Which animator does each phase; what is left out comes from the settings. */
  recipe?: Partial<TransitionRecipe>;
}

export interface TransitionOptions extends TransitionRequest {
  isNewScene: boolean;
}

// ============================================================================
// SCENE-TO-SCENE ORCHESTRATOR CLASS
// ============================================================================

export class SceneToSceneOrchestrator {
  #cy: Core;
  #backgroundRenderer: BackgroundRenderer;
  #departures = new Map<string, DepartureAnimator>();
  #morphings = new Map<string, MorphingAnimator>();
  #arrivals = new Map<string, ArrivalAnimator>();
  #foldState: FoldStateHandler;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;
    this.#backgroundRenderer = backgroundRenderer;
    this.#foldState = new FoldStateHandler(cy);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /** The transition from `currentScene`, which the instance shows, to `targetScene`. */
  async transition(currentScene: Scene, targetScene: Scene, options: TransitionOptions): Promise<TransitionReport> {
    const extent = this.#cy.extent();
    const viewportCenter: Position = { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 };
    const recipe = resolveRecipe(options.recipe);

    if (isDebug('d_transition')) {
      console.log(`[d_transition] recipe: ${recipe.departure} / ${recipe.morphing} / ${recipe.arrival}`);
      console.log(`[d_transition] currentScene (${currentScene.id}) edges:`, Object.keys(currentScene.edges));
      console.log(`[d_transition] targetScene (${targetScene.id}) edges:`, Object.keys(targetScene.edges));
      console.log(`[d_transition] Cytoscape edges:`, this.#cy.edges().map(e => e.id()));
    }

    // Classify elements and build target positions
    const elements = classifyElements(currentScene, targetScene, this.#cy.edges());
    const { positions: targetPositions, scales: targetScales } = buildTargetPositions(targetScene);
    if (foldsDiffer(currentScene, targetScene)) {
      const view = this.#instanceView();
      reclassifyForFold(elements, currentScene, targetScene, view);
      this.#removeHiddenStowaways(elements.arrivingNodes);
      keepAnimatedEdges(elements, view);
    }

    if (isDebug('d_transition')) console.log('[d_transition] Elements:', elements);
    if (isDebug('d_transition')) console.log('[d_transition] Target positions from scene:', targetScene.id, targetPositions);

    const report: TransitionReport = {
      shared: { nodes: elements.sharedNodes.slice(), edges: elements.sharedEdges.slice() },
      departing: { nodes: elements.departingNodes.slice(), edges: elements.departingEdges.slice() },
      arriving: { nodes: elements.arrivingNodes.slice(), edges: elements.arrivingEdges.slice() },
      viewport: targetScene.viewport?.zoom > 0 ? { fromZoom: this.#cy.zoom(), toZoom: targetScene.viewport.zoom } : null,
    };

    // Phase 1
    await this.#departure(recipe).run({
      nodes: elements.departingNodes,
      edges: elements.departingEdges,
      currentScene,
      targetScene,
      viewportCenter,
    });

    // Swap central node styling before movement — hints causality:
    // "we chose a new center, now everything rearranges"
    const targetThemeId = targetScene.themeId || 'dark';
    this.#swapCentralFlag(currentScene.centralNodeId, targetScene.centralNodeId);

    // Crossfade canvas background to target theme during morphing
    const morphDuration = getSetting('transition.morphDuration');
    applyCanvasTheme(this.#cy.container(), getTheme(targetThemeId), morphDuration[0]);

    // Phase 2
    await this.#morphing(recipe).run({
      nodes: elements.sharedNodes,
      currentScene,
      targetScene,
      targetPositions,
      targetScales,
      isNewScene: options.isNewScene,
    });

    // Phase 3
    await this.#arrival(recipe).run({
      ...this.#arrivingAfterMorphing(elements, targetScene),
      targetScene,
      targetPositions,
      viewportCenter,
    });

    // Apply fold state for target scene: add hidden nodes, hide them, write scratch
    await this.#foldState.apply(targetScene, targetThemeId);

    // Verify cy matches target scene before resume — catches any class of bug
    // that leaves cy out of sync, which would otherwise corrupt the DB silently
    // on the next GraphSaver sync.
    checkSceneInvariant(this.#cy, targetScene, 'transition');

    this.#reconcileStylesheet(targetScene, targetThemeId);

    if (isDebug('d_transition')) {
      console.log(`[d_transition] After transition, Cytoscape edges:`, this.#cy.edges().map(e => e.id()));
      console.log(`[d_transition] targetScene.edges should be:`, Object.keys(targetScene.edges));
    }
    return report;
  }

  // ==========================================================================
  // THE ANIMATORS
  // ==========================================================================

  #departure(recipe: TransitionRecipe): DepartureAnimator {
    let animator = this.#departures.get(recipe.departure);
    if (!animator) {
      animator = createDepartureAnimator(recipe.departure, this.#cy);
      this.#departures.set(recipe.departure, animator);
    }
    return animator;
  }

  #morphing(recipe: TransitionRecipe): MorphingAnimator {
    let animator = this.#morphings.get(recipe.morphing);
    if (!animator) {
      animator = createMorphingAnimator(recipe.morphing, this.#cy, this.#backgroundRenderer);
      this.#morphings.set(recipe.morphing, animator);
    }
    return animator;
  }

  #arrival(recipe: TransitionRecipe): ArrivalAnimator {
    let animator = this.#arrivals.get(recipe.arrival);
    if (!animator) {
      animator = createArrivalAnimator(recipe.arrival, this.#cy);
      this.#arrivals.set(recipe.arrival, animator);
    }
    return animator;
  }

  /**
   * The coupling between morphing and arrival (animators.ts): a new central
   * that is arriving is brought in by the morphing phase, so arrival gets the
   * other arriving nodes, and the arriving edges minus those between that
   * central and shared nodes, which morphing faded in with it.
   */
  #arrivingAfterMorphing(elements: TransitionElements, targetScene: Scene): { nodes: NodeId[]; edges: EdgeId[] } {
    const centralId = targetScene.centralNodeId;
    if (!elements.arrivingNodes.includes(centralId)) {
      return { nodes: elements.arrivingNodes, edges: elements.arrivingEdges };
    }
    const sharedSet = new Set(elements.sharedNodes);
    const edges = elements.arrivingEdges.filter(edgeId => {
      const edge = graphStore.edges.find(e => e.id === edgeId);
      if (!edge) return true;
      const centralToShared =
        (edge.sourceId === centralId && sharedSet.has(edge.targetId)) ||
        (edge.targetId === centralId && sharedSet.has(edge.sourceId));
      return !centralToShared;
    });
    return { nodes: elements.arrivingNodes.filter(id => id !== centralId), edges };
  }

  // ==========================================================================
  // CLASSIFICATION SUPPORT
  // ==========================================================================

  /** Endpoints from the instance when the edge is drawn, from the store otherwise. */
  #instanceView(): InstanceView {
    return {
      endpointsOf: (edgeId: EdgeId): [NodeId, NodeId] | null => {
        const cyEdge = this.#cy.getElementById(edgeId as string);
        if (cyEdge.length > 0) {
          return [cyEdge.source().id() as NodeId, cyEdge.target().id() as NodeId];
        }
        const edgeData = graphStore.edges.find(e => e.id === edgeId);
        if (!edgeData) return null;
        return [edgeData.sourceId, edgeData.targetId];
      },
      isPresent: (nodeId: NodeId): boolean => this.#cy.getElementById(nodeId as string).length > 0,
    };
  }

  /**
   * Remove hidden stowaways that will arrive visibly. FoldStateHandler.apply()
   * from the previous transition may have added hidden nodes to cy; if they
   * are now classified as arriving, remove them so the arrival animator can add
   * them fresh.
   */
  #removeHiddenStowaways(arrivingNodes: NodeId[]): void {
    for (const id of arrivingNodes) {
      const el = this.#cy.getElementById(id as string);
      if (el.length > 0 && el.style('display') === 'none') {
        if (isDebug('d_fold')) console.log(`[d_fold] Removing hidden stowaway before arrival: ${id}`);
        el.connectedEdges().remove();
        el.remove();
      }
    }
  }

  // ==========================================================================
  // GLUE BETWEEN PHASES
  // ==========================================================================

  /**
   * Update central node styling via data flag toggle. Cytoscape re-evaluates
   * selectors automatically when data changes; the node[?centralNode] rule in
   * the stylesheet handles the visual update.
   */
  #swapCentralFlag(oldCentralId: NodeId, newCentralId: NodeId): void {
    const oldNode = this.#cy.getElementById(oldCentralId);
    if (oldNode.length > 0) {
      oldNode.removeData('centralNode');
      if (isDebug('d_transition')) console.log(`[d_transition] Removed centralNode flag from ${oldCentralId}`);
    }

    const newNode = this.#cy.getElementById(newCentralId);
    if (newNode.length > 0) {
      newNode.data('centralNode', 1);
      if (isDebug('d_transition')) console.log(`[d_transition] Set centralNode flag on ${newCentralId}`);
    } else {
      console.warn(`[swapCentralFlag] New central node ${newCentralId} not found in Cytoscape`);
    }
  }

  /**
   * Prune per-edge rules not backed by the target scene. Departing edges'
   * elements are removed by the departure phase, but their per-edge rules
   * would otherwise survive the transition, leak stale bends/styles into edges
   * re-included later, and accumulate across transitions. Runs after ghost
   * cleanup and FoldStateHandler, so only real, target-scene rules remain.
   * Same for per-node rules: a transition adds rules for arriving nodes but never
   * removes them for departed ones, so they accumulate across a traversal,
   * each one holding an encoded SVG payload that is re-parsed on every later
   * stylesheet update. Folded nodes stay in `scene.nodes`, so their rules
   * survive; central/selected rules are not per-node and are rebuilt for the
   * target theme.
   */
  #reconcileStylesheet(targetScene: Scene, targetThemeId: string): void {
    const stylesheet = (this.#cy.style() as any).json();
    const prunedStylesheet = StyleGenerator.pruneStaleEdgeRules(stylesheet, targetScene);
    const nodePrunedStylesheet = StyleGenerator.pruneStaleNodeRules(prunedStylesheet, targetScene);
    const filteredStylesheet = nodePrunedStylesheet.filter(
      (r: { selector: string }) =>
        r.selector !== 'node[?centralNode]' &&
        r.selector !== 'node:selected' &&
        r.selector !== 'node[?centralNode]:selected'
    );
    this.#cy.style().fromJson([
      ...filteredStylesheet,
      ...StyleGenerator.buildCentralAndSelectedRules(targetThemeId)
    ]).update();
  }
}
