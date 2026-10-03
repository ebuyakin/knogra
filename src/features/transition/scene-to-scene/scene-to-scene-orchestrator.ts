/**
 * SceneToSceneOrchestrator
 *
 * Layer 1 orchestrator of the three-phase transition from one scene to
 * another on the instance (scene-transitions.md §4.2): classification, then
 * departure, morphing, arrival, with the central flag swapped and the canvas
 * theme crossfaded between them, then fold state, the invariant and the
 * stylesheet reconciliation. `transition` takes both scenes as objects and
 * leaves the instance showing the second; it never decides which scene is
 * current, never saves and never announces, which is Transition's.
 *
 * Owns DepartureAnimator, SharedCoreAnimator, ArrivalAnimator (Layer 2) and
 * its own FoldStateHandler.
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene } from '../../../core/main-types';
import type { TransitionElements, TargetPositions, InstanceView } from '../element-classification-utils';
import type { BackgroundRenderer } from '../../../background/background-renderer';

import { graphStore } from '../../../storage/graph-store';
import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';
import { getTheme } from '../../../styles/themes';
import { StyleGenerator } from '../../../styles/style-generator';

import { DepartureAnimator } from './departure-fly-out';
import { SharedCoreAnimator } from './morphing-parallel';
import { ArrivalAnimator } from './arrival-fly-in';
import { FoldStateHandler } from '../fold-state-handler';
import { checkSceneInvariant } from '../transition-invariants';
import { applyCanvasTheme } from '../canvas-theme-operator';
import { classifyElements, buildTargetPositions, foldsDiffer, reclassifyForFold, keepAnimatedEdges } from '../element-classification-utils';
import { waitForStep } from '../step-debug';

// ============================================================================
// TYPES
// ============================================================================

interface Position {
  x: number;
  y: number;
}

/** What a transition classified and how the viewport moved, for the dev transition record Transition keeps. */
export interface TransitionReport {
  shared: { nodes: NodeId[]; edges: EdgeId[] };
  departing: { nodes: NodeId[]; edges: EdgeId[] };
  arriving: { nodes: NodeId[]; edges: EdgeId[] };
  viewport: { fromZoom: number; toZoom: number } | null;
}

// ============================================================================
// SCENE-TO-SCENE ORCHESTRATOR CLASS
// ============================================================================

