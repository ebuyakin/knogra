/**
 * Navigation History
 * Pure data structure for tracking scene navigation history
 * Enables back/forward navigation like a browser
 */

import type { SceneId } from '../../core/main-types';

export class NavigationHistory {
  #history: SceneId[] = [];
  #currentIndex: number = -1;
  #maxSize: number;

  /**
   * @param maxSize Entries retained before the oldest are dropped. Sized for
   *   walking a large workspace end to end: an author auditing a few hundred
   *   scenes should not have the start of the journey silently trimmed away.
   *   Cost is a few hundred id strings, so the limit exists only to bound
   *   unbounded growth, not to save meaningful memory.
   */
  constructor(maxSize: number = 200) {
    this.#maxSize = maxSize;
  }

  /**
   * Push a new scene to history
   * Clears any "forward" entries (like browser behavior)
   */
  push(sceneId: SceneId): void {
    // Don't push if it's the same as current
    if (this.#currentIndex >= 0 && this.#history[this.#currentIndex] === sceneId) {
      return;
    }

    // Clear forward history
    this.#history = this.#history.slice(0, this.#currentIndex + 1);
    
    // Add new entry
    this.#history.push(sceneId);
    this.#currentIndex = this.#history.length - 1;

    // Trim if exceeds max size
    if (this.#history.length > this.#maxSize) {
      this.#history.shift();
      this.#currentIndex--;
    }
  }

  /**
   * Go back in history
   * @returns Previous scene ID, or null if at beginning
   */
  back(): SceneId | null {
    if (!this.canGoBack()) {
      return null;
    }
    this.#currentIndex--;
    return this.#history[this.#currentIndex];
  }

  /**
   * Go forward in history
   * @returns Next scene ID, or null if at end
   */
  forward(): SceneId | null {
    if (!this.canGoForward()) {
      return null;
    }
    this.#currentIndex++;
    return this.#history[this.#currentIndex];
  }

  /**
   * Check if back navigation is possible
   */
  canGoBack(): boolean {
    return this.#currentIndex > 0;
  }

  /**
   * Check if forward navigation is possible
   */
  canGoForward(): boolean {
    return this.#currentIndex < this.#history.length - 1;
  }

  /**
   * Go to first item in history
   * @returns First scene ID, or null if empty
   */
  goToFirst(): SceneId | null {
    if (this.#history.length === 0) {
      return null;
    }
    this.#currentIndex = 0;
    return this.#history[0];
  }

  /**
   * Go to last item in history
   * @returns Last scene ID, or null if empty
   */
  goToLast(): SceneId | null {
    if (this.#history.length === 0) {
      return null;
    }
    this.#currentIndex = this.#history.length - 1;
    return this.#history[this.#currentIndex];
  }

  /**
   * Jump to an absolute position without altering the sequence.
   *
   * Used by breadcrumb clicks. Distinct from `push()`, which would treat the
   * jump as new travel and discard everything after it.
   *
   * @returns Scene ID at that index, or null if out of range
   */
  goToIndex(index: number): SceneId | null {
    if (index < 0 || index >= this.#history.length) {
      return null;
    }
    this.#currentIndex = index;
    return this.#history[index];
  }

  /**
   * Get current scene ID
   */
  current(): SceneId | null {
    if (this.#currentIndex < 0) {
      return null;
    }
    return this.#history[this.#currentIndex];
  }

  /**
   * Get the full history array (for UI display)
   */
  getHistory(): SceneId[] {
    return [...this.#history];
  }

  /**
   * Get current index in history (for UI highlighting)
   */
  getCurrentIndex(): number {
    return this.#currentIndex;
  }

  /**
   * Replace history with a saved path
   * Used when loading a saved path
   */
  loadPath(scenes: SceneId[], currentSceneId?: SceneId): void {
    this.#history = [...scenes];
    if (currentSceneId) {
      const index = this.#history.indexOf(currentSceneId);
      this.#currentIndex = index >= 0 ? index : this.#history.length - 1;
    } else {
      this.#currentIndex = this.#history.length - 1;
    }
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.#history = [];
    this.#currentIndex = -1;
  }

  /**
   * Get history length (for debugging)
   */
  get length(): number {
    return this.#history.length;
  }

  /**
   * Get current index (for debugging)
   */
  get index(): number {
    return this.#currentIndex;
  }
}
