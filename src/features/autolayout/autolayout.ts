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
import type { NodeId, EdgeId } from '../../core/main-types';
import { graphSaver } from '../../storage/graph-saver';
import { graphStore } from '../../storage/graph-store';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';
import { StyleGenerator } from '../../styles/style-generator';
import { pickCurveParams, pickVisualParams } from '../../styles/edge-visual-resolver';
import type { LayoutInputEdge, LayoutInputNode, Position } from './algorithms/types';
import { resolveLayout } from './algorithms/registry';
import { AutoLayoutAnimator } from './autolayout-animator';
import { computeFitViewport } from './fit';
import { computeNeighbourhoodBall, seedEntrants, growEntrants, readCurrentThemeId } from './grow-arrange';

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
      const pos = node.position();
      return {
        id: node.id() as NodeId,
        footprint: { width: box.w, height: box.h },
        currentPos: { x: pos.x, y: pos.y },
      };
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

    const relative = resolveLayout(getSetting('autolayout.layoutType')).compute({
      nodes,
      edges,
      centralId: centralNodeId,
      params: {
        ringSpacing: getSetting('autolayout.ringSpacing'),
        siblingGap: getSetting('autolayout.siblingGap'),
        footprintScale: getSetting('autolayout.footprintScale'),
        ringOrder: getSetting('autolayout.ringOrder'),
      },
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
    const viewport = computeFitViewport(targets, footprints, this.#cy);

    // Suspend auto-save so intermediate animation frames are not persisted,
    // then force one save of the final positions.
    const suspension = graphSaver.suspend('autolayout');
    try {
      // The new radial layout invalidates every hand-tuned edge path, so reset
      // each affected edge's curve to the default automatic bezier. Visual
      // style overrides are preserved.
      const affectedEdgeIds: EdgeId[] = this.#cy.edges()
        .filter(edge => visibleIds.has(edge.source().id() as NodeId) && visibleIds.has(edge.target().id() as NodeId))
        .map(edge => edge.id() as EdgeId);
      this.#resetEdgeCurves(affectedEdgeIds);

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
   * Rigidly rotate the visible scene about the central node's current position.
   *
   * A pure affine transform (not a layout algorithm): every visible node orbits
   * the pivot by `degrees` (positive = clockwise on screen), so relative geometry
   * is preserved. Manual edge curves therefore rotate correctly on their own —
   * no reset — and the bounding circle about the pivot is unchanged, so no
   * viewport re-fit. Folded/hidden nodes keep their offsets. Edit mode only.
   *
   * @param centralNodeId The scene's central node (rotation pivot).
   * @param degrees Rotation step in degrees; positive rotates clockwise.
   */
  async rotate(centralNodeId: NodeId | null, degrees: number): Promise<void> {
    if (!isEditMode()) {
      if (isDebug('d_scene')) console.log('[AutoLayout] Rotate skipped: View mode');
      return;
    }
    if (!centralNodeId || degrees === 0) return;

    const central = this.#cy.getElementById(centralNodeId);
    if (central.length === 0 || !central.visible()) return;

    const pivot = central.position();
    const theta = (degrees * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    const targets = new Map<NodeId, Position>();
    this.#cy.nodes(':visible').forEach(node => {
      const nodeId = node.id() as NodeId;
      if (nodeId === centralNodeId) return;
      const { x, y } = node.position();
      const dx = x - pivot.x;
      const dy = y - pivot.y;
      targets.set(nodeId, {
        x: pivot.x + dx * cos - dy * sin,
        y: pivot.y + dx * sin + dy * cos,
      });
    });
    if (targets.size === 0) return;

    const suspension = graphSaver.suspend('autolayout');
    try {
      await this.#animator.apply(targets, {
        animate: getSetting('autolayout.animate'),
        duration: getSetting('autolayout.animationDuration'),
      });
    } finally {
      graphSaver.resume(suspension);
      await graphSaver.forceSave();
    }

    if (isDebug('d_scene')) console.log(`[AutoLayout] Rotated ${targets.size} nodes by ${degrees}°`);
  }

  /**
   * Change the scene's density about the central node without touching per-node
   * `scale`. Every visible node's position scales by `factor` about the central
   * node's current position (`factor > 1` spreads, `< 1` tightens), while the
   * viewport zooms by `1/factor` about the same on-screen point. The net effect:
   * every node stays put on screen and only the node glyphs shrink/grow, so the
   * scene is de-crowded/packed in place, anchored on the central node (which may
   * sit off the geometric centre by design).
   *
   * A pure similarity transform (not a layout algorithm): no registry dispatch,
   * no viewport re-fit, and edges are left untouched so their curves re-render
   * to the new endpoints (hand-tuned bends stay adjustable). Because the pivot
   * is the fixed central node and the zoom is not clamped, `1/factor` exactly
   * reverses `factor` — the opposite command restores the prior positions and
   * framing. Folded/hidden nodes keep their offsets, matching `rotate`. Edit
   * mode only.
   *
   * @param centralNodeId The scene's central node (scaling pivot).
   * @param factor Multiplicative density step; >1 spreads, <1 tightens.
   */
  async scaleScene(centralNodeId: NodeId | null, factor: number): Promise<void> {
    if (!isEditMode()) {
      if (isDebug('d_scene')) console.log('[AutoLayout] Scale skipped: View mode');
      return;
    }
    if (!centralNodeId || factor <= 0 || factor === 1) return;

    const central = this.#cy.getElementById(centralNodeId);
    if (central.length === 0 || !central.visible()) return;

    const pivot = central.position();

    const targets = new Map<NodeId, Position>();
    this.#cy.nodes(':visible').forEach(node => {
      const nodeId = node.id() as NodeId;
      if (nodeId === centralNodeId) return;
      const { x, y } = node.position();
      targets.set(nodeId, {
        x: pivot.x + (x - pivot.x) * factor,
        y: pivot.y + (y - pivot.y) * factor,
      });
    });
    if (targets.size === 0) return;

    // Zoom by the inverse about the central node's screen position: pin the
    // pivot on screen so the scene de-crowds/packs in place. `pan' = pan +
    // pivot·(z - z')` keeps `pivot·zoom + pan` invariant.
    const zoom = this.#cy.zoom();
    const pan = this.#cy.pan();
    const newZoom = zoom / factor;
    const viewport = {
      zoom: newZoom,
      pan: {
        x: pan.x + pivot.x * (zoom - newZoom),
        y: pan.y + pivot.y * (zoom - newZoom),
      },
    };

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

    if (isDebug('d_scene')) console.log(`[AutoLayout] Scaled scene of ${targets.size} nodes by ${factor}`);
  }

  /**
   * Grow the current scene by its central node's degree-≤`degree` neighbourhood,
   * then radial-arrange the enlarged scene. New nodes emerge from the centre and
   * settle into place while existing nodes glide and the camera re-fits — a
   * single "unfolding" gesture. Add-only: nodes already in the scene are kept.
   * Each entrant brings only its generative edge (to its BFS predecessor); use
   * Include-all-scene-edges (Shift+S) afterwards for cross-links. Edit mode only.
   *
   * @param centralNodeId The scene's central node (layout root).
   * @param degree Neighbourhood radius in hops (1, 2, or 3).
   */
  async growAndArrange(centralNodeId: NodeId | null, degree: number): Promise<void> {
    if (!isEditMode()) {
      if (isDebug('d_scene')) console.log('[AutoLayout] Grow skipped: View mode');
      return;
    }
    if (!centralNodeId) return;

    const central = this.#cy.getElementById(centralNodeId);
    if (central.length === 0 || !central.visible()) return;

    // 1. Degree-≤N ball from the central node; keep only nodes not yet present.
    const { entrantIds, generativeEdges } = computeNeighbourhoodBall(
      centralNodeId,
      degree,
      graphStore.edges,
      getSetting('autolayout.growDirection')
    );
    const newEntrantIds = entrantIds.filter(id => this.#cy.getElementById(id).length === 0);

    // Nothing new to include → a plain re-arrange is the right behaviour.
    if (newEntrantIds.length === 0) {
      await this.apply(centralNodeId);
      return;
    }

    // 2. Hub safety: confirm before pulling in a large number of nodes.
    const threshold = getSetting('autolayout.growConfirmThreshold');
    if (
      newEntrantIds.length > threshold &&
      !window.confirm(`This will add ${newEntrantIds.length} nodes to the scene. Continue?`)
    ) {
      return;
    }

    const centralPosition = central.position();

    // Existing (pre-seed) visible nodes and their footprints for the union layout.
    const existingNodes: LayoutInputNode[] = this.#cy.nodes(':visible').map(node => {
      const box = node.boundingBox();
      return { id: node.id() as NodeId, footprint: { width: box.w, height: box.h } };
    });

    const suspension = graphSaver.suspend('autolayout:grow');
    try {
      // 3. Seed entrants: add + measure, then shrink to size 0 / opacity 0.
      const themeId = await readCurrentThemeId(this.#cy);
      const seed = await seedEntrants(this.#cy, newEntrantIds, generativeEdges, centralPosition, themeId);

      // 4. Union layout over existing + entrants.
      const nodes: LayoutInputNode[] = [...existingNodes];
      for (const [id, footprint] of seed.footprints) nodes.push({ id, footprint });
      const unionIds = new Set(nodes.map(node => node.id));

      const edges: LayoutInputEdge[] = [];
      this.#cy.edges().forEach((edge, index) => {
        const sourceId = edge.source().id() as NodeId;
        const targetId = edge.target().id() as NodeId;
        if (unionIds.has(sourceId) && unionIds.has(targetId)) edges.push({ sourceId, targetId, order: index });
      });

      const relative = resolveLayout(getSetting('autolayout.layoutType')).compute({
        nodes,
        edges,
        centralId: centralNodeId,
        params: {
          ringSpacing: getSetting('autolayout.ringSpacing'),
          siblingGap: getSetting('autolayout.siblingGap'),
          footprintScale: getSetting('autolayout.footprintScale'),
        },
      });
      if (relative.size === 0) return;

      const allTargets = new Map<NodeId, Position>();
      for (const [id, position] of relative) {
        allTargets.set(id, { x: centralPosition.x + position.x, y: centralPosition.y + position.y });
      }

      // Split targets: existing nodes glide (animator), entrants grow.
      const entrantSet = new Set(newEntrantIds);
      const existingTargets = new Map<NodeId, Position>();
      const entrantTargets = new Map<NodeId, Position>();
      for (const [id, position] of allTargets) {
        (entrantSet.has(id) ? entrantTargets : existingTargets).set(id, position);
      }

      // Viewport frames the whole union.
      const footprints = new Map(nodes.map(node => [node.id, node.footprint]));
      const viewport = computeFitViewport(allTargets, footprints, this.#cy);

      // Reset curves of every edge among the union (incl. new generative edges).
      const affectedEdgeIds: EdgeId[] = this.#cy.edges()
        .filter(edge => unionIds.has(edge.source().id() as NodeId) && unionIds.has(edge.target().id() as NodeId))
        .map(edge => edge.id() as EdgeId);
      this.#resetEdgeCurves(affectedEdgeIds);

      const options = {
        animate: getSetting('autolayout.animate'),
        duration: getSetting('autolayout.animationDuration'),
      };

      if (options.animate && options.duration > 0) {
        await Promise.all([
          this.#animator.apply(existingTargets, options, viewport),
          growEntrants(this.#cy, entrantTargets, centralPosition, seed, options.duration),
        ]);
      } else {
        // No animation: place everything and reveal the entrants immediately.
        await this.#animator.apply(allTargets, { animate: false, duration: 0 }, viewport);
        for (const [id] of entrantTargets) {
          const node = this.#cy.getElementById(id);
          const visual = seed.visuals.get(id);
          if (node.length > 0 && visual) node.style({ width: visual.width, height: visual.height, opacity: 1 });
        }
        for (const edgeId of seed.edgeIds) this.#cy.getElementById(edgeId).style('opacity', 1);
      }
    } finally {
      graphSaver.resume(suspension);
      await graphSaver.forceSave();
    }

    if (isDebug('d_scene')) console.log(`[AutoLayout] Grew ${newEntrantIds.length} nodes at degree ${degree}`);
  }

  /**
   * Reset the curve/layout override of the given edges to the default automatic
   * bezier, dropping any dedicated `curve` data and stripping legacy curve keys
   * embedded in `design.params` (old workspaces). Visual overrides are kept.
   * Mutates cy data and per-edge stylesheet rules directly — the same cy-level
   * work the rest of auto-layout performs.
   */
  #resetEdgeCurves(edgeIds: EdgeId[]): void {
    let stylesheet = (this.#cy.style() as any).json();
    let changed = false;
    for (const edgeId of edgeIds) {
      const cyEdge = this.#cy.getElementById(edgeId);
      if (cyEdge.length === 0) continue;

      cyEdge.removeData('curve');
      const design = cyEdge.data('design');
      if (design?.params && Object.keys(pickCurveParams(design.params)).length > 0) {
        cyEdge.data('design', { id: design.id, params: pickVisualParams(design.params) });
      }

      const sceneEdge = { design: cyEdge.data('design'), curve: undefined };
      stylesheet = StyleGenerator.applyEdgeOverrideToStylesheet(stylesheet, edgeId, sceneEdge);
      changed = true;
    }

    if (changed) this.#cy.style().fromJson(stylesheet).update();
  }
}
