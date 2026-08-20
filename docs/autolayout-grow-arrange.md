# Auto-layout: Grow & Arrange

> **Status:** Current — implemented 2026-07-11
> **Last reviewed:** 2026-08-20
> **Authority:** Canonical model for the **Grow & Arrange** extension of the Auto-layout feature (`src/features/autolayout/`). Plain radial auto-layout (`AutoLayout.apply`) is unchanged; this document specifies the new membership-growing variant only.
> **Related:** [Documentation map](README.md), [Architecture](architecture.md), [Mermaid Fan Layout](mermaid-fan-layout.md) (shares the radial geometry lineage)

## 1. Overview

Plain **Auto-layout** re-arranges the nodes *already present* in the current scene into a regular radial shape rooted at the immutable central node. It is a pure-motion recovery action: no node ever appears or disappears, only glides.

**Grow & Arrange** extends this with one extra step *before* the arrangement: it pulls the central node's **degree-≤N graph neighbourhood** into the scene (nodes not already present), then runs the same radial arrangement over the enlarged set. The two steps fuse into a single animation — the newly included nodes *emerge from the centre and settle into place* while the existing nodes glide and the camera re-fits, so the scene visibly "unfolds" one, two, or three rings outward.

It is the same feature and the same public class (`AutoLayout`); Grow & Arrange is a second public method, not a new feature.

---

## 2. The neighbourhood model

### 2.1 The ball

Given the scene's central node `C` and a degree `N ∈ {1, 2, 3}`:

- Traverse the full graph (`graphStore.edges`) **undirected** by breadth-first search from `C`.
- The **ball** is every node whose hop-distance from `C` is `≤ N`. This is cumulative: degree 2 includes the degree-1 nodes plus their neighbours.
- **Entrants** = ball nodes **not already in the scene**. Only these are added. Nodes already present are never touched by the membership step (they are only repositioned by the arrangement).
- Nodes already in the scene that fall **outside** the ball are **kept** — Grow & Arrange is *add-only*, it never excludes.

Directionality is undirected by default (the analogue of the "both" expand mode). This is a layout setting (§6), not hard-coded, so it can become directional later without touching callers.

### 2.2 Generative edges only

For each entrant, add **exactly one edge**: the edge connecting it to its **BFS predecessor** (the neighbour, one hop closer to `C`, through which the traversal reached it). This is the *generative* edge — the structural backbone that makes the entrant reachable.

- **Cross-links are not added.** If two entrants (or an entrant and an existing node) are also directly connected by a non-generative edge, that edge is left out.
- Rationale: this keeps the grown scene clean and predictable, and it composes with the existing **Include all scene edges** command (`Shift+S`), which the user can invoke afterwards to pull in every remaining edge among the present nodes. Membership growth and edge completeness stay independent, user-controlled concerns.
- Edges already in the scene are untouched.

This mirrors the *generative vs. cross* edge distinction used by the Mermaid importer (see [mermaid-fan-layout.md](mermaid-fan-layout.md) §9.4).

### 2.3 Entrant design

Each entrant is added with a **rule-based design**, evaluated per node:

- If the node carries an equation (`node.properties.equation` is truthy) → the configured equation design (`getSetting('node.shelfDesignWithEquation')`).
- Otherwise → the configured basic design (`getSetting('node.shelfDesignBasic')`).

Scale is `1.0`. This is *not* inherit-from-central. The rule is inlined in the feature (reads only `config`); it deliberately does not import the AI shelf design-selector to avoid a cross-cutting dependency, though it uses the same two settings so behaviour stays consistent.

---

## 3. The arrangement

Identical geometry to plain auto-layout: the selected scene-layout algorithm (default radial — see [layout-architecture.md](layout-architecture.md)) runs over the **union** node/edge set (existing + entrants), rooted at `C`, anchored on `C`'s current position so the scene does not jump. The union's generative edges ensure every entrant has a BFS parent, so the recursive sector allocation places each entrant on the ring matching its hop-distance.

Edge curves of every repositioned/added edge are reset to the default automatic bezier, exactly as `apply` does.

**Sibling order.** The union layout honours `autolayout.ringOrder` exactly as `apply` does (see [layout-architecture.md](layout-architecture.md) §4.2.1, default `angular`). Nodes already in the scene contribute their `currentPos`, so a hand-arranged clockwise sequence survives the grow, at every ring depth. Entrants are seeded at `C` and carry no position, so they sort last within their parent's wedge — they fill in after the existing siblings rather than displacing them.

---

## 4. The animation — seed and arrange

The design tension: plain auto-layout is pure motion because the node set is fixed. Grow & Arrange changes the set, so entrants need an *appearance* story. The chosen model is **seed-and-arrange**, a single concurrent animation (no throwaway intermediate placement):

1. **Seed.** Each entrant is added to Cytoscape at `C`'s current position with its real design/scale and stylesheet applied. It is measured (real `boundingBox`) so the layout gets a correct footprint, then set to its animation start state: `size 0`, `opacity 0`, parked at the centre. Generative edges are added at `opacity 0`.
2. **Compute** the union radial layout (§3) → target position per node.
3. **Animate, concurrently, one duration:**
   - **Existing nodes** glide from current → target (the plain auto-layout motion), and the **camera re-fits** onto the union's bounding box — both handled by the existing `AutoLayoutAnimator` fed the union targets and the union fit viewport.
   - **Entrants** grow (`size 0 → full`) and fade (`opacity 0 → 1`) while tweening from the centre to their radial target. Generative edges fade in.
   - Same duration ⇒ synchronised. The scene unfolds and settles in one gesture.
