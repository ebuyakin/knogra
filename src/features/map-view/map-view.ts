/**
 * Map View feature (UI: Helicopter view)
 *
 * One derived map per node: every edge keeps one bearing across the whole
 * graph, so moving the focus never rotates anything. The map has its own
 * Cytoscape instance on its own surface (`#map`, created by main.ts like the
 * scene's), shown over the scene while active, so nothing wired to the scene
 * instance ever sees a map element (docs/map-view.md §7). This class owns
 * the map's side of the handoff (prepare, the map's scene, take over, the
 * twins' moves; §7.6, §8), hide, re-focusing, the adjustments, and the
 * lookups other features need to be hosted on the map (§7.5); the map's
 * content comes from the feature-local modules. The sequence that enters and
 * leaves the map is the UI flow's, `ui/map-handoff.ts`, never this class's.
 *
 * On the map an element id is opaque, not a node id, and a node may have
 * several boxes. Anything that hosts on the map goes through `boxesOf` and
 * `nodeOf`. The instance is private: the UI layer receives it from main.ts,
 * as it receives the scene's, never from here.
 */

import type { Core } from 'cytoscape';
import type { EdgeId, NodeId, Scene, SceneId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';
import { mapStore } from '../../storage/map-store';
import { isEditMode } from '../../storage/app-mode';
import { eventBus } from '../../events/event-bus';
import { getSetting } from '../../config';
import { NODE_SCALE_MAX, NODE_SCALE_MIN } from '../../config/node-settings';
import { getTheme } from '../../styles/themes';
import { applyCanvasTheme } from '../../styles/canvas-theme';
import { isDebug } from '../../config/debug-flags';
import { buildMapTree, firstLineByAddress, lastNodeOfAddress, linesOfBoxes, type Address } from './map-tree';
import { layoutMapTree, normalizeBearing, pairKeyOf, siblingEnds, type EdgeEnds, type MapAdjustments, type MapGeometryParams, type Size } from './geometry';
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
import { arrive, depart, move, planRefocus, settle, slideStowed, staleLineIds, stowBoxes, type LineTween, type RefocusPlan, type StowedBox } from './refocus-animator';
import { mapSceneOf, type MapPicture } from './map-scene';

/** `F` returns to the base frame with a short glide rather than a jump. */
const REFRAME_DURATION_MS = 200;

/** A line whose weight changes by less than this on re-focus is left alone rather than tweened. */
const WEIGHT_TOLERANCE = 0.01;

const HALF_TURN_DEGREES = 180;

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
  /** A map derived for the handoff and not yet drawn; `takeOver` consumes it, `hide` discards it. */
  #prepared: DerivedMap | null = null;
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

  /**
   * Select the next landmark clockwise (`1`) or anticlockwise (`-1`) around
   * the ring, wrapping (docs/map-view.md §5.2). From a selected marker its
   * landmark is the start; with nothing selected the landmark nearest the top
   * is selected itself. Selection as a click makes it, an open balloon
   * collapsing as on a click; nothing is written and nothing moves.
   */
  selectLandmark(step: 1 | -1): void {
    const state = this.#state;
    if (!state) return;
    // Angle on screen from the focus at the origin, increasing clockwise since y points down; 270 is the top.
    const angleOf = (address: Address): number => {
      const position = state.layout.positions.get(address);
      return position ? normalizeBearing((Math.atan2(position.y, position.x) * HALF_TURN_DEGREES) / Math.PI) : 0;
    };
    const ring = state.tree.boxes
      .filter(box => box.depth === 1)
      .map(box => ({ address: box.address, angle: angleOf(box.address) }))
      .sort((left, right) => left.angle - right.angle);
    if (ring.length === 0) return;

    const selected = this.#cy.$('node:selected');
    const selectedAddress = selected.length === 1 ? state.addressByElementId.get(selected.first().id()) : undefined;
    const selectedBox = selectedAddress ? state.tree.boxes.find(box => box.address === selectedAddress) : undefined;
    const startAddress = selectedBox?.depth === 1 ? selectedBox.address : selectedBox?.depth === 2 ? selectedBox.parentAddress : null;
    const startIndex = startAddress ? ring.findIndex(entry => entry.address === startAddress) : -1;

    const TOP = 270;
    const nearestTop = ring.reduce((best, entry, index) => (Math.abs(entry.angle - TOP) < Math.abs(ring[best].angle - TOP) ? index : best), 0);
    const nextIndex = startIndex < 0 ? nearestTop : (startIndex + step + ring.length) % ring.length;
    const elementId = state.ids.boxes.get(ring[nextIndex].address);
    if (!elementId) return;

    this.collapsePreview();
    this.#cy.$(':selected').unselect();
    this.#cy.getElementById(elementId).select();
  }

  // ==========================================================================
  // THE HANDOFF (docs/map-view.md §7.6, §8): primitives the UI flow calls in order
  // ==========================================================================

  /**
   * Walk, seed, style and lay out the map of `focusNodeId` for a surface of
   * the given size, and keep it; nothing is drawn and the surface stays
   * hidden. The size is the caller's because a hidden surface measures zero.
   */
  async prepare(focusNodeId: NodeId, surface: Size): Promise<void> {
    if (!graphStore.nodes.some(node => node.id === focusNodeId)) throw new Error(`Map view: no node ${focusNodeId}`);
    this.#prepared = await this.#derive(focusNodeId, new Map(), surface);
  }

  /** The prepared map, or else the shown one, as the map's scene: the focus and the landmarks, what the engine transitions to and from. */
  mapScene(): Scene {
    return mapSceneOf(this.#picture(), getSetting('map.baseZoom'));
  }

  /** The same skeleton as a study scene under the id the engine hands in: what a focus without a scene gets, and what a scene is reset to. */
  sceneDraft(id: SceneId): Scene {
    return mapSceneOf(this.#picture(), getSetting('map.baseZoom'), id);
  }

  /**
   * Draw the prepared map and show the surface, every marker stowed invisible
   * on its landmark, so the two canvases hold one picture: the map's scene.
   */
  takeOver(): void {
    const prepared = this.#prepared;
    if (!prepared) throw new Error('Map view: nothing prepared to take over with');
    this.#prepared = null;

    const state = this.#mount(prepared);
    stowBoxes(this.#cy, state.tree, state.layout, state.ids, this.#markers(state));
    const focusNodeId = state.tree.focusNodeId;
    this.#history.reset(focusNodeId);
    eventBus.emit('mapViewChanged', { active: true, focusNodeId });
    if (isDebug('d_scene')) console.log(`[MapView] Took over the map of ${focusNodeId}: ${state.tree.boxes.length} boxes`);
  }

  /** Every marker grows out of its landmark to its own place, in one tween: the re-focus's arriving move. */
  async arriveMarkers(): Promise<void> {
    const state = this.#state;
    if (!state) return;
    await slideStowed(this.#cy, state.tree, state.layout, state.ids, this.#markers(state), 'out', this.#duration('map.arriveDuration'));
  }

  /**
   * The reverse, before leaving: back to the base frame the map's scene
   * declares, any balloon collapsed, then every marker shrinks into its
   * landmark. Afterwards the map shows exactly `mapScene()`.
   */
  async convergeMarkers(): Promise<void> {
    const state = this.#state;
    if (!state) return;
    this.collapsePreview();
    this.#cy.$(':selected').unselect();
    await this.#frame(this.#duration('map.departDuration'));
    await slideStowed(this.#cy, state.tree, state.layout, state.ids, this.#markers(state), 'in', this.#duration('map.departDuration'));
  }

  /** Every marker with the landmark it hangs from: the boxes that exist only on the map, around the skeleton the engine draws. */
  #markers(state: MapState): StowedBox[] {
    return state.tree.boxes
      .filter(box => box.depth === 2 && box.parentAddress !== null)
      .map(box => ({ address: box.address, parentAddress: box.parentAddress! }));
  }

  /** What the map's scene is made from: the prepared map first, else the shown one at its live layout. */
  #picture(): MapPicture {
    if (this.#prepared) return this.#prepared.render;
    const state = this.#state;
    if (!state) throw new Error('Map view: no map prepared or shown');
    return {
      tree: state.tree,
      layout: state.layout,
      nodeById: new Map(graphStore.nodes.map(node => [node.id, node])),
      edgeById: state.edgeById,
      themeId: getSetting('map.themeId'),
    };
  }

  #duration(setting: 'map.arriveDuration' | 'map.departDuration'): number {
    return getSetting('map.animate') ? getSetting(setting) : 0;
  }

  // ==========================================================================
  // ON THE MAP
  // ==========================================================================

  /**
   * Forget this map's adjustments, lengths and scales, and show it from
   * defaults. With `directions`, also clear the bearings of every edge drawn
   * on it so they are seeded afresh, keeping the angular order of the boxes
   * at each parent when `map.resetKeepsOrder` is on (§5.3); bearings are
   * global, so that reaches every other map those edges appear on. Edit mode
   * only.
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

    await this.#resetTo(state);
    if (isDebug('d_scene')) console.log(`[MapView] Reset map of ${focusNodeId}${options.directions ? ' with directions' : ''}`);
  }

  /**
   * Show the same focus from defaults, animated: every box keeps its
   * address, so this is a re-focus with only the move phase, boxes gliding to
   * their new places and sizes, lines re-weighting. The seeding keeps the
   * boxes' angular order when `map.resetKeepsOrder` asks for it.
   */
  async #resetTo(old: MapState): Promise<void> {
    this.#refocusing = true;
    try {
      this.collapsePreview();
      this.#cy.$(':selected').unselect();
      const orderToKeep = getSetting('map.resetKeepsOrder') ? new Map(old.endsByEdge) : undefined;
      const derived = await this.#derive(old.tree.focusNodeId, new Map(old.baseStyles), this.#surface(), orderToKeep);
      await this.#animateTo(old, derived);
    } finally {
      this.#refocusing = false;
    }
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

    const derived = await this.#derive(focusNodeId, new Map(), this.#surface());
    const state = this.#mount(derived);
    if (isDebug('d_scene')) console.log(`[MapView] Showing map of ${focusNodeId}: ${state.tree.boxes.length} boxes`);
  }

  /** Draw a derived map on the surface, shown, at the base frame, replacing whatever was there. */
  #mount(derived: DerivedMap): MapState {
    const container = this.#container();
    container.style.display = 'block';
    this.#cy.resize();

    const ids = renderMap(this.#cy, derived.render, derived.state.baseStyles);
    const state: MapState = { ...derived.state, ids, addressByElementId: invert(ids) };
    this.#state = state;

    // The same paint as the scene canvas, colour and vignette, so the two surfaces match at the swap.
    applyCanvasTheme(container, getTheme(derived.render.themeId));
    void this.#frame(0);
    this.#applyGrabbability();
    return state;
  }

  /** Hide the map and forget anything prepared; what the scene canvas holds is the flow's concern. */
  hide(): void {
    this.#prepared = null;
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
    void this.#frame(REFRAME_DURATION_MS);
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

    // Only the map on screen can keep its order: the other maps' ends are gone and are seeded fresh when next opened.
    await this.#resetTo(state);
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
      const derived = await this.#derive(nodeId, new Map(old.baseStyles), this.#surface());
      const plan = await this.#animateTo(old, derived);
      if (options.record) this.#history.push(nodeId);
      eventBus.emit('mapViewChanged', { active: true, focusNodeId: nodeId });

      if (isDebug('d_scene')) console.log(`[MapView] Re-focused on ${nodeId}: ${plan.leaving.length} left, ${plan.surviving.length} moved, ${plan.converging.length} converged, ${plan.arriving.length} arrived`);
    } finally {
      this.#refocusing = false;
    }
  }

  /**
   * The three phases from the shown map to a derived one (docs/map-view.md
   * §5.2): leavers depart, survivors move with the zoom, arrivals come out of
   * their parents. A re-focus has all three; a reset of the same focus has
   * only the move, since every box keeps its address. Leaves `#state` at the
   * derived map and returns the plan for the caller's record.
   */
  async #animateTo(old: MapState, derived: DerivedMap): Promise<RefocusPlan> {
    const { tree, layout, baseStyles } = derived.state;
    const plan = planRefocus(old.tree, tree, old.ids);
    const animate = getSetting('map.animate');
    const pause = getSetting('map.phasePause');
    // Back to the base frame, undoing any + or - for the session.
    const zoom = getSetting('map.baseZoom');

    // Depart: leavers shrink into their parents, then go with their lines.
    if (animate && plan.leaving.length > 0) {
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
    if (animate && plan.arriving.length > 0) await wait(pause);

    // Arrive: new markers are added at their places and slide out of their parents.
    addElements(this.#cy, derived.render, plan.ids, plan.arriving, [...linesOfBoxes(tree, plan.arriving).map(line => line.key), ...plan.arrivingLines], baseStyles);
    if (animate) await arrive(this.#cy, plan, tree, layout, getSetting('map.arriveDuration'));

    this.#state = { ...derived.state, baseStyles, ids: plan.ids, addressByElementId: invert(plan.ids) };
    void this.#frame(0);
    this.#applyGrabbability();
    return plan;
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

  /** Whether this box is the one ballooned. */
  isBallooned(elementId: string): boolean {
    return this.#preview.elementId === elementId;
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
   * Walk, seed, style and lay out the map of `focusNodeId` for a surface of
   * the given size in pixels, without touching the instance. Styles come
   * before layout because the layout needs the boxes' sizes. `baseStyles` is
   * extended in place. The ring is a fraction of the surface's height, in
   * graph units at the base zoom.
   */
  async #derive(focusNodeId: NodeId, baseStyles: Map<NodeId, BoxBaseStyle>, surface: Size, orderToKeep?: Map<EdgeId, EdgeEnds>): Promise<DerivedMap> {
    const nodeById = new Map(graphStore.nodes.map(node => [node.id, node]));
    const edgeById = new Map(graphStore.edges.map(edge => [edge.id, edge]));
    const themeId = getSetting('map.themeId');
    const tree = buildMapTree(focusNodeId, graphStore.nodes, graphStore.edges);
    const twinAllowance = getSetting('map.twinAllowance');
    const endsByEdge = await ensureBearings(tree, edgeById, graphStore.edges, twinAllowance, orderToKeep);
    await ensureBaseStyles({ tree, nodeById, themeId }, baseStyles);

    const record = mapStore.getMapView(focusNodeId);
    const adjustments: MapAdjustments = { boxes: structuredClone(record?.boxes ?? {}), landmarkScale: record?.landmarkScale, markerScale: record?.markerScale };
    const baseZoom = getSetting('map.baseZoom');
    const params: MapGeometryParams = {
      viewport: { width: surface.width / baseZoom, height: surface.height / baseZoom },
      ringRadius: (getSetting('map.ringRadius') * surface.height) / 2 / baseZoom,
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

  /** The shown surface's size in pixels; zero while hidden, which is why `prepare` takes its size from the caller. */
  #surface(): Size {
    const container = this.#container();
    return { width: container.clientWidth, height: container.clientHeight };
  }

  /**
   * The base frame: the base zoom, the focus at the centre. The focus box is at
   * the graph origin, so the pan is the surface's centre at every zoom.
   * Resolves when the glide has ended, at once for a jump.
   */
  #frame(durationMs: number): Promise<void> {
    if (!this.#state) return Promise.resolve();
    const container = this.#container();
    const zoom = getSetting('map.baseZoom');
    const pan = { x: container.clientWidth / 2, y: container.clientHeight / 2 };
    if (durationMs <= 0) {
      this.#cy.zoom(zoom);
      this.#cy.pan(pan);
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.#cy.animate({ zoom, pan }, { duration: durationMs, easing: 'ease-in-out', complete: () => resolve() });
    });
  }
}
