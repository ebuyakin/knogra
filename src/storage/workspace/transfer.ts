import Dexie from 'dexie';
import type { EdgeType, EdgeTypeId } from '../../core/main-types';
import { createStarterEdgeTypes, getDefaultEdgeStyleSlotId, getDefaultEdgeTypeId, isEdgeStyleSlotId } from '../../config/edge-type-settings';

import {
  GRAPH_DB_NAME,
  GRAPH_DB_VERSION,
  GRAPH_DB_SCHEMA,
  CHAT_DB_NAME,
  CHAT_DB_VERSION,
  CHAT_DB_SCHEMA,
  PATH_DB_NAME,
  PATH_DB_VERSION,
  PATH_DB_SCHEMA,
  THEME_DB_NAME,
  THEME_DB_VERSION,
  THEME_DB_SCHEMA,
  SETTINGS_KEY,
  SHELF_KEY,
  STATE_KEY,
} from '../../config/storage-config';

export interface GraphData {
  nodes: unknown[];
  edges: unknown[];
  edgeTypes?: unknown[];
  scenes: unknown[];
}

const SENSITIVE_KEYS: Array<[string, string]> = [
  ['ai', 'geminiApiKey'],
  ['ai', 'openrouterApiKey'],
];

export async function generateWorkspaceName(): Promise<string> {
  const dateStr = new Date().toISOString().split('T')[0];

  try {
    const db = new Dexie(GRAPH_DB_NAME);
    db.version(GRAPH_DB_VERSION).stores(GRAPH_DB_SCHEMA);

    const nodes = await db.table('nodes').toArray();
    const anchor = nodes.find((node: { isAnchor?: boolean }) => node.isAnchor);
    if (anchor?.title) {
      const slug = anchor.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      return `graph-${slug}-${dateStr}`;
    }
  } catch {
    // Ignore DB errors and fall back to date-based name.
  }

  return `graph-${dateStr}`;
}

export async function exportGraphData(): Promise<GraphData> {
  const db = new Dexie(GRAPH_DB_NAME);
  db.version(GRAPH_DB_VERSION).stores(GRAPH_DB_SCHEMA);

  const [nodes, edges, edgeTypes, scenes] = await Promise.all([
    db.table('nodes').toArray(),
    db.table('edges').toArray(),
    db.table('edgeTypes').toArray(),
    db.table('scenes').toArray(),
  ]);

  return { nodes, edges, edgeTypes, scenes };
}

export function exportSettings(): Record<string, unknown> {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return {};

  try {
    const settings = JSON.parse(stored);
    delete settings.apiKey;
    for (const [domain, key] of SENSITIVE_KEYS) {
      if (settings[domain]) delete settings[domain][key];
    }
    return settings;
  } catch {
    return {};
  }
}

export async function exportConversations(): Promise<unknown[]> {
  const db = new Dexie(CHAT_DB_NAME);
  db.version(CHAT_DB_VERSION).stores(CHAT_DB_SCHEMA);
  return db.table('conversations').toArray();
}

export async function exportBackgroundImages(): Promise<unknown[]> {
  const db = new Dexie(GRAPH_DB_NAME);
  db.version(GRAPH_DB_VERSION).stores(GRAPH_DB_SCHEMA);
  return db.table('backgroundImages').toArray();
}

export function exportShelf(): Record<string, unknown> {
  const shelfData = localStorage.getItem(SHELF_KEY);
  if (!shelfData) return {};

  try {
    return JSON.parse(shelfData);
  } catch {
    return {};
  }
}

export async function exportPaths(): Promise<unknown[]> {
  const db = new Dexie(PATH_DB_NAME);
  db.version(PATH_DB_VERSION).stores(PATH_DB_SCHEMA);
  return db.table('paths').toArray();
}

export async function exportThemes(): Promise<unknown[]> {
  const db = new Dexie(THEME_DB_NAME);
  db.version(THEME_DB_VERSION).stores(THEME_DB_SCHEMA);
  return db.table('themes').toArray();
}

export async function clearAllData(keepSettings = false): Promise<void> {
  const graphDb = new Dexie(GRAPH_DB_NAME);
  graphDb.version(GRAPH_DB_VERSION).stores(GRAPH_DB_SCHEMA);
  await graphDb.table('nodes').clear();
  await graphDb.table('edges').clear();
  await graphDb.table('edgeTypes').clear();
  await graphDb.table('scenes').clear();
  await graphDb.table('backgroundImages').clear();

  const chatDb = new Dexie(CHAT_DB_NAME);
  chatDb.version(CHAT_DB_VERSION).stores(CHAT_DB_SCHEMA);
  await chatDb.table('conversations').clear();

  const pathDb = new Dexie(PATH_DB_NAME);
  pathDb.version(PATH_DB_VERSION).stores(PATH_DB_SCHEMA);
  await pathDb.table('paths').clear();

  localStorage.removeItem(SHELF_KEY);

  if (!keepSettings) {
    const themeDb = new Dexie(THEME_DB_NAME);
    themeDb.version(THEME_DB_VERSION).stores(THEME_DB_SCHEMA);
    await themeDb.table('themes').clear();

    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(STATE_KEY);
  }
}

