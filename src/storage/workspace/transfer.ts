import Dexie from 'dexie';
import type { EdgeType, EdgeTypeId } from '../../core/main-types';
import type { ChatImageAttachment, Conversation } from '../../core/chat-types';
import { getSetting, setSetting } from '../../config';
import { createStarterEdgeTypes, getDefaultEdgeStyleSlotId, getDefaultEdgeTypeId, isEdgeStyleSlotId } from '../../config/edge-type-settings';
import { FILE_DEFAULTS } from '../../config/file-settings';

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
  const slug = await readAnchorSlug();
  return slug ? `graph-${slug}-${dateStr}` : `graph-${dateStr}`;
}

/**
 * The anchor node's title as a filename-safe slug, or null when there is no
 * anchor, no title, or the database cannot be read.
 */
async function readAnchorSlug(): Promise<string | null> {
  try {
    const db = new Dexie(GRAPH_DB_NAME);
    db.version(GRAPH_DB_VERSION).stores(GRAPH_DB_SCHEMA);

    const nodes = await db.table('nodes').toArray();
    const anchor = nodes.find((node: { isAnchor?: boolean }) => node.isAnchor);
    if (!anchor?.title) return null;

    return sanitizeFileNamePrefix(anchor.title) || null;
  } catch {
    // Ignore DB errors — callers fall back to a date-based name.
    return null;
  }
}

// ============================================================================
// EXPORT FILE NAMING
// ============================================================================

/**
 * Exported files are named `<prefix>-<number>.<ext>`, with one counter shared
 * by workspace saves and document exports so a folder listing sorts in the
 * order things were written.
 *
 * Both halves live in the `file` settings domain, which means they travel
 * inside the workspace file. The number is therefore the workspace's version
 * count rather than this browser's export tally: leave a workspace, come back
 * to it, and the sequence resumes where its last saved file left off.
 */

/** Long enough for a descriptive name, short enough to stay readable in a file listing. */
const MAX_PREFIX_LENGTH = 60;

/** Below this the number is two plain digits: `01`–`99`. */
const PLAIN_NUMBER_LIMIT = 100;

/** Below this the number is a letter plus two digits: `a00`–`z99`. */
const LETTERED_NUMBER_LIMIT = 2700;

/**
 * Reduce free text to a filename-safe slug.
 *
 * Deliberately an allowlist, not a blocklist of bad characters: the result is
 * assigned to an anchor's `download` attribute, where a path separator, a
 * control character or a leading dot would be the app's problem and not the
 * user's typo.
 */
export function sanitizeFileNamePrefix(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .slice(0, MAX_PREFIX_LENGTH)
    .replace(/^[-_]+|[-_]+$/g, '');
}

/**
 * Render a counter value as a sortable fixed-width token.
 *
 * `01`–`99`, then `a00`–`z99`, because `'9' < 'a'` in every byte ordering a
 * file manager uses — so the names keep sorting into export order well past
 * the point where two digits run out.
 *
 * Past `z99` there is no continuation that still sorts correctly (`2700` sorts
 * before `z99`, `zz00` before `z99` fails the next time), so the number is
 * emitted plainly and sort order degrades. That is 2699 saved versions of a
 * single workspace; the counter is user-resettable long before then.
 */
export function formatExportNumber(value: number): string {
  const number = Math.max(1, Math.floor(value));
  if (number < PLAIN_NUMBER_LIMIT) return String(number).padStart(2, '0');
  if (number >= LETTERED_NUMBER_LIMIT) return String(number);

  const letter = String.fromCharCode('a'.charCodeAt(0) - 1 + Math.floor(number / PLAIN_NUMBER_LIMIT));
  return `${letter}${String(number % PLAIN_NUMBER_LIMIT).padStart(2, '0')}`;
}

/**
 * Reserve and return the base name for a file about to be written — no
 * extension, because the same name serves `.json` and `.md`.
 *
 * Reserving is a side effect: the counter advances, so callers must invoke this
 * only once the file is certain to be produced, after every abort point.
 *
 * A workspace with no prefix yet acquires one here, derived from its anchor
 * node and persisted, which is what makes the naming stable from the first save
 * onward without asking the user to configure anything.
 */
export async function claimExportBaseName(): Promise<string> {
  const stored = sanitizeFileNamePrefix(getSetting('file.namePrefix'));
  const prefix = stored || `kg-${(await readAnchorSlug()) ?? new Date().toISOString().split('T')[0]}`;
  const number = readFileNumber();

  setSetting('file.namePrefix', prefix);
  setSetting('file.nextNumber', number + 1);

  return `${prefix}-${formatExportNumber(number)}`;
}

