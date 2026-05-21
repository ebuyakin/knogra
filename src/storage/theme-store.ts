/**
 * Theme Store
 * Persists custom user themes to IndexedDB
 */

import Dexie from 'dexie';
import type { ThemeId } from '../core/main-types';
import type { ColorTheme } from '../core/style-types';
import { THEME_DB_NAME, THEME_DB_VERSION, THEME_DB_SCHEMA } from '../config/storage-config';
import { isDebug } from '../config/debug-flags';

/** Custom theme with metadata */
export interface StoredTheme extends ColorTheme {
  isCustom: true;
  createdAt: Date;
  updatedAt: Date;
}

class ThemeStore {
  #db: Dexie;
  
  // In-memory cache
  themes: StoredTheme[] = [];

  constructor() {
    this.#db = new Dexie(THEME_DB_NAME);
    this.#db.version(THEME_DB_VERSION).stores(THEME_DB_SCHEMA);
  }

  /** Initialize store - load all custom themes into memory */
  async init(): Promise<void> {
    this.themes = await this.#db.table('themes').toArray();
    if (isDebug('d_store')) console.log(`[ThemeStore] Loaded ${this.themes.length} custom themes`);
  }

  /** Get all custom themes */
  getAllCustomThemes(): StoredTheme[] {
    return [...this.themes];
  }

  /** Get a specific custom theme by ID */
  getTheme(themeId: ThemeId): StoredTheme | undefined {
    return this.themes.find(t => t.id === themeId);
  }

  /** Save a custom theme (create or update) */
  async saveTheme(theme: ColorTheme): Promise<ThemeId> {
    const now = new Date();
    const existing = this.themes.find(t => t.id === theme.id);
    
    const storedTheme: StoredTheme = {
      ...theme,
      isCustom: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    await this.#db.table('themes').put(storedTheme);
    
    // Update in-memory cache
    const index = this.themes.findIndex(t => t.id === theme.id);
    if (index >= 0) {
      this.themes[index] = storedTheme;
    } else {
      this.themes.push(storedTheme);
    }

    if (isDebug('d_store')) console.log(`[ThemeStore] Saved theme: ${theme.id}`);
    return theme.id as ThemeId;
  }

  /** Delete a custom theme */
  async deleteTheme(themeId: ThemeId): Promise<void> {
    await this.#db.table('themes').delete(themeId);
    
    // Remove from in-memory cache
    const index = this.themes.findIndex(t => t.id === themeId);
    if (index >= 0) {
      this.themes.splice(index, 1);
    }

    if (isDebug('d_store')) console.log(`[ThemeStore] Deleted theme: ${themeId}`);
  }

  /** Check if a theme ID exists */
  hasTheme(themeId: ThemeId): boolean {
    return this.themes.some(t => t.id === themeId);
  }
}

// Singleton instance
const themeStore = new ThemeStore();
await themeStore.init();
export { themeStore };
