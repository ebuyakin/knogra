/**
 * Node Shelf
 *
 * Orchestrates the shelf for the current scene: loads its entries, routes model
 * actions to the store, and performs the graph or scene edit when the user
 * accepts one. The persisted shape and the entry/placement model live in
 * `shelf-store.ts`; this class holds no storage knowledge.
 *
 * See docs/ai/shelf-architecture.md.
 */

import type { NodeId } from '../../core/main-types';
import type { ShelfAction, ShelfEntry, ShelfItem } from '../types';
import type { FeatureAPI } from '../../features/feature-api';
import { eventBus } from '../../events/event-bus';
import { selectShelfDesign } from '../shelf-design-selector';
import { resolveEdgeDirection, resolveEdgeTypeId } from '../edge-type-resolution';
import * as shelfStore from './shelf-store';
import { graphStore } from '../../storage/graph-store';
import { isEditMode } from '../../storage/app-mode';
import { isDebug } from '../../config/debug-flags';

// ============================================================================
// TYPES
// ============================================================================

/** Reason for shelf change */
export type ShelfChangeReason = 'transition' | 'addition' | 'removal';

/** Metadata for removal events */
export interface RemovalMeta {
  index: number;
  style: 'place' | 'dismiss';
}

/** Metadata for addition events */
export interface AdditionMeta {
  startIndex: number;
  count: number;
}

export interface NodeShelfEvents {
  onItemsChanged?: (
    items: ShelfItem[],
    reason: ShelfChangeReason,
    meta?: RemovalMeta | AdditionMeta
  ) => void;
}

// ============================================================================
// NODE SHELF
// ============================================================================

export class NodeShelf {
  #features: FeatureAPI;
  #currentNodeId: NodeId | null = null;
  #entries: ShelfEntry[] = [];
  #events: NodeShelfEvents = {};

  constructor(features: FeatureAPI) {
    this.#features = features;
    eventBus.on('sceneChanged', ({ centralNodeId }) => this.loadForNode(centralNodeId));
  }

  setEvents(events: NodeShelfEvents): void {
    this.#events = events;
  }

  getCurrentNodeId(): NodeId | null {
    return this.#currentNodeId;
  }

  /**
   * Load the shelf for a scene. Re-entering the same scene only re-renders, so a
   * theme change is picked up without re-reconciling.
   */
  loadForNode(nodeId: NodeId): void {
    if (nodeId === this.#currentNodeId) {
      this.#notifyChange('transition');
      return;
    }

    this.#currentNodeId = nodeId;
    this.#refresh();
    this.#notifyChange('transition');
  }

