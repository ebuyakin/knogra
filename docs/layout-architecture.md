# Layout Architecture

> **Status:** Current — canonical
> **Last reviewed:** 2026-08-08
> **Authority:** Canonical for the **layout domain**: the shared terminology (§1.1), the **Auto-layout feature** (`src/features/autolayout/`) with its module structure and **pluggable scene-layout registry**, and the radial **outer-ring-spreading** algorithm. The membership-growing variant is specified in [autolayout-grow-arrange.md](autolayout-grow-arrange.md); this document covers the feature skeleton and the layout algorithms it dispatches to.
> **History:** Renamed from `autolayout-architecture.md` on 2026-08-07 when the terminology section was added — the document already covered scene transforms that are not auto-layouts, so its scope was the layout domain in all but name. Section numbers were preserved across the rename; external references to §4.2.1, §5, §6, §7 still resolve.
> **Related:** [Documentation map](README.md), [Grow & Arrange](autolayout-grow-arrange.md), [Mermaid Fan Layout](mermaid-fan-layout.md) (a deliberately separate layout lineage — see §8), [Architecture](architecture.md)

## 1. Overview

Auto-layout re-arranges a scene's nodes into a regular shape rooted at the scene's immutable central node. It exposes **one public class**, `AutoLayout`, with four capabilities:

- **`apply(central)`** — re-arrange the nodes already present in the scene (pure motion; no membership change).
- **`growAndArrange(central, degree)`** — pull in the central node's degree-≤N neighbourhood, then arrange the enlarged scene ([autolayout-grow-arrange.md](autolayout-grow-arrange.md)).
- **`rotate(central, degrees)`** — rigidly rotate the visible scene about the central node by a fixed step (§6). Not a layout algorithm: a direct geometric transform that bypasses the registry.
- **`scaleScene(central, factor)`** — change the scene's apparent node size about the central node by a fixed multiplicative step (§7). Also a direct geometric transform (a similarity, not a rotation) that bypasses the registry.

The first two follow the same pipeline: gather live node footprints and edges → **compute relative positions via a layout algorithm** → anchor on the central node → animate to the new positions while re-fitting the viewport. Only the middle step — the geometry — is pluggable; everything else (Cytoscape reads/writes, animation, viewport fit, edge-curve reset, persistence) is shared and layout-agnostic. `rotate` and `scaleScene` share only the animation and persistence tail (§5); being rigid/similar transforms they preserve manual edge curves and do not re-fit (§6, §7).

### 1.1 Layout domain terminology

Knogra has several commands that move nodes around, and their names had drifted into overlap — "spacing", "spread", "tighten", "align", "arrange" were each doing double duty. This section is the **decision record** (agreed 2026-08-07) that fixes the vocabulary for the UI, the code, and these docs.

#### The naming rule

> **UI labels name the perceived effect. Code and docs name the mechanism.**
> Where the two differ, the doc comment states both explicitly.

The clearest case is §7: the mechanism is "scale positions about a pivot and counter-zoom the viewport", but the *only* thing a user perceives is node glyphs getting bigger or smaller. So the code keeps `scaleScene` and the UI says **Enlarge / Shrink**.

#### The families

Commands are classified on two axes — **scope** (whole scene vs. current selection) and **nature** (topology-driven algorithm vs. pure geometric transform):

| Family | Scope | Nature | Anchor | Members |
|---|---|---|---|---|
| **Auto-layout** | scene (visible nodes) | topology-driven **algorithm** | central node | Radial (§4); planned: equal-sector radial, scene-wide grid, layered. Plus **Grow & Arrange**, which also changes scene membership |
| **View transform** | scene | positions + viewport; **no layout change** | central node | **Enlarge / Shrink** (§7) |
| **Scene transform** | scene | rigid geometric **transform** | central node | **Rotate** (§6) |
| **Arrange** | selection | geometric **transform**, pluggable tools | the selection's own centroid | **Align**, **Distribute**, **Circle**, **Grid** (axis-aligned / diagonal), **Rotate**, **Tighten / Spread** |

#### Term definitions

