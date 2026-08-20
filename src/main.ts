// Knogra - Main application entry point

import cytoscape from 'cytoscape';
import { initializeMathJax } from './utils/mathjax';
import { DOUBLE_CLICK_INTERVAL_MS } from './config/interaction-settings';

// Install diagnostics buffers as early as possible — they must be in place
// before anything else logs or throws, otherwise early events are lost.
// Dynamic imports ensure these modules are fully excluded from production
// builds — Vite splits them into a separate chunk that is never requested.
if (import.meta.env.DEV) {
  const [{ installConsoleBuffer }, { installErrorBuffer }, { recordAction }, { eventBus }] = await Promise.all([
    import('./utils/diagnostics/console-buffer'),
    import('./utils/diagnostics/error-buffer'),
    import('./utils/diagnostics/action-buffer'),
    import('./events/event-bus'),
  ]);
  installConsoleBuffer();
  installErrorBuffer();
  // Scene transitions are already broadcast on the event bus — passive subscriber.
  eventBus.on('sceneChanged', payload => recordAction('scene.changed', payload));
}

import type { SceneId } from './core/main-types';
import { FeatureAPI } from './features/feature-api';
import { UIComponentAPI } from './ui/components/ui-component-api';
import { PanelAPI } from './ui/panels/panel-api';

import { graphStore } from './storage/graph-store.js';
import { graphSaver } from './storage/graph-saver';
import { chatSession } from './ai/chat-session';
import { AppStateManager } from './storage/app-state';
import { seedInitialGraph } from './storage/seed-workspace';
import { importFromUrl } from './storage/workspace';
import { ping } from './utils/telemetry';
import { hasMeaningfulWorkspaceData } from './storage/workspace/dialogs';
import { initTabGuard } from './utils/tab-guard';
import { BackgroundRenderer } from './background/background-renderer';
import './storage/theme-store';  // Initialize theme store early (singleton)
import './styles/connection-badge.css';
import './styles/fold-badge.css';

// =============================================================================
// 1. EXTERNAL LIBRARIES
// =============================================================================
await initializeMathJax();

// =============================================================================
// 2. INFRASTRUCTURE (DOM, Cytoscape, Rendering)
// =============================================================================
const container = document.getElementById('cy');
if (!container) throw new Error('Container #cy not found');

const cy = cytoscape({ container, style: [], layout: { name: 'preset', fit: false }, multiClickDebounceTime: DOUBLE_CLICK_INTERVAL_MS });
const backgroundRenderer = new BackgroundRenderer(container);

// =============================================================================
// 3. PERSISTENCE (low-level, before anything can trigger saves)
// =============================================================================
graphSaver.init(cy);

// Drift probe: detects mid-flight mutations to `graphStore.scenes[i].nodes[id].position`
// that bypass `updateScene`. Dev-only; dynamically imported so the module graph is
// stripped from production builds.
if (import.meta.env.DEV) {
  const { startDriftProbe } = await import('./utils/diagnostics/recorder');
  startDriftProbe(() => graphStore.scenes);
}

// =============================================================================
// 4. STATE MANAGEMENT
// =============================================================================
AppStateManager.initAppState();

// Capture whether the user had a real (non-seed, non-empty) workspace BEFORE
// any further init runs. Steps below (seedInitialGraph, openScene, chat panel
// load) write side-effect rows to IndexedDB — e.g. an empty chat conversation
// for the seed scene — which would make a later `hasMeaningfulWorkspaceData()`
// call return a false positive. The pending-import handler uses this captured
// value to decide both whether to show the import dialog AND when to import.
const hadRealDataAtStartup = await hasMeaningfulWorkspaceData();

// Cross-origin handoff from the marketing site (knogra.io). The Library "Open"
// and Tutorial flows navigate to app.knogra.io/?import=<graph-url>. sessionStorage
// cannot cross origins, so the graph URL travels in a query param instead. The
// param is user-controllable, so only the site's own graph library is honoured —
// an allowlist prevents the app from being coerced into fetching arbitrary
// content. Pinning scheme and host at the start of the string is what makes the
// check sound: no prefix can be forged ahead of position zero.
const GRAPH_LIBRARY_URL_PREFIX = 'https://knogra.io/graphs/';

function consumePendingImportUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('import');
  if (!raw) return null;
  // Strip the param so a page refresh doesn't re-trigger the import.
  params.delete('import');
  const query = params.toString();
  const cleaned = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
  window.history.replaceState(null, '', cleaned);
  return raw.startsWith(GRAPH_LIBRARY_URL_PREFIX) ? raw : null;
}

// Catalog import — EARLY branch.
// If the user had no real data and clicked Open in the site catalog, import
// the graph NOW, before seeding or opening any scene. This avoids the visual
// glitch where the seed "New Idea" flashes briefly before being replaced.
const pendingImportUrl = consumePendingImportUrl();
if (pendingImportUrl && !hadRealDataAtStartup) {
  const imported = await importFromUrl(pendingImportUrl, { showDialog: false });
  if (imported) {
    // importWorkspace has called window.location.reload(). The browser queues
    // the navigation but keeps running JS until the current task completes.
    // We MUST halt here — otherwise seedInitialGraph and openScene below will
    // run on a stale in-memory graphStore, writing a seed scene and a bogus
    // lastSceneId to localStorage before the browser actually navigates.
    // Hanging on an unresolved promise is the cleanest way to stop.
    await new Promise<never>(() => {});
  }
  // If imported === false (network/parse failure), fall through to normal init
  // so the user still gets a working app instead of a blank page.
}

// Cold start: empty IndexedDB (incognito / first run / cleared data) → seed a
// single anchor node + scene so the app opens into a usable empty graph rather
// than throwing "Scene not found". seedInitialGraph() updates graphStore's
// in-memory cache, so the rest of init can proceed normally.
if (graphStore.scenes.length === 0) {
  await seedInitialGraph();
}

// Determine which scene to open
const lastSceneId = AppStateManager.getLastSceneId();
const sceneExists = lastSceneId && graphStore.scenes.some(s => s.id === lastSceneId);
const currentSceneId: SceneId = sceneExists ? lastSceneId : graphStore.scenes[0].id;

// =============================================================================
// 5. FEATURES (high-level business logic)
// =============================================================================
const features = new FeatureAPI(cy, backgroundRenderer);

// =============================================================================
// 6. UI (components and panels)
// =============================================================================
const components = new UIComponentAPI(cy, container, features);
const panels = new PanelAPI(cy, features);

// Setup resize observer for graph container
let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
let isInitialResize = true; // Skip first resize (fires immediately on observe)
const resizeObserver = new ResizeObserver(() => {
  if (isInitialResize) {
    isInitialResize = false;
    return;
  }
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    features.scene.handleResize();
    features.sceneBackground.resize(container.clientWidth, container.clientHeight);
  }, 200);
});
resizeObserver.observe(container);

// TODO: Move to proper feature (Selection? Scene?)
// Track active node for design inheritance
cy.on('select', 'node', (event) => {
  cy.scratch('activeNodeId', event.target.id());
});

// =============================================================================
// 7. STARTUP (open scene, initialize features that need scene context)
// =============================================================================
// Restore a path-mode session before opening a scene, so a tour interrupted by a
// reload resumes at the scene it was left on rather than the last-visited one.
// Returns null (and stays in history mode) if the saved path or scene is gone.
const restoredPathSceneId = features.path.restoreSession();
const sceneToOpen: SceneId = restoredPathSceneId ?? currentSceneId;

await features.transition.openScene(sceneToOpen);
if (AppStateManager.consumeFitOnNextOpen(sceneToOpen)) {
  features.scene.fit();
}
// No-op when a path session was restored — that already established the position.
features.path.init(sceneToOpen);

// Initialize AI chat panel — try auto-init from settings, load conversation regardless
await chatSession.tryAutoInit();
const scene = graphStore.scenes.find(s => s.id === sceneToOpen);
if (scene) {
  await panels.chatPanel.loadForScene(sceneToOpen, scene.centralNodeId);
}

