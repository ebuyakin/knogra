/**
 * Animator registry
 *
 * The table from an animator id to its constructor, one per phase, like
 * autolayout's algorithms/registry.ts. Add an animator here plus its
 * `{ id, label }` in config/transition-settings.ts. The orchestrator is the
 * only caller and stays the creator of its Layer 2 children; an unknown id,
 * a setting left over from a removed animator, falls back to the built-in.
 */

import type { Core } from 'cytoscape';
import type { BackgroundRenderer } from '../../../background/background-renderer';
import type { ArrivalAnimator, DepartureAnimator, MorphingAnimator } from './animators';
import { DepartureFlyOut } from './departure-fly-out';
import { DepartureShrink } from './departure-shrink';
import { MorphingParallel } from './morphing-parallel';
import { ArrivalFlyIn } from './arrival-fly-in';
import { ArrivalGrow } from './arrival-grow';

const DEPARTURE: Record<string, (cy: Core) => DepartureAnimator> = {
  'fly-out': cy => new DepartureFlyOut(cy),
  shrink: cy => new DepartureShrink(cy),
};

const MORPHING: Record<string, (cy: Core, backgroundRenderer: BackgroundRenderer) => MorphingAnimator> = {
  parallel: (cy, backgroundRenderer) => new MorphingParallel(cy, backgroundRenderer),
};

const ARRIVAL: Record<string, (cy: Core) => ArrivalAnimator> = {
  'fly-in': cy => new ArrivalFlyIn(cy),
  grow: cy => new ArrivalGrow(cy),
};

export function createDepartureAnimator(id: string, cy: Core): DepartureAnimator {
  return (DEPARTURE[id] ?? DEPARTURE['fly-out'])(cy);
}

export function createMorphingAnimator(id: string, cy: Core, backgroundRenderer: BackgroundRenderer): MorphingAnimator {
  return (MORPHING[id] ?? MORPHING['parallel'])(cy, backgroundRenderer);
}

export function createArrivalAnimator(id: string, cy: Core): ArrivalAnimator {
  return (ARRIVAL[id] ?? ARRIVAL['fly-in'])(cy);
}
