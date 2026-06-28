# Knogra Architecture

> **Status:** Current  
> **Last reviewed:** 2026-06-14  
> **Authority:** Main authoritative architecture document for layers, dependency direction, module responsibilities, persistence ownership, and coding standards. For detailed scene, fold, visibility, and transition terminology, defer to [Scene Transitions](scene-transitions.md). For typed edge styling and scene-local edge type visibility, defer to [Edge Types Architecture](edge-types-architecture.md).  
> **Related:** [Documentation map](README.md), [Workspace architecture](workspace-architecture.md), [Scene transitions](scene-transitions.md), [Edge Types Architecture](edge-types-architecture.md)

## Section 1. Core Philosophy

**Modular layered architecture with vertical feature organization.**

The app uses horizontal layers at the top level (UI, Features, Background, Styles, Storage) and vertical slices inside Features. Each feature coordinates with Cytoscape and stays independent of the others.

This keeps boundaries clear, preserves predictable data flow, and keeps modules easy to reason about.

**Primary scene persistence flow:**
```
UI → Features → Cytoscape → GraphSaver → Database
```

Cytoscape is the core component responsible for manipulation and presentation of scenes. The current/real-time state of the scene is tracked by Cytoscape (not by any other state management system). Cytoscape is the **source of truth** for graph state.

Some operations are not Cytoscape-derived scene mutations and therefore write through explicit storage services instead of GraphSaver: workspace import/export, custom themes, Mermaid import/export, background image library updates, saved paths, chat notes, app mode, and cross-scene deletion cleanup. These exceptions must stay named and intentional.

**Dependency maps:** Dependency-cruiser reports live under `.ws/deps/outputs/`. The default architecture-orientation report is `.ws/deps/outputs/toprepo/toprepo-list.txt`, generated from `.ws/deps/toprepo.txt` with two-level expansion. The generator `.ws/deps/generate-deps.js` is configurable: use `+N`, `+X`, exclusions, and anchors to produce broader or narrower views of the whole codebase or a specific subsystem. When this architecture document changes in a way that affects layer boundaries, dependency direction, or module ownership, regenerate the relevant dependency map and compare it against this document.

---

## Section 2. Lexicon

### Graph vs Scene
**Graph** — The complete knowledge graph stored in the database. Contains all nodes and edges that exist, regardless of visibility.

**Scene** — A curated view/perspective on the graph. Defines:
- Which nodes and edges to display
- Where to position each node
- How to style each node (design, scale)
- Viewport settings (zoom, pan)
- Background images
- Fold state (which subtrees are collapsed)
- Edge type visibility state

**Key insight:** The same node can appear in multiple scenes with different positions and styles.

### Included vs Visible
A node's relationship to a scene has two distinct levels:

**Included** — The node is an element of the scene (stored in the scene's database record under `scene.nodes`). It exists in Cytoscape when the scene is loaded, but may be hidden.

**Visible** — The node is included AND not folded (hidden). It is rendered on screen and the user can see and interact with it.

This distinction matters for transition routing: a morph transition requires the target scene's central node to be **visible** (not merely included) in the current scene. A folded node has no visual presence to morph from, so the close+open path is used instead.

### Scene vs SceneBackground
**Scene** — Manages the **graph layer** (nodes, edges, positions, styles via Cytoscape)
**SceneBackground** — Manages the **canvas layer** (background images via BackgroundRenderer)

These are peer features with distinct responsibilities.

### Path
**Path** — A sequence of scenes produced by user navigation. It may exist in memory during a session or be persisted for later replay.

### Workspace
**Workspace** — Complete application state bundle exported as a `.knogra` file. Includes graph data, settings, chat history, saved paths, custom themes, and app state.

### Shelf
**Shelf** — Collection of AI-suggested nodes waiting to be placed on the graph. Managed by NodeShelf, displayed by SuggestionPanel.

### Operation Verbs
To distinguish between graph operations and scene operations:

| Scope | Verbs | Examples |
|-------|-------|----------|
| **Graph** (database) | Add, Delete, Create, Update | `addNode()`, `deleteEdge()` |
| **Scene** (view) | Include, Exclude, Expand, Collapse, Show, Hide | `includeNode()`, `excludeEdge()` |
| **Fold** (visibility) | Fold, Unfold | `foldNode()`, `unfoldNode()` |

**Note:** Operations can be bundled — e.g., `addChild()` creates a node in the database AND includes it in the current scene.

---

## Section 3. Architecture Layers

### 3.1 Layer Overview

```mermaid
graph TD
    subgraph UI["UI Layer"]
        Components[Components<br/>editors, pickers, menus]
        Panels[Panels<br/>chat, suggestions, path]
        Keyboard[Keyboard Handler]
    end

    subgraph Features["Features Layer"]
        Scene[Scene]
        SceneBg[SceneBackground]
        Transition[Transition]
        Path[Path]
        NodeF[Node]
        EdgeF[Edge]
        GraphF[Graph]
        QuizF[Quiz]
    end

    subgraph Background["Background Layer"]
        BgRenderer[BackgroundRenderer]
    end

    subgraph Styles["Styles Layer"]
        StyleGen[StyleGenerator]
        Themes[Themes]
        Designs[Node Designs]
    end

    subgraph Storage["Storage Layer"]
        GraphStore[GraphStore]
        GraphSaver[GraphSaver]
        AppState[AppStateManager]
        AppMode[AppMode]
        PathStore[PathStore]
        ChatStore[ChatStore]
        ThemeStore[ThemeStore]
        Mermaid[Mermaid]
        Workspace[Workspace]
    end

    subgraph Foundation["Foundation"]
        Core[Core Types]
        Config[Config]
        Events[EventBus]
    end

    subgraph External["External"]
        Cytoscape[Cytoscape<br/>source of truth]
        IndexedDB[(IndexedDB)]
        LocalStorage[(localStorage)]
    end

    UI -->|calls| Features
    Features -->|mutates| Cytoscape
    Features -->|uses| Background
    Features -->|uses| Styles
    Features -->|reads| Storage
    Background --> Core
    Styles --> Core
    Styles -->|reads| Storage
    
    Cytoscape -->|events| GraphSaver
    GraphSaver -->|writes| GraphStore
    GraphStore -->|persists| IndexedDB
    PathStore -->|persists| IndexedDB
    ChatStore -->|persists| IndexedDB
    ThemeStore -->|persists| IndexedDB
    
    AppState -->|persists| LocalStorage
    Config -->|persists| LocalStorage
    
    Features --> Core
    Features --> Config
    Storage --> Core
```

**Dependency direction:** UI → Features → Background/Styles/Storage → Core

### 3.2 Foundation Layers

#### Core (`src/core/`)
Type definitions and interfaces. **No logic.**

| File | Purpose |
|------|---------|
| `main-types.ts` | Primitive IDs, Node, Edge, Scene, Path, provider, and app mode types |
| `style-types.ts` | Theme, visual primitive, node style, edge style, and Cytoscape style types |
| `background-types.ts` | Background image and filter types |
| `design-types.ts` | Node/edge design system types |
| `chat-types.ts` | Chat persistence types |
| `quiz-types.ts` | Runtime quiz configuration, snapshot, and node-status contracts |

#### Config (`src/config/`)
Application settings and user preferences.

| File | Purpose |
|------|---------|
| `index.ts` | `getSetting()` facade |
| `storage-config.ts` | Database names, keys, schemas |
| `setting-definitions.ts` | All configurable settings with defaults |
| `transition-settings.ts` | Animation timing configurations |
| `ai-settings.ts` | AI provider settings |

**Storage:** Persisted to localStorage with `knogra.` prefix.

### 3.3 Storage Layer (`src/storage/`)

#### Graph Persistence

**GraphStore** (`graph-store.ts`)
- IndexedDB-backed cache of nodes, edges, edge types, scenes, and background images
- Read by Features, UI, Background, Styles, diagnostics, and storage workflows
- Written by GraphSaver for Cytoscape-derived scene persistence; explicit storage workflows handle seeding, workspace import, Mermaid import, deletion cleanup, background image library changes, theme changes, and scene auto-creation

**GraphSaver** (`graph-saver.ts`)
- Listens to Cytoscape events and debounced-saves scene state to GraphStore
- Handles deletion queues and scoped `suspend(reason)` / `resume(token)` semantics so transitions, fold/unfold, collapse/expand, and View mode do not interfere with one another

#### Session State

**AppStateManager** (`app-state.ts`)
- Manages session state in localStorage (`knogra.state`)
- Tracks last opened scene, persisted app mode (`view` / `edit`), and one-shot startup fit requests
- Listens to EventBus `sceneChanged` events
- Static class with helpers for reading, writing, and clearing app state

**AppMode** (`app-mode.ts`)
- Runtime View/Edit mode state that persists through AppStateManager, suspends GraphSaver in View mode, and emits `appModeChanged`

#### Auxiliary Stores

**PathStore** (`path-store.ts`)
- Separate IndexedDB (`knogra-paths`) for saved navigation paths
- Independent cache and CRUD operations

**ChatStore** (`chat-store.ts`)
- Separate IndexedDB (`knogra-chat`) for AI conversations keyed by `nodeId`

**ThemeStore** (`theme-store.ts`)
- Separate persistence for custom themes merged into `styles/themes.ts`

**Mermaid** (`mermaid.ts`, `mermaid-flowchart.ts`, `mermaid-import-dialog.ts`)
- Graph-only interchange path for Mermaid flowcharts; it replaces graph data without preserving the rest of the workspace

#### Workspace

**Workspace** (`workspace.ts`)
- Export/import complete workspace as `.knogra` ZIP file
- Delegates transfer, dialogs, and validation to `storage/workspace/`
- Collects graph, settings, chat, paths, backgrounds, custom themes, shelf, and app state

### 3.4 Background And Styles Layers

#### Background (`src/background/`)

**BackgroundRenderer** (`background-renderer.ts`)
- Canvas layer for scene background images
- Positioned behind Cytoscape (z-index: 0)
- Images positioned in graph coordinates
- Transforms with zoom/pan events
- Injected into features that need it (SceneBackground, Transition)

**Design rationale:** Background rendering stays separate from Cytoscape so it can be optimized independently.

#### Styles (`src/styles/`)

**StyleGenerator** (`style-generator.ts`)
- Pure stylesheet generation and stylesheet-update helpers for Cytoscape
- Owns node/edge style rule construction, edge type selector rules, visibility selector rules, and central/selected selector rules
- Applies styles through `cy.style().fromJson(stylesheet).update()`

**Edge visual resolver** (`edge-visual-resolver.ts`)
- Resolves declarative edge visual state from theme, edge type, edge type override, scene edge override, and scene-local edge type visibility
- Used by scene opening and transition paths so animations target resolved edge opacity rather than hardcoded visibility values

**Themes** (`themes.ts`, `theme-store.ts`)
- Built-in and custom color themes
- Scene theme is resolved by `scene.themeId`; there is no separate global current theme state

**Designs** (`styles/designs/`)
- Built-in node renderers and design registry that converts node data, scene design parameters, and theme into Cytoscape node styles

### 3.5 Features Layer (`src/features/`)

#### Feature Organization Patterns

**Small features** (single file):
```
node.ts         # All logic in one class
edge.ts
graph.ts
scene-background.ts
```

**Large features** (folder with utilities):
```
scene/
  scene.ts        # Main feature class
  traversal.ts    # Feature-owned pure utilities
  elements.ts     # Element management helpers
  viewport.ts     # Viewport calculations

transition/
    transition.ts            # Public transition facade and routing
    opening-closing/         # Open/close scene animation path
    scene-to-scene/          # Morph transition path
    scene-factory-utils.ts   # Scene auto-creation utilities
    fold-state-handler.ts    # Fold-state application after scene changes

path/
  path.ts         # Main feature class
  history.ts      # Navigation history logic
```

**Subclass extraction pattern:**
When a feature has many related methods sharing dependencies, extract them into a helper class (not pure functions). The helper class holds shared state such as `cy`, `container`, or `renderer`; the main feature class orchestrates.

Example: transition helpers in `transition/opening-closing/` and `transition/scene-to-scene/` hold shared dependencies and execute specific animation or classification steps while `Transition` routes public actions.

**Shared utilities** (`features/utils/`):
Used by 2+ features. Split by purity:

| Type | Location | Rules |
|------|----------|-------|
| Pure | `utils/pure/` | No side effects, no Cytoscape access |
| Cy-mutating | `utils/cy/` | Accept `cy` as parameter |

**Dependency rules:**
```
Features (scene.ts, node.ts, etc.)
  ↓ can use
Shared Utils (utils/cy/, utils/pure/)
  ↓ can use
Core Types only

❌ Shared utils CANNOT import from features
❌ Pure utils CANNOT import cy utilities
```

#### Feature Catalog

| Feature | Location | Purpose |
|---------|----------|---------|
| **Scene** | `scene/scene.ts` | Graph layer: node/edge composition, positions, styles (via Cytoscape) |
| **SceneBackground** | `scene-background.ts` | Canvas layer: background images (via BackgroundRenderer) |
| **Node** | `node.ts` | Node design and content operations |
| **Edge** | `edge.ts` | Edge design and content operations |
| **Graph** | `graph.ts` | Graph construction: add/delete nodes and edges |
| **Transition** | `transition/transition.ts` | Animated scene-to-scene navigation |
| **Path** | `path/path.ts` | Navigation history tracking and persistence |
| **Quiz** | `quiz.ts` | Runtime recall mode: hides sampled node content and tracks reveal/self-grade state |

**FeatureAPI** (`feature-api.ts`) — Facade exposing all features. No business logic.

### 3.6 Events Layer (`src/events/`)

**EventBus** (`event-bus.ts`)
- Typed publish/subscribe for cross-module communication
- Enables cross-module notifications without direct module imports

**Cytoscape Custom Events:**

| Event | Payload | Emitted by | Consumed by |
|-------|---------|------------|-------------|
| `scene:changed` | `sceneId` | Transition | Path |
| `path:updated` | (none) | Path | PathPanel |

**Usage pattern:**
```typescript
// Emitting (transition.ts)
this.#cy.emit('scene:changed', [targetSceneId]);

// Subscribing (path.ts)
this.#cy.on('scene:changed', (_event, sceneId) => {
  this.#history.push(sceneId);
});
```

**EventBus events** (for non-Cytoscape communication):

| Event | Payload | Emitted by | Consumed by |
|-------|---------|------------|-------------|
| `sceneChanged` | `{sceneId, centralNodeId}` | Transition | ChatSession, NodeShelf, AppStateManager, diagnostics, FoldBadge |
| `transitionStart` | (none) | Transition | UI transition guards |
| `transitionEnd` | (none) | Transition | UI transition guards |
| `appModeChanged` | `{mode}` | AppMode | Quiz, SuggestionPanel, and other mode-aware UI |

### 3.7 AI Module (`src/ai/`)

AI-assisted learning companion. Provides contextual help, suggestions, and graph modifications.

**Structure:**
| File | Purpose |
|------|---------|
| `types.ts` | Message, Action, Conversation, ShelfItem types |
| `providers/provider.ts` | AI provider interface + factory |
| `providers/gemini-adapter.ts` | Gemini API implementation |
| `providers/openrouter-adapter.ts` | OpenRouter API implementation |
| `context-builder.ts` | Builds system prompt from graph state |
| `chat-session.ts` | Manages conversation state |
| `node-shelf.ts` | Suggestion state; orchestrates placement via FeatureAPI |
| `shelf-design-selector.ts` | Selects designs for shelf items |

**NodeShelf** is the AI→Features integration point. It:
- Manages suggested nodes per scene, converts AI actions to shelf items, and calls FeatureAPI when the user approves placement

**Storage:**
- ChatStore (`storage/chat-store.ts`) — Separate IndexedDB for conversations

**Integration:**
- **Reads:** `graphStore` (read-only access to graph data)
- **Writes:** `FeatureAPI` (all graph modifications go through features)
- **Subscribes:** `sceneChanged` event via EventBus

### 3.8 UI Layer (`src/ui/`)

UI owns DOM rendering, dialogs, menus, keyboard handling, and ergonomic interaction flows. Domain mutations should go through Features or explicit storage services. Some current UI modules still write directly to stores; those are named technical debt.

#### Components (`ui/components/`)

**UIComponentAPI** (`ui-component-api.ts`) — Facade for all components.

| Component | Purpose |
|-----------|---------|
| `context-menu.ts` | Right-click menus |
| `node-editor.ts` | Edit node modal |
| `edge-editor.ts` | Edit edge modal |
| `edge-type-manager.ts` | Workspace edge type registry and type-level style editor |
| `edge-type-visibility-modal.ts` | Scene-local **Edges visibility** controls |
| `node-manager.ts` | Node management and scene cleanup dialog ⚠️ |
| `node-picker.ts` | Node selection dialog |
| `scene-picker.ts` | Scene selection dialog |
| `path-picker.ts` | Saved path picker/editor ⚠️ |
| `background-editor.ts` | Background image picker/editor ⚠️ |
| `theme-editor.ts` | Custom theme editor |
| `quiz-panel.ts` | Floating quiz controls for runtime recall mode |
| `settings-modal.ts` | Application settings |
| `connection-badge.ts` | Connection count badges |
| `fold-badge.ts` | Fold state affordance |
| `shortcut-overlay.ts` | Keyboard shortcut overlay |

⚠️ **Technical debt:** `background-editor.ts`, `path-picker.ts`, and parts of `node-manager.ts` directly access storage. Prefer feature/service facades for future edits.

#### Panels (`ui/panels/`)

**PanelAPI** (`panel-api.ts`) — Facade for all panels.

| Panel | Purpose |
|-------|---------|
| `chat-panel/` | Chat, notes, tutorial timeline, AI controls ⚠️ |
| `suggestion-panel.ts` | AI-suggested nodes shelf |
| `path-panel.ts` | Navigation breadcrumbs ⚠️ |

⚠️ **Technical debt:** `path-panel.ts` writes saved paths directly, and `chat-panel/chat-note-editor.ts` writes notes directly to ChatStore. These should eventually move behind feature/service facades.

#### Keyboard Handler

**KeyboardHandler** (`keyboard-handler.ts`)
- Keyboard shortcuts → calls `features.*`

### 3.9 Utils (`src/utils/`)

Pure functions and external package wrappers shared across layers.

| File | Purpose |
|------|---------|
| `mathjax.ts` | MathJax initialization |

**Note:** Most utilities are feature-specific and live in `features/utils/`.

---

## Section 4. Dependency Rules & Constraints

### 4.1 Layer Dependency Direction

```
UI Layer
    ↓ calls
Features Layer
    ↓ uses
Background / Styles / Storage
    ↓
Core
```

### 4.2 Architectural Constraints

| Layer | Constraint |
|-------|------------|
| **UI** | May use Cytoscape for ephemeral interaction state such as selection, rendered positions, temporary input blocking, and overlay positioning. Domain mutations should go through Features or explicit storage services. |
| **UI** | Domain mutations should go through Features or explicit storage services; direct store writes are technical debt unless the UI component is itself the storage workflow surface |
| **Features** | Cytoscape-derived scene mutations should flow through Cytoscape and GraphSaver |
| **Features** | Direct GraphStore writes are allowed only for named non-Cytoscape operations: scene auto-creation, theme/background persistence, graph deletion cleanup, workspace/Mermaid import, seeding, and diagnostics/validation workflows |
| **Features** | Independent of each other (no cross-feature imports) |
| **Features** | Config is read-only (use `getSetting()`) |
| **Background** | Canvas rendering only; scene membership and graph mutations stay outside the renderer |
| **Styles** | Style generation only; business decisions stay in Features/UI |
| **Storage** | Stores own persistence mechanics and import/export workflows; GraphSaver owns autosave from Cytoscape events |
| **Shared Utils** | Cannot import from feature files |

### 4.3 Critical Contracts

#### Cytoscape Scratch Space
Used for coordination between layers:

```typescript
cy.scratch('currentSceneId', sceneId)  // Track active scene
cy.scratch('activeNodeId', nodeId)     // Track selected node
cy.scratch('nodesToDelete', [ids])     // Queue for deletion
cy.scratch('edgesToDelete', [ids])     // Queue for deletion
cy.scratch('foldedNodes', state)       // Runtime fold state for current scene
```

#### Scene Ownership
- Scene determines **which** nodes/edges are visible
- Scene determines **where** each node is positioned
- Scene determines **how** each node is styled
- Same node can exist in multiple scenes with different positions/styles

#### Delete vs Exclude

| Operation | Method | Effect |
|-----------|--------|--------|
| **Delete** | `graph.deleteNode()` | Removes from database permanently. Node disappears from ALL scenes. |
| **Exclude** | `scene.excludeNode()` | Removes from current scene only. Node still exists, can be included elsewhere. |

#### Persistence Ownership
- Cytoscape-derived scene changes are persisted by GraphSaver.
- GraphSaver reads Cytoscape elements, viewport, `currentSceneId`, deletion queues, and `foldedNodes` scratch state.
- Explicit storage workflows may write stores directly when the state does not originate from Cytoscape events.
- Direct writes must be local, named, and documented by the owning module.

---

## Section 5. Data Flow

### 5.1 Write Path: Cytoscape-Derived Scene Mutations

```
User Action
    ↓
UI Component (context menu, editor, keyboard)
    ↓
Feature Method (features.scene.includeNode, features.node.update, etc.)
    ↓
Cytoscape Mutation (cy.add, node.data(), node.remove, etc.)
    ↓
Cytoscape Event (add, remove, data, free, viewport)
    ↓
GraphSaver Listener
    ↓
Debounced Save (500ms)
    ↓
Extract State from Cytoscape
    ↓
GraphStore Write (updateScene, updateNode, deleteNode, etc.)
    ↓
IndexedDB Persistence
```

### 5.1b Write Path: Explicit Storage Workflows

```
User Action or startup/import flow
    ↓
Owning UI / Feature / Storage service
    ↓
Explicit store method or workspace transfer helper
    ↓
IndexedDB / localStorage persistence
```

Examples: workspace import/export, Mermaid graph import/export, custom themes, saved paths, chat notes, background image library, app mode, seed workspace, and cross-scene deletion cleanup.

### 5.2 Read Path (Queries)

```
UI or Feature needs data
    ↓
Read from GraphStore cache (graphStore.nodes, graphStore.scenes, etc.)
    ↓
Return immediately (in-memory, fast)
```

**Note:** Cache is populated on app init and updated by GraphSaver or explicit storage workflows. UI/Features should prefer feature/service facades for writes; existing direct writes are named debt or explicit workflow surfaces.

### 5.3 Event Flow

```
Scene transition occurs
    ↓
Transition emits cy.emit('scene:changed', [sceneId])
    ↓
    ├── Path.#history.push(sceneId) + cy.emit('path:updated')
    ├── AppStateManager.saveLastSceneId(sceneId)
    └── eventBus.emit('sceneChanged', {sceneId, centralNodeId})
            ↓
            ChatSession / NodeShelf / diagnostics / UI listeners react
```

### 5.4 Workspace Export/Import Flow

**Export:**
```
User triggers export
    ↓
Workspace.exportWorkspace()
    ↓
Collect from all sources:
    - GraphStore (nodes, edges, scenes, backgroundImages)
    - localStorage (settings, shelf, app-state)
    - ChatStore (conversations)
    - PathStore (saved paths)
    - ThemeStore (custom themes)
    ↓
Create ZIP with manifest
    ↓
Trigger browser download (.knogra file)
```

**Import:**
```
User selects .knogra file
    ↓
Workspace.importWorkspace(file)
    ↓
Validate manifest
    ↓
Clear all existing data
    ↓
Restore each store from ZIP
    ↓
Reload page to reinitialize app
```

---

## Section 6. Design Decisions

### Why Cytoscape is Source of Truth
- Visual library owns the rendering state
- Events naturally trigger on user interactions
- Single clear mutation point
- No sync conflicts between multiple state stores

### Why GraphSaver is Separate from Features
- Features focus on business logic
- GraphSaver is pure infrastructure (auto-save)
- It can be scoped-suspended during transitions, fold/unfold, collapse/expand, and View mode

### Why Direct Storage Workflows Exist
- Not all persisted state originates from Cytoscape events
- Workspace import/export, Mermaid interchange, paths, chat notes, themes, background image library, and app mode have their own storage contracts
- Keeping those as explicit workflows is clearer than forcing unrelated data through Cytoscape
- The tradeoff is stricter discipline: direct writes must be named, local, and reviewed as architecture exceptions

### Why Scenes Store Positions
- Enables multiple perspectives on same graph
- Example: Node "Central Dogma" might be:
  - Large and centered in "Molecular Biology" scene
  - Small and peripheral in "History of Science" scene
- Positions are part of the "view", not the "data"

### Why In-Memory Cache in GraphStore
- Fast reads for UI rendering
- Database reads are async and slow
- Cache updated by GraphSaver after each write
- Trade-off: memory vs speed (acceptable for <10k nodes)

### Why Separate Background And Styles Layers
- Cytoscape handles graph elements; canvas handles backgrounds
- StyleGenerator handles Cytoscape stylesheet construction
- Separation allows independent optimization and cleaner injection into features that need it

### Why Subclass Extraction Pattern
- Large features benefit from extracting method groups into helper classes
- Maintains OOP encapsulation (shared `cy`, `container` references)
- Reduces main file size while keeping related code together
- Alternative to pure function extraction when methods share state

---

## Section 7. Coding Standards

### 7.1 Naming Conventions
- Use shared lexicon (Graph vs Scene, Add vs Include, etc.)
- Use specific descriptive names
- Avoid generic, ambiguous, or overloaded terms
- Strive for short names; avoid redundant components

### 7.2 File Size Limits
- Target: ~300 lines maximum per file
- When exceeded, extract to:
  - Pure utilities (stateless functions)
  - Feature-owned utilities (same folder)
  - Subclasses (for OOP extraction with shared state)

### 7.3 Nesting Limits
- Maximum 2 levels of nesting
- Use early returns to reduce nesting
- Avoid multi-level conditions and loops

### 7.4 Feature Organization
- **Single file:** When feature is simple (<300 lines)
- **Folder:** When feature needs utilities or grows complex
- **Pure extraction:** For stateless helper functions
- **Subclass extraction:** For method groups sharing dependencies
