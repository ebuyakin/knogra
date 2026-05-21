/**
 * Scene audit — dev-only console diagnostic.
 *
 * Invoked from devtools as `knogra.auditScene()` (current scene) or
 * `knogra.auditScene('scene-id')`. Compares the persisted scene record in
 * `graphStore` against live Cytoscape state and reports any drift.
 *
 * Output sections (console.group + console.table):
 *   1. Summary             — counts, central node, theme, viewport.
 *   2. Scene ↔ cy diff     — nodes/edges present in one but not the other.
 *   3. Fold state diff     — scene.foldedNodes vs cy.scratch('foldedNodes').
 *   4. Node detail         — id, title, in db, in cy, visible, positions,
 *                            fold-root flags.
 *   5. Edge detail         — id, endpoints, in db, in cy, visible.
 *
 * "In cy" includes hidden (display:'none') nodes — they are still part of the
 * scene per the included-vs-visible distinction. "Visible" means
 * `style('display') !== 'none'`.
 *
 * Excluded from production builds via dynamic import (see main.ts).
 */

import type { Core } from 'cytoscape';
import type {
  EdgeId,
  FoldedNodeEntry,
  NodeId,
  Scene,
  SceneId,
} from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';

type FoldedMap = Record<NodeId, FoldedNodeEntry[]>;

interface SummaryRow {
  field: string;
  value: string | number;
}

interface NodeDiffRow {
  nodeId: NodeId;
  title: string;
  status: 'db-only' | 'cy-only' | 'both';
  visible?: boolean;
}

interface EdgeDiffRow {
  edgeId: EdgeId;
  source: string;
  target: string;
  status: 'db-only' | 'cy-only' | 'both';
  visible?: boolean;
}

interface FoldDiffRow {
  rootId: NodeId;
  rootTitle: string;
  inDb: string;       // count or "-"
  inScratch: string;  // count or "-"
  diff: string;       // human-readable diff or "match"
}

interface NodeDetailRow {
  id: NodeId;
  title: string;
  inDb: boolean;
  inCy: boolean;
  visible: boolean | '-';
  posDb: string;
  posCy: string;
  foldRootDb: boolean;
  foldRootCy: boolean;
}

interface EdgeDetailRow {
  id: EdgeId;
  source: string;
  target: string;
  inDb: boolean;
  inCy: boolean;
  visible: boolean | '-';
}

const fmtPos = (p?: { x: number; y: number }): string =>
  p ? `(${Math.round(p.x)}, ${Math.round(p.y)})` : '-';

const foldedIdsOf = (entries: FoldedNodeEntry[] | undefined): Set<NodeId> => {
  const out = new Set<NodeId>();
  if (!entries) return out;
  for (const e of entries) {
    const id = typeof e === 'string' ? (e as NodeId) : e.id;
    out.add(id);
  }
  return out;
};

const sceneIdResolve = (cy: Core, requested?: SceneId): SceneId | undefined => {
  if (requested) return requested;
  const fromScratch = cy.scratch('currentSceneId') as SceneId | undefined;
  return fromScratch ?? undefined;
};

