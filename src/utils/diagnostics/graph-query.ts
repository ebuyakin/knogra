/**
 * Graph queries — dev-only console catalogue.
 *
 * Invoked from devtools as `window.debugger.graphQuery.<query>()`. Every query
 * reads the in-memory `graphStore`, prints a `console.table`, and returns its
 * rows so a result can be filtered or post-processed in the console.
 *
 * The source is deliberately `graphStore` and not IndexedDB: these queries
 * report what the running app believes, which is what the other diagnostics
 * and the transition analyzer read. Checking the cache against the database is
 * a different question and would be its own query.
 *
 * This file is the home for ad-hoc queries as they prove worth keeping. Adding
 * one means exporting a function — the module namespace is the catalogue, so
 * `main.ts` does not change. Excluded from production builds by the
 * `import.meta.env.DEV` branch that imports it.
 */

import type { DesignId, NodeId, Scene, SceneId, ThemeId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';

type NodeDesign = Scene['nodes'][NodeId]['design'];

export interface NodeMatchRow {
  id: NodeId;
  title: string;
  /** How many scenes include this node. */
  scenes: number;
}

export interface NodeDesignRow {
  scene: string;
  sceneId: SceneId;
  central: boolean;
  themeId: ThemeId;
  scale: number;
  designId: DesignId;
  /** Serialised so the console table shows the values rather than "Object". */
  params: string;
  design: NodeDesign;
}

export interface SceneRow {
  id: SceneId;
  title: string;
  central: string;
  themeId: ThemeId;
  nodes: number;
  edges: number;
  foldRoots: number;
}

/** Recursively sort object keys, so a JSON comparison stops seeing key order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = canonicalize(source[key]);
  }
  return sorted;
}

function countScenesWith(nodeId: NodeId): number {
  return graphStore.scenes.reduce(
    (total, scene) => total + (scene.nodes[nodeId] ? 1 : 0),
    0
  );
}

/**
 * Accept either a node id or an exact title, so a query can be run straight
 * from what is on screen. Reports and yields null when nothing matches or a
 * title is shared by several nodes.
 */
function resolveNodeId(reference: string): NodeId | null {
  const byId = graphStore.nodes.find(node => node.id === reference);
  if (byId) return byId.id;

  const needle = reference.toLowerCase();
  const byTitle = graphStore.nodes.filter(node => node.title.toLowerCase() === needle);
  if (byTitle.length === 1) return byTitle[0].id;

  if (byTitle.length > 1) {
    console.warn(
      `"${reference}" is the title of ${byTitle.length} nodes — pass an id instead:`,
      byTitle.map(node => node.id)
    );
    return null;
  }

  console.warn(`No node matches "${reference}". Try graphQuery.findNodes('${reference}').`);
  return null;
}

/** Nodes whose title contains `search`, with the number of scenes each is in. */
export function findNodes(search: string): NodeMatchRow[] {
  const needle = search.toLowerCase();
  const rows: NodeMatchRow[] = graphStore.nodes
    .filter(node => node.title.toLowerCase().includes(needle))
    .map(node => ({
      id: node.id,
      title: node.title,
      scenes: countScenesWith(node.id)
    }));

  console.table(rows);
  return rows;
}

/**
 * One row per scene containing the node, showing the design that scene stores
 * for it. The summary answers the question this query exists for: whether two
 * scenes hold designs that differ only in serialisation.
 */
export function nodeDesigns(nodeIdOrTitle: string): NodeDesignRow[] {
  const nodeId = resolveNodeId(nodeIdOrTitle);
  if (!nodeId) return [];

  const rows: NodeDesignRow[] = [];
  for (const scene of graphStore.scenes) {
    const sceneNode = scene.nodes[nodeId];
    if (!sceneNode) continue;

    rows.push({
      scene: scene.title,
      sceneId: scene.id,
      central: scene.centralNodeId === nodeId,
      themeId: scene.themeId,
      scale: sceneNode.scale,
      designId: sceneNode.design.id,
      params: JSON.stringify(sceneNode.design.params),
      design: sceneNode.design
    });
  }

  console.table(rows, ['scene', 'central', 'themeId', 'scale', 'designId', 'params']);

  const raw = new Set(rows.map(row => JSON.stringify(row.design)));
  const canonical = new Set(rows.map(row => JSON.stringify(canonicalize(row.design))));
  const themes = new Set(rows.map(row => row.themeId));
  console.log(
    `${rows.length} scene(s) · ${raw.size} distinct design JSON · ` +
    `${canonical.size} after key sorting · ${themes.size} theme(s)`
  );

  // The transition analyzer classifies on raw JSON inequality, so a difference
  // that lives only in key order still costs a ghost crossfade.
  if (raw.size > 1 && canonical.size === 1) {
    console.warn('Designs differ only in key order — crossfades between these scenes are false positives.');
  }
  if (canonical.size > 1) {
    console.warn('Designs genuinely differ — compare the params column between the scenes involved.');
  }
  if (themes.size > 1) {
    console.warn('Scenes use different themes — every shared node crossfades regardless of design.');
  }

  return rows;
}

/** Every scene, with its central node, theme and composition counts. */
export function scenes(): SceneRow[] {
  const titleById = new Map<NodeId, string>();
  for (const node of graphStore.nodes) titleById.set(node.id, node.title);

  const rows: SceneRow[] = graphStore.scenes.map(scene => ({
    id: scene.id,
    title: scene.title,
    central: titleById.get(scene.centralNodeId) ?? '(missing)',
    themeId: scene.themeId,
    nodes: Object.keys(scene.nodes).length,
    edges: Object.keys(scene.edges).length,
    foldRoots: Object.keys(scene.foldedNodes ?? {}).length
  }));

  console.table(rows);
  return rows;
}
