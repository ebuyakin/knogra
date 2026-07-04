/**
 * Workspace Manager
 * Handles export/import of complete workspace (.knogra files)
 * 
 * Works directly with storage layers (localStorage, IndexedDB)
 * Does not depend on store classes (graphStore, chatStore)
 */

import JSZip from 'jszip';
import { ping } from '../utils/telemetry';

import {
  clearAllData,
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
  type GraphData,
} from './workspace/transfer';
import {
  hasMeaningfulWorkspaceData,
  showImportWorkspaceDialog,
  showNewWorkspaceDialog,
  showScaleToFitDialog,
  showValidationErrorDialog,
} from './workspace/dialogs';
import { validateGraphData } from './workspace/validate';
import { AppStateManager } from './app-state';
import { seedInitialGraph } from './seed-workspace';

// ============================================================================
// TYPES
// ============================================================================

interface WorkspaceManifest {
  version: string;
  appVersion: string;
  createdAt: string;
  name: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const APP_VERSION = '0.1.0';
const WORKSPACE_VERSION = '1.0';

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
 * Export current workspace to .knogra file
 * Collects all data and triggers browser download
 */
export async function exportWorkspace(): Promise<void> {
  const zip = new JSZip();
  
  // 1. Create manifest
  const manifest: WorkspaceManifest = {
    version: WORKSPACE_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    name: await generateWorkspaceName()
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  
  // 2. Export graph data from IndexedDB
  const graph = await exportGraphData();

  // Warn if the current workspace has integrity issues.
  // User can cancel export or proceed with a known-corrupted backup.
  const validation = validateGraphData(graph);
  if (!validation.valid) {
    const proceed = await showValidationErrorDialog(validation.errors, 'export');
    if (!proceed) return;
  }

  zip.file('graph.json', JSON.stringify(graph, null, 2));
  
  // 3. Export settings from localStorage
  const settings = exportSettings();
  zip.file('settings.json', JSON.stringify(settings, null, 2));
  
  // 4. Export chat conversations from IndexedDB
  const conversations = await exportConversations();
  zip.file('chat-history.json', JSON.stringify(conversations, null, 2));
  
  // 5. Export background images from IndexedDB
  const images = await exportBackgroundImages();
  zip.file('background-images.json', JSON.stringify(images, null, 2));
  
  // 6. Export shelf from localStorage
  const shelf = exportShelf();
  zip.file('shelf.json', JSON.stringify(shelf, null, 2));
  
  // 7. Export saved paths from IndexedDB
  const paths = await exportPaths();
  zip.file('paths.json', JSON.stringify(paths, null, 2));
  
  // 8. Export app state from localStorage.
  // Record the current container size first so the file carries the authoring
  // screen dimensions (used by import to offer a proportional scale-to-fit).
  const container = getCyContainerSize();
  if (container) AppStateManager.saveAuthoringContainerSize(container.w, container.h);
  const appState = AppStateManager.getAppState();
  zip.file('app-state.json', JSON.stringify(appState, null, 2));
  
  // 9. Export custom themes from IndexedDB
  const themes = await exportThemes();
  zip.file('themes.json', JSON.stringify(themes, null, 2));
  
  // Generate ZIP and trigger download
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${manifest.name}.knogra`);
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
 * @param url        The .knogra file URL to fetch.
 * @param showDialog If true, show the standard import confirmation dialog
 *                   (with "export first" option). If false, import silently.
 *
 * @returns `true` if the import succeeded and `window.location.reload()` has
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
    const filename = url.split('/').pop() ?? 'graph.knogra';
    const file = new File([blob], filename, { type: 'application/zip' });
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

  // Now open file picker — user has already confirmed intent.
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.knogra';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    await importWorkspace(file);
  };
  input.click();
}

/**
 * Import workspace from .knogra file
 * Replaces all current data and reloads
 */
export async function importWorkspace(file: File): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(file);
    
    // 1. Read and validate manifest
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      alert('Invalid workspace file: missing manifest');
      return false;
    }
    // Validate manifest exists (version checking can be added later)
    await manifestFile.async('string');
    
    // 2. Read all data files
    const graphFile = zip.file('graph.json');
    const settingsFile = zip.file('settings.json');
    const chatFile = zip.file('chat-history.json');
    const imagesFile = zip.file('background-images.json');
    const shelfFile = zip.file('shelf.json');
    const pathsFile = zip.file('paths.json');
    const appStateFile = zip.file('app-state.json');
    const themesFile = zip.file('themes.json');
    
    const graph: GraphData = graphFile 
      ? JSON.parse(await graphFile.async('string'))
      : { nodes: [], edges: [], scenes: [] };
    
    const settings: Record<string, unknown> = settingsFile
      ? JSON.parse(await settingsFile.async('string'))
      : {};
    
    const conversations: unknown[] = chatFile
      ? JSON.parse(await chatFile.async('string'))
      : [];
    
    const images: unknown[] = imagesFile
      ? JSON.parse(await imagesFile.async('string'))
      : [];
    
    const shelf: Record<string, unknown> = shelfFile
      ? JSON.parse(await shelfFile.async('string'))
      : {};
    
    const paths: unknown[] = pathsFile
      ? JSON.parse(await pathsFile.async('string'))
      : [];
    
    const appState: Record<string, unknown> = appStateFile
      ? JSON.parse(await appStateFile.async('string'))
      : {};
    
    const themes: unknown[] = themesFile
      ? JSON.parse(await themesFile.async('string'))
      : [];
    
    // 3. Validate graph integrity. If issues found, warn the user and let them
    //    decide — validation is informational, not a hard block.
    const validation = validateGraphData(graph);
    if (!validation.valid) {
      const proceed = await showValidationErrorDialog(validation.errors);
      if (!proceed) return false;
    }

    // 3b. Scale-to-fit: if the graph was authored on a meaningfully different
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

    // 4. Capture local API keys BEFORE clearing — clearAllData() wipes localStorage
    //    so they must be read first and restored after settings import.
    const localApiKeys = readLocalApiKeys();

    // 4. Clear existing data
    await clearAllData();
    
    // 5. Import graph data to IndexedDB
    await importGraphData(graph, images);
    
    // 6. Import settings to localStorage (restores preserved API keys)
    importSettings(settings, localApiKeys);
    
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
    console.error('Failed to import workspace:', error);
    alert('Failed to import workspace. The file may be corrupted.');
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

  // Reset app state for the new workspace. clearAppState() drops any leftover
  // appMode (e.g. 'view' from a previous workspace) so the next load defaults
  // to 'edit'. seedInitialGraph() then writes the seed node + scene and saves
  // lastSceneId, so the post-reload entry point is correct.
  AppStateManager.clearAppState();
  await seedInitialGraph();

  // Reload
  window.location.reload();
}
