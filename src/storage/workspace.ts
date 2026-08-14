/**
 * Workspace Manager
 * Handles saving and opening a complete workspace as a single JSON file.
 *
 * Works directly with storage layers (localStorage, IndexedDB)
 * Does not depend on store classes (graphStore, chatStore)
 *
 * See docs/workspace-architecture.md — the file format lives in
 * `workspace/envelope.ts`, legacy `.knogra` reading in `workspace/legacy-zip.ts`.
 */

import { ping } from '../utils/telemetry';

import {
  adoptImportedFileNaming,
  claimExportBaseName,
  clearAllData,
  countInNoteImages,
  exportBackgroundImages,
  exportConversations,
  exportGraphData,
  exportPaths,
  exportSettings,
  exportShelf,
  exportThemes,
  generateWorkspaceName,
  importAppState,
  importConversations,
  importGraphData,
  importPaths,
  importSettings,
  importShelf,
  importThemes,
  readLocalApiKeys,
  resetFileNaming,
  stripConversationImages,
} from './workspace/transfer';
import {
  hasMeaningfulWorkspaceData,
  showImageTransferDialog,
  showImportWorkspaceDialog,
  showNewWorkspaceDialog,
  showScaleToFitDialog,
  showValidationErrorDialog,
} from './workspace/dialogs';
import { validateGraphData } from './workspace/validate';
import {
  buildEnvelope,
  detectWorkspaceFormat,
  parseEnvelope,
  serializeEnvelope,
  WorkspaceFormatError,
  type WorkspaceMembers,
} from './workspace/envelope';
import { readLegacyZip } from './workspace/legacy-zip';
import { AppStateManager } from './app-state';
import { seedInitialGraph } from './seed-workspace';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Read the live Cytoscape container size in CSS pixels, or null if unavailable.
 */
function getCyContainerSize(): { w: number; h: number } | null {
  const el = document.getElementById('cy');
  if (!el) return null;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w <= 0 || h <= 0) return null;
  return { w, h };
}

/**
 * Deviation beyond which the imported graph is considered authored for a
 * meaningfully different screen and the scale-to-fit prompt is offered.
 */
const SCALE_TO_FIT_THRESHOLD = 0.15;

/**
 * Given the authoring container size and the live container size, return the
 * uniform zoom factor that makes every scene occupy the same fraction of the
 * viewport as on the authoring screen. Uses the smaller axis ratio so content
 * that fit before never clips. Returns null when no meaningful rescale applies
 * (missing/invalid baseline, or difference under the threshold).
 */
function computeScaleToFitFactor(
  authoring: { w: number; h: number } | undefined,
  live: { w: number; h: number } | null
): number | null {
  if (!authoring || !live) return null;
  if (!(authoring.w > 0) || !(authoring.h > 0)) return null;

  const factor = Math.min(live.w / authoring.w, live.h / authoring.h);
  if (!Number.isFinite(factor) || factor <= 0) return null;
  if (Math.abs(factor - 1) <= SCALE_TO_FIT_THRESHOLD) return null;
  return factor;
}

/**
 * Multiply every scene's stored `viewport.zoom` by `factor` in place. Pan and
 * focalPoint are left untouched: focalPoint is graph-space and zoom-invariant,
 * so content re-centers on the same point, only smaller/larger.
 */
function scaleImportedScenesZoom(scenes: unknown[], factor: number): void {
  for (const scene of scenes) {
    const viewport = (scene as { viewport?: { zoom?: unknown } }).viewport;
    if (!viewport || typeof viewport.zoom !== 'number' || viewport.zoom <= 0) continue;
    viewport.zoom *= factor;
  }
}


// ============================================================================
// EXPORT
// ============================================================================

/**
 * Save the current workspace to a JSON file and trigger a browser download.
 *
 * Two abort points, in this order: the integrity warning, then the in-note
 * image chooser. Both run before anything is produced, so cancelling leaves no
 * partial file.
 */
