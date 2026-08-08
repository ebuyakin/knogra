# Arrange Architecture

> **Status:** Current — canonical
> **Last reviewed:** 2026-08-08
> **Authority:** Canonical for the **Arrange feature** (`src/features/arrange/`): the selection-scoped geometric tools, their contract, the tool registry, the shared execution pipeline, and the one-shot undo. The domain terminology that distinguishes Arrange from Auto-layout is defined in [layout-architecture.md](layout-architecture.md) §1.1 and is not repeated here.
> **Related:** [Documentation map](README.md), [Layout architecture](layout-architecture.md), [Grow & Arrange](autolayout-grow-arrange.md), [Architecture](architecture.md)

## 1. What Arrange is

Arrange is the **selection-scoped** counterpart to auto-layout. Where auto-layout re-arranges an entire scene using its graph structure, an arrange tool takes the nodes the user has selected and applies a **pure geometric transform** to them.

Five invariants define the family. Every tool obeys all five:

1. **Selection-scoped.** Only `node:selected:visible` moves. Every other node is untouched.
2. **Anchored on the selection's own geometry** — usually its centroid — never on the scene's central node. *Centrality is a semantic property, not a geometric one*: an author may lay a scene out as a top-down tree, a ring, or anything else, with the central node anywhere in it. To exclude a node, don't select it.
3. **Geometry only.** Tools read node positions and footprints. They never read edges, so the graph's structure has no influence on the result.
4. **No viewport change, no edge-curve reset.** Edges re-render to their moved endpoints; hand-tuned bends stay the user's to adjust. Contrast auto-layout, which resets curves because a structural re-layout invalidates them.
5. **Edit mode only.**

Invariant 3 is what makes the tools trivially testable, and invariant 4 is what makes them feel like nudges rather than re-layouts.

---

## 2. Module structure

```
src/features/arrange/
  arrange.ts            public class Arrange — the only feature-api entry point
  tools/
    types.ts            ArrangeToolId, ArrangeGroup, ArrangeTool contract, I/O types
    registry.ts         id → ArrangeTool, resolveTool / listTools / minimumSelection
    align.ts            align-row, align-column, align-diagonal
    distribute.ts       distribute-horizontal, -vertical, -diagonal
    circle.ts           circle
    grid.ts             grid, grid-diagonal
    rotate.ts           rotate-cw, rotate-ccw
    spacing.ts          tighten, spread
```

Position tweening lives outside the feature in `utils/cy/node-position-animator.ts`, shared with `autolayout` — neither feature imports the other, per the no-cross-feature-imports rule.

**Boundaries (upheld):**

- **One feature, one public class.** `feature-api` exposes only `arrange`. The UI never imports the registry: `Arrange` re-exposes `tools()` so menus can be generated through the single door.
- **Tools are pure and Cytoscape-free.** They receive plain geometry and return positions. All `cy` access stays in `Arrange`.
- **No cross-feature imports.** The feature imports only within itself and downstream (`utils/`, `config/`, `storage/`, `core/`).
- **Deliberate duplication over coupling.** `ArrangeNode` mirrors auto-layout's `LayoutInputNode` in shape. They are *not* shared: duplicating a three-field geometry interface is cheaper than a dependency between two feature slices.

---

## 3. The tool contract

```ts
interface ArrangeNode {
  id: NodeId;
  position: Position;                            // node centre, graph coordinates
  footprint: { width: number; height: number };  // rendered bounding box
}

interface ArrangeParams {          // superset; each tool reads what it needs
  siblingGap?: number;
  footprintScale?: number;
  spacingStep?: number;
  rotationDegrees?: number;
}

interface ArrangeInput { nodes: ArrangeNode[]; params: ArrangeParams; }

interface ArrangeTool {
  id: ArrangeToolId;               // stable key, also the caller's argument
  label: string;                   // UI label, read under its group heading
  shortcut?: string;               // omitted for menu-only tools
  group: ArrangeGroup;             // 'align' | 'distribute' | 'shape' | 'rotate' | 'spacing'
  minNodes: number;                // below this the tool is disabled and does nothing
  selfReversible?: true;           // an opposite command already reverses it (§4.3)
  compute(input: ArrangeInput): Map<NodeId, Position>;
}
```

`compute` returns the new centre for each node it wishes to move. Nodes omitted keep their position; an **empty map means "nothing to do"** — a degenerate input such as coincident endpoints — and is a valid, silent result rather than an error.

### 3.1 The registry

```ts
// tools/registry.ts
const TOOLS: Record<ArrangeToolId, ArrangeTool> = { 'align-row': alignRowTool, /* … */ };
export const resolveTool = (id: ArrangeToolId): ArrangeTool => TOOLS[id];
export const listTools = (): readonly ArrangeTool[] => Object.values(TOOLS);
```

