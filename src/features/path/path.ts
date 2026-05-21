/**
 * Path Feature
 * Manages navigation history and path-related operations
 * 
 * Listens to: cy.on('scene:changed')
 * Emits: cy.emit('path:updated')
 */

import type { Core } from 'cytoscape';
import type { SceneId } from '../../core/main-types';
import { NavigationHistory } from './history';

export class Path {
  #cy: Core;
  #history: NavigationHistory;

  constructor(cy: Core) {
    this.#cy = cy;
    this.#history = new NavigationHistory();
    
    // Listen for scene changes from transition feature
    // Cytoscape emit passes extra args as array elements after event
    this.#cy.on('scene:changed', (_event, sceneId: SceneId) => {
      this.#history.push(sceneId);
      this.#emitUpdated();
    });
  }

  /**
   * Initialize history with starting scene
   * Called once on app startup
   */
  init(sceneId: SceneId): void {
    this.#history.push(sceneId);
    this.#emitUpdated();
  }

  /**
   * Reset history and start fresh from a scene
   * Used by Home button to restart navigation
   */
  reset(sceneId: SceneId): void {
    this.#history.clear();
    this.#history.push(sceneId);
    this.#emitUpdated();
  }

  /**
   * Navigate back in history
   * @returns Scene ID navigated to, or null if at beginning
   */
  back(): SceneId | null {
    const sceneId = this.#history.back();
    if (sceneId) {
      this.#emitUpdated();
    }
    return sceneId;
  }

  /**
   * Navigate forward in history
   * @returns Scene ID navigated to, or null if at end
   */
  forward(): SceneId | null {
    const sceneId = this.#history.forward();
    if (sceneId) {
      this.#emitUpdated();
    }
    return sceneId;
  }

  /**
   * Check if back navigation is possible
   */
  canGoBack(): boolean {
    return this.#history.canGoBack();
  }

  /**
   * Check if forward navigation is possible
   */
  canGoForward(): boolean {
    return this.#history.canGoForward();
  }

  /**
   * Go to first item in history
   * @returns First scene ID, or null if empty
   */
  goToFirst(): SceneId | null {
    const sceneId = this.#history.goToFirst();
    if (sceneId) {
      this.#emitUpdated();
    }
    return sceneId;
  }

  /**
   * Go to last item in history
   * @returns Last scene ID, or null if empty
   */
  goToLast(): SceneId | null {
    const sceneId = this.#history.goToLast();
    if (sceneId) {
      this.#emitUpdated();
    }
    return sceneId;
  }

  /**
   * Get current scene ID from history
   */
  current(): SceneId | null {
    return this.#history.current();
  }

  /**
   * Get the full history array (for UI display)
   */
  getHistory(): SceneId[] {
    return this.#history.getHistory();
  }

  /**
   * Get current index in history (for UI highlighting)
   */
  getCurrentIndex(): number {
    return this.#history.getCurrentIndex();
  }

  /**
   * Load a saved path into history
   */
  loadPath(scenes: SceneId[], currentSceneId?: SceneId): void {
    this.#history.loadPath(scenes, currentSceneId);
    this.#emitUpdated();
  }

  /**
   * Emit path:updated event for UI to react
   */
  #emitUpdated(): void {
    this.#cy.emit('path:updated');
  }
}
