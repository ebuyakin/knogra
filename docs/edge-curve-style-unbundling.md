# Edge Curve/Style Unbundling

> **Status:** Implemented — 2026-07-06
> **Last reviewed:** 2026-07-06
> **Authority:** Current architecture for per-edge curve/layout ownership. Supersedes the "curve is part of edge style" assumption in [Edge Types Architecture](edge-types-architecture.md).
> **Related:** [Edge Types Architecture](edge-types-architecture.md), [Theme Architecture](theme-architecture.md), [Scene Transitions](scene-transitions.md), [Transition Sequence Spec](transition-sequence-spec.md)

---

## 1. Purpose

Split the edge's **curve style** (its geometric path) out of the edge's **visual style** (its colour/width/arrow). Today both live in one per-edge override bag, which couples two things that have opposite ownership semantics. This proposal unbundles them without a data migration: new work is authored in the split model, and old workspaces keep rendering correctly with known, bounded deficiencies.

---

## 2. Terminology

| Term | Cytoscape keys | Ownership |
|---|---|---|
| **Visual style** | `line-color`, `target-arrow-color`, `underlay-color`, `line-opacity`, `width`, `target-arrow-shape`, `arrow-scale` | **Collective** — cascades from theme → edge-type slot → edge-type override → per-edge override. Meaningfully "copied" across many edges. |
| **Curve style** | `curve-style`, `control-point-distances`, `control-point-weights`, `segment-distances`, `segment-weights`, `segment-radii`, `edge-distances`, `taxi-direction`, `taxi-turn`, `taxi-radius` | **Individual** — a property of one edge in one scene, tied to that scene's node layout. No cascade, no collective override, no "copy to many". Default is automatic bezier. |

The two are different *actions* for different *purposes*: changing colour/width/arrow is styling; changing the path is layout.

---

## 3. Current architecture

The per-edge scene override is a single flat bag of raw Cytoscape keys:

```ts
scene.edges[edgeId].design = { id: DesignId, params: Record<string, unknown> }
```

`params` mixes visual and curve keys. The resolver
([`edge-visual-resolver.ts`](../src/styles/edge-visual-resolver.ts) →
`resolveSceneEdgeVisualState`) applies the whole bag **last** in the cascade:

```text
theme base edge → edge-type slot → edge-type styleOverride → per-edge design.params → visibility
```

Because `design.params` overrides everything, and because the Edge Editor's
single **Override style** checkbox gates *all* controls and
`#collectParams()` writes colour/width/opacity/arrow **and** curve together,
any curve customisation freezes a full visual snapshot onto the edge.

The per-edge stylesheet rule (`edge[id = "…"]`) that carries this bag is
**emitted by the transition animators at scene open/transition**, gated on
`StyleGenerator.hasEdgeStyleOverride(design)`
([`open-scene-animator.ts`](../src/features/transition/opening-closing/open-scene-animator.ts),
[`arrival-animator.ts`](../src/features/transition/scene-to-scene/arrival-animator.ts),
[`shared-core-animator.ts`](../src/features/transition/scene-to-scene/shared-core-animator.ts),
[`open-close-orchestrator.ts`](../src/features/transition/opening-closing/open-close-orchestrator.ts)).
This is the reason the change reaches transition code (see §7).

---

## 4. Symptoms

1. **Curve edit forces a full visual override.** Selecting anything other than
   automatic bezier requires "Override style", which snapshots the current
   thematic colour/width/arrow into the edge. Styling and layout become
   entangled for no reason the user intended.
2. **Theme replacement skips laid-out edges.** After a theme swap the
   regenerated base/type rules are shadowed by the frozen per-edge rule, so
   every edge that was given a custom path keeps its old colours — usually most
   of the edges.
3. **Auto-layout preserves stale paths.** Auto-layout repositions nodes but
   never touches `design.params`, so a taxi or hand-tuned manual-bezier path
   survives a radical reposition and looks wrong. Expected behaviour: reset to
   automatic bezier.

---

## 5. Approach

Split ownership in **storage and authoring**, keep a **merged shape downstream**
so the render/transition pipeline sees the same combined style it sees today.

### 5.1 Data model

Add a sibling field to the scene edge record. `design` becomes visual-only;
`curve` is the individual path override. Absent `curve` means "automatic
bezier".

