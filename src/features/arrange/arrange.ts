/**
 * Arrange feature
 *
 * Selection-scoped geometric arrangement of nodes — the counterpart to the
 * scene-scoped, central-node-anchored `autolayout` operations. It moves only
 * `node:selected`, anchors on the selection's own geometry (never on the
 * scene's central node — centrality is a semantic property, not a geometric
 * one), leaves every other node and the viewport untouched, and does not reset
 * edge curves (edges re-render to their moved endpoints; manual bends stay the
 * user's to fix). Runs in Edit mode only.
 *
 * The geometry itself is pluggable: each tool is a pure function registered in
 * `tools/registry.ts`. This class owns everything that is not geometry — the
 * Edit-mode guard, reading the selection out of Cytoscape, the minimum-count
 * check, the animation, and persistence. See docs/layout-architecture.md §1.1
 * for the terminology and how this family relates to auto-layout.
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import { graphSaver } from '../../storage/graph-saver';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';
import { NodePositionAnimator } from '../utils/cy/node-position-animator';
import { listTools, minimumSelection, resolveTool } from './tools/registry';
import type { ArrangeNode, ArrangeTool, ArrangeToolId } from './tools/types';

/** Arrangement glide timing. A quick nudge — no dedicated settings surface yet. */
const ARRANGE_ANIMATION_DURATION = 200;

export class Arrange {
  #cy: Core;
  #animator: NodePositionAnimator;

  /**
   * One run at a time: a tool must read settled positions, never a half-finished
   * glide. A request arriving mid-run is held here and applied when the current
   * one lands.
   */
  #inFlight = false;
  #pending: { toolId: ArrangeToolId; repeats: number } | null = null;

  constructor(cy: Core) {
    this.#cy = cy;
    this.#animator = new NodePositionAnimator(cy);
  }

  /**
   * Apply one arrange tool to the current selection.
   * No-op outside Edit mode, below the tool's `minNodes`, or when the tool
   * reports a degenerate input.
   *
   * Repeated presses are coalesced. Consecutive requests for the *same* tool
   * accumulate (N presses of Spread yield exactly N steps, each computed from
   * settled positions — no drift); a request for a different tool replaces the
   * pending one, so rapid mixed presses resolve to the last one.
   */
  async run(toolId: ArrangeToolId): Promise<void> {
    if (!isEditMode()) {
      if (isDebug('d_scene')) console.log('[Arrange] Skipped: View mode');
      return;
    }

    if (this.#inFlight) {
      this.#pending = this.#pending?.toolId === toolId
        ? { toolId, repeats: this.#pending.repeats + 1 }
        : { toolId, repeats: 1 };
      if (isDebug('d_scene')) console.log(`[Arrange] Coalesced: ${toolId} ×${this.#pending.repeats} pending`);
      return;
    }

    this.#inFlight = true;
    try {
      let next: { toolId: ArrangeToolId; repeats: number } | null = { toolId, repeats: 1 };
      while (next) {
        await this.#runOnce(next.toolId, next.repeats);
        next = this.#pending;
        this.#pending = null;
      }
    } finally {
      this.#inFlight = false;
      this.#pending = null;
    }
  }

  /**
   * One tool application, animated to completion.
   * @param repeats Coalesced press count; folded into the multiplicative
   *   spacing step so N presses compose exactly. Tools without a composable
   *   knob ignore it — re-running them would be idempotent anyway.
   */
  async #runOnce(toolId: ArrangeToolId, repeats: number): Promise<void> {
    const tool = resolveTool(toolId);
    const selected = this.#cy.nodes(':selected:visible');
    if (selected.length < tool.minNodes) {
      if (isDebug('d_scene')) console.log(`[Arrange] ${toolId} skipped: need ≥${tool.minNodes} selected nodes`);
      return;
    }

    const nodes: ArrangeNode[] = selected.map(node => {
      const box = node.boundingBox();
      const { x, y } = node.position();
      return {
        id: node.id() as NodeId,
        position: { x, y },
        footprint: { width: box.w, height: box.h },
      };
    });

    // Ring-fitting knobs are shared with auto-layout on purpose: a circle uses
    // the identical circumference rule as a radial ring, so a user who tightened
    // their rings expects circles to tighten with them.
    const targets = tool.compute({
      nodes,
      params: {
        siblingGap: getSetting('autolayout.siblingGap'),
        footprintScale: getSetting('autolayout.footprintScale'),
        spacingStep: getSetting('arrange.spacingStep') ** repeats,
      },
    });
    if (targets.size === 0) return;

    // Selection-scoped nudge: suspend auto-save across the glide, then persist
    // the final positions once. Edges and viewport are intentionally untouched.
    const suspension = graphSaver.suspend('arrange');
    try {
      await this.#animator.apply(targets, {
        animate: true,
        duration: ARRANGE_ANIMATION_DURATION,
      });
    } finally {
      graphSaver.resume(suspension);
      await graphSaver.forceSave();
    }

    if (isDebug('d_scene')) console.log(`[Arrange] ${toolId}: moved ${targets.size} nodes`);
  }

  /** Every available tool, in display order — lets the UI build menus itself. */
  tools(): readonly ArrangeTool[] {
    return listTools();
  }

  /** Selection size as the tools see it, so the UI enables entries consistently. */
  selectionSize(): number {
    return this.#cy.nodes(':selected:visible').length;
  }

  /** Smallest selection any tool can act on — the gate for the whole submenu. */
  minimumSelection(): number {
    return minimumSelection();
  }
}
