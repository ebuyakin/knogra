# Node Expansion Placement — Specification

**Status:** Draft — under active authoring, not yet implemented.
**Last updated:** 2026-07-03
**Authority:** Working spec for the node-expansion placement algorithm. Once ratified,
this document is the source of truth for `src/features/utils/pure/donut-placement.ts`
and the obstacle/viewport wiring in `src/features/scene/expand-animator.ts`.

---

## 1. Purpose

When the user expands a node, the app pulls that node's graph-neighbours that are
**not yet in the current scene** into the scene, and draws edges connecting them to
the expanded node. This spec defines **where the newly-included nodes are placed**.

It does **not** cover: which neighbours are selected (children / parents / all), the
transition animation, scene inheritance, or persistence. Those are unchanged.

---

## 2. Terminology (read this first)

The previous confusion came from the word "edge" meaning two different things. They
are kept strictly separate here.

| Term | Meaning | Role in this algorithm |
|---|---|---|
| **Graph** | The full set of nodes and edges. | Source of truth for connectivity. |
| **Scene** | The subset of the graph currently displayed. | The canvas we place into. |
| **Expanded node** `P` | The node the user is expanding. Already in the scene. | Origin of the fan. |
| **Central node** `C` | The scene's anchor node. Already in the scene. | Defines the outward axis only. |
| **Child** `kᵢ` | A graph-neighbour of `P` **not yet in the scene**, being added now. There are `N` of them. | The nodes we are positioning. |
| **Existing node** | Any scene node other than `P`. | **Obstacle.** |
| **Existing edge** | An edge already drawn in the scene, before this expansion. | **Obstacle.** Blocks sectors; may not be crossed (except in Fallback 1). |
| **Incident existing edge** | An existing edge that has `P` as one endpoint. | Special-cased (see §4.2). |
| **Connector edge** | A **new** edge created by this expansion, one from `P` to each child `kᵢ`. | **NOT an obstacle.** It is a thing we are *routing*, not avoiding. |

**Critical distinction:**
- **Existing edges are obstacles.** They block free sectors and (normally) must not be
  crossed.
- **Connector edges do not exist until we place the child.** They never block a sector.
  Their only rule is that, once drawn, a connector should not cross an existing node or
  existing edge (this rule is relaxed in Fallback 1).

Whenever this document says "edge" unqualified, assume **existing edge**. Connector
edges are always named "connector".

---

## 3. Geometry conventions

- All angles are measured at `P`. For a point `Q`, `dir(Q)` is the angle of the vector
  `P → Q`, in degrees.
- `minRadius` — the smallest centre-to-centre distance a child may sit from `P`
  (parent half-size + child half-size + margin). Provided by the caller.
- `maxRadius` — hard cap on how far a child may be pushed. Provided by the caller.
- `childSize` — the diameter reserved for a child (its bounding box max dimension).
- **Outward axis** — the ray `dir(P)` measured from `C`, i.e. the direction pointing
  from the central node through the expanded node. Used only as a tiebreaker.

---

## 4. The algorithm

Three tiers, tried in order. The first tier that succeeds wins.

### 4.1 Overview

1. **Primary:** place children into the best free sector, respecting existing edges.
2. **Fallback 1:** if no sector is wide enough, recompute sectors ignoring existing edges
   (nodes only) and allow connectors to cross existing edges.
3. **Fallback 2:** if still nothing fits, greedily pack children outward along the axis.

### 4.2 Blocked arcs (obstacles → compass)

Standing at `P`, sweep the compass 0–360°. Each obstacle blocks an **arc**:

- **Existing node** `n`, distance `d = |P→n|`, size `s` → blocks the arc
  `[dir(n) − w, dir(n) + w]`, where `w = asin( min(1, (s/2 + NODE_MARGIN) / d) )` is the
  angular half-width the node subtends (plus clearance). Close/large nodes block wide
  arcs; distant ones thin slivers.
- **Non-incident existing edge** `e = (A, B)` → blocks the shorter arc between `dir(A)`
  and `dir(B)`. Any ray from `P` aimed in that arc would cross the segment `AB`.
