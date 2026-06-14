# Fold / Unfold — Design Document

> **Status:** Historical / partly superseded  
> **Last reviewed:** 2026-06-14  
> **Authority:** Fold/unfold background and implementation history. For current scene invariants, fold-state semantics during transitions, and element classification, defer to [scene-transitions.md](scene-transitions.md).  
> **Related:** [Documentation map](README.md), [Scene transitions](scene-transitions.md), [Refactoring plan](refactoring-plan.md)

## Purpose

Hide portions of a scene without removing them. When unfolded, nodes reappear at their original, user-configured positions — no layout algorithm involved.

**Fold ≠ Collapse.** Collapse permanently removes nodes from the scene. Fold is a non-destructive view filter.

| | Collapse | Fold |
|---|---|---|
| Nodes removed from scene? | Yes | No — hidden via `display: none` |
| Positions preserved? | No — gone | Yes — stored in scene data |
| Edges removed? | Yes | No — hidden with their nodes |
| Survives reload? | Yes (nodes absent) | Yes (fold state persisted) |
| Undo | Expand (new calculated positions) | Unfold (original saved positions) |

## Terminology

### Three Levels of Node Manipulation

Nodes can be manipulated at three distinct levels. The verbs sound similar but have very different effects — confusing them leads to bugs.

| Level | Verbs | Scope | Effect | Reversible? |
|---|---|---|---|---|
| **Graph** | Add / Delete | Entire knowledge graph | Node created or permanently destroyed. Affects all scenes. | Delete is destructive |
| **Scene** | Include / Exclude (and Expand / Collapse as a specific case) | Single scene | Node added to or removed from a scene's node set. The node still exists in the graph. Other scenes unaffected. | Yes — include/expand to restore |
| **View** | Fold / Unfold | Single scene, visual only | Node stays in the scene data but is hidden (`display: none`). Position, design, edges all preserved. | Yes — unfold to reveal |

**Expand / Collapse** are specific mechanisms for include/exclude:
- **Expand**: include node's neighbors (children, parents, or both) into the scene. Positions are calculated.
- **Collapse**: exclude node's descendants from the scene. Nodes and edges are removed from scene data.

**Key distinction: Collapse vs Fold**:
- Collapse **removes** nodes from the scene — they lose their positions and must be re-expanded (with new calculated positions).
- Fold **hides** nodes within the scene — positions are preserved, and unfold restores them exactly where they were.

### Fold-Specific Terms

- **Fold root**: The node whose children are hidden. It **stays visible** with a visual indicator (dashed border via `.fold-root` CSS class).
- **Folded node** / **Hidden node**: A descendant hidden by a fold operation. It exists in the scene data but is invisible (`display: none`).
- **Folded set**: The collection of hidden node IDs belonging to a fold root.
- **Visible nodes**: Nodes in a scene that are NOT in any folded set. These are what the user sees and what participate in transitions.

## Core Principle: Fold State Is Scene Data

Fold state is part of the scene specification — on equal footing with node positions, designs, edges, and background images. It describes **which nodes are visible and which are hidden** in a given scene.

This means:
- Fold state is persisted in `Scene.foldedNodes` (in the database via graphStore/graphSaver).
- When opening a scene, fold state is applied before any animation — folded nodes never flash on screen.
- When transitioning between scenes, the element classifier operates on **visible nodes only** — folded nodes are excluded from departure/arrival/shared classification.
- Fold roots are visible nodes and participate in transitions normally — they depart, arrive, and animate like any other node, but carry a `.fold-root` CSS class.

## Behavior Spec

### Fold (captures entire subtree)

