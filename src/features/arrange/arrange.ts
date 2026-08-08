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

import type { Core, Position } from 'cytoscape';
import type { NodeId, SceneId } from '../../core/main-types';
import { graphSaver } from '../../storage/graph-saver';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';
import { NodePositionAnimator } from '../utils/cy/node-position-animator';
import { listTools, minimumSelection, resolveTool } from './tools/registry';
import type { ArrangeNode, ArrangeTool, ArrangeToolId } from './tools/types';

/** Arrangement glide timing. A quick nudge — no dedicated settings surface yet. */
const ARRANGE_ANIMATION_DURATION = 200;

/** How far a node may sit from where the last arrangement left it and still
 *  count as untouched. Absorbs tween rounding, nothing more. */
const UNDO_POSITION_TOLERANCE = 0.5;

/**
 * The single armed undo. `after` is what makes this work without any state
 * monitoring: comparing it against live positions at the moment the menu is
 * built answers "has anything happened since?" — a drag, a delete, an
 * auto-layout, another arrangement — with one loop and no event listeners.
 */
interface ArrangeUndo {
  sceneId: SceneId;
  /** Where the nodes were before the arrangement — what undo restores. */
  before: Map<NodeId, Position>;
  /** Where the arrangement put them — the validity fingerprint. */
  after: Map<NodeId, Position>;
}

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

  /**
   * Positions to restore if the user immediately regrets the last arrangement.
   * One slot, no history: this is a get-out-of-a-misclick, not an undo stack.
   * Overwritten by the next arrangement, consumed by `undo`, and validated at
   * read time rather than invalidated by events (see `#isUndoValid`).
   */
  #undoable: ArrangeUndo | null = null;

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
   * @param repeats Coalesced press count, folded into whichever step knob the
   *   tool composes on — multiplicatively for spacing, additively for rotation —
   *   so N presses compose exactly. Tools without a composable knob ignore it;
   *   re-running them would be idempotent anyway.
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
        rotationDegrees: getSetting('arrange.rotateStep') * repeats,
      },
    });
    if (targets.size === 0) return;

    // Arm undo before moving anything — but only for tools the user cannot
    // simply reverse with the opposite command.
    if (!tool.selfReversible) this.#armUndo(nodes, targets);

    await this.#applyPositions(targets);

    if (isDebug('d_scene')) console.log(`[Arrange] ${toolId}: moved ${targets.size} nodes`);
  }

  /**
   * Move nodes and persist once. Auto-save is suspended across the glide so the
   * intermediate frames are not written; edges and viewport are left alone.
   */
  async #applyPositions(targets: Map<NodeId, Position>): Promise<void> {
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
  }

  /** Record the pre-arrangement positions of exactly the nodes about to move. */
  #armUndo(nodes: ArrangeNode[], targets: Map<NodeId, Position>): void {
    // Node positions are per-scene, so an undo replayed in a different scene
    // would write these coordinates into the wrong layout. Without a scene to
    // pin the snapshot to, don't arm it at all.
    const sceneId = this.#cy.scratch('currentSceneId') as SceneId | undefined;
    if (!sceneId) return;

    const before = new Map<NodeId, Position>();
    for (const node of nodes) {
      if (targets.has(node.id)) before.set(node.id, { ...node.position });
    }
    this.#undoable = { sceneId, before, after: new Map(targets) };
  }

  /**
   * True while the scene is exactly as the last arrangement left it. Everything
   * that should retire the offer — a manual drag, a deletion, a fold, an
   * auto-layout, a scene change, a later arrangement — shows up here as a
   * mismatch, so nothing has to watch for those events happening.
   *
   * One accepted quirk: leaving the scene and returning restores the arranged
   * positions from storage, so the offer comes back. It stays correct — it is
   * still that scene's pre-arrangement layout — only later than expected.
   */
  #isUndoValid(entry: ArrangeUndo): boolean {
    if (this.#cy.scratch('currentSceneId') !== entry.sceneId) return false;

    for (const [nodeId, arranged] of entry.after) {
      const node = this.#cy.getElementById(nodeId);
      if (node.length === 0 || !node.visible()) return false;
      const current = node.position();
      if (Math.abs(current.x - arranged.x) > UNDO_POSITION_TOLERANCE) return false;
      if (Math.abs(current.y - arranged.y) > UNDO_POSITION_TOLERANCE) return false;
    }
    return true;
  }

  /** Whether the UI should offer "Undo arrange" right now. */
  canUndo(): boolean {
    return this.#undoable !== null && this.#isUndoValid(this.#undoable);
  }

  /**
   * Restore the positions the last arrangement replaced. Single-shot: the slot
   * is consumed whether or not the user arranges again afterwards.
   */
  async undo(): Promise<void> {
    if (!isEditMode()) return;
    if (this.#inFlight) return;

    const entry = this.#undoable;
    if (!entry || !this.#isUndoValid(entry)) return;
    this.#undoable = null;

    this.#inFlight = true;
    try {
      await this.#applyPositions(entry.before);
    } finally {
      this.#inFlight = false;
      // An arrange requested mid-undo is dropped rather than applied to the
      // positions the user has just reverted.
      this.#pending = null;
    }

    if (isDebug('d_scene')) console.log(`[Arrange] Undo: restored ${entry.before.size} nodes`);
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