ping('session_start');

// Warn if the app is already open in another tab (shared IndexedDB risk).
initTabGuard();

// Catalog import — LATE branch.
// Only reached when the user had a real workspace AND a pending import.
// Runs after full init so the dialog appears over the rendered workspace,
// letting the user see what's about to be replaced and choose to export first.
if (pendingImportUrl && hadRealDataAtStartup) {
  await importFromUrl(pendingImportUrl, { showDialog: true });
}

// =============================================================================
// DEBUGGING (expose globals for console access - dev only)
// =============================================================================
if (import.meta.env.DEV) {
  // Node image presets and prompt composition are plain modules of functions;
  // the namespace objects give the console a handle to exercise them before any
  // UI exists.
  const nodeImagePresets = await import('./storage/node-image-presets');
  const nodeImagePrompt = await import('./ai/node-image/prompt/prompt-composer');
  const nodeImagePalette = await import('./styles/node-image-palette');
  const nodeImageGenerator = await import('./ai/node-image/svg-generator');
  nodeImagePalette.auditImagePalettes();
  // @ts-expect-error ts(2339)
  window.debugger = {cy, features, graphSaver, components, panels, graphStore, nodeImagePresets, nodeImagePrompt, nodeImagePalette, nodeImageGenerator};
}

// Diagnostics snapshot — `knogra.snapshot()` from devtools or Ctrl+Shift+D.
// Dynamic import keeps the entire diagnostics subtree out of the production bundle.
// Pass an options object to include/exclude segments, e.g.
//   knogra.snapshot({ console: true, persisted: false })
//
// To reset all buffers before a new test scenario:
//   knogra.clearBuffers()
// This clears transitions, saverEvents, invariantDrift, and actions.
//
// To audit edge consistency (duplicates / orphans / dangling scene refs):
//   knogra.auditEdges()
//
// To audit current scene (cy vs db, fold state diff, node/edge detail):
//   knogra.auditScene()              // current scene from cy.scratch
//   knogra.auditScene('scene-id')    // explicit scene id
//
// To capture a PNG of the current viewport (background layer included) for the
// marketing-site graph library:
//   knogra.capturePreview()                           // knogra-preview.png, 2×
//   knogra.capturePreview({ name: 'graph-calculus' }) // sets the file name
// @ts-expect-error ts(2339)
window.knogra = {
  snapshot: import.meta.env.DEV
    ? async (options?: Parameters<typeof import('./utils/diagnostics/snapshot').downloadSnapshot>[1]) => {
        const { downloadSnapshot } = await import('./utils/diagnostics/snapshot');
        return downloadSnapshot(cy, options);
      }
    : undefined,
  auditEdges: import.meta.env.DEV
    ? async () => {
        const { auditEdges } = await import('./utils/diagnostics/edge-audit');
        auditEdges();
      }
    : undefined,
  auditScene: import.meta.env.DEV
    ? async (sceneId?: string) => {
        const { auditScene } = await import('./utils/diagnostics/scene-audit');
        auditScene(cy, sceneId as never);
      }
    : undefined,
  clearBuffers: import.meta.env.DEV
    ? async () => {
        const [
          { clearTransitionBuffer },
          { clearSaverEvents, clearInvariantDrift },
          { clearActionBuffer },
        ] = await Promise.all([
          import('./utils/diagnostics/transition-buffer'),
          import('./utils/diagnostics/recorder'),
          import('./utils/diagnostics/action-buffer'),
        ]);
        clearTransitionBuffer();
        clearSaverEvents();
        clearInvariantDrift();
        clearActionBuffer();
        console.log('[diagnostics] All buffers cleared.');
      }
    : undefined,
  capturePreview: import.meta.env.DEV
    ? async (options?: Parameters<typeof import('./utils/screenshot').captureScreenshot>[1]) => {
        const { captureScreenshot } = await import('./utils/screenshot');
        captureScreenshot(cy, options);
      }
    : undefined
};