```ts
scene.edges[edgeId] = {
  design: { id: DesignId, params: Record<string, unknown> }, // visual override ONLY
  curve?: Record<string, unknown>,                            // curve keys ONLY; absent = default bezier
}
```

`curve` uses raw Cytoscape keys, mirroring how `design.params` already works, so
no new serialisation shape is introduced.

### 5.2 Resolution

The resolver keeps returning **one merged style object** (visual + curve), so
every downstream consumer — including transition analysis, ghosts, and opacity —
is unaffected in shape. Only its *inputs* change:

```text
visual = theme base → edge-type slot → edge-type override → design.params
curve  = scene.edges[id].curve  ??  <legacy curve keys inside design.params>  ??  { curve-style: default }
resolved.style = { ...visual, ...curve, ...visibility }
```

The legacy fallback (curve keys extracted from `design.params`) is what makes
old workspaces render correctly with **no migration** (see §6).

### 5.3 Authoring boundaries

- **Edge Editor:** "Override style" gates only the visual controls. The curve
  selector and its parameters are always editable — there is no override
  concept for curve, because there is nothing to override. Saving default bezier
  with no parameters clears `curve`.
- **Copy / paste style, copy-by-type, theme replacement, edge-type restyle:**
  operate on visual/`design` only. They never read or write `curve`. Copying
  from a legacy edge strips curve keys.
- **Bend shortcuts** and **Auto-layout** write/reset `curve`, never `design`.

### 5.4 Auto-layout reset

On `AutoLayout.apply`, every repositioned edge has its curve reset to default:
clear the `curve` field and strip any legacy curve keys embedded in
`design.params`. This is a deliberate user action that saves normally — not a
silent migration. Visual overrides are preserved.

---

## 6. Backward compatibility — no migration

**Constraint:** loading or using an old workspace must not rewrite it, explicitly
or implicitly. Old workspaces are allowed bounded deficiencies until the user
deliberately edits an edge.

How each path behaves for a legacy edge (curve keys still inside `design.params`,
no `curve` field):

| Path | Behaviour | Classification |
|---|---|---|
| Scene open / render | Curve keys resolve via the legacy fallback and via the per-edge rule → **renders exactly as before** | Correct, no change |
| Transitions | Resolver returns merged style incl. curve → structural-diff, ghosts, tween unchanged | Correct, no change |
| Theme replacement | Frozen visual keys in `design.params` still shadow the theme → legacy edge keeps old colours | **Accepted deficiency** |
| Editing the edge | Editor splits `design.params` into visual + curve on load, saves them separately → edge upgrades to split model | Self-healing on explicit edit |
| Auto-layout | Clears `curve` field **and** strips legacy curve keys from `design.params` → path resets | Correct (explicit user edit) |
| Copy style | Curve keys stripped from the copied payload | Correct |

New edges (created or edited after this change) are authored in the split model
and get all three fixes immediately. No load-time pass ever touches stored data.

---

## 7. Architectural constraints and scope reality

- **The transition animators are in scope.** The per-edge override rule is
  emitted by the animators, gated on `hasEdgeStyleOverride(design)` and built by
  `generateEdgeStyleForId(edgeId, design, …)`. A curve-only edge (empty visual
  `design`) would otherwise fail the gate and render as default bezier. The fix
  is to pass the **whole scene-edge record** (`{ design, curve }`) to those two
  `StyleGenerator` methods so both the gate and the emitted rule account for
  curve. The animator edits are mechanical call-site adaptations (pass the record
  instead of `.design`), **not** logic rewrites. This is the honest reason the
  earlier attempt reached these files; the difference is that this plan confines
  them to signature adaptation.
- **Resolver output shape is invariant.** `resolveSceneEdgeVisualState` must keep
  emitting a merged visual+curve style so transition analysis, ghost resolution,
  and opacity math stay untouched.
- **Single source of truth for the key partition.** The visual-vs-curve key sets
  live in one place (`edge-visual-resolver.ts`) and are imported by every module
  that splits, strips, or merges (edge-ops, edge-editor, context-menu). No
  duplicated key lists.
- **Dependency direction preserved.** `core` stays dependency-light (only the
  type gains a field). Features and UI depend on styles/resolver, never the
  reverse.
- **No new object store, no schema version bump.** `curve` is an optional field
  inside the existing scene record; export/import carry it for free.