export async function exportWorkspace(): Promise<void> {
  const graph = await exportGraphData();

  // Warn if the current workspace has integrity issues.
  // User can cancel or proceed with a known-corrupted backup.
  const validation = validateGraphData(graph);
  if (!validation.valid) {
    const proceed = await showValidationErrorDialog(validation.errors, 'export');
    if (!proceed) return;
  }

  // When the workspace holds in-note images, let the user choose which
  // categories' bytes to embed (found images default to links-only for a
  // lighter file). Cancelling the dialog aborts the save.
  let conversations = await exportConversations();
  const imageCounts = countInNoteImages(conversations);
  if (imageCounts.uploaded > 0 || imageCounts.retrieved > 0) {
    const inclusion = await showImageTransferDialog('export', imageCounts);
    if (!inclusion) return;
    conversations = stripConversationImages(conversations, inclusion);
  }

  // Record the current container size BEFORE reading app state, so the file
  // carries the authoring screen dimensions (used on open to offer a
  // proportional scale-to-fit).
  const container = getCyContainerSize();
  if (container) AppStateManager.saveAuthoringContainerSize(container.w, container.h);

  // Claim the file name BEFORE snapshotting settings, and after every abort
  // point. Both halves matter: claiming advances the version counter, which
  // lives in settings and so has to be current when the snapshot is taken —
  // otherwise the file would tell a future import to reuse its own number.
  // Aborting earlier leaves the counter untouched, so a cancelled save consumes
  // nothing.
  const baseName = await claimExportBaseName();

  const envelope = buildEnvelope(await generateWorkspaceName(), {
    graph,
    settings: exportSettings(),
    chat: conversations,
    backgroundImages: await exportBackgroundImages(),
    shelf: exportShelf(),
    paths: await exportPaths(),
    // Path-mode session is deliberately excluded: it describes the saving
    // session, not the workspace. Shipping it would drop whoever opens the file
    // into someone else's tour at someone else's cursor position — and because
    // paths are written back with their original ids, the reference often
    // resolves, so the validation in Path.restoreSession() would not catch it.
    appState: AppStateManager.getExportableAppState(),
    themes: await exportThemes(),
  });

  const blob = new Blob([serializeEnvelope(envelope)], { type: 'application/json' });
  downloadBlob(blob, `${baseName}.json`);
  ping('workspace_exported');
}

/**
 * Trigger browser download of blob
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// IMPORT
// ============================================================================

/**
 * Import a workspace from a remote URL (used by the catalog on the landing page).
 *
 * The caller decides whether to show the in-app confirmation dialog — because
 * the right answer depends on the workspace state at startup, BEFORE other
 * init steps (e.g. chat panel) write side-effect rows that would make a
 * naive `hasMeaningfulWorkspaceData()` call return a false positive.
 *
 * @param url        The workspace file URL to fetch.
 * @param showDialog If true, show the standard confirmation dialog
 *                   (with "save first" option). If false, open silently.
 *
 * @returns `true` if the workspace opened and `window.location.reload()` has
 *          been called (caller should halt further init to avoid mutating state
 *          before the browser navigates). `false` on user cancel or any failure.
 */
export async function importFromUrl(url: string, options: { showDialog: boolean }): Promise<boolean> {
  if (options.showDialog) {
    const result = await showImportWorkspaceDialog(true);
    if (!result) return false;
    if (result.exportFirst) await exportWorkspace();
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    // The name and MIME are cosmetic — the reader identifies the file by
    // content (§5.3), so a legacy `.knogra` and a workspace JSON both work.
    const filename = url.split('/').pop() ?? 'workspace.json';
    const file = new File([blob], filename);
    return await importWorkspace(file);
  } catch (e) {
    console.error('[importFromUrl] Failed to fetch graph:', e);
    alert('Failed to download the graph. Please try again later.');
    return false;
  }
}

/**
 * Show file picker and import selected workspace
 */
export async function showImportDialog(): Promise<void> {
  // Show confirmation dialog first (before file picker) to mirror newWorkspace flow.
  // Opening the file picker inside an async onchange handler causes browsers to
  // silently drop the event when the input element is not attached to the DOM.
  const hasExistingData = await hasMeaningfulWorkspaceData();
  const result = await showImportWorkspaceDialog(hasExistingData);
  if (!result) return;

  if (result.exportFirst) {
    await exportWorkspace();
  }

  // Now open file picker — user has already confirmed intent. Legacy `.knogra`
  // stays in the accept list: those files open forever (§5.1).
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.knogra';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    await importWorkspace(file);
  };
  input.click();
}

/**
 * Bytes read to identify a file. 64 is ample: the marker is either `PK` at
 * offset 0, or the first `{` past an optional BOM and any leading whitespace.
 */
const HEAD_SNIFF_BYTES = 64;

/**
 * Read a workspace file into its members, identifying it by content rather than
 * by extension (§5.3) — so a renamed file still opens, and a Markdown document
 * dropped on the opener produces a clear message rather than a parse crash.
 */
