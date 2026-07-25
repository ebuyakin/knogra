# Paths Feature Architecture

> **Status:** Current  
> **Last reviewed:** 2026-07-25  
> **Authority:** Current model for navigation history, saved paths, and the path panel.
> Sections 1–13 describe shipped behaviour. Sections 14–19 are the **approved specification**
> for navigation modes, the path manager, and the full-path generator — not yet implemented.  
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

> **Status:** Approved specification, not yet implemented.  
> **Agreed:** 2026-07-25.

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
   │                       (ENFORCEMENT — single funnel, single guard)
   │
   ├──▶ PathPanel ........ numbering, exit control, Path button active state
   ├──▶ ContextMenu ...... greys out "Go to node's scene (G)"
   └──▶ NodeManager ...... greys out open-scene action
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
| Keyboard `G` / fade navigation key | Silent no-op |
| Node Manager → open scene | Greyed out |
| `[` `]`, `«` `»`, breadcrumb clicks | Work normally |
| Home | Works, after "Exit path mode?" confirmation |

**Principle:** explicit offers (menus, buttons) must tell the truth and are greyed out. Gestures
(double-tap, shortcut keys) make no promise and may no-op silently. The mode is signalled
persistently by the numbered breadcrumbs and the accent-coloured Path button, so a silent
no-op reads as "I am touring" rather than "the app froze".

### 14.6 Structures

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

## 15. Path Manager

### 15.1 Consolidation

The panel's `Save` and `Load` buttons and the hidden right-click "Edit path…" are replaced by a
single **Path** button opening a Path Manager — the same shape as `edge-type-manager`,
`theme-editor`, `node-manager`, and `background-editor`.

Panel left group becomes: **Home** + **Path**.

This also removes a real defect: "Edit path…" is currently disabled when no paths exist, so it
cannot bootstrap the first path.

Manager contents:
- List of saved paths (name, scene count, missing-scene count) → **Load** / **Edit** / **Delete**
- **Save current history as path…** (history mode only)
- **Generate ▸** — currently one entry, `Full path` (§16); the extension point for future
  generators and generator parameters

`PathEditor` (rename, reorder, remove scenes, delete) is retained and reached from the list.

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

Scene deletion leaves dangling `SceneId`s in saved paths. Current behaviour already tolerates
this (the breadcrumb renders `Unknown`). Generated full paths make staleness routine, since the
graph keeps growing after generation.

Policy: **regenerate, do not repair.** The manager displays a missing-scene count per path so a
stale path is visible; the remedy is to generate a fresh one.

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

No `cy`, no store imports — pure and directly testable. The `Path` feature supplies the arguments
from `graphStore`.

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
`ui/panels/path-panel/breadcrumb-window.ts`.

### 18.4 Breadcrumb Click Hack

`PathPanel.#navigateToScene()` moves the cursor by calling
`loadPath(getHistory(), sceneId)` — reloading the whole sequence to change an index. With a real
cursor this becomes `goToIndex(i)` in both modes.

## 19. Implementation Plan

### Phase 7: Panel Foundations
Independent of modes; fixes latent defects that path mode would otherwise expose.
- [ ] Extract `ui/panels/path-panel/breadcrumb-window.ts` (§18.3)
- [ ] Cache breadcrumb widths by `SceneId` (§18.2)
- [ ] Raise history cap to 200 (§18.1)

### Phase 8: Navigation Modes
- [ ] `features/path/path-cursor.ts` — pure cursor (§14.6)
- [ ] Two-mode `Path` feature; existing public API signatures unchanged
- [ ] `pathModeChanged` added to `EventMap`
- [ ] `Transition` subscribes and guards `goToSceneByNode()` (§14.4)
- [ ] Affordances: context menu, Node Manager (§14.5)
- [ ] Panel: numbering, exit control, active-state Path button, `goToIndex` (§18.4)
- [ ] Persist `pathId` / `pathIndex` in `AppState` with validated restore (§17)

### Phase 9: Path Manager and Generator
- [ ] Move path persistence behind the `Path` feature (§15.2)
- [ ] `ui/components/path-manager.ts` replaces `path-picker.ts` (§15.1)
- [ ] Panel left group reduced to Home + Path
- [ ] Home button confirmation (§15.4)
- [ ] `features/path/full-path.ts` — pure generator (§16)
- [ ] `Generate ▸ Full path` in the manager; missing-scene counts in the list (§15.3)

### Documentation Follow-Up
On completion: mark Part II sections as shipped, drop the *(planned)* markers from
`architecture.md` §3.6 and §3.10, and clear the `path-picker.ts` / `path-panel.ts` debt markers
in §3.8.

