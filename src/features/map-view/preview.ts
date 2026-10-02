/**
 * Preview — the balloon
 *
 * A clicked box drawn below the preview scale, a marker or a landmark that
 * crowding shrank, tweens its rendered size to the preview scale about its
 * own centre, raised above its neighbours, and tweens back when collapsed
 * (docs/map-view.md §5.3). An inline, transient size change, the mechanism
 * grow-arrange uses for entrants: the box's stored scale is untouched and
 * nothing is written.
 */

import type { Core } from 'cytoscape';
import { scaledSize, type BoxBaseStyle } from './render';

const BALLOON_DURATION_MS = 150;
/** Above every other box while ballooned; boxes otherwise share the default. */
const BALLOON_Z_INDEX = 1000;

export class MarkerPreview {
  #cy: Core;
  #elementId: string | null = null;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  get elementId(): string | null {
    return this.#elementId;
  }

  balloon(elementId: string, baseStyle: BoxBaseStyle, previewScale: number): void {
    this.collapse(baseStyle, previewScale);
    const node = this.#cy.getElementById(elementId);
    if (node.length === 0) return;

    node.style('z-index', BALLOON_Z_INDEX);
    node.animate({ style: scaledSize(baseStyle, previewScale) }, { duration: BALLOON_DURATION_MS, easing: 'ease-out' });
    this.#elementId = elementId;
  }

  /** Tween back to the box's own size, then hand size back to the stylesheet rule. */
  collapse(baseStyle: BoxBaseStyle, scale: number): void {
    if (this.#elementId === null) return;
    const node = this.#cy.getElementById(this.#elementId);
    this.#elementId = null;
    if (node.length === 0) return;

    node.stop();
    node.animate(
      { style: scaledSize(baseStyle, scale) },
      { duration: BALLOON_DURATION_MS, easing: 'ease-in', complete: () => node.removeStyle('width height z-index') }
    );
  }

  /** Forget without animating, for when the elements are about to go. */
  reset(): void {
    this.#elementId = null;
  }

  /** Forget and drop the raising, leaving the ballooned size in place for a re-focus tween to start from. */
  release(): void {
    if (this.#elementId === null) return;
    const node = this.#cy.getElementById(this.#elementId);
    this.#elementId = null;
    if (node.length === 0) return;
    node.stop();
    node.removeStyle('z-index');
  }
}
