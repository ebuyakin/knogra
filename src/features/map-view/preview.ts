/**
 * Preview — the balloon
 *
 * A clicked box drawn below the preview scale, a marker or a landmark that
 * crowding shrank, tweens its rendered size to the preview scale about its
 * own centre, raised above its neighbours, and tweens back when collapsed
 * (docs/map-view.md §5.3). A box near the edge of the surface is also nudged
 * inward just enough for the balloon to stay wholly on screen, and nudged back
 * on collapse. An inline, transient change, the mechanism grow-arrange uses
 * for entrants: the box's stored scale and its layout position are untouched
 * and nothing is written.
 */

import type { Core, NodeSingular } from 'cytoscape';
import type { Position } from './geometry';
import { scaledSize, type BoxBaseStyle } from './render';

const BALLOON_DURATION_MS = 150;
/** Above every other box while ballooned; boxes otherwise share the default. */
const BALLOON_Z_INDEX = 1000;
/** Clear space a balloon keeps from the surface's edge, in graph units. */
const EDGE_MARGIN = 8;

export class MarkerPreview {
  #cy: Core;
  #elementId: string | null = null;
  /** Where the ballooned box sat before it was nudged inward; where collapse returns it. */
  #restPosition: Position | null = null;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  get elementId(): string | null {
    return this.#elementId;
  }

  balloon(elementId: string, baseStyle: BoxBaseStyle, previewScale: number): void {
    this.collapse(baseStyle, previewScale);
    const node = this.#cy.getElementById(elementId) as NodeSingular;
    if (node.length === 0) return;

    const size = scaledSize(baseStyle, previewScale);
    const rest = { ...node.position() };
    node.style('z-index', BALLOON_Z_INDEX);
    node.animate({ style: size, position: this.#withinSurface(rest, size) }, { duration: BALLOON_DURATION_MS, easing: 'ease-out' });
    this.#elementId = elementId;
    this.#restPosition = rest;
  }

  /** Tween back to the box's own size and place, then hand size back to the stylesheet rule. */
  collapse(baseStyle: BoxBaseStyle, scale: number): void {
    if (this.#elementId === null) return;
    const node = this.#cy.getElementById(this.#elementId) as NodeSingular;
    const rest = this.#restPosition;
    this.#elementId = null;
    this.#restPosition = null;
    if (node.length === 0) return;

    node.stop();
    node.animate(
      { style: scaledSize(baseStyle, scale), ...(rest ? { position: { x: rest.x, y: rest.y } } : {}) },
      { duration: BALLOON_DURATION_MS, easing: 'ease-in', complete: () => node.removeStyle('width height z-index') }
    );
  }

  /** Forget without animating, for when the elements are about to go. */
  reset(): void {
    this.#elementId = null;
    this.#restPosition = null;
  }

  /** Forget and drop the raising, leaving the ballooned size and place for a re-focus tween to start from. */
  release(): void {
    if (this.#elementId === null) return;
    const node = this.#cy.getElementById(this.#elementId);
    this.#elementId = null;
    this.#restPosition = null;
    if (node.length === 0) return;
    node.stop();
    node.removeStyle('z-index');
  }

  /** The centre moved the least that keeps a box of `size` inside the visible surface, with a margin; the centre itself when it already fits. */
  #withinSurface(centre: Position, size: { width: number; height: number }): Position {
    const extent = this.#cy.extent();
    const clamp = (value: number, low: number, high: number): number => (low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value)));
    return {
      x: clamp(centre.x, extent.x1 + size.width / 2 + EDGE_MARGIN, extent.x2 - size.width / 2 - EDGE_MARGIN),
      y: clamp(centre.y, extent.y1 + size.height / 2 + EDGE_MARGIN, extent.y2 - size.height / 2 - EDGE_MARGIN),
    };
  }
}
