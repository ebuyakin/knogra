# Workspace Module Architecture

> **Status:** Current. The workspace JSON format (§5.2–§5.3) is implemented.  
> **Last reviewed:** 2026-08-12  
> **Authority:** Canonical source for saving, opening, and creating workspaces: file format, transfer, storage keys, and startup.  
> **Out of scope:** The Knogra Markdown document — an unrelated format with an unrelated purpose. See [Markdown architecture](markdown-architecture.md).  
> **Related:** [Documentation map](README.md), [Architecture](architecture.md), [Markdown architecture](markdown-architecture.md), [Release plan](release-plan.md)

## 1. Overview

The Workspace module handles saving, loading, and creating workspaces. A workspace is the complete
set of user data held in IndexedDB and localStorage; the **workspace file** is a lossless snapshot
of it that can be saved on one machine and opened on another.

**Scope boundary.** Saving and opening a workspace never interprets content. No identity is
resolved, no node is matched, no graph is constructed, nothing is merged — the file is written from
the stores and read back into them verbatim. Every rule about matching, partial application, or
lossy projection belongs to the [Markdown document](markdown-architecture.md), not here.

The dependency between the two runs **one way only**: `markdown/` calls `exportWorkspace()` and
reuses `transfer.ts`. **Nothing in `workspace/` imports from `markdown/`.**

---

## 2. Terminology

| Term | Definition |
|------|------------|
| **Workspace** | Complete user data in browser storage: graph (nodes, edges, edge types, scenes), chat history, background images, saved paths, custom themes, settings, shelf, app state |
| **Workspace file** | A lossless snapshot of a workspace as a single file |
| **Legacy workspace file** | The `.knogra` ZIP written up to v1.5. Read forever, never written again (§5.2) |
| **Member** | One top-level part of a workspace file — each a verbatim dump of one store |
| **Export / Save** | Write the workspace to a file |
| **Import / Open** | Replace the current workspace with a file's contents |
| **New** | Clear the workspace and seed a fresh one |

**On the verbs.** Code and this document say *export* and *import*; the UI says **Save workspace to
file…** and **Open workspace from file…**. The file is a copy, not the live persistence — IndexedDB
is — so the two vocabularies stay deliberately distinct (§3.1).

---

## 3. User Interactions

```
┌─────────────────────────────────────────────────────────────┐
│                      User Actions                           │
├─────────────────────────────────────────────────────────────┤
│  Ctrl+S  →  Save workspace to file                          │
│  Ctrl+O  →  Open workspace from file                        │
│  Ctrl+N  →  Create new empty workspace                      │
└─────────────────────────────────────────────────────────────┘
```

A fourth entry point exists without a shortcut: **`?import=<url>`**, used by the landing page's
Open and Tutorial buttons to hand a published graph to the app (`importFromUrl` in `workspace.ts`).

### 3.1 Wording

**The UI says Save, Open and New; code, docs and telemetry say export and import.** Both
vocabularies are accurate — the file is written out, and it is also a copy — but only one of them
appears in labels. `Ctrl+S` / `Ctrl+O` already promise the operating-system convention, and *export*
is reserved for the [Markdown document](markdown-architecture.md), whose export genuinely is a lossy
projection. Showing both words on one label would restore the collision the two-artefact split
exists to remove.

**Save shows no dialog.** It downloads; the browser's own download indicator is the confirmation.
Nothing about the operation is configurable, so there is nothing to ask. Two dialogs still appear
when warranted, both pre-existing and neither a confirmation.

| Dialog | Shown when | Must state |
|---|---|---|
| **Open** | Always, before the file picker | It **replaces everything currently in this browser**. Offers Save first |
| **New** | Always | Same replacement warning. Offers Save first |
| Validation | The graph has integrity errors | Informational; the user may proceed either way |
| In-note images | The workspace or the file carries them | Which categories to embed, or to keep |

Never "your workspace has been saved" — the workspace is already saved, continuously, to IndexedDB.
The file is a copy taken at a moment.

