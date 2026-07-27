/**
 * Node alignment feature
 *
 * Aligns the centres of the currently selected nodes onto a common line — a
 * precision layout aid distinct from the scene-wide, central-node-anchored
 * `autolayout` operations. Selection-scoped, not scene-scoped: it moves only
 * `node:selected`, leaves every other node and the viewport untouched, and does
 * not reset edge curves (edges re-render to their moved endpoints; manual bends
 * stay the user's to fix). Runs in Edit mode only.
 *
 * Three alignments, all operating on node centres:
 *  - Row      — share a common Y (mean of centres): nodes form a horizontal row.
 *  - Column   — share a common X (mean of centres): nodes form a vertical column.
 *  - Diagonal — the min-X and max-X nodes fix a line; the nodes in between are
 *               orthogonally projected onto it (both X and Y move).
 */

import type { Core, Position } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import { graphSaver } from '../../storage/graph-saver';
import { isEditMode } from '../../storage/app-mode';
import { isDebug } from '../../config/debug-flags';
import { NodePositionAnimator } from '../utils/cy/node-position-animator';

/** Alignment glide timing. A quick nudge — no dedicated settings surface yet. */
const ALIGN_ANIMATION_DURATION = 200;

export class Align {
  #cy: Core;
  #animator: NodePositionAnimator;

  constructor(cy: Core) {
    this.#cy = cy;
    this.#animator = new NodePositionAnimator(cy);
  }

  /** Align selected node centres onto a common Y (mean). Needs ≥2 selected. */
  async row(): Promise<void> {
    await this.#align('row');
  }

  /** Align selected node centres onto a common X (mean). Needs ≥2 selected. */
  async column(): Promise<void> {
    await this.#align('column');
  }

  /**
   * Project the selected nodes onto the line through the min-X and max-X nodes.
   * Those two endpoints stay put; the nodes between them move onto the line.
   * Needs ≥3 selected (fewer is a no-op — 2 nodes already define the line).
   */
  async diagonal(): Promise<void> {
    await this.#align('diagonal');
  }

  async #align(mode: 'row' | 'column' | 'diagonal'): Promise<void> {
    if (!isEditMode()) {
      if (isDebug('d_scene')) console.log('[Align] Skipped: View mode');
      return;
    }

    const selected = this.#cy.nodes(':selected:visible');
    const minCount = mode === 'diagonal' ? 3 : 2;
    if (selected.length < minCount) {
      if (isDebug('d_scene')) console.log(`[Align] Skipped: need ≥${minCount} selected nodes`);
      return;
    }

    const positions = new Map<NodeId, Position>();
    selected.forEach(node => {
      const { x, y } = node.position();
      positions.set(node.id() as NodeId, { x, y });
    });

    const targets = mode === 'diagonal'
      ? this.#diagonalTargets(positions)
      : this.#axisTargets(positions, mode);
    if (!targets || targets.size === 0) return;

    // Selection-scoped nudge: suspend auto-save across the glide, then persist
    // the final positions once. Edges and viewport are intentionally untouched.
    const suspension = graphSaver.suspend('align');
    try {
      await this.#animator.apply(targets, {
        animate: true,
        duration: ALIGN_ANIMATION_DURATION,
      });
    } finally {
      graphSaver.resume(suspension);
      await graphSaver.forceSave();
    }

    if (isDebug('d_scene')) console.log(`[Align] ${mode}: aligned ${targets.size} nodes`);
  }

  /** Row/Column: every node adopts the mean centre coordinate on the shared axis. */
  #axisTargets(positions: Map<NodeId, Position>, mode: 'row' | 'column'): Map<NodeId, Position> {
    let sum = 0;
    for (const pos of positions.values()) {
      sum += mode === 'row' ? pos.y : pos.x;
    }
    const mean = sum / positions.size;

    const targets = new Map<NodeId, Position>();
    for (const [nodeId, pos] of positions) {
      targets.set(nodeId, mode === 'row' ? { x: pos.x, y: mean } : { x: mean, y: pos.y });
    }
    return targets;
  }

  /** Diagonal: orthogonally project every node onto the min-X → max-X line. */
  #diagonalTargets(positions: Map<NodeId, Position>): Map<NodeId, Position> | null {
    let start: Position | null = null;
    let end: Position | null = null;
    for (const pos of positions.values()) {
      if (!start || pos.x < start.x) start = pos;
      if (!end || pos.x > end.x) end = pos;
    }
    if (!start || !end) return null;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return null; // endpoints coincide — no line to align to

    const targets = new Map<NodeId, Position>();
    for (const [nodeId, pos] of positions) {
      const t = ((pos.x - start.x) * dx + (pos.y - start.y) * dy) / lengthSq;
      targets.set(nodeId, { x: start.x + t * dx, y: start.y + t * dy });
    }
    return targets;
  }
}
