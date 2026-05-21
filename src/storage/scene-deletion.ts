/**
 * Scene Deletion - Clear a scene record
 *
 * Deletes a scene and cleans up cross-store references.
 * Peer of node-deletion.ts — both live at the storage layer because
 * they coordinate multiple stores for data integrity.
 *
 * Scope:
 * - Graph (delete scene record)
 * - Paths (remove scene, delete empty paths)
 *
 * Intentionally out of scope:
 * - Chat (keyed by nodeId, independent of scenes)
 * - Shelf (keyed by nodeId, independent of scenes)
 * - Cytoscape state (caller must ensure scene is not currently open)
 *
 * Contract:
 * - Caller must ensure the scene is not currently open
 * - Path references are cleaned up; empty paths are deleted
 * - Chat and shelf are untouched by design
 * - No events emitted
 */

import type { SceneId } from '../core/main-types';
import { isEditMode } from './app-mode';
import { graphStore } from './graph-store';
import { pathStore } from './path-store';
import { isDebug } from '../config/debug-flags';

/**
 * Cascade delete a single scene.
 * Next navigation to the scene's central node will auto-create a fresh scene.
 */
export async function cascadeSceneDeletion(sceneId: SceneId): Promise<void> {
  if (!isEditMode()) {
    console.warn('Cannot clear scenes in View mode');
    return;
  }

  if (isDebug('d_scene')) console.log(`[cascadeSceneDeletion] Clearing scene: ${sceneId}`);

  // 1. Delete the scene record
  await graphStore.deleteScene(sceneId);

  // 2. Remove scene from any saved paths; delete paths that become empty.
  // Inline copy of node-deletion's path cleanup — intentional independence
  // between the two cascade modules.
  const allPaths = pathStore.getAllPaths();
  for (const path of allPaths) {
    if (!path.scenes.includes(sceneId)) continue;

    const filteredScenes = path.scenes.filter(id => id !== sceneId);
    if (filteredScenes.length === 0) {
      await pathStore.deletePath(path.id);
      if (isDebug('d_scene')) console.log(`[cascadeSceneDeletion] Deleted empty path: ${path.name}`);
    } else {
      await pathStore.updatePath({ ...path, scenes: filteredScenes });
      if (isDebug('d_scene')) console.log(`[cascadeSceneDeletion] Updated path: ${path.name}`);
    }
  }

  if (isDebug('d_scene')) console.log(`[cascadeSceneDeletion] Complete: ${sceneId}`);
}
