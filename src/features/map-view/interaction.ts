/**
 * Map interaction — dragging
 *
 * Dragging a box writes two things (docs/map-view.md I6): the new angle from
 * its parent box becomes the bearing of the end its line leaves from,
 * globally, the other end following only once the allowance is reached, and
 * the new distance becomes the line's length, locally. Dragging is live
 * (§5.3): on every pointer move the whole map is re-derived from the
 * provisional values, so the box's subtree follows rigidly and the other
 * end's line, if any, pivots about its own parent. Nothing is persisted
 * until release.
 */

import type { Core, EventObject, NodeSingular } from 'cytoscape';
import type { Edge, EdgeId, NodeId, ThemeId } from '../../core/main-types';
import { isEditMode } from '../../storage/app-mode';
import { bearingBetween, endsAfterMove, layoutMapTree, unstretch, type EdgeEnds, type MapAdjustments, type MapGeometryParams, type MapLayout, type Size } from './geometry';
import type { Address, MapLine, MapTree } from './map-tree';
import type { BoxBaseStyle, LineBases, MapElementIds } from './render';

/** Everything the shown map is derived from, plus the derivation. Mutated by adjustments. */
export interface MapState {
  tree: MapTree;
  /** The theme the map is drawn in (docs/map-view.md §5.6); base styles and the stylesheet's edge rules are bound to it. */
  themeId: ThemeId;
  /** Each box's first line, which carries the box's direction; a box's other lines, parallel edges, share it. */
  lineByAddress: Map<Address, MapLine>;
  edgeById: Map<EdgeId, Edge>;
  endsByEdge: Map<EdgeId, EdgeEnds>;
  /** `map.twinAllowance` when the map was presented: how far a drag may part an edge's ends. */
  twinAllowance: number;
  /** The author's adjustments, the record's content; mutated by the commands and persisted after each. */
  adjustments: MapAdjustments;
  params: MapGeometryParams;
  layout: MapLayout;
  baseStyles: Map<NodeId, BoxBaseStyle>;
  /** Each node's rendered size at scale 1, from its base style; the layout clears lines of the boxes' sizes. */
  baseSizes: Map<NodeId, Size>;
  /** Line weights at scale 1 per edge type, for re-weighting lines when box scales change. */
  lineBases: LineBases;
  /** Which element draws which address; element ids are opaque and persist across re-focuses. */
  ids: MapElementIds;
  addressByElementId: Map<string, Address>;
}

export interface DragRelease {
  edgeId: EdgeId;
  ends: EdgeEnds;
  address: Address;
  length: number;
}

/** A box closer than this to its parent has no meaningful angle. */
const MIN_DRAG_LENGTH = 1;

/**
 * Wire live dragging on the instance. `readState` returns the shown map or
 * null; `onRelease` persists what the drag settled on.
 */
export function wireDragging(cy: Core, readState: () => MapState | null, onRelease: (release: DragRelease) => void): void {
  let pending: DragRelease | null = null;

  cy.on('drag', 'node', (event: EventObject) => {
    const state = readState();
    if (!state || !isEditMode()) return;
    pending = applyDrag(cy, state, event.target as NodeSingular) ?? pending;
  });

  cy.on('free', 'node', () => {
    if (!pending) return;
    const release = pending;
    pending = null;
    onRelease(release);
  });
}

/** Re-derive the map from the dragged box's current position; returns what a release would persist. */
function applyDrag(cy: Core, state: MapState, dragged: NodeSingular): DragRelease | null {
  const address = state.addressByElementId.get(dragged.id());
  const line = address ? state.lineByAddress.get(address) : undefined;
  if (!address || !line) return null;

  const parentId = state.ids.boxes.get(line.parentAddress);
  if (!parentId) return null;
  // The instance shows the drawn frame; bearing and length live in the true one.
  const parentPosition = cy.getElementById(parentId).position();
  const position = dragged.position();
  const offset = unstretch({ x: position.x - parentPosition.x, y: position.y - parentPosition.y }, state.params.horizontalStretch);
  const length = Math.hypot(offset.x, offset.y);
  if (length < MIN_DRAG_LENGTH) return null;

  // The dragged line leaves its parent at one end of the edge; that end takes the new angle and the other follows only as the allowance requires (I6).
  const before = state.endsByEdge.get(line.edgeId);
  if (!before) return null;
  const ends = endsAfterMove(before, !line.reversed, bearingBetween({ x: 0, y: 0 }, offset), state.twinAllowance);
  state.endsByEdge.set(line.edgeId, ends);
  // The drag accepts what it sees: the drawn direction becomes the stored one, so this box's deviation is spent (§3 Drawn directions).
  state.layout.derived.deviations.set(address, 0);
  state.adjustments.boxes[address] = { ...state.adjustments.boxes[address], length: Math.round(length) };
  // Crowding stays as it was when the map was presented: a drag moves its own subtree and the other end's line, if the allowance is reached, nothing else.
  state.layout = layoutMapTree(state.tree, state.endsByEdge, state.adjustments, state.params, state.baseSizes, state.layout.derived);

  // The dragged box is where the pointer put it; everything else follows.
  cy.batch(() => {
    for (const [boxAddress, boxPosition] of state.layout.positions) {
      if (boxAddress === address) continue;
      const elementId = state.ids.boxes.get(boxAddress);
      if (elementId) cy.getElementById(elementId).position({ x: boxPosition.x, y: boxPosition.y });
    }
  });

  return { edgeId: line.edgeId, ends, address, length: Math.round(length) };
}