1. User selects a node and triggers fold (`Z` or context menu).
2. Find descendants using `findDescendants` from `traversal.ts` — BFS follows outgoing edges, captures the entire subtree across all levels (e.g. A→B→C→D: folding A hides B, C, and D).
3. Protect central node — never fold it.
4. Apply safe/aggressive mode (`fold.collapseRemoveAll` setting via `determineNodesToKeep`). Safe mode (default) keeps nodes with external connections visible.
5. Absorb existing fold entries: if any descendant is already a fold root, its folded set merges into the new fold root's set.
6. **Capture relative offsets**: for each node being folded, store its offset from the fold root (`dx = node.x - root.x`, `dy = node.y - root.y`). This preserves the spatial configuration relative to the fold root.
7. Animate: cascading shrink toward fold root, **layer by layer, outermost leaves first** — identical to collapse animation pattern.
8. After animation: set `display: none` on folded nodes and their connected edges.
9. Mark the fold root with `.fold-root` CSS class (dashed border).
10. Persist: update `foldedNodes` in scene data, sync to `cy.scratch('foldedNodes')`.

### Unfold (reveals one level only)

Given: A is fold root with folded set {B, C, D} where A→B→C→D:

1. User selects fold root A and triggers unfold (`Shift+Z` or context menu).
2. Read A's folded set: {B, C, D}.
3. Identify A's **direct children** within the folded set (B).
4. **Split the fold state**: for each revealed child (B), find its descendants within the remaining hidden set → create new fold entry B → {C, D}. Add fold indicator to B.
5. Remove A's fold entry and fold indicator.
6. Reveal B: set `display: element` on B and edges where both endpoints are visible.
7. **Compute position from offset**: B's position = A's current position + B's stored offset. This means if A was moved while B was folded, B appears at the correct relative position.
8. Animate: B grows from A's position to the computed target position.

### Relative Position Preservation

When a user folds a node, they may subsequently move the fold root. On unfold, folded nodes must appear at the same **relative position** to the fold root — not at their old absolute positions. Users perceive the fold root and its subtree as a spatial unit.

Offsets are stored at fold time and applied at unfold time:
- **Fold**: `offset = {dx: child.x - root.x, dy: child.y - root.y}`
- **Unfold**: `child.position = {x: root.x + offset.dx, y: root.y + offset.dy}`

Note: Cytoscape positions are in **model coordinates** (graph coordinate space), which are independent of zoom/pan. Zoom and pan are viewport transformations that don't change `node.position()`. So stored offsets require no zoom/pan adjustment.

### Edge Rules

- When a node is folded, **all edges connected to it** become hidden — no dangling edges.
- On unfold, an edge is restored only if **both endpoints are visible**.

### Multiple Folds

- **Independent**: Fold B (hides C), fold D (hides F). Each tracks its own set.
- **Nested**: Fold B (hides C), then fold A (hides B). A's folded set becomes {B, C} — B's fold entry is absorbed. Unfolding A reveals B (with its fold indicator for C).
- **Folding a fold root's parent**: existing fold entry is absorbed into the parent's.

### Interaction with Collapse/Exclude

- Collapsing a fold root: fold entry is cleaned up, all descendants (including folded ones) are removed from the scene.
- Excluding a folded node: not possible (hidden = non-interactive). Must unfold first.

## Fold in Transitions

### Scenario: Scene-to-Scene Transition

Setup:
- Scene 1 (center A): A→B→C, A→D→F. B is fold root, C is folded. **Visible**: {A, B, D, F}.
- Scene 2 (center D): D←A→K, D→G. No fold state. **Visible**: {D, A, K, G}.

**Scene 1 → Scene 2:**
1. Element classifier compares **visible** nodes: source {A, B, D, F} vs target {A, D, K, G}.
2. Departing: {B, F}. Shared: {A, D}. Arriving: {K, G}.
3. B and F fly out (B loses fold indicator as it departs).
4. A and D move to Scene 2 positions.
5. K and G fly in.
6. C is not in Scene 2 — nothing happens with it.

**Scene 2 → Scene 1 (returning):**
1. Classifier: source visible {A, D, K, G} vs target visible {A, B, D, F}.
2. Departing: {K, G}. Shared: {A, D}. Arriving: {B, F}.
3. K and G fly out.
4. A and D move to Scene 1 positions.
5. B and F fly in. B arrives with `.fold-root` class (dashed border).
6. **Post-transition**: C (folded node) is added to cy with `display: none`. Its position is computed from its stored offset relative to B's current position. Silent, no animation.

