/**
 * Action Buffer
 *
 * Records semantic user actions (scene transitions, folds) in a ring buffer
 * for inclusion in diagnostic snapshots. Lets a snapshot reconstruct the
 * sequence of actions that led to a bug, even when no debug flags were
 * enabled at the time.
 *
 * Dev-only. Call sites guard `recordAction` with `import.meta.env.DEV` so
 * Vite eliminates them from production builds.
 */

export interface ActionEntry {
  kind: string;
  timestamp: string;
  payload: unknown;
}

const MAX_ENTRIES = 200;
const buffer: ActionEntry[] = [];

export function recordAction(kind: string, payload: unknown = {}): void {
  buffer.push({ kind, timestamp: new Date().toISOString(), payload });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function getActionBuffer(): ActionEntry[] {
  return buffer.slice();
}

export function clearActionBuffer(): void {
  buffer.length = 0;
}
