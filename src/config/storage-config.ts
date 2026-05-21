/**
 * Storage Configuration
 * Centralized database and localStorage key names and schemas
 */

// IndexedDB database names
export const GRAPH_DB_NAME = 'knogra-graph';
export const CHAT_DB_NAME = 'knogra-chat';
export const PATH_DB_NAME = 'knogra-paths';
export const THEME_DB_NAME = 'knogra-themes';

// IndexedDB schema versions
export const GRAPH_DB_VERSION = 2;
export const CHAT_DB_VERSION = 1;
export const PATH_DB_VERSION = 1;
export const THEME_DB_VERSION = 1;

// IndexedDB schemas (Dexie format)
export const GRAPH_DB_SCHEMA = {
  nodes: '++id, title, tags',
  edges: '++id, title, sourceId, targetId, tags',
  scenes: '++id, title',
  backgroundImages: '++id, name'
};

export const CHAT_DB_SCHEMA = {
  conversations: 'nodeId, updatedAt'
};

export const PATH_DB_SCHEMA = {
  paths: '++id, name, createdAt'
};

export const THEME_DB_SCHEMA = {
  themes: 'id, name, createdAt'
};

// localStorage keys (3 total)
export const STATE_KEY = 'knogra.state';       // App session state
export const SETTINGS_KEY = 'knogra.settings'; // User preferences (consolidated object)
export const SHELF_KEY = 'knogra.shelf';       // AI suggestions
