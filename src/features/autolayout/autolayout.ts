/**
 * Auto-layout Feature
 *
 * Re-arranges the visible nodes of the current scene into a regular radial
 * shape rooted at the scene's (immutable) central node. A recovery action for
 * scenes that have grown messy through repeated include/exclude edits.
 *
 * Only visible nodes are repositioned; folded (hidden) nodes keep their
 * offset-based positions. Runs in Edit mode only.
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import { graphSaver } from '../../storage/graph-saver';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';
import {
  computeRadialSectorLayout,
  type LayoutInputEdge,
  type LayoutInputNode,
  type Position,
} from './layout';
import { AutoLayoutAnimator, type ViewportTarget } from './autolayout-animator';

/** Viewport padding (px) around the fitted layout, matching Scene.fit(). */
const FIT_PADDING = 50;

export class AutoLayout {
  #cy: Core;
  #animator: AutoLayoutAnimator;

  constructor(cy: Core) {
    this.#cy = cy;
    this.#animator = new AutoLayoutAnimator(cy);
  }

  /**
   * Re-arrange the current scene around its central node.
   * @param centralNodeId The scene's central node (layout root). No-op if it is
   *   missing, hidden, or the app is in View mode.
   */
  async apply(centralNodeId: NodeId | null): Promise<void> {
    if (!isEditMode()) {
      if (isDebug('d_scene')) console.log('[AutoLayout] Skipped: View mode');
      return;
    }
    if (!centralNodeId) return;

    const central = this.#cy.getElementById(centralNodeId);
    if (central.length === 0 || !central.visible()) return;

    const visibleNodes = this.#cy.nodes(':visible');
    if (visibleNodes.length <= 1) return;

    const nodes: LayoutInputNode[] = visibleNodes.map(node => {
      const box = node.boundingBox();
      return { id: node.id() as NodeId, footprint: { width: box.w, height: box.h } };
    });

    const visibleIds = new Set(nodes.map(node => node.id));
    const edges: LayoutInputEdge[] = [];
    this.#cy.edges().forEach((edge, index) => {
      const sourceId = edge.source().id() as NodeId;
      const targetId = edge.target().id() as NodeId;
      if (visibleIds.has(sourceId) && visibleIds.has(targetId)) {
        edges.push({ sourceId, targetId, order: index });
      }
    });

    const relative = computeRadialSectorLayout(nodes, edges, centralNodeId, {
      ringSpacing: getSetting('autolayout.ringSpacing'),
      siblingGap: getSetting('autolayout.siblingGap'),
    });
    if (relative.size === 0) return;

    // Anchor the layout on the central node's current position so the scene
    // does not jump (central maps to the origin in the relative layout).
    const centralPosition = central.position();
    const targets = new Map<NodeId, Position>();
    for (const [nodeId, position] of relative) {
      targets.set(nodeId, { x: centralPosition.x + position.x, y: centralPosition.y + position.y });
    }

    // Re-frame the viewport onto the final layout, animated concurrently.
    const footprints = new Map(nodes.map(node => [node.id, node.footprint]));
    const viewport = this.#computeFitViewport(targets, footprints);

    // Suspend auto-save so intermediate animation frames are not persisted,
    // then force one save of the final positions.
    const suspension = graphSaver.suspend('autolayout');
    try {
      await this.#animator.apply(
        targets,
        {
          animate: getSetting('autolayout.animate'),
          duration: getSetting('autolayout.animationDuration'),
        },
        viewport
      );
    } finally {
      graphSaver.resume(suspension);
      await graphSaver.forceSave();
    }

    if (isDebug('d_scene')) console.log(`[AutoLayout] Re-arranged ${targets.size} nodes`);
  }

  /**
   * Compute the zoom/pan that fits the final layout into the container, using
   * the same math as Cytoscape's fit so framing matches Scene.fit().
   */
  #computeFitViewport(
    targets: Map<NodeId, Position>,
    footprints: Map<NodeId, { width: number; height: number }>
  ): ViewportTarget {
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const [nodeId, position] of targets) {
      const footprint = footprints.get(nodeId);
      if (!footprint) continue;
      const halfWidth = footprint.width / 2;
      const halfHeight = footprint.height / 2;
      x1 = Math.min(x1, position.x - halfWidth);
      x2 = Math.max(x2, position.x + halfWidth);
      y1 = Math.min(y1, position.y - halfHeight);
      y2 = Math.max(y2, position.y + halfHeight);
    }

    const width = this.#cy.width();
    const height = this.#cy.height();
    const boxWidth = Math.max(1, x2 - x1);
    const boxHeight = Math.max(1, y2 - y1);

    let zoom = Math.min((width - 2 * FIT_PADDING) / boxWidth, (height - 2 * FIT_PADDING) / boxHeight);
    zoom = Math.max(this.#cy.minZoom(), Math.min(this.#cy.maxZoom(), zoom));

    return {
      zoom,
      pan: {
        x: (width - zoom * (x1 + x2)) / 2,
        y: (height - zoom * (y1 + y2)) / 2,
      },
    };
  }
}
