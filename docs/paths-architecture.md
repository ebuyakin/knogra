# Paths Feature Architecture

> **Status:** Current  
> **Last reviewed:** 2026-06-14  
> **Authority:** Current model for navigation history, saved paths, and the path panel.  
> **Related:** [Documentation map](README.md), [Architecture](architecture.md), [Scene transitions](scene-transitions.md)

## 1. Overview

The Paths feature allows users to track, save, and navigate through sequences of scenes. It provides a breadcrumb-style panel showing the current navigation journey and enables saving meaningful paths for later use.

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