- **Layout** — the umbrella term for this whole domain. Never used as a command name.
- **Auto-layout** — *only* the algorithmic, scene-scoped, topology-aware family. If an operation does not read the graph's edges, it is not an auto-layout. This is why `rotate` and `scaleScene` live on `AutoLayout` for practical reasons but are documented as *transforms*, not layouts.
- **Arrange** — the selection-scoped family of pure geometric tools. Reads node positions and footprints only; never edges. Anchors on the selection's own centroid, never on the central node — **centrality is a semantic property, not a geometric one**, so an author is free to arrange a scene as a tree, a circle, or anything else with the central node anywhere in it.
- **Align** — keeps its narrow, literal meaning: **put node centres on a common line** (Row / Column / Diagonal). Nothing else is called "align".
- **Distribute** — **equalise the gaps** between selected nodes along an axis or line: constant whitespace between adjacent bounding boxes, not equal centre spacing. The extreme nodes stay fixed and nothing moves perpendicular to the axis, so Align and Distribute compose. Standard term in every design tool; adopted deliberately rather than inventing one.
- **Circle** — a **placement** tool, not an alignment: put the selected nodes on a circle centred on their centroid, at their mean current radius (floored so the ring always fits), preserving their current clockwise order. Grouped in the UI under *Shape*, beside Align rather than inside it.
- **Grid** — the other *Shape* tool: snap the selection into a lattice of `⌈√n⌉` columns, cells assigned from the nodes' current rows and columns. Four nodes give the fixed-orientation square that Circle cannot (Circle produces a *rotated* square, since it minimises travel). Spacing is per-axis, so the result is a rectangle that keeps the arrangement's proportions rather than a forced square. Comes in **axis-aligned** and **diagonal** variants — the latter is the same lattice in a 45°-rotated frame, so four nodes land North / East / South / West. Menu-only — no shortcuts.
- **Rotate** — the one name shared by two families, at two scopes: turn the **selection** rigidly about its centroid (arrange tool, step `arrange.rotateStep`), or turn the **whole scene** about its central node (`rotate`, step `autolayout.rotateStep`, §6). The shared name is honest — it is the same gesture — and the shared shortcut resolves by selection size.
- **Tighten / Spread** — change the **distance between** selected nodes, by scaling their positions about their centroid (step `arrange.spacingStep`, default 1.15). Node size is unaffected.
- **Enlarge / Shrink** — the second name shared across two scopes, and the one case where the two mechanisms genuinely differ. At **scene** scope it changes the **apparent size** of every node, leaving screen positions and the stored `scale` untouched — a view transform (`scaleScene`, §7). At **selection** scope it changes the nodes' **actual** per-scene `scale`, leaving graph positions untouched (`SceneNodeOps.scaleNodes`, step `node.scaleStep`). Sharing the name follows the naming rule above: whatever the mechanism, what the user perceives is the same — *these nodes got bigger*. **The selection-scoped command is not a layout command** — it moves nothing — and lives outside this domain in the scene/node-style slice; it is defined here only so the size vocabulary stays complete and the keyboard inventory below stays honest. See [node-design-system.md](node-design-system.md).

#### Two collisions this resolves

**Size vs. distance.** `W` / `Shift+W` were labelled "Tighten / Spread scene spacing", which named the mechanism and hid the effect — and it collided head-on with the planned selection-scoped spacing tool. Renaming them to **Enlarge / Shrink** leaves exactly one Tighten/Spread pair in the product, and the two commands now share no word. `>` / `<` joined later as the selection-scoped size command; it takes the Enlarge / Shrink name deliberately (see the term definition above) and is included here because these three are the commands users confuse:

| | `W` / `Shift+W` | `>` / `<` | `,` / `.` |
|---|---|---|---|
| Label | **Enlarge / Shrink** | **Enlarge / Shrink** | **Tighten / Spread** |
| What visibly changes | node **size** — all, together | node **size** — selected only | node **distance** |
| What visibly stays | screen positions | positions; other nodes' size | node size |
| Scope | whole scene | selection | selection |
| What is written | positions + viewport zoom | `Scene.nodes[id].scale` | positions |
| Domain | layout (§7) | node style | arrange |

The first two are told apart by *relativity*: `W` scales everything together, so nothing changes relative to anything else; `>` changes the selected nodes relative to their neighbours.

Note the polarity, which is easy to get backwards: `W` passes `factor < 1`, contracting positions *and* zooming in — so glyphs **grow**. `Shift+W` does the opposite. See §7.

**"Expand" is reserved.** *Expand* already means "pull a node's children into the scene" in Knogra (`expandNodeConnections`, the node-expansion placement spec). It must not be reused for a geometric operation — this is why the selection spacing tool is *Tighten / Spread* and not *Expand / Contract*.

#### Keyboard namespace

The global keymap is nearly exhausted: every unshifted letter `a`–`z` is bound, and several shifted letters are bound *implicitly* because their handler omits a `!event.shiftKey` guard (`Shift+D`, `Shift+E`, `Shift+M`, `Shift+P`, `Shift+V`, `Shift+X` all fall through to the unshifted action). Digits `1`–`4` mean "degree N" for Grow & Arrange and deliberately carry no shift guard (AZERTY layouts type digits shifted), `0` resets zoom, and `[` / `]` are path history.

