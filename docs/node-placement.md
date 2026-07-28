# Single-Node Placement — Specification

**Status:** Current — implemented 2026-07-27.
**Last updated:** 2026-07-27
**Authority:** Source of truth for `placeSingleNode` in
`src/features/utils/pure/position-expansion.ts`, the shared reference resolver
(`SceneNodeOps.resolvePlacementReference`), and the four single-node call sites in §9. It does
**not** govern multi-node expansion, which has its own algorithm and spec.
**Related:** [Node expansion spec](node-expansion-spec.md) (multi-node, separate algorithm),
[Architecture](architecture.md), [Scene transitions](scene-transitions.md).

---

## 1. Purpose & scope

Several operations add exactly one node to the current scene and need to choose where that
node lands on the canvas. Today each computes its position ad hoc via `circularSpreadSafe`
(a routine designed to fan *many* nodes across an arc), which misbehaves for a single node:
in busy scenes it either flings the node far (arc-sized radius) or overlaps existing nodes
(coarse fixed-size collision model and a 24 px stacked fallback). The result feels unstable.

This spec defines **one** placement rule, shared by all single-node adds, that is:

- **Compact** — as close to the reference as possible without overlap.
- **Non-overlapping** — always respects real node sizes.
- **Aesthetic when there is room** — a clean compass layout in sparse scenes.
- **Deterministic** — the same scene always places the Nth node in the same spot.

**In scope (governed by this spec):**

1. Shelf → new node (`create_connected`).
2. Add child / add parent from the canvas (keyboard `A` / `Shift+A`, context menu).
3. Shelf → existing node (`include_existing`).
4. Node manager → add existing node to scene.

**Out of scope:** multi-node expansion ("include children / parents / neighbours"), which
uses `placeExpansionFan` (see [node-expansion-spec.md](node-expansion-spec.md)); and any
path that supplies an explicit position (double-click create, low-level `includeNode(pos)`).

---

## 2. Coordinate convention & terminology

Cytoscape model coordinates are **y-down**. Angles are measured from the reference node,
`0°` pointing **East**, increasing **clockwise**:

| Angle | Direction | Screen |
|------:|-----------|--------|
| 0°    | East      | right  |
| 90°   | South     | down   |
| 180°  | West      | left   |
| 270°  | North     | up     |

| Term | Definition |
|------|------------|
| **Reference node `R`** | The node the new node attaches to (see §3). |
| **New node `N`** | The node being placed; has a known half-size from its design/scale. |
| **Obstacle** | Every *other* node currently in the scene, with its **actual** position and half-size. |
| **`minRadius`** | Smallest centre-to-centre distance from `R` at which `N` may sit without the two bodies touching (plus a small clearance). Overlap floor — never place closer. |
| **`R_pref`** | Preferred, visually comfortable centre-to-centre distance used when the chosen direction is open. Aesthetic target. |

---

## 3. Reference-node resolution

All four in-scope operations resolve the reference the **same** way:

> `R = active node if it is present in the current scene, otherwise the scene's central node.`

- "Active node" is `cy.scratch('activeNodeId')`, set whenever a node is selected.
- The **presence guard** (`getElementById(activeNodeId).length > 0`) is mandatory: the
  scratch value survives transitions, so it may reference a node absent from the current
  scene. When absent, fall back to the central node.
- This makes shelf-created new nodes attach to the **selected** node when the user has one
  selected in-scene (consistent with add-child), and to the central node by default.
  Re-anchoring a central-context AI suggestion onto a peripheral selection is treated as a
  deliberate user override, not an error.

**Known caveat (out of scope here):** because `activeNodeId` is never cleared, a stale value
that *happens* to exist in a later scene reached via non-selecting navigation (back button,
path step) would be honored as "selected." Rare and pre-existing. Optionally hardened later
by clearing `activeNodeId` on `sceneChanged`; tracked as a separate follow-up.

---

## 4. Geometry: radii and clearance (size-based)

All distances are **computed from node sizes** — nothing here is a fixed pixel constant.
Each node's radius is its **bounding-circle radius** `0.5·√(w² + h²)` (after scale), not
`max(w, h)/2`. The bounding circle contains the whole rectangle in every direction, so
**diagonal** placements clear the corners; the half-of-max-dimension circle left corners
exposed and made diagonally-placed rectangles nearly touch (crumpled edge arrows). Let
`parentHalf` and `childHalf` be these bounding-circle radii for `R` and `N`.

- **Overlap floor:**
  `minRadius = parentHalf + childHalf + gClear`
  where `gClear = 0.05 × childSize = 0.1 × childHalf`. Used as the clearance term in the
  obstacle test below.

- **Preferred radius (aesthetic):**
  `R_pref = max(minRadius, (parentHalf + childHalf + gBreath) × spacing)`,
  with `gBreath = 0.25 × childHalf`. At `spacing = 1` this is `parentHalf + 1.25 × childHalf`.
  The multiplier scales the **whole** distance, not just the margin — the margin is small next
  to the (unscaled) node radii, so scaling it alone barely moved the layout. The `minRadius`
  floor is required because the reference node is **not** in the obstacle list: without it a
  small multiplier would place the new node on top of its own parent.
  Base factors calibrated by experiment (2026-07-27) so `node.spacing = 1.0` is the default.

