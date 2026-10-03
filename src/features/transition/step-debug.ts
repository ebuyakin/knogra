/**
 * Step debug
 *
 * Dev-only step-through mode for transitions: `window.transitionDebug.stepMode = true`
 * pauses a transition at each named stage until `transitionDebug.next()` is
 * called (CLAUDE.md, Diagnostics). The object is defined here and the pause
 * is awaited by the orchestrators and animators, so no layer imports upward
 * to reach it.
 */

interface TransitionDebug {
  stepMode: boolean;
  continue: (() => void) | null;
  next: () => void;
}

const transitionDebug: TransitionDebug = {
  stepMode: false,
  continue: null,
  next: () => {
    if (transitionDebug.continue) {
      transitionDebug.continue();
      transitionDebug.continue = null;
    } else {
      console.log('No transition paused. Enable step mode: window.transitionDebug.stepMode = true');
    }
  }
};

// Expose to window for console access
(window as unknown as { transitionDebug: TransitionDebug }).transitionDebug = transitionDebug;

/**
 * Pause at a step if stepMode is enabled
 * Access via window.transitionDebug in console
 */
export async function waitForStep(stageName: string): Promise<void> {
  if (!transitionDebug.stepMode) return;

  console.log(`\n⏸️  PAUSED: ${stageName}`);
  console.log(`   → Call transitionDebug.next() to continue\n`);

  return new Promise(resolve => {
    transitionDebug.continue = resolve;
  });
}
