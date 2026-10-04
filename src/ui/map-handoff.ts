/**
 * Map handoff — the flow between a scene and the map view (UI: Helicopter
 * view), docs/map-view.md §7.6 and §8.
 *
 * The map feature and the transition engine never call each other; each
 * exposes primitives, and this module calls them in order on behalf of one
 * user action, written once for the menus and the keys (architecture.md §3.8,
 * Flows). The engine transitions the scene canvas to the map's scene, a
 * transient Scene object the map builds; the map then takes over on its own
 * surface at the same geometry. Leaving is the mirror.
 *
 * While the map's scene is the engine's current scene, GraphSaver is
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

  /** Scene X to the map of X's central node (§8, entering). */
  async enter(): Promise<void> {
    const { mapView, transition, scene: sceneFeature } = this.#deps.features;
    if (this.#busy || mapView.isActive()) return;
    const sceneId = sceneFeature.getCurrentSceneId();
    const scene = sceneId ? graphStore.scenes.find(candidate => candidate.id === sceneId) : undefined;
    if (!scene) return;

    this.#busy = true;
    const suspension = graphSaver.suspend('map-handoff');
    try {
      // Steps 1 to 3: only reads until the transition; a failure here leaves the user on scene X, the engine's own handling.
      try {
        await mapView.prepare(scene.centralNodeId, this.#surface());
        await waitForStep('[handoff] map prepared, nothing drawn');
        // The engine moves the focus and the landmarks, new landmarks growing out of the focus; the markers are the map's, after the swap (map-view.md §8).
        await transition.transitionTo(mapView.mapScene(), { recipe: { arrival: 'grow' } });
        await waitForStep('[handoff] engine shows the map\'s scene; swap next');
      } catch (err) {
        console.error('[MapHandoff] Entering the map failed before the map was shown', err);
        mapView.hide();
        graphSaver.resume(suspension);
        return;
      }
      // Steps 4 to 6: the map's scene is current from here, so the suspension is kept until a stored scene is current again.
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

  /** Whether `leave` can open a scene for the focus: it has one, or Edit mode can create it. */
  canLeave(): boolean {
    const focus = this.#deps.features.mapView.focusNodeId;
    return focus !== null && (isEditMode() || graphStore.scenes.some(scene => scene.centralNodeId === focus));
  }

  /** The map to the focus's study scene, created from the map when it has none (§8, leaving). */
  async leave(): Promise<void> {
    const { mapView, transition } = this.#deps.features;
    if (this.#busy || !mapView.isActive()) return;
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
    const { mapView } = this.#deps.features;
    if (this.#busy || !mapView.isActive()) return;
    const entered = graphStore.scenes.find(scene => scene.id === this.#enteredSceneId);
    if (!entered) {
      await this.leave();
      return;
    }
    await this.#leaveTo(entered, entered.centralNodeId);
  }

  /**
   * Steps 1 to 4 of leaving (map-view.md §8): every marker shrinks into its
   * landmark, the engine takes the skeleton the map leaves behind, and
   * transitions from it to the target.
   */
  async #leaveTo(target: Scene, targetNodeId: NodeId): Promise<void> {
    const { mapView, transition } = this.#deps.features;
    this.#busy = true;
    try {
      const behind = mapView.mapScene();
      await mapView.convergeMarkers();
      await waitForStep('[handoff] markers converged; map shows the map\'s scene');
      await transition.openBehind(behind);
      // Cytoscape paints on its own animation frame: hidden the same tick it was opened, the engine's canvas would show
      // one unpainted frame at the swap (seen as a flicker on leaving, 2026-10-04; gone with any pause here).
      await paintedFrame();
      await waitForStep('[handoff] engine opened the map\'s scene behind the map');
      mapView.hide();
      await waitForStep('[handoff] map hidden; engine canvas showing');
      // Landmarks the target lacks fold into the focus, the mirror of growing out of it on the way in.
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
   * with the map's scene still current, the saver stays suspended until the
   * engine next announces a scene, which any navigation from that canvas does.
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
