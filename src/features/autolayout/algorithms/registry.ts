/**
 * Scene-layout registry
 *
 * Maps a layout id (the persisted `autolayout.layoutType`) to its
 * implementation. Add a new algorithm here plus a matching `{ id, label }` entry
 * in `config/autolayout-settings.ts` (`AUTOLAYOUT_ALGORITHMS`).
 *
 * See `docs/autolayout-architecture.md` §3.
 */

import type { SceneLayout } from './types';
import { outerRingSpreadingLayout } from './outer-ring-spreading';

const LAYOUTS: Record<string, SceneLayout> = {
  [outerRingSpreadingLayout.id]: outerRingSpreadingLayout,
};

/** Resolve a layout by id, falling back to the default radial layout. */
export function resolveLayout(id: string): SceneLayout {
  return LAYOUTS[id] ?? outerRingSpreadingLayout;
}