### 7.1 Why the animators are affected — in plain terms

The "animators" are also the code that **paints each scene's edges** on open and
during transitions. For a custom edge they run three steps: (1) ask
`hasEdgeStyleOverride(design)` "does this edge have an override?", (2) if yes,
build its rule with `generateEdgeStyleForId(edgeId, design, …)`, (3) insert that
rule into the live stylesheet. Today all three read the single `design` object,
which currently holds everything including curve.

After the split, consider the common case: an edge with a hand-tuned bezier but
no colour/width/arrow override. Its `design` is now **empty** and its path lives
in the separate `curve` field. Step (1) inspects `design`, sees it empty, answers
**"no override"**, and the edge is skipped — so step (3) never runs and the edge
falls back to the theme default, **losing its curve**. The animator did nothing
wrong; it looked in the old drawer and the curve moved to a new drawer.

The fix is to hand those two functions the **whole scene-edge record**
(`{ design, curve }`) instead of just `design`, so the gate sees the curve
override and the built rule merges visual + curve. At each of the four call sites
this is literally passing `sceneEdge` instead of `sceneEdge.design` — one
argument. The animators' own logic (crossfade vs tween, opacity, ghosts) is
unchanged because the merged rule they receive has the same shape as before.

---

## 8. Implementation notes

Implemented in one session (2026-07-06). The plan was executed with several
corrections and additions noted below for future readers.

### 8.1 Sparse per-edge override rule

`resolveEdgeDesignStyle` was changed from **full** (base-style merged with
override) to **sparse** (only overridden keys). This is architecturally
required: the old full rule shadowed the edge-type's colour/width even when the
user only bent the path. A sparse rule lets unspecified visual properties
cascade from the type rule, which is what allows a curve-only edge to keep its
type colour and be reached by theme changes. Old workspaces with a full visual
snapshot in `design.params` are unaffected — they already emit all keys, and the
spare rule emits them too.

### 8.2 `#commitEdgeData` gap (shared-core-animator)

The plan listed `shared-core-animator.ts` as a mechanical rule-emission
adaptation only. During implementation a second gap was found: `#commitEdgeData`
(post-morph cy-data synchronisation) committed `design` to the target scene but
not `curve`, so a shared edge's curve would go stale after a scene-to-scene
morph. A `#commitEdgeCurve` helper was added to commit both fields.

### 8.3 `StyleGenerator.applyEdgeOverrideToStylesheet`

A shared helper (`applyEdgeOverrideToStylesheet`) was added to
`StyleGenerator` to own the "update-or-remove the per-edge rule" composition.
Both `edge-ops` (`#applyEdgeOverrideRule`) and `autolayout` (`#resetEdgeCurves`)
call it. This avoids duplication and keeps the composition in the styles layer.

### 8.4 `keyboard-handler.ts` — r shortcut scope changed

The `r` shortcut in the edge-bend group previously called `resetEdgeStyleOverride`
(cleared the entire visual+curve override). It now calls `resetEdgeCurveOverride`
(resets the path only, leaves visual intact). This is consistent with the split:
`r` is in the **bend** shortcut group, so it should reset the bend (curve), not
the colour.

### 8.5 Feature independence maintained

An intermediate version threaded `scene` into `AutoLayout` as a constructor
argument, creating a cross-feature dependency. This was reverted. Auto-layout
now resets curves using only `cy` + `StyleGenerator` + resolver helpers — the
same lower layers it already uses for positions. Features remain independent peers.

### 8.6 `d_edgeStyle` debug flag restored

The old `d_edgeStyle` log blocks were dropped during the `updateEdgeStyle`
rewrite. Restored with updated diagnostics covering the new write paths:
`updateEdgeStyle` (visual write), `updateEdgeCurve` (curve write), and
`#applyEdgeOverrideRule` (rule written-or-removed + computed style check).

### 8.7 Actual file list vs plan

Two files not in the plan were changed:
- `src/ui/keyboard-handler.ts` — `r` shortcut target changed (see §8.4).
- `src/features/feature-api.ts` — `new AutoLayout(cy)` stays unchanged after the
  cross-feature coupling was reverted (§8.5).

One extra addition inside a planned file:
- `src/features/transition/scene-to-scene/shared-core-animator.ts` — `#commitEdgeCurve` (see §8.2).