async function readWorkspaceFile(file: File): Promise<WorkspaceMembers> {
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

/**
 * Open a workspace file, replacing all current data, then reload.
 */
export async function importWorkspace(file: File): Promise<boolean> {
  try {
    // 1. Read and identify the file — either format yields the same members.
    const members = await readWorkspaceFile(file);
    const { graph, settings, backgroundImages, shelf, paths, appState, themes } = members;
    let conversations = members.chat;

    // 2. Validate graph integrity. If issues found, warn the user and let them
    //    decide — validation is informational, not a hard block.
    const validation = validateGraphData(graph);
    if (!validation.valid) {
      const proceed = await showValidationErrorDialog(validation.errors);
      if (!proceed) return false;
    }

    // 2b. Scale-to-fit: if the graph was authored on a meaningfully different
    //     screen than this one, offer to proportionally rescale every scene's
    //     zoom so the first impression matches the author's. Applied to the
    //     in-memory scenes BEFORE they are written, so the post-reload render is
    //     correct from the first frame (no flash). Pan/focalPoint untouched.
    const authoringSize = (appState as { authoringContainerSize?: { w: number; h: number } })
      .authoringContainerSize;
    const scaleFactor = computeScaleToFitFactor(authoringSize, getCyContainerSize());
    if (scaleFactor !== null) {
      const accepted = await showScaleToFitDialog();
      if (accepted) scaleImportedScenesZoom(graph.scenes, scaleFactor);
    }

    // 2c. In-note images: when the file carries them, let the user choose which
    //     categories to keep. Found images kept as links heal to offline later
    //     per the storage setting. Cancelling aborts.
    const importImageCounts = countInNoteImages(conversations);
    if (importImageCounts.uploaded > 0 || importImageCounts.retrieved > 0) {
      const inclusion = await showImageTransferDialog('import', importImageCounts);
      if (!inclusion) return false;
      conversations = stripConversationImages(conversations, inclusion);
    }

    // 3. Capture local API keys BEFORE clearing — clearAllData() wipes localStorage
    //    so they must be read first and restored after settings import.
    const localApiKeys = readLocalApiKeys();

    // 4. Clear existing data
    await clearAllData();
    
    // 5. Import graph data to IndexedDB
    await importGraphData(graph, backgroundImages);
    
    // 6. Import settings to localStorage (restores preserved API keys)
    importSettings(settings, localApiKeys);

    // 6b. Adopt the file identity the workspace carries, so saving it again
    //     continues its version sequence instead of starting a new one.
    adoptImportedFileNaming(settings);
    
    // 7. Import conversations to IndexedDB
    await importConversations(conversations);
    
    // 8. Import shelf to localStorage
    importShelf(shelf);
    
    // 9. Import paths to IndexedDB
    await importPaths(paths);
    
    // 10. Import app state to localStorage
    importAppState(appState);
    
    // 11. Import custom themes to IndexedDB
    await importThemes(themes);
    
    // 12. Reload to apply changes
    // ping before reload — keepalive:true in telemetry.ts ensures the request
    // completes even as the page unloads.
    ping('workspace_imported');
    window.location.reload();
    
    return true;
  } catch (error) {
    console.error('Failed to open workspace:', error);
    alert(error instanceof WorkspaceFormatError
      ? error.message
      : 'Could not open the workspace file. It may be corrupted, or not a Knogra workspace.');
    return false;
  }
}

// ============================================================================
// NEW WORKSPACE
// ============================================================================

/**
 * Create new empty workspace
 * Clears data, optionally preserves settings
 */
export async function newWorkspace(): Promise<void> {
  const result = await showNewWorkspaceDialog();
  if (!result) return;

  const { exportFirst, keepSettings } = result;

  if (exportFirst) {
    await exportWorkspace();
  }

  // Clear all data, optionally preserving settings and custom themes
  await clearAllData(keepSettings);

  // File naming is workspace identity, not a preference, so it goes even when
  // settings are kept — otherwise the new graph would be saved under the old
  // graph's name and continue its numbering. Skipped when settings were wiped,
  // which already restored the defaults.
  if (keepSettings) resetFileNaming();

  // Reset app state for the new workspace. clearAppState() drops any leftover
  // appMode (e.g. 'view' from a previous workspace) so the next load defaults
  // to 'edit'. seedInitialGraph() then writes the seed node + scene and saves
  // lastSceneId, so the post-reload entry point is correct.
  AppStateManager.clearAppState();
  await seedInitialGraph();

  // Reload
  window.location.reload();
}