Two deliberate differences from the scene-layout registry ([layout-architecture.md](layout-architecture.md) §3.2):

- **`ArrangeToolId` is a closed union, so lookup is total** — no `?? fallback`. The layout registry needs a fallback because its id comes from a *persisted setting* that may name a removed algorithm; an arrange tool id comes from the *command the user invoked* and is compile-checked at every call site.
- **No `config` catalog.** The layout catalog lives in `config` because a settings dropdown needs it and `config` must not import features. Arrange tools are never chosen from a setting, so ids and labels stay with the implementations.

`Object.values` preserves string-key insertion order, so the `TOOLS` literal is the single source of both membership and display order — no second list to keep in sync.

### 3.2 Adding a tool

1. Write `tools/<name>.ts` exporting an `ArrangeTool` with a pure `compute`.
2. Add its id to `ArrangeToolId` (and its group to `ArrangeGroup` if new).
3. Add one line to `TOOLS`, positioned where it should appear in the menu.
4. Optionally bind a shortcut in `keyboard-handler.ts` and list it in `shortcut-definitions.ts`.

**No UI change is required.** The context menu is generated from `listTools()` (§5), so a new tool appears automatically with correct grouping and enable/disable behaviour.

---

## 4. The shared pipeline

`Arrange` owns everything that is not geometry:

1. **Edit-mode guard.**
2. **Coalescing** (§4.1).
3. **Selection read** — `cy.nodes(':selected:visible')` mapped to `ArrangeNode[]` with live positions and rendered bounding boxes.
4. **Minimum-count check** against the tool's `minNodes`.
5. **Params resolution** from settings.
6. **`tool.compute(...)`**, skipped if it returns an empty map.
7. **Undo arming** (§4.3), unless the tool is `selfReversible`.
8. **Animation** — `NodePositionAnimator`, a 200 ms glide, positions only (no `ViewportTarget`, per invariant 4).
9. **Persistence** — `graphSaver.suspend('arrange')` across the glide, then one `forceSave`.

### 4.1 Coalescing

A tool must read **settled** positions. Without a guard, a second keypress during the 200 ms glide would compute its transform from half-moved nodes, and Cytoscape would queue a second tween on top of the first.

`run()` therefore serialises: one application at a time, with a single pending slot.

- **Same tool repeated** — a `repeats` counter accumulates, and is folded into whichever step knob the tool composes on, so N presses land exactly N steps away with **no drift**: `spacingStep ** repeats` for Tighten/Spread (multiplicative) and `rotateStep × repeats` for Rotate (additive). Tools without such a knob ignore `repeats`, and re-running them is idempotent anyway.
- **Different tool** — replaces the pending slot; the last press within the window wins. Rapid mixed presses are not a real workflow, and the alternative (a queue) would make the UI feel laggy.

### 4.2 Settings

| Setting | Owner | Used by | Rationale |
|---|---|---|---|
| `arrange.spacingStep` (1.15) | `config/arrange-settings.ts` | Tighten / Spread | Its own key, deliberately **not** `autolayout.densityStep` — that one now means *apparent node size*, and sharing it would re-merge the two concepts the terminology work separated. |
| `arrange.rotateStep` (15°) | `config/arrange-settings.ts` | Rotate cw / ccw | Its own key, deliberately **not** `autolayout.rotateStep` — different scope (selection vs. scene), and a coarse scene rotation pairs naturally with a finer selection one. |
| `autolayout.siblingGap` | auto-layout | Circle, Grid | Shared on purpose: both use the same circumference/extent fitting rule as a radial ring, so a user who tightened their rings expects circles and grids to tighten with them. |
| `autolayout.footprintScale` | auto-layout | Circle, Grid | As above. |

`Arrange` resolves all three and passes them in `params`, so tools never touch `config` and stay pure.

### 4.3 One-shot undo

A misfire — Row when you meant Column — is unrecoverable by hand once a dozen nodes have jumped. `Arrange` therefore keeps **one** slot of pre-arrangement positions and offers **Undo arrange** at the top of the submenu. It is a get-out-of-a-misclick, not an undo stack: no history, no persistence, no `Ctrl+Z`, and nothing outside the feature is touched.

```ts
interface ArrangeUndo {
  sceneId: SceneId;                 // positions are per-scene; the slot is pinned to one
  before: Map<NodeId, Position>;    // what undo restores
  after:  Map<NodeId, Position>;    // where the arrangement put them — the fingerprint
}
```

**Validated at read time, never invalidated by events.** This is the design's whole point. The context menu is rebuilt on every right-click, so "is the offer still live?" is a pure function evaluated at that moment: same scene, every node still present and visible, and every node still within half a unit of `after`. One loop, no listeners, no timers, no subscription to tear down. Every way the offer *should* retire shows up as a mismatch — a manual drag, a deletion, a fold, an auto-layout or scene rotate, a later arrangement (which overwrites the slot), a reload (in-memory), or using it (consumed).