**User unfolds B**: C grows from B to its computed relative position. All 5 nodes visible.

**Scene 1 (all unfolded) → Scene 2:**
1. Classifier: source {A, B, C, D, F} vs target {A, D, K, G}. Departing: {B, C, F}.
2. B, C, F fly out normally.

### Scene Opening (cold open)

1. Add **visible** nodes to cy at their positions, apply styles.
2. Animate (central node zoom, fly-in, edges, background).
3. **Post-animation**: add folded nodes to cy with `display: none`. Their positions are computed from stored offsets relative to their fold root's current position. Apply styles (so graphSaver can save them). Add `.fold-root` class to fold roots.
4. Write fold state to `cy.scratch('foldedNodes')`.

### Key: Element Classifier Enhancement

`element-classifier.ts` currently compares `currentScene.nodes` vs `targetScene.nodes`. It must be enhanced to compare **visible** nodes — excluding folded nodes from both scenes before classification.

Pure function `getHiddenNodeIds(scene: Scene): Set<NodeId>` extracts all node IDs that appear in any folded set. The classifier uses this to filter.

## Data Model

### Scene type extension

```typescript
// In src/core/main-types.ts

/** A node hidden by a fold operation, with its offset from the fold root */
export interface FoldedNodeEntry {
  id: NodeId;
  offset: { dx: number; dy: number };  // relative to fold root at fold time
}

export interface Scene {
  // ... existing fields ...
  
  /** Fold state: fold root NodeId → array of folded (hidden) nodes with offsets */
  foldedNodes?: Record<NodeId, FoldedNodeEntry[]>;
}
```

`foldedNodes` is optional for backward compatibility. Empty or absent = nothing folded.

The offset captures each folded node's position **relative to its fold root** at the moment of folding. This ensures that if the fold root is moved while folded, unfolding reproduces the original spatial configuration around the root's new position.

### Persistence Round-Trip

```
Fold/Unfold action
  → FoldManager updates cy (display:none, .fold-root class)
  → FoldManager syncs to cy.scratch('foldedNodes')
  → graphSaver.forceSave()
    → #extractSceneFromCy() reads cy.scratch('foldedNodes')
    → Writes scene.foldedNodes to DB via graphStore.updateScene()

Scene load (open or transition)
  → Reads scene.foldedNodes from DB
  → Applies display:none + .fold-root on cy
  → Writes to cy.scratch('foldedNodes')
  → FoldManager.loadFoldState() reads cy.scratch into runtime Map
```

**Verification needed**: Dexie schema — does graphStore persist arbitrary new fields on Scene? Dexie stores full objects, so `foldedNodes` should persist without schema changes, but this must be verified.

## Architecture

### Key Decision: `cy.scratch` as Source of Truth

Fold state uses `cy.scratch('foldedNodes')` as the authoritative runtime source. This was chosen over storing fold data directly on cy element properties after trade-off analysis:

**Why scratch (not element data):**
- The root→children mapping with offsets is the natural data shape. Reconstructing it from per-element properties (e.g. `node.data('foldRoot')`) requires grouping queries — complexity without value.
- Unfold-splitting (A→{B,C,D} becomes B→{C,D}) is a Map operation. Selector queries are slower and more fragile.
- `cy.scratch` survives `cy.elements().remove()`, while element data would be lost. Though graphSaver saves before transitions, scratch is more resilient to edge cases.
- Already implemented — changes are incremental, not architectural.

**Consequence — dual state that must stay in sync:**
- **Primary**: `cy.scratch('foldedNodes')` — the authoritative mapping of root → `FoldedNodeEntry[]`
- **Derived**: cy element properties (`display:none`, `.fold-root` class) — visual state applied from the primary source

