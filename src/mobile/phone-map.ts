/**
 * Phone map — the conductor (docs/mobile-viewer.md §11.4)
 *
 * Shows one-ring maps on the viewer's Cytoscape instance by calling the map
 * view's modules in order: walk, seed, style, lay out with one of the phone's
 * two layouts (rows upright, bands sideways; §5.3), draw, paint; and travels
 * between them with the desktop's three-phase
 * animation (refocus-animator.ts). The desktop's conductor
 * (features/map-view/map-view.ts) is not used: its derive step has the
 * desktop layout and the author's adjustments built in.
 *
 * Seeding runs on the full two-hop tree, as the desktop seeds when it opens a
 * map, and only then is the tree cut to one ring: for the same sequence of
 * visits the phone and the desktop assign the same directions to edges the
 * author never gave one (§5.2).
 *
 * Travel on a one-ring map: the old focus slides out to its place on the new
 * ring, the new focus slides in to the centre, the other old landmarks fold
 * into the old focus, and the new focus's other neighbours grow out of it. A
 * node that is a neighbour of both focuses leaves and arrives again under its
 * new address; the desktop's twin handling does not apply to one ring, and
 * carrying such a box across is a refinement for later.
 */

import type { Core } from 'cytoscape';
import type { Edge, EdgeId, NodeId, ThemeId } from '../core/main-types';
import { getSetting } from '../config';
import { graphStore } from '../storage/graph-store';
import { getTheme } from '../styles/themes';
import { applyCanvasTheme } from '../styles/canvas-theme';
import { buildMapTree, lastNodeOfAddress, linesOfBoxes, type Address, type MapTree } from '../features/map-view/map-tree';
import { ensureBearings } from '../features/map-view/seeding';
import type { EdgeEnds, MapLayout, Size } from '../features/map-view/geometry';
import {
  addElements,
  ensureBaseStyles,
  lineBases,
  lineWeights,
  rebuildStylesheet,
  removeElements,
  renderMap,
  restyleBoxes,
  restyleLines,
  updateBoxData,
  updateLineData,
  type BoxBaseStyle,
  type LineBase,
  type LineBases,
  type MapElementIds,
  type MapRenderInput,
} from '../features/map-view/render';
import { arrive, depart, move, planRefocus, staleLineIds, type LineTween } from '../features/map-view/refocus-animator';
import { MapHistory } from '../features/map-view/history';
import { MarkerPreview } from '../features/map-view/preview';
import { layoutPhoneRows, type PhoneRowParams } from './phone-row-layout';
import { layoutPhoneBands, type PhoneBandParams } from './phone-band-layout';

/** The phone's own values (§4.1: the desktop map settings are not installed). Starting points, tuned on a real phone. */
const PHONE_ROWS: PhoneRowParams = {
  focusMaxWidth: 0.42,
  landmarkScaleMax: 0.8,
  landmarkScaleMin: 0.35,
  gap: 6,
  edgeMargin: 12,
  focusClearance: 40,
  horizontalBand: 10,
  rowPitchMax: 0.3,
  rowStagger: 0.12,
};

/** Sideways (phone-band-layout.ts). */
const PHONE_BANDS: PhoneBandParams = {
  focusMaxWidth: 0.42,
  landmarkScaleMax: 0.8,
  landmarkScaleMin: 0.35,
  gap: 6,
  edgeMargin: 12,
  focusClearance: 40,
  middleBand: 35,
  middleOffset: 30,
};

/** How much a line thins with its box's scale; the desktop's default. */
const LINE_SCALE_POWER = 0.5;

/** The arrowheads, enlarged over the desktop's: at phone size the desktop's are too small to tell the types apart. */
const ARROW_SCALE_FACTOR = 1.8;

/** The three phases of travel, in milliseconds. */
const DEPART_MS = 220;
const MOVE_MS = 420;
const ARRIVE_MS = 260;

/** A line whose weight changes by less than this on travel is left alone rather than tweened. */
const WEIGHT_TOLERANCE = 0.01;