**Only irreversible tools arm it.** Rotate and Tighten/Spread declare `selfReversible`, because `Shift+O` and `,` are their exact inverses — a snapshot would be a second way to do the same thing, and two mechanisms for one outcome is the confusion this feature exists to avoid. Align, Distribute, Circle and Grid destroy information, so they arm it. Absent is the safe default: a new tool gets undo unless its author opts out.

**Accepted quirks**, both correct-but-surprising rather than wrong:

- *Scene round-trip.* Leaving the scene and returning restores the arranged positions from storage, so the offer reappears — valid, since it is still that scene's pre-arrangement layout, just later than expected. Retiring it would need a "you left and came back" signal, i.e. exactly the state monitoring this design avoids. Comparing Cytoscape element identity was rejected: the transition feature deliberately keeps some elements alive, so it would work inconsistently and couple `arrange` to another feature's internals.
- *Coalesced repeats.* A burst of presses may land as several runs and the slot holds only the last, so undo steps back one run rather than the whole burst. It only affects tools with a composable knob — which are precisely the `selfReversible` ones that never arm undo in the first place.

The submenu stays reachable when `canUndo()` even with nothing selected: clicking the canvas to look at the result is the obvious next gesture, and it would otherwise disable the very menu holding the offer. Edge curves need no handling — arrange never touched them, so they re-render to the restored endpoints exactly as they did on the way out.

---

## 5. UI generation

The **Arrange nodes** submenu is built once, in `buildArrangeMenu` (`ui/context-menu/menu-context.ts`), and used by both the node menu and the canvas menu. It iterates `arrange.tools()` and:

- renders `label (shortcut)`, or just `label` for menu-only tools;
- opens each group with a heading from `ARRANGE_GROUP_LABELS` whenever `group` changes — which is why the `TOOLS` literal keeps groups contiguous. The heading carries the operation ("Align"), so each `label` names only its axis or shape ("Row");
- enables each entry only at `selectionSize >= tool.minNodes`, and the whole submenu at `minimumSelection()`.

Selection size comes from `arrange.selectionSize()` rather than the UI counting nodes itself, so the menu's notion of "selected" matches the feature's (`:selected:visible`) exactly. **Undo arrange** is prepended only when `arrange.canUndo()` — an item that is usually absent reads as "the thing you just did", where a permanently greyed one would be clutter in an already long submenu.

---

## 6. The tools

Grouped as they appear in the menu.

### 6.1 Align (`T` / `U` / `Y`)

Put node centres on a common line — the term's literal meaning, and nothing else in the product is called "align".

- **Row / Column** — every centre adopts the mean Y (row) or mean X (column).
- **Diagonal** — the min-X and max-X nodes fix a line and stay put; every node is orthogonally projected onto it. Needs ≥3 (two nodes already define the line).

### 6.2 Distribute (`Shift+T` / `Shift+U` / `Shift+Y`)

Equalise the gaps: `gap = (span − Σ extents) / (n − 1)`, applied edge-to-edge between adjacent bounding boxes.

- **Equal gaps, not equal centre spacing.** Knogra footprints vary enormously (an equation node beside a circle node); even centre spacing would leave visibly uneven whitespace.
- **The extreme nodes stay fixed**, and the gap is **not clamped**. When nodes are too wide the gap goes negative and they overlap; the anchors still hold, and Spread is the remedy. Clamping at zero would have to move an anchor, breaking the invariant and costing idempotence.
- **Nothing moves perpendicular to the axis.** Flattening onto a line is Align's job. This is what lets the two compose — align a row then distribute it, or distribute a scatter without collapsing it.
- **Diagonal** takes its line direction from the min-X/max-X nodes (agreeing with align-diagonal), redistributes along it, and adds each node's original perpendicular offset back. Each node's extent along the line is the exact support width of its box, `w·|uₓ| + h·|u_y|`. Its **anchors are the extremes along the line**, which need not be the two nodes that defined the direction — a node with a large perpendicular offset can project beyond them.

Minimum 3: fewer has no interior to redistribute.

### 6.3 Shape

**Circle (`Shift+Q`)** — centre at the centroid; radius `max(mean current radius, minimum fitting radius)`, the floor using the same circumference-sum rule as an auto-layout ring; nodes sorted by current angle so the clockwise order survives; ring phase set to the **circular mean of the per-node residuals**, the closed-form minimiser of total angular travel. The result lands almost where the selection already was — regularising rather than relocating. Minimum 3.