---

## 4. Data Flow

### 4.1 Export Flow

1. Collect every member from its own store — `workspace/transfer.ts` owns one function per member.
2. Validate graph integrity. **Informational only:** the user is warned and may proceed with a
   known-corrupt backup.
3. If the workspace holds in-note images, ask which categories to embed. Cancelling aborts.
4. Record the current Cytoscape container size, so Open can offer a proportional scale-to-fit.
5. Serialize and trigger a browser download.

**Sources, complete:**

| Store | Members |
|---|---|
| IndexedDB `knogra-graph` | nodes, edges, edge types, scenes, background images |
| IndexedDB `knogra-chat` | conversations |
| IndexedDB `knogra-paths` | saved paths |
| IndexedDB `knogra-themes` | custom themes |
| localStorage `knogra.*` | settings, shelf, app state |

**Two privacy carve-outs, load-bearing:** `exportSettings()` strips API keys, and
`getExportableAppState()` omits the path-mode session — shipping it would drop whoever opens the
file into someone else's tour at someone else's cursor position, and since paths keep their
original ids the reference often resolves, so `Path.restoreSession()` would not catch it. Every
export path routes through these helpers rather than raw storage, so the carve-outs hold by
construction.

### 4.2 Import Flow

1. Confirm intent, offering **Save current workspace first**. Shown *before* the file picker —
   opening a picker inside an async `onchange` handler is silently dropped by some browsers.
2. Read and identify the file (§5.3).
3. Validate graph integrity — informational, as on export.
4. If the file was authored on a meaningfully different screen, offer a proportional scale-to-fit.
   Applied to the in-memory scenes **before** they are written, so the first frame after reload is
   already correct.
5. If the file carries in-note images, ask which categories to keep.
6. Capture local API keys — `clearAllData()` wipes localStorage, so they must be read first.
7. Clear all data, write every member, restore the captured API keys.
8. Reload the page to reinitialize the app.

**Why reload rather than reconcile:** all stores reinitialize from storage, and no live Cytoscape
state can survive to contradict what was just written. See §6.2.

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

## 5. File Format

### 5.1 Legacy `.knogra` ZIP — implemented, read-only from v1.6

The `.knogra` file is a ZIP archive of **nine flat JSON members and nothing else**:

```
manifest.json  graph.json  settings.json  chat-history.json
background-images.json  shelf.json  paths.json  app-state.json  themes.json
```

**There are no binary members and no folders.** Background images are base64 `dataUri` strings
inside `background-images.json`; in-note images are `dataUrl` strings inside `chat-history.json`.
Every member is read with a null check, so all nine are already effectively optional.

**The archive is also uncompressed.** `zip.generateAsync({ type: 'blob' })` passes no `compression`
option, and JSZip's default is `STORE` — the members are concatenated verbatim. Measured on a
629-node workspace: the `.knogra` is 2.6 MB where DEFLATE would have produced ~165 KB. Every
size argument in §5.2 rests on this fact.

Together these decide §5.2: the archive is a *container*, not a binary bundle, and not a compressed
one.

```json
// manifest.json
{
  "version": "1.0",
  "appVersion": "1.5.0",
  "createdAt": "2026-01-22T10:30:00Z",
  "name": "Quantum Mechanics Study"
}
```

### 5.2 Workspace JSON — implemented

The nine members become nine top-level keys of one JSON document. Member shapes are unchanged, so
this is **structurally lossless**: a container swap, not a schema change.

```jsonc
{
  "manifest": {
    "format": "knogra-workspace",
    "version": "2.0",
    "appVersion": "1.6.0",
    "createdAt": "2026-08-11T10:30:00Z",
    "name": "Quantum Mechanics"
  },
  "graph":            { "nodes": [], "edges": [], "edgeTypes": [], "scenes": [] },
  "chat":             [ /* conversations */ ],
  "themes":           [],
  "backgroundImages": [],
  "paths":            [],
  "settings":         {},
  "shelf":            {},
  "appState":         {}
}
```

