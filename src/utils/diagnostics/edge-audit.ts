/**
 * Edge audit — dev-only console diagnostic.
 *
 * Invoked from devtools as `knogra.auditEdges()`. Inspects `graphStore` and
 * reports:
 *   1. Duplicate edges (multiple edges between the same node pair, direction-
 *      agnostic). This is the primary motivator — the only existing tool that
 *      could surface duplicates was the Node Manager, which doesn't show edges.
 *   2. Orphan edges (source or target node missing from the graph).
 *   3. Scene-edge references that point to a non-existent edge in the graph.
 *
 * Output is grouped console.tables for easy scanning. Returns nothing — purely
 * a side-effecting devtools helper. Excluded from production builds via the
 * dynamic-import pattern used by `snapshot()` and `clearBuffers()` in main.ts.
 */

import type { Edge, EdgeId, NodeId, SceneId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';

type PairKey = string;

const pairKey = (a: NodeId, b: NodeId): PairKey =>
  a < b ? `${a}__${b}` : `${b}__${a}`;

interface DuplicateRow {
  pair: string;
  edgeId: EdgeId;
  source: string;
  target: string;
  title: string;
  scenesUsing: string;
}

interface OrphanRow {
  edgeId: EdgeId;
  sourceId: NodeId;
  targetId: NodeId;
  missing: string;
}

interface SceneRefRow {
  sceneId: SceneId;
  sceneTitle: string;
  edgeId: EdgeId;
}

export function auditEdges(): void {
  const nodes = graphStore.nodes;
  const edges = graphStore.edges;
  const scenes = graphStore.scenes;

  const nodeById = new Map<NodeId, string>();
  for (const n of nodes) nodeById.set(n.id, n.title);

  // Pre-compute: which scenes reference each edgeId
  const scenesByEdge = new Map<EdgeId, SceneId[]>();
  for (const scene of scenes) {
    for (const edgeId of Object.keys(scene.edges) as EdgeId[]) {
      let arr = scenesByEdge.get(edgeId);
      if (!arr) {
        arr = [];
        scenesByEdge.set(edgeId, arr);
      }
      arr.push(scene.id);
    }
  }

  // 1. Duplicates: group by undirected endpoint pair
  const byPair = new Map<PairKey, Edge[]>();
  for (const e of edges) {
    const key = pairKey(e.sourceId, e.targetId);
    let arr = byPair.get(key);
    if (!arr) {
      arr = [];
      byPair.set(key, arr);
    }
    arr.push(e);
  }

  const duplicateRows: DuplicateRow[] = [];
  for (const [key, group] of byPair) {
    if (group.length < 2) continue;
    const [aId, bId] = key.split('__') as [NodeId, NodeId];
    const pairLabel = `${nodeById.get(aId) ?? '?'} ↔ ${nodeById.get(bId) ?? '?'}`;
    for (const e of group) {
      duplicateRows.push({
        pair: pairLabel,
        edgeId: e.id,
        source: nodeById.get(e.sourceId) ?? `(missing: ${e.sourceId})`,
        target: nodeById.get(e.targetId) ?? `(missing: ${e.targetId})`,
        title: e.title,
        scenesUsing: (scenesByEdge.get(e.id) ?? []).join(', ') || '(none)',
      });
    }
  }

  // 2. Orphans: source or target node missing
  const orphanRows: OrphanRow[] = [];
  for (const e of edges) {
    const srcMissing = !nodeById.has(e.sourceId);
    const tgtMissing = !nodeById.has(e.targetId);
    if (!srcMissing && !tgtMissing) continue;
    const missing = [
      srcMissing ? `source(${e.sourceId})` : null,
      tgtMissing ? `target(${e.targetId})` : null,
    ].filter(Boolean).join(', ');
    orphanRows.push({
      edgeId: e.id,
      sourceId: e.sourceId,
      targetId: e.targetId,
      missing,
    });
  }

  // 3. Scene refs pointing to edges not in graphStore.edges
  const edgeIds = new Set<EdgeId>(edges.map(e => e.id));
  const sceneRefRows: SceneRefRow[] = [];
  for (const scene of scenes) {
    for (const edgeId of Object.keys(scene.edges) as EdgeId[]) {
      if (!edgeIds.has(edgeId)) {
        sceneRefRows.push({
          sceneId: scene.id,
          sceneTitle: scene.title,
          edgeId,
        });
      }
    }
  }

  // Output
  const totals = {
    edges: edges.length,
    nodes: nodes.length,
    scenes: scenes.length,
    duplicateGroups: duplicateRows.length === 0
      ? 0
      : new Set(duplicateRows.map(r => r.pair)).size,
    duplicateEdges: duplicateRows.length,
    orphanEdges: orphanRows.length,
    danglingSceneRefs: sceneRefRows.length,
  };

  console.group(
    `[edge-audit] ${totals.edges} edges · ` +
    `${totals.duplicateGroups} dup groups · ` +
    `${totals.orphanEdges} orphans · ` +
    `${totals.danglingSceneRefs} dangling scene refs`
  );
  console.log('Totals:', totals);

  if (duplicateRows.length > 0) {
    console.group(`Duplicates (${totals.duplicateGroups} pairs, ${duplicateRows.length} edges)`);
    console.table(duplicateRows);
    console.groupEnd();
  } else {
    console.log('Duplicates: none ✓');
  }

  if (orphanRows.length > 0) {
    console.group(`Orphans (${orphanRows.length})`);
    console.table(orphanRows);
    console.groupEnd();
  } else {
    console.log('Orphans: none ✓');
  }

  if (sceneRefRows.length > 0) {
    console.group(`Dangling scene refs (${sceneRefRows.length})`);
    console.table(sceneRefRows);
    console.groupEnd();
  } else {
    console.log('Dangling scene refs: none ✓');
  }

  console.groupEnd();
}
