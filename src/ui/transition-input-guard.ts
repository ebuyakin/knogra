/**
 * TransitionInputGuard
 * 
 * Blocks all user input during scene transitions to prevent
 * accidental interactions that could corrupt graph state.
 * 
 * Uses capture phase to intercept events before other handlers.
 */

import { eventBus } from '../events/event-bus';

export class TransitionInputGuard {
  #isTransitioning: boolean = false;
  #boundHandler: ((e: Event) => void) | null = null;

  constructor() {
    eventBus.on('transitionStart', () => this.#onTransitionStart());
    eventBus.on('transitionEnd', () => this.#onTransitionEnd());
  }

  #onTransitionStart(): void {
    if (this.#isTransitioning) return;
    this.#isTransitioning = true;
    
    this.#boundHandler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    const opts: AddEventListenerOptions = { capture: true };
    document.addEventListener('keydown', this.#boundHandler, opts);
    document.addEventListener('mousedown', this.#boundHandler, opts);
    document.addEventListener('wheel', this.#boundHandler, opts);
    document.addEventListener('touchstart', this.#boundHandler, opts);
  }

  #onTransitionEnd(): void {
    if (!this.#isTransitioning) return;
    this.#isTransitioning = false;
    
    if (this.#boundHandler) {
      const opts: AddEventListenerOptions = { capture: true };
      document.removeEventListener('keydown', this.#boundHandler, opts);
      document.removeEventListener('mousedown', this.#boundHandler, opts);
      document.removeEventListener('wheel', this.#boundHandler, opts);
      document.removeEventListener('touchstart', this.#boundHandler, opts);
      this.#boundHandler = null;
    }
  }

  destroy(): void {
    this.#onTransitionEnd();
  }
}
