/**
 * Go home — navigate to the anchor node's scene.
 *
 * A flow (architecture.md §3.8): the path feature and the transition feature in
 * a fixed order, written once and called by every entry point — the path
 * panel's Home button and the Shift+N key. Home is an ordinary navigation
 * through the funnel, so the anchor's scene is appended to the history and `[`
 * leads back; clearing the history is the Path manager's "Clear history", a
 * recording operation, not a navigation one. Home is incompatible with
 * walking a fixed sequence, so it doubles as the deliberate way out of path mode
 * and asks first (paths-architecture §15.4).
 */

import type { NodeId, SceneId } from '../core/main-types';
import type { FeatureAPI } from '../features/feature-api';
import { graphStore } from '../storage/graph-store';

export interface GoHomeDeps {
  features: FeatureAPI;
}

interface AnchorScene {
  nodeId: NodeId;
  sceneId: SceneId;
}

function findAnchorScene(): AnchorScene | null {
  const anchorNode = graphStore.nodes.find(n => n.isAnchor);
  if (!anchorNode) return null;

  const anchorScene = graphStore.scenes.find(s => s.centralNodeId === anchorNode.id);
  return anchorScene ? { nodeId: anchorNode.id, sceneId: anchorScene.id } : null;
}

/**
 * The scene whose central node is the anchor, if the graph has an anchor and the anchor has a scene. The funnel
 * would create a missing scene in Edit mode; Home does not, so the panel can grey its button on the same condition.
 */
export function getAnchorSceneId(): SceneId | null {
  return findAnchorScene()?.sceneId ?? null;
}

export async function goHome({ features }: GoHomeDeps): Promise<void> {
  // The map has no scene to leave; the panel greys its button and the map's keys never reach here, but a flow guards
  // itself so a later entry point cannot bypass it.
  if (features.mapView.isActive()) return;
  const anchor = findAnchorScene();
  if (!anchor) return;
  // The funnel has no same-scene guard of its own.
  if (features.scene.getCurrentSceneId() === anchor.sceneId) return;

  if (features.path.isPathMode()) {
    if (!confirm('Exit path mode and return to the anchor scene?')) return;
    features.path.exitPathMode();
  }

  await features.transition.goToSceneByNode(anchor.nodeId);
}
