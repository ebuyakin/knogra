/**
 * Shelf Store
 *
 * The shelf is one workspace-wide collection of concepts the assistant has
 * proposed. An entry is a concept, unique by title; a placement is the intent to
 * put that concept in one scene. This module is the only place that knows the
 * persisted shape.
 *
 * See docs/ai/shelf-architecture.md.
 */

import type { NodeId } from '../../core/main-types';
import type { CreateConnectedAction, ShelfAction, ShelfEntry, ShelfPlacement } from '../types';
import { graphStore } from '../../storage/graph-store';
import { SHELF_KEY } from '../../config/storage-config';
import { isDebug } from '../../config/debug-flags';

// ============================================================================
// PERSISTED SHAPE
// ============================================================================

const STORAGE_VERSION = 2;

interface ShelfStorage {
  version: number;
  entries: ShelfEntry[];
}

/** Version 1: one bucket per central node, holding raw actions. */
interface LegacyBucket {
  actions: ShelfAction[];
  timestamp?: number;
}

/** Field written before edge types reached the shelf. */
interface LegacyDirectionFields {
  connectionType?: 'child' | 'parent';
}

/**
 * Only 'parent' needs translating: an absent or 'child' value already falls
 * through to "central -> new" in `resolveEdgeDirection`.
 */
function migrateLegacyDirection(action: ShelfAction): string | undefined {
  if (action.direction) return action.direction;
  const legacy = (action as CreateConnectedAction & LegacyDirectionFields).connectionType;
  return legacy === 'parent' ? 'new -> central' : undefined;
}

// ============================================================================
// STATE
// ============================================================================

let entries: ShelfEntry[] | null = null;

function key(title: string): string {
  return title.trim().toLowerCase();
}

