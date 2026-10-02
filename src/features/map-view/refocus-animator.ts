/**
 * Re-focus animator
 *
 * Moving the focus to a neighbour is address rewriting made visible
 * (docs/map-view.md I7, §5.2): every old box either survives at a rewritten
 * address or leaves, and every new box without a preimage arrives. A strict
 * subset of a scene transition — departing, shared move-only, arriving, and
 * the viewport — with no design change, so survivors keep their elements
 * throughout, as shared nodes do in a scene morph. Three sequential phases:
 *
 *   depart   leaving markers slide into their parent boxes and fade
 *   move     every surviving box moves, and the few that change role rescale, in one movement
 *   arrive   new markers slide out of their parents and fade in
 *
 * Each phase is one requestAnimationFrame loop with one batch per frame, the
 * driver `shared-core-animator.ts` uses: rendered positions interpolated on
 * straight lines and the model position back-solved against that frame's
 * zoom, so a zoom change bends nothing. Size is tweened only for role
 * changers, because a size change invalidates Cytoscape's element texture
 * cache and re-rasterises the node's SVG face every frame; position and
 * opacity leave the cache intact. The scene's departure and arrival make the
 * same choice.
 */

import type { Core, NodeSingular } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import type { MapLayout, Position } from './geometry';
import { linesOfBoxes, type Address, type LineKey, type MapTree } from './map-tree';
import { lineWeightStyle, scaledSize, type BoxBaseStyle, type LineWeight, type MapElementIds } from './render';

export interface RefocusPlan {
  /** Boxes with no address in the new map: shrink into the parent, then removed. */
  leaving: Array<{ elementId: string; parentElementId: string }>;
  /** Boxes that keep their element under a rewritten address. */
  surviving: Array<{ elementId: string; oldAddress: Address; newAddress: Address }>;
  /** Twins whose rewritten address another survivor already took: move with it, fade, then removed. */
  converging: Array<{ elementId: string; newAddress: Address }>;
  /** New boxes with no preimage; their lines arrive with them. */
  arriving: Address[];
  /** Lines of surviving boxes that have no existing element (not expected; handled). */
  arrivingLines: LineKey[];
  /** Ids for the new map: survivors' boxes and reused lines; arrivals are allocated when added. */
  ids: MapElementIds;
}

/**
 * The address a box has in the new focus's map: `A/B/x` becomes `B/x`, `A/x`
 * becomes `B/A/x`, `A` becomes `B/A`. Node ids are numeric strings, so `/` is
 * a safe separator.
 */
export function rewriteAddress(address: Address, oldFocus: NodeId, newFocus: NodeId): Address {
  const viaNewFocus = `${oldFocus}/${newFocus}`;
  if (address === viaNewFocus) return String(newFocus);
  if (address.startsWith(`${viaNewFocus}/`)) return `${newFocus}${address.slice(viaNewFocus.length)}`;
  return `${newFocus}/${address}`;
}

