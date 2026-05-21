/**
 * Seed an empty workspace with a single anchor node and one scene.
 *
 * Called from two paths:
 *  1. Cold start in `main.ts` when IndexedDB is empty (incognito / first run).
 *  2. `newWorkspace()` in `workspace.ts` after `clearAllData()`.
 *
 * Uses graphStore methods (not raw Dexie) so the in-memory cache is updated
 * — the cold-start path relies on this since it does not reload the page.
 */

import type { NodeId, SceneId } from '../core/main-types';
import { graphStore } from './graph-store';
import { AppStateManager } from './app-state';

/** Pixel center of the Cytoscape container, used as the seed scene's pan origin. */
function getCyContainerCenter(): { x: number; y: number } {
  const el = document.getElementById('cy');
  if (el) return { x: el.clientWidth / 2, y: el.clientHeight / 2 };
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

export async function seedInitialGraph(): Promise<SceneId> {
  const now = new Date();
  const ts = Date.now().toString();
  const formatted = `${ts.slice(0, 4)}-${ts.slice(4, 7)}-${ts.slice(7, 10)}-${ts.slice(10)}`;
  const nodeId = `n-${formatted}` as NodeId;
  const sceneId = `scene-${formatted}` as SceneId;

  await graphStore.createNode({
    id: nodeId,
    title: 'New Idea',
    tags: [],
    properties: {},
    createdAt: now,
    updatedAt: now,
    attachments: [],
    aiArtifacts: [],
    isAnchor: true,
  });

  await graphStore.createScene({
    id: sceneId,
    title: 'Anchor scene',
    description: '',
    centralNodeId: nodeId,
    nodes: {
      [nodeId]: {
        position: { x: 0, y: 0 },
        scale: 1.0,
        design: { id: 'default-node', params: {} },
      },
    },
    edges: {},
    backgroundImages: [],
    themeId: 'dark',
    viewport: { zoom: 1, pan: getCyContainerCenter() },
    createdAt: now,
    updatedAt: now,
  });

  AppStateManager.saveLastSceneId(sceneId);
  return sceneId;
}