export class SceneToSceneOrchestrator {
  #cy: Core;
  #departureAnimator: DepartureAnimator;
  #sharedCoreAnimator: SharedCoreAnimator;
  #arrivalAnimator: ArrivalAnimator;
  #foldState: FoldStateHandler;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;
    this.#departureAnimator = new DepartureAnimator(cy);
    this.#sharedCoreAnimator = new SharedCoreAnimator(cy, backgroundRenderer);
    this.#arrivalAnimator = new ArrivalAnimator(cy);
    this.#foldState = new FoldStateHandler(cy);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /** The transition from `currentScene`, which the instance shows, to `targetScene`. */
  async transition(currentScene: Scene, targetScene: Scene, options: { isNewScene: boolean }): Promise<TransitionReport> {
    const extent = this.#cy.extent();
    const viewportCenter: Position = { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 };

    if (isDebug('d_transition')) {
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

    await this.#departure(elements, currentScene, targetScene, viewportCenter);

    // Swap central node styling before movement — hints causality:
    // "we chose a new center, now everything rearranges"
    const targetThemeId = targetScene.themeId || 'dark';
    this.#swapCentralFlag(currentScene.centralNodeId, targetScene.centralNodeId);

    // Crossfade canvas background to target theme during morphing
    const morphDuration = getSetting('transition.morphDuration');
    applyCanvasTheme(this.#cy.container(), getTheme(targetThemeId), morphDuration[0]);

    await this.#morphing(elements, currentScene, targetScene, targetPositions, targetScales, options.isNewScene);
    await this.#arrival(elements, targetScene, targetPositions, viewportCenter);

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
   * are now classified as arriving, remove them so ArrivalAnimator can add
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

  // ==========================================================================
  // PHASE 1: DEPARTURE
  // ==========================================================================

  /**
   * Phase 1: DEPARTURE
   * Handles removal of elements that exist in old scene but not in new scene
   */
  async #departure(
    elements: TransitionElements,
    currentScene: Scene,
    targetScene: Scene,
    viewportCenter: Position
  ): Promise<void> {
    const oldCentralDeparting = !targetScene.nodes[currentScene.centralNodeId];
    const edgeTiming = getSetting('transition.departureEdgeTiming');

    // Get old central node position for direction calculation
    const oldCentralNode = this.#cy.getElementById(currentScene.centralNodeId);
    const oldCentralPosition: Position = oldCentralNode.length > 0
      ? oldCentralNode.position()
      : viewportCenter;  // Fallback to viewport center

    if (isDebug('d_transition')) console.log(`[Transition.Departure] oldCentralDeparting: ${oldCentralDeparting}, edgeTiming: ${edgeTiming}`);
    await waitForStep('[1.0] Departure phase starting');

    if (edgeTiming === 'before') {
      // ── Mode A: Edges fade out first, then nodes cascade ──

      // Stage 1.1: All departing edges fade out
      await this.#departureAnimator.fadeOutEdges(elements.departingEdges);
      await waitForStep('[1.1] fadeOutEdges complete');

      if (oldCentralDeparting) {
        // Branch B: Old central is departing

        // Stage 1.2.B.1: Non-central nodes cascade fly-out (no edges — already faded)
        const nonCentralDeparting = elements.departingNodes.filter(
          id => id !== currentScene.centralNodeId
        );
        await this.#departureAnimator.flyOutNodes(
          nonCentralDeparting, [], currentScene.centralNodeId,
          oldCentralPosition, currentScene
        );
        await waitForStep('[1.2.B.1] flyOutNodes cascade (non-central) complete');

        // Stage 1.2.B.2: Central node zooms out (shrinks in place)
        await this.#departureAnimator.zoomOutCentralNode(currentScene.centralNodeId);
        await waitForStep('[1.2.B.2] zoomOutCentralNode complete');
      } else {
        // Branch A: Old central stays (is shared)

        // Stage 1.2.A: All departing nodes cascade fly-out (no edges — already faded)
        await this.#departureAnimator.flyOutNodes(
          elements.departingNodes, [], currentScene.centralNodeId,
          oldCentralPosition, currentScene
        );
        await waitForStep('[1.2.A] flyOutNodes cascade complete');
      }
    } else {
      // ── Mode B: Edges fade in parallel with nodes (cascaded per layer) ──

      if (oldCentralDeparting) {
        // Branch B: Old central is departing

        const nonCentralDeparting = elements.departingNodes.filter(
          id => id !== currentScene.centralNodeId
        );
        const centralId = currentScene.centralNodeId;

        // Split edges: central-connected vs non-central
        const centralEdges: string[] = [];
        const nonCentralEdges: string[] = [];
        for (const edgeId of elements.departingEdges) {
          const edge = this.#cy.getElementById(edgeId);
          if (edge.length === 0) continue;
          const srcId = edge.source().id();
          const tgtId = edge.target().id();
          if (srcId === centralId || tgtId === centralId) {
            centralEdges.push(edgeId);
          } else {
            nonCentralEdges.push(edgeId);
          }
        }

        // Stage 1.2.B.1: Non-central nodes cascade fly-out + their edges fade per layer
        await this.#departureAnimator.flyOutNodes(
          nonCentralDeparting, nonCentralEdges as any, currentScene.centralNodeId,
          oldCentralPosition, currentScene
        );
        await waitForStep('[1.2.B.1] flyOutNodes cascade + edges (non-central) complete');

        // Stage 1.2.B.2: Central node zooms out + its edges fade (parallel)
        await Promise.all([
          this.#departureAnimator.zoomOutCentralNode(centralId),
          this.#departureAnimator.fadeOutEdges(centralEdges as any)
        ]);
        await waitForStep('[1.2.B.2] zoomOutCentralNode + fadeOutEdges (central) complete');
      } else {
        // Branch A: Old central stays (is shared)

        // Stage 1.2.A: All departing nodes cascade fly-out + edges fade per layer
        await this.#departureAnimator.flyOutNodes(
          elements.departingNodes, elements.departingEdges,
          currentScene.centralNodeId, oldCentralPosition, currentScene
        );
        await waitForStep('[1.2.A] flyOutNodes cascade + edges complete');
      }
    }
  }

  // ==========================================================================
  // PHASE 2: MORPHING
  // ==========================================================================

  /**
   * Phase 2: MORPHING
   * The shared nodes, those in both scenes, move, rescale and crossfade design
   */
  async #morphing(
    elements: TransitionElements,
    currentScene: Scene,
    targetScene: Scene,
    targetPositions: TargetPositions,
    targetScales: Record<NodeId, number>,
    isNewScene: boolean
  ): Promise<void> {
    if (isDebug('d_transition')) console.log('[Transition.SharedMovement] Executing parallel shared phase');
    await waitForStep('[2.0] SharedMovement phase starting');

    await this.#sharedCoreAnimator.executeSharedPhase(
      elements.sharedNodes,
      currentScene,
      targetScene,
      targetPositions,
      targetScales,
      isNewScene
    );
    
    await waitForStep('[2.5] SharedMovement phase complete');
  }


  // ==========================================================================
  // PHASE 3: ARRIVAL
  // ==========================================================================

  /**
   * Phase 3: ARRIVAL
   * Handles entry of nodes that exist in new scene but not in old scene
   */
  async #arrival(
    elements: TransitionElements,
    targetScene: Scene,
    targetPositions: TargetPositions,
    viewportCenter: Position
  ): Promise<void> {
    // Get new central node position for direction calculation
    const newCentralPosition = targetPositions[targetScene.centralNodeId] ?? viewportCenter;

    // New central was handled in Phase 2.3.C, so filter it out
    const newCentralIsArriving = elements.arrivingNodes.includes(targetScene.centralNodeId);
    const nodesToFlyIn = newCentralIsArriving
      ? elements.arrivingNodes.filter(id => id !== targetScene.centralNodeId)
      : elements.arrivingNodes;

    // Filter edges: exclude edges between central and SHARED nodes (already faded in during 2.3.C.3)
    // But INCLUDE edges between central and ARRIVING nodes (they need to fade in here)
    const sharedSet = new Set(elements.sharedNodes);
    const edgesToFadeIn = newCentralIsArriving
      ? elements.arrivingEdges.filter(edgeId => {
          const edge = graphStore.edges.find(e => e.id === edgeId);
          if (!edge) return true;

          // Check if edge connects central to a shared node (already handled in 2.3.C.3)
          const centralToShared =
            (edge.sourceId === targetScene.centralNodeId && sharedSet.has(edge.targetId)) ||
            (edge.targetId === targetScene.centralNodeId && sharedSet.has(edge.sourceId));

          // Exclude only central-to-shared edges; keep central-to-arriving edges
          return !centralToShared;
        })
      : elements.arrivingEdges;

    const edgeTiming = getSetting('transition.arrivalEdgeTiming');

    if (isDebug('d_transition')) console.log(`[Transition.Arrival] nodesToFlyIn: ${nodesToFlyIn.length}, edgesToFadeIn: ${edgesToFadeIn.length}, edgeTiming: ${edgeTiming}`);
    await waitForStep('[3.0] Arrival phase starting');

    if (edgeTiming === 'after') {
      // ── Mode A: Nodes cascade fly-in, then edges fade in ──

      // Stage 3.1: Arriving nodes cascade fly-in (no edges — will fade after)
      await this.#arrivalAnimator.flyInNodes(
        nodesToFlyIn, [], targetPositions, newCentralPosition, targetScene
      );
      await waitForStep('[3.1] flyInNodes cascade complete');

      // Stage 3.2: Edges to arriving nodes fade in
      await this.#arrivalAnimator.fadeInEdges(edgesToFadeIn, targetScene);
      await waitForStep('[3.2] fadeInEdges complete');
    } else {
      // ── Mode B: Nodes cascade fly-in + edges fade per layer (parallel) ──

      // Stage 3.1+3.2: Nodes cascade fly-in with edges fading per layer
      await this.#arrivalAnimator.flyInNodes(
        nodesToFlyIn, edgesToFadeIn, targetPositions, newCentralPosition, targetScene
      );
      await waitForStep('[3.1+3.2] flyInNodes cascade + edges complete');
    }
  }
}
