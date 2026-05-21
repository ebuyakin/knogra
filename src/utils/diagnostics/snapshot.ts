/**
 * Diagnostics Snapshot
 *
 * Single-file dump of everything needed to diagnose a bug — persisted graph
 * data, live Cytoscape state, structured event buffers, and environment
 * metadata. Dev-only: the entire module is tree-shaken from production builds.
 *
 * ── How to take a snapshot ──────────────────────────────────────────────────
 *
 *   Ctrl+Shift+D           — keyboard shortcut in the app (dev builds only)
 *   knogra.snapshot()      — devtools console; downloads knogra-snapshot.json
 *
 * The default recipe is lean (~6 KB). Full dump:
 *   knogra.snapshot({ persisted: true, localStorage: true, cySlim: false })
 *
 * Selective segments (pass a partial SnapshotOptions object):
 *   knogra.snapshot({ console: true })           — include full console mirror
 *   knogra.snapshot({ persisted: true })         — add full IndexedDB dump (~120 KB extra)
 *   knogra.snapshot({ transitions: false })       — skip transition history
 *   knogra.snapshot({ cySlim: false })            — full cy nodes: adds data + selected fields
 *
 * ── How to reset buffers before a new test scenario ─────────────────────────
 *
 *   knogra.clearBuffers()
 *
 * Clears all ring buffers (transitions, saverEvents, invariantDrift, actions).
 * The console mirror is intentionally NOT cleared — it captures debug output
 * from the session. Take a snapshot immediately after the test to maximise
 * the relevant log window before new messages rotate old ones out.
 *
 * ── What the snapshot contains ───────────────────────────────────────────────
 *
 *  SEGMENT          DEFAULT  DESCRIPTION
 *  ─────────────────────────────────────────────────────────────────────────
 *  meta             on       Timestamp, appVersion, userAgent, URL,
 *                            screen/viewport dimensions, active debug flags,
 *                            and the list of included segments.
 *
 *  persisted        OFF      Full IndexedDB export: nodes, edges, scenes,
 *                            settings, appState, shelf, conversations, paths,
 *                            themes, backgroundImages (base64 truncated to
 *                            200 chars; original length in _originalDataLength).
 *                            Off by default (~12K tokens). Enable with
 *                            persisted:true when you need the raw graph record.
 *
 *  localStorage     OFF      Every knogra.* key parsed from localStorage.
 *                            Off by default — duplicates persisted.settings.
 *
 *  cy               on       Live Cytoscape state at snapshot time:
 *                            - nodes: position, classes, scratch
 *                              (+ data, selected when cySlim:false)
 *                            - edges: source, target, classes
 *                              (+ data when cySlim:false)
 *                            - cy.scratch(): currentSceneId, foldedNodes,
 *                              activeNodeId, edgesToDelete
 *                            - viewport: zoom, pan
 *
 *  cySlim           on       Strip data and selected from cy nodes/edges.
 *                            Keeps position, classes, scratch — enough for
 *                            all fold/transition investigations. Cuts cy
 *                            segment ~60%. Set cySlim:false only when you
 *                            need node labels or raw data fields.
 *
 *  transitions      on       Structured ring buffer (last 200 entries) of every
 *                            scene transition. One record per transition:
 *                            { kind, from, to, centralFrom, centralTo,
 *                              shared, departing, arriving, viewport, durMs }
 *                            Kinds: toNode | fromPath | openScene | closeScene
 *                            Use arriving/departing to spot missing or phantom
 *                            nodes/edges (see Bugs 2, 5, arrival-bug fix).
 *
 *  saverEvents      on       Ring buffer (last 50) of GraphSaver lifecycle
 *                            events: suspend, resume, scheduled, syncStart,
 *                            syncEnd. Each records the suspension depth so you
 *                            can verify transitions properly bracket
 *                            disable()/enable() calls around DB writes.
 *
 *  invariantDrift   on       Ring buffer (last 20) of detected in-memory
 *                            position drift: cases where graphStore.scenes[i]
 *                            .nodes[id].position was mutated outside the
 *                            official updateScene() write path. Empty = no
 *                            aliasing since last clearBuffers(). Non-empty =
 *                            a cy.add() call is passing a raw reference instead
 *                            of { x: pos.x, y: pos.y } (see Bugs 3, 4).
 *
 *  errors           on       Last 100 uncaught window.error and
 *                            unhandledrejection events.
 *
 *  actions          on       Ring buffer (last 200) of semantic user actions:
 *                            scene.changed, fold, unfold. Lightweight timeline
 *                            of what the user actually did. Always on, no debug
 *                            flags required.
 *
 *  console          OFF      Full mirror of last 500 console.log/warn/error
 *                            lines since page load. Off by default because it's
 *                            large and duplicates the structured buffers above.
 *                            Enable when you need raw log output (e.g. to read
 *                            transition phase markers from d_transition flag):
 *                              knogra.snapshot({ console: true })
 *
 * ── Security ────────────────────────────────────────────────────────────────
 *
 * Any field whose key matches /api.?key/i is replaced with [REDACTED] before
 * the file is written. Safe to attach snapshots to issue reports or AI chat.
 */

