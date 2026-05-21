/**
 * Scene Factory
 * Pure functions for creating new scenes during transitions
 */

import type { Scene, SceneId, NodeId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store'; // temporary. violates purity of utilities

interface Position {
  x: number;
  y: number;
}

/**
 * Generate a scene ID from node title and ID
 * Format: scene-<sanitized-title>-<nodeId>
 * Temporary! should be moved out of scene-factory as it violates purity of utilities principle
 */
function generateSceneId(nodeId: NodeId): SceneId {
  const node = graphStore.nodes.find(n => n.id === nodeId);
  const title = node?.title ?? 'untitled';
  // Sanitize title: lowercase, replace non-alphanumeric with dash, collapse multiple dashes
  const sanitizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')  // Remove leading/trailing dashes
    .slice(0, 30);  // Limit length
  return `scene-${sanitizedTitle}-${nodeId}` as SceneId;
}

/**
 * Create a new scene centered on a target node, preserving relative positions
 * of connected nodes from the current scene.
 * 
 * @param targetCentralId - Node ID that will be the center of the new scene
 * @param currentScene - The scene we're transitioning from
 * @param viewportCenter - Where to place the central node
 * @param connectedNodeIds - Nodes to include (typically target + its connections)
 * @returns A new Scene object
 */
export function createSceneFromCurrent(
  targetCentralId: NodeId,
  currentScene: Scene,
  viewportCenter: Position,
  connectedNodeIds: NodeId[]
): Scene {
  const sceneId = generateSceneId(targetCentralId);
  const targetCurrentPos = currentScene.nodes[targetCentralId]?.position;
  
  // Target not in current scene - just place at center alone
  if (!targetCurrentPos) {
    return {
      ...currentScene,
      id: sceneId,
      centralNodeId: targetCentralId,
      nodes: {
        [targetCentralId]: {
          position: viewportCenter,
          scale: currentScene.nodes[targetCentralId]?.scale ?? 1,
          design: currentScene.nodes[targetCentralId]?.design ?? { id: 'circle', params: {} }
        }
      },
      edges: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  // Build new nodes with preserved relative offsets
  const newNodes: Scene['nodes'] = {};
  
  // Central node at viewport center
  newNodes[targetCentralId] = {
    position: viewportCenter,
    scale: currentScene.nodes[targetCentralId]?.scale ?? 1,
    design: currentScene.nodes[targetCentralId]?.design ?? { id: 'circle', params: {} }
  };

  // Connected nodes preserve relative offset
  for (const nodeId of connectedNodeIds) {
    if (nodeId === targetCentralId) continue;
    
    const nodeCurrentPos = currentScene.nodes[nodeId]?.position;
    if (!nodeCurrentPos) continue;

    const offsetX = nodeCurrentPos.x - targetCurrentPos.x;
    const offsetY = nodeCurrentPos.y - targetCurrentPos.y;

    newNodes[nodeId] = {
      position: { x: viewportCenter.x + offsetX, y: viewportCenter.y + offsetY },
      scale: currentScene.nodes[nodeId]?.scale ?? 1,
      design: currentScene.nodes[nodeId]?.design ?? { id: 'circle', params: {} }
    };
  }

  // Keep only edges whose both endpoints are included in the new scene.
  // Endpoints live in graphStore.edges; scene.edges stores per-scene styling only.
  const newNodeIds = new Set(Object.keys(newNodes));
  const newEdges: Scene['edges'] = {};
  for (const [edgeId, edgeData] of Object.entries(currentScene.edges)) {
    const edge = graphStore.edges.find(e => e.id === edgeId);
    if (!edge) continue;
    if (newNodeIds.has(edge.sourceId) && newNodeIds.has(edge.targetId)) {
      newEdges[edgeId] = edgeData;
    }
  }

  return {
    ...currentScene,
    id: sceneId,
    centralNodeId: targetCentralId,
    nodes: newNodes,
    edges: newEdges,
    // Fresh scene: no inherited fold state. New scene represents a simple
    // fragment of the parent, independent of parent's collapsed subtrees.
    foldedNodes: {},
    createdAt: new Date(),
    updatedAt: new Date()
  };
}
