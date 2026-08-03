/**
 * Storage Configuration
 * Centralized database and localStorage key names and schemas
 */

// Application version — single source of truth. Consumed by the workspace
// export manifest and the diagnostics snapshot so the two never drift.
export const APP_VERSION = '1.5.0';

// IndexedDB database names
export const GRAPH_DB_NAME = 'knogra-graph';
export const CHAT_DB_NAME = 'knogra-chat';
export const PATH_DB_NAME = 'knogra-paths';
export const THEME_DB_NAME = 'knogra-themes';

// IndexedDB schema versions
export const GRAPH_DB_VERSION = 3;
export const CHAT_DB_VERSION = 1;
export const PATH_DB_VERSION = 1;
export const THEME_DB_VERSION = 1;

// IndexedDB schemas (Dexie format)
export const GRAPH_DB_SCHEMA = {
  nodes: '++id, title, tags',
  edges: '++id, title, sourceId, targetId, typeId, tags',
  scenes: '++id, title',
  backgroundImages: '++id, name',
  edgeTypes: 'id, name'
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

// Mermaid-import authoring preferences. Deliberately isolated from SETTINGS_KEY
// so publisher-only layout knobs never travel inside an exported .knogra
// workspace (settings.json) nor get overwritten on import.
export const MERMAID_IMPORT_KEY = 'knogra.mermaid.import';

// sessionStorage keys — deliberately not persisted across browser sessions.
// Active Node Editor tab: sticky within a work session (a design pass keeps
// landing on Design), reset to the default in a fresh tab.
export const NODE_EDITOR_TAB_KEY = 'knogra.nodeEditor.tab';
