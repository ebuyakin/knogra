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
export const GRAPH_DB_VERSION = 4;
export const CHAT_DB_VERSION = 1;
export const PATH_DB_VERSION = 1;
export const THEME_DB_VERSION = 1;

// IndexedDB schemas (Dexie format)
export const GRAPH_DB_SCHEMA = {
  nodes: '++id, title, tags',
  edges: '++id, title, sourceId, targetId, typeId, tags',
  scenes: '++id, title',
  backgroundImages: '++id, name',
  edgeTypes: 'id, name',
  // Node SVG pictograms. Indexed by owner so cascade deletion is a query rather
  // than a lookup through the node. Deliberately NOT cached by GraphStore — see
  // docs/nodes-svg-images.md §4.3.
  nodeImages: 'id, ownerNodeId'
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

// localStorage keys
export const STATE_KEY = 'knogra.state';       // App session state
export const SETTINGS_KEY = 'knogra.settings'; // User preferences (consolidated object)
export const SHELF_KEY = 'knogra.shelf';       // AI suggestions

// Node image presets — the named generation constraints, plus the default
// selection, in one record. localStorage rather than IndexedDB because the
// collection is small and bounded, and nothing in persisted graph data refers
// to it. See docs/node-image-templates.md §2.3.
export const NODE_IMAGE_PRESETS_KEY = 'knogra.nodeImagePresets';

// Mermaid-import authoring preferences. Deliberately isolated from SETTINGS_KEY
// so publisher-only layout knobs never travel inside a saved workspace file
// (the `settings` member) nor get overwritten when one is opened.
export const MERMAID_IMPORT_KEY = 'knogra.mermaid.import';

// sessionStorage keys — deliberately not persisted across browser sessions.
// Active Node Editor tab: sticky within a work session (a design pass keeps
// landing on Design), reset to the default in a fresh tab.
export const NODE_EDITOR_TAB_KEY = 'knogra.nodeEditor.tab';

// Workspace file envelope — see docs/workspace-architecture.md §5.2.
// `WORKSPACE_FORMAT` is what identifies a workspace file: the reader matches on
// it rather than on the extension, so a renamed file still opens and a foreign
// JSON is rejected with a clear message instead of a parse crash.
export const WORKSPACE_FORMAT = 'knogra-workspace';
export const WORKSPACE_VERSION = '2.0';
