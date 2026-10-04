/**
 * Transition recipe
 *
 * Which animator does each phase of a transition: three ids, plain data
 * (docs/scene-transitions.md §4.2). A caller may name any phase; what it
 * leaves out comes from the user's settings, the default recipe. The
 * orchestrator resolves the recipe once per transition and hands the ids to
 * the registry; an id the registry does not know falls back to the built-in
 * there, so a stale setting never fails a transition.
 */

import type { ArrivalAnimatorId, DepartureAnimatorId, MorphingAnimatorId } from '../../../config/transition-settings';
import { getSetting } from '../../../config';

export interface TransitionRecipe {
  departure: DepartureAnimatorId;
  morphing: MorphingAnimatorId;
  arrival: ArrivalAnimatorId;
}

export function resolveRecipe(override?: Partial<TransitionRecipe>): TransitionRecipe {
  return {
    departure: override?.departure ?? getSetting('transition.departureAnimator'),
    morphing: override?.morphing ?? getSetting('transition.morphingAnimator'),
    arrival: override?.arrival ?? getSetting('transition.arrivalAnimator'),
  };
}
