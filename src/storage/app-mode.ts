/**
 * App Mode
 * Runtime View/Edit mode state.
 *
 * Persisted via AppStateManager (knogra.state localStorage). Default is Edit
 * when no persisted value exists — preserves backward compatibility and
 * matches the new-workspace expectation that users land in Edit mode.
 */

import type { AppMode } from '../core/main-types';
import { eventBus } from '../events/event-bus';
import { graphSaver, type GraphSaverSuspension } from './graph-saver';
import { AppStateManager } from './app-state';

let currentAppMode: AppMode = AppStateManager.getAppMode() ?? 'edit';
let viewModeSuspension: GraphSaverSuspension | null = null;

export function getAppMode(): AppMode {
  return currentAppMode;
}

export function setAppMode(mode: AppMode): void {
  if (mode === currentAppMode) return;

  currentAppMode = mode;
  AppStateManager.saveAppMode(mode);

  if (mode === 'view' && viewModeSuspension === null) {
    viewModeSuspension = graphSaver.suspend('app-mode:view');
  }
  if (mode === 'edit' && viewModeSuspension !== null) {
    graphSaver.resume(viewModeSuspension);
    viewModeSuspension = null;
  }

  eventBus.emit('appModeChanged', { mode });
}

export function isEditMode(): boolean {
  return currentAppMode === 'edit';
}

export function isViewMode(): boolean {
  return currentAppMode === 'view';
}
