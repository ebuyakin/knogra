/**
 * ShelfInteractionGuard
 *
 * Prevents user commands from disrupting an in-flight AI-suggestion shelf
 * animation. Two levels of blocking:
 *
 * - **Full block** — used while an *Add-from-shelf* or *Remove-from-shelf*
 *   command executes (these mutate the scene). Swallows all user input via
 *   capture-phase listeners, the same technique the scene-transition guard uses,
 *   and marks the shelf busy so its own commands are refused too.
 * - **Shelf-only block** — used while the shelf merely re-arranges after a scene
 *   change or an AI addition. Marks the shelf busy (its commands are refused) but
 *   leaves the rest of the app fully interactive.
 *
 * Deliberately independent of `TransitionInputGuard`: the scene-transition path
 * is delicate and well-tested, and the shelf's two-level model does not fit that
 * single-level guard. A sibling regime, not a shared one
 * (see docs/architecture.md §3.10).
 */

export class ShelfInteractionGuard {
  #busy = false;
  #globalBlockActive = false;
  #swallow: ((e: Event) => void) | null = null;
  #onBusyChange: ((busy: boolean) => void) | null = null;

  /** True while any shelf animation is running; shelf commands must be refused. */
  isBusy(): boolean {
    return this.#busy;
  }

  /** Observe busy-state transitions, e.g. to reflect the block visually. */
  onBusyChange(listener: (busy: boolean) => void): void {
    this.#onBusyChange = listener;
  }

  /**
   * Run a scene-mutating shelf command (Add / Remove) under a full input block
   * for the whole execution, released when it settles. Callers must gate re-entry
   * with `isBusy()` first.
   */
  async runFullyBlocked(operation: () => Promise<void>): Promise<void> {
    this.#setBusy(true);
    this.#attachGlobalBlock();
    try {
      await operation();
    } finally {
      this.#detachGlobalBlock();
      this.#setBusy(false);
    }
  }

  /**
   * Run a shelf re-arrangement (post-transition / AI addition): only shelf
   * commands are refused; the rest of the app stays interactive.
   */
  async runShelfBlocked(operation: () => Promise<void>): Promise<void> {
    this.#setBusy(true);
    try {
      await operation();
    } finally {
      this.#setBusy(false);
    }
  }

  #setBusy(value: boolean): void {
    if (this.#busy === value) return;
    this.#busy = value;
    this.#onBusyChange?.(value);
  }

  #attachGlobalBlock(): void {
    if (this.#globalBlockActive) return;
    this.#globalBlockActive = true;
    this.#swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const opts: AddEventListenerOptions = { capture: true };
    document.addEventListener('keydown', this.#swallow, opts);
    document.addEventListener('mousedown', this.#swallow, opts);
    document.addEventListener('wheel', this.#swallow, opts);
    document.addEventListener('touchstart', this.#swallow, opts);
  }

  #detachGlobalBlock(): void {
    if (!this.#globalBlockActive || !this.#swallow) return;
    const opts: AddEventListenerOptions = { capture: true };
    document.removeEventListener('keydown', this.#swallow, opts);
    document.removeEventListener('mousedown', this.#swallow, opts);
    document.removeEventListener('wheel', this.#swallow, opts);
    document.removeEventListener('touchstart', this.#swallow, opts);
    this.#swallow = null;
    this.#globalBlockActive = false;
  }
}
