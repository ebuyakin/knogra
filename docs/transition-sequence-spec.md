# Transition Feature — Design & Specification

> **Status:** Superseded  
> **Last reviewed:** 2026-06-14  
> **Authority:** Historical transition reference only. Current transition behavior is defined by [scene-transitions.md](scene-transitions.md).  
> **Related:** [Documentation map](README.md), [Scene transitions](scene-transitions.md), [Fold/unfold design](fold-unfold-design.md)

## Vision

Create smooth, visually engaging transitions between scenes that facilitate memory and spatial learning. Each scene explores one central concept and its connections. Transitions should feel like navigating an atlas or memory palace, with visual continuity reinforcing spatial memory.

---

## Background & Design Rationale

Scene transitions serve two fundamentally different use cases:

### Unrelated Scenes (Close + Open)
When the user navigates to a scene whose central node is **not visible** in the current scene
(e.g., jumping to the home/anchor scene, skipping several steps along a path, or when the
target's central node is folded/hidden in the current scene), there is no
visual continuity between the two scenes. A semantically-meaningful morph transition is neither
possible nor useful. Instead, the current scene is **closed** (reverse of opening) and the target
scene is **opened** fresh. This is handled by `closeScene()` → `openScene()` and does NOT use
the `executeToNode()` pipeline.

### Related Scenes (Morph Transition)
When the target scene's central node **is visible** in the current scene, the transition becomes
a morph: departing elements leave, shared elements transform, arriving elements enter. This is
the focus of this specification.

**Note on "visible":** A node is visible if it is included in the scene AND not folded (hidden).
A folded node exists in Cytoscape with `display:none` but has no visual presence to morph from.
See *Included vs Visible* in the Architecture doc.

### Key Simplification from Previous Design
The previous design had a sequential Phase 2: nodes moved first, then designs crossfaded in a
separate step (with three conditional branches including a "spotlight sequence" for arriving
central nodes). The new design **eliminates** the spotlight sequence entirely — that case is now
handled by the unrelated-scenes path above. Phase 2 now always has the new central node as a
shared node, and all transformations (position, scale, design, background) run **in parallel**
during a single morph duration.

---

## Overview

This document specifies the animation sequence when transitioning between scenes.
The transition logic is bifurcated based on the presence of the **New Central Node** in the **Old Scene**.

### Primary Logic Branch
1. **Unrelated Scene Replacement:**
   - **Condition:** New Central Node is **NOT visible** in the old scene (absent or folded).
   - **Action:** `OldScene.close()` $\to$ `NewScene.open()`.
   - **Note:** This is a sequential fade-out/fade-in. No element morphing occurs because there is no visual continuity.

2. **Related Scene Transition:**
   - **Definition:** Scene B is **related** to Scene A if the central node of Scene B is **visible** in Scene A.
   - **Condition:** Transition target is a Related Scene.
   - **Action:** Execute the 3-Phase Morph Sequence described below.

---

## Terminology

| Term | Definition |
|------|------------|
| **Old scene** | The scene we're transitioning FROM |
| **New scene** | The scene we're transitioning TO |
| **Shared node** | Node **visible** in BOTH scenes (included and not folded) |
| **Departing node** | Node visible in old scene but NOT included in new scene |
| **Arriving node** | Node included in new scene but NOT visible in old scene |
| **Old central** | Central node of the old scene (becomes a regular shared node or departs) |
| **New central** | Central node of the new scene (starts as a regular shared node) |
| **Ghost Element** | A temporary visual clone used during crossfade. The **ghost** carries the **old** design (fading out), while the **real** element is re-styled with the **new** design (fading in). Both occupy the same position and move in sync. The ghost is named with a `ghost_` prefix (e.g., `ghost_node_abc_17...`). Ghosts inherit the `centralNode` data flag from their source element so central styling is visually continuous throughout the crossfade. |

### Fold-Aware Element Classification

A node may be **included** in a scene (stored in `scene.nodes`) but **hidden** (folded). The element classifier first categorizes by inclusion, then reclassifies based on visibility:

| Old Scene | New Scene | Initial Class | Final Class | Behavior |
|-----------|-----------|---------------|-------------|----------|
| Visible | Visible | Shared | **Shared** | Morph (move, crossfade) |
| Visible | Hidden | Shared | **Departing** | Fly out; `FoldStateHandler` re-adds hidden |
| Visible | Not included | Departing | **Departing** | Fly out |
| Hidden | Visible | Shared | **Arriving** | Fly in |
| Hidden | Hidden | Shared | *(removed)* | Silent — `FoldStateHandler` handles |
| Hidden | Not included | Departing | *(removed)* | Silent remove from cy |
| Not included | Visible | Arriving | **Arriving** | Fly in |
| Not included | Hidden | Arriving | *(removed)* | Silent — `FoldStateHandler` adds hidden |

**Stowaway cleanup for hidden→visible:** `FoldStateHandler.apply()` adds hidden nodes to cy (with `display:none`) after each transition. On the *next* transition, if those nodes are reclassified as "arriving" (hidden→visible), they must be removed from cy before the arrival phase. Otherwise `ArrivalAnimator.flyInNodes()` will attempt `cy.add()` on an existing element (duplicate ID error). This cleanup runs in `#executeToNode` immediately after reclassification.

**Edge classification** follows from nodes: an edge animates only if **both** its endpoints are in an animated category (Departing, Shared, or Arriving). Edges connecting to hidden/removed nodes are dropped silently.

---

## The Morph Sequence

The transition consists of three major phases.
Crucially, **Phase 2 (Shared Movement)** executes all transformations in **parallel**.

### Phase 1: Departure

Removes elements that do not exist in the new scene.

1. **Edge Fade Out:** All edges connected to departing nodes fade to opacity 0.
2. **Node Fly Out:** All departing nodes animate to positions outside the viewport (away from center) and fade to 0.
   - *Exception:* If the Old Central node is departing (unlikely in Morph scenario, but possible), it **zooms out** (shrinks in place) instead of flying.

### Phase 2: Shared Transformation (Parallel)

Transforms all shared elements from their Old state to their New state.
All sub-stages (2.1 - 2.4) execute simultaneously.

#### 2.0: Central Node Handoff (Pre-animation)
- Toggle the `centralNode` data flag: remove from Old Central, set on New Central.
- The stylesheet rule `node[?centralNode]` automatically applies the blue border to the New Central node.
- Ghost elements created for crossfade inherit the `centralNode` flag from their source node, ensuring the blue border is visible on the ghost (old design, fading out) as well as the real element (new design, fading in).
- No stylesheet manipulation is needed — the data flag drives everything.

#### 2.1: Background Transition
Background can run in one of two modes (user setting: `sharedBackgroundTiming`):

| Mode | Sequence | Timing |
|------|----------|--------|
| **`parallel`** | Old background crossfades to New background simultaneously with 2.2–2.4. | Uses `morphDuration`. |
| **`sequential`** | Old background fades out **before** 2.2–2.4, New background fades in **after** 2.2–2.4. | Uses `sharedBgFadeOut` and `sharedBgFadeIn` (separate `[duration, delay]` settings). |

In `sequential` mode, the overall Phase 2 becomes:
1. Background fade out (`sharedBgFadeOut`)
2. Geometry + Appearance (2.2–2.4, `morphDuration`)
3. Background fade in (`sharedBgFadeIn`)

In `parallel` mode, the background crossfade runs concurrently with steps 2.2–2.4.

*Implementation:* Uses two background canvas layers blending via opacity.

#### 2.2: Geometry Interpolation
- All shared nodes animate from `(OldX, OldY)` to `(NewX, NewY)`.
- If a node's scale changes, it animates `OldScale` $\to$ `NewScale`.
- Edges attached to these nodes stretch naturally as the nodes move.

#### 2.3: Node Appearance Adaptation
Handles changes in node visual design (Shape, Color, internal structure).

| Condition | Action | Mechanism |
|-----------|--------|-----------|
| **Same Design** | No action | Standard movement (2.2) handles it. |
| **Different Design** | Crossfade | **Ghost Node** (Old Design) fades Out.<br>**Real Node** (New Design) fades In.<br>Both move in sync with 2.2. |

#### 2.4: Edge Appearance Adaptation
Handles changes in edge visual design (Color, Width, Curve Style, Endpoint Attachments).

| Condition | Action | Mechanism |
|-----------|--------|-----------|
| **Same Design** | Tween Properties | Native animation of color, width, opacity. |
| **Different Design** | Crossfade | **Ghost Edge** (Old Design) fades Out.<br>**Real Edge** (New Design) fades In.<br>Both stretch in sync with 2.2. |
| **Old Only** | Fade Out | Edge fades 1 $\to$ 0. |
| **New Only** | Fade In | Edge fades 0 $\to$ 1. |

**Crossfade Timing (the `morphCrossfadeOverlap` parameter):**

For structural changes (e.g., Square → Circle, Straight → Taxi edge), we cannot tween — we crossfade instead. The `morphCrossfadeOverlap` (0–100%) controls **how much the fade-out and fade-in overlap**, centered around the midpoint of the morph duration.

Given `overlap` (0–100) and total `duration`:

$$fadeOutEnd = 0.5 + \frac{overlap}{200}, \quad fadeInStart = 0.5 - \frac{overlap}{200}$$

- **Ghost** (Old Design) fades **1 → 0** during **`[0, fadeOutEnd × duration]`**
- **Real** (New Design) fades **0 → 1** during **`[fadeInStart × duration, duration]`**

Both elements **move in sync** with geometry interpolation (2.2) for the full duration.

| Overlap | Ghost fade-out | Real fade-in | Visual |
|---------|---------------|--------------|--------|
| -50% | 0–25% | 75–100% | Gap — old gone before new starts |
| 0% | 0–50% | 50–100% | Sequential handoff — no overlap |
| 50% | 0–75% | 25–100% | Smooth 25–75% overlap |
| 100% | 0–100% | 0–100% | Full overlap — both always partially visible |

**Example:** `morphCrossfadeOverlap = 0`, `morphDuration = 4000ms`:
- Ghost fades out: 0–2000ms
- Real fades in: 2000–4000ms
- No overlap, no gap (sequential handoff)

**Cytoscape implementation:** Node crossfade uses `.animation().play()` to run
movement and opacity transitions in parallel on the same element (`.animate()`
queues sequential animations). Edge crossfade uses `.delay().animate()` since
edges have no competing position animation.

*Setting:* `transition.morphCrossfadeOverlap` (default: `0`, range: -100 to 100)

#### 2.5: Cleanup (Post-animation)
- Remove all Ghost elements and their stylesheet rules.
- The `centralNode` data flag on the New Central node persists — no post-animation styling step is needed.
- Rebuild the 3 central/selected stylesheet rules with the target scene's theme (handles theme changes between scenes).

### Phase 3: Arrival

Introduces elements that exist only in the new scene.

1. **Node Fly In:** New nodes appear at the viewport edge and fly to their destinations.
2. **Edge Fade In:** Edges connecting to the new nodes fade in.

---

## Edge Case Matrix

### Edge Classification Rules

The transition analyzer classifies each shared edge into one of two animation strategies based on two factors: **endpoint morphing** (is either connected node crossfading?) and **edge style diff** (does the edge's visual style differ between scenes?).

| Node A | Node B | Edge Design | Strategy | Ghost Attachment |
|--------|--------|-------------|----------|-----------------|
| **Stable** | **Stable** | **Same** | **Tween** (no-op) | No ghost. Single edge stretches naturally. |
| **Stable** | **Stable** | **Non-structural diff** | **Tween** | No ghost. Color/width animated via bypass, then stylesheet takes over. |
| **Stable** | **Stable** | **Structural diff** | **Crossfade** | Ghost Edge: Real A → Real B. Real Edge: Real A → Real B. |
| **Morphed** | **Stable** | **Any** | **Crossfade** | Ghost Edge: Ghost A → Real B. Real Edge: Real A → Real B. |
| **Stable** | **Morphed** | **Any** | **Crossfade** | Ghost Edge: Real A → Ghost B. Real Edge: Real A → Real B. |
| **Morphed** | **Morphed** | **Any** | **Crossfade** | Ghost Edge: Ghost A → Ghost B. Real Edge: Real A → Real B. |

**Key rules:**
- If **either endpoint is morphing** (crossfade node), the edge is **always promoted to crossfade** — regardless of whether the edge style itself differs. This ensures proper attachment during the node shape transition.
- If **both endpoints are stable**, the edge uses **tween** for non-structural diffs (smooth color/width animation) and **crossfade** only for structural diffs (curve-style changes that can't be interpolated).
- Ghost edges attach to **ghost nodes** where they exist, falling back to **real nodes** for stable endpoints. This keeps the ghost edge visually connected to the fading-out old-design node.
- Real edges always attach to **real nodes**. As the real node fades in with its new design, the real edge endpoint is correct.

*Visual Note:* Because nodes crossfade "in place" (centered on the same coordinate), edges anchored to node centers remain visually coherent even as the node shape changes (e.g. Square → Circle).

---

## Architecture

### Directory Structure

```
src/features/transition/
  transition.ts                        ← Layer 0: top-level router
  element-classification-utils.ts      ← pure functions (classification + getHiddenNodeIds)
  scene-factory-utils.ts               ← pure functions (scene creation)
  opening-closing/
    open-close-orchestrator.ts         ← Layer 1: owns open + close animators
    open-scene-animator.ts             ← Layer 2: open animation primitives
    close-scene-animator.ts            ← Layer 2: close animation primitives
  scene-to-scene/
    scene-to-scene-orchestrator.ts     ← Layer 1: owns 3 phase animators
    departure-animator.ts              ← Layer 2: departure phase
    shared-core-animator.ts            ← Layer 2: shared movement phase
    arrival-animator.ts                ← Layer 2: arrival phase
    shared-core-animation/
      background-operator.ts           ← Layer 3: background transitions
      ghost-operator.ts                ← Layer 3: ghost element management
      transition-analysis-operator.ts  ← Layer 3: change analysis
```

### Naming Convention by Layer

| Layer | Suffix | Role |
|---|---|---|
| 0 | *(none)* | Top-level router (`Transition`) |
| 1 | `-Orchestrator` | Coordinates multiple animators |
| 2 | `-Animator` | Executes animation sequences |
| 3 | `-Operator` | Low-level single-concern operations |
| — | `-utils` | Stateless pure function modules |

### Ownership Chain

Each class creates **only its own direct children**. No class knows about grandchildren.

```
Transition (Layer 0)
  ├── OpenCloseOrchestrator (Layer 1)
  │     ├── OpenSceneAnimator (Layer 2)    leaf
  │     └── CloseSceneAnimator (Layer 2)   leaf
  └── SceneToSceneOrchestrator (Layer 1)
        ├── DepartureAnimator (Layer 2)    leaf
        ├── SharedCoreAnimator (Layer 2)
        │     ├── BackgroundOperator (Layer 3)            leaf
        │     ├── TransitionAnalysisOperator (Layer 3)    leaf
        │     └── GhostOperator (Layer 3)                 leaf
        └── ArrivalAnimator (Layer 2)      leaf
```

---

## Scene Auto-Creation

When the target scene doesn't exist (i.e., no scene has the target node as central node), a new scene is created on-the-fly via `createSceneFromCurrent()` in `scene-factory-utils.ts`.

**Layout rules:**
1. **Central node at viewport center** — position the new central node where the viewport is currently centered.
2. **Preserve directly connected nodes** (both parents AND children) from the current scene:
   - Calculate relative offset from new central in old scene
   - Apply same offset from viewport center in new scene
   - Example: If A was at (100,100) and B at (200,300), offset is (+100,+200)
   - In new scene with B at center (x,y): A goes to (x−100, y−200)
   - This preserves edge geometry (length, angle, direction)
3. **If no connections exist:** New scene contains only the central node.
4. Preserve background. Don't zoom.

---

## GraphSaver Protocol

GraphSaver is disabled during all transitions to prevent saving intermediate animation states.

| When | GraphSaver | Why |
|------|------------|-----|
| Before transition | **DISABLE** | Prevent saving animation frames |
| During animation | Disabled | No writes to DB |
| After transition | **RE-ENABLE** | Capture final state on next Cy event |

---

## Central Node Styling

Data-driven selector approach — a single stylesheet rule targets the `centralNode` data flag:

```typescript
{
  selector: 'node[?centralNode]',
  style: {
    'border-width': 1,
    'border-color': '#58a6ff',
    'border-style': 'double'
  }
}
```

To change central node during transition:
```typescript
oldCentral.data('centralNode', undefined);
newCentral.data('centralNode', 1);
```

No per-node stylesheet manipulation needed — the data flag drives everything.

---

## Stylesheet Rules

| Method | Purpose | When to Use |
|--------|---------|-------------|
| `generateSceneStylesheet()` | Full scene load | `openScene()` only |
| `addNodesToStylesheet()` | Add new nodes | Arrival phase, includeNode, addNode |
| `updateNodeInStylesheet()` | Update existing node | Design/scale changes |
| `buildCentralAndSelectedRules()` | Central + selected node rules | Scene open, theme changes |

**NEVER use:** `cy.style().selector().style().update()` — appends to end, breaks specificity.

**Selector format caveat:**
- Code creates: `node[id="n1"]`
- Cytoscape returns: `node[id = "n1"]` (with spaces)
- All search functions must handle both formats.

---

## Configuration

Timing settings in `src/config/transition-settings.ts`. All durations are `[duration, delay]` tuples in milliseconds.

### Scene-to-Scene (Morph)
- `transition.morphDuration` — Phase 2 parallel morph duration
- `transition.morphCrossfadeOverlap` — Ghost/real crossfade overlap (0–100)
- `transition.departureDuration` / `departureDelay` — Phase 1 timing
- `transition.arrivalDuration` / `arrivalDelay` — Phase 3 timing
- `transition.sharedBackgroundTiming` — `'parallel'` or `'sequential'`

### Open Scene
- `transition.openBgFadeIn` — Background fade in
- `transition.openCentralFlyIn` — Central node zoom in
- `transition.openNodesFlyIn` — Other nodes fly in
- `transition.openEdgesFadeIn` — Edges fade in
- `transition.openEdgeMode` — `'sequential'` or `'parallel'` (edges vs nodes)
- `transition.openFitPadding` — Padding when fitting to content