- **Obstacle clearance test:** a candidate centre `p` clears an obstacle `o` iff
  `distance(p, o.pos) ≥ childHalf + o.half + gClear`, using each obstacle's **real** radius.

- **User spacing multiplier:** the `node.spacing` setting (Nodes → Creation, 0.2–3.0 in steps
  of 0.1, default 1.0) scales the whole `R_pref` and the `gClear` margin. The range is
  inherently asymmetric: the tight end saturates at the non-overlap floor (geometry — nodes
  cannot be closer than touching), while the loose end stretches proportionally.
  Being a pure module, `position-expansion.ts` does not read settings: the callers pass the
  multiplier in. It affects **newly placed nodes only**; existing layouts are never reflowed.

Because both `R_pref` and every clearance are derived from the participating node sizes, the
whole layout scales naturally with the design system, themes, and per-node scale.

---

## 5. Placement algorithm

One direction, then the nearest clearing radius along it.

### 5.1 Direction — `awayDeg` (between existing spokes)

Take each neighbour's **bearing** from `R` (not a cone), sort them, find the **widest angular
gap** between consecutive bearings, and aim at that gap's **midpoint**. Call it `awayDeg`.

- **Ties:** the first-widest gap clockwise from East wins (deterministic).
- **No neighbours:** `awayDeg = 0°` (East).

**This is what guarantees non-overlapping edges.** `awayDeg` is the midpoint of a *positive*
gap between two distinct bearings, so it can never equal an existing bearing — the new
connector is structurally incapable of lying on top of an existing edge. No ε guard and no
angular grid are needed (and both were rejected — see §10).

**Why this yields the compass layout.** Successive additions to a sparse scene fill:
East → opposite/South/West/North at 90° → diagonals at 45° → and so on by binary subdivision
(22.5°, 11.25°, …), so the ring keeps interleaving instead of aliasing:

| Existing | Widest neighbour gap ⇒ midpoint | New node |
|----------|---------------------------------|----------|
| —              | empty ⇒ 0°        | **E** |
| E              | opposite ⇒ 180°   | **W** |
| E, W           | 90° (tie, East-first) | **S** |
| E, S, W        | 270° (180° gap)   | **N** |
| E, S, W, N     | 45° (tie, East-first) | **SE** |
| + SE           | 135°              | **SW** |
| + SW           | 225°              | **NW** |
| + NW           | 315°              | **NE** |
| 8 spokes @45°  | 22.5° (tie, East-first) | between E and SE |

A single existing neighbour at angle θ (e.g. a scene entered from its only parent) yields
θ+180° first, then θ+90°, then θ+270° — the same rule, rotated.

### 5.2 Radius — nearest clearing distance along `awayDeg`

1. Start at `R_pref` (§4) and step **outward** by `dR`.
2. Return the first radius whose body clears every obstacle (§4 clearance test, real sizes).
3. If nothing clears within `searchCap` (a genuinely saturated scene), place at `searchCap`
   on the same bearing — defined and non-overlapping. Practically unreachable in normal use.

Because the bearing points into the widest gap, a clearing radius is normally found at or
near `R_pref`; the walk only engages when that gap already holds a node at that distance,
in which case the new node lands just beyond it on a second ring — never flung out past the
scene's outermost node.

**Trade-off (accepted):** this commits to the widest-gap bearing and finds the nearest radius
there, rather than scanning 2D for a possibly marginally-closer pocket in a narrower gap.
Chosen because no-overlap and determinism outrank marginal compactness.

---

## 6. Determinism

- The angle scan order and radius stepping are **fixed** (no randomness, no time-based seed).
- Ties are always broken by the East-first-clockwise rule.
- Given the same scene (same node positions and sizes), the Nth added node always lands in
  the same place. This is what removes the current "unpredictable" feel and makes the compass
  pattern reproducible.

---

## 7. Performance & cost bounds

Placement is a **one-off** on user action, not a per-frame cost, and the algorithm is linear:

- **Direction:** one pass over neighbours to collect bearings, plus a sort — `O(n log n)`.
- **Radius:** a 1-D walk along a single bearing, `O(obstacles)` per step, early-exit on the
  first clearing radius. Typically the very first step (`R_pref`) succeeds.
- **Radius step `dR`:** **size-based** — `max(6, childHalf × 0.5)`, so it scales with the scene.
- **Bounded radius:** the walk stops at `searchCap = max(R_pref × 4, farthestObstacle +
  childSize)`.

The earlier design sampled a 2-D grid (angles × radii); that was both slower and the source of
the aliasing bug (§10). The current single-bearing walk is a few dozen distance comparisons in
practice — no performance concern, and no `dθ` constant to tune.

---

## 8. Edge cases