/** Sort every element of the old map and every box of the new map into the plan. */
export function planRefocus(oldTree: MapTree, newTree: MapTree, oldIds: MapElementIds): RefocusPlan {
  const newAddresses = new Set(newTree.boxes.map(box => box.address));
  const ids: MapElementIds = { boxes: new Map(), lines: new Map() };
  const plan: RefocusPlan = { leaving: [], surviving: [], converging: [], arriving: [], arrivingLines: [], ids };

  for (const box of oldTree.boxes) {
    const elementId = oldIds.boxes.get(box.address);
    if (!elementId) continue;
    const newAddress = rewriteAddress(box.address, oldTree.focusNodeId, newTree.focusNodeId);
    if (!newAddresses.has(newAddress)) {
      const parentElementId = box.parentAddress ? oldIds.boxes.get(box.parentAddress) : undefined;
      plan.leaving.push({ elementId, parentElementId: parentElementId ?? elementId });
    } else if (ids.boxes.has(newAddress)) {
      plan.converging.push({ elementId, newAddress });
    } else {
      ids.boxes.set(newAddress, elementId);
      plan.surviving.push({ elementId, oldAddress: box.address, newAddress });
    }
  }

  for (const box of newTree.boxes) {
    if (!ids.boxes.has(box.address)) plan.arriving.push(box.address);
  }

  // A surviving box's line joins the same two elements as before, so the old
  // line element is reused: look it up by its endpoints and edge.
  const oldLineByEndpoints = new Map<string, string>();
  for (const line of oldTree.lines) {
    const lineId = oldIds.lines.get(line.key);
    const childId = oldIds.boxes.get(line.address);
    const parentId = oldIds.boxes.get(line.parentAddress);
    if (lineId && childId && parentId) oldLineByEndpoints.set(endpointsKey(childId, parentId, line.edgeId), lineId);
  }
  for (const line of newTree.lines) {
    const childId = ids.boxes.get(line.address);
    const parentId = ids.boxes.get(line.parentAddress);
    if (!childId || !parentId) continue;
    const lineId = oldLineByEndpoints.get(endpointsKey(childId, parentId, line.edgeId));
    if (lineId) ids.lines.set(line.key, lineId);
    else plan.arrivingLines.push(line.key);
  }

  return plan;
}

function endpointsKey(elementA: string, elementB: string, edgeId: string): string {
  return elementA < elementB ? `${elementA}|${elementB}|${edgeId}` : `${elementB}|${elementA}|${edgeId}`;
}

/** Old line elements the new map does not reuse and whose boxes stay: removed alongside leavers. */
export function staleLineIds(oldTree: MapTree, oldIds: MapElementIds, plan: RefocusPlan): string[] {
  const reused = new Set(plan.ids.lines.values());
  const stale: string[] = [];
  for (const line of oldTree.lines) {
    const lineId = oldIds.lines.get(line.key);
    if (lineId && !reused.has(lineId)) stale.push(lineId);
  }
  return stale;
}

// ============================================================================
// PHASES
// ============================================================================

/** Leavers slide into their parents and fade, drawn beneath them; the caller removes them afterwards. */
export function depart(cy: Core, plan: RefocusPlan, duration: number): Promise<void> {
  const movers: Mover[] = [];
  const lines: LineTween[] = [];
  for (const { elementId, parentElementId } of plan.leaving) {
    const node = cy.getElementById(elementId) as NodeSingular;
    const parent = cy.getElementById(parentElementId) as NodeSingular;
    if (node.length === 0) continue;
    const from = node.position();
    const into = parent.length > 0 ? parent.position() : from;
    node.style('z-index', BENEATH_Z_INDEX);
    movers.push({
      element: node,
      from: { x: from.x, y: from.y },
      to: { x: into.x, y: into.y },
      opacity: { from: 1, to: 0 },
    });
    node.connectedEdges().forEach(edge => {
      lines.push({ element: edge, opacity: { from: 1, to: 0 } });
    });
  }
  return runTween(cy, movers, lines, { from: cy.zoom(), to: cy.zoom() }, cy.pan(), duration, easeInCubic);
}

/**
 * Survivors glide to their new positions while the viewport zooms to fit the
 * new map; converging twins ride along and fade. Width and height are tweened
 * only for boxes whose scale changes (a landmark becoming a marker or back),
 * and `lines` are the ones whose weight changes with their child's role,
 * tweened between the two weights rather than switched.
 */
