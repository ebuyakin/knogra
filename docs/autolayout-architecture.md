# Auto-layout Architecture

> **Status:** Current — canonical
> **Last reviewed:** 2026-07-11
> **Authority:** Canonical for the **Auto-layout feature** (`src/features/autolayout/`): its module structure, the **pluggable scene-layout registry**, and the radial **outer-ring-spreading** algorithm. The membership-growing variant is specified in [autolayout-grow-arrange.md](autolayout-grow-arrange.md); this document covers the feature skeleton and the layout algorithms it dispatches to.
> **Related:** [Documentation map](README.md), [Grow & Arrange](autolayout-grow-arrange.md), [Mermaid Fan Layout](mermaid-fan-layout.md) (a deliberately separate layout lineage — see §6), [Architecture](architecture.md)

## 1. Overview

Auto-layout re-arranges a scene's nodes into a regular shape rooted at the scene's immutable central node. It exposes **one public class**, `AutoLayout`, with two capabilities:

- **`apply(central)`** — re-arrange the nodes already present in the scene (pure motion; no membership change).
- **`growAndArrange(central, degree)`** — pull in the central node's degree-≤N neighbourhood, then arrange the enlarged scene ([autolayout-grow-arrange.md](autolayout-grow-arrange.md)).

Both follow the same pipeline: gather live node footprints and edges → **compute relative positions via a layout algorithm** → anchor on the central node → animate to the new positions while re-fitting the viewport. Only the middle step — the geometry — is pluggable; everything else (Cytoscape reads/writes, animation, viewport fit, edge-curve reset, persistence) is shared and layout-agnostic.

---

## 2. Module structure

```
src/features/autolayout/
  autolayout.ts           public class AutoLayout — the only feature-api entry point
  autolayout-animator.ts  tweens node positions + re-frames the viewport (layout-agnostic)
  fit.ts                  computeFitViewport — zoom/pan to frame a layout, capped at FIT_MAX_ZOOM (1.5)
  grow-arrange.ts         neighbourhood BFS + seed/grow-in for growAndArrange
  algorithms/
    types.ts              SceneLayout contract + shared layout I/O types
    registry.ts           id → SceneLayout map, resolveLayout()
    radial-shared.ts      reusable radial helpers (spanning forest, leaf weights, footprintRadius)
    outer-ring-spreading.ts   the default radial algorithm (§4)
```

**Boundaries (upheld):**

- **One feature, one public class.** `feature-api` exposes only `autolayout`. All new behaviour lands as methods on `AutoLayout` or as feature-local modules it calls.
- **Layout algorithms are pure and Cytoscape-free.** They take plain data and return positions. All `cy` access stays in `AutoLayout`. This keeps algorithms unit-testable and swappable.
- **No cross-feature imports.** The feature imports only within itself and downstream (`utils/`, `styles/`, `config/`, `storage/`, `core/`).
- **`config` holds data, not behaviour.** The list of available algorithms (ids + labels) lives in `config`; their implementations live here. See §3.3.
- **Feature-local sharing** (radial helpers, fit, types) via clear file APIs — the intra-feature analogue of `utils/`.

---

## 3. Pluggable layout algorithms

### 3.1 The contract

Every algorithm is a pure function of one uniform shape:

```ts
type SceneLayoutFn = (input: LayoutInput) => Map<NodeId, Position>;

interface LayoutInput {
  nodes: LayoutInputNode[];   // { id, footprint: { width, height } } — real rendered sizes
  edges: LayoutInputEdge[];   // { sourceId, targetId, order }
  centralId: NodeId;          // the layout root, placed at the origin (0,0)
  params: LayoutParams;       // ringSpacing, siblingGap, … — a superset; each algorithm reads what it needs
}

interface SceneLayout {
  id: string;                 // stable key, also the persisted `autolayout.layoutType` value
  compute: SceneLayoutFn;
}
```

Positions are **relative to the central node at the origin**; `AutoLayout` offsets them by the central node's current position so the scene never jumps. Algorithms that don't need `edges` ignore them; algorithms needing new knobs add **optional** fields to `LayoutParams`.

### 3.2 The registry

```ts
// algorithms/registry.ts
const LAYOUTS: Record<string, SceneLayout> = { radial: outerRingSpreadingLayout /*, … */ };
export const resolveLayout = (id: string): SceneLayout => LAYOUTS[id] ?? LAYOUTS.radial;
```

`AutoLayout` dispatches once, in both `apply` and `growAndArrange`:

```ts
const relative = resolveLayout(getSetting('autolayout.layoutType')).compute({ nodes, edges, centralId, params });
```

Single dispatch point, no scattered `switch`, graceful fallback to `radial` for an unknown/removed id.

### 3.3 Settings integration

The dropdown lives in `setting-definitions.ts` (in `config/`), which must not import features. The id/label **catalog** therefore lives in `config`:

```ts
// config/autolayout-settings.ts
export const AUTOLAYOUT_ALGORITHMS = [
  { id: 'radial', label: 'Radial (outer-ring spreading)' },
  // future: { id: 'radial-equal', label: 'Radial (equal sectors)' }, …
] as const;
```

`setting-definitions` builds the select options from this catalog; the features registry keys its implementations off the **same ids**. One source of truth for ids/labels (config = data), implementations in features (behaviour). The persisted value `autolayout.layoutType` stays `'radial'` for backward compatibility, even though the algorithm's defining trait is now outer-ring spreading.

### 3.4 Adding a new algorithm

1. Add `{ id, label }` to `AUTOLAYOUT_ALGORITHMS` in `config`.
2. Add `algorithms/<name>.ts` exporting a `SceneLayout` (a pure `compute`), reusing `radial-shared.ts` for radial-family variants.
3. Register it in `registry.ts` under the same id.

