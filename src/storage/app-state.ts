/**
 * App State Manager
 * Manages knogra.state in localStorage
 * 
 * Tracks session state that should persist across page reloads:
 * - Last opened scene
 * - Future: other session state
 * 
 * Listens to EventBus sceneChanged (fires from all transition paths)
 */

import type { AppMode, SceneId } from '../core/main-types';
import { STATE_KEY } from '../config/storage-config';
import { eventBus } from '../events/event-bus';

// ============================================================================
// TYPES
// ============================================================================

interface AppState {
  lastSceneId?: SceneId;
  /** Persisted app mode (view/edit). Absent → default 'edit' on read. */
  appMode?: AppMode;
}

// ============================================================================
// APP STATE MANAGER CLASS
// ============================================================================

export class AppStateManager {
  /**
   * Get current app state
   * Returns empty object if nothing stored
   */
  static getAppState(): AppState {
    const stored = localStorage.getItem(STATE_KEY);
    if (!stored) return {};
    
    try {
      return JSON.parse(stored);
    } catch {
      return {};
    }
  }

  /**
   * Update app state (merges with existing)
   * @param updates Partial state to merge
   */
  static updateAppState(updates: Partial<AppState>): void {
    const current = this.getAppState();
    const merged = { ...current, ...updates };
    localStorage.setItem(STATE_KEY, JSON.stringify(merged));
  }

  /**
   * Clear all app state
   * Called when creating new workspace
   */
  static clearAppState(): void {
    localStorage.removeItem(STATE_KEY);
  }

  /**
   * Get last opened scene ID
   */
  static getLastSceneId(): SceneId | undefined {
    return this.getAppState().lastSceneId;
  }

  /**
   * Save last opened scene ID
   */
  static saveLastSceneId(sceneId: SceneId): void {
    this.updateAppState({ lastSceneId: sceneId });
  }

  /**
   * Get persisted app mode (view/edit). Returns undefined if never set;
   * callers decide the default (typically 'edit').
   */
  static getAppMode(): AppMode | undefined {
    return this.getAppState().appMode;
  }

  /**
   * Save app mode
   */
  static saveAppMode(mode: AppMode): void {
    this.updateAppState({ appMode: mode });
  }

  /**
   * Initialize app state listener
   * Subscribes to EventBus sceneChanged to track last scene
   * Works for all entry points: goToSceneByNode, goToSceneFromPath, openScene
   */
  static initAppState(): void {
    eventBus.on('sceneChanged', ({ sceneId }) => {
      this.saveLastSceneId(sceneId);
    });
  }
}
