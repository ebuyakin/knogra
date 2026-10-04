# Scene Manipulation & Transition Specification

> **Status:** Current  
> **Last reviewed:** 2026-10-03 (pluggable phase animators and the recipe in §2.1 and §4.2; terminology in §1.3; §2 and §4 after the layering was restored on 2026-10-02)  
> **Authority:** Canonical source for scene manipulation, scene transitions, fold semantics, and related invariants.  
> **Replaces:** [transition-sequence-spec.md](transition-sequence-spec.md), transition-related sections of [fold-unfold-design.md](fold-unfold-design.md)  
> **Related:** [Documentation map](README.md), [Architecture](architecture.md), [Background design](background-design.md)

---

## Table of Contents

1. [Terminology](#1-terminology)
2. [Feature Architecture](#2-feature-architecture)
3. [Scene Manipulation](#3-scene-manipulation)
4. [Scene Transition](#4-scene-transition)
5. [Cytoscape ↔ Database Interaction](#5-cytoscape--database-interaction)
6. [Fold State Management](#6-fold-state-management)
7. [Known Issues & Invariants](#7-known-issues--invariants)

---

## 1. Terminology

### 1.1 Core Concepts

| Term | Definition |
|------|------------|
| **Graph** | The complete knowledge graph stored in IndexedDB. Contains all nodes and edges regardless of visibility. |
| **Scene** | A curated view on the graph. Defines which nodes/edges are included, their positions, designs, viewport, background, and fold state. A node can appear in multiple scenes with different properties. |
| **Included** | A node is an element of the scene (`scene.nodes[nodeId]` exists). It exists in Cytoscape when the scene is loaded, but may be hidden. |
| **Visible** | A node is included AND not folded (`display !== 'none'`). It is rendered and interactive. |
| **Hidden** | A node is included but folded. It exists in Cytoscape with `display: none` and `opacity: 0`. Its position is preserved. |
| **Central Node** | The focal node of a scene. Exactly one per scene. Marked via `node.data('centralNode', 1)` and styled with a blue border. |
| **Regime** | The operational mode determining which user actions persist. Three regimes: View, Edit, Transition (see §1.5). |

### 1.2 Operation Verbs

| Scope | Verbs | Effect | Persistence |
|-------|-------|--------|-------------|
| **Graph** | `add`, `delete`, `create` | Creates/destroys nodes/edges in the graph database. Adding a node does not inherently affect any scene, but the normal in-app creation path creates the graph node and immediately includes it in the current scene. Deleting a graph node removes it from all scenes. | Via GraphSaver or direct graphStore paths |
| **Scene** | `include`, `exclude`, `expand`, `collapse` | Adds/removes nodes from a scene's `nodes`/`edges` maps. Node still exists in graph. | Via GraphSaver (Cytoscape mutation) |
| **Fold** | `fold`, `unfold` | Toggles visibility of included nodes. Non-destructive. Positions preserved via offsets. | Via GraphSaver (cy.scratch) **in Edit regime only** |
| **View** | `pan`, `zoom`, `fit` | Changes viewport. No structural changes. | Via GraphSaver (viewport event) **in Edit regime only** |

### 1.3 Transition Terms

| Term | Definition |
|------|------------|
| **Navigation** | The umbrella in prose for any move from one picture to another; never a code name. The kinds are the four rows below. |
| **Transition** | Scene to scene when the target's central node is visible in the current scene: departure, morphing, arrival (§4.2). Never "morph" for the whole. |
| **Close and open** | Scene to scene otherwise, and the fade variant (§4.1). |
| **Re-focus** | Map to map, on the map's own instance (map-view.md §5.2). Close to a transition in shape, different code, so a different name. |
| **Handoff** | Scene to map and back (map-view.md §8): enter, leave, back. A transition to or from the map's scene plus the map's own moves. |
| **Morphing** | Phase 2 of a transition: the shared nodes move, rescale and crossfade design. "Morph" is what a shared node does. |
| **Shared node** | Visible in BOTH old and new scene. Morphs (moves, may crossfade design). |
| **Departing node** | Visible in old scene, NOT included in new scene. Flies out. |
| **Arriving node** | Included in new scene, NOT visible in old scene. Flies in. |
| **Ghost element** | Temporary clone for crossfade. Carries old design fading out while real element assumes new design fading in. Named `ghost_{node|edge}_{originalId}_{timestamp}`. |
| **Related scenes** | Target scene's central node is **visible** in current scene. Enables a transition. |
| **Unrelated scenes** | Target scene's central node is absent or folded in current scene. Uses close→open. |

### 1.4 Central Node Invariant

**One-to-one constraint:** Each node can be the central node of **at most one scene**. A node may appear as non-central (companion) in any number of scenes. This is a graph-level invariant enforced by scene creation logic.

### 1.5 Application Regimes

| Regime | Purpose | DB Writes to `knogra-graph` | User Actions Allowed |
|--------|---------|---------------------------|---------------------|
| **View** | Explore/consume a scene | **NONE** | Pan, zoom, fold/unfold (transient), drag nodes (transient), tweak designs (transient), chat, notes, path navigation |
| **Edit** | Build/shape a scene | **ALL** | Include/exclude nodes, add/delete nodes/edges, change designs, layout, fold/unfold (persisted) |
| **Transition** | Navigate between scenes | **NONE** | None — scene is locked, animation plays |

**Regime rules:**
- **View ↔ Edit toggle:** Explicit user action (shortcut + context menu)
- **Shelf in View mode:** AI suggestions appear on shelf, but **"add to scene" is disabled**
- **Chat/Path in all modes:** Always active, always persist to their respective databases (`knogra-chat`, `knogra-paths`)
- **Fold/unfold in View mode:** Visual effect only, not persisted. Returning to scene restores author's saved fold state.
- **Drag/design tweak in View mode:** Visual effect only, not persisted.
- **Transition regime:** Entered automatically on navigation, exited when animation completes. User input is blocked during transitions.

---

## 2. Feature Architecture

### 2.1 Feature Hierarchy

```
FeatureAPI (facade)
├── Scene
│   ├── SceneNodeOps    (include, exclude, style updates)
│   ├── SceneEdgeOps    (exclude, style updates, show edges)
│   ├── FoldManager     (fold, unfold, fold state)
│   └── Viewport        (fit, zoom)
├── Graph               (add/delete nodes & edges)
├── Node                (content updates: title, tags, properties)
├── Edge                (content updates)
├── Transition          (entry points, regime guards, the bracket, which scene is current, announcements)
│   ├── CurrentScene                 (the scratch id and the transient scene; the only writer)
│   ├── scene-resolution             (find by central node; create-or-refuse policy; pure drafts)
│   ├── OpenCloseOrchestrator        open(scene, mode), close(scene, mode)
│   │   ├── OpenSceneAnimator
│   │   ├── CloseSceneAnimator
│   │   └── FoldStateHandler
│   └── SceneToSceneOrchestrator     transition(current, target, { isNewScene, recipe? })
│       ├── animator-registry        id → animator, one table per phase; recipe.ts resolves the ids (the request, else the settings)
│       ├── DepartureAnimator        'fly-out' DepartureFlyOut, 'shrink' DepartureShrink
│       ├── MorphingAnimator         'parallel' MorphingParallel
│       │   ├── BackgroundOperator
│       │   ├── TransitionAnalysisOperator
│       │   └── GhostOperator
│       ├── ArrivalAnimator          'fly-in' ArrivalFlyIn, 'grow' ArrivalGrow
│       └── FoldStateHandler
├── Path                (navigation history)
└── SceneBackground     (background images)
```

Each phase of a transition is an interface (`animators.ts`: one `run(context)` per phase, the context the same for every implementation of that phase), an animator is one implementation named by an id, and a recipe names one animator per phase (§4.2). The orchestrator obtains its animators from the registry by id, one instance per id kept for reuse, and knows no implementation; files and classes are named role first, variant second, so the folder sorts by phase. Helper libraries an animator may use, not part of any interface: `cascade.ts` (the BFS from the central giving distance and parent, layers, edge buckets, the viewport edge point), `arrival-elements.ts` (adding arriving nodes and edges with their styles), `departure-elements.ts` (the central's zoom-out, fading edges, removing the departed).

Shared by both orchestrators, Layer 3: `step-debug` (the dev step-through pause). Pure, under both: `element-classification-utils` and `transition-invariants`. The container's colour and vignette are painted by `styles/canvas-theme.ts`, a Styles-layer routine the map view uses for its own surface too (moved out of this feature on 2026-10-03 for that reason).

The layering was restored on 2026-10-02: until then `Transition` ran the transition itself (classification, the phases, the central flag, the background, fold state, the stylesheet prune, 950 lines) and the orchestrator was three phase methods; the open modes and an inline fade path lived in `Transition` too, beside a stale `openFade` in the orchestrator. The map handoff (map-view.md §8), which needs `transition` and an instant `open` with Scene objects as Layer 1 primitives, was the occasion. The refactor was six extractions with no behaviour change, each verified in the browser; its plan was a temporary document, deleted when done.

### 2.2 Layer Rules

| Layer | Suffix | Role | Creates |
|-------|--------|------|---------|
| 0 | *(none)* | Top-level router (`Transition`) | Layer 1 orchestrators |
| 1 | `-Orchestrator` | Coordinates multiple animators | Layer 2 animators |
| 2 | `-Animator` | Executes animation sequences | Layer 3 operators (if any) |
| 3 | `-Operator` | Low-level single-concern operations | — |
| — | `-utils` | Stateless pure functions | — |

**Ownership rule:** Each class creates **only its direct children**. No class knows about grandchildren.

### 2.3 Dependency Direction

```
UI → Features → Cytoscape → GraphSaver → GraphStore → IndexedDB
                    ↑
              (source of truth)
```

- **UI** calls Features. Never touches Cytoscape or storage directly.
- **Features** mutate Cytoscape. Never write to GraphStore directly.
- **Cytoscape** emits events (`add`, `remove`, `data`, `free`, `viewport`).
- **GraphSaver** listens to Cytoscape events, debounces 500ms, extracts state, writes to GraphStore.
- **GraphStore** persists to IndexedDB and maintains in-memory cache.
- **Persistence suspension** gates GraphSaver auto-save. In View and Transition regimes, Cytoscape mutations must not propagate to `knogra-graph`.
- **Direct GraphStore writes** are exceptions to the Cytoscape→GraphSaver path and must be explicitly guarded by the current regime.

---

## 3. Scene Manipulation

### 3.1 Scene Construction (Adding Nodes to a Scene)

**`Graph.addFreeNode(position, title?, design?, properties?, scale?)`**  
Creates a new node in the **graph database** AND adds it to Cytoscape (current scene).

1. Generates `NodeId` (`n-{timestamp}`)
2. Creates `Node` object with title, tags, properties
3. Determines design/scale from settings (inherit from selected → default)
4. `cy.add({ group: 'nodes', data: { ...node, design, scale }, position })`
5. `StyleGenerator.addNodesToStylesheet()` adds per-node rule
6. **GraphSaver** auto-persists: node to `graphStore.nodes`, scene to `graphStore.scenes`

**`Graph.addConnectedNode(nodeId, direction, title?, properties?, design?)`**  
Creates a new node connected to an existing node.

1. Calls `addFreeNode()` at collision-free position (circular spread)
2. Calls `addEdge()` between existing and new node
3. Returns new `NodeId`

**`SceneNodeOps.includeNode(nodeId, position, design?)`**  
Adds an **existing graph node** to the current scene.

1. Verifies node exists in `graphStore.nodes`
2. Verifies node not already in Cytoscape
3. `cy.add({ group: 'nodes', data: { ...nodeData, design, scale: 1.0 }, position })`
4. Adds stylesheet rule via `StyleGenerator`
5. **GraphSaver** persists updated scene

**`SceneNodeOps.includeExistingNode(nodeId, design?, anchorNodeId?, connection?)`**  
Includes existing node and connects it to its anchor.

1. Determines anchor (explicit → active/selected → central)
2. Calculates collision-free position near anchor
3. Calls `includeNode()`
4. If the graph already has an edge between the node and the anchor, adds that edge to the scene as it is
5. Otherwise creates one: direction and type from `connection` (the shelf passes the entry's), else anchor → node on the default type

### 3.2 Scene Destruction (Removing Nodes from a Scene)

**`SceneNodeOps.excludeNode(nodeId)`**  
Removes node from current scene (NOT from graph).

1. Protects central node (cannot exclude)
2. Calls `collapseNodeAnimated()` — animated removal of descendants
3. `cyNode.remove()` — Cytoscape removes node and connected edges
4. **GraphSaver** persists: node removed from `scene.nodes`, edges removed from `scene.edges`

**`Graph.deleteNode(nodeId)`**  
Permanently deletes node from graph AND all scenes.

1. Protects anchor node and central node
2. `cascadeNodeDeletion(nodeId)` — cleans up related data (chat, etc.)
3. Marks node/edges for deletion via `cy.scratch('nodesToDelete')` / `cy.scratch('edgesToDelete')`
4. `cyNode.remove()`
5. **GraphSaver** deletes from `graphStore.nodes` and `graphStore.edges`

### 3.3 Scene Modification (In-Scene Changes)

**`SceneNodeOps.updateNodeStyle(nodeId, { design?, scale? })`**  
Updates scene-level design and scale.

1. Updates `cyNode.data('design')` and `cyNode.data('scale')`
2. `StyleGenerator.updateNodeInStylesheet()` updates per-node rule
3. **GraphSaver** persists updated scene

**`SceneNodeOps.scaleNodes(nodeIds, factor)`**  
Multiplies the scale of several nodes at once (`>` / `<`). Clamped for the group, not per node, so relative sizes survive; see [node-design-system.md](node-design-system.md).

1. Clamps `factor` to the largest step keeping every node in range
2. Updates `cyNode.data('scale')` for each node
3. `StyleGenerator.addNodesToStylesheet()` rebuilds all affected rules in one pass
4. **GraphSaver** persists updated scene

**`Node.update(nodeId, { title?, tags?, properties? })`**  
Updates node content (graph-level, affects all scenes).

1. `cyNode.data({ ...updates, updatedAt: new Date() })`
2. **GraphSaver** persists updated node to `graphStore.nodes`

**`SceneEdgeOps.updateEdgeStyle(edgeId, params)`**  
Updates edge visual style.

1. `cyEdge.data('design', { id: 'custom', params })`
2. `StyleGenerator.updateEdgeInStylesheet()` updates per-edge rule
3. **GraphSaver** persists updated scene

### 3.4 Viewport Operations

**`Scene.fit(padding, duration)`** — Animates viewport to fit all elements.  
**`Scene.zoom(factor, duration)`** — Zooms centered on viewport.  
**`Scene.handleResize()`** — Resizes Cytoscape container, calls `fit()`.

All viewport changes emit `viewport` event → **GraphSaver** persists `scene.viewport`.

---

## 4. Scene Transition

### 4.1 Entry Points

Every entry point runs inside `Transition`'s bracket: `transitionStart` (the UI input guard listens), the GraphSaver suspension, the dev transition record (`utils/diagnostics/transition-buffer`), then `transitionEnd` and the record's failure in `finally`, so an exception never leaves input blocked. `openBehind` runs it without the input guard, since nothing visible happens; `goToSceneFromPath` records the path step and lets the calls inside guard themselves.

Two regime guards refuse scene-initiated navigation: path mode (`pathModeChanged`) and the map view (`mapViewChanged`); both are subscriptions, never imports (architecture.md §3.10).

**`Transition.goToSceneByNode(targetNodeId, { fade? })`**  
Primary navigation. Called when user clicks a node or presses 'G'.

- If `fade` mode or `transitionMode === 'fade'`: resolve or create the scene (§4.3) → `closeScene({ fade: true })` → `openScene(id, { fade: true })` → `scene:changed` for the path
- Otherwise: persistence is suspended → the transition (§4.2) → `scene:changed` → suspension is released

**`Transition.goToSceneFromPath(sceneId)`**  
Navigation from path panel (back/forward/breadcrumb). No `scene:changed`; the path owns its history.

- Smart routing: if target's central node is **visible** in current scene → the transition (§4.2)
- Otherwise → `closeScene()` → `openScene(sceneId)`

**`Transition.openScene(sceneId, { skipAnimation?, fade? })`**  
Opens a scene from scratch (initial load, theme change, non-adjacent navigation). `Transition` looks the scene up, makes it current, picks the mode, calls `OpenCloseOrchestrator.open(scene, mode)` and emits `sceneChanged`. The orchestrator:

1. `cy.elements().remove()` — clear current
2. Canvas theme from the scene's theme (`styles/canvas-theme.ts`; instant for `'instant'`, else the `openBgFadeIn` setting)
3. Base stylesheet (edge rule, edge type rules, central/selected rules, edge type visibility)
4. Viewport (saved or fit-to-content)
5. **Instant mode**: `openInstant()` + `FoldStateHandler.apply()`
6. **Fade mode**: `openInstant()` → everything at opacity 0 → `FoldStateHandler.apply()` while nothing shows (no flash) → fade in only the visible elements, edges to their scene-visibility opacity
7. **Animated mode**: `openAnimated()` → `FoldStateHandler.apply()`
8. The invariant check (§7)
9. The central node selected, so it shows the combined central+selected style and the user can navigate at once

**`Transition.closeScene({ fade? })`**  
Closes current scene: `Transition` picks the mode, calls `OpenCloseOrchestrator.close(scene, mode)`, then clears the current scene (`CurrentScene.clear()`). The orchestrator:

1. **Fade mode**: fade all elements to opacity 0
2. **Animated mode**: `CloseSceneAnimator.flyOutNodesAndEdges()` → `fadeOutCentralAndBackground()`
3. `cy.elements().remove()`
4. `cy.scratch('foldedNodes', {})`

**The map handoff** (map-view.md §8), called by `ui/map-handoff.ts`:

- **`Transition.openBehind(scene)`** — `open(scene, 'instant')` for a given Scene object, nothing announced; the object becomes current, transient when the store does not hold it
- **`Transition.transitionTo(scene)`** — the transition from the current scene, stored or transient, to a given Scene object; a stored target is announced (`sceneChanged`, `scene:changed`), a transient one is not and becomes the transient current scene
- **`Transition.ensureScene(nodeId, draft)`** — the scene whose central node is `nodeId`, or in Edit mode the draft persisted (§4.3); `draft` receives the id the engine assigns (`sceneIdFor`), so the caller never learns the id format

### 4.2 The three-phase transition

`SceneToSceneOrchestrator.transition(currentScene, targetScene, { isNewScene, recipe? })`, called by `Transition` when the target scene's central node is **visible** in the current scene (and by `transitionTo` for the map handoff). `Transition` resolves the target first (§4.3); the orchestrator takes both scenes as objects and returns a `TransitionReport` (what it classified, the zoom change) for the dev record. It never writes the current-scene scratch, never saves and never announces: `Transition` does those after `transition` returns, in that order (save the auto-created scene, make the target current, `sceneChanged`).

**The recipe.** Which animator does each phase: `{ departure, morphing, arrival }`, three ids, plain data (`recipe.ts`). A caller may name any phase in its `TransitionRequest` (`transitionTo(scene, { recipe })`; the map handoff asks for `grow` on the way in and `shrink` on the way out); what it leaves out comes from the settings `transition.departureAnimator`, `transition.morphingAnimator`, `transition.arrivalAnimator`, the user's default recipe, shown as three select rows under Transitions; an id the registry does not know, a setting left by a removed animator, falls back to the built-in. The ids are persisted in settings and never renamed. The glue between the phases is the orchestrator's and belongs to no animator: classification, the central flag swap and the canvas theme crossfade before morphing, fold state, the invariant and the stylesheet reconciliation after arrival.

**A coupling between phases, kept as glue:** the morphing animator brings in a new central that is arriving (stage 2.3.C), so the orchestrator removes it, and its edges to shared nodes, from the arrival context (`#arrivingAfterMorphing`). A second morphing animator would have to honour this or the glue would change.

#### Phase 0: Preparation

1. **Resolve target scene** (`Transition`, §4.3):
   - `findSceneByCentral(targetNodeId)`
   - If not found: **draft** via `draftFromCurrent()`, saved after the transition succeeds
   - Drafted scene: central at viewport center, connected nodes preserve relative offsets, no inherited fold state

2. **Classify elements** (`element-classification-utils`, pure; the instance reads come in through `InstanceView`):
   - `classifyElements(oldScene, newScene, cy.edges())` → departing/shared/arriving nodes and edges
   - When either scene folds anything (`foldsDiffer`): `reclassifyForFold()` — visible→visible = shared; visible→hidden = departing; hidden→visible = arriving; hidden→hidden = silent; edges follow their reclassified endpoints, departing winning over arriving
   - Remove hidden stowaways (nodes with `display: none` that are now arriving) — the one cy mutation, in the orchestrator between the two pure passes
   - `keepAnimatedEdges()`: both endpoints must be in an animated category

#### Phase 1: Departure (`DepartureAnimator`)

Removes elements not in new scene. Contract: when `run` resolves, every departing node and edge is out of the instance.

`'fly-out'` (`DepartureFlyOut`, the default):
1. **Edge fade out** (if `departureEdgeTiming === 'before'`): departing edges fade to opacity 0, then removed
2. **Node fly out**: departing nodes fly toward viewport edge, away from the old central, cascaded by BFS distance from central (farthest first) with `departureLayerDuration` and `departureLayerStagger`; in `'parallel'` edge timing each edge fades with the layer of its outermost departing endpoint, edges between two staying nodes with the first
3. **Old central zoom out** (if old central is departing): shrinks to 20% while fading, its edges with it
4. All departed elements removed from Cytoscape after animation

`'shrink'` (`DepartureShrink`): each departing node slides into the current position of its parent, the neighbour on its path back to the central, fading out, edges fading with their layer; layers farthest first, one after another, so a parent is still there when its children fold into it; a node with no path fades in place; a departing old central zooms out as above. The stagger and edge-timing settings are fly-out's. The mirror of `'grow'`; the map handoff leaves with it (map-view.md §8).

#### Phase 2: Morphing (`MorphingAnimator`, `'parallel'` = `MorphingParallel`)

Transforms shared elements from old state to new state. **All sub-stages run in parallel.**

1. **Analyze changes** (`TransitionAnalysisOperator`):
   - Compare designs: `JSON.stringify(oldDesign) !== JSON.stringify(newDesign)`
   - Compare scales: `oldScale !== newScale`
   - Compare edge styles (structural vs non-structural diffs)
   - Categorize: `moveOnly` (position/scale only) vs `crossfade` (design change)

2. **Create ghosts** (`GhostOperator`):
   - Clone crossfade nodes/edges with old design
   - Ghosts named `ghost_node_{id}_{timestamp}`, `ghost_edge_{id}_{timestamp}`
   - Ghosts inherit `centralNode` flag and selection state

3. **Setup real elements**:
   - Hide real crossfade elements (`opacity: 0`)
   - Update stylesheet: real elements get new design rules, ghosts get old design rules
   - Reveal ghosts (`opacity: 1`)

4. **Execute parallel animations**:
   - **Background**: crossfade old→new (parallel mode) or fade-out→load→fade-in (sequential mode)
   - **Viewport**: animate zoom/pan to target scene's viewport (if not new scene)
   - **Nodes**: move-only nodes animate position (and scale if changed); crossfade nodes move + ghost fades out + real fades in
   - **Edges**: tween edges animate color/width; crossfade edges ghost fades out + real fades in

5. **Cleanup**:
   - Remove ghost elements and their stylesheet rules
   - Finalize real elements (remove inline opacity overrides)
   - Commit node/edge data (`design`, `scale`)
   - Update stylesheet for move-only scale changes

#### Phase 3: Arrival (`ArrivalAnimator`)

Introduces elements new to the scene. Contract: when `run` resolves, every arriving node and edge is in the instance, visible, at its target. Both animators add the nodes first, invisible at their start positions with their stylesheet rules (`arrival-elements.ts`), and leave edges whose endpoint is neither arriving nor in the instance to the fold handler.

`'fly-in'` (`ArrivalFlyIn`, the default):
1. **Node fly in**: arriving nodes fly from past the viewport edge, along the ray from the new central, to their targets, cascaded by BFS distance (closest first) with `arrivalLayerDuration` and `arrivalLayerStagger`
2. **Edge fade in**: with the layer of the outermost arriving endpoint (`'parallel'` edge timing), or all after the nodes (`'after'`)

`'grow'` (`ArrivalGrow`): each arriving node starts at the target position of its parent, the neighbour on its path back to the central, and slides to its own place fading in, edges fading with their layer; a node with no path grows out of the central; layers closest first, one after another, so a parent has landed when its children set out (a fixed stagger launched children from a parent still in flight). The stagger and edge-timing settings are fly-in's. On the map's scene: landmarks grow out of the focus (map-view.md §8).

#### Post-Phase: Fold State Application (`FoldStateHandler`)

1. Clear `.fold-root` class from all nodes
2. Remove stowaway hidden nodes (survivors from previous scene)
3. Add hidden nodes from `scene.foldedNodes` to Cytoscape at their positions
4. Apply styles to hidden nodes
5. Add edges for hidden nodes (both endpoints must exist), carrying the scene's `design`/`curve` in element data — bare graph data would let GraphSaver wipe the scene's persisted edge override on its next sync
6. Reconcile per-edge stylesheet rules for the re-added edges: write this scene's override or remove a stale rule left by a previously visited scene
7. Set `display: none` on hidden nodes and their edges
8. Add `.fold-root` class to fold roots
9. Write `cy.scratch('foldedNodes', scene.foldedNodes)`

#### Post-Phase: Stylesheet Reconciliation

After fold state is applied and the invariant checked, the orchestrator prunes every per-edge override rule (`edge[id = "…"]`) not backed by an override in the target scene (`StyleGenerator.pruneStaleEdgeRules`), and the per-node rules likewise, then rebuilds the central/selected rules for the target theme. The morph path updates the stylesheet incrementally — without this, departing edges' rules survive the transition, leak another scene's bend/style onto edges re-included later, and accumulate across morphs. Removal-only, so rule order is preserved; folded edges keep their rules because folded edges remain in `scene.edges`. Arriving and tween edges are additionally reconciled in-flight (update-or-remove) by their animators.

### 4.3 Scene Auto-Creation

**`draftFromCurrent(targetNodeId, currentScene, viewportCenter)`** in `scene-resolution.ts`, over the pure `buildSceneFromOffsets`

When navigating to a node with no existing scene:

1. Generate scene ID: `scene-{sanitized-title}-{nodeId}`
2. Central node placed at `viewportCenter`
3. Connected nodes preserve relative offset from central:
   - `offset = nodePos - centralPos` in old scene
   - `newPos = viewportCenter + offset` in new scene
4. Edges: only those whose both endpoints are in new scene's nodes
5. **Fresh fold state**: `foldedNodes: {}` (no inherited folds)
6. Persisted via `graphStore.updateScene(targetScene)` after transition

---

## 5. Cytoscape ↔ Database Interaction

### 5.1 The Persistence Contract

**Cytoscape is the sole source of truth for runtime state.** All graph/scene mutations go through Cytoscape. The database is a persistent mirror.

```
User Action
    ↓
Feature Method (scene.includeNode, graph.addFreeNode, etc.)
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
GraphStore Write (updateScene, updateNode, updateEdge)
    ↓
IndexedDB Persistence
```

### 5.2 GraphSaver

**Singleton.** Initialized once in `main.ts` after Cytoscape creation.

**Event listeners:**
- `free` (node drag end) → schedule save
- `viewport` (zoom/pan) → schedule save
- `data` (any data change) → schedule save
- `add remove` (element add/remove) → schedule save

**`#sync()` process:**
1. Read `cy.scratch('currentSceneId')`
2. Delete marked elements (`cy.scratch('nodesToDelete')`, `cy.scratch('edgesToDelete')`)
3. `#saveScene(sceneId)`: extract scene from Cytoscape → `graphStore.updateScene()`
4. `#saveContent()`: extract all nodes/edges from Cytoscape → `graphStore.updateNode()` / `updateEdge()`

**`#extractSceneFromCy(sceneId)`:**
- Reads existing scene from `graphStore.scenes` for metadata (title, centralNodeId, themeId, backgroundImages, createdAt)
- Extracts node positions, designs, scales from Cytoscape elements
- Extracts edge designs from Cytoscape elements
- Reads viewport from `cy.zoom()` / `cy.pan()`
- Reads fold state from `cy.scratch('foldedNodes')`

**Critical:** `GraphSaver` is **suspended during all transitions**. This prevents saving intermediate animation states.

**Required refactor:** `GraphSaver` must use scoped suspension semantics before View/Edit mode is implemented. A single boolean enable/disable flag is unsafe because transitions, fold/unfold, collapse/expand, and future View mode can overlap. The persistence gate needs owner-aware or depth-aware suspension, such as `suspend(reason)` returning a token and `resume(token)`, so one caller cannot accidentally re-enable persistence while another caller still requires it suspended.

**Important limitation:** GraphSaver is not the only writer to `knogra-graph`. Some features write directly to `graphStore` (for example theme/background/scene updates and graph deletion cleanup). View mode must guard those direct writes separately; disabling GraphSaver alone is not sufficient.

### 5.3 When Changes Propagate

| Action | Cytoscape Mutation | GraphSaver Event | Persisted To |
|--------|-------------------|------------------|--------------|
| Add free node | `cy.add(node)` | `add` | `graphStore.nodes`, `graphStore.scenes` |
| Add edge | `cy.add(edge)` | `add` | `graphStore.edges`, `graphStore.scenes` |
| Delete node | `cyNode.remove()` | `remove` | `graphStore.nodes` (deleted), `graphStore.scenes` |
| Include node | `cy.add(node)` | `add` | `graphStore.scenes` |
| Exclude node | `cyNode.remove()` | `remove` | `graphStore.scenes` |
| Move node (drag) | `node.position()` | `free` | `graphStore.scenes` (position) |
| Change design | `node.data('design', ...)` | `data` | `graphStore.scenes` |
| Change scale | `node.data('scale', ...)` | `data` | `graphStore.scenes` |
| Update title | `node.data('title', ...)` | `data` | `graphStore.nodes` |
| Pan/zoom | `cy.viewport()` | `viewport` | `graphStore.scenes` (viewport) |
| Fold node | `node.style('display', 'none')` | *(no event)* | **Manual** `graphSaver.forceSave()` |
| Unfold node | `node.style('display', 'element')` | *(no event)* | **Manual** `graphSaver.forceSave()` |

**Note:** Fold/unfold do NOT trigger Cytoscape events (they use `style()`, not `data()`). `Scene.foldNode()` and `Scene.unfoldNode()` explicitly call `graphSaver.forceSave()` after the operation — **but only in Edit regime**. In View regime, fold/unfold is transient.

### 5.4 Regime-Aware Persistence

| Regime | Action | Persisted? | Mechanism |
|--------|--------|------------|-----------|
| View | Pan, zoom, fit | **No** | GraphSaver suspended |
| View | Fold/unfold | **No** | Transient visual only |
| View | Drag node | **No** | GraphSaver suspended |
| View | Change design | **No** | GraphSaver suspended + direct write guards |
| View | Add shelf node to scene | **Blocked** | UI disables the action |
| Edit | All scene manipulations | **Yes** | GraphSaver active |
| Transition | Any Cytoscape mutation | **No** | GraphSaver suspended |

### 5.5 When Changes Do NOT Propagate

1. **During transitions:** GraphSaver suspension prevents auto-saves. Intermediate animation states (ghost elements, temporary positions, opacity changes) are NOT persisted.

2. **In View regime:** GraphSaver is suspended. Cytoscape mutations that are allowed in View mode (drags, folds, design tweaks) are transient and lost on scene switch.

3. **Direct GraphStore writes:** These bypass GraphSaver. Any direct `graphStore.updateScene()`, `updateNode()`, `updateEdge()`, `deleteNode()`, or `deleteScene()` path must be audited and explicitly blocked or allowed per regime.

4. **Style-only changes:** `node.style('opacity', 0)` for animation does not trigger `data` event. Only `node.data()` changes propagate.

5. **Scratch space changes:** `cy.scratch('key', value)` does not trigger events. Fold state must be manually synced: `FoldManager.#syncToScratch()` writes to scratch, but `GraphSaver.#extractSceneFromCy()` reads it during save.

6. **Stylesheet changes:** `cy.style().fromJson().update()` does not trigger persistence. Stylesheet is derived from scene data, not the other way around.

### 5.6 Dual State Problem

**Fold state has dual representation:**
- **Runtime authority:** `FoldManager.#foldState` (Map of Maps)
- **Cytoscape scratch:** `cy.scratch('foldedNodes')` — written by `FoldManager`, read by `GraphSaver`
- **Database:** `Scene.foldedNodes` — written by `GraphSaver`, read by `Transition` on scene load

**Sync discipline:**
- `FoldManager` updates `#foldState` → calls `#syncToScratch()` after every mutation
- `GraphSaver.#extractSceneFromCy()` reads `cy.scratch('foldedNodes')` → writes to `Scene.foldedNodes`
- `FoldStateHandler.apply()` reads `scene.foldedNodes` from DB → adds hidden nodes to Cytoscape → writes `cy.scratch('foldedNodes')`
- `FoldManager.#ensureSynced()` checks `cy.scratch('currentSceneId')` against `#sceneId`; if changed, calls `loadFoldState()` to rebuild `#foldState` from scratch

---

## 6. Fold State Management

### 6.1 Fold vs Collapse

| | Fold | Collapse |
|---|---|---|
| Nodes removed from scene? | No — hidden via `display: none` | Yes — removed from `scene.nodes` |
| Positions preserved? | Yes — stored as offsets | No — gone |
| Edges removed? | No — hidden with nodes | Yes |
| Survives reload? | Yes (`foldedNodes` in DB) | Yes (nodes absent from scene) |
| Reversible? | Unfold restores exact positions | Expand recalculates positions |

### 6.2 Fold Operation

**`FoldManager.fold(rootNodeId)`**

1. `#ensureSynced()` — reload fold state if scene changed
2. Guard: don't re-fold already-folded node
3. Find all visible descendants via BFS (`findDescendants()`)
4. Protect central node (remove from descendants)
5. Safe mode: keep nodes with external connections (`determineNodesToKeep()`)
6. Absorb existing fold entries of descendants being hidden
7. Store offsets: `offset = { dx: node.x - root.x, dy: node.y - root.y }`
8. `#syncToScratch()` — write to `cy.scratch('foldedNodes')`
9. **Animation:** cascading shrink toward root (outermost leaves first)
10. After animation: `#hideNodes()` — `display: none`, restore original positions
11. Add `.fold-root` class to root
12. `graphSaver.forceSave()`

### 6.3 Unfold Operation

**`FoldManager.unfold(rootNodeId)`**

1. `#ensureSynced()`
2. Read folded set for root
3. Identify direct children within folded set
4. **Split fold state:** distribute remaining hidden nodes to revealed children as new fold entries
5. Recompute offsets: child-relative = `oldOffset - childOffset` (pure arithmetic, no cy reads)
6. `#syncToScratch()`
7. **Animation:** revealed children grow from root position to offset-computed positions
8. Clear `.fold-root` from root, add to children that still have hidden descendants

### 6.4 Fold State in Transitions

**Element classification** (`SceneToSceneOrchestrator.transition`, over `element-classification-utils`):
- Hidden nodes from BOTH scenes are excluded from initial classification
- Shared nodes reclassified by visibility:
  - visible→visible = shared (morphs)
  - visible→hidden = departing (fly out)
  - hidden→visible = arriving (fly in)
  - hidden→hidden = silent (FoldStateHandler handles)

**Stowaway cleanup:**
- `FoldStateHandler.apply()` from previous transition may have added hidden nodes to cy
- If now classified as "arriving," they must be removed before arrival phase (duplicate ID error)
- Cleanup runs in `SceneToSceneOrchestrator.transition` after `reclassifyForFold` and before `keepAnimatedEdges`

**Post-transition fold setup:**
- After all animation phases complete, `FoldStateHandler.apply(targetScene)`:
  - Removes stowaway hidden nodes from previous scene
  - Adds hidden nodes from target scene at their DB positions
  - Hides them, adds `.fold-root` indicators
  - Writes `cy.scratch('foldedNodes')`

---

## 7. Known Issues & Invariants

### 7.1 Known Bugs

1. **Missing regime model (architectural):**
   - Currently no View/Edit mode distinction. All operations persist unconditionally.
   - This causes drift between user's exploratory state and author's saved scene state, which transitions then start from.
   - Fold/unfold during exploration gets persisted, creating inconsistent fold state across scenes.

2. **Nested fold position bug (Scenario_3):**
   - Fold A → Move A → Unfold A (correct) → Unfold C → D appears at wrong/random position
   - Suspected cause: offset computation or stowaway handling in multi-level unfold

3. **Fold badge persistence across scenes:**
   - Fold root in scene 1 retains `(+)` badge in scene 2 even without children
   - `FoldManager.#ensureSynced()` may not fire, or `loadFoldState()` reads stale data

4. **Node inclusion leak (fixed in Phase 1):**
   - "A→B→C, went from A to C, included D from A to C, went from C to B. D is included. It shouldn't be."
   - `showAllEdges()` previously added all graph edges between scene nodes, not just `scene.edges`

5. **Title caching bug:**
   - Node editor "caches" title from previously edited node when creating new child nodes
   - Suspected cause: modal state not cleared between edits

### 7.2 Critical Invariants

1. **GraphSaver disabled during transitions.** No DB writes during animation.

2. **`sceneChanged` is the canonical scene-switched event.** Emitted by `Transition` after successful scene change. `AppStateManager` subscribes and persists `lastSceneId`.

3. **Central node always visible.** Old central is never folded (if so, no transition path is visible). New central may be folded in old scene.

4. **Ghost elements never persisted.** Ghost IDs are transient (`ghost_{type}_{id}_{timestamp}`). `GraphSaver.#extractNodeFromCy()` explicitly picks known fields and does NOT spread `...data()`, so `centralNode` flag and ghost data don't leak into DB.

5. **Stylesheet order matters.** Cytoscape has no CSS specificity — last matching selector wins. Per-node rules must come before `node[?centralNode]`, which must come before `node:selected`, which must come before `node[?centralNode]:selected`.

6. **Fold state is scene data.** On equal footing with positions, designs, edges. It describes which nodes are visible and which are hidden in a given scene.

### 7.3 Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ACTION                              │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  FEATURE API (Scene, Graph, Transition, etc.)                   │
│  • Business logic                                               │
│  • Calls Cytoscape mutations                                    │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  CYTOSCAPE (Source of Truth)                                    │
│  • Elements (nodes, edges) with data + style                    │
│  • Scratch space (currentSceneId, foldedNodes, etc.)            │
│  • Emits: add, remove, data, free, viewport                     │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  GRAPHSAVER (Auto-persistence)                                  │
│  • Listens to Cytoscape events                                  │
│  • Debounced 500ms                                              │
│  • Disabled during transitions                                  │
│  • Extracts state from Cytoscape → writes to GraphStore         │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  GRAPHSTORE (IndexedDB Interface)                               │
│  • In-memory cache (nodes[], edges[], scenes[])                 │
│  • CRUD operations                                              │
│  • Dexie/IndexedDB persistence                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Appendix A: File Reference

| File | Responsibility |
|------|---------------|
| `src/features/feature-api.ts` | Facade exposing all features |
| `src/features/graph.ts` | Graph structure: add/delete nodes and edges |
| `src/features/node.ts` | Node content operations (title, tags, properties) |
| `src/features/edge.ts` | Edge content operations |
| `src/features/scene/scene.ts` | Scene orchestrator: delegates to NodeOps, EdgeOps, FoldManager |
| `src/features/scene/node-ops.ts` | Scene-level node ops: include, exclude, style |
| `src/features/scene/edge-ops.ts` | Scene-level edge ops: exclude, style, show edges |
| `src/features/scene/fold-manager.ts` | Fold/unfold state and animation |
| `src/features/transition/transition.ts` | Top-level transition router |
| `src/features/transition/opening-closing/open-close-orchestrator.ts` | Open/close scene orchestrator |
| `src/features/transition/scene-to-scene/scene-to-scene-orchestrator.ts` | The three-phase transition orchestrator: departure, morphing, arrival, by recipe |
| `src/features/transition/scene-to-scene/animators.ts` | The three phase interfaces and their contexts (types only) |
| `src/features/transition/scene-to-scene/recipe.ts` | `TransitionRecipe`; resolve a request against the settings |
| `src/features/transition/scene-to-scene/animator-registry.ts` | Animator id → constructor, one table per phase; unknown id → built-in |
| `src/features/transition/scene-to-scene/departure-fly-out.ts`, `departure-shrink.ts` | The departure animators |
| `src/features/transition/scene-to-scene/morphing-parallel.ts` + `morphing/` | The morphing animator and its operators (background, analysis, ghosts) |
| `src/features/transition/scene-to-scene/arrival-fly-in.ts`, `arrival-grow.ts` | The arrival animators |
| `src/features/transition/scene-to-scene/cascade.ts`, `arrival-elements.ts`, `departure-elements.ts` | Helper libraries animators may use; not part of any interface |
| `src/features/transition/element-classification-utils.ts` | Pure functions: classify elements by inclusion and by fold visibility, get hidden IDs |
| `src/features/transition/scene-resolution.ts` | Find a scene by central node; create-or-refuse policy; pure drafts (auto-create) |
| `src/features/transition/current-scene.ts` | Which scene the instance shows, stored or transient; the only writer of the scratch id |
| `src/styles/canvas-theme.ts` | The container's background colour and vignette (Styles layer; shared with the map view) |
| `src/features/transition/fold-state-handler.ts` | Post-transition fold setup |
| `src/storage/graph-store.ts` | IndexedDB interface with in-memory cache |
| `src/storage/graph-saver.ts` | Auto-save listener (Cytoscape → GraphStore) |
| `src/core/main-types.ts` | Core type definitions (Node, Edge, Scene, FoldedNodeEntry) |