Punctuation is now load-bearing too, and it carries the same layout caveat as the digits: `<` / `>` are **shifted** characters on US QWERTY but **unshifted** on most ISO layouts, where `<` sits on its own key left of `Z`. Bindings on them must match the produced character and never guard on `event.shiftKey`, or they break outside the US layout. (`,` / `.` and `<` / `>` therefore cannot collide in either direction.)

Layout-domain bindings:

| Command | Key |
|---|---|
| Auto-layout scene | `Q` |
| Grow & Arrange, degree N | `1`–`4` |
| Rotate clockwise / counter-clockwise | `O` / `Shift+O` — the **selection** when ≥2 nodes are selected, otherwise the **scene** |
| Enlarge / Shrink nodes (scene, apparent size) | `W` / `Shift+W` |
| Enlarge / Shrink nodes (selection, actual `scale`) | `>` / `<` — *node style, not a layout command; listed for namespace completeness* |
| Align row / column / diagonal | `T` / `U` / `Y` |
| Distribute row / column / diagonal | `Shift+T` / `Shift+U` / `Shift+Y` |
| Circle | `Shift+Q` |
| Tighten / Spread selection | `,` / `.` |

Remaining free: `Shift+N` and the digits `5`–`9`.

When the free keys run out, the agreed escape hatch is an **Arrange leader key** — one key entering a transient sub-mode with an on-screen hint bar, where single letters select the tool. Deliberately not built yet: it introduces modality and touches the already-oversized keyboard handler.

---

## 2. Module structure

```
src/features/autolayout/
  autolayout.ts           public class AutoLayout — the only feature-api entry point
  fit.ts                  computeFitViewport — zoom/pan to frame a layout, capped at FIT_MAX_ZOOM (1.5)
  grow-arrange.ts         neighbourhood BFS + seed/grow-in for growAndArrange
  algorithms/
    types.ts              SceneLayout contract + shared layout I/O types
    registry.ts           id → SceneLayout map, resolveLayout()
    radial-shared.ts      reusable radial helpers (spanning forest, leaf weights, footprintRadius)
    outer-ring-spreading.ts   the default radial algorithm (§4)
```

Position tweening lives outside the feature in the shared `utils/cy/node-position-animator.ts` (`NodePositionAnimator` — tweens a node set to new positions and optionally re-frames the viewport, layout-agnostic), shared with the selection-scoped alignment feature per the no-cross-feature-imports rule.

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
  nodes: LayoutInputNode[];   // { id, footprint: { width, height }, currentPos? } — real rendered sizes; currentPos feeds angular ring ordering
  edges: LayoutInputEdge[];   // { sourceId, targetId, order }
  centralId: NodeId;          // the layout root, placed at the origin (0,0)
  params: LayoutParams;       // ringSpacing, siblingGap, ringOrder, … — a superset; each algorithm reads what it needs
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

### 4.2.1 Sibling order — edge order vs. angular preservation

§4.2 fixes each child's *wedge width*; a separate rule fixes the *sequence* in which siblings fill a parent's wedge (clockwise from the wedge start). Two modes, chosen by `params.ringOrder` (setting `autolayout.ringOrder`, default `angular`):

- **`edge`** — siblings follow edge insertion order (`LayoutInputEdge.order`, the Cytoscape edge index). Deterministic but semantically arbitrary: it reflects only when each edge happened to be created.
- **`angular`** — siblings are sorted by their **current on-screen angle** around the central node, measured clockwise from due north (the angle `assignAngles` sweeps from). The layout then perfects radius and spacing while preserving the circular sequence the author arranged by hand. Uses `currentPos`; nodes lacking it sort last (stable).

This lets the author encode a logical ring order **spatially**: drag the ring roughly into the desired clockwise order, re-run — it snaps to an even ring keeping that order. On a fresh scene the current angles are themselves arbitrary, so the first run is arbitrary; it stabilises once the author drags and re-runs.

**Every depth, one reference point.** `orderChildrenByAngle` (`radial-shared.ts`) runs before `assignAngles` and recurses over the whole spanning tree: ring 1, ring 2 and beyond — every node's children are sorted, not just the central node's. The sort key is always the angle around the **scene's central node**, never around the local parent, because a parent's wedge is a contiguous sector as seen from the centre, so the centre-angle reproduces the visual sequence inside that wedge. The only degeneracy is a parent wedge straddling the north seam (rare).

