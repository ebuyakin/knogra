# Mermaid Fan Layout

> **Status:** Current — implemented  
> **Last reviewed:** 2026-08-20  
> **Authority:** Canonical model for the Mermaid import "Fan (nested scenes)" layout (§1–§8) and for the shared **scene-composition / adjacency layer** used by every Mermaid-import layout (§9). §5–§9 are **implemented** as of 2026-07-09.  
> **Related:** [Documentation map](README.md), [Scene transitions](scene-transitions.md), [Architecture](architecture.md)

## 1. Overview

The **fan layout** is one of the Mermaid‑import scene layouts (alongside radial and the two flow layouts). Unlike the others, it does not lay each scene out independently: it treats every generated sub‑scene as a **spatial continuation** of the scene you navigated from. Descending the graph feels like walking forward — the edge you came in on holds its place, and the node's descendants open up ahead of you like a fan.

This document defines the intended behaviour, then records the gap between that intent and the current implementation as a focused change brief (§8).

---

## 2. Notation

We label nodes by their level in the anchor‑rooted tree:

| Symbol | Level | Meaning |
|--------|-------|---------|
| `X` | 0 | Anchor node — centre of the top scene |
| `A`, `B`, … `Z` | 1 | Children of `X` |
| `AA`, `AB`, … `ZZ` | 2 | Grandchildren of `X` (children of the level‑1 nodes) |
| `AAA`, … | 3 | Great‑grandchildren, and so on |

For a scene centred on node **P**, its clicked‑into child is **C**. "Parent scene" means the scene centred on P; "sub‑scene" means the scene centred on C being built during the descent P → C.

---

## 3. The two levers

The import dialog exposes two independent depth controls; both take values **1** or **2** in practice.

| Lever | UI label | Field | Controls |
|-------|----------|-------|----------|
| **Top depth** | "Choose the depth of the starting scene" | `selection.depth` | How many levels the **top (anchor) scene** shows. `1` → `X` + children; `2` → `X` + children + grandchildren. The top scene is laid out **radially**, not by the fan algorithm. |
| **Sub depth** | "Levels per generated scene" | `selection.subSceneDepth` | How many levels **each generated sub‑scene** shows below its centre. `1` → `C` + its children; `2` → `C` + children + grandchildren. |

Both levers are orthogonal, giving four combinations of interest: **1‑1, 1‑2, 2‑1, 2‑2** (written *top‑sub*).

The parent node of `C` (i.e. `P`) is always included in a sub‑scene regardless of sub depth — it carries the upward continuity (see §4).

---

## 4. The Fan Continuity Invariant (FCI)

When navigating from a scene centred on **P** into child **C**, the sub‑scene centred on **C** satisfies:

1. **Incoming edge preserved.** The `P → C` edge keeps its exact angle and length. Because P sits at the origin of its own scene and C sits at some offset `posC` there, C's scene places **P at `−posC`**. The `P → C` vector is therefore identical in both scenes.
2. **C at the origin** (viewport centre).
3. **Children of C fanned.** C's children are placed on the far side of the incoming edge — spread around the bearing pointing directly *away* from P (`atan2(posC.y, posC.x)`) — using the configured fan knobs (spread arc, per‑child max angle, ring distance, sibling gap, footprint scale).
4. **Grandchildren of C fanned per child** — but **only when sub depth = 2**. At sub depth = 1 no grandchildren are present in the scene at all.

The invariant depends only on the **incoming edge**, which is always available (a scene centred on P necessarily contains both P and C). It does **not** depend on whether C's children were already positioned in the parent scene.

---

## 5. Placement rules

The FCI resolves into three separable decisions per sub‑scene.

### 5.1 Incoming‑edge preservation — *always*
Place P at `−posC`. Requires only C's position in the parent scene, which always exists for a sub‑scene. There is no case (other than a scene with no parent at all) where the incoming edge is discarded.

### 5.2 Children arrangement — *inherit‑and‑widen* vs *fresh‑fan*
Both arrangements place C's children on the side away from P; they differ only in where the angles come from:

