/**
 * Node Deletion - Cascading Delete Handler
 * 
 * Coordinates deletion of a node across all data stores.
 * Ensures data integrity by cleaning up related data in:
 * - Graph (scenes where node is central, node from other scenes)
 * - Edges (handled separately via Cytoscape scratch)
 * - Paths (remove deleted scenes)
 * - Chat (delete conversation)
 * - Shelf (clear suggestions)
 */

import type { NodeId, SceneId } from '../core/main-types';
import { graphStore } from './graph-store';
import { chatStore } from './chat-store';
import { pathStore } from './path-store';
import { SHELF_KEY } from '../config/storage-config';
import { isDebug } from '../config/debug-flags';

/**
 * Cascade delete all data related to a node
 * Called BEFORE the node is removed from Cytoscape
 * 
 * @param nodeId - The node being deleted
 * @returns Array of scene IDs that were deleted (for logging)
 */
export async function cascadeNodeDeletion(nodeId: NodeId): Promise<SceneId[]> {
  if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Starting cascade for node: ${nodeId}`);
  
  // 1. Find scenes where this node is the central node (these must be deleted)
  const scenesToDelete = graphStore.scenes
    .filter(s => s.centralNodeId === nodeId)
    .map(s => s.id);
  
  if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Found ${scenesToDelete.length} scenes to delete`);
  
  // 2. Delete those scenes from graphStore
  for (const sceneId of scenesToDelete) {
    await graphStore.deleteScene(sceneId);
    if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Deleted scene: ${sceneId}`);
  }
  
  // 3. Remove deleted scenes from all saved paths
  if (scenesToDelete.length > 0) {
    await removeDeletedScenesFromPaths(scenesToDelete);
  }
  
  // 4. Remove node from other scenes' node records (where it's a member, not central)
  await removeNodeFromScenes(nodeId);
  
  // 5. Delete chat conversation for this node
  await chatStore.deleteConversation(nodeId);
  if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Deleted chat for node: ${nodeId}`);
  
  // 6. Clear shelf suggestions for this node
  clearShelfForNode(nodeId);
  if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Cleared shelf for node: ${nodeId}`);
  
  if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Complete for node: ${nodeId}`);
  
  return scenesToDelete;
}

/**
 * Remove node from all scenes where it's a member (not central)
 * Updates scene.nodes record
 */
async function removeNodeFromScenes(nodeId: NodeId): Promise<void> {
  const scenesWithNode = graphStore.scenes.filter(s => 
    s.centralNodeId !== nodeId && // Not central (those are deleted)
    s.nodes[nodeId] !== undefined  // But is a member
  );
  
  for (const scene of scenesWithNode) {
    // Create updated scene without this node
    const { [nodeId]: removed, ...remainingNodes } = scene.nodes;
    const updatedScene = { ...scene, nodes: remainingNodes };
    await graphStore.updateScene(updatedScene);
    if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Removed node from scene: ${scene.id}`);
  }
}

/**
 * Remove deleted scenes from all saved paths
 * Also cleans up empty paths
 */
async function removeDeletedScenesFromPaths(deletedSceneIds: SceneId[]): Promise<void> {
  const deletedSet = new Set(deletedSceneIds);
  const allPaths = pathStore.getAllPaths();
  
  for (const path of allPaths) {
    const filteredScenes = path.scenes.filter(id => !deletedSet.has(id));
    
    if (filteredScenes.length !== path.scenes.length) {
      if (filteredScenes.length === 0) {
        // Path is now empty, delete it
        await pathStore.deletePath(path.id);
        if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Deleted empty path: ${path.name}`);
      } else {
        // Update path with remaining scenes
        await pathStore.updatePath({ ...path, scenes: filteredScenes });
        if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Updated path: ${path.name}`);
      }
    }
  }
}

/**
 * Clear shelf suggestions for a node from localStorage
 */
function clearShelfForNode(nodeId: NodeId): void {
  try {
    const stored = localStorage.getItem(SHELF_KEY);
    if (!stored) return;
    
    const shelf = JSON.parse(stored);
    if (shelf[nodeId]) {
      delete shelf[nodeId];
      localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
    }
  } catch (e) {
    console.warn('[cascadeNodeDeletion] Failed to clear shelf:', e);
  }
}