**Both re-arrangement capabilities feed it.** `apply` passes `currentPos` for every visible node. `growAndArrange` does the same for the nodes already on screen and passes the setting too; entrants are seeded at the central node and carry no `currentPos`, so they sort last within their parent (stable) — the hand-arranged sequence survives and newcomers fill in after it.

### 4.3 Ring radius — circumference (sum), not worst case

Each ring (all nodes at one depth) gets a single **minimum radius**: the radius whose circumference holds the total footprint of the ring's nodes.

$$\text{minFit}_d = \frac{\sum_{n \text{ at depth } d}\big(2\cdot\text{footprintRadius}(n) + \text{siblingGap}\big)}{2\pi}$$

- This replaces the previous **worst-case** rule (`max_n footprint(n)/wedge(n)`), where a single node in a thin wedge inflated the whole ring, forcing a large radius and — after the viewport re-fit — unreadably small nodes.
- For a **uniform** ring (equal wedges and sizes) the two formulas are **identical**; they diverge only when wedges are lopsided, and there the sum favours compactness.
- **Overlap tolerance (intentional):** because nodes sit at wedge centres and wedges are leaf-weight-proportional (not footprint-proportional), a node in an unusually thin wedge may overlap a neighbour slightly. This is the accepted trade: one or two local overlaps beat an entire ring rendered too small to read.

`siblingGap` is the additive per-node padding inside the sum. It is a *minimum* gap contribution, not an exact inter-node spacing.

`footprintScale` (setting `autolayout.footprintScale`, default 1) multiplies the reserved footprint (`2·footprintRadius`) inside the sum. The half-diagonal `footprintRadius` over-reserves space — nodes are axis-aligned rectangles, not the circumscribed disks it measures — so values `<1` pack rings and siblings tighter and `>1` looser. It mirrors the Mermaid importer's *Density* knob (`storage/mermaid/layout/`). A pure-multiplier lever was chosen over a geometrically exact tangential footprint to give the author a single, predictable tightness control.

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

These run in `AutoLayout` for the re-arrangement capabilities (`apply`, `growAndArrange`), regardless of algorithm. `rotate` is rigid and shares only **Animation** and **Persistence** (§6):

- **Edge-curve reset** — every repositioned/added edge has its hand-tuned curve reset to the default automatic bezier; visual style overrides are preserved.
- **Animation** — `AutoLayoutAnimator` tweens node positions and re-frames the viewport concurrently (`grow-arrange` additionally grows entrants in).
- **Viewport fit** — `fit.ts`'s `computeFitViewport` matches `Scene.fit()`: padded, and **capped at `FIT_MAX_ZOOM = 1.5`** so sparse results are not blown up.
- **Persistence** — `graphSaver` is suspended during animation frames, then one `forceSave` records the final state. Edit mode only.

---

## 6. Scene rotation (`rotate`)

`rotate(central, degrees)` rigidly rotates every **visible** scene node about the central node's *current* position by a fixed angular step (setting `autolayout.rotateStep`, default 15°; positive = clockwise on screen). Invoke via **Scene design ▸ Rotate ▸ Clockwise / Counter-clockwise**, or the `O` / `Shift+O` shortcuts (±step) **when fewer than two nodes are selected** — with a selection those keys rotate the selection instead, via the arrange tool of the same name ([arrange-architecture.md](arrange-architecture.md) §6.4). Edit mode only; folded/hidden nodes keep their offsets, matching `apply`.