import type { Core } from 'cytoscape';

import {
  exportGraphData,
  exportSettings,
  exportConversations,
  exportBackgroundImages,
  exportShelf,
  exportPaths,
  exportThemes,
} from '../../storage/workspace/transfer';
import { AppStateManager } from '../../storage/app-state';
import { DEBUG } from '../../config/debug-flags';
import { getConsoleBuffer } from './console-buffer';
import { getErrorBuffer } from './error-buffer';
import { getActionBuffer } from './action-buffer';
import { getTransitionBuffer } from './transition-buffer';
import { getSaverEvents, getInvariantDrift } from './recorder';

const APP_VERSION = '0.1.0';
const SNAPSHOT_VERSION = '1.0';
const IMAGE_DATA_PREVIEW_CHARS = 200;

// ============================================================================
// REDACTION
// ============================================================================

/** Recursively replace values under any key matching /api.?key/i with [REDACTED]. */
function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(redactSensitive) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/api.?key/i.test(k) && typeof v === 'string' && v.length > 0) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitive(v);
      }
    }
    return out as unknown as T;
  }
  return value;
}

// ============================================================================
// CY STATE
// ============================================================================

interface CyNodeSnapshot {
  id: string;
  position: { x: number; y: number };
  classes: string[];
  selected: boolean;
  data: Record<string, unknown>;
  scratch: Record<string, unknown>;
}

interface CyEdgeSnapshot {
  id: string;
  source: string;
  target: string;
  classes: string[];
  data: Record<string, unknown>;
}

/** Slim variants — strip `data` and `selected`; useful when only presence/position/state matters. */
interface CyNodeSnapshotSlim {
  id: string;
  position: { x: number; y: number };
  classes: string[];
  scratch: Record<string, unknown>;
}

interface CyEdgeSnapshotSlim {
  id: string;
  source: string;
  target: string;
  classes: string[];
}

type CyNodeEntry = CyNodeSnapshot | CyNodeSnapshotSlim;
type CyEdgeEntry = CyEdgeSnapshot | CyEdgeSnapshotSlim;

