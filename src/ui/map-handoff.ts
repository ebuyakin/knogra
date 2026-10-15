/**
 * Map handoff — the flow between a scene and the map view (UI: Helicopter
 * view), docs/map-view.md §7.6 and §8.
 *
 * The map feature and the transition feature never call each other; each
 * exposes primitives, and this module calls them in order on behalf of one
 * user action, written once for the menus and the keys (architecture.md §3.8,
 * Flows). The transition feature transitions the scene canvas to the map core
 * scene, a transient Scene object the map builds; the map then takes over on
 * its own surface at the same geometry. Leaving is the mirror.
 *
 * While the map core scene is the transition feature's current scene, GraphSaver is
 * suspended: its first viewport event would insert a scene the store does not
 * have. The suspension is taken here before the transition in and released
 * after the transition out, once a stored scene is current again.
 */

import type { NodeId, Scene, SceneId } from '../core/main-types';
import type { FeatureAPI } from '../features/feature-api';
import type { Size } from '../features/map-view/geometry';
import { graphStore } from '../storage/graph-store';
import { graphSaver, type GraphSaverSuspension } from '../storage/graph-saver';
import { eventBus } from '../events/event-bus';
import { isEditMode } from '../storage/app-mode';
import { isDebug } from '../config/debug-flags';
import { waitForStep } from '../features/transition/step-debug';

/** Resolves after the browser has painted a frame with the current DOM and canvases: two animation frames, since the first may be the one already scheduled. */
function paintedFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export interface MapHandoffDeps {
  features: FeatureAPI;
  /** The scene container: the map surface shares its grid cell, and a hidden surface cannot be measured. */
  container: HTMLElement;
}

export class MapHandoff {
  #deps: MapHandoffDeps;
  /** The scene the map was entered from, which `back` returns to. */
  #enteredSceneId: SceneId | null = null;
  #suspension: GraphSaverSuspension | null = null;
  /** A sequence is running; a second request meanwhile is ignored rather than queued. */
  #busy = false;

  constructor(deps: MapHandoffDeps) {
    this.#deps = deps;
  }

  /** Whether the map can be entered: not while a scene quiz runs, whose session belongs to the scene canvas (map-view.md §7.5). */
  canEnter(): boolean {
    const { mapView, quiz } = this.#deps.features;
    return !mapView.isActive() && !quiz.isActive();
  }

  /** Whether the map can be left for the entered scene: not while a map quiz runs; End it first. */
  canBack(): boolean {
    const { mapView, mapQuiz } = this.#deps.features;
    return mapView.isActive() && !mapQuiz.isActive();
  }

