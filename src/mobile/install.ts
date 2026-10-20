/**
 * Install — a library graph onto the phone (docs/mobile-viewer.md §4.1).
 *
 * Fetches a workspace file from the knogra.io library, reads it with the app's
 * own format functions, clears the phone's stores and writes the graph into
 * them through the same transfer functions the editor's import uses. The
 * editor's `importWorkspace` is not called: it asks questions on the way
 * (validation, scale to fit, in-note images) that belong to an editor.
 *
 * Not installed, on purpose: the file's settings and app state. The desktop
 * map settings would mislead the phone layout, and the viewer has no settings
 * of its own to restore. Paths, shelf and presets have no screen here.
 *
 * The caller reloads the page afterwards: the stores read IndexedDB when they
 * are first imported, so a fresh load is how the new graph reaches them.
 */

import { detectWorkspaceFormat, parseEnvelope, WorkspaceFormatError, type WorkspaceMembers } from '../storage/workspace/envelope';
import { readLegacyZip } from '../storage/workspace/legacy-zip';
import { clearAllData, importConversations, importGraphData, importMapViews, importThemes } from '../storage/workspace/transfer';

/**
 * The only origin the viewer installs from: the parameter is anyone's to craft
 * and install replaces what is stored. Pinned at position zero, as the editor
 * pins its `?import=` (main.ts), so no prefix can be forged ahead of it.
 */
const GRAPH_LIBRARY_URL_PREFIX = 'https://knogra.io/graphs/';

/** Bytes read to identify a file: `PK` at offset 0, or the first `{` past a BOM and whitespace. 64 is ample. */
const HEAD_SNIFF_BYTES = 64;

export function isLibraryUrl(url: string): boolean {
  return url.startsWith(GRAPH_LIBRARY_URL_PREFIX);
}

export async function installFromUrl(url: string): Promise<void> {
  if (!isLibraryUrl(url)) throw new Error('Not a knogra.io library file');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // The name is cosmetic: the reader identifies the file by content.
  const file = new File([await response.blob()], url.split('/').pop() ?? 'workspace.json');
  const members = await readMembers(file);

  await clearAllData();
  await importGraphData(members.graph, members.backgroundImages);
  await importConversations(members.chat);
  await importThemes(members.themes);
  await importMapViews(members.mapViews ?? []);
}

/** The editor's reader, repeated: it is private to workspace.ts, which the viewer does not import (§4.1). */
async function readMembers(file: File): Promise<WorkspaceMembers> {
  const head = new Uint8Array(await file.slice(0, HEAD_SNIFF_BYTES).arrayBuffer());
  switch (detectWorkspaceFormat(head)) {
    case 'legacy-zip':
      return readLegacyZip(file);
    case 'workspace-json':
      return parseEnvelope(await file.text());
    default:
      throw new WorkspaceFormatError('This is not a Knogra workspace file.');
  }
}