function newEntryId(): string {
  return `shelf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function findGraphNodeByTitle(title: string): NodeId | undefined {
  const needle = key(title);
  return graphStore.nodes.find(node => key(node.title) === needle)?.id;
}

function toStringRecord(props: Record<string, unknown> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(props ?? {})) {
    if (typeof value === 'string') result[name] = value;
  }
  return result;
}

// ============================================================================
// LOAD / SAVE
// ============================================================================

function migrateFromLegacy(legacy: Record<string, LegacyBucket>): ShelfEntry[] {
  const byTitle = new Map<string, ShelfEntry>();

  for (const [centralNodeId, bucket] of Object.entries(legacy)) {
    const addedAt = bucket?.timestamp ?? 0;
    for (const action of bucket?.actions ?? []) {
      if (!action?.title) continue;

      const placement: ShelfPlacement = {
        centralNodeId,
        edgeType: action.edgeType,
        direction: migrateLegacyDirection(action),
        reason: action.reason ?? '',
        addedAt
      };

      const existing = byTitle.get(key(action.title));
      if (existing) {
        existing.placements.push(placement);
        continue;
      }

      byTitle.set(key(action.title), {
        id: newEntryId(),
        title: action.title,
        properties: action.type === 'create_connected' ? action.properties ?? {} : {},
        nodeId: findGraphNodeByTitle(action.title),
        placements: [placement]
      });
    }
  }

  return [...byTitle.values()];
}

function load(): ShelfEntry[] {
  if (entries) return entries;

  try {
    const stored = localStorage.getItem(SHELF_KEY);
    if (!stored) {
      entries = [];
      return entries;
    }

    const parsed: unknown = JSON.parse(stored);
    if (parsed && typeof parsed === 'object' && 'version' in parsed) {
      entries = (parsed as ShelfStorage).entries ?? [];
      return entries;
    }

    entries = migrateFromLegacy(parsed as Record<string, LegacyBucket>);
    if (isDebug('d_shelf')) console.log(`[ShelfStore] Migrated ${entries.length} entries from v1`);
    save();
  } catch (error) {
    console.warn('[ShelfStore] Failed to load, starting empty:', error);
    entries = [];
  }

  return entries;
}

function save(): void {
  const current = entries ?? [];
  try {
    // Removing the key rather than writing an empty document keeps the
    // "workspace has shelf items" check in workspace/dialogs.ts honest.
    if (current.length === 0) {
      localStorage.removeItem(SHELF_KEY);
      return;
    }
    const payload: ShelfStorage = { version: STORAGE_VERSION, entries: current };
    localStorage.setItem(SHELF_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[ShelfStore] Failed to save:', error);
  }
}

/** Drop entries left with no placements; they are no longer on any shelf. */
function pruneEmpty(): void {
  entries = load().filter(entry => entry.placements.length > 0);
}

/** Called after any mutation; `entries` is replaced or edited in place beforehand. */
function commit(): void {
  pruneEmpty();
  save();
}

// ============================================================================
// READS
// ============================================================================

/**
 * The entries on one scene's shelf, in the order they were proposed.
 *
 * Reconciling rather than merely reading. An entry whose concept has since
 * appeared in the graph binds to that node; a placement whose concept is already
 * in the scene is dropped; and anything referring to a node the graph no longer
 * has goes, which is how a deleted node's suggestions are cleaned up. Scene
 * membership is passed in because the store has no view of the scene.
 */
export function reconcileScene(centralNodeId: NodeId, sceneNodeIds: Set<NodeId>): ShelfEntry[] {
  const graphNodeIds = new Set(graphStore.nodes.map(node => node.id));

  // Pruning compares entries against the graph, so an unloaded graph would look
  // like every node had been deleted. Never prune against nothing.
  if (graphNodeIds.size === 0) return [];

  const visible: { entry: ShelfEntry; placement: ShelfPlacement }[] = [];
  let changed = false;

  // A concept whose node was deleted goes with it: deleting the node is the
  // strongest rejection available, so it is not resurrected as a create-new.
  const surviving = load().filter(entry => !entry.nodeId || graphNodeIds.has(entry.nodeId));
  if (surviving.length !== load().length) {
    entries = surviving;
    changed = true;
  }

  for (const entry of surviving) {
    if (!entry.nodeId) {
      const bound = findGraphNodeByTitle(entry.title);
      if (bound) {
        entry.nodeId = bound;
        changed = true;
      }
    }

    const live = entry.placements.filter(item => graphNodeIds.has(item.centralNodeId));
    if (live.length !== entry.placements.length) {
      entry.placements = live;
      changed = true;
    }

    const placement = entry.placements.find(item => item.centralNodeId === centralNodeId);
    if (!placement) continue;

    if (entry.nodeId && sceneNodeIds.has(entry.nodeId)) {
      entry.placements = entry.placements.filter(item => item !== placement);
      changed = true;
      if (isDebug('d_shelf')) console.log(`[ShelfStore] Dropped stale placement: ${entry.title}`);
      continue;
    }

    visible.push({ entry, placement });
  }

  if (changed) commit();

  return visible
    .sort((a, b) => a.placement.addedAt - b.placement.addedAt)
    .map(item => item.entry);
}

/** The placement an entry holds in one scene, or undefined if it holds none. */
export function getPlacement(entryId: string, centralNodeId: NodeId): ShelfPlacement | undefined {
  return load()
    .find(entry => entry.id === entryId)
    ?.placements.find(placement => placement.centralNodeId === centralNodeId);
}

/** One scene's shelf, read without reconciling, in the order the entries were proposed. */
export function getScenePlacements(
  centralNodeId: NodeId
): { entry: ShelfEntry; placement: ShelfPlacement }[] {
  return load()
    .flatMap(entry =>
      entry.placements
        .filter(placement => placement.centralNodeId === centralNodeId)
        .map(placement => ({ entry, placement }))
    )
    .sort((a, b) => a.placement.addedAt - b.placement.addedAt);
}

export function getEntry(entryId: string): ShelfEntry | undefined {
  return load().find(entry => entry.id === entryId);
}

/**
 * Entries proposed in other scenes that do not exist in the graph yet. These are
 * the concepts the assistant may propose for the current scene without inventing
 * a duplicate; see docs/ai/shelf-architecture.md §6.
 */
export function getPendingElsewhere(centralNodeId: NodeId): ShelfEntry[] {
  return load().filter(
    entry => !entry.nodeId && !entry.placements.some(p => p.centralNodeId === centralNodeId)
  );
}

// ============================================================================
// WRITES
// ============================================================================

/**
 * Route model actions to the shelf for one scene. A title resolves in one order —
 * graph node, then existing entry, then new entry — so the same concept proposed
 * twice gains a placement rather than a duplicate.
 *
 * Returns the entries that gained a placement, in order, so the caller can animate
 * exactly what arrived.
 */
export function addSuggestions(centralNodeId: NodeId, actions: ShelfAction[]): ShelfEntry[] {
  const all = load();
  const added: ShelfEntry[] = [];
  const graphEquations = new Set(
    graphStore.nodes
      .map(node => toStringRecord(node.properties).equation?.trim())
      .filter((equation): equation is string => !!equation)
  );

  for (const action of actions) {
    const title = action.title?.trim();
    if (!title) continue;

    const graphNodeId = findGraphNodeByTitle(title);
    if (action.type === 'include_existing' && !graphNodeId) {
      if (isDebug('d_shelf')) console.log(`[ShelfStore] Skipping "${title}" - not in graph`);
      continue;
    }

    let entry = all.find(candidate => key(candidate.title) === key(title));

    if (!entry) {
      const equation = action.type === 'create_connected'
        ? action.properties?.equation?.trim()
        : undefined;
      if (equation && graphEquations.has(equation)) {
        if (isDebug('d_shelf')) console.log(`[ShelfStore] Skipping "${title}" - equation exists`);
        continue;
      }

      entry = {
        id: newEntryId(),
        title,
        properties: action.type === 'create_connected' ? action.properties ?? {} : {},
        nodeId: graphNodeId,
        placements: []
      };
      all.push(entry);
    } else if (graphNodeId && !entry.nodeId) {
      entry.nodeId = graphNodeId;
    }

    if (entry.placements.some(placement => placement.centralNodeId === centralNodeId)) {
      if (isDebug('d_shelf')) console.log(`[ShelfStore] Skipping "${title}" - already on this shelf`);
      continue;
    }

    entry.placements.push({
      centralNodeId,
      edgeType: action.edgeType,
      direction: action.direction,
      reason: action.reason ?? '',
      addedAt: Date.now()
    });
    added.push(entry);
  }

  if (added.length > 0) commit();
  return added;
}

/** The concept now exists in the graph, and its placement in this scene is spent. */
export function materialise(entryId: string, nodeId: NodeId, centralNodeId: NodeId): void {
  const entry = getEntry(entryId);
  if (!entry) return;
  entry.nodeId = nodeId;
  entry.placements = entry.placements.filter(p => p.centralNodeId !== centralNodeId);
  commit();
}

/** Remove one placement: the concept does not belong in this scene. */
export function removePlacement(entryId: string, centralNodeId: NodeId): void {
  const entry = getEntry(entryId);
  if (!entry) return;
  entry.placements = entry.placements.filter(p => p.centralNodeId !== centralNodeId);
  commit();
}

/** Remove the concept from every shelf. */
export function removeEntry(entryId: string): void {
  entries = load().filter(entry => entry.id !== entryId);
  commit();
}

/** Remove every placement in one scene, leaving other scenes untouched. */
export function clearScene(centralNodeId: NodeId): void {
  for (const entry of load()) {
    entry.placements = entry.placements.filter(p => p.centralNodeId !== centralNodeId);
  }
  commit();
}