**Grid (menu only)** — an axis-aligned lattice of `⌈√n⌉` columns. Cells are assigned from the current arrangement (sort by Y into rows, then by X within each row), so top/bottom and left/right relationships survive. Column and row steps are computed **independently**, each as `max(current spread per interval, largest node extent + gap)` — so the result is a **rectangle preserving the arrangement's proportions**, not a forced square, and it never overlaps. The lattice is centred on the centroid; a short final row keeps its column positions rather than being centred, so columns stay aligned. Minimum 4 (three nodes give an L, not a grid).

*Why Grid exists when Circle already squares four nodes:* Circle produces a **rotated** square, because it minimises travel. What makes a diagram read as deliberate is a fixed orientation, which is Grid's entire contribution.

**Diagonal grid (menu only)** — the same lattice computed in a **45°-rotated frame**: rotate the selection back by 45°, run `gridTargets` unchanged, rotate the result forward again. Four nodes therefore land on the compass points — North / East / South / West — which is the arrangement it exists for; nine give a 3×3 diamond lattice. Minimum 4.

A change of basis rather than new geometry, so every property of the axis-aligned grid carries over unchanged — including cell assignment (performed in the rotated frame, so the selection's existing diagonal orientation decides which node ends up North) and the independent column/row steps (a wide selection yields a wide rhombus, not a forced square). One thing does not carry over automatically: node boxes stay axis-aligned in the world however the lattice is turned, so in the rotated frame each node reserves its **support width** along the diagonal, `w·|uₓ| + h·|u_y| = (w + h)/√2` — the same measure distribute-diagonal uses. Without it the fitting rule under-reserves and boxes can overlap.

*Why not "Circle with the phase pinned north":* that is a different tool — it would put all n nodes on one ring at equal radii, where this keeps lattice structure for n > 4. The two agree only at n = 4.

### 6.4 Rotate (`O` / `Shift+O`)

**Clockwise / Counter-clockwise** — a rigid rotation about the centroid by `arrange.rotateStep` (15°), positive reading as clockwise because graph coordinates run y-downwards. Distances within the selection are untouched, so the arrangement is preserved exactly and only its orientation changes. Node glyphs do not turn — Cytoscape nodes are axis-aligned — so this rotates a *formation*, not its pieces. `-θ` exactly reverses `θ`. Minimum 2.

The pivot is the centroid, per invariant 2, which means rotate turns a group in place rather than orbiting it around a chosen hub. To orbit a hub, the hub must be the centroid of the selection; to turn the whole scene about its central node, use the scene-wide Rotate ([layout-architecture.md](layout-architecture.md) §6).

**The shortcut is shared with scene rotation, resolved by the selection.** `O` / `Shift+O` turn the selection when **two or more nodes are selected**, and the whole scene otherwise. This is the one context-sensitive binding in the layout domain, taken deliberately: the keyboard namespace has no mnemonic key left (§7), the two commands are the same gesture at different scopes, and the rule is the arrange family's own — *to keep a node out of it, don't select it*. Both remain unambiguously reachable from the menus: **Arrange nodes ▸ Rotate** and **Scene design ▸ Rotate**.

### 6.5 Spacing (`,` / `.`)

**Tighten / Spread** — a similarity transform about the centroid, `p' = c + (p − c)·f`, with `f = arrange.spacingStep` (or its inverse). Changes the **distance between** nodes; their size is untouched.

Deliberately the opposite of the scene-wide **Enlarge / Shrink** ([layout-architecture.md](layout-architecture.md) §7), which changes apparent node *size* and leaves on-screen distances alone. Note the absence of a compensating zoom here: `scaleScene` can pin the scene on screen because it moves *everything*, but a selection genuinely moves relative to its surroundings, so no zoom could compensate.

`1/f` exactly reverses `f`, making the opposite command a true undo.

---

## 7. Future directions

- **More tools:** arc, mirror/flip across the selection's axis.
- **Keyboard namespace.** The global keymap has only `Shift+N` and digits `5`–`9` free; Rotate was absorbed by making `O` / `Shift+O` selection-sensitive (§6.4) rather than by spending one. The agreed escape hatch for the next tool is an **Arrange leader key** — one key entering a transient sub-mode with an on-screen hint bar. Deliberately unbuilt: it introduces modality and touches the already-oversized keyboard handler.
- **Menu nesting.** The submenu is flat with group headings at thirteen tools. If the family grows much further, switch to one submenu per group — the registry already carries `group`, so this is a change to `buildArrangeMenu` alone. Weigh it against depth: the submenu sits at the root of both the node and the canvas menu, so nesting would put the tools three levels down.
- **Composable params.** The merge rule in §4.1 now folds `repeats` into two knobs. A third should move onto the tool (an optional `mergeParams`) rather than growing inside `Arrange`.
