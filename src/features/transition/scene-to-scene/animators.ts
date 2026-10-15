/**
 * Phase animators
 *
 * A transition is three phases in a fixed order, departure, morphing,
 * arrival, and each phase can be done in more than one way
 * (docs/scene-transitions.md §4.2). An animator is one way of doing one phase:
 * a Layer 2 class implementing that phase's interface, named by the id a
 * recipe refers to (recipe.ts, animator-registry.ts). The context an animator
 * receives is the same for every implementation of its phase, so a new one is
 * written against the interface alone; the orchestrator runs the three in
 * order and knows no implementation. Types only.
 */

import type { NodeId, EdgeId, Scene } from '../../../core/main-types';
import type { ArrivalAnimatorId, DepartureAnimatorId, MorphingAnimatorId } from '../../../config/transition-settings';
import type { TargetPositions } from '../element-classification-utils';

export interface Position {
  x: number;
  y: number;
}

/**
 * Phase 1. Contract: when `run` resolves, every departing node and edge has
 * been removed from the instance.
 */
export interface DepartureAnimator {
  readonly id: DepartureAnimatorId;
  run(context: DepartureContext): Promise<void>;
}

export interface DepartureContext {
  /** Departing nodes, the old central among them when it departs. */
  nodes: NodeId[];
  edges: EdgeId[];
  currentScene: Scene;
  /** To know whether the old central departs or is shared. */
  targetScene: Scene;
  /** Fallback for a direction when the old central is not in the instance. */
  viewportCenter: Position;
}

/**
 * Phase 2. Contract: when `run` resolves, every shared node is at its target
 * position, scale and design, and the viewport is the target's. Adds nothing:
 * a new central not in the instance is an arriving node, arrival's.
 */
export interface MorphingAnimator {
  readonly id: MorphingAnimatorId;
  run(context: MorphingContext): Promise<void>;
}

export interface MorphingContext {
  /** Shared nodes. */
  nodes: NodeId[];
  currentScene: Scene;
  targetScene: Scene;
  targetPositions: TargetPositions;
  targetScales: Record<NodeId, number>;
  /** A drafted target has no viewport of its own to glide to. */
  isNewScene: boolean;
}

/**
 * Phase 3. Contract: when `run` resolves, every arriving node and edge is in
 * the instance, visible, at its target. The new central may be among the
 * arriving nodes (an MTS transition, map-view.md §8): at distance 0 it forms
 * the first cascade layer, and `addArrivingNodes` gives it its central flag.
 */
export interface ArrivalAnimator {
  readonly id: ArrivalAnimatorId;
  run(context: ArrivalContext): Promise<void>;
}

export interface ArrivalContext {
  nodes: NodeId[];
  edges: EdgeId[];
  targetScene: Scene;
  targetPositions: TargetPositions;
  /** Fallback for a direction when the new central has no target position. */
  viewportCenter: Position;
}
