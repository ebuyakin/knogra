/**
 * Auto-layout animator
 *
 * Tweens a fixed set of nodes to new positions and, optionally, re-frames the
 * viewport concurrently. Unlike scene transitions, the node set, designs, and
 * colours never change here — only coordinates.
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import type { Position } from './layout';

export interface AnimateOptions {
  animate: boolean;
  duration: number;
}

export interface ViewportTarget {
  zoom: number;
  pan: { x: number; y: number };
}

export class AutoLayoutAnimator {
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  /**
   * Move nodes to their target positions and, optionally, re-frame the viewport
   * to the new layout. When animating, both run concurrently with the same
   * timing so the whole scene glides as one movement.
   */
  async apply(
    targets: Map<NodeId, Position>,
    options: AnimateOptions,
    viewport?: ViewportTarget
  ): Promise<void> {
    if (!options.animate || options.duration <= 0) {
      for (const [nodeId, position] of targets) {
        this.#cy.getElementById(nodeId).position(position);
      }
      if (viewport) {
        this.#cy.zoom(viewport.zoom);
        this.#cy.pan(viewport.pan);
      }
      return;
    }

    const animations: Promise<void>[] = [];
    for (const [nodeId, position] of targets) {
      const node = this.#cy.getElementById(nodeId);
      if (node.length === 0) continue;
      animations.push(
        new Promise<void>(resolve => {
          node.animate(
            { position },
            { duration: options.duration, easing: 'ease-in-out', complete: () => resolve() }
          );
        })
      );
    }

    if (viewport) {
      animations.push(
        new Promise<void>(resolve => {
          this.#cy.animate(
            { zoom: viewport.zoom, pan: viewport.pan },
            { duration: options.duration, easing: 'ease-in-out', complete: () => resolve() }
          );
        })
      );
    }

    await Promise.all(animations);
  }
}