export function auditScene(cy: Core, requestedId?: SceneId): void {
  const sceneId = sceneIdResolve(cy, requestedId);
  if (!sceneId) {
    console.warn('[scene-audit] No scene id provided and no currentSceneId in cy.scratch');
    return;
  }

  const scene: Scene | undefined = graphStore.scenes.find(s => s.id === sceneId);
  if (!scene) {
    console.warn(`[scene-audit] Scene not found in graphStore: ${sceneId}`);
    return;
  }

  const nodeTitle = new Map<NodeId, string>();
  for (const n of graphStore.nodes) nodeTitle.set(n.id, n.title);

  // ---------- gather ----------
  const dbNodeIds = new Set(Object.keys(scene.nodes) as NodeId[]);
  const dbEdgeIds = new Set(Object.keys(scene.edges) as EdgeId[]);

  const cyNodes = cy.nodes().filter(n => !n.id().startsWith('ghost_'));
  const cyEdges = cy.edges().filter(e => !e.id().startsWith('ghost_'));

  const cyNodeIds = new Set(cyNodes.map(n => n.id() as NodeId));
  const cyEdgeIds = new Set(cyEdges.map(e => e.id() as EdgeId));

  const cyNodeVisible = new Map<NodeId, boolean>();
  cyNodes.forEach(n => {
    cyNodeVisible.set(n.id() as NodeId, n.style('display') !== 'none');
  });

  const cyEdgeVisible = new Map<EdgeId, boolean>();
  cyEdges.forEach(e => {
    cyEdgeVisible.set(e.id() as EdgeId, e.style('display') !== 'none');
  });

  const cyNodePos = new Map<NodeId, { x: number; y: number }>();
  cyNodes.forEach(n => {
    const p = n.position();
    cyNodePos.set(n.id() as NodeId, { x: p.x, y: p.y });
  });

  const dbFold = (scene.foldedNodes ?? {}) as FoldedMap;
  const scratchFold = (cy.scratch('foldedNodes') ?? {}) as FoldedMap;

  // ---------- summary ----------
  const visibleCount = [...cyNodeVisible.values()].filter(Boolean).length;
  const hiddenCount = cyNodeVisible.size - visibleCount;

  const summary: SummaryRow[] = [
    { field: 'sceneId', value: scene.id },
    { field: 'title', value: scene.title },
    { field: 'centralNodeId', value: scene.centralNodeId },
    { field: 'themeId', value: scene.themeId },
    { field: 'db nodes', value: dbNodeIds.size },
    { field: 'cy nodes (total)', value: cyNodeIds.size },
    { field: 'cy nodes (visible)', value: visibleCount },
    { field: 'cy nodes (hidden)', value: hiddenCount },
    { field: 'db edges', value: dbEdgeIds.size },
    { field: 'cy edges', value: cyEdgeIds.size },
    { field: 'db fold roots', value: Object.keys(dbFold).length },
    { field: 'cy fold roots', value: Object.keys(scratchFold).length },
    { field: 'currentSceneId (cy.scratch)', value: String(cy.scratch('currentSceneId') ?? '-') },
    { field: 'sceneId requested', value: requestedId ?? '(current)' },
  ];

  console.group(`[scene-audit] ${scene.id} — ${scene.title}`);
  console.table(summary);

  // ---------- node diff ----------
  const nodeUnion = new Set<NodeId>([...dbNodeIds, ...cyNodeIds]);
  const nodeDiff: NodeDiffRow[] = [];
  for (const id of nodeUnion) {
    const inDb = dbNodeIds.has(id);
    const inCy = cyNodeIds.has(id);
    if (inDb && inCy) continue; // only show drift
    nodeDiff.push({
      nodeId: id,
      title: nodeTitle.get(id) ?? '(unknown)',
      status: inDb ? 'db-only' : 'cy-only',
      visible: inCy ? cyNodeVisible.get(id) : undefined,
    });
  }
  if (nodeDiff.length > 0) {
    console.group(`Node drift (${nodeDiff.length})`);
    console.table(nodeDiff);
    console.groupEnd();
  } else {
    console.log('Node drift: none ✓');
  }

  // ---------- edge diff ----------
  const edgeUnion = new Set<EdgeId>([...dbEdgeIds, ...cyEdgeIds]);
  const edgeDiff: EdgeDiffRow[] = [];
  for (const id of edgeUnion) {
    const inDb = dbEdgeIds.has(id);
    const inCy = cyEdgeIds.has(id);
    if (inDb && inCy) continue;
    const graphEdge = graphStore.edges.find(e => e.id === id);
    edgeDiff.push({
      edgeId: id,
      source: graphEdge ? (nodeTitle.get(graphEdge.sourceId) ?? graphEdge.sourceId) : '?',
      target: graphEdge ? (nodeTitle.get(graphEdge.targetId) ?? graphEdge.targetId) : '?',
      status: inDb ? 'db-only' : 'cy-only',
      visible: inCy ? cyEdgeVisible.get(id) : undefined,
    });
  }
  if (edgeDiff.length > 0) {
    console.group(`Edge drift (${edgeDiff.length})`);
    console.table(edgeDiff);
    console.groupEnd();
  } else {
    console.log('Edge drift: none ✓');
  }

  // ---------- fold state diff ----------
  const foldRoots = new Set<NodeId>([
    ...(Object.keys(dbFold) as NodeId[]),
    ...(Object.keys(scratchFold) as NodeId[]),
  ]);
  const foldDiff: FoldDiffRow[] = [];
  for (const rootId of foldRoots) {
    const dbIds = foldedIdsOf(dbFold[rootId]);
    const scratchIds = foldedIdsOf(scratchFold[rootId]);
    const onlyDb = [...dbIds].filter(id => !scratchIds.has(id));
    const onlyScratch = [...scratchIds].filter(id => !dbIds.has(id));
    const match = onlyDb.length === 0 && onlyScratch.length === 0;
    const parts: string[] = [];
    if (onlyDb.length > 0) parts.push(`db-only: ${onlyDb.join(', ')}`);
    if (onlyScratch.length > 0) parts.push(`cy-only: ${onlyScratch.join(', ')}`);
    foldDiff.push({
      rootId,
      rootTitle: nodeTitle.get(rootId) ?? '(unknown)',
      inDb: dbFold[rootId] ? String(dbIds.size) : '-',
      inScratch: scratchFold[rootId] ? String(scratchIds.size) : '-',
      diff: match ? 'match' : parts.join(' · '),
    });
  }
  if (foldDiff.length > 0) {
    console.group(`Fold roots (${foldDiff.length})`);
    console.table(foldDiff);
    console.groupEnd();
  } else {
    console.log('Fold roots: none');
  }

  // ---------- node detail ----------
  const dbFoldRoots = new Set<NodeId>(Object.keys(dbFold) as NodeId[]);
  const cyFoldRoots = new Set<NodeId>(Object.keys(scratchFold) as NodeId[]);

  const nodeDetail: NodeDetailRow[] = [];
  for (const id of nodeUnion) {
    nodeDetail.push({
      id,
      title: nodeTitle.get(id) ?? '(unknown)',
      inDb: dbNodeIds.has(id),
      inCy: cyNodeIds.has(id),
      visible: cyNodeIds.has(id) ? (cyNodeVisible.get(id) ?? false) : '-',
      posDb: fmtPos(scene.nodes[id]?.position),
      posCy: fmtPos(cyNodePos.get(id)),
      foldRootDb: dbFoldRoots.has(id),
      foldRootCy: cyFoldRoots.has(id),
    });
  }
  // Stable ordering: db-only first, then both, then cy-only; within each by id.
  const orderKey = (r: NodeDetailRow): number =>
    r.inDb && r.inCy ? 1 : r.inDb ? 0 : 2;
  nodeDetail.sort((a, b) => orderKey(a) - orderKey(b) || a.id.localeCompare(b.id));
  console.group(`Node detail (${nodeDetail.length})`);
  console.table(nodeDetail);
  console.groupEnd();

  // ---------- edge detail ----------
  const edgeDetail: EdgeDetailRow[] = [];
  for (const id of edgeUnion) {
    const graphEdge = graphStore.edges.find(e => e.id === id);
    edgeDetail.push({
      id,
      source: graphEdge ? (nodeTitle.get(graphEdge.sourceId) ?? graphEdge.sourceId) : '?',
      target: graphEdge ? (nodeTitle.get(graphEdge.targetId) ?? graphEdge.targetId) : '?',
      inDb: dbEdgeIds.has(id),
      inCy: cyEdgeIds.has(id),
      visible: cyEdgeIds.has(id) ? (cyEdgeVisible.get(id) ?? false) : '-',
    });
  }
  edgeDetail.sort((a, b) => a.id.localeCompare(b.id));
  console.group(`Edge detail (${edgeDetail.length})`);
  console.table(edgeDetail);
  console.groupEnd();

  console.groupEnd();
}
