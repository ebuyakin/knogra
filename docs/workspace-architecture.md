# Workspace Module Architecture

> **Status:** Current  
> **Last reviewed:** 2026-06-14  
> **Authority:** Canonical source for `.knogra` workspace export/import behavior.  
> **Related:** [Documentation map](README.md), [Architecture](architecture.md), [Release plan](release-plan.md)

## 1. Overview

The Workspace module handles saving, loading, and creating workspaces. A workspace is a complete, portable snapshot of user data that can be exported to a `.knogra` file and imported on any machine.

---

## 2. Terminology

| Term | Definition |
|------|------------|
| **Workspace** | Complete user data: graph, chat history, images, settings, shelf |
| **Graph** | Nodes, edges, and scenes |
| **Export** | Save workspace to `.knogra` file |
| **Import** | Load workspace from `.knogra` file (replaces current) |
| **New** | Clear current workspace and start fresh |

---

## 3. User Interactions

```
┌─────────────────────────────────────────────────────────────┐
│                      User Actions                           │
├─────────────────────────────────────────────────────────────┤
│  Ctrl+S  →  Export workspace to .knogra file                │
│  Ctrl+O  →  Import workspace from .knogra file              │
│  Ctrl+N  →  Create new empty workspace                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow

### 4.1 Export Flow

```
User presses Ctrl+S
        │
        ▼
┌─────────────────────┐
│  Collect all data   │
│  from storage       │
└─────────────────────┘
        │
        ├── IndexedDB (knogra-graph): nodes, edges, scenes, images
        ├── IndexedDB (knogra-chat): conversations
        ├── localStorage: knogra.* (settings)
        └── localStorage: knogra.shelf (shelf items)
        │
        ▼
┌─────────────────────┐
│  Package into ZIP   │
│  using jszip        │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Trigger browser    │
│  download           │
│  "knogra-YYYY-MM-DD.knogra"
└─────────────────────┘
```

### 4.2 Import Flow

```
User presses Ctrl+O
        │
        ▼
