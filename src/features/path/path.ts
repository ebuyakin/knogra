/**
 * Path Feature
 *
 * Owns scene-sequence navigation in two modes (paths-architecture §14):
 *
 *  - **history** — free travel. Records where the user goes, browser-style:
 *    navigating truncates the forward entries. Backed by `NavigationHistory`.
 *  - **path** — replay of a saved path. The sequence is immutable; only a cursor
 *    moves. Backed by `PathCursor`.
 *
 * The public read/move API is mode-agnostic: callers ask for the sequence, the
 * current index, and step through it, without knowing which mode is active. That
 * is what lets the panel and keyboard handler stay mode-blind.
 *
 * This feature also *owns* path mode, so it owns the announcement of it. Entering
 * or leaving emits `pathModeChanged`, which Transition and Graph use to guard
 * their own entry points (architecture §3.10). It deliberately does not call
 * those features — features must not import each other (architecture §4.2).
 *
 * Listens to: cy.on('scene:changed')
 * Emits: cy.emit('path:updated'), eventBus 'pathModeChanged'
 */

import type { Core } from 'cytoscape';
import type { NodeId, Path as SavedPath, PathId, SceneId } from '../../core/main-types';
import { eventBus } from '../../events/event-bus';
import { graphStore } from '../../storage/graph-store';
import { pathStore } from '../../storage/path-store';
import { AppStateManager } from '../../storage/app-state';
import { NavigationHistory } from './history';
import { PathCursor } from './path-cursor';
import { generateFullPath } from './full-path';

export type PathMode = 'history' | 'path';

export class Path {
  #cy: Core;
  #history: NavigationHistory;
  /** Non-null exactly when mode is 'path'. */
  #cursor: PathCursor | null = null;
  #activePathId: PathId | null = null;
  #activePathName: string | null = null;

