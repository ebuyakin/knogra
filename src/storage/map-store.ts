/**
 * Map Store
 *
 * Independent Dexie database for map view records (docs/map-view.md §6.2):
 * one record per focus node, holding only what the author adjusted. Separate
 * from graph-store on purpose, as paths and themes are, so the map view never
 * touches the graph database's schema or store class.
 *
 * Reads are synchronous from the cache, writes go through here. Records for
 * deleted nodes are removed by the node-deletion cascade; stale box addresses
 * inside a surviving record are the map view's own concern (ignored on load,
 * dropped on its next write).
 */

import Dexie from 'dexie';
import type { MapView, NodeId } from '../core/main-types';
import { MAP_DB_NAME, MAP_DB_VERSION, MAP_DB_SCHEMA } from '../config/storage-config';

class MapStore {
  #db: Dexie;

  // In-memory cache
  mapViews: MapView[] = [];

  constructor() {
    this.#db = new Dexie(MAP_DB_NAME);
    this.#db.version(MAP_DB_VERSION).stores(MAP_DB_SCHEMA);
  }

  async init(): Promise<void> {
    this.mapViews = await this.#db.table('mapViews').toArray();
  }

  /** The record for a focus, or undefined when the author has adjusted nothing yet. */
  getMapView(focusNodeId: NodeId): MapView | undefined {
    return this.mapViews.find(view => view.focusNodeId === focusNodeId);
  }

  async putMapView(view: MapView): Promise<void> {
    const updated: MapView = { ...view, updatedAt: new Date() };
    await this.#db.table('mapViews').put(updated);

    const index = this.mapViews.findIndex(existing => existing.focusNodeId === view.focusNodeId);
    if (index >= 0) {
      this.mapViews[index] = updated;
    } else {
      this.mapViews.push(updated);
    }
  }

  async deleteMapView(focusNodeId: NodeId): Promise<void> {
    await this.#db.table('mapViews').delete(focusNodeId);

    const index = this.mapViews.findIndex(existing => existing.focusNodeId === focusNodeId);
    if (index >= 0) {
      this.mapViews.splice(index, 1);
    }
  }

  /** Clear all map views (for workspace reset). */
  async clearAll(): Promise<void> {
    await this.#db.table('mapViews').clear();
    this.mapViews = [];
  }
}

// Singleton instance
const mapStore = new MapStore();
await mapStore.init();
export { mapStore };
