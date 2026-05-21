/**
 * Node Shelf
 * Manages suggested nodes waiting to be placed on the graph
 * 
 * Responsibilities:
 * - State management (current suggestions per node)
 * - Persistence (localStorage)
 * - Orchestration (placing nodes on graph via FeatureAPI)
 * - Design selection for shelf items
 */

import type { NodeId } from '../core/main-types';
import type { CreateConnectedAction, IncludeExistingAction, ShelfAction, ShelfItem } from './types';
import type { FeatureAPI } from '../features/feature-api';
import { eventBus } from '../events/event-bus';
import { selectShelfDesign } from './shelf-design-selector';
import { graphStore } from '../storage/graph-store';
import { isEditMode } from '../storage/app-mode';
import { getSetting } from '../config';
import { isDebug } from '../config/debug-flags';

// ============================================================================
// TYPES
// ============================================================================

const STORAGE_KEY = 'knogra.shelf';

/** Storage structure: single object with nodeId keys */
interface ShelfStorage {
  [nodeId: string]: {
    actions: ShelfAction[];
    timestamp: number;
  };
}

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
  #items: ShelfAction[] = [];
  #events: NodeShelfEvents = {};

  constructor(features: FeatureAPI) {
    this.#features = features;
    this.#subscribeToEvents();
  }

  /**
   * Set event handlers
   */
  setEvents(events: NodeShelfEvents): void {
    this.#events = events;
  }

  /**
   * Get current items
   */
  getItems(): ShelfAction[] {
    return [...this.#items];
  }

  /**
   * Get current node ID
   */
  getCurrentNodeId(): NodeId | null {
    return this.#currentNodeId;
  }

  /**
   * Load shelf for a specific node
   * If same node is reloaded (e.g. theme change), just re-render without re-filtering
   */
  loadForNode(nodeId: NodeId): void {
    if (nodeId === this.#currentNodeId) {
      // Same node — just re-render (picks up new themeId via #buildShelfItems)
      this.#notifyChange('transition');
      return;
    }

    this.#currentNodeId = nodeId;
    const loaded = this.#loadFromStorage(nodeId);

    // Re-filter: items saved earlier may now duplicate nodes added since
    this.#items = this.#filterDuplicates(loaded);
    if (this.#items.length !== loaded.length) {
      this.#saveToStorage();
    }

    this.#notifyChange('transition');
  }

  /**
   * Add items to shelf (from AI response)
   * Appends new items, filters out duplicates (nodes already in graph or on shelf)
   */
  addItems(actions: ShelfAction[]): void {
    if (!this.#currentNodeId) {
      console.warn('[NodeShelf] No current node, cannot add items');
      return;
    }

    // Filter out duplicates
    const filteredActions = this.#filterDuplicates(actions);

    if (filteredActions.length === 0) {
      if (isDebug('d_shelf')) console.log('[NodeShelf] All suggestions already exist, nothing to add');
      return;
    }

    // Track where new items start
    const startIndex = this.#items.length;
    
    // Append new items
    this.#items = [...this.#items, ...filteredActions];
    this.#saveToStorage();
    this.#notifyChange('addition', { startIndex, count: filteredActions.length });
  }

  /**
   * Filter out suggestions that already exist in graph/scene or on shelf
   * Logic differs by action type:
   * - create_connected: skip if title/equation already exists anywhere in graph
   * - include_existing: skip if node not found in graph, or already in current scene
   */
  #filterDuplicates(actions: ShelfAction[]): ShelfAction[] {
    const allNodes = graphStore.nodes;
    const existingTitles = new Set(
      allNodes.map(n => n.title.toLowerCase())
    );
    const existingEquations = new Set(
      allNodes
        .map(n => {
          const eq = n.properties?.equation;
          return typeof eq === 'string' ? eq.trim() : null;
        })
        .filter((eq): eq is string => eq !== null && eq.length > 0)
    );

    // Current shelf titles (case-insensitive)
    const shelfTitles = new Set(
      this.#items.map(item => item.title.toLowerCase())
    );

    // Node IDs currently in scene (for include_existing dedup)
    const sceneNodeIds = this.#getSceneNodeIds();

    return actions.filter(action => {
      const titleLower = action.title.toLowerCase();

      // Already on shelf?
      if (shelfTitles.has(titleLower)) {
        if (isDebug('d_shelf')) console.log(`[NodeShelf] Skipping "${action.title}" - already on shelf`);
        return false;
      }

      if (action.type === 'create_connected') {
        if (existingTitles.has(titleLower)) {
          if (isDebug('d_shelf')) console.log(`[NodeShelf] Skipping "${action.title}" - title already in graph`);
          return false;
        }
        const equation = action.properties?.equation?.trim();
        if (equation && existingEquations.has(equation)) {
          if (isDebug('d_shelf')) console.log(`[NodeShelf] Skipping "${action.title}" - equation already in graph`);
          return false;
        }
        return true;
      }

      // include_existing: must exist in graph, must not be in scene
      const node = allNodes.find(n => n.title.toLowerCase() === titleLower);
      if (!node) {
        if (isDebug('d_shelf')) console.log(`[NodeShelf] Skipping "${action.title}" - not found in graph`);
        return false;
      }
      if (sceneNodeIds.has(node.id)) {
        if (isDebug('d_shelf')) console.log(`[NodeShelf] Skipping "${action.title}" - already in scene`);
        return false;
      }
      return true;
    });
  }

  /**
   * Place a node from shelf onto the graph
   * For create_connected: creates node + edge
   * For include_existing: includes node in scene + restores/creates edges
   */
  async placeNode(index: number): Promise<void> {
    if (!isEditMode()) {
      console.warn('[NodeShelf] Cannot place suggestions in View mode');
      return;
    }

    if (index < 0 || index >= this.#items.length) {
      console.warn('[NodeShelf] Invalid index:', index);
      return;
    }

    if (!this.#currentNodeId) {
      console.warn('[NodeShelf] No current node, cannot place');
      return;
    }

    const action = this.#items[index];

    try {
      if (action.type === 'create_connected') {
        await this.#placeCreateConnected(action);
      } else {
        await this.#placeIncludeExisting(action);
      }

      // Remove from shelf
      this.#items.splice(index, 1);
      this.#saveToStorage();
      this.#notifyChange('removal', { index, style: 'place' });

      if (isDebug('d_shelf')) console.log(`[NodeShelf] Placed node: ${action.title}`);
    } catch (error) {
      console.error('[NodeShelf] Failed to place node:', error);
    }
  }

  async #placeCreateConnected(action: CreateConnectedAction): Promise<void> {
    const design = selectShelfDesign(action);
    const direction = action.connectionType === 'parent' ? 'parent' : 'child';
    await this.#features.graph.addConnectedNode(
      this.#currentNodeId!,
      direction,
      action.title,
      action.properties,
      design
    );
  }

  async #placeIncludeExisting(action: IncludeExistingAction): Promise<void> {
    const node = graphStore.nodes.find(
      n => n.title.toLowerCase() === action.title.toLowerCase()
    );
    if (!node) {
      console.warn(`[NodeShelf] Node "${action.title}" not found in graph`);
      return;
    }

    // Use the same design the shelf preview showed
    const hasEquation = typeof node.properties?.equation === 'string'
      && (node.properties.equation as string).trim().length > 0;
    const design = hasEquation
      ? { id: getSetting('node.shelfDesignWithEquation'), params: {} }
      : { id: getSetting('node.shelfDesignBasic'), params: {} };

    await this.#features.scene.includeExistingNode(node.id, design);
  }

  /**
   * Remove item without placing (dismiss)
   */
  removeItem(index: number): void {
    if (index < 0 || index >= this.#items.length) return;

    const removedIndex = index;
    this.#items.splice(index, 1);
    this.#saveToStorage();
    this.#notifyChange('removal', { index: removedIndex, style: 'dismiss' });
  }

  /**
   * Clear all items for current node
   */
  clear(): void {
    this.#items = [];
    this.#saveToStorage();
    this.#notifyChange('transition');
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  #subscribeToEvents(): void {
    eventBus.on('sceneChanged', ({ centralNodeId }) => {
      this.loadForNode(centralNodeId);
    });
  }

  #getSceneNodeIds(): Set<NodeId> {
    return this.#features.scene.getSceneNodeIds();
  }

  #notifyChange(reason: ShelfChangeReason, meta?: RemovalMeta | AdditionMeta): void {
    const shelfItems = this.#buildShelfItems();
    this.#events.onItemsChanged?.(shelfItems, reason, meta);
  }

  /**
   * Build ShelfItem array from current actions
   * Both types use the same design logic: equation → equationDesign, else → basicDesign
   */
  #buildShelfItems(): ShelfItem[] {
    const themeId = this.#getCurrentThemeId();
    return this.#items.map(action => {
      if (action.type === 'include_existing') {
        const node = graphStore.nodes.find(
          n => n.title.toLowerCase() === action.title.toLowerCase()
        );
        const hasEquation = typeof node?.properties?.equation === 'string'
          && node.properties.equation.trim().length > 0;
        const design = hasEquation
          ? { id: getSetting('node.shelfDesignWithEquation'), params: {} }
          : { id: getSetting('node.shelfDesignBasic'), params: {} };
        // Use actual node properties from graph for rendering
        const properties = this.#toStringRecord(node?.properties);
        return { action, design, themeId, properties };
      }
      return {
        action,
        design: selectShelfDesign(action),
        themeId,
        properties: action.properties ?? {}
      };
    });
  }

  /**
   * Get theme ID from current scene
   */
  #getCurrentThemeId(): string {
    return this.#features.scene.getThemeId();
  }

  /**
   * Convert node properties (unknown values) to Record<string, string> for rendering
   */
  #toStringRecord(props: Record<string, unknown> | undefined): Record<string, string> {
    if (!props) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        result[key] = value;
      }
    }
    return result;
  }

  #loadFromStorage(nodeId: NodeId): ShelfAction[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const data: ShelfStorage = JSON.parse(stored);
      return data[nodeId]?.actions || [];
    } catch (error) {
      console.warn('[NodeShelf] Failed to load from storage:', error);
      return [];
    }
  }

  #saveToStorage(): void {
    if (!this.#currentNodeId) return;

    try {
      // Load existing data
      const stored = localStorage.getItem(STORAGE_KEY);
      const data: ShelfStorage = stored ? JSON.parse(stored) : {};

      if (this.#items.length === 0) {
        // Remove entry for this node
        delete data[this.#currentNodeId];
      } else {
        // Update entry for this node
        data[this.#currentNodeId] = {
          actions: this.#items,
          timestamp: Date.now()
        };
      }

      // Save back (or remove if empty)
      if (Object.keys(data).length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (error) {
      console.warn('[NodeShelf] Failed to save to storage:', error);
    }
  }
}
