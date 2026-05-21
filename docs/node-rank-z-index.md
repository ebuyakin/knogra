# Node Rank (Explicit Z-Index) — Design Spec

> **Status: DEFERRED to v2.**
>
> This feature is intentionally not implemented in v1. Users can achieve the
> desired stacking order today by excluding and re-including nodes (re-inclusion
> raises implicit z-index via Cytoscape insertion order). Explicit rank adds
> non-trivial complexity across rendering, persistence, transitions, and UI, and
> carries edge-case risk that is not justified for v1.

## Problem

Cytoscape renders nodes in insertion order by default, so a node added later
covers a node added earlier when they overlap. Users currently cannot reorder
the stacking of nodes within a scene except by the workaround of excluding and
re-including them. A first-class "rank" / z-index per node would let users
control stacking explicitly.

## Proposed Solution

Add an optional `rank: number` property to each scene node. Render stacking via
Cytoscape's declarative z-index rather than insertion order:

- Add a global `node { 'z-index-compare': 'manual', 'z-index': 0 }` rule to the
  base stylesheet so all nodes uniformly use manual stacking (avoids mixed-mode
  ambiguity between `auto` and `manual`).
- For each node, the per-node stylesheet rule overrides `z-index` with the
  node's `rank` when defined.
- Edges keep the default `auto` so they render under their endpoint nodes as
  today.

Rationale for declarative z-index (vs relying on insertion order):

- Insertion order breaks during scene-to-scene arrival animations, which add
  nodes in proximity layers (closest-first) rather than rank order. A declarative
  approach keeps stacking orthogonal to the animation's insertion sequence.
- Save/load, undo, and include/exclude all need predictable stacking without
  replaying insertion history.

## Concerns Examined

| # | Concern | Verdict |
|---|---------|---------|
| 1 | Edges need `auto` to render under nodes | Non-issue. `z-index-compare` is per-element. Nodes can be `manual` while edges stay `auto`. Existing ghost code already mixes modes safely. |
| 2 | Mixed `auto` (unranked) / `manual` (ranked) ambiguity | Mitigated by applying `manual` globally at the base node rule so all nodes use the same compare mode. |
| 3 | Selection / active / hover implicit promotion | Non-issue. Knogra's `:selected` rule only modifies border, not z-index. Cytoscape does not auto-promote selected nodes. |
| 4 | Compound nodes (`parent` data field) | Non-issue. Knogra does not use Cytoscape compound nodes. |
| 5 | Edges between nodes of different ranks | Cosmetic only. Edges stay under all nodes (same as today). Not a regression. |
| 6 | Performance | Non-issue at Knogra scale. |
| 7 | Ghost crossfade during scene-to-scene transitions | Real. Needs handling — see below. |

### Ghost interaction (Concern 7)

During a scene-to-scene transition with a design change, `GhostOperator` creates
a temporary clone with the **old** design while the real node adopts the **new**
design. Both overlap at the same position and crossfade.

With explicit rank:

- The real node will pick up its new rank naturally via its updated stylesheet
  rule (rank_B).
- The ghost must stack as the old node did in scene A (rank_A). Reading
  `originalNode.data('rank')` at ghost creation time (before the stylesheet
  swap) gives rank_A correctly.

Fix (two-line change per ghost creation block in
`src/features/transition/scene-to-scene/shared-core-animation/ghost-operator.ts`):

```ts
const oldRank = originalNode.data('rank') ?? 0;
ghost.style({
  'opacity': 0,
  'z-index': oldRank,
  'z-index-compare': 'manual'
});
```

Edge ghosts can stay at `z-index: 0` since edges remain under nodes.

## Implementation Plan (phased, ≤3 files per phase)

### Phase 1 — Type, data, rendering (3 files)

1. `src/core/main-types.ts` — add `rank?: number` to scene node shape.
2. `src/features/scene/elements.ts` — include `rank` in the node `data` field so
   Cytoscape carries it.
3. `src/styles/style-generator.ts`:
   - Add `'z-index-compare': 'manual', 'z-index': 0` to the global `node` rule
     in `buildBaseStylesheet`.
   - In `generateSceneStylesheet`, `addNodesToStylesheet`, and
     `updateNodeInStylesheet`, after generating the per-node style, patch in
     `nodeStyle['z-index'] = rank` when rank is defined. Extend the input
     contracts of the two non-scene variants to accept `rank?: number`.

**Test:** manually edit a saved scene JSON to set `rank: 5` on one node,
reload, observe stacking change.

### Phase 1.5 — Ghost handling (1 file)

4. `src/features/transition/scene-to-scene/shared-core-animation/ghost-operator.ts`:
   set ghost z-index to `originalNode.data('rank') ?? 0` in both node and edge
   ghost creation blocks.

### Phase 2 — Persistence (2 files)

5. `src/storage/graph-saver.ts` — read `cyNode.data('rank')` and include in the
   saved scene record (omit when undefined).
6. `src/storage/workspace/validate.ts` — validate `rank` is a finite number
   when present.

**Test:** set rank via dev console, save, reload, confirm rank persists and
stacking is restored.

### Phase 3 — Scene factory + arrival animation (2 files)

7. `src/features/transition/scene-factory-utils.ts` — carry `rank` over like
   `scale` / `design` when building new scene nodes.
8. `src/features/transition/scene-to-scene/arrival-animator.ts` — include
   `rank` in the node `data` field when `cy.add`-ing during arrival.

**Test:** set rank, navigate to another scene and back — rank preserved. G-
navigate to create a new scene — rank carries over.

### Phase 4 — UI (3 files)

9. `src/ui/components/node-editor.ts` — numeric input "Z-index" below scale;
   extend `NodeEditorOnSave` signature to include `rankUpdate`.
10. `src/features/scene/node-ops.ts` + `src/features/scene/scene.ts` — extend
    `updateNodeStyle` signature to accept `rank?: number`; write
    `cyNode.data('rank', rank)`.
11. `src/ui/components/context-menu.ts` + `src/ui/keyboard-handler.ts` — pass
    `rankUpdate` through to `updateNodeStyle`.

## Open Questions for v2

- **Rank semantics:** integer vs float? Ordering-only (user picks any numbers)
  or position-like (auto-renumber)? Recommend float to allow "insert between"
  without renumbering neighbors.
- **Default value:** 0 for all nodes (flat stacking) or derived from creation
  order? Recommend 0 for simplicity and predictability.
- **Edge ranking:** do we ever want explicit edge z-index? Not currently.
- **UI affordance:** bring-to-front / send-to-back commands in addition to
  numeric input? Likely useful.
- **Scale coupling:** should visually larger nodes auto-rank higher? No — keep
  rank independent of scale to avoid surprise.

## Workaround in v1

To raise a node's stacking in v1, exclude it from the scene and include it
again. Re-inclusion appends the node at the end of Cytoscape's insertion
order, effectively bringing it to the front. This works for interactive
manual layering but is lost on re-load unless the include order is preserved
by the save format (it is, via the node-order in the persisted scene).