┌─────────────────────┐
│  Prompt: "Save      │
│  current workspace  │
│  before opening?"   │
│  [Save] [Don't Save]│
│  [Cancel]           │
└─────────────────────┘
        │
        ▼ (if not cancelled)
┌─────────────────────┐
│  Show file picker   │
│  (.knogra files)    │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Unzip and validate │
│  manifest.json      │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Clear existing     │
│  data               │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Write new data     │
│  to storage         │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Reload page        │
│  (reinitialize app) │
└─────────────────────┘
```

### 4.3 New Workspace Flow

```
User presses Ctrl+N
        │
        ▼
┌─────────────────────┐
│  Prompt: "Save      │
│  current workspace  │
│  before creating    │
│  new?"              │
│  [Save] [Don't Save]│
│  [Cancel]           │
└─────────────────────┘
        │
        ▼ (if not cancelled)
┌─────────────────────┐
│  Clear all data     │
│  (except settings)  │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Create default     │
│  "Welcome" node     │
│  and scene          │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Reload page        │
└─────────────────────┘
```

---

## 5. .knogra File Structure

The `.knogra` file is a ZIP archive containing:

```
workspace.knogra
│
├── manifest.json        # Metadata (version, date, name)
├── graph.json           # { nodes: [], edges: [], scenes: [] }
├── settings.json        # User preferences
├── shelf.json           # AI suggestion shelf items
├── chat/
│   └── conversations.json   # Chat history
└── images/
    ├── img-123.png
    ├── img-456.jpg
    └── ...
```

### 5.1 manifest.json

```json
{
  "version": "1.0",
  "appVersion": "0.1.0",
  "createdAt": "2026-01-22T10:30:00Z",
  "name": "Quantum Mechanics Study"
}
```

---

## 6. Module Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    workspace.ts                             │
│                                                             │
│  Public API:                                                │
│  ───────────                                                │
│  • exportWorkspace(): Promise<void>                         │
│  • importWorkspace(file: File): Promise<boolean>            │
│  • newWorkspace(): Promise<void>                            │
│  • showImportDialog(): Promise<void>                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Direct access to storage
                          │ (NOT through store classes)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Storage Layer                            │
├─────────────────────────┬───────────────────────────────────┤
│      localStorage       │           IndexedDB               │
├─────────────────────────┼───────────────────────────────────┤
│  • knogra.* settings    │  • knogra-graph DB (via Dexie)    │
│  • knogra.shelf         │    ├── nodes table                │
│  • knogra.lastSceneId   │    ├── edges table                │
│                         │    ├── scenes table               │
│                         │    └── backgroundImages table     │
│                         │  • knogra-chat DB (via Dexie)     │
│                         │    └── conversations table        │
└─────────────────────────┴───────────────────────────────────┘
```

**Note:** All graph data (nodes, edges, scenes, images) is stored in 
IndexedDB via Dexie (`graph-store.ts`). Only settings, shelf items, and 
last scene ID are in localStorage.

### 6.1 Design Decisions

1. **Direct storage access**: The workspace module reads/writes directly to localStorage and IndexedDB, not through store classes. This keeps it isolated and independent.

2. **Page reload after import/new**: Instead of complex state synchronization, we simply reload the page. All stores reinitialize from storage.

3. **Settings preserved on "New"**: User preferences (theme, animation timings, etc.) are kept when creating a new workspace.

4. **jszip library**: Used for ZIP creation/extraction. Already added to dependencies.

---

## 7. Storage Keys (Centralized)

All storage keys are defined in `src/config/storage-config.ts`:

```typescript
// IndexedDB database names
GRAPH_DB_NAME = 'knogra-graph'
CHAT_DB_NAME = 'knogra-chat'

// localStorage keys
GRAPH_STORE_KEY = 'graphStore'
SETTINGS_PREFIX = 'knogra.'
SHELF_KEY = 'knogra.shelf'
LAST_SCENE_KEY = 'knogra.lastSceneId'
```

---

## 8. Dependencies

| Dependency | Purpose |
|------------|---------|
| `jszip` | Create and read ZIP files |
| `dexie` | IndexedDB access (already in project) |

---

## 9. Error Handling

| Scenario | Handling |
|----------|----------|
| Invalid/corrupt .knogra file | Show error message, abort import |
| Version mismatch | Warn user, attempt import anyway |
| Missing data in archive | Use defaults for missing parts |
| Browser doesn't support File API | Show error message |

---

## 10. Startup Flow (main.ts)

```
App loads (main.ts)
        │
        ▼
┌─────────────────────┐
│  Initialize core    │
│  (Cytoscape, APIs)  │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Check: any scenes  │
│  in storage?        │
└─────────────────────┘
        │
        ├── NO scenes ──────────────────────┐
        │                                    ▼
        │                         ┌─────────────────────┐
        │                         │  Create default     │
        │                         │  "Welcome" node     │
        │                         │  and scene          │
        │                         └─────────────────────┘
        │                                    │
        │   ◄────────────────────────────────┘
        │
        ▼ YES, scenes exist
┌─────────────────────┐
│  Check localStorage │
│  for lastSceneId    │
└─────────────────────┘
        │
        ├── Valid scene ID ─────────────────┐
        │                                    ▼
        │                         ┌─────────────────────┐
        │                         │  Load that scene    │
        │                         └─────────────────────┘
        │                                    │
        │                                    ▼
        │                              ┌──────────┐
        │                              │   DONE   │
        │                              └──────────┘
        │
        ▼ No/Invalid lastSceneId
┌─────────────────────┐
│  Show Scene Picker  │
│  modal              │
└─────────────────────┘
        │
        ▼ User selects scene
┌─────────────────────┐
│  Load selected      │
│  scene              │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Save as lastSceneId│
│  for next startup   │
└─────────────────────┘
        │
        ▼
   ┌──────────┐
   │   DONE   │
   └──────────┘
```

### 10.1 Scene Persistence

Every time a scene is opened (via `scene.open()`), the scene ID is saved
to `localStorage` as `knogra.lastSceneId`. This ensures the user returns
to their last-viewed scene on next app load.

---

## 11. Future Considerations

1. **Auto-backup**: Periodic export to browser storage or cloud
2. **Merge import**: Import without replacing (merge graphs)
3. **Selective export**: Export only specific scenes
4. **Cloud sync**: Save/load from cloud storage
