/**
 * Scene resolution
 *
 * Which scene a navigation lands on: the one whose central node is the
 * target, or a new one when the node has none. The policy is here (View mode
 * never creates a scene); the drafts are pure functions below, and the one
 * the engine uses builds the new scene from the scene one came from,
 * preserving each neighbour's offset from the target (scene-transitions.md
 * §4.3). The map view supplies its own draft (map-view.md §8).
 */

import type { Scene, SceneId, NodeId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';
import { isEditMode } from '../../storage/app-mode';
import { findDirectlyConnected } from '../utils/pure/scene-calculations';

interface Position {
  x: number;
  y: number;
}

export function findSceneByCentral(centralNodeId: NodeId): Scene | null {
  return graphStore.scenes.find(s => s.centralNodeId === centralNodeId) ?? null;
}

/**
 * The scene whose central node is `nodeId`, or in Edit mode the draft
 * persisted and returned. The id is the engine's to assign, so the draft
 * receives it: a caller outside the engine (the map view) never learns the
 * format. View mode cannot create a scene; the caller decides whether that is
 * a refusal or an error.
 */
export async function ensureScene(nodeId: NodeId, draft: (sceneId: SceneId) => Scene): Promise<Scene> {
  const existing = findSceneByCentral(nodeId);
  if (existing) return existing;
  if (!isEditMode()) throw new Error(`Cannot create a scene in View mode for node: ${nodeId}`);
  const scene = draft(sceneIdFor(nodeId));
  await graphStore.updateScene(scene);
  return scene;
}

/** The id a new scene centred on `nodeId` gets. */
export function sceneIdFor(nodeId: NodeId): SceneId {
  return generateSceneId(nodeId, graphStore.nodes.find(n => n.id === nodeId)?.title ?? 'untitled');
}

/** The engine's draft: the target at the viewport centre, its direct neighbours at their offsets from it in the current scene. */
export function draftFromCurrent(targetNodeId: NodeId, sceneId: SceneId, currentScene: Scene, viewportCenter: Position): Scene {
  const connected = findDirectlyConnected(targetNodeId, graphStore.edges);
  const edgeEndpoints = new Map(graphStore.edges.map(edge => [edge.id, [edge.sourceId, edge.targetId] as [NodeId, NodeId]]));
  return buildSceneFromOffsets(targetNodeId, sceneId, currentScene, viewportCenter, [targetNodeId, ...connected], edgeEndpoints);
}

// ============================================================================
// PURE
// ============================================================================

/**
 * Generate a scene ID from node title and ID
 * Format: scene-<sanitized-title>-<nodeId>
 */
export function generateSceneId(nodeId: NodeId, title: string): SceneId {
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
 * @param sceneId - the new scene's id, assigned by the caller
 * @param currentScene - The scene we're transitioning from
 * @param viewportCenter - Where to place the central node
 * @param connectedNodeIds - Nodes to include (typically target + its connections)
 * @param edgeEndpoints - every graph edge's endpoints, to keep only edges inside the new scene
 */
export function buildSceneFromOffsets(
  targetCentralId: NodeId,
  sceneId: SceneId,
  currentScene: Scene,
  viewportCenter: Position,
  connectedNodeIds: NodeId[],
  edgeEndpoints: Map<string, [NodeId, NodeId]>
): Scene {
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
  // Endpoints live in the graph; scene.edges stores per-scene styling only.
  const newNodeIds = new Set(Object.keys(newNodes));
  const newEdges: Scene['edges'] = {};
  for (const [edgeId, edgeData] of Object.entries(currentScene.edges)) {
    const endpoints = edgeEndpoints.get(edgeId);
    if (!endpoints) continue;
    if (newNodeIds.has(endpoints[0]) && newNodeIds.has(endpoints[1])) {
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
