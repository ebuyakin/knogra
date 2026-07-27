# Single-Node Placement — Specification

**Status:** Draft — under active authoring, not yet implemented.
**Last updated:** 2026-07-27
**Authority:** Working spec for the placement of a *single* node added to or included in the
current scene. Once ratified, this document is the source of truth for the shared
single-node placement helper and the four call sites listed in §9. It does **not** govern
multi-node expansion, which has its own algorithm and spec.
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
Let `parentHalf = max(R.width, R.height) / 2` and `childHalf = max(N.width, N.height) / 2`
(both after scale).

- **Overlap floor:**
  `minRadius = parentHalf + childHalf + gClear`
  where `gClear` is a small size-based clearance (a fraction of `childHalf`).

- **Preferred radius (aesthetic):**
  `R_pref = parentHalf + childHalf + gBreath`
  where `gBreath = childHalf` — "a full child-radius of breathing room." This deliberately
  matches the open-space radius used by multi-node expansion, so *add-one* and *expand-many*
  look visually consistent. `R_pref ≥ minRadius` always.

- **Obstacle clearance test:** a candidate centre `p` clears an obstacle `o` iff
  `distance(p, o.pos) ≥ childHalf + o.half + gClear`, using each obstacle's **real** half-size.

Because both `R_pref` and every clearance are derived from the participating node sizes, the
whole layout scales naturally with the design system, themes, and per-node scale.

---

## 5. Placement algorithm

Two tiers; the first that yields a clearing position wins.

### 5.1 Tier 1 — preferred placement (open space)

1. **Choose the direction.** From `R`, treat each obstacle as a cone whose angular half-width
   reflects how large it looks from `R`. Mark blocked angles; find the **widest free angular
   gap**; the direction is that gap's **bisector**.
   - **Tie-break (critical for aesthetics & determinism):** among equally-wide gaps, pick the
     bisector with the **smallest clockwise angle from East**. On a completely empty ring the
     direction is defined as **East (0°)**.
2. **Place at `R_pref`.** If `N` centred at `R_pref` along that direction clears every
   obstacle (§4), place it there and stop.
3. If `R_pref` is blocked in that direction, walk the radius **outward** from `R_pref` in
   steps of `dR` (§7) and take the first clearing radius. If the direction stays blocked to
   the search cap, fall through to Tier 2.

**Why this yields the compass layout.** With the tie-break above, successive additions to a
sparse scene fill: East → (opposite / South / West / North at 90°) → diagonals (SE, SW, NW,
NE at 45°). Worked example (empty start, each step places the widest-gap bisector, East-first
on ties):

| Existing | Widest gap bisector | New node |
|----------|---------------------|----------|
| —              | East (empty ⇒ 0°) | **E** |
| E              | opposite ⇒ 180°   | **W** |
| E, W           | 90° (tie, East-first) | **S** |
| E, S, W        | 270° (180° gap)   | **N** |
| E, S, W, N     | 45° (tie, East-first) | **SE** |
| + SE           | 135°              | **SW** |
| + SW           | 225°              | **NW** |
| + NW           | 315°              | **NE** |

A single existing neighbour at angle θ (e.g. a scene entered from its only parent) yields
θ+180° first, then θ+90°, then θ+270° — the same rule, rotated.

### 5.2 Tier 2 — nearest empty pocket (crowded / irregular)

Reached when no direction is open at a reasonable radius. Find the position **closest to `R`**
that clears every obstacle:

1. Expand radius `r` from `minRadius` upward in steps of `dR`.
2. At each `r`, sample angles at resolution `dθ` (§7), ordered so that, among candidates at
   the same radius, the **least-crowded / compass-preferred** angle is tried first.
3. Return the **first** clearing candidate (nearest to `R`).

This never overlaps and never flings the node "beyond the outermost neighbour." Example: 16
children, an eastern arc at r≈100 and a western arc at r≈500 — the 17th lands in the nearest
eastern pocket near r≈100+, not out past r≈500.

If, and only if, no clearing candidate exists within the search cap (a genuinely saturated
scene), place `N` at the least-crowded direction at the cap radius — a defined, non-overlapping
last resort. This case should be practically unreachable in normal use.

---

## 6. Determinism

- The angle scan order and radius stepping are **fixed** (no randomness, no time-based seed).
- Ties are always broken by the East-first-clockwise rule.
- Given the same scene (same node positions and sizes), the Nth added node always lands in
  the same place. This is what removes the current "unpredictable" feel and makes the compass
  pattern reproducible.

---

## 7. Performance & cost bounds

Placement is a **one-off** on user action, not a per-frame cost. Tier 1 is `O(obstacles)`
(compute gaps, one clearance test) and handles the common case. Tier 2 is the only search,
and it is bounded:

- **Angular resolution `dθ`:** coarse — sampling every **~5–10°** (36–72 samples per ring) is
  imperceptible for placement. (Matches the expansion algorithm's `AREA_SAMPLE_DEG = 5`.)
- **Radius step `dR`:** **size-based** — a fraction of `childHalf` (e.g. `childHalf / 2`),
  not a pixel constant, so it scales with the scene. Bounded number of rings from `minRadius`
  to a size-relative cap.
- **Early exit:** return on the first (nearest) clearing candidate — Tier 2 stops as soon as
  a pocket is found; the full grid is only scanned in a saturated scene.
- **Obstacle culling:** test only obstacles within a bounding distance of `R` (a far node
  cannot block a near pocket). This keeps the per-candidate cost near-constant regardless of
  total scene size.

With `dθ ≈ 5°`, a size-based `dR`, early-exit, and culling, worst-case Tier 2 is a few
thousand cheap distance comparisons — sub-millisecond and only in dense scenes. If profiling
ever shows a problem, `dθ` and `dR` are the two knobs to coarsen.

---

## 8. Edge cases

- **Empty ring (0 obstacles around `R`):** Tier 1 direction = East, radius = `R_pref`.
- **Single neighbour:** Tier 1 places opposite it (θ+180°); see §5.1.
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

---

## 11. Open questions / follow-ups

1. Exact constants for `gClear`, `gBreath` (confirm `gBreath = childHalf`), `dθ`, `dR`, the
   radius cap, and the obstacle-cull distance — to be fixed during implementation and recorded
   here.
2. Whether to clear `activeNodeId` on `sceneChanged` to close the stale-scratch caveat (§3).
3. Whether `circularSpreadSafe` can be retired once all four call sites move to the new helper
   (its only remaining reference would be dead code in the expansion `else` branch).