export async function importGraphData(graph: GraphData, images: unknown[]): Promise<void> {
  const db = new Dexie(GRAPH_DB_NAME);
  db.version(GRAPH_DB_VERSION).stores(GRAPH_DB_SCHEMA);

  const edgeTypes = normalizeEdgeTypes(graph.edgeTypes);
  const edgeTypeIds = new Set(edgeTypes.map(edgeType => edgeType.id));
  const edges = graph.edges.map(edge => normalizeImportedEdge(edge, edgeTypeIds));

  if (graph.nodes.length > 0) {
    await db.table('nodes').bulkPut(graph.nodes);
  }
  if (edgeTypes.length > 0) {
    await db.table('edgeTypes').bulkPut(edgeTypes);
  }
  if (edges.length > 0) {
    await db.table('edges').bulkPut(edges);
  }
  if (graph.scenes.length > 0) {
    await db.table('scenes').bulkPut(graph.scenes);
  }
  if (images.length > 0) {
    await db.table('backgroundImages').bulkPut(images);
  }
}

function normalizeEdgeTypes(edgeTypes: unknown[] | undefined): EdgeType[] {
  const starterTypes = createStarterEdgeTypes();
  if (!edgeTypes || edgeTypes.length === 0) return starterTypes;

  const normalized: EdgeType[] = [];
  const seenIds = new Set<EdgeTypeId>();
  const now = new Date();

  for (const value of edgeTypes) {
    if (!isPlainRecord(value)) continue;
    if (typeof value.id !== 'string' || typeof value.name !== 'string') continue;

    const edgeTypeId = value.id as EdgeTypeId;
    if (seenIds.has(edgeTypeId)) continue;

    normalized.push({
      id: edgeTypeId,
      name: value.name,
      description: typeof value.description === 'string' ? value.description : undefined,
      forwardLabel: typeof value.forwardLabel === 'string' ? value.forwardLabel : undefined,
      inverseLabel: typeof value.inverseLabel === 'string' ? value.inverseLabel : undefined,
      thematicStyleSlotId: isEdgeStyleSlotId(value.thematicStyleSlotId)
        ? value.thematicStyleSlotId
        : getDefaultEdgeStyleSlotId(),
      styleOverride: isPlainRecord(value.styleOverride) ? value.styleOverride : undefined,
      createdAt: parseDateLike(value.createdAt, now),
      updatedAt: parseDateLike(value.updatedAt, now),
    });
    seenIds.add(edgeTypeId);
  }

  const defaultEdgeTypeId = getDefaultEdgeTypeId();
  if (!seenIds.has(defaultEdgeTypeId)) {
    normalized.unshift(starterTypes.find(edgeType => edgeType.id === defaultEdgeTypeId)!);
  }

  return normalized.length > 0 ? normalized : starterTypes;
}

function normalizeImportedEdge(edge: unknown, edgeTypeIds: Set<EdgeTypeId>): unknown {
  if (!isPlainRecord(edge)) return edge;
  const typeId = typeof edge.typeId === 'string' && edgeTypeIds.has(edge.typeId as EdgeTypeId)
    ? edge.typeId
    : getDefaultEdgeTypeId();
  return { ...edge, typeId };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseDateLike(value: unknown, fallback: Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
}

/** Read current API key values from localStorage before they are cleared. */
export function readLocalApiKeys(): Record<string, Record<string, string>> {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return {};

  try {
    const settings = JSON.parse(stored);
    const result: Record<string, Record<string, string>> = {};
    for (const [domain, key] of SENSITIVE_KEYS) {
      if (settings[domain]?.[key]) {
        if (!result[domain]) result[domain] = {};
        result[domain][key] = settings[domain][key];
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function importSettings(
  settings: Record<string, unknown>,
  savedKeys: Record<string, Record<string, string>> = {}
): void {
  if (Object.keys(settings).length === 0) return;

  // Restore API keys that were saved before clearAllData() wiped localStorage.
  for (const [domain, keys] of Object.entries(savedKeys)) {
    if (!settings[domain]) settings[domain] = {};
    for (const [key, value] of Object.entries(keys)) {
      (settings[domain] as Record<string, unknown>)[key] = value;
    }
  }

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function importConversations(conversations: unknown[]): Promise<void> {
  if (conversations.length === 0) return;

  for (const conversation of conversations) {
    const typedConversation = conversation as { messages?: Array<{ source?: string }> };
    if (!typedConversation.messages) continue;
    for (const message of typedConversation.messages) {
      if (!message.source) message.source = 'ai';
    }
  }

  const db = new Dexie(CHAT_DB_NAME);
  db.version(CHAT_DB_VERSION).stores(CHAT_DB_SCHEMA);
  await db.table('conversations').bulkPut(conversations);
}

export function importShelf(shelf: Record<string, unknown>): void {
  localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
}

export async function importPaths(paths: unknown[]): Promise<void> {
  if (paths.length === 0) return;

  const db = new Dexie(PATH_DB_NAME);
  db.version(PATH_DB_VERSION).stores(PATH_DB_SCHEMA);
  await db.table('paths').bulkPut(paths);
}

export async function importThemes(themes: unknown[]): Promise<void> {
  if (themes.length === 0) return;

  const db = new Dexie(THEME_DB_NAME);
  db.version(THEME_DB_VERSION).stores(THEME_DB_SCHEMA);
  await db.table('themes').bulkPut(themes);
}

export function importAppState(appState: Record<string, unknown>): void {
  if (Object.keys(appState).length > 0) {
    localStorage.setItem(STATE_KEY, JSON.stringify(appState));
  }
}