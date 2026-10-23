/**
 * Install — a library graph onto the phone (docs/mobile-viewer.md §4.1).
 *
 * Takes a workspace file, fetched from the knogra.io library or picked by the
 * user from the phone's Files app, reads it with the app's own format
 * functions, clears the phone's stores and writes the graph into them through
 * the same transfer functions the editor's import uses. The
 * editor's `importWorkspace` is not called: it asks questions on the way
 * (validation, scale to fit, in-note images) that belong to an editor.
 *
 * Not installed, on purpose: the file's settings and app state. The desktop
 * map settings would mislead the phone layout, and the viewer has no settings
 * of its own to restore. Paths, shelf and presets have no screen here.
 *
 * The installed file's URL is kept in localStorage (§4.1), so the library pane
 * can mark the graph on the phone. A picked file has no URL and clears the
 * key: the pane then marks no row, and the graph's own title names what is on
 * the phone. Written last, after the stores: a failed install leaves the old
 * mark, which is then wrong, but a reload shows an empty viewer and the
 * library pane, so nothing is misread for long.
 *
 * The caller reloads the page afterwards: the stores read IndexedDB when they
 * are first imported, so a fresh load is how the new graph reaches them.
 */

import { VIEWER_GRAPH_KEY } from '../config/storage-config';
import { detectWorkspaceFormat, parseEnvelope, WorkspaceFormatError, type WorkspaceMembers } from '../storage/workspace/envelope';
import { readLegacyZip } from '../storage/workspace/legacy-zip';
import { clearAllData, importConversations, importGraphData, importMapViews, importThemes } from '../storage/workspace/transfer';

/**
 * The only origin the viewer installs from: the parameter is anyone's to craft
 * and install replaces what is stored. Pinned at position zero, as the editor
 * pins its `?import=` (main.ts), so no prefix can be forged ahead of it.
 */
const GRAPH_LIBRARY_URL_PREFIX = 'https://knogra.io/graphs/';

/** The library's index (§12), under the same prefix: one CORS rule on the site serves the index and the files. */
export const LIBRARY_INDEX_URL = `${GRAPH_LIBRARY_URL_PREFIX}index.json`;

/** Bytes read to identify a file: `PK` at offset 0, or the first `{` past a BOM and whitespace. 64 is ample. */
const HEAD_SNIFF_BYTES = 64;

export function isLibraryUrl(url: string): boolean {
  return url.startsWith(GRAPH_LIBRARY_URL_PREFIX);
}

/** The URL of the file installed on this phone; null before the first install. */
export function installedGraphUrl(): string | null {
  return localStorage.getItem(VIEWER_GRAPH_KEY);
}

export async function installFromUrl(url: string): Promise<void> {
  if (!isLibraryUrl(url)) throw new Error('Not a knogra.io library file');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // The name is cosmetic: the reader identifies the file by content.
  const file = new File([await response.blob()], url.split('/').pop() ?? 'workspace.json');
  await installFile(file, url);
}

/**
 * Installs a workspace file: one fetched from the library, or one the user
 * picked on the phone (§4.1). `url` is the library URL to remember, or null
 * for a picked file, which has no address the pane could mark.
 */
export async function installFile(file: File, url: string | null): Promise<void> {
  const members = await readMembers(file);

  await clearAllData();
  await importGraphData(members.graph, members.backgroundImages);
  await importConversations(members.chat);
  await importThemes(members.themes);
  await importMapViews(members.mapViews ?? []);
  if (url === null) localStorage.removeItem(VIEWER_GRAPH_KEY);
  else localStorage.setItem(VIEWER_GRAPH_KEY, url);
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
