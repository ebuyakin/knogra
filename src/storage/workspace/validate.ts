import type { GraphData } from './transfer';
import type { SceneId } from '../../core/main-types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate graph data integrity.
 * Called before import (warn + confirm) and after export collection (warn-only).
 *
 * Checks:
 * 1. No duplicate node/edge/scene IDs
 * 2. Every scene.centralNodeId exists in nodes
 * 3. Every scene.nodes key exists in nodes
 * 4. Every scene.edges key exists in edges
 * 5. For every edge in scene.edges: both sourceId and targetId are in scene.nodes
 * 6. Every scene.nodes entry has a valid position {x, y}
 * 7. Every scene.nodes entry has a design.id string
 * 8. Every key in scene.foldedNodes exists in scene.nodes
 * 9. scene.viewport has numeric zoom, pan.x, pan.y
 */
export function validateGraphData(graph: GraphData): ValidationResult {
  const errors: string[] = [];

  // Build lookup sets from top-level collections
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    const n = node as { id?: string };
    if (!n.id) { errors.push('Node missing id field'); continue; }
    if (nodeIds.has(n.id)) errors.push(`Duplicate node id: ${n.id}`);
    nodeIds.add(n.id);
  }

  const edgeIds = new Set<string>();
  const edgeEndpoints = new Map<string, { sourceId: string; targetId: string }>();
  for (const edge of graph.edges) {
    const e = edge as { id?: string; sourceId?: string; targetId?: string };
    if (!e.id) { errors.push('Edge missing id field'); continue; }
    if (edgeIds.has(e.id)) errors.push(`Duplicate edge id: ${e.id}`);
    edgeIds.add(e.id);
    if (e.sourceId && e.targetId) {
      edgeEndpoints.set(e.id, { sourceId: e.sourceId, targetId: e.targetId });
    }
  }

  const sceneIds = new Set<string>();
  for (const scene of graph.scenes) {
    const s = scene as {
      id?: string;
      centralNodeId?: string;
      nodes?: Record<string, unknown>;
      edges?: Record<string, unknown>;
      foldedNodes?: Record<string, unknown>;
      viewport?: { zoom?: unknown; pan?: { x?: unknown; y?: unknown } };
    };

    if (!s.id) { errors.push('Scene missing id field'); continue; }
    if (sceneIds.has(s.id)) errors.push(`Duplicate scene id: ${s.id}`);
    sceneIds.add(s.id);

    // Check 2: centralNodeId must exist in nodes
    if (s.centralNodeId && !nodeIds.has(s.centralNodeId)) {
      errors.push(`Scene "${s.id}": centralNodeId "${s.centralNodeId}" not found in nodes`);
    }

    const sceneNodeIds = new Set(Object.keys(s.nodes ?? {}));

    // Check 3: scene.nodes keys must exist in global nodes
    for (const nodeId of sceneNodeIds) {
      if (!nodeIds.has(nodeId)) {
        errors.push(`Scene "${s.id}": member node "${nodeId}" not found in nodes`);
      }
    }

    // Checks 4, 5: scene.edges keys must exist in global edges,
    // and their endpoints must both be in scene.nodes
    for (const edgeId of Object.keys(s.edges ?? {})) {
      if (!edgeIds.has(edgeId)) {
        errors.push(`Scene "${s.id}": edge "${edgeId}" not found in edges`);
        continue;
      }
      const endpoints = edgeEndpoints.get(edgeId);
      if (!endpoints) continue;
      if (!sceneNodeIds.has(endpoints.sourceId)) {
        errors.push(`Scene "${s.id}": edge "${edgeId}" source "${endpoints.sourceId}" not in scene nodes`);
      }
      if (!sceneNodeIds.has(endpoints.targetId)) {
        errors.push(`Scene "${s.id}": edge "${edgeId}" target "${endpoints.targetId}" not in scene nodes`);
      }
    }

    // Checks 6, 7: each scene.nodes entry must have valid position and design
    for (const [nodeId, nodeData] of Object.entries(s.nodes ?? {})) {
      const nd = nodeData as { position?: { x?: unknown; y?: unknown }; design?: { id?: unknown } };
      if (typeof nd.position?.x !== 'number' || typeof nd.position?.y !== 'number') {
        errors.push(`Scene "${s.id}": node "${nodeId}" has invalid position`);
      }
      if (typeof nd.design?.id !== 'string') {
        errors.push(`Scene "${s.id}": node "${nodeId}" has missing or invalid design.id`);
      }
    }

    // Check 8: foldedNodes keys must exist in scene.nodes
    for (const foldedNodeId of Object.keys(s.foldedNodes ?? {})) {
      if (!sceneNodeIds.has(foldedNodeId)) {
        errors.push(`Scene "${s.id}": foldedNodes key "${foldedNodeId}" not in scene nodes`);
      }
    }

    // Check 9: viewport must have numeric zoom, pan.x, pan.y
    const vp = s.viewport;
    if (
      typeof vp?.zoom !== 'number' ||
      typeof vp?.pan?.x !== 'number' ||
      typeof vp?.pan?.y !== 'number'
    ) {
      errors.push(`Scene "${s.id}": viewport is missing or malformed`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate scenes individually, returning a map of sceneId → errors.
 * Used by Node Manager to show per-scene status (green/red dot).
 *
 * Intentionally duplicates the scene-loop logic from validateGraphData
 * to keep the two functions independent — each can evolve without
 * coupling the other.
 */
export function validateScenes(graph: GraphData): Map<SceneId, string[]> {
  const result = new Map<SceneId, string[]>();

  // Build lookup sets for cross-scene checks
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    const n = node as { id?: string };
    if (n.id) nodeIds.add(n.id);
  }

  const edgeEndpoints = new Map<string, { sourceId: string; targetId: string }>();
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    const e = edge as { id?: string; sourceId?: string; targetId?: string };
    if (!e.id) continue;
    edgeIds.add(e.id);
    if (e.sourceId && e.targetId) {
      edgeEndpoints.set(e.id, { sourceId: e.sourceId, targetId: e.targetId });
    }
  }

  for (const scene of graph.scenes) {
    const s = scene as {
      id?: string;
      centralNodeId?: string;
      nodes?: Record<string, unknown>;
      edges?: Record<string, unknown>;
      foldedNodes?: Record<string, unknown>;
      viewport?: { zoom?: unknown; pan?: { x?: unknown; y?: unknown } };
    };
    if (!s.id) continue;

    const sceneErrors: string[] = [];

    if (s.centralNodeId && !nodeIds.has(s.centralNodeId)) {
      sceneErrors.push(`centralNodeId "${s.centralNodeId}" not found in nodes`);
    }

    const sceneNodeIds = new Set(Object.keys(s.nodes ?? {}));

    for (const nodeId of sceneNodeIds) {
      if (!nodeIds.has(nodeId)) {
        sceneErrors.push(`member node "${nodeId}" not found in nodes`);
      }
    }

    for (const edgeId of Object.keys(s.edges ?? {})) {
      if (!edgeIds.has(edgeId)) {
        sceneErrors.push(`edge "${edgeId}" not found in edges`);
        continue;
      }
      const endpoints = edgeEndpoints.get(edgeId);
      if (!endpoints) continue;
      if (!sceneNodeIds.has(endpoints.sourceId)) {
        sceneErrors.push(`edge "${edgeId}" source "${endpoints.sourceId}" not in scene nodes`);
      }
      if (!sceneNodeIds.has(endpoints.targetId)) {
        sceneErrors.push(`edge "${edgeId}" target "${endpoints.targetId}" not in scene nodes`);
      }
    }

    for (const [nodeId, nodeData] of Object.entries(s.nodes ?? {})) {
      const nd = nodeData as { position?: { x?: unknown; y?: unknown }; design?: { id?: unknown } };
      if (typeof nd.position?.x !== 'number' || typeof nd.position?.y !== 'number') {
        sceneErrors.push(`node "${nodeId}" has invalid position`);
      }
      if (typeof nd.design?.id !== 'string') {
        sceneErrors.push(`node "${nodeId}" has missing or invalid design.id`);
      }
    }

    for (const foldedNodeId of Object.keys(s.foldedNodes ?? {})) {
      if (!sceneNodeIds.has(foldedNodeId)) {
        sceneErrors.push(`foldedNodes key "${foldedNodeId}" not in scene nodes`);
      }
    }

    const vp = s.viewport;
    if (
      typeof vp?.zoom !== 'number' ||
      typeof vp?.pan?.x !== 'number' ||
      typeof vp?.pan?.y !== 'number'
    ) {
      sceneErrors.push(`viewport is missing or malformed`);
    }

    result.set(s.id as SceneId, sceneErrors);
  }

  return result;
}