export function move(
  cy: Core,
  plan: RefocusPlan,
  newLayout: MapLayout,
  newTree: MapTree,
  baseStyles: Map<NodeId, BoxBaseStyle>,
  zoom: number,
  lines: LineTween[],
  duration: number
): Promise<void> {
  const nodeByAddress = new Map(newTree.boxes.map(box => [box.address, box.nodeId]));
  const movers: Mover[] = [];

  const addMover = (elementId: string, newAddress: Address, fade: boolean): void => {
    const node = cy.getElementById(elementId) as NodeSingular;
    const to = newLayout.positions.get(newAddress);
    const baseStyle = baseStyles.get(nodeByAddress.get(newAddress)!);
    if (node.length === 0 || !to || !baseStyle) return;
    const from = node.position();
    const mover: Mover = { element: node, from: { x: from.x, y: from.y }, to };
    const target = scaledSize(baseStyle, newLayout.scales.get(newAddress) ?? 1);
    const width = node.width();
    const height = node.height();
    if (Math.abs(width - target.width) > 0.5 || Math.abs(height - target.height) > 0.5) {
      mover.size = { from: { width, height }, to: target };
    }
    if (fade) mover.opacity = { from: 1, to: 0 };
    movers.push(mover);
  };
  for (const { elementId, newAddress } of plan.surviving) addMover(elementId, newAddress, false);
  for (const { elementId, newAddress } of plan.converging) addMover(elementId, newAddress, true);

  return runTween(cy, movers, lines, { from: cy.zoom(), to: zoom }, cy.pan(), duration, easeInOutCubic);
}

/** Arrivals, already added at their places and sizes, start beneath their parents, invisible, and slide out. */
export function arrive(cy: Core, plan: RefocusPlan, newTree: MapTree, newLayout: MapLayout, duration: number): Promise<void> {
  const parentByAddress = new Map(newTree.boxes.map(box => [box.address, box.parentAddress]));
  const movers: Mover[] = [];
  const lines: LineTween[] = [];
  for (const address of plan.arriving) {
    const elementId = plan.ids.boxes.get(address);
    const parentAddress = parentByAddress.get(address);
    const node = elementId ? (cy.getElementById(elementId) as NodeSingular) : null;
    const origin = parentAddress ? newLayout.positions.get(parentAddress) : undefined;
    const to = newLayout.positions.get(address);
    if (!node || node.length === 0 || !origin || !to) continue;

    node.position({ x: origin.x, y: origin.y });
    node.style({ opacity: 0, 'z-index': BENEATH_Z_INDEX });
    movers.push({ element: node, from: { x: origin.x, y: origin.y }, to, opacity: { from: 0, to: 1 } });

    for (const key of linesOfBoxes(newTree, [address]).map(line => line.key)) {
      const lineId = plan.ids.lines.get(key);
      const line = lineId ? cy.getElementById(lineId) : null;
      if (line && line.length > 0) {
        lines.push({ element: line, opacity: { from: 0, to: 1 } });
        line.style('opacity', 0);
      }
    }
  }

  return runTween(cy, movers, lines, { from: cy.zoom(), to: cy.zoom() }, cy.pan(), duration, easeOutCubic).then(() => {
    cy.startBatch();
    for (const mover of movers) mover.element.removeStyle('opacity z-index');
    for (const line of lines) line.element.removeStyle('opacity');
    cy.endBatch();
  });
}

/** No animation: survivors and converging twins to their places, the viewport to its zoom, lines to their new weights, in one batch. */
export function settle(cy: Core, plan: RefocusPlan, newLayout: MapLayout, zoom: number, lines: LineTween[]): void {
  const pan = cy.pan();
  cy.startBatch();
  cy.viewport({ zoom, pan: { x: pan.x, y: pan.y } });
  for (const { elementId, newAddress } of [...plan.surviving, ...plan.converging]) {
    const position = newLayout.positions.get(newAddress);
    if (position) cy.getElementById(elementId).position({ x: position.x, y: position.y });
  }
  for (const line of lines) line.element.style(lineStyleAt(line, 1));
  cy.endBatch();
}

// ============================================================================
// THE DRIVER
// ============================================================================

/** Leavers and arrivals draw beneath the boxes they slide into or out of. */
const BENEATH_Z_INDEX = -1;

interface Mover {
  element: NodeSingular;
  from: Position;
  to: Position;
  size?: { from: { width: number; height: number }; to: { width: number; height: number } };
  opacity?: { from: number; to: number };
}

interface EdgeLike {
  style(properties: Record<string, number>): unknown;
  removeStyle(names: string): unknown;
}

