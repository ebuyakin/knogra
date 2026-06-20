/**
 * Node Deletion - Cascading Delete Handler
 * 
 * Coordinates deletion of a node across all data stores.
 * Ensures data integrity by cleaning up related data in:
 * - Graph (scenes where node is central, node from other scenes)
 * - Edges (remove incident edge inclusions from scenes; callers delete graph edges)
 * - Paths (remove deleted scenes)
 * - Chat (delete conversation)
 * - Shelf (clear suggestions)
 */

import type { EdgeId, FoldedNodeEntry, NodeId, Scene, SceneId } from '../core/main-types';
import { graphStore } from './graph-store';
import { chatStore } from './chat-store';
import { pathStore } from './path-store';
import { SHELF_KEY } from '../config/storage-config';
import { isDebug } from '../config/debug-flags';

export interface CascadeNodeDeletionResult {
  deletedSceneIds: SceneId[];
  incidentEdgeIds: EdgeId[];
}

/**
 * Cascade delete all data related to a node
 * Called BEFORE the node is removed from Cytoscape
 * 
 * @param nodeId - The node being deleted
 * @returns Deleted scene IDs and incident edge IDs for graph-store edge deletion
 */
export async function cascadeNodeDeletion(nodeId: NodeId): Promise<CascadeNodeDeletionResult> {
  if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Starting cascade for node: ${nodeId}`);

  const incidentEdgeIds = graphStore.edges
    .filter(edge => edge.sourceId === nodeId || edge.targetId === nodeId)
    .map(edge => edge.id);
  
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
  
  // 4. Remove node and incident edge inclusions from surviving scene records
  await removeNodeFromScenes(nodeId, new Set(incidentEdgeIds));
  
  // 5. Delete chat conversation for this node
  await chatStore.deleteConversation(nodeId);
  if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Deleted chat for node: ${nodeId}`);
  
  // 6. Clear shelf suggestions for this node
  clearShelfForNode(nodeId);
  if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Cleared shelf for node: ${nodeId}`);
  
  if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Complete for node: ${nodeId}`);
  
  return { deletedSceneIds: scenesToDelete, incidentEdgeIds };
}

/**
 * Remove node, incident edge inclusions, and persisted fold references from
 * all surviving scenes.
 */
async function removeNodeFromScenes(nodeId: NodeId, incidentEdgeIds: Set<EdgeId>): Promise<void> {
  const scenesWithNode = graphStore.scenes.filter(scene =>
    scene.centralNodeId !== nodeId &&
    needsSceneNodeDeletionCleanup(scene, nodeId, incidentEdgeIds)
  );
  
  for (const scene of scenesWithNode) {
    const remainingNodes = { ...scene.nodes };
    delete remainingNodes[nodeId];

    const remainingEdges = { ...scene.edges };
    for (const edgeId of incidentEdgeIds) {
      delete remainingEdges[edgeId];
    }

    const updatedScene = {
      ...scene,
      nodes: remainingNodes,
      edges: remainingEdges,
      foldedNodes: cleanFoldedNodes(scene.foldedNodes, nodeId)
    };
    await graphStore.updateScene(updatedScene);
    if (isDebug('d_deletion')) console.log(`[cascadeNodeDeletion] Cleaned node from scene: ${scene.id}`);
  }
}

function needsSceneNodeDeletionCleanup(scene: Scene, nodeId: NodeId, incidentEdgeIds: Set<EdgeId>): boolean {
  if (scene.nodes[nodeId] !== undefined) return true;
  if (Object.keys(scene.edges).some(edgeId => incidentEdgeIds.has(edgeId as EdgeId))) return true;
  return hasFoldedNodeReference(scene.foldedNodes, nodeId);
}

function hasFoldedNodeReference(foldedNodes: Scene['foldedNodes'], nodeId: NodeId): boolean {
  if (!foldedNodes) return false;
  if (foldedNodes[nodeId]) return true;

  return Object.values(foldedNodes).some(entries =>
    (entries as Array<FoldedNodeEntry | NodeId>).some(entry => getFoldedEntryNodeId(entry) === nodeId)
  );
}

function cleanFoldedNodes(foldedNodes: Scene['foldedNodes'], nodeId: NodeId): Scene['foldedNodes'] {
  if (!foldedNodes) return undefined;

  const cleaned: NonNullable<Scene['foldedNodes']> = {};
  for (const [rootId, entries] of Object.entries(foldedNodes)) {
    if (rootId === nodeId) continue;

    const remainingEntries = (entries as Array<FoldedNodeEntry | NodeId>)
      .filter(entry => getFoldedEntryNodeId(entry) !== nodeId)
      .map(normalizeFoldedEntry);

    if (remainingEntries.length > 0) {
      cleaned[rootId as NodeId] = remainingEntries;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function getFoldedEntryNodeId(entry: FoldedNodeEntry | NodeId): NodeId {
  return typeof entry === 'string' ? entry : entry.id;
}

function normalizeFoldedEntry(entry: FoldedNodeEntry | NodeId): FoldedNodeEntry {
  return typeof entry === 'string'
    ? { id: entry, offset: { dx: 0, dy: 0 } }
    : entry;
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
