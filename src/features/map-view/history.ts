/**
 * Map history
 *
 * Back and forward over the focuses visited since the map was entered
 * (docs/map-view.md §5.2). Map-local and session-only; scene paths do not
 * record map visits. Every entry is one hop from its neighbours, since
 * navigation is one degree at a time, so stepping is an ordinary re-focus.
 */

import type { NodeId } from '../../core/main-types';

export class MapHistory {
  #entries: NodeId[] = [];
  #index = -1;

  /** Start over from the focus the map was entered on. */
  reset(focusNodeId: NodeId): void {
    this.#entries = [focusNodeId];
    this.#index = 0;
  }

  /** Record a new focus, discarding anything ahead of the current position. */
  push(focusNodeId: NodeId): void {
    this.#entries = this.#entries.slice(0, this.#index + 1);
    this.#entries.push(focusNodeId);
    this.#index = this.#entries.length - 1;
  }

  canGoBack(): boolean {
    return this.#index > 0;
  }

  canGoForward(): boolean {
    return this.#index < this.#entries.length - 1;
  }

  back(): NodeId | null {
    if (!this.canGoBack()) return null;
    this.#index -= 1;
    return this.#entries[this.#index];
  }

  forward(): NodeId | null {
    if (!this.canGoForward()) return null;
    this.#index += 1;
    return this.#entries[this.#index];
  }
}