4. **Persist.** `graphSaver` is suspended for the animation frames, then a single `forceSave` records the final positions and the new membership (Cytoscape state is the source of truth GraphSaver captures).

Entrants grow from the **central node's position** (not from their individual BFS parents). A per-parent, ring-cascaded emergence is a possible future refinement (recorded in §8) but is out of scope for the first version.

Edit mode only, matching `apply`. No-op in View mode.

---

## 5. Safety: hub threshold

A degree-2 or degree-3 grab around a hub can pull in a very large number of nodes. Before seeding, if the **entrant count** exceeds `getSetting('autolayout.growConfirmThreshold')` (default **30**), show a confirmation dialog ("This will add *K* nodes. Continue?"). Declining aborts before any mutation. The threshold counts *new* nodes only, not the union size, and is user-configurable.

---

## 6. Settings

Added to `AUTOLAYOUT_DEFAULTS` (`src/config/autolayout-settings.ts`), reused via `getSetting('autolayout.…')`:

| Setting | Default | Meaning |
|---------|---------|---------|
| `growDirection` | `'both'` | Neighbourhood traversal direction: `both` (undirected), or later `children` / `parents`. |
| `growConfirmThreshold` | `30` | Entrant count above which a confirmation dialog is shown. |

Existing `ringSpacing`, `siblingGap`, `ringOrder`, `animate`, `animationDuration` are reused unchanged for the arrangement.

---

## 7. Module layout & boundaries

One feature, one public class. `feature-api` still exposes only `autolayout`.

```
src/features/autolayout/
  autolayout.ts          public class AutoLayout
                           .apply(central)                  ← existing, unchanged  ("No expansion")
                           .growAndArrange(central, degree)  ← new public method → delegates to grow-arrange.ts
  layout.ts              radial geometry (existing)
  fit.ts                 computeFitViewport — extracted from autolayout.ts, clear exported API (feature-local shared)
  grow-arrange.ts        new submodule: neighbourhood BFS + generative-edge selection + seed/grow orchestration (functions)
```

> Node position tweening now lives in the shared `utils/cy/node-position-animator.ts`
> (`NodePositionAnimator`), moved out of the feature so the selection-scoped `arrange`
> feature can reuse it; at the time of this document it was the feature-local
> `autolayout-animator.ts`.

**Dependency rules (upheld):**
- No sibling-feature imports. The feature imports only within itself and **downstream**: `utils/`, `styles/`, `config/`, `storage/`, `core/`.
- The radial geometry, animator, and fit math are **feature-local** and shared between `autolayout.ts` and `grow-arrange.ts` via clear file APIs — the intra-feature analogue of `utils/`.
- The neighbourhood BFS stays **feature-local** (only this feature uses it); it graduates to `utils/pure` only if a second feature ever needs it.
- Consequence: `AutoLayout` now transitively depends on `graphStore` (through `grow-arrange.ts`). This is the accepted trade for the one-public-class convention; `apply` remains cy-only in spirit.
- `fit.ts` extraction is a within-feature, behaviour-preserving refactor: `autolayout.ts` swaps its private `#computeFitViewport` for the shared import (one call-site change).

Scene's `expand-animator` is **not** reused or modified; the grow-in animation primitive is reimplemented locally in `grow-arrange.ts` to keep the feature self-sufficient.

---

## 8. UI

The context menu's `Scene ▸ Auto-layout` leaf becomes a **submenu**:

```
Scene
  Auto-layout
    No expansion      → autolayout.apply(central)            (today's behaviour)
    1 degree          → autolayout.growAndArrange(central, 1)
    2 degrees         → autolayout.growAndArrange(central, 2)
    3 degrees         → autolayout.growAndArrange(central, 3)
    4 degrees         → autolayout.growAndArrange(central, 4)
  Edges visibility
  Include all scene edges (Shift+S)
  …
```

All entries are edit-mode only. "No expansion" preserves muscle memory for the existing command.

---

## 9. Implementation plan

Each step is independently type-checkable.

1. **`fit.ts`** — extract `#computeFitViewport` from `autolayout.ts` into `src/features/autolayout/fit.ts` as an exported pure function `computeFitViewport(targets, footprints, cy)`; update `autolayout.ts` to use it. No behaviour change.
2. **Settings** — add `growDirection`, `growConfirmThreshold` to `AUTOLAYOUT_DEFAULTS`.
3. **`grow-arrange.ts`** — implement:
   - `computeNeighbourhoodBall(central, degree, edges)` → entrant ids + generative edge per entrant (undirected BFS).
   - entrant design pick (equation rule).
   - seed (cy.add + stylesheet + measure + hide), union-layout compute, concurrent seed-grow + `AutoLayoutAnimator` motion + fit, edge-curve reset, save.
4. **`AutoLayout.growAndArrange(central, degree)`** — edit-mode/View guards, threshold confirmation, delegate to `grow-arrange.ts`.
5. **Context menu** — convert the `Auto-layout` item to the submenu in §8.

### Verification
- Degree 1/2/3 from a modest node: correct cumulative ball, one generative edge per entrant, no cross-links, radial arrangement, single unfolding animation, camera fits.
- Equation nodes enter with the equation design; others with the basic design.
- Entrant count over threshold prompts; declining leaves the scene untouched.
- `Shift+S` afterwards still fills in the omitted cross-links.
- "No expansion" is byte-identical to the old Auto-layout command.
- `type-check` clean after each step.
