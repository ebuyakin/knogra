/**
 * Transition Settings
 * Configuration for scene-to-scene transitions
 * 
 * Stage timing format: [duration, delayAfter] in milliseconds
 * Access via getSetting('transition.departureEdgesFadeOut') etc.
 */

/**
 * Stage timing: [duration, delayAfter] in ms
 */
type StageTiming = [number, number];

/**
 * Background behavior for auto-created scenes
 * - 'none': New scene has no background image
 * - 'fixed': Keep background from current scene, nodes move over it
 * - 'pan': Keep background, viewport pans to center new central node
 */
// export type AutoSceneBackground = 'none' | 'fixed' | 'pan'; // Unused — reserved for future

/**
 * Edge timing mode for departure phase
 * - 'before': Edges fade out before nodes fly out
 * - 'parallel': Edges fade out together with nodes
 */
export type DepartureEdgeTiming = 'before' | 'parallel';

/**
 * Background transition mode for shared movement phase
 * - 'sequential': Background fade out → nodes move → background fade in
 * - 'parallel': Background crossfades during node movement
 */
export type SharedBackgroundTiming = 'sequential' | 'parallel';

/**
 * Edge timing mode for arrival phase
 * - 'after': Edges fade in after nodes fly in
 * - 'parallel': Edges fade in together with nodes
 */
export type ArrivalEdgeTiming = 'after' | 'parallel';

/**
 * Phase 2: Shared movement timings (NEW PARALLEL MORPH)
 */
export interface MorphTimings {
  /** Total duration of the shared morph phase [duration, delayAfter] */
  morphDuration: StageTiming;
  /** Crossfade overlap percentage (0-100). 0 = sequential, 100 = full overlap */
  morphCrossfadeOverlap: number;
}

/**
 * Phase 1: Departure timings
 */
export interface DepartureTimings {
  /** Stage 1.1: Edges to departing nodes fade out */
  departureEdgesFadeOut: StageTiming;
  /** Animation duration per cascade layer (nodes at same graph distance) */
  departureLayerDuration: StageTiming;
  /** Stagger delay between cascade layers starting */
  departureLayerStagger: StageTiming;
  /** Stage 1.2.B.2: Central node zooms out (when departing) */
  departureCentralZoomOut: StageTiming;
}

/**
 * Phase 2: Background timings for shared movement
 */
export interface SharedTimings {
  /** Stage 2.1: Background fade out */
  sharedBgFadeOut: StageTiming;
  /** Stage 2.4: Background fade in */
  sharedBgFadeIn: StageTiming;
}

/**
 * Phase 3: Arrival timings
 */
export interface ArrivalTimings {
  /** Animation duration per cascade layer (nodes at same graph distance) */
  arrivalLayerDuration: StageTiming;
  /** Stagger delay between cascade layers starting */
  arrivalLayerStagger: StageTiming;
  /** Stage 3.2: Edges to new nodes fade in */
  arrivalEdgesFadeIn: StageTiming;
}

/**
 * Animation timing for scene open (initial load)
 */
export interface OpenSceneTimings {
  /** Background fade in */
  openBgFadeIn: StageTiming;
  /** Central node flies from center to position */
  openCentralFlyIn: StageTiming;
  /** Central node zooms in at position */
  openCentralZoomIn: StageTiming;
  /** Animation duration per cascade layer for node fly-in */
  openLayerDuration: StageTiming;
  /** Stagger delay between cascade layers starting */
  openLayerStagger: StageTiming;
  /** Edges fade in */
  openEdgesFadeIn: StageTiming;
}

/**
 * Animation timing for scene close (reverse of open)
 */
export interface CloseSceneTimings {
  /** Animation duration per cascade layer for node fly-out */
  closeLayerDuration: StageTiming;
  /** Stagger delay between cascade layers starting */
  closeLayerStagger: StageTiming;
  /** Central node shrinks/fades + background fades out */
  closeCentralFadeOut: StageTiming;
}

/**
 * Full transition settings
 */
export interface TransitionSettings extends DepartureTimings, SharedTimings, MorphTimings, ArrivalTimings, OpenSceneTimings, CloseSceneTimings {
  /** Transition mode: animated (full morph) or fade (quick crossfade) */
  transitionMode: 'animated' | 'fade';
  /** Phase 1: Edge timing mode */
  departureEdgeTiming: DepartureEdgeTiming;
  /** Phase 2: Background timing mode */
  sharedBackgroundTiming: SharedBackgroundTiming;
  /** Phase 3: Edge timing mode */
  arrivalEdgeTiming: ArrivalEdgeTiming;
  /** Edge animation mode for open scene */
  openEdgeMode: 'sequential' | 'parallel';
  /** Padding when fitting graph to viewport (no saved viewport) */
  openFitPadding: number;
}

/**
 * Default transition settings
 * All timings set to [1000, 1000] for debugging visibility
 */
export const TRANSITION_DEFAULTS: TransitionSettings = {
  // Transition mode
  transitionMode: 'animated',
  
  // Phase 1: Departure timings
  departureEdgesFadeOut: [500, 200],
  departureLayerDuration: [400, 0],
  departureLayerStagger: [200, 0],
  departureCentralZoomOut: [400, 200],
  
  // Phase 2: Shared Morph (PARALLEL)
  morphDuration: [700, 200],
  morphCrossfadeOverlap: 0,

  // Phase 2: Background timings
  sharedBgFadeOut: [400, 200],
  sharedBgFadeIn: [400, 200],
  
  // Phase 3: Arrival timings
  arrivalLayerDuration: [400, 0],
  arrivalLayerStagger: [200, 0],
  arrivalEdgesFadeIn: [400, 200],
  
  // Open scene timings
  openBgFadeIn: [400, 200],
  openCentralFlyIn: [400, 200],
  openCentralZoomIn: [400, 200],
  openLayerDuration: [400, 0],
  openLayerStagger: [100, 0],
  openEdgesFadeIn: [400, 200],

  // Close scene timings
  closeLayerDuration: [400, 0],
  closeLayerStagger: [100, 0],
  closeCentralFadeOut: [400, 0],
  
  // Behavior settings
  departureEdgeTiming: 'parallel',
  sharedBackgroundTiming: 'parallel',
  arrivalEdgeTiming: 'parallel',
  openEdgeMode: 'parallel',
  openFitPadding: 50
};
