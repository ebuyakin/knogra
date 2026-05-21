/**
 * Diagnostics Recorder
 *
 * Ring buffers for low-level state-machine events that surround the
 * scene-transition lifecycle. Built to answer questions the structured
 * `transition-buffer` alone can't: did GraphSaver fire mid-transition?
 * Did in-memory `graphStore` positions drift after the last write?
 *
 * Dev-only. All public functions short-circuit in production via
 * `import.meta.env.DEV`, so Vite eliminates the runtime cost from
 * production builds.
 *
 * Buffers exposed here:
 *   - saverEvents (50)    — suspend / resume / scheduled / syncStart / syncEnd
 *   - invariantDrift (20) — added in increment 2b
 */

import type { NodeId, SceneId, Scene } from '../../core/main-types';

// ============================================================================
// SAVER EVENTS
// ============================================================================

export type SaverEventKind =
  | 'suspend'
  | 'resume'
  | 'scheduled'
  | 'syncStart'
  | 'syncEnd';

export interface SaverEvent {
  t: string;                 // ISO timestamp
  kind: SaverEventKind;
  reason?: string;           // suspend / resume token
  depth?: number;            // suspension depth after the event
  sceneId?: SceneId;         // scheduled / sync*
  nodeCount?: number;        // syncEnd
  edgeCount?: number;        // syncEnd
  durMs?: number;            // syncEnd: time since corresponding syncStart
  err?: string;              // syncEnd: failure message, if any
}

const MAX_SAVER_EVENTS = 50;
const saverEvents: SaverEvent[] = [];

/**
 * Record a single saver-lifecycle event. No-op in production builds.
 *
 * Callers in `graph-saver.ts` are responsible for `kind`-specific fields.
 * Timestamp is added here so call sites stay compact.
 */
export function recordSaverEvent(event: Omit<SaverEvent, 't'>): void {
  if (!import.meta.env.DEV) return;
  saverEvents.push({ t: new Date().toISOString(), ...event });
  if (saverEvents.length > MAX_SAVER_EVENTS) saverEvents.shift();
}

export function clearSaverEvents(): void {
  saverEvents.length = 0;
}

export function getSaverEvents(): SaverEvent[] {
  return saverEvents.slice();
}

// ============================================================================
// INVARIANT DRIFT
// ============================================================================
//
// Detects mutations to `graphStore.scenes[i].nodes[id].position` that happen
// outside the official `updateScene` write path. The DB is unaffected (the
// store deep-clones before writing), but the in-memory cache diverges — and
// the next save will persist the corrupted value.
//
// Mechanism:
//   1. `recordPersistedPositions(scene)` is called from `graphStore.updateScene`
//      immediately after the deep clone. We snapshot positions into our own
//      baseline map (deep-copied — no shared references).
//   2. `startDriftProbe(getScenes)` schedules a 500ms `setInterval`. Each tick
//      walks every baselined scene, compares against the *live* objects in
//      `graphStore.scenes`, and pushes a `DriftRecord` for any node that
//      differs by more than 1px on either axis.
//   3. To avoid spamming the buffer when drift persists across many ticks,
//      we only record the *first* drift per (sceneId, nodeId) pair until the
//      next `recordPersistedPositions` call refreshes that scene's baseline.

const POSITION_EPSILON = 1;
const DRIFT_PROBE_INTERVAL_MS = 500;
const MAX_DRIFT_ENTRIES = 20;

export interface DriftRecord {
  t: string;
  sceneId: SceneId;
  nodeId: NodeId;
  stored: { x: number; y: number };
  inMemory: { x: number; y: number };
  delta: { dx: number; dy: number };
}

interface PositionBaseline {
  positions: Map<NodeId, { x: number; y: number }>;
  /** Nodes already reported since the last baseline refresh. */
  reported: Set<NodeId>;
}

const baselines: Map<SceneId, PositionBaseline> = new Map();
const driftBuffer: DriftRecord[] = [];
let probeStarted = false;

/**
 * Snapshot the persisted positions for a scene. Called from
 * `graphStore.updateScene` after the deep clone. Resets the per-scene
 * `reported` set so any subsequent drift is captured at least once.
 */
export function recordPersistedPositions(scene: Scene): void {
  if (!import.meta.env.DEV) return;
  const positions = new Map<NodeId, { x: number; y: number }>();
  for (const [id, n] of Object.entries(scene.nodes)) {
    positions.set(id as NodeId, { x: n.position.x, y: n.position.y });
  }
  baselines.set(scene.id, { positions, reported: new Set() });
}

/**
 * Start the periodic drift probe. Idempotent; no-op in production builds.
 * Called once from `main.ts` after `graphStore` has finished initializing.
 */
export function startDriftProbe(getScenes: () => Scene[]): void {
  if (!import.meta.env.DEV) return;
  if (probeStarted) return;
  probeStarted = true;
  setInterval(() => checkDriftOnce(getScenes), DRIFT_PROBE_INTERVAL_MS);
}

function checkDriftOnce(getScenes: () => Scene[]): void {
  if (driftBuffer.length >= MAX_DRIFT_ENTRIES) return;
  const scenes = getScenes();
  for (const scene of scenes) {
    const baseline = baselines.get(scene.id);
    if (!baseline) continue;
    for (const [nodeId, stored] of baseline.positions) {
      if (baseline.reported.has(nodeId)) continue;
      const live = scene.nodes[nodeId]?.position;
      if (!live) continue;
      const dx = live.x - stored.x;
      const dy = live.y - stored.y;
      if (Math.abs(dx) <= POSITION_EPSILON && Math.abs(dy) <= POSITION_EPSILON) continue;
      driftBuffer.push({
        t: new Date().toISOString(),
        sceneId: scene.id,
        nodeId,
        stored: { x: stored.x, y: stored.y },
        inMemory: { x: live.x, y: live.y },
        delta: { dx, dy },
      });
      baseline.reported.add(nodeId);
      if (driftBuffer.length >= MAX_DRIFT_ENTRIES) return;
    }
  }
}

export function clearInvariantDrift(): void {
  driftBuffer.length = 0;
}

export function getInvariantDrift(): DriftRecord[] {
  return driftBuffer.slice();
}
