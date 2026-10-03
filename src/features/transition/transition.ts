/**
 * Transition Feature (Layer 0, scene-transitions.md §2.2)
 *
 * The public entry points for moving between scenes, and what every one of
 * them shares: the regime guards (path mode, map view), the bracket of input
 * guard, saver suspension and dev record, which scene is current, and the
 * announcements. Each entry point resolves what to show and routes to one
 * orchestrator with Scene objects: OpenCloseOrchestrator for opening and
 * closing, SceneToSceneOrchestrator for the three-phase transition. Nothing
 * here touches an element.
 */

import type { Core } from 'cytoscape';
import type { NodeId, SceneId, Scene } from '../../core/main-types';
import type { BackgroundRenderer } from '../../background/background-renderer';

import { isDebug } from '../../config/debug-flags';

import { graphStore } from '../../storage/graph-store';
import { graphSaver } from '../../storage/graph-saver';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';
import { eventBus } from '../../events/event-bus';

import { CurrentScene } from './current-scene';
import { draftFromCurrent, ensureScene, findSceneByCentral, sceneIdFor } from './scene-resolution';

import { OpenCloseOrchestrator, type CloseMode, type OpenMode } from './opening-closing/open-close-orchestrator';
import { SceneToSceneOrchestrator } from './scene-to-scene/scene-to-scene-orchestrator';
import { startTransition, type TransitionRecordHandle } from '../../utils/diagnostics/transition-buffer';

// ============================================================================
// TYPES
// ============================================================================

interface Position {
  x: number;
  y: number;
}

// ============================================================================
// TRANSITION CLASS
// ============================================================================

export class Transition {
  #cy: Core;
  #sceneToSceneOrchestrator: SceneToSceneOrchestrator;
  #openCloseOrchestrator: OpenCloseOrchestrator;
  /**
   * True while the user is walking a saved path. Set from `pathModeChanged`
   * rather than read from the Path feature — features must not import each other
   * (architecture §4.2), and the mode's owner announces its own consequences
   * (architecture §3.10).
   */
  #pathModeActive: boolean = false;
  /** True while the map view is shown: scene-initiated navigation has no subject on screen (map-view.md §7.4). Same shape as the path guard. */
  #mapViewActive: boolean = false;
  /** Which scene the instance shows, stored or transient (map-view.md §8); the only writer of the scratch id. */
  #current: CurrentScene;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;
    this.#current = new CurrentScene(cy);

    // Layer 1 orchestrators — each creates its own children
    this.#sceneToSceneOrchestrator = new SceneToSceneOrchestrator(cy, backgroundRenderer);
    this.#openCloseOrchestrator = new OpenCloseOrchestrator(cy, backgroundRenderer);

    eventBus.on('pathModeChanged', ({ active }) => {
      this.#pathModeActive = active;
    });
    eventBus.on('mapViewChanged', ({ active }) => {
      this.#mapViewActive = active;
    });
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Navigate to a scene by selecting a node (e.g., via 'G' key or context menu)
   * Emits scene:changed event for path feature to track
   */
  async goToSceneByNode(targetNodeId: NodeId, options?: { fade?: boolean }): Promise<void> {
    // Path mode: the sequence is the only way to move (paths-architecture §14.4).
    // This is the single funnel for graph-initiated navigation, so one guard here
    // covers double-tap, the context menu, and the G shortcuts. Silent by design
    // — the numbered breadcrumbs and lit Path button already state the mode, and
    // the corresponding menu items are disabled.
    if (this.#pathModeActive) {
      if (isDebug('d_transition')) console.log('[d_transition] toNode: blocked — path mode active');
      return;
    }
    if (this.#mapViewActive) {
      if (isDebug('d_transition')) console.log('[d_transition] toNode: blocked — map view active');
      return;
    }

    if (isDebug('d_transition')) console.log(`[d_transition] toNode: Starting transition to node: ${targetNodeId}`);
    
    const useFade = options?.fade ?? getSetting('transition.transitionMode') === 'fade';

    if (useFade) {
      // Fade mode: close → open, no three-phase transition
      if (!findSceneByCentral(targetNodeId) && !isEditMode()) {
        console.warn(`[Transition] Cannot auto-create scene in View mode for node: ${targetNodeId}`);
        return;
      }
      const currentScene = this.#current.get();
      if (!currentScene) throw new Error('Cannot auto-create scene: no current scene context');
      const targetScene = await ensureScene(targetNodeId, sceneId => draftFromCurrent(targetNodeId, sceneId, currentScene, this.#viewportCenter()));
      await this.closeScene({ fade: true });
      await this.openScene(targetScene.id, { fade: true });
      this.#cy.emit('scene:changed', [targetScene.id]);
      return;
    }

    // Animated mode: the three-phase transition
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
    if (this.#mapViewActive) {
      if (isDebug('d_transition')) console.log('[d_transition] goToSceneFromPath: blocked — map view active');
      return;
    }
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
    // there's no visual continuity to transition from.
    const centralNode = this.#cy.getElementById(scene.centralNodeId);
    const centralVisible = centralNode.length > 0 && centralNode.visible();

    // The outer record is the path step; the inner calls guard input and suspend saving themselves.
    const record = { kind: 'fromPath' as const, from: this.#current.id() ?? null, centralTo: scene.centralNodeId, note: centralVisible ? 'adjacent' : 'non-adjacent' };
    await this.#run(record, { guard: false, suspend: null }, async rec => {
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
    });
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

    const mode: OpenMode = options?.skipAnimation
      ? 'instant'
      : (options?.fade ?? getSetting('transition.transitionMode') === 'fade') ? 'fade' : 'animated';
    const record = { kind: 'openScene' as const, from: this.#current.id() ?? null, centralTo: scene.centralNodeId, note: mode };
    await this.#run(record, { guard: true, suspend: 'transition:openScene' }, async rec => {
      rec.setTarget({ to: sceneId });
      this.#current.set(scene);
      await this.#openCloseOrchestrator.open(scene, mode);

      // Emit scene changed event
      eventBus.emit('sceneChanged', {
        sceneId: scene.id,
        centralNodeId: scene.centralNodeId
      });

      if (isDebug('d_transition')) console.log(`[d_transition] openScene: Complete: ${sceneId}`);
      rec.complete();
    });
  }