**Rule**: Always update scratch first, then derive visual state from it. On scene load, `applyFoldState()` writes scratch AND applies visual state in one pass. FoldManager updates scratch via `#syncToScratch()` after every mutation, then applies visual changes.

**Writers**:
- `FoldManager` — during user fold/unfold actions
- `OpenCloseOrchestrator.applyFoldState()` — during scene load
- (Phase 4) Post-morph fold setup — during scene-to-scene transitions

**Readers**:
- `graphSaver.#extractSceneFromCy()` — reads scratch for persistence
- `FoldManager.loadFoldState()` — rebuilds runtime Map from scratch
- `element-classification-utils.ts` — reads `scene.foldedNodes` (from DB, not scratch)

### Scene Feature (`src/features/scene/`)

`FoldManager` — class with `#cy`. Handles fold/unfold user actions, state management, animation.

Key methods: `fold()`, `unfold()`, `isFolded()`, `getFoldState()`, `loadFoldState()`, `cleanupFoldRoot()`, `clearAll()`.

Syncs state to `cy.scratch('foldedNodes')` on every mutation.

### Cross-Feature Communication: `cy.scratch('foldedNodes')`

Same pattern as `cy.scratch('currentSceneId')`. FoldManager is the sole writer during user actions; transition writes on scene open. Other layers read only.

### Transition Feature (`src/features/transition/`)

Two integration points:

1. **Element classifier** (pure function in `element-classification-utils.ts`): `getHiddenNodeIds()` added, used to filter visible nodes before classification. Affects both open-scene and scene-to-scene paths.

2. **Post-transition fold setup** (cy-mutating): After visible nodes are animated into place, silently add folded nodes to cy with `display: none`. This runs at the end of both:
   - `openScene()` — after open animation (via `OpenCloseOrchestrator.applyFoldState()`)
   - `#executeToNode()` — after 3-phase morph

### Storage Layer

`graphSaver.#extractSceneFromCy()` reads `cy.scratch('foldedNodes')` — includes it in the saved Scene record. No other changes to save logic (folded nodes are in `cy.nodes()` with their positions).

## Target Transition Directory Structure

```
src/features/transition/
  transition.ts                        ← Layer 0: top-level router
  element-classification-utils.ts      ← pure functions (classification + getHiddenNodeIds)
  scene-factory-utils.ts               ← pure functions (scene creation)
  opening-closing/
    open-close-orchestrator.ts         ← Layer 1: owns open + close animators
    open-scene-animator.ts             ← Layer 2: open animation primitives
    close-scene-animator.ts            ← Layer 2: close animation primitives
  scene-to-scene/
    scene-to-scene-orchestrator.ts     ← Layer 1: owns 3 phase animators
    departure-animator.ts              ← Layer 2: departure phase
    shared-core-animator.ts            ← Layer 2: shared movement phase
    arrival-animator.ts                ← Layer 2: arrival phase
    shared-core-animation/
      background-operator.ts           ← Layer 3: background transitions
      ghost-operator.ts                ← Layer 3: ghost element management
      transition-analysis-operator.ts  ← Layer 3: change analysis
```

### Naming Convention by Layer

| Layer | Suffix | Role |
|---|---|---|
| 0 | *(none)* | Top-level router (`Transition`) |
| 1 | `-Orchestrator` | Coordinates multiple animators |
| 2 | `-Animator` | Executes animation sequences |
| 3 | `-Operator` | Low-level single-concern operations |
| — | `-utils` | Stateless pure function modules |

### Ownership Chain

Each class creates **only its own direct children**. No class knows about grandchildren.

```
Transition (Layer 0)
  ├── OpenCloseOrchestrator (Layer 1)
  │     ├── OpenSceneAnimator (Layer 2)    leaf
  │     └── CloseSceneAnimator (Layer 2)   leaf
  └── SceneToSceneOrchestrator (Layer 1)
        ├── DepartureAnimator (Layer 2)    leaf
        ├── SharedCoreAnimator (Layer 2)
        │     ├── BackgroundOperator (Layer 3)            leaf
        │     ├── TransitionAnalysisOperator (Layer 3)    leaf
        │     └── GhostOperator (Layer 3)                 leaf
        └── ArrivalAnimator (Layer 2)      leaf
```