- **Inherit‑and‑widen** — used when C's children were **already positioned in the parent scene** (they appear there because top depth ≥ 2 on the first hop, or sub depth = 2 on a deeper hop). Their existing angular clump is preserved and widened into a generous fan, keeping the sense of "the same nodes, opened up."
- **Fresh‑fan** — used when C's children were **not** in the parent scene. They are fanned from scratch around the away‑from‑P bearing using the configured knobs.

The choice is purely cosmetic continuity of the *children*; the incoming edge (§5.1) is preserved either way.

### 5.3 Grandchild fan — *sub‑depth gated*
Grandchildren are fanned within each child's own angular sector (bounded by the bisectors to neighbouring children) **iff** they are present in the scene, which happens **iff sub depth = 2**. At sub depth = 1 the slice excludes them, so nothing fans them.

---

## 6. Worked walkthroughs

Assume `sceneGeneration` produces a sub‑scene for each visited node.

### 6.1 — 2‑2 (works today)
- **Top:** `X, A…Z, AA…ZZ` (radial).
- **X → A:** X‑A preserved. A's children `AA…AZ` were in the top scene → **inherit‑and‑widen**. Grandchildren `AAA…AZZ` fanned per child.
- **A → AA:** A‑AA preserved. AA's children present in A's scene (sub = 2) → inherit‑and‑widen; their children fanned. Continuity chains indefinitely.

### 6.2 — 1‑1
- **Top:** `X, A…Z` (radial).
- **X → A:** X‑A preserved. `AA…AZ` were **not** in the top scene → **fresh‑fan** (one layer). No grandchildren (sub = 1).
- **A → AA:** A‑AA preserved. AA's children were not in A's scene (sub = 1) → fresh‑fan. Pattern repeats at every level.

### 6.3 — 1‑2
- **Top:** `X, A…Z` (radial).
- **X → A:** X‑A preserved. `AA…AZ` fresh‑fanned; grandchildren `AAA…AZZ` fanned per child (sub = 2).
- **A → AA onward:** identical to 2‑2 from here — children now pre‑exist in each parent scene, so inherit‑and‑widen takes over.

### 6.4 — 2‑1
- **Top:** `X, A…Z, AA…ZZ` (radial).
- **X → A:** X‑A preserved. `AA…AZ` were in the top scene → inherit‑and‑widen (as in 2‑2), but **no grandchildren** (sub = 1).
- **A → AA onward:** replicates 1‑1 — no pre‑existing children below, so fresh‑fan each hop.

---

## 7. Current vs target

| Aspect | Current code | Target (this spec) |
|--------|--------------|--------------------|
| Sub‑scene slice depth | `getMermaidFanSceneSlice` always emits `C + P + children + grandchildren` (2 levels); `subSceneDepth` is ignored (reaches only the scene description string). | Slice honours `subSceneDepth`: `1` → `C + P + children`; `2` → adds grandchildren. |
| Incoming edge when children absent | Fused into `canPreserve`; when children aren't in the parent scene, the code drops to Strategy 2 and pins P at a fixed `−π/2` bearing, **discarding the real edge angle**. | Incoming edge preserved unconditionally (§5.1). |
| Children arrangement | Only reachable when `canPreserve` holds (needs children present *and* edge available). | Gated solely on "children present in parent scene" (§5.2); independent of edge preservation. |
| Fixed‑bearing fallback | Used whenever `canPreserve` is false — the main cause of orientation flips at top depth = 1. | Retained **only** for the genuine no‑parent‑info case (no `posC` at all). |

