/**
 * Map View Settings
 * Configuration for the map view (UI: Helicopter view). See docs/map-view.md §6.4.
 *
 * Access via getSetting('map.settingName') in config/index.ts
 */

import type { ThemeId } from '../core/main-types';

export const MAP_DEFAULTS = {
  /** Zoom of the map surface: at 1 a node is drawn at the pixel size its design specifies. The one knob for screen size. */
  baseZoom: 1,

  /** The landmark ring's vertical semi-axis as a fraction of half the surface's height. */
  ringRadius: 0.6,

  /** Factor every horizontal offset is multiplied by; the ring's horizontal semi-axis is the vertical one times this. */
  horizontalStretch: 1.7,

  /**
   * How a landmark's sector arc is shared, tangentially: the box once, then on each side a marker, the clearance and breathing space.
   * Weights, normalised; each item takes its share or its uncrowded size, whichever is smaller, and the rest is air.
   */
  arcLandmarkShare: 0.4,
  arcMarkerShare: 0.1,
  arcClearanceShare: 0.1,
  arcBreathingShare: 0.1,

  /** Clear space between a landmark's side and its markers when the sector is roomy, as a fraction of the landmark's height; the sector budget can only lower it. */
  leafClearance: 0.1,

  /** The leaf's semi-axis along the focus-to-landmark line as a multiple of its semi-axis across it; 1 is round. */
  leafAspect: 1.6,

  /** A marker's scale as a fraction of its landmark's, before crowding lowers it. */
  markerScale: 0.3,

  /** Minimum clear space between neighbouring markers of one landmark, as a fraction of their half-diagonal. */
  markerGap: 0.5,

  /** The least fraction of its default a crowded fan's scale may reach; below it, overlap is accepted. */
  scaleFloor: 0.3,

  /** The least scale a crowded landmark may reach: the readable floor, kept higher than the markers' because landmarks are the readable tier. */
  landmarkFloor: 0.6,

  /** How far a landmark may be drawn from its stored direction, in degrees, so that neighbours stay apart at the readable floor; 0 draws stored directions exactly (docs/map-view.md §3). */
  landmarkDeviation: 30,

  /** How far the two ends of an edge may diverge from exact opposition, in degrees; 0 makes them rigid (docs/map-view.md I2). */
  twinAllowance: 30,

  /** A reset of directions keeps the boxes' angular order at each parent, re-spacing them evenly; off seeds afresh with no regard to order (docs/map-view.md §5.3). */
  resetKeepsOrder: true,

  /** Rendered scale of a ballooned box; any box drawn below it balloons on click. Transient; the stored scale is untouched. */
  previewScale: 1,

  /** A line's stroke width and arrow scale are multiplied by its box's scale to this power: 1 keeps lines proportional to their boxes, 0 leaves them at scene weight; line weight is perceived sublinearly, so a half. */
  lineScalePower: 0.5,

  /** 'fixed': every map uses themeId. 'scene': the theme of the focus's own scene. */
  themeMode: 'scene' as 'fixed' | 'scene',
  themeId: 'dark' as ThemeId,

  animate: true,

  /** Re-focus phases (ms): leaving markers slide into parents, everything moves, new markers slide out. */
  departDuration: 300,
  moveDuration: 1000,
  arriveDuration: 300,
  /** Pause between phases (ms). Zero for the real thing; raise it to watch the phases one by one. */
  phasePause: 100,
};