## UI

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Z` | Fold selected node |
| `Shift+Z` | Unfold selected node |

### Context menu

Under "Scene" submenu:
- "Fold (Z)" — shown when node has descendants in scene
- "Unfold (⇧Z)" — shown when node is a fold-root

### Visual indicator

Fold root: `.fold-root` CSS class → dashed border (Cytoscape stylesheet rule in `buildCentralAndSelectedRules`).

## Implementation Plan

### Phase 1: Update design document ← DONE
Capture terminology, architecture decisions, transition behavior, and integration points.

### Phase 2: Refactor transition directory structure (structural, no behavior changes) ← DONE
Moved files into `opening-closing/` and `scene-to-scene/` subdirectories. Extracted `OpenCloseOrchestrator` from `transition.ts`. Applied consistent naming by layer (Orchestrator → Animator → Operator). Made each class create its own children — no grandchild knowledge. Updated all import paths.

### Phase 3: Scene feature — fold/unfold ← DONE

FoldManager works correctly in isolation — fold/unfold/persist/restore within a single scene. No transition awareness. The bridge to Phase 4 is the data contract: `Scene.foldedNodes` in IndexedDB and `cy.scratch('foldedNodes')` at runtime.

#### 3.1: Data model — add offsets to FoldedNodeEntry ← DONE

- Added `FoldedNodeEntry` type: `{ id: NodeId, offset: { dx, dy } }`
- Updated `Scene.foldedNodes` type: `Record<NodeId, FoldedNodeEntry[]>`
- Updated FoldManager `#foldState` to `Map<NodeId, Map<NodeId, {dx, dy}>>`
- `fold()` captures offsets, `unfold()` uses offsets to compute positions
- `loadFoldState()` handles both legacy (plain `NodeId[]`) and new formats
- Updated consumers: open-close-orchestrator, graph-saver, scene.ts

#### 3.2: FoldManager logic verification ← DONE

All behaviors verified against spec. No bugs found in logic.

#### 3.3: Persistence round-trip verification ← DONE

Full cycle verified: fold → cy.scratch → graphSaver → IndexedDB → scene load → applyFoldState. JSON.stringify safe (no Maps/Sets/Dates in serialized format). Dexie stores without schema migration.

Note: `loadFoldState()` not yet called after scene load — deferred to Phase 4.3.

#### 3.4: Dead code cleanup ← DONE

- Removed `cleanupFoldRoot()` from FoldManager (never called)
- Removed `clearFoldState()` from scene.ts (never called)
- Kept `loadFoldState()` (Phase 4 will wire it), `clearAll()` (future scene close)
- `loadFoldState()` wiring moved to Phase 4.3

#### 3.5: Context menu conditionals ← DONE

- "Fold (Z)" enabled when node has outgoing neighbors AND is not already a fold root
- "Unfold (⇧Z)" enabled only when node is a fold root

Note: `isFolded()` returns false after scene load until Phase 4 wires `loadFoldState()`.

#### 3.6: Documentation ← DONE

- Added comprehensive file header to FoldManager: source of truth, data contract, sync discipline, writers/readers
- Updated this design doc with implementation status and bugs fixed

#### Bugs found and fixed during testing

1. **Unfold edge timing**: edges appeared sequentially after nodes. Fixed: edges now animate in parallel with nodes in the same `Promise.all`.
2. **Scene open crash**: edges referencing folded nodes caused "nonexistent target" error. Fixed: filtered `sceneEdgeIds` to exclude edges connecting to hidden nodes before `fadeInEdges`.
3. **rAF vs setTimeout race**: fold animation could overwrite restored positions. Fixed: `node.stop()` on all animated nodes before position restore.
4. **Unfold split used cy positions**: offset recomputation read stale cy positions instead of stored offsets. Fixed: pure arithmetic `D.offsetFromChild = D.offsetFromRoot - child.offsetFromRoot`.
5. **Double-fold guard**: pressing fold on an already-folded node recalculated offsets from stale hidden node positions. Fixed: early return if node is already a fold root.

