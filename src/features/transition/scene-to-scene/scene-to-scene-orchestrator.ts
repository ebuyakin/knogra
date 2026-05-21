/**
 * SceneToSceneOrchestrator
 *
 * Layer 1 orchestrator for the three-phase transition animation sequence:
 * - Phase 1: Departure (elements leaving the scene)
 * - Phase 2: Shared Movement (elements transforming between scenes)
 * - Phase 3: Arrival (elements entering the scene)
 *
 * Owns DepartureAnimator, SharedCoreAnimator, ArrivalAnimator (Layer 2).
 */

import type { Core } from 'cytoscape';
import type { NodeId, Scene } from '../../../core/main-types';
import type { TransitionElements, TargetPositions } from '../element-classification-utils';
import type { BackgroundRenderer } from '../../../background/background-renderer';

import { graphStore } from '../../../storage/graph-store';
import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';

import { DepartureAnimator } from './departure-animator';
import { SharedCoreAnimator } from './shared-core-animator';
import { ArrivalAnimator } from './arrival-animator';

// ============================================================================
// DEBUG: Step-through mode (imported from transition.ts)
// ============================================================================

interface TransitionDebug {
  stepMode: boolean;
  continue: (() => void) | null;
}

/**
 * Pause at a step if stepMode is enabled
 * Access via window.transitionDebug in console
 */
async function waitForStep(stageName: string): Promise<void> {
  const transitionDebug = (window as any).transitionDebug as TransitionDebug | undefined;
  if (!transitionDebug?.stepMode) return;

  console.log(`\n⏸️  PAUSED: ${stageName}`);
  console.log(`   → Call transitionDebug.next() to continue\n`);

  return new Promise(resolve => {
    if (transitionDebug) {
      transitionDebug.continue = resolve;
    }
  });
}

export { waitForStep };

// ============================================================================
// TYPES
// ============================================================================

interface Position {
  x: number;
  y: number;
}

// ============================================================================
// SCENE-TO-SCENE ORCHESTRATOR CLASS
// ============================================================================

/**
 * Orchestrates the three-phase transition sequence.
 * Uses specialized animators for each phase.
 */
export class SceneToSceneOrchestrator {
  #cy: Core;
  #departureAnimator: DepartureAnimator;
  #sharedCoreAnimator: SharedCoreAnimator;
  #arrivalAnimator: ArrivalAnimator;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;
    this.#departureAnimator = new DepartureAnimator(cy);
    this.#sharedCoreAnimator = new SharedCoreAnimator(cy, backgroundRenderer);
    this.#arrivalAnimator = new ArrivalAnimator(cy);
  }

  // ==========================================================================
  // PHASE 1: DEPARTURE
  // ==========================================================================

  /**
   * Phase 1: DEPARTURE
   * Handles removal of elements that exist in old scene but not in new scene
   */
  async executeDeparture(
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
  // PHASE 2: SHARED MOVEMENT
  // ==========================================================================

  /**
   * Phase 2: SHARED MOVEMENT
   * Handles transformation of nodes that exist in both scenes
   */
  async executeSharedMovement(
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
  async executeArrival(
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
      await this.#arrivalAnimator.fadeInEdges(edgesToFadeIn);
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