- **Empty ring (0 obstacles around `R`):** direction = East, radius = `R_pref`.
- **Single neighbour:** placed opposite it (θ+180°); see §5.1.
- **Pocket smaller than `N`:** rejected by the size-aware clearance test — never wedged in.
- **Reference on the scene periphery:** the widest gap naturally points outward into open
  space; the new node lands near `R`, off the crowded interior.
- **Stale/absent active node:** resolved to central by §3's presence guard.
- **Saturated scene:** last-resort placement per §5.2, non-overlapping.

---

## 9. Call sites & responsibilities

All four call the same placement helper and the same reference resolver; they differ only in
edge handling:

| # | Operation | Entry point | Edge created |
|---|-----------|-------------|--------------|
| A  | Shelf → new node (`create_connected`) | `graph.addConnectedNode` | new `R→N` or `N→R` per AI `connectionType` |
| A′ | Add child / parent (keyboard, context menu) | `graph.addConnectedNode` | new `R→N` / `N→R` |
| B  | Shelf → existing node (`include_existing`) | `scene.includeExistingNode` | reuse existing graph edge if any, else new |
| B′ | Node manager → add to scene | `scene.includeExistingNode` | reuse existing edge if any, else new |

Notes:
- A is being changed so its reference is resolved by §3 (was: always central).
- Placement math is identical across all four; only the reference node and edge policy vary.

---

## 10. Rejected alternatives

- **Reuse the expansion donut (`placeExpansionFan`) with `childCount = 1`.** It already does
  nearest-outward packing with node/edge/viewport obstacles, but its open-space axis grows
  "up / away from the centroid," so it would not produce the East-first compass layout without
  surgery, and it is heavier than needed for one node. Kept separate; a dedicated single-node
  helper is cleaner. The two specs cross-reference each other.
- **"Beyond the outermost neighbour" fallback (previous `placeBeyondRing`).** Placed the node
  past the furthest node in the scene, which is wrong when nearer pockets exist (§5.2 example).
  Replaced by the nearest-pocket search.
- **Stacked diagonal fallback (previous `#stackedFallbackPosition`).** Offset by a fixed 24 px,
  causing overlaps. Replaced by the size-aware nearest-pocket search.
- **ε anti-alignment guard** (reject candidates within ε° of a neighbour bearing). Redundant
  once the direction anchor is `awayDeg` (always between spokes), and harmful in dense rings
  (e.g. 60 children ⇒ 6° spacing, where any ε > 3° removes all room). Not adopted.
- **2-D grid search (angles × radii), previously "Tier 2".** Sampled candidate angles on a
  fixed `dθ = 6°` grid and scored them against `awayDeg`. The grid **snap** meant the placed
  bearing was not exactly `awayDeg`, so in dense rings it could quantize onto a bearing already
  in use (observed: the 17th child duplicating an existing edge direction). Replaced by placing
  *exactly* at `awayDeg` and walking the radius — simpler, faster, and alias-free by
  construction.
- **Cone-based blocked-angle map for direction** (as used by `circularSpreadSafe`). In a fresh
  graph the per-obstacle cones are wider than the spoke spacing, so they cover the full circle,
  return "no free sector," and force an arbitrary fallback bearing (the original due-East
  aliasing bug). Neighbour **bearings** are the robust signal; cones are not used here.

---

## 11. Open questions / follow-ups

1. **Constants as implemented** (in `position-expansion.ts`, single-node section):
   - `gClear = childSize × 0.05 × spacing` (`SINGLE_CLEAR_FACTOR`).
   - `gBreath = childHalf × 0.25` (`SINGLE_BREATH_FACTOR`)
     ⇒ `R_pref = max(minRadius, (parentHalf + childHalf + gBreath) × spacing)`.
   - `spacing` = `node.spacing` setting (default 1.0, range 0.2–3.0), passed in by the callers.
   - `dR = max(6, childHalf × 0.5)` (radius step).
   - `searchCap = max(R_pref × 4, farthestObstacle + childSize)`.
   - Node radius: bounding-circle `0.5·√(w²+h²)` from the real bbox for `R` and obstacles;
     for the not-yet-created new node, the design-size estimate × `√2` (Route A) or
     `60·√2` for a default node (Route B).
   The two base factors were calibrated by experiment on 2026-07-27 (halved from an earlier
   `0.1 / 0.5`, which felt too generous at `spacing = 1`).
5. **Direction-aware radius** (rectangle extent along the placement bearing instead of the
   bounding circle) would remove the ~√2 over-reservation in axis-aligned directions. Deferred:
   it changes the obstacle model everywhere, and the new node's box is only an estimate before
   render, so exact box math would give false precision. Revisit if spacing still feels wrong
   after calibration.
2. Whether to clear `activeNodeId` on `sceneChanged` to close the stale-scratch caveat (§3).
3. Whether `circularSpreadSafe` can be retired once all four call sites move to the new helper
   (its only remaining reference would be dead code in the expansion `else` branch).
4. Whether a bounded 2-D search is ever worth reintroducing for marginally tighter packing in
   dense scenes — only with an exact-bearing rule, never a snapping grid (see §10).
