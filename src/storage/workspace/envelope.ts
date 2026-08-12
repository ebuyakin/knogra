/**
 * Workspace file envelope — see docs/workspace-architecture.md §5.2–§5.3.
 *
 * Pure: data in, data out. No storage access, no DOM, no IO. Everything here is
 * exercisable from devtools independently of any dialog, which is the point —
 * the format is the one part of Save/Open that can be verified without
 * destroying the workspace to test it.
 *
 * The envelope carries the same nine members the legacy ZIP did, unchanged, as
 * nine top-level keys. It is a container swap, not a schema change.
 */

import { APP_VERSION, WORKSPACE_FORMAT, WORKSPACE_VERSION } from '../../config/storage-config';
import type { GraphData } from './transfer';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkspaceManifest {
  /** Always `WORKSPACE_FORMAT`. The sole reliable marker that this is a workspace file. */
  format: string;
  /** Envelope format version, independent of the app version. */
  version: string;
  appVersion: string;
  createdAt: string;
  name: string;
}

/**
 * The eight data members, each a verbatim dump of one store. Shapes are owned
 * by `transfer.ts`; the envelope only carries them.
 */
export interface WorkspaceMembers {
  graph: GraphData;
  settings: Record<string, unknown>;
  chat: unknown[];
  backgroundImages: unknown[];
  shelf: Record<string, unknown>;
  paths: unknown[];
  appState: Record<string, unknown>;
  themes: unknown[];
}

export interface WorkspaceEnvelope extends WorkspaceMembers {
  manifest: WorkspaceManifest;
}

export type WorkspaceFileFormat = 'workspace-json' | 'legacy-zip' | 'unrecognised';

/** Thrown when a file is not a workspace file, or is too damaged to read as one. */
export class WorkspaceFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceFormatError';
  }
}

// ============================================================================
// DETECTION
// ============================================================================

const BYTE_ZIP_P = 0x50;
const BYTE_ZIP_K = 0x4b;
const BYTE_BRACE = 0x7b;
const WHITESPACE_BYTES = new Set([0x20, 0x09, 0x0a, 0x0d]);
const UTF8_BOM = [0xef, 0xbb, 0xbf];

/**
 * Identify a workspace file from its leading bytes, without trusting the
 * extension — so a renamed file still opens, and a Markdown document dropped on
 * the opener produces a useful message rather than a parse crash (§5.3).
 *
 * Only the first few bytes are needed; callers may pass a slice.
 */
export function detectWorkspaceFormat(head: Uint8Array): WorkspaceFileFormat {
  if (head[0] === BYTE_ZIP_P && head[1] === BYTE_ZIP_K) return 'legacy-zip';

  let index = 0;
  if (UTF8_BOM.every((byte, offset) => head[offset] === byte)) index = UTF8_BOM.length;
  while (index < head.length && WHITESPACE_BYTES.has(head[index])) index++;

  return head[index] === BYTE_BRACE ? 'workspace-json' : 'unrecognised';
}

// ============================================================================
// BUILD / SERIALIZE
// ============================================================================

export function buildEnvelope(name: string, members: WorkspaceMembers): WorkspaceEnvelope {
  return {
    manifest: {
      format: WORKSPACE_FORMAT,
      version: WORKSPACE_VERSION,
      appVersion: APP_VERSION,
      createdAt: new Date().toISOString(),
      name,
    },
    ...members,
  };
}

/**
 * Unindented by design (§5.2): the format exists to be transparent and
 * machine-readable, and pretty-printing is a reader-side concern. Indentation
 * costs 1.86x on text-heavy workspaces and buys nothing `jq .` cannot supply.
 */
export function serializeEnvelope(envelope: WorkspaceEnvelope): string {
  return JSON.stringify(envelope);
}

/** `<workspace-name>-knogra.json` — one extension, so allowlists and MIME sniffers see `.json`. */
export function workspaceFileName(name: string): string {
  return `${name}-knogra.json`;
}

// ============================================================================
// PARSE
// ============================================================================

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseGraph(value: unknown): GraphData {
  const graph = asRecord(value);
  return {
    nodes: asArray(graph.nodes),
    edges: asArray(graph.edges),
    edgeTypes: asArray(graph.edgeTypes),
    scenes: asArray(graph.scenes),
  };
}

function parseManifest(value: unknown): WorkspaceManifest {
  const manifest = asRecord(value);
  if (manifest.format !== WORKSPACE_FORMAT) {
    throw new WorkspaceFormatError('This is not a Knogra workspace file.');
  }
  return {
    format: WORKSPACE_FORMAT,
    version: typeof manifest.version === 'string' ? manifest.version : WORKSPACE_VERSION,
    appVersion: typeof manifest.appVersion === 'string' ? manifest.appVersion : '',
    createdAt: typeof manifest.createdAt === 'string' ? manifest.createdAt : '',
    name: typeof manifest.name === 'string' ? manifest.name : '',
  };
}

/**
 * Parse workspace JSON into a fully-populated envelope.
 *
 * Every member except the manifest is optional and normalised to an empty
 * default — the same contract the legacy null-checked reads already honoured,
 * so callers never branch on absence. The manifest is the one hard requirement:
 * without `format` there is nothing distinguishing this file from any other
 * JSON, and guessing is exactly what §5.3 forbids.
 *
 * @throws {WorkspaceFormatError} if the text is not JSON, or not a workspace.
 */
export function parseEnvelope(text: string): WorkspaceEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new WorkspaceFormatError('This file is not valid JSON.');
  }

  const source = asRecord(raw);
  return {
    manifest: parseManifest(source.manifest),
    graph: parseGraph(source.graph),
    settings: asRecord(source.settings),
    chat: asArray(source.chat),
    backgroundImages: asArray(source.backgroundImages),
    shelf: asRecord(source.shelf),
    paths: asArray(source.paths),
    appState: asRecord(source.appState),
    themes: asArray(source.themes),
  };
}