It is **not** a layout algorithm — no spanning forest, no registry dispatch. It is a direct affine transform about the pivot `p` (the central node's position), for step `θ` in radians:

$$\begin{aligned} x' &= p_x + (x-p_x)\cos\theta - (y-p_y)\sin\theta \\ y' &= p_y + (x-p_x)\sin\theta + (y-p_y)\cos\theta \end{aligned}$$

(screen y-down, so a positive `θ` reads clockwise). The central node maps to itself.

**Two deliberate departures from §5:**

- **No edge-curve reset.** Manual bezier edges store `control-point-distances`/`-weights` *relative* to the source→target line. A rigid rotation turns every such line by the same `θ`, so each curve rotates with its endpoints and stays correct — unlike a non-rigid re-arrangement, which invalidates the offsets. Hand-tuned bends are preserved.
- **No viewport re-fit.** Rotation preserves each node's distance from the pivot, so the scene's bounding circle about the pivot is unchanged — if it fit before, it fits after. The central node stays fixed on screen and the rest orbits it in place; re-fitting would only inject an unwanted zoom on every nudge.

It reuses **Animation** (`AutoLayoutAnimator`, positions only — no viewport target) and **Persistence** (suspend during the glide, one `forceSave` of the final orientation).

## 7. Apparent node size — Enlarge / Shrink (`scaleScene`)

**User-facing name: Enlarge / Shrink nodes.** `scaleScene(central, factor)` changes how large the scene's nodes *look* **without touching per-node `scale`** — that property stays reserved for intentional emphasis. Invoke via **Scene design ▸ Node size ▸ Enlarge / Shrink** or the `W` / `Shift+W` shortcuts. Edit mode only; folded/hidden nodes keep their offsets, matching `rotate`.

Per the naming rule (§1.1) the method name states the mechanism and the label states the effect. **Mind the polarity** — it is the opposite of the naive reading:

| Command | `factor` | Positions | Viewport zoom | Perceived result |
|---|---|---|---|---|
| **Enlarge** (`W`) | `1 / densityStep` (< 1) | contract toward the pivot | `× densityStep` (in) | nodes look **bigger**, screen positions unchanged |
| **Shrink** (`Shift+W`) | `densityStep` (> 1, default 1.15) | spread from the pivot | `÷ densityStep` (out) | nodes look **smaller**, screen positions unchanged |

Like `rotate` it is **not** a layout algorithm — no spanning forest, no registry dispatch. It is a **similarity transform about the pivot** `p` (the central node's position), combined with an inverse viewport zoom about the *same on-screen point*:

- **Positions** (graph space): every visible node `x → p + (x − p)·\text{factor}`. The central node maps to itself.
- **Viewport**: `zoom → zoom / factor`, with pan adjusted to keep the pivot's screen position fixed:

$$\text{pan}' = \text{pan} + p \cdot (\text{zoom} - \text{zoom}/\text{factor})$$

Because Cytoscape renders `screen = graph·zoom + pan`, this combination leaves **every** node's on-screen *centre* invariant — only the node glyphs grow (Enlarge) or shrink (Shrink), since their graph size is untouched. The result reads as a pure node-size change anchored on the central node wherever it sits (it need not be the geometric centre — that offset is often intentional).

Under the hood the *spacing between nodes in graph space* does change, which is what makes room for the larger glyphs; but since the viewport compensates exactly, no user ever perceives it as a spacing change. That gap between mechanism and effect is precisely why the command is labelled by its effect.

Because the stored per-node `scale` is never touched, this is a **view** transform: nothing about the nodes themselves changes, and no node changes size *relative to another*. To make particular nodes bigger than their neighbours, use the selection-scoped Enlarge / Shrink (`>` / `<`, §1.1), which writes `Scene.nodes[id].scale` instead.

**Three deliberate departures from §5:**

- **No edge-curve reset.** Edges are left untouched; Cytoscape re-renders each from its moved endpoints. Manual bezier bends (`control-point-distances`/`-weights`) simply become proportionally shallower or deeper and stay hand-adjustable — the agreed behaviour.
- **No viewport re-fit** and **no `FIT_MAX_ZOOM` cap.** The zoom is stepped by exactly `1/factor` about the pivot (not `computeFitViewport`), which is what pins the scene in place.
- **Exact reversibility.** Because the pivot is the fixed central node and the zoom is not clamped (the Cytoscape instance sets no `minZoom`/`maxZoom`), applying `1/factor` restores the prior positions *and* framing exactly (to floating-point epsilon). The opposite command is a true undo.

It reuses **Animation** (`NodePositionAnimator` with a supplied `ViewportTarget` — the one place a non-`computeFitViewport` viewport is fed in) and **Persistence** (suspend during the glide, one `forceSave` of the final positions and viewport).

**Known limitations (shared with `rotate`):** scene background images are not scaled, so shrinking nodes detaches them from memory-palace placements; and a subtree folded beforehand unfolds at its (moved) root's original offset.

## 8. Future directions

- **More algorithms:** equal-sector radial, grid, layered/flow, force-directed — each a `SceneLayout` behind the registry.
- **The Arrange family:** the selection-scoped tools named in §1.1 (Distribute, Circle, Tighten / Spread), built on a tool registry mirroring §3. To be specified in its own document when the family lands.
- **Sub-strategy composition:** if radial variants proliferate, factor angle-allocation / ring-radius / placement into named, swappable policies. Not before real demand.
- **Mermaid convergence:** the importer's layouts (`storage/mermaid/layout/`) are a **separate lineage** — they estimate footprints from title text before nodes exist, whereas auto-layout uses real rendered footprints. They are kept parallel on purpose; extract a shared geometry core only if they demonstrably converge.
