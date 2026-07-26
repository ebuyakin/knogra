# Paths Feature Architecture

> **Status:** Current  
> **Last reviewed:** 2026-07-25  
> **Authority:** Current model for navigation history, saved paths, and the path panel.
> Sections 1–13 describe the original single-mode feature; where they conflict with Part II,
> Part II governs. Sections 14–19 describe navigation modes, the path manager, and the
> full-path generator — **implemented** (Phases 7–9, 2026-07-25).  
> **Related:** [Documentation map](README.md), [Architecture](architecture.md),
> [Restrictive regimes](architecture.md#310-restrictive-regimes-cross-layer),
> [Scene transitions](scene-transitions.md)

## 1. Overview

The Paths feature allows users to track, save, and navigate through sequences of scenes. It provides a breadcrumb-style panel showing the current navigation journey and enables saving meaningful paths for later use.

Paths serve two purposes. The first is **replay** — a graph is non-linear, but revision,
presentation, and storytelling sometimes need a line through it. The second is **audit** —
a generated path that visits every scene in the workspace lets an author verify that no scene
has been forgotten, which matters for large authored graphs.

---

## 2. Terminology

| Term | Definition |
|------|------------|
| **Path** | An ordered sequence of scenes, saved in the database |
| **Navigation History** | In-memory sequence of visited scenes (current session) |
| **Anchor Node** | The root/starting node of a graph (special node property) |
| **Path Panel** | UI component displaying the current navigation sequence |

---

## 3. Data Model

### 3.1 Path Entity (New)

```typescript
type PathId = string;

interface Path {
  id: PathId;
  name: string;
  scenes: SceneId[];
  createdAt: Date;
  updatedAt: Date;
}
```

Stored in **independent** IndexedDB database `knogra-paths` (separate from graph and chat).

### 3.2 Anchor Node (Node Property)

```typescript
interface Node {
  id: NodeId;
  title: string;
  // ... existing fields
  isAnchor?: boolean;  // Only one node per graph should have this
}
```

### 3.3 App State (`knogra.state` in localStorage)

```typescript
interface AppState {
  currentSceneId: SceneId;    // Which scene is displayed
  pathId?: PathId;            // Which saved path is loaded (null = fresh session)
  workspaceName?: string;     // For display/export
}
```

---

## 4. Runtime State

### 4.1 Navigation History (In-Memory)

```typescript
class NavigationHistory {
  scenes: SceneId[];  // Ordered sequence
  
  // Current position is determined by matching currentSceneId
  // No separate index needed
}
```

**Behaviors:**
- Grows as user navigates between scenes
- Supports back/forward navigation (`[` / `]` keys)
- Lost on page reload (unless saved as Path)
- Displayed in Path Panel

---

## 5. User Actions

| Action | Effect |
|--------|--------|
| Navigate to scene | Append scene to NavigationHistory |
| `[` key | Go back in NavigationHistory |
| `]` key | Go forward in NavigationHistory |
| Click breadcrumb | Jump to that scene in NavigationHistory |
| "Save Path" | Snapshot NavigationHistory → save to DB with name |
| "Load Path" | Replace NavigationHistory with saved Path |
| Page reload | NavigationHistory reset, load `currentSceneId` from `knogra.state` |

---

## 6. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Cytoscape (Source of Truth)              │
│                                                             │
│  • scratch('currentSceneId') — current scene                │
│  • emit('scene:changed', { sceneId }) — on scene change     │
│                                                             │
│  Updated by: transition.ts (emits event on scene change)    │
└─────────────────────────────────────────────────────────────┘
        │
        │ cy.on('scene:changed')
        ▼
┌─────────────────────────────────────────────────────────────┐
│                src/features/path/path.ts                    │
│                                                             │
│  • Listens to cy.on('scene:changed')                        │
│  • Owns NavigationHistory                                   │
│  • Provides API: getHistory(), back(), forward(), etc.      │
│  • Does NOT import other features                           │
└─────────────────────────────────────────────────────────────┘
        │                              
        │ reads from                   
        ▼                              
┌─────────────────────────────────────────────────────────────┐
│                      Path Panel (UI)                        │
│  ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐            │
│  │ QM  │ → │Wave │ → │Schr.│ → │ ●●● │ → │Curr │            │
│  └─────┘   └─────┘   └─────┘   └─────┘   └─────┘            │
│                                              ▲              │
│  [Save Path]  [Load Path]  [Toggle Panel]    │ current      │
│                                                             │
│  • Renders what path.ts provides                            │
│  • Handles user interactions (clicks, buttons)              │
└─────────────────────────────────────────────────────────────┘
        │                              ▲
        │ Save Path                    │ Load Path
        ▼                              │
┌─────────────────────────────────────────────────────────────┐
│              Database (IndexedDB - knogra-paths)            │
│                                                             │
│  path-store.ts — independent store                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ id: "path-1"                                           │ │
│  │ name: "Quantum Basics Journey"                         │ │
│  │ scenes: ["scene-qm", "scene-wave", "scene-particle"]   │ │
│  │ createdAt: 2026-01-20                                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 6.1 Event Flow

```
User clicks node to navigate
        │
        ▼
transition.ts
        │
        ├── Animates transition
        ├── cy.scratch('currentSceneId', newSceneId)
        └── cy.emit('scene:changed', { sceneId: newSceneId })
                │
                ▼
        path/path.ts (feature, listener)
                │
                ├── navigationHistory.push(sceneId)
                └── cy.emit('path:updated')
                        │
                        ▼
                path-panel.ts (UI, listener)
                        │
                        └── re-render breadcrumbs (reads from path.ts)
```

**Events:**
- `scene:changed` — emitted by `transition.ts` when scene changes
- `path:updated` — emitted by `path.ts` after history is updated

**Note:** `scene.open()` is only used on initial app load. On startup, `path.ts`
initializes NavigationHistory with the initial scene directly — no event needed.
Only `transition.ts` emits `scene:changed` for subsequent navigations.

### 6.2 Store Independence

Each store is independent with its own database:

| Store | Database | Contents |
|-------|----------|----------|
| `graph-store.ts` | `knogra-graph` | nodes, edges, scenes, images |
| `chat-store.ts` | `knogra-chat` | conversations |
| `path-store.ts` | `knogra-paths` | saved paths |

Stores do not import or depend on each other.

---

## 7. Scene Jumps (Non-Adjacent Navigation)

When user clicks a breadcrumb that's not a neighbor:

**Animation:** Simplified but smooth transition
1. Current scene fades out
2. Target scene fades in
3. No intermediate scenes animated

**Future extension:** Option for more sophisticated animations.

---

## 8. Path Panel UI

### 8.1 Location
Above the graph area, below any top nav/header.

### 8.2 Layout
Fixed height (52px), width determined by grid column (`1fr`).

Structure:
```
┌─────────────────────────────────────────────────────────────────┐
│ [🏠][💾][📂]  │  Node1 › Node2 › Node3 › ... › Current  │ [←][→] │
│   left btns  │        breadcrumbs (sliding window)     │  nav   │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Visibility
Toggle-able (keyboard shortcut or button).

### 8.4 Components
- **Left buttons**: Home (anchor), Save Path, Load Path
- **Breadcrumbs**: Scene titles as clickable items, separated by `›`
- **Right buttons**: Back (`[`), Forward (`]`)
- Current scene highlighted with colored border

### 8.5 Sliding Window Behavior

The breadcrumbs area acts as a **sliding window** over the navigation history.
Items don't scroll freely — the window slides only when necessary.

#### 8.5.1 Containment

The path panel is **fully isolated** from other layout elements:
- Fixed height in grid (not `auto`)
- `contain: strict` CSS property
- `overflow: hidden` on container

This ensures path panel content cannot affect chat panel, graph, or suggestions.

#### 8.5.2 Window Rules

| Condition | Behavior |
|-----------|----------|
| Adding item, space available | Add at right, no animation |
| Adding item, no space | Slide window right (animate), then add item |
| Going back within visible range | Highlight only, no animation |
| Going back at left edge | Slide window left (animate) to reveal previous |
| Going forward within visible range | Highlight only, no animation |
| Going forward at right edge | Slide window right (animate) to reveal next |

#### 8.5.3 Sliding Amount

When sliding is needed, remove/reveal **as many items as necessary** to fully fit the target item.
No partially visible items.

Example: Window shows `[2, 3, 4, 5, 6]`, adding long item `7`:
- If `7` doesn't fit with just removing `2`: remove `2` and `3`
- Result: `[4, 5, 6, 7]` with possible empty space on right

#### 8.5.4 Animation

- Sliding: CSS `transform: translateX()` or controlled `scrollLeft`
- Duration: ~200ms
- Easing: ease-out
- New item appears **after** slide animation completes

#### 8.5.5 Loading a Path

When loading a saved path:
- Position window at the **start** (first scene selected)
- Configurable setting for "load at start" vs "load at end" (future)

#### 8.5.6 Implementation Approach

**Virtual Window (render only visible items):**
- Only render items that fit in the visible window
- Container: `overflow: hidden`, no scrolling
- Track `windowStart` and `windowEnd` indices
- Measure item widths in hidden container before rendering
- Re-render when window needs to shift

This approach was chosen because:
- No scroll state to manage or preserve
- Left-most item naturally snaps to container edge
- No partial items possible (they're simply not rendered)
- Simpler mental model: decide what to show, then show it

---

## 9. Anchor Node

### 9.1 Purpose
Marks the conceptual root of the graph (e.g., "Quantum Mechanics" for a physics study graph).

### 9.2 Setting Anchor
- Context menu on node → "Set as Anchor"
- Only one anchor per graph (setting new one clears old)

### 9.3 Usage
- Default starting point for computed paths
- Visual indicator in graph (TBD: badge, icon, border?)
- First node created could be auto-set as anchor

---

## 10. Implementation Phases

### Phase 1a: Path Feature Foundation (files: 2) ✅
- [x] Create `src/features/path/` folder
- [x] Move `src/features/transition/history.ts` → `src/features/path/history.ts`
- [x] Create `src/features/path/path.ts` — Path class, owns NavigationHistory, listens to `cy.on('scene:changed')`
- [x] Emits `cy.emit('path:updated')` after history changes

### Phase 1b: Wire Up Path Feature (files: 3) ✅
- [x] Add `cy.emit('scene:changed')` to `transition.ts` (after scene change)
- [x] Remove history management from `transition.ts`
- [x] Update `feature-api.ts` — add `path` to FeatureAPI
- [x] Update `main.ts` — initialize path feature with starting scene

### Phase 1c: Keyboard Handler Migration (files: 1) ✅
- [x] Update `keyboard-handler.ts` — change `transition.back/forward()` → `path.back/forward()`

### Phase 2: Path Panel UI (files: 3) ✅
- [x] Create `src/ui/panels/path-panel.ts` — listens to `cy.on('path:updated')`, renders breadcrumbs
- [x] Create `src/styles/path-panel.css`
- [x] Highlight current scene
- [x] Update `panel-api.ts` — add PathPanel
- [x] Home button (navigate to anchor)
- [x] Save/Load buttons
- [x] First/Last navigation buttons (`«`, `»`)
- [x] VS Code style breadcrumbs (plain text, underline highlight)

### Phase 2b: Path Panel Isolation (files: 1) ✅
Ensure path panel cannot affect other layout elements.
- [x] Change grid row from `auto` to fixed height (`52px`)
- [x] Add `contain: strict` to `#path-panel`
- [x] Verify: add many items, confirm no impact on chat/graph/suggestions

### Phase 2c: Virtual Window (files: 2) ✅
Implement virtual window behavior per Section 8.5.
- [x] Change `overflow-x: auto` to `overflow: hidden` in CSS
- [x] Track visible window state (`#windowStart`, `#windowEnd` indices)
- [x] Implement `#measureItemWidths()` — measures all items in hidden container
- [x] Implement `#calculateVisibleWindow()` — determines which items fit
- [x] Only render items in visible window range
- [x] On back/forward: re-render only when at window edge
- [x] No partial items visible — items not in window are not rendered

### ~~Phase 3: Breadcrumb Navigation~~ (SKIPPED)
Standard transition animation works well for non-adjacent jumps. No special handling needed.

### Phase 4: Path Persistence (files: 3) ✅
- [x] Add `PathId`, `Path` types to `main-types.ts`
- [x] Create `src/storage/path-store.ts` — independent Dexie DB
- [x] Add `PATH_DB_NAME` to `storage-config.ts`
- [x] "Save Path" button + name prompt
- [x] "Load Path" button + path picker

### Phase 5.1: Anchor Node (files: 2) ✅
- [x] Add `isAnchor` property to Node type
- [x] Context menu action: "Set as Anchor"
- [ ] Visual indicator in graph (deferred)

### Phase 5.2: Panel Toggle Shortcut (deferred)
- [ ] Discuss how to wire keyboard-handler to panels
- [ ] Add `P` key to toggle path panel visibility

### Phase 5.3: Window Resize Handling (deferred)
- [ ] Add ResizeObserver to path panel
- [ ] Recalculate visible window on width change
- [ ] Adjust scrollLeft if current item would be out of view

### Phase 6: Advanced (Future)
- [ ] Compute shortest path between nodes
- [ ] Auto-travel (slideshow mode)
- [ ] Path editing (remove/insert scenes)

---

## 11. Files to Create/Modify

| File | Change |
|------|--------|
| `src/features/path/path.ts` | **New** — Path class, owns NavigationHistory, listens to cy |
| `src/features/path/history.ts` | **Move** from `src/features/transition/history.ts` |
| `src/features/transition/transition.ts` | Remove history management, add `cy.emit('scene:changed')` |
| `src/features/feature-api.ts` | Add `path` to FeatureAPI |
| `src/main.ts` | Initialize path feature |
| `src/ui/keyboard-handler.ts` | Use `path.back/forward()` instead of transition |
| `src/ui/panels/path-panel.ts` | **New** — UI, listens to `cy.on('path:updated')` |
| `src/styles/path-panel.css` | **New** — Panel styling |
| `src/core/main-types.ts` | Add `PathId`, `Path` types (Phase 4) |
| `src/storage/path-store.ts` | **New** — Independent Dexie DB (Phase 4) |
| `src/config/storage-config.ts` | Add `PATH_DB_NAME` (Phase 4) |

**Not modified:** `graph-store.ts`, `chat-store.ts` — remain independent.

---

## 12. Resolved Questions

1. **Path panel default state**: Visible (configurable in settings)
2. **Empty history**: Shows single item (current scene)
3. **Duplicate scenes in path**: Yes, record history as-is (A→B→A allowed)

## 13. Navigation History Behavior

Browser-like back/forward:

```
Navigate: A → B → C → D     History: [A, B, C, D], current = D
Back ([):                    History: [A, B, C, D], current = C
Back ([):                    History: [A, B, C, D], current = B
Forward (]):                 History: [A, B, C, D], current = C
Navigate to E:               History: [A, B, E], current = E
                             (C and D dropped — forward history cleared)
```

---

# Part II — Navigation Modes, Path Manager, Full Path Generator

> **Status:** Implemented (Phases 7–9).  
> **Agreed and built:** 2026-07-25.  
> Supersedes Part I wherever the two disagree — notably §5 (loading a path no longer
> replaces the history array) and §8.2 (the panel's button group).

## 14. Navigation Modes

### 14.1 The Problem

Sections 1–13 describe a single `NavigationHistory` serving two incompatible jobs. Loading a
saved path replaces the history array, but the array then keeps browser semantics: any graph
navigation pushes onto it, truncates everything after the cursor, and (past the size cap)
shifts entries off the front. A loaded path is therefore silently destructible — the user
clicks one node halfway through a tour and the remainder is gone.

The fix is to name the two jobs.

### 14.2 The Two Modes

| | **History mode** | **Path mode** |
|---|---|---|
| Purpose | Free travel; *makes* paths | Replay; *consumes* a path |
| Sequence | Grows and truncates as you navigate | **Immutable** |
| Graph navigation | Normal | Blocked (§14.4) |
| Node/edge/scene deletion | Normal | Blocked (§14.6) |
| All other editing | Normal | **Normal** — unrestricted |
| Breadcrumbs | Plain labels | **Numbered** (`12. Wave function`) |
| Path button | Normal | **Accent colour (active)** |
| Backing structure | `NavigationHistory` | `PathCursor` |

History mode is the default and is unchanged from Part I. Path mode is entered by loading or
generating a path, and exited explicitly.

**Rationale for immutability:** a path is an artefact. Editing it is a deliberate act performed
in the Path Manager (§15), not a side effect of walking it.

**Rationale for blocking navigation rather than tracking "off-path" excursions:** an off-path
state requires the user to remember which mode they are in and where they strayed. Blocking
makes the mode total and self-evident — in path mode there is exactly one way to move.

### 14.3 Mode Transitions

```
                  load / generate a path
   History mode ─────────────────────────▶ Path mode
        ▲                                      │
        └──────────────────────────────────────┘
                  exit (explicit)
           path becomes the new history,
           cursor position preserved
```

On exit, the path's scenes are loaded into `NavigationHistory` with the cursor where the user
left off, and normal browser semantics resume. The saved `Path` record is never modified by
either transition — the store is written only by the Path Manager.

**Entering** path mode: loading a path from the manager, or generating one and choosing to walk it.
**Exiting** path mode: the exit control on the panel, or confirming the Home button prompt (§15.4).

### 14.4 Navigation Blocking — Enforcement Model

Follows the enforcement rule in
[architecture.md §3.10](architecture.md#310-restrictive-regimes-cross-layer): the consequence of
a mode belongs to the owner of the mode, expressed through EventBus, never through a
cross-feature import (§4.2 of the architecture).

```
Path (feature, owns the mode)
   │
   │ eventBus.emit('pathModeChanged', { active, pathId, name })
   │
   ├──▶ Transition ....... sets #pathModeActive; goToSceneByNode() early-returns
   │                       (ENFORCEMENT — navigation)
   │
   ├──▶ Graph ............ sets #pathModeActive; deleteNode / deleteNodeFromGraph /
   │                       deleteEdge early-return  (ENFORCEMENT — deletion, §14.6)
   │
   ├──▶ PathPanel ........ numbering, exit control, Path button active state
   ├──▶ ContextMenu ...... greys out "Go to node's scene (G)", delete items
   └──▶ NodeManager ...... greys out open-scene, delete, and clear-scenes actions
                           (AFFORDANCES — honesty, not enforcement)
```

**Why the guard sits in `Transition.goToSceneByNode()`:** it is the single funnel for all
graph-initiated navigation, and it already hosts a mode guard of exactly this shape
(`if (!targetScene && !isEditMode()) return;`). `goToSceneFromPath()` is deliberately *not*
guarded — that is the path's own movement.

**Rejected alternatives:**
- *Guard at each UI call site.* The invariant "path mode ⟹ navigation blocked" would live in five
  places and drift as entry points are added.
- *UI acquires a lock on Transition.* The lock would be applied by the panel rather than by the
  mode's owner, so entering path mode by any other route would silently skip it.

**Known bypass:** Node Manager opens scenes via `closeScene()` + `openScene()` rather than the
funnel. `openScene` cannot be locked — the panel's own Home button uses it. Node Manager is
therefore handled as an affordance (greyed action), which is acceptable because it is an
explicit UI offer rather than a gesture.

### 14.5 Affordance Table

| Entry point | Behaviour in path mode |
|---|---|
| Double-tap node | Silent no-op |
| Context menu → "Go to node's scene (G)" | Greyed out |
| Keyboard `G` / `Shift+G` | Silent no-op |
| Node Manager → open scene | Greyed out |
| Context menu → delete node / delete edge | Greyed out (§14.6) |
| Keyboard `D` / `Del` | Silent no-op (§14.6) |
| Node Manager → delete / clear scenes | Greyed out (§14.6) |
| `[` `]`, `«` `»`, breadcrumb clicks | Work normally |
| All other editing (create, edit, fold, layout, design) | Works normally |
| Home | Works, after "Exit path mode?" confirmation |

The F1 shortcut overlay (`config/shortcut-definitions.ts`, the single source of truth) gains a
note on the `G` and `[ / ]` entries that navigation is path-constrained while a path is loaded.

**Principle:** explicit offers (menus, buttons) must tell the truth and are greyed out. Gestures
(double-tap, shortcut keys) make no promise and may no-op silently. The mode is signalled
persistently by the numbered breadcrumbs and the accent-coloured Path button, so a silent
no-op reads as "I am touring" rather than "the app froze".

### 14.6 Deletion Blocking

A path is immutable, so it cannot self-correct if a scene it contains is deleted while being
walked. Rather than add machinery to repair a cursor mid-walk, path mode removes the cause:
**node, edge, and scene deletion are blocked while a path is being walked.**

Everything else stays live. Node and edge **creation**, node/edge **editing**, scene
composition (include/exclude), fold/unfold, layout, design, theme, and background are all
unrestricted — path mode is for touring an existing structure, and annotating as you go is a
legitimate part of an audit.

Per [architecture.md §3.10](architecture.md#310-restrictive-regimes-cross-layer) this is a
narrower subset of View mode's restriction held for a distinct reason: View mode protects the
graph from accidental edits; path mode protects the integrity of the sequence being walked.

**Enforcement.** All graph and scene deletion funnels through four methods, each of which already
opens with an `isEditMode()` guard — the same shape this guard takes:

| Method | Location | Path-mode behaviour |
|--------|----------|---------------------|
| `deleteNode` | `features/graph/graph.ts` | `console.warn()` + return — **silent to the user** |
| `deleteNodeFromGraph` | `features/graph/graph.ts` | returns `{success:false, error}` — Node Manager already surfaces these |
| `deleteEdge` | `features/graph/graph.ts` | `console.warn()` + return, matching its View-mode guard |
| `#handleClearScenes` | `ui/components/node-manager.ts` | guard + disabled button in `#updateButtonStates` |

**Feedback is silent, and the affordance carries the message.** `deleteNode` uses `alert()` for its
anchor and central-node guards, but those fire on conditions the user cannot see; path mode is
visible at a glance (numbered breadcrumbs, lit Path button), so an alert would be noise. This keeps
the `D` key consistent with `G`: gestures no-op quietly, menus tell the truth. Both context-menu
delete items already gate on `enabled`, so the change is one clause each:

| Menu item | Current `enabled` | Becomes |
|-----------|-------------------|---------|
| `Delete node (D)` | `editMode && !isCentralNode && !isAnchor` | `… && !pathMode` |
| `Delete edge (D)` | `editMode` | `editMode && !pathMode` |

The first three live in the `Graph` feature, which subscribes to `pathModeChanged` exactly as
`Transition` does. The fourth is UI that calls `cascadeSceneDeletion` directly — pre-existing
debt noted in architecture §3.8, not refactored here; it takes a `path.getMode()` check and a
disabled affordance, mirroring how it already handles the central-node restriction.

**Residual risk after this guard.** The only remaining ways a walked scene can disappear are
workspace import, new workspace, and Mermaid import — all of which call `clearAppState()` and
`window.location.reload()`, discarding the persisted path session and restarting in history
mode. No cursor-repair mechanism is therefore required. As a backstop, a missing scene already
degrades safely: the breadcrumb renders `Unknown` and `goToSceneFromPath()` warns and no-ops.

### 14.7 Structures

`NavigationHistory` (`features/path/history.ts`) — unchanged except the size cap (§18.1).
Serves history mode only.

`PathCursor` (`features/path/path-cursor.ts`) — **new**, pure. Holds a readonly `SceneId[]` and
an index. Exposes `back`, `forward`, `first`, `last`, `goToIndex`, `current`, `indexOf`,
`canGoBack`, `canGoForward`. Has no mutation path for the sequence.

`Path` (`features/path/path.ts`) — owns `#mode`, delegates to whichever structure is active.
**The existing public API keeps its exact signatures** (`getHistory`, `getCurrentIndex`, `back`,
`forward`, `canGoBack`, `canGoForward`, `goToFirst`, `goToLast`, `current`), so the panel's
rendering and the keyboard handler need no changes. Adds `getMode()`, `enterPathMode(path)`,
`exitPathMode()`, and the persistence methods in §15.2.

`scene:changed` handling branches by mode: history mode pushes; path mode moves the cursor if
the scene is in the path and otherwise ignores the event (which should not occur, since
graph navigation is blocked).

Cross-references to §14.6 (deletion) and §14.4 (navigation) are the two enforcement points;
everything else in the panel and manager is affordance only.

## 15. Path Manager

### 15.1 Consolidation

The panel's `Save` and `Load` buttons and the hidden right-click "Edit path…" are replaced by a
single **Path** button opening a Path Manager — the same shape as `edge-type-manager`,
`theme-editor`, `node-manager`, and `background-editor`.

Panel left group becomes: **Home** + **Path**.

This also removes a real defect: "Edit path…" is currently disabled when no paths exist, so it
cannot bootstrap the first path.

Manager contents:
- List of saved paths (name, scene count, staleness label per §15.3) → **Load** / **Edit** / **Delete**
- **Save current history as path…** (history mode only)
- **Generate ▸** — currently one entry, `Full path` (§16); the extension point for future
  generators and generator parameters

Path editing (rename, reorder, remove scenes, delete) is retained and reached from the list.

**The path being walked cannot be edited.** `PathCursor` holds its own copy of the sequence, so
reordering underneath it would leave the breadcrumbs, the stored record, and the persisted cursor
index disagreeing. `Path.updateSaved()` refuses the active path and returns `false`; the list
disables its **Edit** action, and the editor reports the refusal if path mode began after it
opened. This is the immutability rule of §14.2 applied to the store as well as the cursor — exit
first, then edit.

**Deleting** the walked path *is* allowed: `deleteSaved()` exits path mode first, which leaves a
coherent state (the sequence becomes plain history), whereas an edit cannot be reconciled.

**Walk** is likewise withheld on the active row — it could only mean "restart from the beginning",
which is not what the label says.

### 15.5 Jump List

Breadcrumbs answer *where am I*, but the virtual window only shows the handful of items that fit,
so reaching position 50 of 171 means fifty keypresses. `path-manager/path-jump-list.ts` lists the
whole sequence: filter by title, click to travel.

- **Opened by clicking the current breadcrumb** — previously inert, and the natural "where can I
  go" counterpart to "where am I". No new panel control, so the button pair stays fixed (§14.2).
- **Read-only.** This is what lets it open while walking, where the sequence editor cannot: jumping
  only moves the cursor, so it composes with path mode instead of desynchronising it.
- **Filter** matches titles case-insensitively; an all-digit query matches the 1-based position
  instead, so `50` finds scene 50 rather than every title containing "50". Enter travels when
  exactly one row remains.
- **Current row is scrolled into view on open** and is itself inert.
- Works in **both modes** — `goToIndex` is mode-agnostic, and a 200-entry history has the same
  problem as a long path.

Labels are resolved once at open, not per keystroke: each costs two linear `graphStore` scans and
filtering runs on every input event.

**Possible extension:** a visited tick per row would turn this into a genuine audit checklist,
which is close to the generator's original motivation. Out of scope — it needs visited-state
tracking, which is new persistence — but the surface supports it.

**File structure.** The component exceeds the ~300-line target (architecture §7.2), so it follows
the established facade-plus-subfolder pattern used by `ui/panels/chat-panel/`: one public-API file
beside a subfolder of its own private parts.

```
ui/components/
  path-manager.ts              # public API — the only export other modules import
  path-manager/
    path-list.ts               # saved-path list, staleness labels, generate menu
    path-sequence-editor.ts    # rename, reorder, remove scenes, delete
    path-modal-shell.ts        # overlay/modal scaffolding + label & escaping helpers
```

Naming note: `-manager` and `-editor` are both already established for *public-facing* components
with distinct meanings (`node-manager`, `edge-type-manager` vs `node-editor`, `theme-editor`), so
neither word is reused for a subfile. The facade is `path-manager` because its role matches
`node-manager` — a management surface over a collection — rather than `node-editor`, which edits a
single entity. Subfiles are named for their content, and `path-sequence-editor` says what it edits
(the sequence) without colliding with the component-level `-editor` convention.

The four helpers currently file-local to `path-picker.ts` (`escapeHtml`, `sceneLabel`,
`buildOverlay`, `renderEmpty`) move to `path-modal-shell.ts`, giving them one owner instead of
being duplicated or left behind in a file whose name no longer describes it.

### 15.2 Removing the Storage Debt

[architecture.md §3.8](architecture.md) flags `path-picker.ts` and `path-panel.ts` as technical
debt for writing `PathStore` directly. This work would otherwise add to that debt, so it pays it
off instead: path persistence moves behind the feature.

```
Before:  PathPanel / PathPicker ──▶ pathStore          (UI → Storage, flagged debt)
After:   PathManager ──▶ Path (feature) ──▶ pathStore  (UI → Features → Storage)
```

`Path` gains `listSaved()`, `saveHistoryAs(name)`, `updateSaved(path)`, `deleteSaved(pathId)`.
Features → Storage is permitted, and saved paths are already a named explicit storage workflow
(architecture §1, §5.1b).

### 15.3 Stale Paths

**Deleted scenes are already handled — no work needed.** Both cascade modules prune deleted
scenes from every saved path and delete paths that become empty:
`removeDeletedScenesFromPaths()` in `storage/node-deletion.ts`, and the deliberately independent
inline equivalent in `storage/scene-deletion.ts`. Dangling `SceneId`s do not accumulate in the
store, and §14.6 removes the in-memory case. No missing-scene count is needed in the manager.

**The staleness that does matter is the opposite one: scenes added after generation.** A
generated full path is a *snapshot*. If the workspace grows afterwards, the path silently no
longer covers it — the worst failure mode for an audit instrument, because the tour appears
complete while omitting the newest scenes.

Mitigation — `Path` gains one optional field:

```typescript
interface Path {
  // ... existing fields
  /**
   * Scene count of the workspace when this path was generated.
   * Present only on generated paths; absent on hand-recorded ones.
   * Compared against graphStore.scenes.length to detect snapshot staleness.
   */
  generatedSceneCount?: number;
}
```

The Path Manager compares it to the live scene count and labels divergence:
`140 scenes · workspace now has 145 — regenerate`.

Policy: **regenerate, do not repair.** Regeneration is one click, and an incrementally patched
path would lose the traversal order that makes it readable.

### 15.4 Home Button

Remains enabled in path mode. Pressing it prompts `Exit path mode?` (native `confirm()`, matching
the established pattern across the codebase). On confirmation: exit path mode, then reset history
to the anchor scene and navigate there. On cancellation: nothing happens.

## 16. Full Path Generator

### 16.1 Purpose

Produce a path that visits **every scene in the workspace exactly once**, so an author can walk
the whole collection and verify nothing was missed.

### 16.2 Graph, Not Scenes

The traversal runs over the **graph** (nodes and edges), not over scene membership. Per the
architecture lexicon, a scene is a *curated view* — it need not contain every edge that exists
between its nodes, so scene membership is not a sound model of connectivity. Scenes are also
reachable outside transitions (Node Manager), so scene adjacency is not the only navigation
relation.

### 16.3 Algorithm

```
1. root = anchor node
        → else central node of the current scene
        → else oldest node by createdAt
2. Depth-first traversal from root:
        - outgoing edges first (sourceId → targetId), then incoming
        - neighbours ordered by node createdAt ascending
        - each node visited once
3. When the component is exhausted, restart at the oldest unvisited node.
   Repeat until every node is visited (covers disconnected components).
4. Map the node sequence to scenes, dropping nodes that have no scene.
   A node without a scene is a legitimate leaf, not an omission.
5. Sweep graphStore.scenes and append any scene not already present
   (defends against scenes whose central node is missing or unreachable).
```

**Postcondition:** `result.length === graphStore.scenes.length`. Completeness is guaranteed by
step 5 by construction, not by trusting the traversal to be exhaustive. This is what makes the
result usable as an audit instrument.

**On ordering:** ordering is a readability concern, not a correctness one. Where several orders
are defensible, one is chosen and applied consistently. Node `createdAt` is used rather than edge
`createdAt` because every node carries one.

### 16.4 No Transition Changes Required

`goToSceneFromPath()` already routes correctly for arbitrary scene pairs: if the target's central
node is *visible* in the current scene it morphs, otherwise it falls back to close → open. A
generated path may contain any pair of consecutive scenes; both cases are already handled.

### 16.5 Placement

`features/path/full-path.ts` — a feature-owned pure utility, mirroring `scene/traversal.ts`.
Signature:

```typescript
generateFullPath(
  nodes: Node[],
  edges: Edge[],
  scenes: Scene[],
  rootNodeId: NodeId | null
): SceneId[]
```

No `cy`, no store imports — pure and directly testable.

**The `Path` feature supplies the arguments from `graphStore`** and is where the generator is
invoked from (`features.path.generateFullPath()`). A feature reading `graphStore` directly is
permitted (architecture §4.2) and precedented by `Quiz`; `Path` already needs `graphStore` for the
anchor lookup. The UI therefore never handles graph-shaped arguments — it calls one method.

When persisting a generated path, `Path` records `generatedSceneCount = scenes.length` (§15.3).

## 17. Persisting Path Mode

Path mode survives reload. `AppState` (`knogra.state`) gains:

```typescript
pathId?: PathId;       // Which path is being walked (absent = history mode)
pathIndex?: number;    // Cursor position within it
```

On startup, if `pathId` is present: look up the path; if it exists and the scene at `pathIndex`
still exists, re-enter path mode at that position. If either check fails, clear the fields and
start in history mode. **Failure is silent** — a missing path is not an error worth interrupting
startup for.

**Rationale:** an audit of a large workspace spans sessions, and losing your place at scene 87 of
140 to a page refresh is a real cost. The risk of returning to a restrictive mode without
remembering why is neutralised by the persistent mode signals (§14.2).

Note that `Path` in `main-types.ts` already anticipated `pathId` in AppState (§3.3); it was never
implemented.

### 17.1 Session State Must Not Travel

`pathId` / `pathIndex` are **excluded from workspace export**. They describe the exporting session,
not the workspace.

The failure they would otherwise cause is not hypothetical. `importAppState()` writes the imported
`app-state.json` verbatim, and `importPaths()` restores saved paths **with their original ids** — so
an imported `pathId` usually *does* resolve. The validation in `restoreSession()` would find a real
path and a real scene, and dutifully drop the importing user into the exporter's tour at the
exporter's cursor position, in a restrictive mode, unasked.

Two layers:
- **Export** — `AppStateManager.getExportableAppState()` omits both fields. Lives on the state
  manager rather than at the export call site so the rule sits beside the state definition.
- **Import** — `importAppState()` strips them anyway, covering files written before this fix.

`clearAppState()` (new workspace) removes the whole key, so that path needs nothing.

`lastSceneId` is deliberately *not* stripped: an imported scene id resolves within the imported
graph, so honouring it opens a sensible scene rather than a foreign one.

**General rule:** a new `AppState` field must be classified as document state (travels) or session
state (does not) when it is added. Anything naming a *position within* something — a cursor, a
selection, a scroll offset — is session state.

## 18. Known Issues This Work Must Fix

### 18.1 History Size Cap

`NavigationHistory` caps at 50 entries. `loadPath` bypasses the cap by assigning the array
directly, but the next `push()` trims from the front and decrements the cursor — silently
corrupting a long loaded path. A full path over a large workspace hits this immediately.

Path mode is uncapped (a `PathCursor` never pushes). History mode keeps a cap, raised to 200.

### 18.2 Breadcrumb Measurement Cost

`PathPanel.#measureItemWidths()` runs on **every** render and, for **every** entry in the whole
sequence, creates a DOM element, appends it, reads `offsetWidth` (forcing layout), and removes it
— plus two linear `graphStore` scans to build the label. Invisible at 50 entries; at 300 it is
~300 forced layouts and ~600 array scans per keypress.

Fix: cache measured widths keyed by `SceneId`, invalidated on node rename. This is a prerequisite
for raising the cap, not an optional optimisation.

Numbering (§14.2) adds width per item and must be included in the measurement or the virtual
window drifts.

### 18.3 Panel File Size

`path-panel.ts` is ~460 lines against the ~300 target (architecture §7.2). The virtual-window
math (`#measureItemWidths`, `#calculateVisibleWindow`, `#findWindowStartFromEnd`,
`#findWindowEndFromStart`, `#expandWindowGreedy`) is self-contained and extracts cleanly to
`ui/panels/breadcrumb-window.ts`.

Both files stay flat in `ui/panels/` rather than moving into a `path-panel/` folder: one helper
does not justify a folder, and a move would change the import path in `panel-api.ts` for no
benefit.

### 18.4 Breadcrumb Click Hack

`PathPanel.#navigateToScene()` moves the cursor by calling
`loadPath(getHistory(), sceneId)` — reloading the whole sequence to change an index. With a real
cursor this becomes `goToIndex(i)` in both modes.

## 19. Implementation Plan

Phase numbering continues §10 (Phases 1a–6, shipped). Each phase leaves the app in a working,
verifiable state; work may stop at any phase boundary.

**Dependencies:** Phase 7 is standalone. Phase 8 depends on Phase 7 only for the `goToIndex`
cleanup (§18.4). Phase 9 depends on Phase 8's `enterPathMode`.

### Phase 7: Panel Foundations ✅
Independent of modes; fixes latent defects that path mode would otherwise expose.
- [x] Extract `ui/panels/breadcrumb-window.ts` (§18.3)
- [x] Cache breadcrumb widths, keyed by scene id + label + ordinal (§18.2).
      Implemented lazily: only items the window arithmetic probes are ever
      measured, so a warm render touches the DOM not at all. Including the label
      in the key makes a rename self-invalidating.
- [x] Raise history cap to 200 (§18.1)

### Phase 8: Navigation Modes ✅
- [x] `features/path/path-cursor.ts` — pure cursor (§14.7 Structures)
- [x] Two-mode `Path` feature; existing public API signatures unchanged
- [x] `NavigationHistory.goToIndex()` — reposition without truncating (§18.4)
- [x] `pathModeChanged` added to `EventMap`
- [x] `Transition` subscribes and guards `goToSceneByNode()` (§14.4)
- [x] `Graph` subscribes and guards the three delete methods (§14.6)
- [x] Affordances: context menu (navigate + delete), Node Manager (§14.5, §14.6)
- [x] Panel: numbering, exit control, accent-state button, `goToIndex` (§18.4)
- [x] Home button confirmation before leaving path mode (§15.4)
- [x] Persist `pathId` / `pathIndex` in `AppState` with validated restore (§17)
- [x] F1 shortcut descriptions note the path-mode constraint (§14.5)
- [x] `features/path/full-path.ts` — pure generator (§16), landed early because
      `Path` imports it; the manager UI that invokes it is Phase 9

**Deviation from spec:** the panel's exit control replaces Save/Load while in path
mode rather than sitting beside them. Saving a copy of the path being toured is
meaningless and loading another mid-tour is better done deliberately, so the
two-button group is Home + Exit in path mode and Home + Save + Load otherwise.
The single Path button that consolidates Save/Load arrives with Phase 9.

### Phase 9: Path Manager and Generator ✅
- [x] Move path persistence behind the `Path` feature (§15.2)
- [x] `ui/components/path-manager.ts` — facade (§15.1)
- [x] `ui/components/path-manager/path-modal-shell.ts` — overlay + helpers (§15.1)
- [x] `ui/components/path-manager/path-list.ts` — list, staleness, generate menu (§15.1)
- [x] `ui/components/path-manager/path-sequence-editor.ts` — ported from `path-picker.ts` (§15.1)
- [x] Panel left group reduced to Home + Path (+ Exit in path mode)
- [x] Home button confirmation (§15.4)
- [x] `features/path/full-path.ts` — pure generator (§16, landed in Phase 8)
- [x] `generatedSceneCount` on `Path`; staleness label in the manager (§15.3)
- [x] `Generate ▾ Full path` in the manager
- [ ] **User deletes** `path-picker.ts` and `path-picker.css` — both now have zero
      importers, so they are inert until removed

**Deviations from spec:**
- The panel's right-click "Edit path…" menu is gone rather than retained: the Path
  button reaches the same surface, and a hidden duplicate entry point is worse than
  none. `PathContextMenu` therefore has no replacement.
- Generating a full path saves it immediately under a default name and opens the
  editor on the saved record, rather than editing an unsaved draft. Keeps a single
  persistence path (no draft state to reconcile) and means an interrupted rename
  still leaves a usable path.
- Row actions in the list are **Walk** and **Edit**; delete lives inside the editor
  where the confirmation already existed, rather than being duplicated per row.

### Documentation Follow-Up
On completion: mark Part II sections as shipped, drop the *(planned)* markers from
`architecture.md` §3.6 and §3.10, and clear the `path-picker.ts` / `path-panel.ts` debt markers
in §3.8.

### Deferred / Out Of Scope
- Panel toggle shortcut (§10, Phase 5.2) — the Path button and a future `P` binding would need to
  agree on what "toggle" means; not required by this work.
- Euler-tour ("smooth tour") generator variant — every step one hop, at the cost of ~2N length and
  repeated scenes. Incompatible with audit counting; a candidate second entry under `Generate ▸`.
- Generator parameterisation (root selection, depth limit, subtree scope).