`manifest.format` and `manifest.version` are new and mandatory — they let the reader recognise the
file instead of guessing. Every other key is optional, which is the contract the null-checked reads
already honour.

**Serialized unindented** — `JSON.stringify(envelope)` with no spacer. The purpose of the format is
that the file is transparent, inspectable and programmatically convertible; pretty-printing is a
reader-side concern any editor or `jq .` supplies. The artefact whose purpose is human readability
is the [Markdown document](markdown-architecture.md), not this one.

**No compression is given up**, because there was none (§5.1). Measured on two real workspaces:

| Workspace | Legacy `.knogra` | Workspace JSON | gzipped |
|---|---|---|---|
| 629 nodes, no background images | 2.6 MB | **1.5 MB** | 146 KB |
| 6 background images, ~500 KB each | ~4.1 MB | **4.1 MB** | 3.1 MB |

Text-heavy workspaces shrink ~40%; image-heavy ones are unchanged. Base64 PNG is already
compressed, so gzip recovers the 4/3 base64 expansion and nothing beyond it. Over the wire the
change is a larger gain still: `.knogra` is an unrecognised type and is served uncompressed, while
Vercel and GitHub gzip `.json` automatically.

**Background images dominate size and cannot be excluded.** Each costs 1.33 × its source bytes,
under a 1 MB per-image upload cap — roughly 14 MB of file at ten images, 68 MB at fifty. This is
pre-existing behaviour, unchanged by the format swap, and recorded in §11.

**File naming:** `<workspace-name>-knogra.json`, a single `.json` extension. Allowlists and MIME
sniffers test the last segment; a double `.knogra.json` reintroduces an unrecognised segment for no
benefit, since identification lives in `manifest.format` inside the file.

### 5.3 Format detection

One entry point, dispatched by **sniffing content rather than trusting the extension** — so a
renamed file still opens, and a Markdown document dropped on the opener produces a useful error
rather than a parse crash.

| First bytes | Interpretation |
|---|---|
| `PK` | Legacy ZIP → JSZip path, unchanged |
| `{` with `manifest.format === "knogra-workspace"` | Workspace JSON → open |
| anything else | Rejected with a clear message |

Legacy files open **forever**. Every file in the wild and every `knogra-graphs` catalog entry keeps
working with no migration.

### 5.4 One shape, no options

**Save writes the whole workspace; Open reads the whole workspace.** There is exactly one shape and
it always opens. No subset can be produced, so no file can be mistaken for a backup, no partial
restore exists, and the user is never asked a question whose consequences they cannot see.

Publishing a graph for reading, or handing one to an assistant, is the
[Markdown document](markdown-architecture.md)'s job — that is what it is lossy and readable for.
The workspace file does not compete with it.