Net effect of the gap: only **2‑2** satisfies the FCI today. **2‑1** over‑draws grandchildren; **1‑2** and **1‑1** flip orientation on the first hop; **1‑1**/**2‑1** ignore the sub‑depth lever.

---

## 8. Implementation plan

Two changes, each independently testable. Both live under `src/storage/markdown/`.

### Step 1 — Honour sub depth in the slice
**File:** `scene-slice.ts` (`getMermaidFanSceneSlice`), **caller:** `import-builder.ts`.

- Add a `depth: 1 | 2` parameter (or a numeric depth) to `getMermaidFanSceneSlice`.
- Build the node set as `C + P + children`, and include grandchildren **only when `depth >= 2`**.
- In `import-builder.ts`, pass `selection.subSceneDepth` through to the fan slice (it is already threaded to `buildScene` as `depth`).
- Consequence: at sub depth = 1, `grandchildrenByChild` in the fan layout is empty, so the grandchild fan naturally produces nothing — **no fan‑layout change needed for §5.3**.

*Fixes: 2‑1 and 1‑1 over‑drawing grandchildren.*

### Step 2 — Split the continuity gate in the fan layout
**File:** `layout/fan.ts` (`computeFanScenePositions`).

Replace the single `canPreserve` branch with two independent conditions:

1. **`hasIncomingEdge`** = `centralInParent` exists (and, if `parentId` set, P is in the parent scene). Almost always true for sub‑scenes.
   - When true: place P at `subtract(parentScenePos[parentId], centralInParent)` (= `−posC`) — preserving the edge.
   - Derive `parentBearing` from P's placed position; the children's centre bearing is `parentBearing + π` (away from P).
2. **`childrenPrePositioned`** = every child of C is present in the parent scene.
   - When true: `placeSpreadChildren(...)` (inherit‑and‑widen), centred on the away‑from‑P bearing.
   - When false: `fanAround(origin, awayBearing, spreadArc, children, …)` (fresh‑fan).
3. **No‑parent‑info fallback** (neither `centralInParent` nor a usable parent): keep the existing fixed‑bearing Strategy 2. This should now only trigger for the anchor's own degenerate cases, not for ordinary descents.

Grandchild fanning (the existing per‑child `fanAround` loop) is unchanged — it simply operates over whatever grandchildren the slice provided (Step 1 controls that).

*Fixes: orientation flips at top depth = 1 (1‑2, 1‑1); unifies all four combinations under the FCI.*

### Verification matrix
Import a small tree (X with ≥3 children, each with ≥2 children, at least one grandchild layer) and check each combo:

| Combo | X→A edge held | A's children | A's grandchildren | A→AA edge held |
|-------|---------------|--------------|-------------------|----------------|
| 2‑2 | yes | inherit‑widen | fanned | yes |
| 2‑1 | yes | inherit‑widen | none | yes |
| 1‑2 | yes | fresh‑fan | fanned | yes |
| 1‑1 | yes | fresh‑fan | none | yes |

"Edge held" = the incoming edge keeps its angle and length across the transition (no orientation flip). `type-check` clean after each step.

---

## 9. Edge-type scene inclusion

This section specifies a **composition-layer** feature that sits beneath every Mermaid-import layout (fan, radial, and the two flow layouts). It governs *which nodes and edges land in each generated scene* — not the import itself. Every node and edge is always imported into the `nodes` / `edges` object stores; this only shapes the `scenes` store.

### 9.1 Motivation

Scene membership is derived from a BFS over an adjacency built from the flowchart's edges. Two properties of that adjacency were previously hard-coded and surprising:

- It was **undirected** — an edge `E → N` made `E` a candidate child of `N`, so nodes pointing *into* a node showed up as its "children".
- It ignored **edge type** — every relationship extended a scene equally, with no way to say "this relationship defines structure, that one is just a cross-link."

The fix makes both **per-edge-label, author-controlled** in the import dialog's edge-label grid.

### 9.2 The three flags (per Mermaid label)

Each row of the edge-label grid (already keyed per Mermaid label) gains three checkboxes. Flags are **per label**; two labels mapping to the same Knogra edge type may carry different flags.

| Flag | Column | Effect when building a scene centred on N |
|------|--------|-------------------------------------------|
| **Include children** | Children | Traverse the edge **forward** (`source → target`): N's targets of this label enter the scene. |
| **Include parents** | Parents | Traverse the edge **backward** (`target → source`): N's sources of this label enter the scene. |
| **Cross-links** | Cross-links | A **non-generative** edge of this label (between two nodes already in the scene) is drawn. Generative edges always draw regardless. |

All three default **ON**, which reproduces the legacy behaviour (undirected, all types, all cross edges) exactly. Publishers opt into pruning by unchecking.

### 9.3 Node inclusion (flags 1–2)

Composition adjacency is built directionally: for each edge of label `L`, push `source → target` iff `L.children`, and `target → source` iff `L.parents`. A scene's node set is the BFS reachable set from its centre over this adjacency, bounded by the depth lever. Worked example, scene centred on X with edges `X→A` (alpha), `X→B` (beta), `C→X` (alpha), `D→X` (beta):

| alpha | beta | Nodes in X's scene |
|-------|------|--------------------|
| children+parents | children+parents | A, B, C, D |
| children only | *off* | A |

### 9.4 Edge inclusion — generative vs cross (flag 3)

Within a composed scene, classify each edge whose endpoints are both present:

- **Generative edge** — connects a node to the neighbour through which it entered the scene (its *scene-parent*). Always drawn; it is the structural backbone.
- **Cross edge** — any other edge among the scene's nodes (sibling links, multi-parent links). Drawn iff its label's **Cross-links** flag is on.

A label with both traversal flags off never brings nodes in, but its cross-links flag can still surface it between nodes present via other relationships — the two concerns are independent. Conversely a fully-off label (all three unchecked) is invisible to composition entirely.

Scene-parent source per layout:
- **Fan** — the global anchor-rooted tree (`parentByMermaidId`): edge `(u,v)` is generative iff `parent(u)=v` or `parent(v)=u`.
- **Radial / flow** — the per-scene BFS from the scene's centre records each node's parent; same test against that local map.

### 9.5 Scene generation gating

On import, a node gets its **own generated scene** only if it is reachable from the anchor through the *enabled* adjacency (§9.3, unbounded depth) **and** it satisfies the existing "Generate scenes for" selection (anchor / hubs / all). A node cut off by disabled relationships gets no scene at import time; regular in-app navigation still auto-creates its scene on demand. Node degree used for hub detection is unchanged — only reachability is added as a gate.

---

## 10. Implementation plan — edge-type scene inclusion

Five steps. The composition adjacency becomes a single shared construction consumed by every slice.

### Step A — Data model + grid UI (`import-dialog.ts`)
- Extend `MermaidEdgeLabelMapping` with `includeChildren`, `includeParents`, `includeCrossEdges` (all `boolean`).
- Add three checkbox columns to the edge-label grid; default checked; read them in `getEdgeLabelMappings`. Adjust the table header and `min-width`.

### Step B — Shared per-edge flag builder (neutral module)
- Add `buildEdgeSceneFlags(edges, mappings)` → `EdgeSceneFlags[]` indexed by edge, resolving each edge's label via `normalizeMermaidEdgeLabel`. Place it (and, to avoid a dialog↔builder import cycle, `normalizeMermaidEdgeLabel`) in a neutral module so both `import-builder.ts` and the dialog preview can call it.

### Step C — Directional adjacency + slices (`scene-slice.ts`)
- `computeAnchorParentMap(parsed, anchor, edgeFlags)` — directed adjacency per children/parents; unbounded BFS → parent map (doubles as the reachable set for §9.5).
- `getMermaidSceneSlice(parsed, centre, depth, allLevels, edgeFlags)` — directed adjacency for node inclusion; record per-scene BFS parents; `edgeIndexes` = generative ∪ cross-links-enabled.
- `getMermaidFanSceneSlice(parsed, central, parentByMermaidId, depth, edgeFlags)` — apply the generative/cross rule to `edgeIndexes` using the global tree.
- Add a `reachableFromAnchor` helper (or reuse `computeAnchorParentMap` keys) for generation gating across all layouts.

### Step D — Wiring + generation gate (`import-builder.ts`)
- Build `edgeFlags` once from `selection.edgeLabelMappings`; thread it into every slice / parent-map call.
- Gate the sub-scene loop: skip any central not in the reachable set.

### Step E — Live preview (`import-dialog.ts`)
- `updateSceneSizeStatus` builds `edgeFlags` from the current grid (via Step B) and passes them to `getMermaidSceneSlice`, so the node/edge count reflects the checkboxes.

### Verification
- Defaults (all three on): imports are byte-identical to pre-feature output.
- alpha children-only, beta off (the §9.3 example): X's scene = {X, A}; B/C/D absent; C/D get no scene unless reachable otherwise.
- Cross-links off for a type: sibling edges of that type vanish while generative edges of the same type remain.
- `type-check` clean after each step.
