/**
 * Scene reset — reset a study scene to its map's skeleton (map-view.md §8).
 *
 * A flow, like the handoff's (architecture.md §3.8): the map feature gives the
 * skeleton the scene would be born with, the focus and its landmarks at their
 * map places in their default designs, and the transition feature transitions the scene
 * into it, so the reset is animated by the same machinery as any navigation:
 * what the skeleton lacks shrinks into the central, landmarks glide to the
 * ring. The scene keeps its identity and what is not layout: title,
 * description, theme, background, edge-type visibility. Everything else is
 * replaced, which is the point; Edit mode only, confirmed.
 */

import type { Scene } from '../core/main-types';
import type { FeatureAPI } from '../features/feature-api';
import { graphStore } from '../storage/graph-store';
import { graphSaver } from '../storage/graph-saver';
import { isEditMode } from '../storage/app-mode';
import { isDebug } from '../config/debug-flags';

export interface SceneResetDeps {
  features: FeatureAPI;
  /** The scene container: the map lays out for its size (map-view.md §7.6). */
  container: HTMLElement;
}

export async function resetSceneToMap({ features, container }: SceneResetDeps): Promise<void> {
  const { mapView, transition, scene: sceneFeature } = features;
  if (!isEditMode() || mapView.isActive()) return;
  const sceneId = sceneFeature.getCurrentSceneId();
  const scene = sceneId ? graphStore.scenes.find(candidate => candidate.id === sceneId) : undefined;
  if (!scene) return;

  const confirmed = window.confirm(
    'Reset this scene to its map shape? It keeps the central node and its direct connections, at their map places and in their default designs; every other node is removed from the scene. This cannot be undone.'
  );
  if (!confirmed) return;

  // The last edit's save must land first: `suspend` discards a pending debounce, and a node the record never learnt of
  // is invisible to the transition's classification, so it would survive the transition as a styleless stowaway.
  await graphSaver.forceSave();
  // And no save may land between writing the skeleton and showing it, or it would overwrite the record with the old arrangement.
  const suspension = graphSaver.suspend('scene-reset');
  try {
    await mapView.prepare(scene.centralNodeId, { width: container.clientWidth, height: container.clientHeight });
    const skeleton = mapView.sceneDraft(scene.id);
    mapView.hide();

    const reset: Scene = {
      ...skeleton,
      title: scene.title,
      description: scene.description,
      themeId: scene.themeId,
      backgroundImages: scene.backgroundImages,
      edgeTypeVisibility: scene.edgeTypeVisibility,
      createdAt: scene.createdAt,
      updatedAt: new Date(),
    };
    // Transition first, write after. The transition feature reads the current scene from the store by id, and the reset
    // carries the same id: written first, it would be both ends of the transition, nothing would depart, and the
    // nodes the skeleton drops would stay on the canvas as stowaways. The path's history ignores a repeat of the
    // same scene; the transition moves what differs between the stored record and the object it is given.
    await transition.transitionTo(reset, { recipe: { departure: 'shrink' } });
    await graphStore.updateScene(reset);
    if (isDebug('d_scene')) console.log(`[SceneReset] ${scene.id} reset to its map shape: ${Object.keys(reset.nodes).length} nodes`);
  } catch (err) {
    console.error('[SceneReset] Reset failed', err);
    mapView.hide();
  } finally {
    graphSaver.resume(suspension);
  }
}