/** A balloon (§7) grows a box to its natural size, or to this fraction of the surface's width if that is less. */
const BALLOON_MAX_WIDTH = 0.8;
/** A box drawn within this of its balloon scale is readable already and does not balloon. */
const BALLOON_TOLERANCE = 0.05;

/** Everything derived for a focus before it touches the instance. */
interface DerivedPhoneMap {
  tree: MapTree;
  layout: MapLayout;
  /** The surface the layout was made for; a resize to anything else lays the map out again. */
  surface: Size;
  themeId: ThemeId;
  edgeById: Map<EdgeId, Edge>;
  endsByEdge: Map<EdgeId, EdgeEnds>;
  baseStyles: Map<NodeId, BoxBaseStyle>;
  render: MapRenderInput;
}

/** The shown map: what was derived and what draws it. */
interface PhoneMapState extends DerivedPhoneMap {
  ids: MapElementIds;
}

export type PhoneMapListener = () => void;

export class PhoneMap {
  #cy: Core;
  #state: PhoneMapState | null = null;
  #history = new MapHistory();
  #preview: MarkerPreview;
  /** A travel is animating; a second request meanwhile is ignored rather than queued. */
  #travelling = false;
  #listeners = new Set<PhoneMapListener>();

  constructor(cy: Core) {
    this.#cy = cy;
    this.#preview = new MarkerPreview(cy);
  }

  get focusNodeId(): NodeId | null {
    return this.#state?.tree.focusNodeId ?? null;
  }

  /** The theme the shown map is drawn in; what a masked face is generated for (quiz.ts). */
  get themeId(): ThemeId {
    return this.#state?.themeId ?? 'dark';
  }

  isTravelling(): boolean {
    return this.#travelling;
  }

