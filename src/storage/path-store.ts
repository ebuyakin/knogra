/**
 * Path Store
 * Independent Dexie database for saved navigation paths
 * Separate from graph-store and chat-store
 */

import Dexie from 'dexie';
import type { Path, PathId, SceneId } from '../core/main-types';
import { PATH_DB_NAME } from '../config/storage-config';

class PathStore {
  #db: Dexie;
  
  // In-memory cache
  paths: Path[] = [];

  constructor() {
    this.#db = new Dexie(PATH_DB_NAME);
    this.#db.version(1).stores({
      paths: '++id, name, createdAt'
    });
  }

  async init(): Promise<void> {
    this.paths = await this.#db.table('paths').toArray();
  }

  /**
   * Create a new path
   */
  async createPath(name: string, scenes: SceneId[]): Promise<PathId> {
    const now = new Date();
    const path: Omit<Path, 'id'> = {
      name,
      scenes,
      createdAt: now,
      updatedAt: now
    };
    
    const id = await this.#db.table('paths').add(path) as PathId;
    this.paths.push({ ...path, id } as Path);
    return id;
  }

  /**
   * Update an existing path
   */
  async updatePath(path: Path): Promise<void> {
    const updated = { ...path, updatedAt: new Date() };
    await this.#db.table('paths').put(updated);
    
    const index = this.paths.findIndex(p => p.id === path.id);
    if (index >= 0) {
      this.paths[index] = updated;
    } else {
      this.paths.push(updated);
    }
  }

  /**
   * Delete a path
   */
  async deletePath(pathId: PathId): Promise<void> {
    await this.#db.table('paths').delete(pathId);
    
    const index = this.paths.findIndex(p => p.id === pathId);
    if (index >= 0) {
      this.paths.splice(index, 1);
    }
  }

  /**
   * Get a path by ID
   */
  getPath(pathId: PathId): Path | undefined {
    return this.paths.find(p => p.id === pathId);
  }

  /**
   * Get all paths
   */
  getAllPaths(): Path[] {
    return [...this.paths];
  }

  /**
   * Clear all paths (for workspace reset)
   */
  async clearAll(): Promise<void> {
    await this.#db.table('paths').clear();
    this.paths = [];
  }
}

// Singleton instance
const pathStore = new PathStore();
await pathStore.init();
export { pathStore };