  /** Scene X to the map of X's central node (§8, entering). */
  async enter(): Promise<void> {
    const { mapView, transition, scene: sceneFeature } = this.#deps.features;
    if (this.#busy || !this.canEnter()) return;
    const sceneId = sceneFeature.getCurrentSceneId();
    const scene = sceneId ? graphStore.scenes.find(candidate => candidate.id === sceneId) : undefined;
    if (!scene) return;

    this.#busy = true;
    // The last edit's save must land before the suspension discards its debounce (the transition feature does the same in its bracket, but this suspension comes first).
    if (!graphSaver.isSuspended()) await graphSaver.forceSave();
    const suspension = graphSaver.suspend('map-handoff');
    try {
      // Steps 1 to 3: only reads until the transition; a failure here leaves the user on scene X, the transition feature's own handling.
      try {
        // The entered scene's theme is the map's fallback under `map.themeMode` 'scene' (map-view.md §5.6).
        await mapView.prepare(scene.centralNodeId, this.#surface(), { fallbackThemeId: scene.themeId });
        await waitForStep('[handoff] map prepared, nothing drawn');
        // The STM transition moves the focus and the landmarks, new landmarks growing out of the focus; the markers are the map's, after the swap (map-view.md §8).
        await transition.transitionTo(mapView.mapCoreScene(), { recipe: { arrival: 'grow' } });
        await waitForStep('[handoff] scene canvas shows the map core scene; swap next');
      } catch (err) {
        console.error('[MapHandoff] Entering the map failed before the map was shown', err);
        mapView.hide();
        graphSaver.resume(suspension);
        return;
      }
      // Steps 4 to 6: the map core scene is current from here, so the suspension is kept until a stored scene is current again.
      this.#enteredSceneId = scene.id;
      this.#suspension = suspension;
      mapView.takeOver();
      // The same frame's grace on this side: the map surface is shown the tick its elements are added.
      await paintedFrame();
      await waitForStep('[handoff] map taken over, markers stowed');
      await mapView.arriveMarkers();
      if (isDebug('d_scene')) console.log(`[MapHandoff] Entered the map from ${scene.id}`);
    } finally {
      this.#busy = false;
    }
  }

  /** Whether `leave` can open a scene for the focus: it has one, or Edit mode can create it; and no map quiz runs. */
  canLeave(): boolean {
    const focus = this.#deps.features.mapView.focusNodeId;
    return this.canBack() && focus !== null && (isEditMode() || graphStore.scenes.some(scene => scene.centralNodeId === focus));
  }

  /** The map to the focus's study scene, created from the map when it has none (§8, leaving). */
  async leave(): Promise<void> {
    const { mapView, transition } = this.#deps.features;
    if (this.#busy || !this.canBack()) return;
    const focus = mapView.focusNodeId;
    if (focus === null) return;

    let target: Scene;
    try {
      // A scene made now is the map's skeleton, focus and landmarks, so leaving to it moves nothing once the markers have gone.
      target = await transition.ensureScene(focus, sceneId => mapView.sceneDraft(sceneId));
    } catch (err) {
      // View mode and no scene: stay on the map.
      console.warn('[MapHandoff] No scene to leave to', err);
      return;
    }
    await this.#leaveTo(target, focus);
  }

  /** The map back to the scene it was entered from; to the focus's scene if that one is gone. */
  async back(): Promise<void> {
    if (this.#busy || !this.canBack()) return;
    const entered = graphStore.scenes.find(scene => scene.id === this.#enteredSceneId);
    if (!entered) {
      await this.leave();
      return;
    }
    await this.#leaveTo(entered, entered.centralNodeId);
  }

  /**
   * Steps 1 to 4 of leaving (map-view.md §8): every marker shrinks into its
   * landmark, the transition feature takes the map core the map leaves
   * behind, and transitions from it to the target (MTS).
   */
  async #leaveTo(target: Scene, targetNodeId: NodeId): Promise<void> {
    const { mapView, transition } = this.#deps.features;
    this.#busy = true;
    try {
      const behind = mapView.mapCoreScene();
      await mapView.convergeMarkers();
      await waitForStep('[handoff] markers converged; map shows the map core');
      await transition.openBehind(behind);
      // Cytoscape paints on its own animation frame: hidden the same tick it was opened, the scene canvas would show
      // one unpainted frame at the swap (seen as a flicker on leaving, 2026-10-04; gone with any pause here).
      await paintedFrame();
      await waitForStep('[handoff] map core scene opened behind the map');
      mapView.hide();
      await waitForStep('[handoff] map hidden; scene canvas showing');
      // Landmarks the target lacks fold into the focus, the mirror of growing out of it on the way in. A back to a
      // scene whose central is not in the map core is routed to a close and open by the transition feature itself.
      await transition.transitionTo(target, { recipe: { departure: 'shrink' } });
      if (isDebug('d_scene')) console.log(`[MapHandoff] Left the map for ${target.id} (${targetNodeId})`);
    } finally {
      this.#enteredSceneId = null;
      this.#releaseSuspension();
      this.#busy = false;
    }
  }

  /**
   * Resume GraphSaver once a stored scene is current. If the transition out failed
   * with the map core scene still current, the saver stays suspended until the
   * transition feature next announces a scene, which any navigation from that canvas does.
   */
  #releaseSuspension(): void {
    const suspension = this.#suspension;
    if (suspension === null) return;
    const release = (): void => {
      graphSaver.resume(suspension);
      this.#suspension = null;
    };
    const currentId = this.#deps.features.scene.getCurrentSceneId();
    if (currentId && graphStore.scenes.some(scene => scene.id === currentId)) {
      release();
      return;
    }
    console.warn('[MapHandoff] The map\'s scene is still current; GraphSaver stays suspended until the next scene change');
    const onSceneChanged = (): void => {
      eventBus.off('sceneChanged', onSceneChanged);
      release();
    };
    eventBus.on('sceneChanged', onSceneChanged);
  }

  #surface(): Size {
    const { container } = this.#deps;
    return { width: container.clientWidth, height: container.clientHeight };
  }
}