  /** Called after every change of focus, for the bar. */
  subscribe(listener: PhoneMapListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** The node a box element represents, or null for anything that is not a box. */
  nodeOf(elementId: string): NodeId | null {
    const address = this.#addressOf(elementId);
    return address ? lastNodeOfAddress(address) : null;
  }

  /** Derive and draw the map of `focusNodeId` from the stores, replacing whatever is shown; the history starts here. */
  async show(focusNodeId: NodeId): Promise<void> {
    const derived = await this.#derive(focusNodeId, new Map());
    this.#draw(derived);
    this.#history.reset(focusNodeId);
    this.#notify();
  }

  /**
   * The surface changed, a rotation as a rule (§5.4): the shown map is laid
   * out again for it and drawn afresh in place. No travel, no history; a
   * balloon or a selection is dropped with the old drawing, a running quiz
   * masks the new boxes as it masks any arrival.
   */
  async handleResize(): Promise<void> {
    const state = this.#state;
    if (!state || this.#travelling) return;
    const surface = this.#surface();
    if (surface.width === state.surface.width && surface.height === state.surface.height) return;
    this.#travelling = true;
    try {
      const derived = await this.#derive(state.tree.focusNodeId, new Map(state.baseStyles));
      this.#draw(derived);
    } finally {
      this.#travelling = false;
    }
    this.#notify();
  }

  /** Replace whatever is drawn with the derived map, framed and themed. */
  #draw(derived: DerivedPhoneMap): void {
    this.#preview.reset();
    const ids = renderMap(this.#cy, derived.render, derived.baseStyles);
    this.#state = { ...derived, ids };
    applyCanvasTheme(this.#container(), getTheme(derived.themeId));
    this.#frame();
    this.#pinFocus();
  }

  /**
   * Travel: move the focus to another node with the three-phase animation
   * (§6). Usually a landmark of the shown map; Home may name any node, and
   * then nothing survives, so the old map folds into its focus and the new one
   * grows out of its own.
   */
  async focusOn(nodeId: NodeId, options: { record: boolean } = { record: true }): Promise<void> {
    const old = this.#state;
    if (!old || this.#travelling || nodeId === old.tree.focusNodeId) return;
    if (!graphStore.nodes.some(node => node.id === nodeId)) return;

    this.#travelling = true;
    // Nothing is dragged while the animation moves things; the new map's landmarks are freed when it has arrived.
    this.#cy.nodes().ungrabify();
    try {
      // A ballooned landmark that is becoming the focus is released, not collapsed: the move grows it from where it is.
      if (this.#preview.elementId !== null && this.nodeOf(this.#preview.elementId) === nodeId) this.#preview.release();
      else this.collapseBalloon();
      this.#cy.$(':selected').unselect();
      // Base styles are generated per theme: carried over while the theme holds, regenerated when it changes with the focus.
      const sameTheme = themeFor(nodeId) === old.themeId;
      const derived = await this.#derive(nodeId, sameTheme ? new Map(old.baseStyles) : new Map());
      await this.#animateTo(old, derived);
      if (options.record) this.#history.push(nodeId);
      this.#notify();
    } finally {
      this.#travelling = false;
      this.#pinFocus();
    }
  }

  /**
   * Every landmark may be dragged, to feel it, to peek under it, or to clear
   * room on a crowded map; it stays where it is dropped until the next travel
   * lays the map out afresh. The focus stays put, since the layout and the
   * frame are built around it.
   */
  #pinFocus(): void {
    const state = this.#state;
    if (!state) return;
    this.#cy.nodes().grabify();
    const focusId = state.ids.boxes.get(state.tree.boxes[0].address);
    if (focusId) this.#cy.getElementById(focusId).ungrabify();
  }

  canGoBack(): boolean {
    return this.#history.canGoBack();
  }

  async back(): Promise<void> {
    const target = this.#history.back();
    if (target !== null) await this.focusOn(target, { record: false });
  }

  // ==========================================================================
  // THE BALLOON (§7): one at a time; the focus never
  // ==========================================================================

  /** Whether a box is drawn below readable size, so that a tap balloons it: a landmark crowding shrank; never the focus. */
  needsBalloon(elementId: string): boolean {
    const state = this.#state;
    const address = state ? this.#addressOf(elementId) : undefined;
    if (!state || !address) return false;
    const box = state.tree.boxes.find(candidate => candidate.address === address);
    if (!box || box.depth === 0) return false;
    return (state.layout.scales.get(address) ?? 1) < this.#balloonScale(box.nodeId) - BALLOON_TOLERANCE;
  }

  isBallooned(elementId: string): boolean {
    return this.#preview.elementId === elementId;
  }

  /** Balloon a box that needs it; collapse it if it is the one already ballooned; any other balloon collapses first. */
  toggleBalloon(elementId: string): void {
    if (this.#preview.elementId === elementId) {
      this.collapseBalloon();
      return;
    }
    this.collapseBalloon();
    if (!this.needsBalloon(elementId)) return;
    const nodeId = this.nodeOf(elementId);
    const baseStyle = nodeId ? this.#state?.baseStyles.get(nodeId) : undefined;
    if (!nodeId || !baseStyle) return;
    this.#preview.balloon(elementId, baseStyle, this.#balloonScale(nodeId));
  }

  collapseBalloon(): void {
    const state = this.#state;
    const elementId = this.#preview.elementId;
    if (!state || elementId === null) return;
    const address = this.#addressOf(elementId);
    const nodeId = this.nodeOf(elementId);
    const baseStyle = nodeId ? state.baseStyles.get(nodeId) : undefined;
    if (!address || !baseStyle) {
      this.#preview.reset();
      return;
    }
    this.#preview.collapse(baseStyle, state.layout.scales.get(address) ?? 1);
  }

  /** The scale a balloon grows a node's box to: natural size, or less if that would not fit the surface's width. */
  #balloonScale(nodeId: NodeId): number {
    const base = this.#state?.baseStyles.get(nodeId);
    if (!base) return 1;
    return Math.min(1, (BALLOON_MAX_WIDTH * this.#surface().width) / base.width);
  }

  #addressOf(elementId: string): Address | undefined {
    const state = this.#state;
    if (!state) return undefined;
    for (const [address, id] of state.ids.boxes) {
      if (id === elementId) return address;
    }
    return undefined;
  }

  async #animateTo(old: PhoneMapState, derived: DerivedPhoneMap): Promise<void> {
    const { tree, layout, baseStyles } = derived;
    const plan = planRefocus(old.tree, tree, old.ids);

    // Depart: leavers fold into their parent, the old focus, and go with their lines.
    if (plan.leaving.length > 0) await depart(this.#cy, plan, DEPART_MS);
    removeElements(this.#cy, [...plan.leaving.map(leaver => leaver.elementId), ...staleLineIds(old.tree, old.ids, plan)]);

    // Survivors take their new addresses before they move, so the central rule follows the focus during the glide.
    const boxByAddress = new Map(tree.boxes.map(box => [box.address, box]));
    this.#cy.startBatch();
    for (const { elementId, newAddress } of plan.surviving) {
      const box = boxByAddress.get(newAddress)!;
      updateBoxData(this.#cy, elementId, { address: newAddress, depth: box.depth, centralNode: box.depth === 0 });
    }
    this.#cy.endBatch();
    const lineTweens = this.#lineTweens(derived.render, plan.ids);
    const lineByKey = new Map(tree.lines.map(line => [line.key, line]));
    this.#cy.startBatch();
    for (const [key, lineId] of plan.ids.lines) {
      const line = lineByKey.get(key);
      if (line) updateLineData(this.#cy, lineId, { address: line.address });
    }
    this.#cy.endBatch();

    // Move: the two focuses swap places, every survivor resizes to its new role; a theme that changes with the focus crossfades the surface.
    const themeChanged = derived.themeId !== old.themeId;
    if (themeChanged) applyCanvasTheme(this.#container(), getTheme(derived.themeId), MOVE_MS);
    await move(this.#cy, plan, layout, tree, baseStyles, 1, lineTweens, MOVE_MS);
    removeElements(this.#cy, plan.converging.map(twin => twin.elementId));
    if (themeChanged) {
      rebuildStylesheet(this.#cy, derived.render, plan.ids, baseStyles);
      restyleLines(this.#cy, lineWeights(derived.render, plan.ids, [...plan.ids.lines.keys()]));
    } else {
      restyleBoxes(this.#cy, this.#rescaled(plan.surviving, old, layout, baseStyles));
    }

    // Arrive: the new focus's other neighbours are added at their places and grow out of it.
    const arrivingLines = [...linesOfBoxes(tree, plan.arriving).map(line => line.key), ...plan.arrivingLines];
    addElements(this.#cy, derived.render, plan.ids, plan.arriving, arrivingLines, baseStyles);
    await arrive(this.#cy, plan, tree, layout, ARRIVE_MS);

    this.#state = { ...derived, ids: plan.ids };
    this.#frame();
  }

  /** Reused lines whose weight changes with their box's new role, tweened during the move rather than switched. */
  #lineTweens(render: MapRenderInput, ids: MapElementIds): LineTween[] {
    const tweens: LineTween[] = [];
    for (const { elementId, weight } of lineWeights(render, ids, [...ids.lines.keys()])) {
      const line = this.#cy.getElementById(elementId);
      if (line.length === 0) continue;
      const current = { width: line.numericStyle('width') as number, arrowScale: line.numericStyle('arrow-scale') as number, bundleStep: weight.bundleStep };
      if (Math.abs(current.width - weight.width) < WEIGHT_TOLERANCE && Math.abs(current.arrowScale - weight.arrowScale) < WEIGHT_TOLERANCE) continue;
      tweens.push({ element: line, weight: { from: current, to: weight } });
    }
    return tweens;
  }

  /** Survivors whose scale differs between the old and new map: their rules are rewritten after the move. */
  #rescaled(
    surviving: Array<{ elementId: string; oldAddress: Address; newAddress: Address }>,
    old: PhoneMapState,
    layout: MapLayout,
    baseStyles: Map<NodeId, BoxBaseStyle>
  ): Array<{ elementId: string; baseStyle: BoxBaseStyle; scale: number }> {
    const changed: Array<{ elementId: string; baseStyle: BoxBaseStyle; scale: number }> = [];
    for (const { elementId, oldAddress, newAddress } of surviving) {
      const before = old.layout.scales.get(oldAddress) ?? 1;
      const after = layout.scales.get(newAddress) ?? 1;
      const baseStyle = baseStyles.get(lastNodeOfAddress(newAddress));
      if (before !== after && baseStyle) changed.push({ elementId, baseStyle, scale: after });
    }
    return changed;
  }

  async #derive(focusNodeId: NodeId, baseStyles: Map<NodeId, BoxBaseStyle>): Promise<DerivedPhoneMap> {
    const nodeById = new Map(graphStore.nodes.map(node => [node.id, node]));
    const edgeById = new Map(graphStore.edges.map(edge => [edge.id, edge]));
    const themeId = themeFor(focusNodeId);

    const fullTree = buildMapTree(focusNodeId, graphStore.nodes, graphStore.edges);
    const endsByEdge = await ensureBearings(fullTree, edgeById, graphStore.edges, getSetting('map.twinAllowance'));
    const tree = oneRing(fullTree);

    await ensureBaseStyles({ tree, nodeById, themeId }, baseStyles);
    const baseSizes = new Map<NodeId, Size>([...baseStyles].map(([nodeId, style]) => [nodeId, { width: style.width, height: style.height }]));
    const surface = this.#surface();
    // Upright: the rows. Sideways: the bands. Two layouts, not one with its axes swapped (§5.3).
    const layout =
      surface.height >= surface.width
        ? layoutPhoneRows(tree, endsByEdge, surface, baseSizes, PHONE_ROWS)
        : layoutPhoneBands(tree, endsByEdge, surface, baseSizes, PHONE_BANDS);

    const edgeTypes = graphStore.edgeTypes;
    const render: MapRenderInput = {
      tree,
      layout,
      nodeById,
      edgeById,
      edgeTypes,
      themeId,
      lineBases: withLargerArrows(lineBases(edgeTypes, themeId)),
      lineScalePower: LINE_SCALE_POWER,
    };
    return { tree, layout, surface, themeId, edgeById, endsByEdge, baseStyles, render };
  }

  /** Zoom 1, the focus (the origin) at the surface's centre. */
  #frame(): void {
    const container = this.#container();
    this.#cy.zoom(1);
    this.#cy.pan({ x: container.clientWidth / 2, y: container.clientHeight / 2 });
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }

  #container(): HTMLElement {
    const container = this.#cy.container();
    if (!container) throw new Error('Phone map has no container');
    return container;
  }

  #surface(): Size {
    const container = this.#container();
    return { width: container.clientWidth, height: container.clientHeight };
  }
}

/** The desktop's line bases with every arrowhead enlarged by the phone's factor; widths as they are. */
function withLargerArrows(bases: LineBases): LineBases {
  const enlarge = (base: LineBase): LineBase => ({ width: base.width, arrowScale: base.arrowScale * ARROW_SCALE_FACTOR });
  return { base: enlarge(bases.base), byType: new Map([...bases.byType].map(([typeId, base]) => [typeId, enlarge(base)])) };
}

/** The focus's own scene's theme, else the first scene's, else the dark one (§5.1). */
function themeFor(focusNodeId: NodeId): ThemeId {
  const own = graphStore.scenes.find(scene => scene.centralNodeId === focusNodeId);
  return own?.themeId ?? graphStore.scenes[0]?.themeId ?? 'dark';
}

/** The focus and its landmarks with their lines; the second hop, walked for seeding, is dropped. */
function oneRing(tree: MapTree): MapTree {
  const boxes = tree.boxes.filter(box => box.depth <= 1);
  const kept = new Set(boxes.map(box => box.address));
  const lines = tree.lines.filter(line => kept.has(line.address));
  const twins = new Map<NodeId, Address[]>();
  for (const [nodeId, addresses] of tree.twins) {
    const remaining = addresses.filter(address => kept.has(address));
    if (remaining.length > 1) twins.set(nodeId, remaining);
  }
  return { focusNodeId: tree.focusNodeId, boxes, lines, twins };
}
