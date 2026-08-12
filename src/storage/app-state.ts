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

import type { AppMode, EdgeTypeId, PathId, SceneId } from '../core/main-types';
import { STATE_KEY } from '../config/storage-config';
import { eventBus } from '../events/event-bus';

// ============================================================================
// TYPES
// ============================================================================

interface AppState {
  lastSceneId?: SceneId;
  /** Persisted app mode (view/edit). Absent → default 'edit' on read. */
  appMode?: AppMode;
  /** One-shot request to fit a scene after it is opened on startup. */
  fitSceneOnNextOpen?: SceneId;
  /** Last selected edge type id (persisted for new-edge default) */
  lastEdgeTypeId?: EdgeTypeId;
  /**
   * Saved path being walked in path mode, and the cursor position within it.
   * Absent → history mode. Both are written together and validated on restore:
   * a path or scene that no longer exists silently falls back to history mode,
   * since a stale session is not worth interrupting startup for.
   */
  pathId?: PathId;
  pathIndex?: number;
  /**
   * CSS-pixel size of the Cytoscape container at export time — the screen the
   * shared workspace file was authored on. Used on open to offer a
   * proportional "scale to fit" of every scene's zoom when the importing screen
   * differs. Captured in `exportWorkspace`; consumed in `importWorkspace`.
   */
  authoringContainerSize?: { w: number; h: number };
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
   * App state minus anything session-scoped, for workspace export.
   *
   * The path-mode session is excluded: it says where *this* user had got to in a
   * tour, which is meaningless in another user's workspace and actively harmful
   * there, since saved paths import with their original ids and the reference
   * would often resolve — silently starting someone else's tour.
   *
   * Kept here rather than at the export call site so the rule lives beside the
   * state definition, where a future field has to consider it.
   */
  static getExportableAppState(): Omit<AppState, 'pathId' | 'pathIndex'> {
    const { pathId: _pathId, pathIndex: _pathIndex, ...exportable } = this.getAppState();
    return exportable;
  }

  /**
   * Get the persisted path-mode session, if any.
   * Presence does not guarantee validity — the caller must confirm the path and
   * its scenes still exist before entering path mode.
   */
  static getPathSession(): { pathId: PathId; pathIndex: number } | undefined {
    const state = this.getAppState();
    if (!state.pathId) return undefined;
    return { pathId: state.pathId, pathIndex: state.pathIndex ?? 0 };
  }

  /**
   * Record the path being walked and the cursor position within it.
   */
  static savePathSession(pathId: PathId, pathIndex: number): void {
    this.updateAppState({ pathId, pathIndex });
  }

  /**
   * Drop the path-mode session — on exit, or when a restore fails validation.
   */
  static clearPathSession(): void {
    const state = this.getAppState();
    delete state.pathId;
    delete state.pathIndex;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  /**
   * Get the authoring container size (CSS pixels) recorded at last export.
   */
  static getAuthoringContainerSize(): { w: number; h: number } | undefined {
    return this.getAppState().authoringContainerSize;
  }

  /**
   * Record the current Cytoscape container size (CSS pixels) as the authoring
   * screen. Called at export time so the exported app-state carries it.
   */
  static saveAuthoringContainerSize(w: number, h: number): void {
    this.updateAppState({ authoringContainerSize: { w, h } });
  }

  /**
   * Get last used edge type id persisted in app state
   */
  static getLastEdgeTypeId(): EdgeTypeId | undefined {
    return this.getAppState().lastEdgeTypeId;
  }

  /**
   * Persist last used edge type id
   */
  static saveLastEdgeTypeId(typeId: EdgeTypeId): void {
    this.updateAppState({ lastEdgeTypeId: typeId });
  }

  /**
   * Request that the next startup fit this scene after opening it.
   */
  static requestFitOnNextOpen(sceneId: SceneId): void {
    this.updateAppState({ fitSceneOnNextOpen: sceneId });
  }

  /**
   * Consume the one-shot post-open fit request for a scene.
   */
  static consumeFitOnNextOpen(sceneId: SceneId): boolean {
    const state = this.getAppState();
    if (state.fitSceneOnNextOpen !== sceneId) return false;

    const { fitSceneOnNextOpen: _fitSceneOnNextOpen, ...rest } = state;
    localStorage.setItem(STATE_KEY, JSON.stringify(rest));
    return true;
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