  // ==========================================================================
  // PUBLIC API — the map handoff (map-view.md §8), called by ui/map-handoff.ts
  // ==========================================================================

  /**
   * Open a given Scene object instantly, with nothing written and nothing
   * announced: no sceneChanged, no path event, no input guard, since nothing
   * visible happens. The object becomes the current scene; when the store
   * does not hold it, it is the transient scene until a stored one is current.
   */
  async openBehind(scene: Scene): Promise<void> {
    if (isDebug('d_transition')) console.log(`[d_transition] openBehind: ${scene.id}`);
    const record = { kind: 'openScene' as const, from: this.#current.id() ?? null, centralTo: scene.centralNodeId, note: 'map handoff: behind the map' };
    await this.#run(record, { guard: false, suspend: 'transition:openBehind' }, async rec => {
      rec.setTarget({ to: scene.id });
      this.#current.set(scene);
      await this.#openCloseOrchestrator.open(scene, 'instant');
      rec.complete();
    });
  }

  /**
   * The three-phase transition from the current scene, stored or transient,
   * to a given Scene object. A stored target is announced as any navigation
   * is, sceneChanged and the path's scene:changed; a transient target is not,
   * and becomes the transient current scene.
   */
  async transitionTo(scene: Scene): Promise<void> {
    const stored = graphStore.scenes.some(s => s.id === scene.id);
    if (isDebug('d_transition')) console.log(`[d_transition] transitionTo: ${scene.id}${stored ? '' : ' (transient)'}`);
    const record = { kind: 'toNode' as const, from: this.#current.id() ?? null, note: stored ? 'map handoff: to scene' : 'map handoff: to the map\'s scene' };
    await this.#run(record, { guard: true, suspend: 'transition:transitionTo' }, async rec => {
      const currentScene = this.#current.get();
      if (!currentScene) {
        console.warn('[Transition.transitionTo] No current scene');
        rec.note('aborted: no current scene');
        rec.complete();
        return;
      }
      rec.setCentrals({ from: currentScene.centralNodeId });
      await this.#executeTo(currentScene, scene, false, rec, stored);
      if (stored) this.#cy.emit('scene:changed', [scene.id]);
    });
  }

  /**
   * The scene whose central node is `nodeId`, or in Edit mode the given draft
   * persisted and returned; View mode cannot create a scene (map-view.md §5.5).
   */
  async ensureScene(nodeId: NodeId, draft: (sceneId: SceneId) => Scene): Promise<Scene> {
    return ensureScene(nodeId, draft);
  }

  /**
   * Close the current scene with reverse-open animation:
   * 1. Peripheral nodes + edges fly out from central node
   * 2. Central node shrinks/fades + background fades out
   */
  async closeScene(options?: { fade?: boolean }): Promise<void> {
    const scene = this.#current.get();
    if (!scene) {
      console.warn('[Transition.closeScene] No current scene to close');
      return;
    }
    if (isDebug('d_transition')) console.log(`[d_transition] closeScene: Closing scene: ${scene.id}`);
    const mode: CloseMode = (options?.fade ?? getSetting('transition.transitionMode') === 'fade') ? 'fade' : 'animated';
    const record = { kind: 'closeScene' as const, from: scene.id, centralFrom: scene.centralNodeId, note: mode };
    await this.#run(record, { guard: true, suspend: 'transition:closeScene' }, async rec => {
      await this.#openCloseOrchestrator.close(scene, mode);
      this.#current.clear();
      if (isDebug('d_transition')) console.log(`[d_transition] closeScene: Complete: ${scene.id}`);
      rec.complete();
    });
  }

  // ==========================================================================
  // PRIVATE: THE BRACKET
  // ==========================================================================

  /**
   * What every transition shares: the input guard (`transitionStart` /
   * `transitionEnd`, which the UI's guard listens to), the GraphSaver
   * suspension, and the dev transition record, with `transitionEnd` and the
   * record's failure in `finally` so an exception never leaves input blocked.
   * `guard` is off for a change nothing visible happens in; `suspend` is null
   * when a caller already holds the suspension. The body completes the record
   * itself, since some bodies complete early with a note.
   */
  async #run<T>(
    record: Parameters<typeof startTransition>[0],
    options: { guard: boolean; suspend: string | null },
    body: (rec: TransitionRecordHandle) => Promise<T>
  ): Promise<T> {
    if (options.guard) eventBus.emit('transitionStart', undefined as void);
    const suspension = options.suspend ? graphSaver.suspend(options.suspend) : null;
    const rec = startTransition(record);
    try {
      return await body(rec);
    } catch (err) {
      rec.fail(err);
      throw err;
    } finally {
      if (suspension) graphSaver.resume(suspension);
      if (options.guard) eventBus.emit('transitionEnd', undefined as void);
    }
  }

  // ==========================================================================
  // PRIVATE: SCENE-TO-SCENE TRANSITION
  // ==========================================================================

  /**
   * The transition to the scene whose central node is `targetNodeId`, drafting one
   * when it has none. The caller holds the GraphSaver suspension. Returns the
   * target scene id for history recording, null when aborted.
   */
  async #executeToNode(targetNodeId: NodeId): Promise<SceneId | null> {
    const record = { kind: 'toNode' as const, from: this.#current.id() ?? null };
    return this.#run(record, { guard: true, suspend: null }, async rec => {
      const currentScene = this.#current.get();
      if (!currentScene) {
        console.warn('No current scene, cannot transition');
        rec.note('aborted: no current scene');
        rec.complete();
        return null;
      }

      rec.setCentrals({ from: currentScene.centralNodeId });

      // Resolve target scene; a new one is drafted now and saved after the transition
      let targetScene = findSceneByCentral(targetNodeId);
      let isNewScene = false;

      if (!targetScene) {
        if (!isEditMode()) {
          console.warn(`[Transition] Cannot auto-create scene in View mode for node: ${targetNodeId}`);
          rec.note('aborted: view mode, cannot auto-create');
          rec.complete();
          return null;
        }
        if (isDebug('d_transition')) console.log('[d_transition] No existing scene found, auto-creating');
        targetScene = draftFromCurrent(targetNodeId, sceneIdFor(targetNodeId), currentScene, this.#viewportCenter());
        isNewScene = true;
      } else if (isDebug('d_transition')) {
        const positionsLog = Object.entries(targetScene.nodes)
          .map(([id, data]) => `${id}:[${Math.round(data.position.x)},${Math.round(data.position.y)}]`)
          .join(', ');
        console.log(`[d_transition] Found existing scene: ${targetScene.id}; positions from graphStore: {${positionsLog}}`);
      }

      return this.#executeTo(currentScene, targetScene, isNewScene, rec, true);
    });
  }

  #viewportCenter(): Position {
    const extent = this.#cy.extent();
    return { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 };
  }

  /**
   * The transition from `currentScene` to `targetScene`, both given as objects, then
   * what only Transition does: the current-scene scratch, saving an
   * auto-created scene, announcing. `announce` emits sceneChanged at the end;
   * a transient target (map-view.md §8) is not announced, since AppState would
   * record a scene the store does not have. The caller owns
   * transitionStart/End and the transition record's failure path.
   */
  async #executeTo(currentScene: Scene, targetScene: Scene, isNewScene: boolean, rec: TransitionRecordHandle, announce: boolean): Promise<SceneId> {

    rec.setTarget({ to: targetScene.id, isNewScene });
    rec.setCentrals({ to: targetScene.centralNodeId });

    const report = await this.#sceneToSceneOrchestrator.transition(currentScene, targetScene, { isNewScene });
    rec.classify({ shared: report.shared, departing: report.departing, arriving: report.arriving });
    if (report.viewport) rec.viewport(report.viewport);

    // Save auto-created scene to database (use updateScene for upsert behavior), then it is a stored current scene
    if (isNewScene && isEditMode()) {
      await graphStore.updateScene(targetScene);
      if (isDebug('d_transition')) console.log(`[d_transition] Saved new scene: ${targetScene.id}`);
    }
    this.#current.set(targetScene);

    if (isDebug('d_transition')) console.log(`[d_transition] toNode: Complete, now at scene: ${targetScene.id}`);

    // Notify subscribers of scene change (only on success)
    if (announce) {
      eventBus.emit('sceneChanged', {
        sceneId: targetScene.id,
        centralNodeId: targetScene.centralNodeId
      });
    }

    rec.complete();
    return targetScene.id;
  }

}