  /**
   * Route model actions to the store, then animate what actually arrived on this
   * scene's shelf — a title already pending here, or already in the scene, adds
   * nothing.
   */
  addItems(actions: ShelfAction[]): void {
    if (!this.#currentNodeId) {
      console.warn('[NodeShelf] No current node, cannot add items');
      return;
    }

    const added = shelfStore.addSuggestions(this.#currentNodeId, actions);
    if (added.length === 0) {
      if (isDebug('d_shelf')) console.log('[NodeShelf] Nothing new to add');
      return;
    }

    const addedIds = new Set(added.map(entry => entry.id));
    this.#refresh();

    const count = this.#entries.filter(entry => addedIds.has(entry.id)).length;
    if (count > 0) {
      this.#notifyChange('addition', { startIndex: this.#entries.length - count, count });
    }
  }

  /**
   * Accept an entry: create the concept, or include the node that already backs
   * it. An entry whose node is already in the scene is consumed without any edit —
   * the user put it there by other means since the suggestion was made.
   */
  async placeNode(index: number): Promise<void> {
    if (!isEditMode()) {
      console.warn('[NodeShelf] Cannot place suggestions in View mode');
      return;
    }

    const entry = this.#entries[index];
    const centralNodeId = this.#currentNodeId;
    if (!entry || !centralNodeId) return;

    try {
      if (entry.nodeId && this.#features.scene.getSceneNodeIds().has(entry.nodeId)) {
        shelfStore.removePlacement(entry.id, centralNodeId);
        if (isDebug('d_shelf')) console.log(`[NodeShelf] Stale entry consumed: ${entry.title}`);
      } else if (entry.nodeId) {
        await this.#features.scene.includeExistingNode(
          entry.nodeId,
          selectShelfDesign(this.#entryProperties(entry)),
          centralNodeId
        );
        shelfStore.removePlacement(entry.id, centralNodeId);
      } else {
        const nodeId = await this.#createFromEntry(entry, centralNodeId);
        shelfStore.materialise(entry.id, nodeId, centralNodeId);
      }

      this.#refresh();
      this.#notifyChange('removal', { index, style: 'place' });
      if (isDebug('d_shelf')) console.log(`[NodeShelf] Placed: ${entry.title}`);
    } catch (error) {
      console.error('[NodeShelf] Failed to place node:', error);
    }
  }

  /** Reject an entry for this scene only; it stays on the shelves of others. */
  removeItem(index: number): void {
    const entry = this.#entries[index];
    if (!entry || !this.#currentNodeId) return;

    shelfStore.removePlacement(entry.id, this.#currentNodeId);
    this.#refresh();
    this.#notifyChange('removal', { index, style: 'dismiss' });
  }

  /** Reject the concept outright: it leaves every scene's shelf. */
  removeItemEverywhere(index: number): void {
    const entry = this.#entries[index];
    if (!entry) return;

    shelfStore.removeEntry(entry.id);
    this.#refresh();
    this.#notifyChange('removal', { index, style: 'dismiss' });
  }

  /** Clear this scene's shelf, leaving other scenes untouched. */
  clear(): void {
    if (!this.#currentNodeId) return;
    shelfStore.clearScene(this.#currentNodeId);
    this.#refresh();
    this.#notifyChange('transition');
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  async #createFromEntry(entry: ShelfEntry, centralNodeId: NodeId): Promise<NodeId> {
    const placement = shelfStore.getPlacement(entry.id, centralNodeId);

    // The request named the central node, so placement must use it. Anchoring on
    // the selection instead would attach the edge to a node the model never saw.
    return this.#features.graph.addConnectedNode(
      centralNodeId,
      resolveEdgeDirection(placement?.direction),
      entry.title,
      entry.properties,
      selectShelfDesign(entry.properties),
      resolveEdgeTypeId(placement?.edgeType)
    );
  }

  #refresh(): void {
    this.#entries = this.#currentNodeId
      ? shelfStore.reconcileScene(this.#currentNodeId, this.#features.scene.getSceneNodeIds())
      : [];
  }

  #notifyChange(reason: ShelfChangeReason, meta?: RemovalMeta | AdditionMeta): void {
    this.#events.onItemsChanged?.(this.#buildShelfItems(), reason, meta);
  }

  /** A materialised entry previews as the node itself, so the shelf shows what exists. */
  #entryProperties(entry: ShelfEntry): Record<string, string> {
    if (!entry.nodeId) return entry.properties;

    const node = graphStore.nodes.find(candidate => candidate.id === entry.nodeId);
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(node?.properties ?? {})) {
      if (typeof value === 'string') result[name] = value;
    }
    return result;
  }

  #buildShelfItems(): ShelfItem[] {
    const centralNodeId = this.#currentNodeId;
    const themeId = this.#features.scene.getThemeId();

    return this.#entries.map(entry => {
      const placement = centralNodeId
        ? shelfStore.getPlacement(entry.id, centralNodeId)
        : undefined;
      const properties = this.#entryProperties(entry);

      return {
        entryId: entry.id,
        title: entry.title,
        isExisting: !!entry.nodeId,
        reason: placement?.reason ?? '',
        edgeType: placement?.edgeType,
        direction: placement?.direction,
        design: selectShelfDesign(properties),
        themeId,
        properties
      };
    });
  }
}
