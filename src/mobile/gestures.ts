/**
 * Gestures (docs/mobile-viewer.md §7, §8, §10.2)
 *
 * What a touch means, wired once here.
 *
 * On the map surface:
 *   tap a small box         balloon it; any other balloon collapses
 *   tap the ballooned box   collapse it
 *   tap empty surface       collapse it
 *   double tap a landmark   travel; a balloon on it is released into the move
 *
 * A tap on a box counts once the double-tap interval has passed without a
 * second tap, so a double tap leaves the balloon alone and only travels.
 *
 * During a quiz a hidden box answers differently: the first tap selects it
 * (Cytoscape's own selection), the second reveals it and balloons it if it is
 * small; a double tap on it reveals rather than travels. A hidden box never
 * balloons masked.
 *
 * A landmark can also be dragged, to feel it, to peek under it, to clear room
 * on a crowded map; it stays where it is dropped until the next travel
 * (phone-map.ts). Cytoscape tells a tap from a drag by whether the finger
 * moved.
 *
 * On the strip of panes, the swipe: a finger that starts inside the screen
 * (not in the edge strips, which are the phone's own back and forward) and
 * moves mostly sideways from its first movement drags the strip and flips a
 * pane if it went far enough. A finger that moves mostly up or down is a
 * scroll and the strip does not move; the browser keeps that gesture
 * (`touch-action: pan-y` on the notes body). A finger that has hold of a box
 * is dragging the box, and the strip stays.
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../core/main-types';
import type { PhoneMap } from './phone-map';
import type { PhoneQuiz } from './quiz';
import type { Panes } from './panes';

/** Pixels at each side of the screen left to the phone's own gestures. */
const EDGE_STRIP_PX = 24;
/** Movement before a gesture is judged sideways or not. */
const JUDGE_AFTER_PX = 8;

export function wireMapGestures(cy: Core, map: PhoneMap, quiz: PhoneQuiz): void {
  /** The box the last tap landed on, so the next tap on it is a second tap. */
  let lastTapped: string | null = null;
  map.subscribe(() => {
    lastTapped = null;
  });

  const isHidden = (elementId: string): boolean => {
    const nodeId = map.nodeOf(elementId);
    return quiz.isActive() && nodeId !== null && quiz.statusOf(nodeId) === 'hidden';
  };

  const revealAndBalloon = (elementId: string): void => {
    const nodeId = map.nodeOf(elementId);
    if (nodeId === null) return;
    quiz.reveal(nodeId);
    if (map.needsBalloon(elementId) && !map.isBallooned(elementId)) map.toggleBalloon(elementId);
  };

  // The empty surface has no double tap, so a tap there acts at once.
  cy.on('tap', event => {
    if (map.isTravelling() || event.target !== cy) return;
    lastTapped = null;
    map.collapseBalloon();
  });

  // A box answers to 'onetap', which Cytoscape fires only after the double-tap interval has passed
  // with no second tap. On 'tap' the two taps of a double tap ballooned the box and collapsed it
  // again before the travel started (seen 2026-10-21).
  cy.on('onetap', 'node', event => {
    if (map.isTravelling()) return;
    const elementId = event.target.id() as string;
    const secondTap = lastTapped === elementId;
    lastTapped = elementId;
    if (isHidden(elementId)) {
      if (secondTap) revealAndBalloon(elementId);
      return;
    }
    if (map.needsBalloon(elementId) || map.isBallooned(elementId)) map.toggleBalloon(elementId);
  });

  cy.on('dbltap', 'node', event => {
    const elementId = event.target.id() as string;
    if (isHidden(elementId)) {
      revealAndBalloon(elementId);
      return;
    }
    if (event.target.data('depth') !== 1) return;
    void map.focusOn(event.target.data('nodeId') as NodeId);
  });
}

type SwipeState = 'idle' | 'judging' | 'swiping';

/** `isHeld` says whether the finger has hold of a box on the map; such a gesture is the box's drag, not a swipe. */
export function wirePaneSwipe(strip: HTMLElement, panes: Panes, isHeld: () => boolean): void {
  let state: SwipeState = 'idle';
  let pointerId = -1;
  let startX = 0;
  let startY = 0;

  const finish = (dx: number): void => {
    if (state === 'swiping') panes.release(dx, panes.paneWidth());
    state = 'idle';
    pointerId = -1;
  };

  strip.addEventListener('pointerdown', event => {
    if (state !== 'idle' || !event.isPrimary) return;
    const width = panes.paneWidth();
    if (event.clientX < EDGE_STRIP_PX || event.clientX > width - EDGE_STRIP_PX) return;
    state = 'judging';
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
  });

  strip.addEventListener('pointermove', event => {
    if (state === 'idle' || event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (state === 'judging') {
      if (Math.hypot(dx, dy) < JUDGE_AFTER_PX) return;
      if (Math.abs(dx) <= Math.abs(dy) || isHeld()) {
        // A scroll (the browser's) or a box's drag (the map's): this gesture is over for the strip.
        state = 'idle';
        pointerId = -1;
        return;
      }
      state = 'swiping';
    }
    panes.drag(dx);
  });

  strip.addEventListener('pointerup', event => {
    if (event.pointerId === pointerId) finish(event.clientX - startX);
  });
  strip.addEventListener('pointercancel', event => {
    if (event.pointerId === pointerId) finish(0);
  });

  // Once a gesture is judged sideways, the browser must not turn it into a scroll of the notes
  // body halfway through (which would cancel the pointer): the touch events are refused from then on.
  strip.addEventListener('touchmove', event => {
    if (state === 'swiping') event.preventDefault();
  }, { passive: false });
}
