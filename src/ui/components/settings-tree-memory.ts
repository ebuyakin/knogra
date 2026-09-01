/**
 * Settings modal — tree collapse memory
 *
 * Session-scoped for the same reason as the Node Editor's tab memory: a section
 * you collapsed stays collapsed while you work, and a fresh browser tab starts
 * from the declared defaults. Never travels into an exported workspace.
 */

import { SETTINGS_TREE_KEY } from '../../config/storage-config';

/** Category id → collapsed. Absent ids fall back to the category's own default. */
export type TreeCollapseState = Record<string, boolean>;

export function readCollapseState(): TreeCollapseState {
  try {
    const stored = sessionStorage.getItem(SETTINGS_TREE_KEY);
    if (!stored) return {};

    const parsed: unknown = JSON.parse(stored);
    return typeof parsed === 'object' && parsed !== null ? parsed as TreeCollapseState : {};
  } catch {
    // Storage can be unavailable in hardened privacy modes; defaults are fine.
    return {};
  }
}

export function writeCollapsed(categoryId: string, collapsed: boolean): void {
  try {
    const state = readCollapseState();
    state[categoryId] = collapsed;
    sessionStorage.setItem(SETTINGS_TREE_KEY, JSON.stringify(state));
  } catch {
    // Losing collapse memory is not worth failing the interaction over.
  }
}