### Phase 4: Transition feature — fold-aware transitions ← DONE

Transition handles fold-aware classification and post-transition fold setup. No knowledge of FoldManager internals — it reads/writes `Scene.foldedNodes` data and `cy.scratch('foldedNodes')`.

#### 4.1: Extract getHiddenNodeIds ← DONE

- Moved `getHiddenNodeIds(scene: Scene): Set<NodeId>` from `OpenCloseOrchestrator` to `element-classification-utils.ts` as an exported pure function
- `OpenCloseOrchestrator.getHiddenNodeIds()` now delegates to the shared utility
- Classification filtering is done at the call site in `#executeToNode`, not inside `classifyElements` (keeps the function signature stable)

#### 4.2: FoldStateHandler + post-morph fold setup ← DONE

Extracted `applyFoldState` from `OpenCloseOrchestrator` into a new `FoldStateHandler` class at `src/features/transition/fold-state-handler.ts`.

- `FoldStateHandler` is owned by `Transition` (Layer 0), not by either child orchestrator
- Called from both the open-scene and scene-to-scene paths via `this.#foldStateHandler.apply()`
- Clears `.fold-root` class from all nodes before applying target scene's fold state (prevents stale classes on shared nodes)
- `close()` in `OpenCloseOrchestrator` clears `cy.scratch('foldedNodes')` to prevent stale state

Architecture decision: `applyFoldState` is used by Transition only (both paths), so it lives in `src/features/transition/` — not in `features/utils/` (which is for cross-feature utilities).

#### 4.3a: Filter hidden nodes from scene-to-scene classification ← DONE

In `#executeToNode`, after `classifyElements` returns, hidden nodes from both source and target scenes are filtered out of all 6 arrays (departingNodes, sharedNodes, arrivingNodes, departingEdges, sharedEdges, arrivingEdges).

- Without this, hidden nodes in the target scene fly in visibly, then get hidden by `FoldStateHandler` — a visual flash
- Edge filtering uses cy for departing/shared edges, `graphStore.edges` for arriving edges (not yet in cy)
- **Hidden→visible stowaway fix:** After reclassification, arriving nodes that already exist in cy (as hidden stowaways from the previous `FoldStateHandler.apply()`) are removed with their connected edges before the transition phases execute. Without this, `ArrivalAnimator.flyInNodes()` crashes on duplicate cy element IDs.

#### 4.3b: Lazy FoldManager sync ← DONE

Added `#sceneId` tracker and `#ensureSynced()` to FoldManager. Called at the top of `fold()`, `unfold()`, and `isFolded()`.

- If `cy.scratch('currentSceneId')` differs from `#sceneId`, calls `loadFoldState()` automatically
- No EventBus needed — features don't communicate with each other (architecture rule)
- Prevents stale `#foldState` from previous scene causing incorrect `isFolded()` results or double-fold guard rejections

#### 4.4: Fold badge UI ← DONE

Replaced dashed border indicator with a `+` badge at bottom-right of fold-root nodes.

- New `FoldBadgeManager` class at `src/ui/components/fold-badge.ts` (HTML overlay, same pattern as `ConnectionBadgeManager`)
- Always visible for fold-root nodes, hidden during transitions
- Clickable — calls `features.scene.unfoldNode()` on click
- Accepts `FeatureAPI` (consistent with other action-triggering UI components: ContextMenu, NodeManager)
- Removed `node.fold-root { border-style: dashed }` rule from `StyleGenerator.buildCentralAndSelectedRules()`

#### Bugs found and fixed during Phase 4

1. **Stale `.fold-root` class on shared nodes**: Node that was fold root in source scene kept the class after morph to target scene where it wasn't a fold root. Fixed: `FoldStateHandler.apply()` strips `.fold-root` from all nodes before applying target state.