/** A line that tweens: its opacity for leaving and arriving, its weight when its child changes role. */
export interface LineTween {
  element: EdgeLike;
  opacity?: { from: number; to: number };
  weight?: { from: LineWeight; to: LineWeight };
}

/** The line's inline style at progress `e` of its tween. */
function lineStyleAt(line: LineTween, e: number): Record<string, number> {
  const style: Record<string, number> = {};
  if (line.opacity) style.opacity = line.opacity.from + e * (line.opacity.to - line.opacity.from);
  if (line.weight) {
    const { from, to } = line.weight;
    // The bundle's spread is not tweened: it follows the line's length, which the move changes every frame anyway.
    Object.assign(style, lineWeightStyle({ width: from.width + e * (to.width - from.width), arrowScale: from.arrowScale + e * (to.arrowScale - from.arrowScale), bundleStep: to.bundleStep }));
  }
  return style;
}

type Easing = (t: number) => number;

const easeInCubic: Easing = t => t * t * t;
const easeOutCubic: Easing = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic: Easing = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * One rAF loop, one batch per frame. Rendered positions interpolate on straight
 * lines; the model position written each frame is back-solved against that
 * frame's zoom, so a zoom change never bends a path. Lines tween opacity or
 * weight between the two values they were given.
 */
function runTween(
  cy: Core,
  movers: Mover[],
  lines: LineTween[],
  zoom: { from: number; to: number },
  pan: Position,
  duration: number,
  easing: Easing
): Promise<void> {
  const zoomMoves = zoom.from !== zoom.to;
  if (movers.length === 0 && !zoomMoves) return Promise.resolve();

  const rendered = (position: Position, z: number): Position => ({ x: z * position.x + pan.x, y: z * position.y + pan.y });
  const tracks = movers.map(mover => ({ mover, r0: rendered(mover.from, zoom.from), r1: rendered(mover.to, zoom.to) }));

  return new Promise(resolve => {
    const start = performance.now();
    const frame = (now: number): void => {
      // The first frame's timestamp can precede `start`: rAF stamps the frame's beginning, which may be before the request was made. Clamped, or a cubic easing overshoots and opacity leaves [0, 1].
      const raw = duration > 0 ? Math.max(0, Math.min(1, (now - start) / duration)) : 1;
      const e = easing(raw);
      const z = zoom.from + e * (zoom.to - zoom.from);

      cy.startBatch();
      if (zoomMoves) cy.viewport({ zoom: z, pan: { x: pan.x, y: pan.y } });
      for (const { mover, r0, r1 } of tracks) {
        const rx = r0.x + e * (r1.x - r0.x);
        const ry = r0.y + e * (r1.y - r0.y);
        mover.element.position({ x: (rx - pan.x) / z, y: (ry - pan.y) / z });
        if (mover.size) {
          mover.element.style({
            width: mover.size.from.width + e * (mover.size.to.width - mover.size.from.width),
            height: mover.size.from.height + e * (mover.size.to.height - mover.size.from.height),
          });
        }
        if (mover.opacity) mover.element.style('opacity', mover.opacity.from + e * (mover.opacity.to - mover.opacity.from));
      }
      for (const line of lines) line.element.style(lineStyleAt(line, e));
      cy.endBatch();

      if (raw < 1) {
        requestAnimationFrame(frame);
        return;
      }

      // Snap to the exact final state so rounding never leaves a box a pixel off.
      cy.startBatch();
      if (zoomMoves) cy.viewport({ zoom: zoom.to, pan: { x: pan.x, y: pan.y } });
      for (const { mover } of tracks) {
        mover.element.position({ x: mover.to.x, y: mover.to.y });
        if (mover.size) mover.element.style({ width: mover.size.to.width, height: mover.size.to.height });
        if (mover.opacity) mover.element.style('opacity', mover.opacity.to);
      }
      for (const line of lines) line.element.style(lineStyleAt(line, 1));
      cy.endBatch();
      resolve();
    };
    requestAnimationFrame(frame);
  });
}
