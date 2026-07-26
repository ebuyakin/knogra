/**
 * Path Cursor
 *
 * Position within a fixed, immutable sequence of scenes — the backing structure
 * for path mode (paths-architecture §14.7).
 *
 * The contrast with `NavigationHistory` is the whole point: history *records*
 * where the user went and rewrites itself as they travel (pushing truncates the
 * forward entries, and the oldest entries fall off a size cap). A cursor
 * *replays* a sequence someone already committed to. It exposes no way to add,
 * remove, or reorder scenes, so a loaded path cannot be damaged by navigating
 * it — the defect that motivated the two-mode split.
 *
 * Editing a saved path is a deliberate act performed in the path manager, which
 * writes to the store and hands back a new sequence.
 */

import type { SceneId } from '../../core/main-types';

export class PathCursor {
  readonly #scenes: readonly SceneId[];
  #index: number;

  /**
   * @param scenes Sequence to walk. Copied defensively — later mutation of the
   *   caller's array must not shift the cursor underneath us.
   * @param startIndex Initial position; clamped into range.
   */
  constructor(scenes: readonly SceneId[], startIndex: number = 0) {
    this.#scenes = [...scenes];
    this.#index = this.#clamp(startIndex);
  }

  /** Scene at the cursor, or `null` when the sequence is empty. */
  current(): SceneId | null {
    if (this.#scenes.length === 0) return null;
    return this.#scenes[this.#index];
  }

  /** Copy of the full sequence, for rendering. */
  getScenes(): SceneId[] {
    return [...this.#scenes];
  }

  getCurrentIndex(): number {
    return this.#scenes.length === 0 ? -1 : this.#index;
  }

  get length(): number {
    return this.#scenes.length;
  }

  canGoBack(): boolean {
    return this.#index > 0;
  }

  canGoForward(): boolean {
    return this.#index < this.#scenes.length - 1;
  }

  /** Step back one scene. Returns the new scene, or `null` at the start. */
  back(): SceneId | null {
    if (!this.canGoBack()) return null;
    this.#index--;
    return this.#scenes[this.#index];
  }

  /** Step forward one scene. Returns the new scene, or `null` at the end. */
  forward(): SceneId | null {
    if (!this.canGoForward()) return null;
    this.#index++;
    return this.#scenes[this.#index];
  }

  goToFirst(): SceneId | null {
    if (this.#scenes.length === 0) return null;
    this.#index = 0;
    return this.#scenes[0];
  }

  goToLast(): SceneId | null {
    if (this.#scenes.length === 0) return null;
    this.#index = this.#scenes.length - 1;
    return this.#scenes[this.#index];
  }

  /**
   * Jump to an absolute position — the breadcrumb-click path.
   * Returns `null` when the index is out of range, leaving the cursor put.
   */
  goToIndex(index: number): SceneId | null {
    if (this.#scenes.length === 0) return null;
    if (index < 0 || index >= this.#scenes.length) return null;
    this.#index = index;
    return this.#scenes[index];
  }

  /**
   * Move to the first occurrence of `sceneId`.
   * Returns `false` when the scene is not part of this path, so callers can tell
   * "moved" from "not mine" without inspecting indices.
   */
  goToScene(sceneId: SceneId): boolean {
    const index = this.#scenes.indexOf(sceneId);
    if (index < 0) return false;
    this.#index = index;
    return true;
  }

  includes(sceneId: SceneId): boolean {
    return this.#scenes.includes(sceneId);
  }

  #clamp(index: number): number {
    if (this.#scenes.length === 0) return 0;
    return Math.max(0, Math.min(index, this.#scenes.length - 1));
  }
}