No caller changes — `AutoLayout`, the animator, fit, and grow-arrange are all algorithm-agnostic. A radial variant (e.g. *equal sectors for all children*) typically only swaps the **angle-allocation** rule and reuses the spanning forest, ring-radius, and placement helpers, so it stays small.

A finer decomposition into composable sub-strategies (separate angle-allocator / radius-policy / placement plug-points) is **deliberately deferred** until there are 2–3 real algorithms to generalise from — premature abstraction otherwise.

---

## 4. The radial outer-ring-spreading algorithm

The default `radial` algorithm. Four stages; the last two encode the improvements agreed on 2026-07-11.

### 4.1 Spanning forest

BFS spanning tree rooted at `centralId` (`radial-shared.ts`). Each non-central node gets a single parent (its BFS predecessor); non-tree edges are ignored for placement. Disconnected components attach as depth-1 subtrees so each still gets a wedge.

### 4.2 Angle allocation — wedge by leaf weight

Each node's **leaf weight** = number of leaves in its subtree. The root's children split the full circle in proportion to leaf weight; recursively, each node splits *its* wedge among its children the same way. A node is ultimately placed at the **centre of its wedge**. (Angular width is decided by subtree size, not by physical size — this is the lever a future *equal-sectors* variant would change.)

### 4.3 Ring radius — circumference (sum), not worst case

Each ring (all nodes at one depth) gets a single **minimum radius**: the radius whose circumference holds the total footprint of the ring's nodes.

$$\text{minFit}_d = \frac{\sum_{n \text{ at depth } d}\big(2\cdot\text{footprintRadius}(n) + \text{siblingGap}\big)}{2\pi}$$

- This replaces the previous **worst-case** rule (`max_n footprint(n)/wedge(n)`), where a single node in a thin wedge inflated the whole ring, forcing a large radius and — after the viewport re-fit — unreadably small nodes.
- For a **uniform** ring (equal wedges and sizes) the two formulas are **identical**; they diverge only when wedges are lopsided, and there the sum favours compactness.
- **Overlap tolerance (intentional):** because nodes sit at wedge centres and wedges are leaf-weight-proportional (not footprint-proportional), a node in an unusually thin wedge may overlap a neighbour slightly. This is the accepted trade: one or two local overlaps beat an entire ring rendered too small to read.

`siblingGap` is the additive per-node padding inside the sum. It is a *minimum* gap contribution, not an exact inter-node spacing.

### 4.4 Ring placement — spread inner rings inside the outer radius

Radii are chosen so rings fill the disk evenly instead of bunching, while `ringSpacing` acts as a **minimum** gap (never an exact one):

1. **Hard minimums (inside-out):** `hardMin_d = max(hardMin_{d-1} + ringSpacing, minFit_d)`, with `hardMin_0 = 0`. Let `Rmax = hardMin_D` (D = outermost depth). This keeps the outer ring at its true minimum.
2. **Redistribute (outside-in):** set `r_D = Rmax`, then for each inner ring `d` from `D-1` down to `1`:

$$r_d = \max\Big(\text{minFit}_d,\ \min\big(\underbrace{R_{\max}\cdot d / D}_{\text{even target}},\ r_{d+1} - \text{ringSpacing}\big)\Big)$$

This provably keeps radii monotonic, honours `ringSpacing` as a floor, never exceeds the outer radius, and pulls inner rings inward to fill the centre — pushing a ring back out only if its own `minFit` demands it. Because `Rmax ≥ D·ringSpacing` and `hardMin_d ≥ hardMin_{d-1}+ringSpacing`, the clamp bounds never conflict.

**Worked example.** 3 rings, `ringSpacing = 50`, outer `minFit = 1000`, inner minima small → radii become **0 / 333 / 666 / 1000** instead of the old **0 / 900 / 950 / 1000** (dead centre). If ring 1 genuinely needed 500 to fit its nodes, it sits at 500, not 333.

**Why both §4.3 and §4.4 are needed.** Redistribution can only pull an inner ring inward when its `minFit` is small; the old worst-case rule kept inner minima large (thin-wedge domination), pinning them near the edge. The sum-based radius shrinks the minima; the redistribution then spreads them. Neither change alone produces the even fill.

### 4.5 Placement

Each node is placed at its wedge-centre angle and its ring radius. Positions are returned relative to the central node at the origin.

---

## 5. Shared, layout-agnostic stages

These run in `AutoLayout` regardless of algorithm:

- **Edge-curve reset** — every repositioned/added edge has its hand-tuned curve reset to the default automatic bezier; visual style overrides are preserved.
- **Animation** — `AutoLayoutAnimator` tweens node positions and re-frames the viewport concurrently (`grow-arrange` additionally grows entrants in).
- **Viewport fit** — `fit.ts`'s `computeFitViewport` matches `Scene.fit()`: padded, and **capped at `FIT_MAX_ZOOM = 1.5`** so sparse results are not blown up.
- **Persistence** — `graphSaver` is suspended during animation frames, then one `forceSave` records the final state. Edit mode only.

---

## 6. Future directions

- **More algorithms:** equal-sector radial, grid, layered/flow, force-directed — each a `SceneLayout` behind the registry.
- **Sub-strategy composition:** if radial variants proliferate, factor angle-allocation / ring-radius / placement into named, swappable policies. Not before real demand.
- **Mermaid convergence:** the importer's layouts (`storage/mermaid/layout/`) are a **separate lineage** — they estimate footprints from title text before nodes exist, whereas auto-layout uses real rendered footprints. They are kept parallel on purpose; extract a shared geometry core only if they demonstrably converge.
