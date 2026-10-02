/**
 * Map View feature (UI: Helicopter view)
 *
 * One derived map per node: every edge keeps one bearing across the whole
 * graph, so moving the focus never rotates anything. The map has its own
 * Cytoscape instance on its own surface (`#map`, created by main.ts like the
 * scene's), shown over the scene while active, so nothing wired to the scene
 * instance ever sees a map element (docs/map-view.md §7). This class owns
 * show and hide, re-focusing, the adjustments, and the lookups other features
 * need to be hosted on the map (§7.5); the map's content comes from the
 * feature-local modules.
 *
 * On the map an element id is opaque, not a node id, and a node may have
 * several boxes. Anything that hosts on the map goes through `boxesOf` and
 * `nodeOf`. The instance is private: the UI layer receives it from main.ts,
 * as it receives the scene's, never from here.
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';
import { mapStore } from '../../storage/map-store';
import { isEditMode } from '../../storage/app-mode';
import { eventBus } from '../../events/event-bus';
import { getSetting } from '../../config';
import { NODE_SCALE_MAX, NODE_SCALE_MIN } from '../../config/node-settings';
import { getTheme } from '../../styles/themes';
import { isDebug } from '../../config/debug-flags';
import { buildMapTree, firstLineByAddress, lastNodeOfAddress, linesOfBoxes, type Address } from './map-tree';
import { layoutMapTree, pairKeyOf, siblingEnds, type MapAdjustments, type MapGeometryParams, type Size } from './geometry';
import { ensureBearings } from './seeding';
import {
  addElements,
  ensureBaseStyles,
  lineBases,
  lineWeights,
  removeElements,
  renderMap,
  restyleBoxes,
  restyleLines,
  updateBoxData,
  updateLineData,
  type BoxBaseStyle,
  type MapElementIds,
  type MapRenderInput,
} from './render';
import { wireDragging, type DragRelease, type MapState } from './interaction';
import { MarkerPreview } from './preview';
import { MapHistory } from './history';
import { arrive, depart, move, planRefocus, settle, staleLineIds, type LineTween } from './refocus-animator';

/** `F` returns to the base frame with a short glide rather than a jump. */
const REFRAME_DURATION_MS = 200;

/** A line whose weight changes by less than this on re-focus is left alone rather than tweened. */
const WEIGHT_TOLERANCE = 0.01;

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

function invert(ids: MapElementIds): Map<string, Address> {
  return new Map([...ids.boxes].map(([address, elementId]) => [elementId, address]));
}

/** Everything derived for a focus before it touches the instance. */
interface DerivedMap {
  state: Omit<MapState, 'ids' | 'addressByElementId'>;
  render: MapRenderInput;
}

export class MapView {
  #cy: Core;
  #state: MapState | null = null;
  #preview: MarkerPreview;
  #history = new MapHistory();
  /** A re-focus is animating; clicks arriving meanwhile are ignored rather than queued. */
  #refocusing = false;

