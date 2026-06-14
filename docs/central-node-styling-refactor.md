# Central Node Styling — Architecture Reference

> **Status:** Current with caveats  
> **Last reviewed:** 2026-06-14  
> **Authority:** Current authority for central-node styling, selected-node styling priority, and the `centralNode` data-flag approach. For broader transition sequencing, defer to [scene-transitions.md](scene-transitions.md).  
> **Related:** [Documentation map](README.md), [Scene transitions](scene-transitions.md), [Theme architecture](theme-architecture.md), [Node design system](node-design-system.md)

## Problem Statement

Central node blue border is lost during scene-to-scene transitions. The root cause was
that central border styling was baked into the same per-node stylesheet rule as node design.
When transition Phase 2 (shared movement) rebuilds stylesheet rules for crossfade nodes,
it regenerates them from design data — which knows nothing about central status — destroying
the blue border.

Additionally, the `:selected` state completely replaces the central border,
making the central node indistinguishable from any other selected node.

## Cytoscape Stylesheet Model

**Critical rule:** Cytoscape has **no CSS-like specificity**. For a given element and property,
**the last matching selector in the stylesheet array wins**. This is the sole priority mechanism.

`:selected` is not "built-in magic" — it wins purely because it appears **after** per-node
rules in the array. Any data selector (`node[?centralNode]`) would also win if placed after
per-node rules but before `:selected`.

---

## Four Visual States for Nodes

| State | Border | Takes Effect When |
|-------|--------|-------------------|
| Regular | Per design (typically `border-width: 0`) | Default |
| Central | Theme `borderCentral` (e.g. blue `#4a9eff`) | Node is the current scene's central node |
| Selected | Theme `borderSelected` (e.g. orange `#f9826c`) | User selects any node |
| Central + Selected | Theme `borderCentralSelected` (e.g. purple `#8B6CC1`) | User selects the central node |

### Priority (lowest → highest):
1. Per-node design (from `node[id = "..."]`)
2. Central marker (from `node[?centralNode]`)
3. Selected marker (`node:selected`)
4. Central + Selected (`node[?centralNode]:selected`)

### Invariant:
- Central node **always** has its blue border visible, unless selected (combined style shown).
- The blue border survives any stylesheet rebuild during transitions.

### Theme Configuration

All border colours come from `theme.node`:
- `borderCentral: { color, width }` — central node border
- `borderSelected: { color, width }` — selected node border
- `borderCentralSelected: { color, width }` — combined state border

---

## Architecture: Data-Attribute Approach

### Core Idea

Decouple central node styling from node design by using a **Cytoscape data flag** + **dedicated stylesheet rules**.

Instead of mutating `border-width`/`border-color` on a per-node-ID rule:
1. Set `node.data('centralNode', 1)` on the central node
2. Three rules at the end of the stylesheet (order matters — last wins):
   ```
   node[?centralNode]           → { border-width, border-color: blue }
   node:selected                → { border-width, border-color: orange }
   node[?centralNode]:selected  → { border-width, border-color: purple }
   ```
3. Transition swaps central by toggling the data flag, not by rewriting stylesheet rules

### Why This Works

- `node[?centralNode]` is placed **after** all `node[id = "..."]` rules → wins over design
- `node:selected` is placed **after** `node[?centralNode]` → selection wins over central
- `node[?centralNode]:selected` is placed **last** → compound state wins over both
- No code that rebuilds per-node design rules can affect these rules
- Changing the data flag causes Cytoscape to re-evaluate selectors automatically

### Stylesheet Order (Array)

```
[
  node[id = "abc123"] { ... design ... }     ← per-node rules (rebuilt freely)
  node[id = "def456"] { ... design ... }
  ...
  edge { ... }                                ← base edge rule
  edge[id = "e1"]     { ... }                ← per-edge rules
  ...
  node[?centralNode]            { border }   ← ALWAYS after per-node rules
  node:selected                 { border }   ← ALWAYS after central
  node[?centralNode]:selected   { border }   ← ALWAYS last among node rules
]
```

### Ghost Continuity During Crossfade

During Phase 2 crossfade, a ghost element is a visual clone carrying the **old** design
(fading out) while the real element gets the **new** design (fading in). Ghost nodes
inherit the `centralNode` data flag from their source node at creation time. This ensures
the blue border is visible on whichever element is currently visible throughout the crossfade.

### GraphSaver Safety

`GraphSaver.#extractNodeFromCy()` explicitly picks known fields:
```typescript
return { id, title, tags, properties, createdAt, updatedAt, ... };
```
It does **NOT** spread `...data()`, so the `centralNode` flag does not leak into IndexedDB.

---

## Key API

### `StyleGenerator.buildCentralAndSelectedRules(themeId)`
Returns the 3 stylesheet rules array. Called:
- In `openScene()` when building the initial stylesheet
- In `#setupRealElementsForCrossfade()` after rebuilding per-node rules
- In `#executeToNode()` post-transition when theme may have changed

### `Transition.#updateCentralNodeStyle(oldId, newId)`
Toggles the data flag: `removeData('centralNode')` on old, `data('centralNode', 1)` on new.
No stylesheet manipulation.

### `OpenSceneAnimator.zoomInCentralNode()` / `flyCentralNode()`
Add central node with `centralNode: 1` in the data passed to `cy.add()`.

---

## Files Involved

| File | Role |
|------|------|
| `src/core/main-types.ts` | `borderCentralSelected` in `NodeStyle` interface |
| `src/styles/themes.ts` | Theme values for all 3 border states |
| `src/styles/style-generator.ts` | `buildCentralAndSelectedRules()` method |
| `src/features/transition/transition.ts` | Data flag toggle + rule rebuilds |
| `src/features/transition/open-scene-animator.ts` | `centralNode: 1` on initial node add |
| `src/features/scene/node-ops.ts` | No central re-application needed |
| `src/features/transition/shared-core-animator.ts` | Rules appended after crossfade rebuild |
| `src/features/transition/shared-core-animation/ghost-manager.ts` | Ghost inherits `centralNode` flag |