One existing control stays: when the workspace holds in-note images, export asks which categories to
embed (§4.1). It trades file size against image fidelity **within a file that still opens
normally** — it does not create a second format.

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
│  • importFromUrl(url, opts): Promise<boolean>               │
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
│  • knogra.settings      │  • knogra-graph DB (via Dexie)    │
│  • knogra.shelf         │    ├── nodes table                │
│  • knogra.state         │    ├── edges table                │
│                         │    ├── scenes table               │
│                         │    └── backgroundImages table     │
│                         │  • knogra-chat DB (via Dexie)     │
│                         │    └── conversations table        │
└─────────────────────────┴───────────────────────────────────┘
```

**Note:** All graph data (nodes, edges, scenes, images) is stored in 
IndexedDB via Dexie (`graph-store.ts`). Only settings, shelf items, and 
last scene ID are in localStorage.

### 6.1 Module Layout

| File | Responsibility |
|---|---|
| `workspace.ts` | Orchestration: `exportWorkspace`, `importWorkspace`, `newWorkspace`, `showImportDialog`, `importFromUrl` |
| `workspace/transfer.ts` | One export and one import function per member; owns the privacy carve-outs (§4.1) |
| `workspace/dialogs.ts` | Confirmations, image transfer, scale-to-fit, validation-error dialogs |
| `workspace/validate.ts` | Graph integrity check — informational, never a hard block |
| `workspace/envelope.ts` | Build, parse and validate the JSON envelope, and identify a file from its leading bytes (§5.2–§5.3) |
| `workspace/legacy-zip.ts` | Read-only import of legacy `.knogra` files; the only caller of `jszip` |

`envelope.ts` is **pure** — data in, data out — so it is exercisable from devtools independently of
any dialog. Dialogs living under `storage/` are pre-existing debt, tolerated because they *are* the
storage workflow's surface ([architecture.md](architecture.md) §4.2).

### 6.2 Design Decisions

1. **Direct storage access**: The workspace module reads/writes directly to localStorage and IndexedDB, not through store classes. This keeps it isolated and independent.

2. **Page reload after import/new**: Instead of complex state synchronization, we simply reload the page. All stores reinitialize from storage.

3. **Settings preserved on "New"**: User preferences (theme, animation timings, etc.) are kept when creating a new workspace.

4. **`jszip` becomes read-only**: retained solely to open legacy files (§5.1). It leaves the export path entirely, and no new dependency replaces it — `JSON.stringify` / `JSON.parse` are enough.

5. **Content is never interpreted**: the workspace module has no notion of node identity, matching, or partial application. Anything that needs those belongs to the [Markdown document](markdown-architecture.md).

---

## 7. Storage Keys (Centralized)

All storage keys are defined in `src/config/storage-config.ts`:

```typescript
// IndexedDB database names
GRAPH_DB_NAME = 'knogra-graph'
CHAT_DB_NAME  = 'knogra-chat'
PATH_DB_NAME  = 'knogra-paths'
THEME_DB_NAME = 'knogra-themes'

// localStorage keys
STATE_KEY    = 'knogra.state'      // App session state
SETTINGS_KEY = 'knogra.settings'   // User preferences (consolidated object)
SHELF_KEY    = 'knogra.shelf'      // AI suggestions

// Envelope constants (new)
WORKSPACE_FORMAT  = 'knogra-workspace'
WORKSPACE_VERSION = '2.0'
```

Four databases, not two — a workspace file that forgets paths or themes is not lossless.

---

## 8. Dependencies

| Dependency | Purpose |
|------------|---------|
| `jszip` | **Read-only** — opening legacy `.knogra` files (§5.1) |
| `dexie` | IndexedDB access (already in project) |

No new dependency is introduced by the JSON format.

---

## 9. Error Handling

| Scenario | Handling |
|----------|----------|
| Unrecognised or corrupt file | Show error message, abort |
| A Markdown document offered to Open | Rejected by sniffing with a clear message, not a parse crash (§5.3) |
| Version mismatch | Warn user, attempt anyway |
| Missing member | Use defaults — every member is optional on read |
| Graph integrity errors | Warn and let the user proceed; validation is informational, never a hard block |
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

Every time a scene is opened (via `scene.open()`), the scene ID is saved to `localStorage` inside
`knogra.state`. This ensures the user returns to their last-viewed scene on next app load.

---

## 11. Future Considerations

1. **Auto-backup**: Periodic export to browser storage or cloud
2. **Selective export**: Export only specific scenes
3. **Cloud sync**: Save/load from cloud storage
4. **Background-image bulk**: background images are the only unbounded contributor to file size and
   the only one the user cannot control on export. Candidates: an inclusion dialog mirroring the
   in-note one, or recompressing uploads to WebP, where today's 1 MB cap admits a fat PNG. Out of
   scope for the format swap, which changes no behaviour.

*Removed:* "Merge import". Combining two workspaces remains a non-goal; refreshing a graph's content
without losing scenes and designs is the Markdown **Update** operation
([Markdown architecture](markdown-architecture.md)).