/**
 * Drop the current file identity so the next save names itself afresh.
 *
 * Called wherever a genuinely different graph replaces the open one while
 * settings survive — otherwise the new graph would inherit the old one's name
 * and keep counting, producing backups that claim to be versions of something
 * they are not.
 */
export function resetFileNaming(): void {
  setSetting('file.namePrefix', FILE_DEFAULTS.namePrefix);
  setSetting('file.nextNumber', FILE_DEFAULTS.nextNumber);
}

/**
 * Take the file identity carried by an imported workspace.
 *
 * Written explicitly rather than left to `importSettings()` because that
 * function returns early on an empty settings block, which would leave the
 * previous workspace's prefix in place — the imported graph would then be saved
 * under a name belonging to a different graph. Absent or malformed values reset
 * to defaults, so such a file simply names itself on its first save.
 */
export function adoptImportedFileNaming(settings: Record<string, unknown>): void {
  const incoming = (settings.file ?? {}) as Record<string, unknown>;
  const prefix = typeof incoming.namePrefix === 'string'
    ? sanitizeFileNamePrefix(incoming.namePrefix)
    : FILE_DEFAULTS.namePrefix;

  setSetting('file.namePrefix', prefix);
  setSetting('file.nextNumber', normalizeFileNumber(incoming.nextNumber));
}

/** The stored counter, healed if a hand-edited or foreign file supplied nonsense. */
function readFileNumber(): number {
  return normalizeFileNumber(getSetting('file.nextNumber'));
}

function normalizeFileNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : FILE_DEFAULTS.nextNumber;
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

/** Number of in-note image attachments by origin, across all conversations. */
export interface InNoteImageCounts {
  uploaded: number;
  retrieved: number;
}

/** Which categories of in-note image bytes to keep when transferring a workspace. */
export interface ImageInclusionOptions {
  includeUploaded: boolean;
  includeRetrieved: boolean;
}

/**
 * Count in-note images that carry stored bytes, by origin (drives the
 * export/import image dialogs). Link-only images are ignored: they have no
 * bytes to strip or keep, so they are irrelevant to the size choice.
 */
export function countInNoteImages(conversations: unknown[]): InNoteImageCounts {
  let uploaded = 0;
  let retrieved = 0;
  for (const conv of conversations) {
    const messages = (conv as Conversation)?.messages;
    if (!Array.isArray(messages)) continue;
    for (const message of messages) {
      const attachments = message?.attachments;
      if (!Array.isArray(attachments)) continue;
      for (const attachment of attachments) {
        if (!attachment?.dataUrl) continue;
        if (attachment.origin === 'retrieved') retrieved++;
        else if (attachment.origin === 'note') uploaded++;
      }
    }
  }
  return { uploaded, retrieved };
}

/**
 * Return a copy of `conversations` with in-note image bytes filtered per `opts`.
 * - Retrieved image, excluded, with a `sourceUrl` → keep as link only (drop `dataUrl`).
 * - Retrieved image without a `sourceUrl` → kept intact (stripping would orphan it).
 * - Uploaded image, excluded → dropped entirely (it has no link to fall back on).
 * Never mutates the input.
 */
export function stripConversationImages(
  conversations: unknown[],
  opts: ImageInclusionOptions
): unknown[] {
  if (opts.includeUploaded && opts.includeRetrieved) return conversations;

  return conversations.map(conv => {
    const conversation = conv as Conversation;
    if (!Array.isArray(conversation?.messages)) return conv;

    const messages = conversation.messages.map(message => {
      const attachments = message?.attachments;
      if (!Array.isArray(attachments) || attachments.length === 0) return message;

      const kept: ChatImageAttachment[] = [];
      for (const attachment of attachments) {
        if (attachment.origin === 'note') {
          if (opts.includeUploaded) kept.push(attachment);
          continue;
        }
        if (attachment.origin === 'retrieved') {
          if (opts.includeRetrieved || !attachment.sourceUrl) {
            kept.push(attachment);
          } else {
            kept.push({ ...attachment, dataUrl: undefined });
          }
          continue;
        }
        kept.push(attachment);
      }
      return { ...message, attachments: kept };
    });

    return { ...conversation, messages };
  });
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

/**
 * Restore app state, dropping the path-mode session.
 *
 * Current exports omit `pathId` / `pathIndex` already, but files written before
 * that fix may carry them, and they must never be honoured: path mode is session
 * state, and entering it unasked lands the user in a restrictive mode with no
 * explanation.
 */
export function importAppState(appState: Record<string, unknown>): void {
  const { pathId: _pathId, pathIndex: _pathIndex, ...sessionFree } = appState;

  if (Object.keys(sessionFree).length > 0) {
    localStorage.setItem(STATE_KEY, JSON.stringify(sessionFree));
  }
}