/**
 * Transition Buffer
 *
 * Structured ring buffer of scene-transition records. One entry per high-level
 * transition (toNode, openScene, closeScene, goToSceneFromPath) — replaces
 * the dozens of repeated `[d_transition]` console.log lines that bloat the
 * snapshot's console mirror.
 *
 * Dev-only. All call sites guard with `import.meta.env.DEV` so Vite eliminates
 * them from production builds.
 *
 * Usage:
 *   const rec = startTransition({ kind: 'toNode', from: currentSceneId });
 *   rec.classify({ shared: {...}, departing: {...}, arriving: {...} });
 *   rec.viewport({ fromZoom, toZoom });
 *   rec.complete({ to: targetSceneId, isNewScene });
 *
 * A record is appended to the buffer on `.complete()` or `.fail()`; in-flight
 * records are not visible to `getTransitionBuffer()`.
 */

import type { NodeId, EdgeId, SceneId } from '../../core/main-types';

export type TransitionKind = 'toNode' | 'fromPath' | 'openScene' | 'closeScene';

export interface TransitionRecord {
  kind: TransitionKind;
  t: string;                                 // start timestamp (ISO)
  durMs?: number;                            // total wall-clock duration
  from?: SceneId | null;
  to?: SceneId | null;
  centralFrom?: NodeId | null;
  centralTo?: NodeId | null;
  isNewScene?: boolean;
  shared?: { nodes: NodeId[]; edges: EdgeId[] };
  departing?: { nodes: NodeId[]; edges: EdgeId[] };
  arriving?: { nodes: NodeId[]; edges: EdgeId[] };
  viewport?: { fromZoom: number; toZoom: number };
  note?: string;                             // routing decision, etc.
  err?: string;
}

export interface TransitionRecordHandle {
  classify(payload: {
    shared?: { nodes: NodeId[]; edges: EdgeId[] };
    departing?: { nodes: NodeId[]; edges: EdgeId[] };
    arriving?: { nodes: NodeId[]; edges: EdgeId[] };
  }): void;
  viewport(payload: { fromZoom: number; toZoom: number }): void;
  note(text: string): void;
  setCentrals(payload: { from?: NodeId | null; to?: NodeId | null }): void;
  setTarget(payload: { to?: SceneId | null; isNewScene?: boolean }): void;
  complete(payload?: { to?: SceneId | null; isNewScene?: boolean }): void;
  fail(err: unknown): void;
}

const MAX_ENTRIES = 200;
const buffer: TransitionRecord[] = [];

const NOOP_HANDLE: TransitionRecordHandle = {
  classify: () => undefined,
  viewport: () => undefined,
  note: () => undefined,
  setCentrals: () => undefined,
  setTarget: () => undefined,
  complete: () => undefined,
  fail: () => undefined,
};

export function startTransition(init: {
  kind: TransitionKind;
  from?: SceneId | null;
  centralFrom?: NodeId | null;
  centralTo?: NodeId | null;
  note?: string;
}): TransitionRecordHandle {
  // Production builds: no-op (Vite tree-shakes the rest at build time)
  if (!import.meta.env.DEV) return NOOP_HANDLE;

  const startWall = Date.now();
  const rec: TransitionRecord = {
    kind: init.kind,
    t: new Date(startWall).toISOString(),
    from: init.from ?? null,
    centralFrom: init.centralFrom ?? null,
    centralTo: init.centralTo ?? null,
    note: init.note,
  };

  let finalized = false;
  const finalize = (): void => {
    if (finalized) return;
    finalized = true;
    rec.durMs = Date.now() - startWall;
    buffer.push(rec);
    if (buffer.length > MAX_ENTRIES) buffer.shift();
  };

  return {
    classify(p): void {
      if (p.shared) rec.shared = p.shared;
      if (p.departing) rec.departing = p.departing;
      if (p.arriving) rec.arriving = p.arriving;
    },
    viewport(p): void {
      rec.viewport = p;
    },
    note(text): void {
      rec.note = rec.note ? `${rec.note}; ${text}` : text;
    },
    setCentrals(p): void {
      if (p.from !== undefined) rec.centralFrom = p.from;
      if (p.to !== undefined) rec.centralTo = p.to;
    },
    setTarget(p): void {
      if (p.to !== undefined) rec.to = p.to;
      if (p.isNewScene !== undefined) rec.isNewScene = p.isNewScene;
    },
    complete(p): void {
      if (p?.to !== undefined) rec.to = p.to;
      if (p?.isNewScene !== undefined) rec.isNewScene = p.isNewScene;
      finalize();
    },
    fail(err): void {
      rec.err = err instanceof Error ? err.message : String(err);
      finalize();
    },
  };
}

export function getTransitionBuffer(): TransitionRecord[] {
  return buffer.slice();
}

export function clearTransitionBuffer(): void {
  buffer.length = 0;
}
