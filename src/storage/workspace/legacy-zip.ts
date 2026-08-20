/**
 * Legacy `.knogra` reader — see docs/workspace-architecture.md §5.1.
 *
 * Read-only, forever. The ZIP was written up to v1.5 and is never written
 * again; every file a user saved before v1.6 keeps opening with no migration.
 * Isolated here so the modern path in `workspace.ts`
 * carries no archive handling, and so `jszip` has exactly one caller.
 *
 * The archive is nine flat JSON members, no folders and no binary entries, so
 * reading it is nine null-checked parses that yield the same member set the
 * JSON envelope does.
 */

import JSZip from 'jszip';

import { WorkspaceFormatError, type WorkspaceMembers } from './envelope';
import type { GraphData } from './transfer';

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], scenes: [] };

export async function readLegacyZip(file: File): Promise<WorkspaceMembers> {
  const zip = await JSZip.loadAsync(file);

  // The manifest is the only required member — without it there is nothing
  // identifying the archive as a workspace.
  if (!zip.file('manifest.json')) {
    throw new WorkspaceFormatError('This is not a Knogra workspace file.');
  }

  const read = async <T>(name: string, fallback: T): Promise<T> => {
    const entry = zip.file(name);
    if (!entry) return fallback;
    return JSON.parse(await entry.async('string')) as T;
  };

  return {
    graph: await read<GraphData>('graph.json', EMPTY_GRAPH),
    settings: await read<Record<string, unknown>>('settings.json', {}),
    chat: await read<unknown[]>('chat-history.json', []),
    backgroundImages: await read<unknown[]>('background-images.json', []),
    shelf: await read<Record<string, unknown>>('shelf.json', {}),
    paths: await read<unknown[]>('paths.json', []),
    appState: await read<Record<string, unknown>>('app-state.json', {}),
    themes: await read<unknown[]>('themes.json', []),
  };
}