### 8.8 Corrected change summary

```
IMPL: unbundle per-edge curve style from visual style; new field scene.edges[id].curve, no migration
16 files · +7 exports · -0 exports · 4 breaking

src/styles/edge-visual-resolver.ts  [MOD]
  + export EdgeOverrideInput
  + export CURVE_STYLE_KEYS
  + export pickCurveParams
  + export pickVisualParams
  * export resolveEdgeDesignStyle(design, curve?) (+curve, -themeId)  breaking  sparse output
  @ resolveSceneEdgeVisualState                    split visual+curve, legacy fallback

src/styles/style-generator.ts  [MOD]
  deps: +./edge-visual-resolver (pickCurveParams, EdgeOverrideInput)
  * export generateEdgeStyleForId(edgeId, sceneEdge, themeId) (design→sceneEdge)  breaking  ↔ 4 in features/transition, 1 in features/scene
  * export hasEdgeStyleOverride(sceneEdge) (design→sceneEdge)                      breaking  ↔ 4 in features/transition
  + export applyEdgeOverrideToStylesheet

src/features/scene/edge-ops.ts  [MOD]
  deps: +../../styles/edge-visual-resolver (pickCurveParams, pickVisualParams)
  + export updateEdgeCurve(edgeId, curveParams|null)
  + export resetEdgeCurveOverride(edgeId)
  - resetEdgeStyleOverride                         replaced by resetEdgeCurveOverride
  @ getEdgeEditContext                             +curveParams field, hasStyleOverride=visual-only
  @ updateEdgeStyle                                visual-only, strips stray curve keys
  @ #buildBentEdgeParams→#buildBentCurveParams     reads/writes curve
  @ #applyEdgeOverrideRule                         uses applyEdgeOverrideToStylesheet; d_edgeStyle restored

src/features/scene/scene.ts  [MOD]
  + export updateEdgeCurve(edgeId, curveParams|null)
  + export resetEdgeCurveOverride(edgeId)
  - resetEdgeStyleOverride                         replaced

src/core/main-types.ts  [MOD]
  * export type Scene                              (+edges[id].curve?:Record<string,unknown>)

src/features/scene/elements.ts  [MOD]
  @ buildElements                                  set data.curve

src/storage/graph-saver.ts  [MOD]
  @ extract edge record                            read+persist data.curve

src/ui/components/edge-editor.ts  [MOD]
  * export EdgeEditorSavePayload                   (params→visualParams+curveParams)  breaking
  @ #setStyleControlsEnabled                       curve controls excluded (always active)
  @ #handleSave / #collectVisualParams / #collectCurveParams  split
  @ #createStyleTypeControl / #updateMiddleSection reads #curveParams not currentParams

src/ui/components/context-menu.ts  [MOD]
  deps: +../../styles/edge-visual-resolver (pickVisualParams)
  @ copy style                                     visual-only, strips curve
  @ paste style / editor onSave                    routes visualParams+curveParams separately

src/features/autolayout/autolayout.ts  [MOD]
  deps: +../../styles/style-generator (StyleGenerator)
       +../../styles/edge-visual-resolver (pickCurveParams, pickVisualParams)
  + #resetEdgeCurves                               local, no scene dependency
  @ apply                                          calls #resetEdgeCurves before animation

src/ui/keyboard-handler.ts  [MOD]  [NOT IN PLAN]
  @ #handleSelectedEdgeBendShortcut (r)            resetEdgeStyleOverride→resetEdgeCurveOverride

src/features/transition/scene-to-scene/arrival-animator.ts  [MOD]
  @ per-edge rule emission + cy.add                pass sceneEdge record; carry data.curve

src/features/transition/opening-closing/open-scene-animator.ts  [MOD]
  @ per-edge rule emission + cy.add                pass sceneEdge record; carry data.curve

src/features/transition/opening-closing/open-close-orchestrator.ts  [MOD]
  @ per-edge rule emission + cy.add                pass sceneEdge record; carry data.curve

src/features/transition/scene-to-scene/shared-core-animator.ts  [MOD]
  @ tween gate                                     pass sceneEdge record
  + #commitEdgeCurve                               commit target curve post-morph [NOT IN PLAN]
  @ #commitEdgeData                                calls #commitEdgeCurve
```
