/**
 * Tag-based style application planner (pure).
 *
 * Given the workspace scenes and a node→tags map, computes which node
 * instances (per scene) a tag-targeted "paste style" would touch. No
 * Cytoscape access, no store access, no side effects — the result feeds both
 * the live preview count and the executor in SceneNodeOps.
 */

import type { NodeId, Scene, SceneId } from '../../core/main-types';

export interface TagStyleParams {
  /** Union match: a node is targeted if it carries ANY of these tags. */
  tags: string[];
  scope: 'current' | 'all';
  applyDesign: boolean;
  applyScale: boolean;
  currentSceneId: SceneId | null;
  /**
   * The copied-from node (the style template). Only its instance in the
   * current scene is excluded from the plan — instances of the same node in
   * other scenes are still restyled, matching the live paste behaviour.
   */
  excludeNodeId?: NodeId | null;
}

export interface TagStylePlan {
  /** Per-scene node instances to update, current scene included. */
  perScene: { sceneId: SceneId; nodeIds: NodeId[] }[];
  /** Matches that live in the current scene (routed through Cytoscape). */
  currentSceneNodeIds: NodeId[];
  /** Total node instances across all in-scope scenes. */
  totalNodeInstances: number;
  /** Number of scenes with at least one match in scope. */
  totalScenes: number;
}

const EMPTY_PLAN: TagStylePlan = {
  perScene: [],
  currentSceneNodeIds: [],
  totalNodeInstances: 0,
  totalScenes: 0
};

export function computeTagStylePlan(
  scenes: Scene[],
  nodeTags: Map<NodeId, string[]>,
  params: TagStyleParams
): TagStylePlan {
  const wanted = new Set(params.tags);
  if (wanted.size === 0) return EMPTY_PLAN;
  if (!params.applyDesign && !params.applyScale) return EMPTY_PLAN;

  const targetNodeIds = collectTargetNodeIds(nodeTags, wanted);
  if (targetNodeIds.size === 0) return EMPTY_PLAN;

  const scenesInScope = params.scope === 'current'
    ? scenes.filter(scene => scene.id === params.currentSceneId)
    : scenes;

  const perScene: { sceneId: SceneId; nodeIds: NodeId[] }[] = [];
  let currentSceneNodeIds: NodeId[] = [];
  let totalNodeInstances = 0;

  for (const scene of scenesInScope) {
    // The template node is only excluded within the current scene; its
    // instances in other scenes are legitimate restyle targets.
    const excludeInScene = params.excludeNodeId && scene.id === params.currentSceneId
      ? params.excludeNodeId
      : null;
    const nodeIds = Object.keys(scene.nodes).filter(
      id => targetNodeIds.has(id as NodeId) && id !== excludeInScene
    ) as NodeId[];
    if (nodeIds.length === 0) continue;
    perScene.push({ sceneId: scene.id, nodeIds });
    totalNodeInstances += nodeIds.length;
    if (scene.id === params.currentSceneId) currentSceneNodeIds = nodeIds;
  }

  return { perScene, currentSceneNodeIds, totalNodeInstances, totalScenes: perScene.length };
}

function collectTargetNodeIds(nodeTags: Map<NodeId, string[]>, wanted: Set<string>): Set<NodeId> {
  const result = new Set<NodeId>();
  for (const [nodeId, tags] of nodeTags) {
    if (tags.some(tag => wanted.has(tag))) result.add(nodeId);
  }
  return result;
}