- **Incident existing edge** (`P` is an endpoint, far endpoint `X`) → coincides with the
  node-arc of `X`; adds nothing, ignored. *(It does mean the direction toward any node `P`
  is already connected to is blocked — naturally discouraging growth back over an existing
  connection.)*
- **Viewport wall** → each of the four visible-frame edges blocks the arc of directions
  that would push a child off that edge at `minRadius`. For a wall with outward normal `φ`
  and clearance `c` (parent-to-wall distance minus the child's half-size), it blocks
  `[φ − acos(c/minRadius), φ + acos(c/minRadius)]`. Distant walls (`c ≥ minRadius`) block
  nothing; a wall the node is already past is skipped so it can't veto every direction.
  Viewport arcs are applied in the Primary tier and Fallback 1, and dropped in Fallback 2.

### 4.3 Free sectors and choosing one

1. Full 360° circle **minus the union of all blocked arcs** (§4.2) → the **free sectors**,
   each an arc with a width and a bisector direction.
2. **Width gate.** Keep only sectors wide enough to space the children:
   `width / N ≥ T_min`.
3. **Chooser.** Among the gated sectors, pick the one with the highest **sector score**
   (§4.4). Ties → arbitrary.
4. If **no** sector passes the width gate → **Fallback 1** (§4.7).

**Ring case.** If there are no blocked arcs at all (isolated node comfortably inside the
frame), the whole circle is free: place the `N` children as an evenly-spaced **ring**
(`360/N` apart), starting from the outward axis, then skip §4.5–4.6.

Let `X` = width of the chosen sector, `B` = its bisector direction.

### 4.4 Sector score (width & visibility)

Among the gated sectors, each is scored by a weighted blend of **how wide** it is (more
angular room → less staggering) and **how much of it is on-screen** (visibility). Both
terms are normalised to `[0, 1]` so their weights are directly comparable.

- **Width term** `widthNorm = min(1, X / WIDTH_REF)` — saturates at `WIDTH_REF` (a
  comfortably wide sector), so extra width past that stops mattering.
- **On-screen area term** `areaNorm = min(1, area / viewportArea)`, where `area` is the
  visible wedge area, approximated cheaply by polar ray-casting:
  - sample angles `θ` across the sector every few degrees;
  - `r(θ)` = distance from `P` along `θ` to where the ray exits the viewport rectangle,
    capped at `R_cap = min(maxRadius, viewport diagonal)`; `r(θ) = 0` if the ray leaves the
    viewport before `minRadius`;
  - `area ≈ Σ ½ · max(0, r(θ)² − minRadius²) · Δθ`.
- **Score** `= W_WIDTH · widthNorm + W_AREA · areaNorm`.

`W_WIDTH` and `W_AREA` are the two dials (default `0.4 / 0.6`, leaning toward visibility);
set `W_WIDTH = 0` for pure area, `W_AREA = 0` for pure width. The highest-scoring gated
sector is chosen.

### 4.5 Per-child angle

`deltaAngle = X / N`.

### 4.6 Placement into the chosen sector

1. **Target rays**, centred on `B`, with a half-gap (`deltaAngle / 2`) margin off each
   sector wall:

   ```
   angleᵢ = B + deltaAngle · ( i − (N−1)/2 )      for i = 0 … N−1
   ```

   This spans `(N−1)·deltaAngle`, centred, leaving `X/(2N)` clear on each side.

2. **Distance — stagger only for siblings.** Place children **boundary-first** (outermost
   rays first, central rays last). Each child starts at `minRadius` on its ray and slides
   outward in `RADIUS_STEP` increments, stopping at the first distance that is at least
   `siblingMin` from every already-placed child. Obstacle clearance is kept only as a
   safety net; in a true free sector it never fires, so children stagger solely to avoid
   *each other*.

3. **Stay visible.** The outward slide is biased to keep the child on-screen: if the next
   sibling-clear distance is off-screen but a closer, on-screen distance only *slightly*
   overlaps a sibling, take the on-screen one (slight sibling overlap is acceptable;
   leaving the viewport is not). Hard obstacle overlap is never accepted.

### 4.7 Fallback 1 (relax existing edges)

Triggered when no sector passes the width gate (§4.3).

1. Rebuild blocked arcs using **existing nodes and the viewport walls only** — drop all
   edge-arcs. Sectors widen.
2. Re-choose the sector (width gate + on-screen area, §4.3–4.4).
3. If a sector passes: run §4.6 **with the connector-vs-existing-edge rule dropped** —
   connectors may now cross existing edges (but still not overlap existing nodes).
4. Else → **Fallback 2**.

### 4.8 Fallback 2 (greedy outward pack, alternating)

Triggered when even the nodes-only sector is too cramped.

**"Clears obstacles" here means the child *body* must not overlap an existing node**
(distance ≥ `childRadius + node½ + NODE_MARGIN`). Because the node is boxed in, the
connector is allowed to cross nodes and edges in this last resort — enforcing a clean
connector would push the child past the whole surrounding cluster. Existing edges are
not obstacles here.

1. Place child 1 on the **outward axis** at the nearest free radius `≥ minRadius` that
   clears obstacles.
2. Each subsequent child steps to the next angle **alternating ± around the outward axis**
   (`+δ, −δ, +2δ, −2δ, …`), and is placed at the nearest free radius on that ray that
   clears obstacles and is at least `siblingMin` from every placed child. The driver is
   inter-child distance; the alternation keeps the pack centred on the axis.

   `δ` is sized from where **child 1 actually lands** (`R₁`, which may be pushed out past a
   nearby node), so the fan is no wider than the children's true distance needs:
   `δ = 2 · asin( min(1, siblingMin / (2 · R₁)) )`. (`R₁ = minRadius` when the axis is clear.)

---

## 5. Parameters

| Name | Meaning | Default | Notes |
|---|---|---|---|
| `T_min` | Minimum acceptable per-child angle (`X/N`) before falling back. | 5° | The main knob to experiment with. |
| `W_WIDTH` / `W_AREA` | Sector-score weights for width vs. on-screen area (§4.4). | 0.4 / 0.6 | Dials; either may be 0. |
| `WIDTH_REF` | Sector width at which the width term saturates (§4.4). | 120° | |
| `minRadius` | Closest a child may sit to `P`. | from caller | parent½ + child½ + margin. |
| `maxRadius` | Hard distance cap. | 2000 | Safety; also feeds `R_cap`. |
| `R_cap` | Placement horizon for on-screen area (§4.4). | `min(maxRadius, viewport diagonal)` | |
| `RADIUS_STEP` | Outward sliding increment. | 12 px | Resolution vs. cost. |
| `siblingMin` | Min centre-to-centre distance between two children. | `0.95 × childSize` | <1× allows slight overlap. |
| `δ` | Fallback 2 angular step (§4.8). | `2·asin(siblingMin/(2·R₁))` | `R₁` = child 1's actual radius; derived. |
| `NODE_MARGIN` | Clearance from existing nodes (also widens node arcs, §4.2). | 40 px | |
| `EDGE_MARGIN` | Clearance from existing edges / for connector crossings. | 24 px | |

---

## 6. Worked examples (sanity checks)

- **No obstacles, N = 4** → no blocked arcs → **ring**: children evenly spaced `360/4 = 90°`
  apart (N/E/S/W), starting from the outward axis.
- **Open sector X = 120°, N = 10** → `deltaAngle = 12° ≥ T_min (5°)` → place in that sector.
- **Crowded node, widest node-gap = 20°, N = 6** → `deltaAngle ≈ 3.3° < 5°` after
  both Primary and Fallback 1 → Fallback 2 greedy alternating pack.
- **Two comparable sectors, one pointing off-screen** → both pass the width gate; the
  on-screen-area chooser (§4.4) picks the one opening into the visible area.

---

## 7. What this replaces

The current implementation samples 72 fixed directions and scores each by "how far the
furthest child lands," with a fixed ray-step. This spec replaces that with an **analytic**
sector choice (§4.3) and an **adaptive** per-child angle (`X/N`), keeping only the
outward-sliding placement mechanism (§4.6.2). No change to scene inheritance, transitions,
or persistence.