  constructor(cy: Core) {
    this.#cy = cy;
    this.#history = new NavigationHistory();

    // Listen for scene changes from transition feature
    // Cytoscape emit passes extra args as array elements after event
    this.#cy.on('scene:changed', (_event, sceneId: SceneId) => {
      this.#onSceneChanged(sceneId);
    });
  }

  // ==========================================================================
  // MODE
  // ==========================================================================

  getMode(): PathMode {
    return this.#cursor ? 'path' : 'history';
  }

  isPathMode(): boolean {
    return this.#cursor !== null;
  }

  /** Name of the path being walked, for UI labelling. */
  getActivePathName(): string | null {
    return this.#activePathName;
  }

  getActivePathId(): PathId | null {
    return this.#activePathId;
  }

  /**
   * Enter path mode on a saved path.
   * @returns the scene to display, or null if the path has no scenes.
   */
  enterPathMode(path: SavedPath, startIndex: number = 0): SceneId | null {
    if (path.scenes.length === 0) return null;

    this.#cursor = new PathCursor(path.scenes, startIndex);
    this.#activePathId = path.id as PathId;
    this.#activePathName = path.name;

    this.#persistSession();
    this.#announceMode();
    this.#emitUpdated();

    return this.#cursor.current();
  }

  /**
   * Leave path mode. The path becomes the new history with the cursor position
   * preserved, so travel continues from where the tour was left rather than
   * snapping elsewhere. The saved path record is untouched.
   */
  exitPathMode(): void {
    if (!this.#cursor) return;

    const scenes = this.#cursor.getScenes();
    const index = this.#cursor.getCurrentIndex();

    this.#cursor = null;
    this.#activePathId = null;
    this.#activePathName = null;

    this.#history.loadPath(scenes, scenes[index]);

    AppStateManager.clearPathSession();
    this.#announceMode();
    this.#emitUpdated();
  }

  /**
   * Restore a persisted path-mode session on startup (§17).
   * Validates that the path and the recorded scene still exist; on any failure
   * clears the session and stays in history mode.
   *
   * @returns the scene to open, or null when there is nothing to restore.
   */
  restoreSession(): SceneId | null {
    const session = AppStateManager.getPathSession();
    if (!session) return null;

    const path = pathStore.getPath(session.pathId);
    if (!path || path.scenes.length === 0) {
      AppStateManager.clearPathSession();
      return null;
    }

    const sceneId = path.scenes[session.pathIndex];
    if (!sceneId || !graphStore.scenes.some(s => s.id === sceneId)) {
      AppStateManager.clearPathSession();
      return null;
    }

    return this.enterPathMode(path, session.pathIndex);
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Seed history with the starting scene. Called once on app startup, and only
   * in history mode — a restored path session already has its position.
   */
  init(sceneId: SceneId): void {
    if (this.#cursor) return;
    this.#history.push(sceneId);
    this.#emitUpdated();
  }

  /**
   * Reset history and start fresh from a scene
   * Used by Home button to restart navigation.
   * Only meaningful in history mode; path mode must be exited first.
   */
  reset(sceneId: SceneId): void {
    if (this.#cursor) return;
    this.#history.clear();
    this.#history.push(sceneId);
    this.#emitUpdated();
  }

  // ==========================================================================
  // MOVEMENT — mode-agnostic
  // ==========================================================================

  /**
   * Navigate back one scene
   * @returns Scene ID navigated to, or null if at beginning
   */
  back(): SceneId | null {
    return this.#move(() => this.#cursor!.back(), () => this.#history.back());
  }

  /**
   * Navigate forward one scene
   * @returns Scene ID navigated to, or null if at end
   */
  forward(): SceneId | null {
    return this.#move(() => this.#cursor!.forward(), () => this.#history.forward());
  }

  goToFirst(): SceneId | null {
    return this.#move(() => this.#cursor!.goToFirst(), () => this.#history.goToFirst());
  }

  goToLast(): SceneId | null {
    return this.#move(() => this.#cursor!.goToLast(), () => this.#history.goToLast());
  }

  /**
   * Jump to an absolute position in the current sequence — the breadcrumb-click
   * path. In history mode this repositions the cursor without truncating the
   * forward entries, which a `push` would.
   */
  goToIndex(index: number): SceneId | null {
    return this.#move(
      () => this.#cursor!.goToIndex(index),
      () => this.#history.goToIndex(index)
    );
  }

  canGoBack(): boolean {
    return this.#cursor ? this.#cursor.canGoBack() : this.#history.canGoBack();
  }

  canGoForward(): boolean {
    return this.#cursor ? this.#cursor.canGoForward() : this.#history.canGoForward();
  }

  current(): SceneId | null {
    return this.#cursor ? this.#cursor.current() : this.#history.current();
  }

  /** The active sequence — saved path in path mode, visited scenes in history mode. */
  getHistory(): SceneId[] {
    return this.#cursor ? this.#cursor.getScenes() : this.#history.getHistory();
  }

  /**
   * Get current index in the active sequence (for UI highlighting)
   */
  getCurrentIndex(): number {
    return this.#cursor ? this.#cursor.getCurrentIndex() : this.#history.getCurrentIndex();
  }

  // ==========================================================================
  // SAVED PATHS — persistence facade (§15.2)
  // ==========================================================================

  listSaved(): SavedPath[] {
    return pathStore.getAllPaths();
  }

  getSaved(pathId: PathId): SavedPath | undefined {
    return pathStore.getPath(pathId);
  }

  /** Persist the current history as a new named path. */
  async saveHistoryAs(name: string): Promise<PathId> {
    return pathStore.createPath(name, this.getHistory());
  }

  /**
   * Persist edits to a saved path.
   *
   * Refuses the path currently being walked: `PathCursor` holds its own copy of
   * the sequence, so a reorder underneath it would leave the breadcrumbs and the
   * stored record disagreeing, and the persisted cursor index pointing at the
   * wrong scene. A walked path is immutable (§14.2) — exit first.
   *
   * @returns false if the update was refused.
   */
  async updateSaved(path: SavedPath): Promise<boolean> {
    if (path.id === this.#activePathId) {
      console.warn('[Path] Cannot edit the path being walked — exit path mode first');
      return false;
    }

    await pathStore.updatePath(path);
    return true;
  }

  /**
   * Delete a saved path.
   *
   * Unlike `updateSaved`, deleting the walked path is allowed: exiting first
   * leaves a coherent state (the sequence becomes plain history), whereas an edit
   * would leave the cursor holding a sequence that no longer matches the store.
   */
  async deleteSaved(pathId: PathId): Promise<void> {
    if (pathId === this.#activePathId) {
      this.exitPathMode();
    }
    await pathStore.deletePath(pathId);
  }

  // ==========================================================================
  // GENERATION (§16)
  // ==========================================================================

  /**
   * Order every scene in the workspace into a single readable sequence — a
   * depth-first walk of the graph, projected onto the scenes that exist.
   *
   * Reads `graphStore` here so the caller passes nothing: a feature reading the
   * store is permitted (architecture §4.2) and keeps graph-shaped arguments out
   * of the UI layer.
   */
  generateFullPath(): SceneId[] {
    return generateFullPath(
      graphStore.nodes,
      graphStore.edges,
      graphStore.scenes,
      this.#rootNodeIdForGeneration()
    );
  }

  /**
   * Persist a generated sequence, recording the workspace scene count so the
   * manager can later flag the path as a stale snapshot (§15.3).
   */
  async saveGeneratedPath(name: string, scenes: SceneId[]): Promise<PathId> {
    const pathId = await pathStore.createPath(name, scenes);
    const created = pathStore.getPath(pathId);
    if (created) {
      await pathStore.updatePath({
        ...created,
        generatedSceneCount: graphStore.scenes.length,
      });
    }
    return pathId;
  }

  /**
   * Preferred traversal root: the anchor node, else the current scene's central
   * node, else let the generator pick the oldest node.
   */
  #rootNodeIdForGeneration(): NodeId | null {
    const anchor = graphStore.nodes.find(n => n.isAnchor);
    if (anchor) return anchor.id;

    const currentSceneId = this.#cy.scratch('currentSceneId') as SceneId | undefined;
    const currentScene = currentSceneId
      ? graphStore.scenes.find(s => s.id === currentSceneId)
      : undefined;
    return currentScene?.centralNodeId ?? null;
  }

  // ==========================================================================
  // INTERNALS
  // ==========================================================================

  /**
   * A scene change arrived from the Transition feature.
   *
   * History mode records it. Path mode only tracks the cursor if the scene is
   * part of the path — and since graph-initiated navigation is blocked in path
   * mode, the only changes seen here are the path's own movements.
   */
  #onSceneChanged(sceneId: SceneId): void {
    if (this.#cursor) {
      if (this.#cursor.goToScene(sceneId)) {
        this.#persistSession();
        this.#emitUpdated();
      }
      return;
    }

    this.#history.push(sceneId);
    this.#emitUpdated();
  }

  /**
   * Apply a movement to whichever structure is active, notifying only if the
   * position actually changed.
   */
  #move(onCursor: () => SceneId | null, onHistory: () => SceneId | null): SceneId | null {
    const sceneId = this.#cursor ? onCursor() : onHistory();
    if (!sceneId) return null;

    if (this.#cursor) this.#persistSession();
    this.#emitUpdated();
    return sceneId;
  }

  #persistSession(): void {
    if (!this.#cursor || !this.#activePathId) return;
    AppStateManager.savePathSession(this.#activePathId, this.#cursor.getCurrentIndex());
  }

  /** Broadcast mode so enforcement and affordance subscribers can react. */
  #announceMode(): void {
    eventBus.emit('pathModeChanged', {
      active: this.#cursor !== null,
      pathId: this.#activePathId,
      name: this.#activePathName,
    });
  }

  /**
   * Emit path:updated event for UI to react
   */
  #emitUpdated(): void {
    this.#cy.emit('path:updated');
  }
}