function captureCyState(cy: Core, slim = false): {
  nodes: CyNodeEntry[];
  edges: CyEdgeEntry[];
  scratch: Record<string, unknown>;
  viewport: { zoom: number; pan: { x: number; y: number } };
} {
  const nodes: CyNodeEntry[] = cy.nodes().map(n =>
    slim
      ? { id: n.id(), position: n.position(), classes: n.classes(), scratch: n.scratch() ?? {} }
      : { id: n.id(), position: n.position(), classes: n.classes(), selected: n.selected(), data: n.data(), scratch: n.scratch() ?? {} }
  );
  const edges: CyEdgeEntry[] = cy.edges().map(e =>
    slim
      ? { id: e.id(), source: e.source().id(), target: e.target().id(), classes: e.classes() }
      : { id: e.id(), source: e.source().id(), target: e.target().id(), classes: e.classes(), data: e.data() }
  );
  return {
    nodes,
    edges,
    scratch: cy.scratch() ?? {},
    viewport: { zoom: cy.zoom(), pan: cy.pan() },
  };
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================

function captureLocalStorage(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('knogra.')) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      out[key] = JSON.parse(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

// ============================================================================
// IMAGE TRUNCATION
// ============================================================================

/** Replace long base64 `data` fields in background-image records with a preview. */
function truncateImageData(images: unknown[]): unknown[] {
  return images.map(img => {
    if (!img || typeof img !== 'object') return img;
    const copy: Record<string, unknown> = { ...(img as Record<string, unknown>) };
    const data = copy.data;
    if (typeof data === 'string' && data.length > IMAGE_DATA_PREVIEW_CHARS) {
      copy.data = `${data.slice(0, IMAGE_DATA_PREVIEW_CHARS)}… [truncated ${data.length - IMAGE_DATA_PREVIEW_CHARS} chars]`;
      copy._originalDataLength = data.length;
    }
    return copy;
  });
}

// ============================================================================
// MAIN
// ============================================================================

/**
 * Per-segment inclusion flags. All default to `true` except `console`, which
 * is verbose and now usually redundant with the structured `transitions` array.
 *
 * Pass `captureSnapshot({ cyPositionSamples: true })` etc. to opt heavy buffers
 * in, or `captureSnapshot({ persisted: false })` to exclude segments you don't
 * need for the current investigation.
 */
export interface SnapshotOptions {
  // State segments (cheap)
  meta?: boolean;
  persisted?: boolean;
  localStorage?: boolean;
  cy?: boolean;
  cySlim?: boolean;    // strip data/selected from cy nodes/edges — smaller, still shows presence/position/state
  // Event/diagnostic segments
  transitions?: boolean;
  saverEvents?: boolean;
  invariantDrift?: boolean;
  console?: boolean;        // verbose console mirror — off by default
  errors?: boolean;
  actions?: boolean;
}

const DEFAULT_OPTIONS: Required<SnapshotOptions> = {
  meta: true,
  persisted: false,
  localStorage: false,
  cy: true,
  cySlim: true,
  transitions: true,
  saverEvents: true,
  invariantDrift: true,
  console: false,
  errors: true,
  actions: true,
};

export interface DiagnosticsSnapshot {
  meta?: {
    snapshotVersion: string;
    appVersion: string;
    timestamp: string;
    userAgent: string;
    url: string;
    screen: { width: number; height: number };
    viewport: { width: number; height: number };
    debugFlags: Record<string, boolean>;
    includedSegments: string[];
  };
  persisted?: {
    graph: unknown;
    settings: unknown;
    appState: unknown;
    shelf: unknown;
    conversations: unknown;
    paths: unknown;
    themes: unknown;
    backgroundImages: unknown;
  };
  localStorage?: Record<string, unknown>;
  cy?: ReturnType<typeof captureCyState>;
  transitions?: ReturnType<typeof getTransitionBuffer>;
  saverEvents?: ReturnType<typeof getSaverEvents>;
  invariantDrift?: ReturnType<typeof getInvariantDrift>;
  console?: ReturnType<typeof getConsoleBuffer>;
  errors?: ReturnType<typeof getErrorBuffer>;
  actions?: ReturnType<typeof getActionBuffer>;
}

export async function buildSnapshot(
  cy: Core,
  options: SnapshotOptions = {},
): Promise<DiagnosticsSnapshot> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const snapshot: DiagnosticsSnapshot = {};

  if (opts.meta) {
    const included = (Object.keys(opts) as (keyof SnapshotOptions)[])
      .filter(k => opts[k])
      .sort();
    snapshot.meta = {
      snapshotVersion: SNAPSHOT_VERSION,
      appVersion: APP_VERSION,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: location.href,
      screen: { width: screen.width, height: screen.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      debugFlags: { ...DEBUG },
      includedSegments: included,
    };
  }

  if (opts.persisted) {
    const [graph, conversations, images, paths, themes] = await Promise.all([
      exportGraphData(),
      exportConversations(),
      exportBackgroundImages(),
      exportPaths(),
      exportThemes(),
    ]);
    snapshot.persisted = {
      graph,
      settings: exportSettings(),
      appState: AppStateManager.getAppState(),
      shelf: exportShelf(),
      conversations,
      paths,
      themes,
      backgroundImages: truncateImageData(images),
    };
  }

  if (opts.localStorage) snapshot.localStorage = captureLocalStorage();
  if (opts.cy) snapshot.cy = captureCyState(cy, opts.cySlim);
  if (opts.transitions) snapshot.transitions = getTransitionBuffer();
  if (opts.saverEvents) snapshot.saverEvents = getSaverEvents();
  if (opts.invariantDrift) snapshot.invariantDrift = getInvariantDrift();
  if (opts.console) snapshot.console = getConsoleBuffer();
  if (opts.errors) snapshot.errors = getErrorBuffer();
  if (opts.actions) snapshot.actions = getActionBuffer();

  return redactSensitive(snapshot);
}

function downloadJson(filename: string, payload: unknown): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Build and download a snapshot. Returns the in-memory object for chaining. */
export async function downloadSnapshot(
  cy: Core,
  options: SnapshotOptions = {},
): Promise<DiagnosticsSnapshot> {
  const snapshot = await buildSnapshot(cy, options);
  downloadJson('knogra-snapshot.json', snapshot);
  return snapshot;
}