  constructor(cy: Core) {
    this.#cy = cy;
    this.#preview = new MarkerPreview(cy);
    wireDragging(cy, () => this.#state, release => this.#persistDrag(release));
    eventBus.on('appModeChanged', () => this.#applyGrabbability());
  }

  isActive(): boolean {
    return this.#state !== null;
  }

  get focusNodeId(): NodeId | null {
    return this.#state?.tree.focusNodeId ?? null;
  }

  /** Every box element of a node on the shown map: one for most nodes, several for twins. */
  boxesOf(nodeId: NodeId): string[] {
    const state = this.#state;
    if (!state) return [];
    return state.tree.boxes
      .filter(box => box.nodeId === nodeId)
      .map(box => state.ids.boxes.get(box.address))
      .filter((elementId): elementId is string => elementId !== undefined);
  }

  /** The node a box element represents, or null for anything that is not a box. */
  nodeOf(elementId: string): NodeId | null {
    const address = this.#state?.addressByElementId.get(elementId);
    return address ? lastNodeOfAddress(address) : null;
  }

  /** The node of the one selected box, or null when none or several are selected. */
  selectedNodeId(): NodeId | null {
    const selected = this.#cy.$('node:selected');
    if (selected.length !== 1) return null;
    return this.nodeOf(selected.first().id());
  }

  /** Build and show the map focused on `focusNodeId` over the scene. */
  async show(focusNodeId: NodeId): Promise<void> {
    if (!graphStore.nodes.some(node => node.id === focusNodeId)) return;
    await this.#present(focusNodeId);
    this.#history.reset(focusNodeId);
    eventBus.emit('mapViewChanged', { active: true, focusNodeId });
  }

  /**
   * Forget this map's adjustments, lengths and scales, and show it from
   * defaults. With `directions`, also clear the bearings of every edge drawn
   * on it so they are seeded afresh; bearings are global, so that reaches
   * every other map those edges appear on. Edit mode only.
   */
  async reset(options: { directions: boolean }): Promise<void> {
    const state = this.#state;
    if (!state || this.#refocusing || !isEditMode()) return;
    const focusNodeId = state.tree.focusNodeId;

    await mapStore.deleteMapView(focusNodeId);
    if (options.directions) {
      for (const line of state.tree.lines) {
        const edge = state.edgeById.get(line.edgeId);
        if (!edge || (edge.bearing === undefined && edge.bearingBack === undefined)) continue;
        const { bearing: _bearing, bearingBack: _bearingBack, ...unassigned } = edge;
        await graphStore.updateEdge(unassigned);
      }
    }

    this.collapsePreview();
    await this.#present(focusNodeId);
    if (isDebug('d_scene')) console.log(`[MapView] Reset map of ${focusNodeId}${options.directions ? ' with directions' : ''}`);
  }

  /**
   * Derive and render the map of `focusNodeId` from storage, replacing
   * whatever is shown. The surface is shown before anything is derived: the
   * ring and the leaves are fractions of it, and a hidden element measures
   * zero, which once laid a whole map out inside the focus box.
   */
  async #present(focusNodeId: NodeId): Promise<void> {
    const container = this.#container();
    container.style.display = 'block';
    this.#cy.resize();

    const derived = await this.#derive(focusNodeId, new Map());
    const ids = renderMap(this.#cy, derived.render, derived.state.baseStyles);
    this.#state = { ...derived.state, ids, addressByElementId: invert(ids) };

    container.style.backgroundColor = getTheme(derived.render.themeId).canvas.background.color;
    this.#frame(0);
    this.#applyGrabbability();

    if (isDebug('d_scene')) console.log(`[MapView] Showing map of ${focusNodeId}: ${derived.state.tree.boxes.length} boxes`);
  }

  /** Hide the map; the scene underneath was never touched. */
  hide(): void {
    if (!this.#state) return;
    this.#preview.reset();
    this.#state = null;
    this.#container().style.display = 'none';
    this.#cy.elements().remove();
    eventBus.emit('mapViewChanged', { active: false, focusNodeId: null });
  }

  /** The surface changed size: the ring is a fraction of it, so lay the map out again. */
  handleResize(): void {
    const state = this.#state;
    if (!state) return;
    this.#cy.resize();
    this.collapsePreview();
    void this.#present(state.tree.focusNodeId);
  }

  /** Back to the base frame on request (`F`): base zoom, focus at the centre. */
  reframe(): void {
    this.#frame(REFRAME_DURATION_MS);
  }

  /** Zoom by `factor` about the focus, which stays at the centre: the focus is at the origin and the pan is the centre at any zoom. */
  zoom(factor: number): void {
    if (!this.#state || factor <= 0) return;
    this.#cy.zoom(this.#cy.zoom() * factor);
  }

  /**
   * Forget every map's adjustments and every edge's bearing, so the whole
   * workspace's maps are seeded afresh, then show the current map from
   * defaults. Edit mode only; the caller confirms, since this cannot be undone.
   */
  async resetAll(): Promise<void> {
    const state = this.#state;
    if (!state || this.#refocusing || !isEditMode()) return;

    await mapStore.clearAll();
    for (const edge of graphStore.edges) {
      if (edge.bearing === undefined && edge.bearingBack === undefined) continue;
      const { bearing: _bearing, bearingBack: _bearingBack, ...unassigned } = edge;
      await graphStore.updateEdge(unassigned);
    }

    this.collapsePreview();
    await this.#present(state.tree.focusNodeId);
    if (isDebug('d_scene')) console.log('[MapView] Reset every map and every bearing');
  }

  /**
   * Move the focus to a landmark's node with the three-phase animation
   * (docs/map-view.md §5.2). One degree only: a node that is not a landmark
   * on the shown map is ignored. Survivors keep their elements throughout;
   * only leavers are removed and only arrivals are added.
   */
  async focusOn(nodeId: NodeId, options: { record: boolean } = { record: true }): Promise<void> {
    const old = this.#state;
    if (!old || this.#refocusing || nodeId === old.tree.focusNodeId) return;
    if (!old.tree.boxes.some(box => box.depth === 1 && box.nodeId === nodeId)) return;

    this.#refocusing = true;
    try {
      // A ballooned landmark that is becoming the focus is released, not collapsed: the move grows it from where it is.
      if (this.#preview.elementId !== null && this.nodeOf(this.#preview.elementId) === nodeId) this.#preview.release();
      else this.collapsePreview();
      this.#cy.$(':selected').unselect();

      // Base styles carry over: survivors keep their nodes, and arrivals add theirs.
      const derived = await this.#derive(nodeId, new Map(old.baseStyles));
      const { tree, layout, baseStyles } = derived.state;
      const plan = planRefocus(old.tree, tree, old.ids);
      const animate = getSetting('map.animate');
      const pause = getSetting('map.phasePause');
      // A re-focus returns to the base frame, undoing any + or - for the session.
      const zoom = getSetting('map.baseZoom');

      // Depart: leavers shrink into their parents, then go with their lines.
      if (animate) {
        await depart(this.#cy, plan, getSetting('map.departDuration'));
        await wait(pause);
      }
      removeElements(this.#cy, [...plan.leaving.map(leaver => leaver.elementId), ...staleLineIds(old.tree, old.ids, plan)]);

      // Survivors take their new addresses before they move, so borders and depths are right during the glide.
      const boxByAddress = new Map(tree.boxes.map(box => [box.address, box]));
      this.#cy.startBatch();
      for (const { elementId, newAddress } of plan.surviving) {
        const box = boxByAddress.get(newAddress)!;
        updateBoxData(this.#cy, elementId, { address: newAddress, depth: box.depth, centralNode: box.depth === 0 });
      }
      this.#cy.endBatch();
      // Reused lines too; a line whose child changes role changes weight, and that is tweened during move, not switched.
      const lineTweens: LineTween[] = [];
      for (const { elementId, weight } of lineWeights(derived.render, plan.ids, [...plan.ids.lines.keys()])) {
        const line = this.#cy.getElementById(elementId);
        if (line.length === 0) continue;
        const current = { width: line.numericStyle('width') as number, arrowScale: line.numericStyle('arrow-scale') as number, bundleStep: weight.bundleStep };
        if (Math.abs(current.width - weight.width) < WEIGHT_TOLERANCE && Math.abs(current.arrowScale - weight.arrowScale) < WEIGHT_TOLERANCE) continue;
        lineTweens.push({ element: line, weight: { from: current, to: weight } });
      }
      const lineByKey = new Map(tree.lines.map(line => [line.key, line]));
      this.#cy.startBatch();
      for (const [key, lineId] of plan.ids.lines) {
        const line = lineByKey.get(key);
        if (line) updateLineData(this.#cy, lineId, { address: line.address });
      }
      this.#cy.endBatch();

      // Move: one movement for every survivor and the zoom; converging twins fade out along the way.
      if (animate) await move(this.#cy, plan, layout, tree, baseStyles, zoom, lineTweens, getSetting('map.moveDuration'));
      else settle(this.#cy, plan, layout, zoom, lineTweens);
      removeElements(this.#cy, plan.converging.map(twin => twin.elementId));
      restyleBoxes(this.#cy, this.#roleChangers(plan.surviving, old, layout));
      if (animate) await wait(pause);

      // Arrive: new markers are added at their places and slide out of their parents.
      addElements(this.#cy, derived.render, plan.ids, plan.arriving, [...linesOfBoxes(tree, plan.arriving).map(line => line.key), ...plan.arrivingLines], baseStyles);
      if (animate) await arrive(this.#cy, plan, tree, layout, getSetting('map.arriveDuration'));

      this.#state = { ...derived.state, baseStyles, ids: plan.ids, addressByElementId: invert(plan.ids) };
      this.#frame(0);
      this.#applyGrabbability();
      if (options.record) this.#history.push(nodeId);
      eventBus.emit('mapViewChanged', { active: true, focusNodeId: nodeId });

      if (isDebug('d_scene')) console.log(`[MapView] Re-focused on ${nodeId}: ${plan.leaving.length} left, ${plan.surviving.length} moved, ${plan.converging.length} converged, ${plan.arriving.length} arrived`);
    } finally {
      this.#refocusing = false;
    }
  }

  canGoBack(): boolean {
    return this.#history.canGoBack();
  }

  canGoForward(): boolean {
    return this.#history.canGoForward();
  }

  async back(): Promise<void> {
    const target = this.#history.back();
    if (target !== null) await this.focusOn(target, { record: false });
  }

  async forward(): Promise<void> {
    const target = this.#history.forward();
    if (target !== null) await this.focusOn(target, { record: false });
  }

  /**
   * Enlarge or shrink the selected boxes by `factor`: each box's own
   * multiplier on its derived scale, so the change survives a change in
   * crowding. The rendered scale stays within the node scale range. Edit mode only.
   */
  async scaleSelected(factor: number): Promise<void> {
    const state = this.#state;
    if (!state || !isEditMode()) return;

    const boxes = state.adjustments.boxes;
    const touched: Address[] = [];
    this.#cy.$('node:selected').forEach(node => {
      const address = state.addressByElementId.get(node.id());
      if (!address) return;
      const rendered = state.layout.scales.get(address) ?? 1;
      const own = boxes[address]?.scale ?? 1;
      const clamped = Math.min(NODE_SCALE_MAX, Math.max(NODE_SCALE_MIN, rendered * factor));
      boxes[address] = { ...boxes[address], scale: Math.round((own * clamped / rendered) * 100) / 100 };
      touched.push(address);
    });
    if (touched.length === 0) return;

    this.#applyOverrides(touched);
    await this.#persistRecord();
  }

  /**
   * Enlarge or shrink every landmark or every marker of this map by `factor`:
   * the map's multiplier on the derived scale for that role, so it survives a
   * change in crowding. Boxes with their own multiplier keep it on top. The
   * ring never moves; the leaves follow the boxes' edges (§3 Manual scales).
   * Edit mode only.
   */
  async scaleGroup(group: 'landmarks' | 'markers', factor: number): Promise<void> {
    const state = this.#state;
    if (!state || !isEditMode()) return;

    const key = group === 'landmarks' ? 'landmarkScale' : 'markerScale';
    const depth = group === 'landmarks' ? 1 : 2;
    state.adjustments[key] = Math.round((state.adjustments[key] ?? 1) * factor * 100) / 100;

    this.#applyOverrides(state.tree.boxes.filter(box => box.depth === depth).map(box => box.address));
    await this.#persistRecord();
  }

  /**
   * Move the selected boxes out or in by `factor`, the scene's `,` and `.`:
   * a landmark's whole fan, by the multiplier on its leaf, so it survives a
   * change in crowding; a marker alone along its own ray, by its length, the
   * same absolute value a drag writes, so a moved marker is a hand-placed
   * marker. The focus has nothing to move. Edit mode only.
   */
  async moveSelected(factor: number): Promise<void> {
    const state = this.#state;
    if (!state || !isEditMode()) return;

    const boxes = state.adjustments.boxes;
    let touched = false;
    this.#cy.$('node:selected').forEach(node => {
      const address = state.addressByElementId.get(node.id());
      const box = address ? state.tree.boxes.find(candidate => candidate.address === address) : undefined;
      if (!address || !box || box.depth === 0) return;
      if (box.depth === 1) {
        boxes[address] = { ...boxes[address], leaf: Math.round((boxes[address]?.leaf ?? 1) * factor * 100) / 100 };
      } else {
        const length = state.layout.lengths.get(address) ?? 0;
        boxes[address] = { ...boxes[address], length: Math.round(length * factor) };
      }
      touched = true;
    });
    if (!touched) return;

    this.#applyOverrides([]);
    await this.#persistRecord();
  }

  /**
   * The adjustments changed: re-derive with crowding frozen, move every box to
   * its new place, and restyle the boxes named and their lines. Positions
   * change whenever a leaf does, since the leaves follow the boxes' rendered
   * sizes.
   */
  #applyOverrides(addresses: Address[]): void {
    const state = this.#state;
    if (!state) return;
    state.layout = layoutMapTree(state.tree, state.endsByEdge, state.adjustments, state.params, state.baseSizes, state.layout.derived);

    this.#cy.startBatch();
    for (const [address, position] of state.layout.positions) {
      const elementId = state.ids.boxes.get(address);
      if (elementId) this.#cy.getElementById(elementId).position({ x: position.x, y: position.y });
    }
    this.#cy.endBatch();

    const boxes: Array<{ elementId: string; baseStyle: Record<string, number>; scale: number }> = [];
    for (const address of addresses) {
      const elementId = state.ids.boxes.get(address);
      const baseStyle = state.baseStyles.get(lastNodeOfAddress(address));
      const scale = state.layout.scales.get(address);
      if (elementId && baseStyle && scale !== undefined) boxes.push({ elementId, baseStyle, scale });
    }
    restyleBoxes(this.#cy, boxes);
    restyleLines(this.#cy, lineWeights({ ...state, lineScalePower: getSetting('map.lineScalePower') }, state.ids, addresses));
  }

  /** Whether a box is drawn below the preview scale, so that hovering it shows its title and clicking it balloons it: every marker, and a landmark crowding shrank. */
  needsPreview(elementId: string): boolean {
    const state = this.#state;
    const address = state?.addressByElementId.get(elementId);
    if (!state || !address) return false;
    return (state.layout.scales.get(address) ?? 1) < getSetting('map.previewScale');
  }

  hasPreview(): boolean {
    return this.#preview.elementId !== null;
  }

  /** Balloon a box that needs it, or collapse it if it is the one already ballooned. */
  togglePreview(elementId: string): void {
    const state = this.#state;
    if (!state) return;
    if (this.#preview.elementId === elementId) {
      this.collapsePreview();
      return;
    }
    this.collapsePreview();
    if (!this.needsPreview(elementId)) return;
    const nodeId = this.nodeOf(elementId);
    const baseStyle = nodeId ? state.baseStyles.get(nodeId) : undefined;
    if (!baseStyle) return;
    this.#preview.balloon(elementId, baseStyle, getSetting('map.previewScale'));
  }

  collapsePreview(): void {
    const state = this.#state;
    const elementId = this.#preview.elementId;
    if (!state || elementId === null) return;
    const address = state.addressByElementId.get(elementId);
    const nodeId = this.nodeOf(elementId);
    const baseStyle = nodeId ? state.baseStyles.get(nodeId) : undefined;
    if (!address || !baseStyle) {
      this.#preview.reset();
      return;
    }
    this.#preview.collapse(baseStyle, state.layout.scales.get(address) ?? 1);
  }

  /**
   * Walk, seed, style and lay out the map of `focusNodeId`, without touching
   * the instance. Styles come before layout because the layout needs the
   * boxes' sizes. `baseStyles` is extended in place. The ring is a fraction of
   * the surface's height, in graph units at the base zoom.
   */
  async #derive(focusNodeId: NodeId, baseStyles: Map<NodeId, BoxBaseStyle>): Promise<DerivedMap> {
    const nodeById = new Map(graphStore.nodes.map(node => [node.id, node]));
    const edgeById = new Map(graphStore.edges.map(edge => [edge.id, edge]));
    const themeId = getSetting('map.themeId');
    const tree = buildMapTree(focusNodeId, graphStore.nodes, graphStore.edges);
    const twinAllowance = getSetting('map.twinAllowance');
    const endsByEdge = await ensureBearings(tree, edgeById, graphStore.edges, twinAllowance);
    await ensureBaseStyles({ tree, nodeById, themeId }, baseStyles);

    const record = mapStore.getMapView(focusNodeId);
    const adjustments: MapAdjustments = { boxes: structuredClone(record?.boxes ?? {}), landmarkScale: record?.landmarkScale, markerScale: record?.markerScale };
    const container = this.#container();
    const baseZoom = getSetting('map.baseZoom');
    const params: MapGeometryParams = {
      viewport: { width: container.clientWidth / baseZoom, height: container.clientHeight / baseZoom },
      ringRadius: (getSetting('map.ringRadius') * container.clientHeight) / 2 / baseZoom,
      horizontalStretch: getSetting('map.horizontalStretch'),
      arcShares: {
        landmark: getSetting('map.arcLandmarkShare'),
        marker: getSetting('map.arcMarkerShare'),
        clearance: getSetting('map.arcClearanceShare'),
        breathing: getSetting('map.arcBreathingShare'),
      },
      leafClearance: getSetting('map.leafClearance'),
      leafAspect: getSetting('map.leafAspect'),
      markerScale: getSetting('map.markerScale'),
      markerGap: getSetting('map.markerGap'),
      scaleFloor: getSetting('map.scaleFloor'),
      landmarkFloor: getSetting('map.landmarkFloor'),
      landmarkDeviation: getSetting('map.landmarkDeviation'),
    };
    const baseSizes = new Map<NodeId, Size>([...baseStyles].map(([nodeId, style]) => [nodeId, { width: style.width, height: style.height }]));
    const layout = layoutMapTree(tree, endsByEdge, adjustments, params, baseSizes);
    const edgeTypes = graphStore.edgeTypes;
    const bases = lineBases(edgeTypes, themeId);

    return {
      state: {
        tree,
        lineByAddress: firstLineByAddress(tree),
        edgeById,
        endsByEdge,
        twinAllowance,
        adjustments,
        params,
        layout,
        baseStyles,
        baseSizes,
        lineBases: bases,
      },
      render: { tree, layout, nodeById, edgeById, edgeTypes, themeId, lineBases: bases, lineScalePower: getSetting('map.lineScalePower') },
    };
  }

  /** Survivors whose scale differs between the old and new map: their rules are rewritten after the move. */
  #roleChangers(
    surviving: Array<{ elementId: string; oldAddress: Address; newAddress: Address }>,
    old: MapState,
    layout: MapState['layout']
  ): Array<{ elementId: string; baseStyle: Record<string, number>; scale: number }> {
    const changers: Array<{ elementId: string; baseStyle: Record<string, number>; scale: number }> = [];
    for (const { elementId, oldAddress, newAddress } of surviving) {
      const before = old.layout.scales.get(oldAddress) ?? 1;
      const after = layout.scales.get(newAddress) ?? 1;
      const baseStyle = old.baseStyles.get(lastNodeOfAddress(newAddress));
      if (before !== after && baseStyle) changers.push({ elementId, baseStyle, scale: after });
    }
    return changers;
  }

  /** A drag settled: the ends to the edge and its parallel siblings, globally; the length to this map's record. No re-fit; that is the author's `F`. */
  async #persistDrag(release: DragRelease): Promise<void> {
    const state = this.#state;
    if (!state) return;
    const edge = state.edgeById.get(release.edgeId);
    if (edge) {
      // Both ends are written, even when only one moved: an absent end reads as the reverse of the other, and the one that stayed must now be explicit.
      // Every edge of the pair carries the same ends (§6.1), swapped for one that runs the other way.
      const pairKey = pairKeyOf(edge);
      for (const sibling of graphStore.edges.filter(candidate => pairKeyOf(candidate) === pairKey)) {
        const ends = siblingEnds(release.ends, sibling.sourceId === edge.sourceId);
        const updated = { ...sibling, bearing: ends.source, bearingBack: ends.target };
        state.edgeById.set(sibling.id, updated);
        state.endsByEdge.set(sibling.id, ends);
        await graphStore.updateEdge(updated);
      }
    }
    // The dragged box's lines take the spread their new length allows; during the drag they kept the old one.
    restyleLines(this.#cy, lineWeights({ ...state, lineScalePower: getSetting('map.lineScalePower') }, state.ids, linesOfBoxes(state.tree, [release.address]).map(line => line.key)));
    await this.#persistRecord();
    if (isDebug('d_scene')) console.log(`[MapView] Drag: edge ${release.edgeId} ends ${release.ends.source.toFixed(1)}° / ${release.ends.target.toFixed(1)}°, ${release.address} length ${release.length}`);
  }

  async #persistRecord(): Promise<void> {
    const state = this.#state;
    if (!state) return;
    await mapStore.putMapView({
      focusNodeId: state.tree.focusNodeId,
      ...structuredClone(state.adjustments),
      updatedAt: new Date(),
    });
  }

  /**
   * Boxes are grabbable in Edit mode; the focus never is, having no line to
   * write. Stated in full each time: `ungrabify` is a persistent per-element
   * flag, and the previous focus keeps its element across a re-focus.
   */
  #applyGrabbability(): void {
    const state = this.#state;
    if (!state) return;
    this.#cy.autoungrabify(!isEditMode());
    this.#cy.nodes().grabify();
    const focusId = state.ids.boxes.get(state.tree.boxes[0].address);
    if (focusId) this.#cy.getElementById(focusId).ungrabify();
  }

  #container(): HTMLElement {
    const container = this.#cy.container();
    if (!container) throw new Error('Map view has no container');
    return container;
  }

  /**
   * The base frame: the base zoom, the focus at the centre. The focus box is at
   * the graph origin, so the pan is the surface's centre at every zoom.
   */
  #frame(durationMs: number): void {
    if (!this.#state) return;
    const container = this.#container();
    const zoom = getSetting('map.baseZoom');
    const pan = { x: container.clientWidth / 2, y: container.clientHeight / 2 };
    if (durationMs <= 0) {
      this.#cy.zoom(zoom);
      this.#cy.pan(pan);
      return;
    }
    this.#cy.animate({ zoom, pan }, { duration: durationMs, easing: 'ease-in-out' });
  }
}
