/**
 * Edge Settings
 * Configuration for edge visuals and defaults
 */

/**
 * Edge settings defaults
 */
export const EDGE_DEFAULTS = {
  /** Default line color */
  defaultColor: '#7d8590',

  /** Default line opacity (0.0 - 1.0) */
  defaultOpacity: 1.0,

  /** Default line width in pixels */
  defaultWidth: 2.0,

  /** Default curve style */
  defaultCurveStyle: 'bezier',

  /** Default arrow shape */
  defaultArrowShape: 'triangle',

  /** Default arrow scale */
  defaultArrowScale: 1.0,

  /** Bezier: Default control point distances (array of numbers) */
  bezierControlDistances: [-100], // [20, -20],

  /** Bezier: Default control point weights (0.0 - 1.0) */
  bezierControlWeights: [0.5], // [0.25, 0.75],

  /** Segments: Default radius for rounded corners */
  segmentRadii: [10, 10],

  /** Taxi: Default radius for turns */
  taxiRadius: 15,

  /** Taxi: Default direction */
  taxiDirection: 'auto',
};
