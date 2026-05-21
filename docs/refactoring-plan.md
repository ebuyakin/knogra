# Refactoring Implementation Plan

> **Status:** Draft (May 2026)  
> **Scope:** Fix transition/fold instability, implement regime model, enforce architectural invariants  
> **Constraint:** Max 3 files changed per step (per `copilot-instructions.md`)

---

## Overview

This plan addresses the root cause of transition instability: **lack of a regime model** causing exploratory state to leak into persisted scene data, plus several specific bugs in fold state management and scene auto-creation. Each step is self-contained, testable, and respects the file-size/complexity limits.

---

## Phase 1: Fix Fold State Bugs (Foundation) — Completed

These bugs affect correctness regardless of regime. Fix first so subsequent regime work has stable ground.

### Step 1.1: Fix Nested Fold Position Bug (Scenario_3) — Completed

**Bug:** Fold A → Move A → Unfold A → Unfold C → D appears at wrong/random position.

**Root cause:** In `FoldManager.unfold()`, when splitting fold state to revealed children, the offset recomputation uses pure arithmetic (`oldOffset - childOffset`). But if the parent (A) was moved while folded, the stored offsets are relative to A's **old** position. When A is at a new position, the children's target positions are computed as `A.newPos + childOffset`, but `childOffset` was computed from `A.oldPos`. For multi-level folds (A→C→D), the error compounds.

**Actually:** Wait. The document says offsets are stored at fold time: `offset = nodePos - rootPos`. If A is moved while C and D are folded, C and D's offsets are still relative to A's **old** position. When unfolding C, `C.targetPos = A.currentPos + C.offset`. But C.offset = `C.oldPos - A.oldPos`. If A moved by (dx, dy), then C appears at `A.newPos + (C.oldPos - A.oldPos) = C.oldPos + (A.newPos - A.oldPos)` — correct! C is shifted by the same amount A was shifted.

But D's offset is stored relative to A: `D.offset = D.oldPos - A.oldPos`. When we unfold C, we recompute D's offset relative to C: `D.newOffset = D.oldOffset - C.oldOffset = (D.oldPos - A.oldPos) - (C.oldPos - A.oldPos) = D.oldPos - C.oldPos`. This is correct IF C and D haven't moved.

The bug was most likely in `#animateUnfold()` timing. The method awaited `delay(duration)` rather than Cytoscape animation completion, so `graphSaver.forceSave()` and later nested unfolds could observe intermediate positions.

**Fix location:** `src/features/scene/fold-manager.ts`

**Implemented change:** Stop in-flight node/edge animations before reveal, await Cytoscape animation completion callbacks, and explicitly commit final child positions when unfold animation completes.

**Files touched:** 1 (`fold-manager.ts`)

**Method signature changes:** None.

---

### Step 1.2: Fix Fold Badge Persistence Across Scenes — Completed

**Bug:** Fold root in scene 1 retains `(+)` badge in scene 2 even when it has no children there.

**Root cause:** `FoldManager.#ensureSynced()` checks `cy.scratch('currentSceneId')` against `#sceneId`. But after a transition, `FoldStateHandler.apply()` writes to `cy.scratch('foldedNodes')`, but does NOT update `FoldManager.#sceneId`. So when `isFolded()` is called, `#ensureSynced()` sees the new scene ID, calls `loadFoldState()`, which reads `cy.scratch('foldedNodes')`.

Wait — that should work. The issue might be that `FoldStateHandler.apply()` writes `cy.scratch('foldedNodes')` with the target scene's fold state, but the UI badge is managed by `FoldBadgeManager` (in `src/ui/components/fold-badge.ts`), which might not be listening to scene changes.

Actually, the bug description says: "I folded node A in scene 1. moved to another scene where node A has no children. But the (+) badge is still there". If scene 2 has no `foldedNodes` entry for A, then `isFolded(A)` should return false, and the badge should hide.

Unless... `FoldStateHandler.apply()` doesn't clear the previous scene's `.fold-root` class from nodes that are SHARED between scenes. It clears `.fold-root` from ALL nodes, but then only re-adds it for nodes that are fold roots in the NEW scene. So shared node A should lose `.fold-root` in scene 2 if it's not a fold root there.

But the badge is an HTML overlay, not a Cytoscape class. Let me check `fold-badge.ts`.

**Implemented change:** `FoldBadgeManager` now derives badge visibility from `features.scene.isFolded(nodeId)`, refreshes on `sceneChanged` and Cytoscape add/remove, and refreshes after its own unfold click completes.

**Files touched:** 1 (`fold-badge.ts`)

**Method signature changes:** None.

---

### Step 1.3: Fix Node Inclusion Leak (`showAllEdges`) — Completed

**Bug:** "A→B→C, went from A to C, included D from A to C, went from C to B. D is included. It shouldn't be."

**Root cause:** Two problems:
1. `createSceneFromCurrent()` copies `...currentScene` (spreads ALL properties), including `edges`. It then filters edges by endpoint presence, but this filter only checks `currentScene.edges`, not `graphStore.edges`. If `currentScene.edges` includes an edge that shouldn't be in the new scene, it leaks.
2. `SceneEdgeOps.showAllEdges(nodeId)` adds ALL edges from `graphStore.edges` where both endpoints are in the scene. It doesn't check `scene.edges`. So even if an edge was never explicitly included in the scene, it gets added if both nodes happen to be there.

**Fix:** 
- `createSceneFromCurrent()`: Don't spread `...currentScene`. Explicitly copy only needed fields.
- `showAllEdges()`: Only add edges that exist in `scene.edges` (or are in `graphStore.edges` but the user explicitly wants them). Actually, the current behavior of `showAllEdges()` is a feature: "restore all edges to nodes already in scene". The bug is in `createSceneFromCurrent()` — it should NOT inherit edges from the parent scene.

Wait, re-reading the code:
```typescript
return {
  ...currentScene,  // ← copies ALL of currentScene, including edges!
  id: sceneId,
  centralNodeId: targetCentralId,
  nodes: newNodes,
  edges: newEdges,  // ← overwrites edges, but only with filtered subset
  foldedNodes: {},
  createdAt: new Date(),
  updatedAt: new Date()
};
```

Actually `edges: newEdges` DOES overwrite `currentScene.edges`. The issue must be elsewhere.

Looking at `showAllEdges()`:
```typescript
const relevantEdges = graphStore.edges.filter((edge: any) =>
  (edge.sourceId === nodeId || edge.targetId === nodeId) &&
  nodesInScene.has(edge.sourceId) &&
  nodesInScene.has(edge.targetId) &&
  !edgesInScene.has(edge.id)
);
```

This adds ANY graph edge between nodes in the scene, not just edges that were explicitly in `scene.edges`. This is intentional for `includeExistingNode()` ("restore all edges"), but it means that when you navigate to a scene where D and B happen to both be present, ALL edges between them are shown — including the one that was only relevant in scene C.

**Implemented change:** `showAllEdges()` now restores only edges that are in the current scene's `scene.edges`, not all graph edges whose endpoints happen to be visible.

**Files touched:** 1 (`edge-ops.ts`)

**Method signature changes:** None (internal logic change).

---

## Phase 2: Implement Regime Model Safely (Structural)

The regime concept is correct, but the first draft (`RegimeController` as a new `FeatureAPI` feature) is **not** the right first move. The project already has direct `graphSaver.disable()` / `enable()` calls, and `GraphSaver` currently uses a single boolean. Adding another controller around that boolean would risk nested lifecycle bugs.

The safer path is:
1. Harden persistence suspension first.
2. Replace existing direct disable/enable calls with scoped suspension.
3. Add minimal app mode state.
4. Gate direct graph writes and feature methods.
5. Add UI affordances last.

### Step 2.1: Add Scoped GraphSaver Suspension

**Goal:** Make persistence suspension safe for overlapping callers (Transition, fold/unfold, collapse/expand, future View mode).

**Current problem:** `GraphSaver` has a single `#isEnabled` boolean. Any caller can call `enable()` and re-enable persistence while another caller still expects it suspended.

**Change:** Add scoped suspension API while keeping existing `disable()` / `enable()` temporarily for compatibility.

Proposed API shape:
```typescript
export type GraphSaverSuspension = string;

class GraphSaver {
  suspend(reason: string): GraphSaverSuspension;
  resume(token: GraphSaverSuspension): void;
  isSuspended(): boolean;
}
```

**Implementation idea:** Maintain a `Set<GraphSaverSuspension>` or depth counter. `#scheduleSave()` returns early when the set is non-empty. `resume(token)` removes only its own token.

**Files touched:** 1 (`src/storage/graph-saver.ts`)

**Method signature changes:** None to callers yet. Adds new exported type/API.

**New dependencies:** None.

---

### Step 2.2: Replace Transition Persistence Suspension

**Goal:** Use scoped suspension for all transition paths without changing behavior.

**Changes:**
- Replace `graphSaver.disable()` / `graphSaver.enable()` in `Transition` with `const token = graphSaver.suspend('transition')` / `graphSaver.resume(token)` in `finally` blocks.
- Keep `transitionStart` / `transitionEnd` event behavior unchanged.

**Files touched:** 1 (`src/features/transition/transition.ts`)

**Method signature changes:** None.

---

### Step 2.3: Replace Scene Temporary Suspension

**Goal:** Use scoped suspension in fold/unfold/collapse/expand so these operations cannot accidentally re-enable persistence during another suspension.

**Changes:**
- Replace direct `graphSaver.disable()` / `enable()` in `Scene.foldNode()`, `unfoldNode()`, `collapseNodeAnimated()`, and `expandNodeAnimated()`.
- Keep `graphSaver.forceSave()` behavior unchanged for Edit mode until app mode exists.

**Files touched:** 1 (`src/features/scene/scene.ts`)

**Method signature changes:** None.

---

### Step 2.4: Add Minimal App Mode State

**Goal:** Track View/Edit mode without introducing a new vertical feature or widening `FeatureAPI` prematurely.

**New file:** `src/storage/app-mode.ts` or `src/config/app-mode.ts` (final location TBD before coding)

Proposed API:
```typescript
export type AppMode = 'view' | 'edit';

export function getAppMode(): AppMode;
export function setAppMode(mode: AppMode): void;
export function isEditMode(): boolean;
```

**EventBus change:** Add `appModeChanged: { mode: AppMode }`.

**Persistence:** Start with runtime-only mode (`edit` default). Persisting mode can be decided later.

**Files touched:** 2 (`app-mode.ts`, `event-bus.ts`)

**Method signature changes:** None.

---

### Step 2.5: Gate GraphSaver and Direct Writes by App Mode

**Goal:** In View mode, `knogra-graph` must not change. Chat/path/shelf continue normally.

**Changes:**
- App mode changes suspend/resume GraphSaver for View/Edit.
- Guard direct graph writes that bypass GraphSaver, including theme/background/scene updates.
- Fold/unfold in View mode remains visually allowed but skips `forceSave()`.

**Likely files touched:** Split into multiple ≤3-file steps:
- `src/storage/app-mode.ts`, `src/storage/graph-saver.ts`
- `src/features/scene/scene.ts`
- `src/features/scene-background.ts`

**Method signature changes:** None expected.

---

### Step 2.6: Gate Feature Mutations by App Mode

**Goal:** Block graph/scene mutations in View mode at the feature layer, not only in UI.

**Mutation paths to gate:**
- `Graph.addFreeNode()`, `addConnectedNode()`, `addEdge()`, `deleteNode()`, `deleteNodeFromGraph()`
- `SceneNodeOps.includeNode()`, `includeExistingNode()`, `excludeNode()`, `updateNodeStyle()`
- `SceneEdgeOps.excludeEdge()`, `updateEdgeStyle()`, `showAllEdges()` if called from a blocked include path
- `Node.update()` and `Edge.update()` if node/edge content edits are considered graph edits in View mode

**Files touched:** Split into multiple ≤3-file steps.

**Method signature changes:** None expected if using imported `isEditMode()`.

---

### Step 2.7: Add UI Toggle and UI Affordance Gating

**Goal:** Make mode visible and prevent users from invoking blocked actions.

**Changes:**
- Add explicit View/Edit toggle via shortcut and context menu.
- Disable/hide edit commands in `KeyboardHandler`, `ContextMenu`, `NodeManager`, and suggestion shelf placement.
- AI chat and suggestion generation remain active; shelf placement into scene is disabled in View mode.

**Likely files touched:** Split into multiple ≤3-file steps:
- `src/ui/keyboard-handler.ts`
- `src/ui/components/context-menu.ts`
- `src/ui/components/node-manager.ts`
- `src/ui/panels/suggestion-panel.ts`
- `src/ai/node-shelf.ts`

**Method signature changes:** None expected.

---

## Phase 3: Enforce Central Node One-to-One Invariant

### Step 3.1: Validate Central Node Uniqueness

**Changes:**
- `createSceneFromCurrent()`: Before creating, check if target node is already central in another scene. If so, navigate to that scene instead of creating.
- `graphStore.createScene()`: Add validation (can be soft — log warning or throw)

**Files touched:** 1 (`scene-factory-utils.ts`)

**Method signature changes:** None.

---

## Phase 4: Verify and Document

### Step 4.1: Update AGENT_PRIMER.md

Add new invariants and known issues discovered during refactoring.

### Step 4.2: Run QA Review

Use the QA Engineer agent to review modified files for compliance.

---

## Implementation Order (Recommended)

| Order | Step | Files | Risk | Reasoning |
|-------|------|-------|------|-----------|
| 1 | 1.3 Fix `showAllEdges` | 1 | Low | Isolated bug fix, no structural changes |
| 2 | 1.2 Fix fold badge | 1 | Low | UI-only fix |
| 3 | 1.1 Fix nested fold | 1 | Medium | Core fold logic, needs careful testing |
| 4 | 3.1 Central node invariant | 1 | Low | Prevents data corruption |
| 5 | 2.1 Scoped GraphSaver suspension | 1 | Medium | Fix persistence lifecycle before modes |
| 6 | 2.2 Transition uses scoped suspension | 1 | Low | Behavior-preserving internal change |
| 7 | 2.3 Scene uses scoped suspension | 1 | Low | Behavior-preserving internal change |
| 8 | 2.4 Minimal app mode state | 2 | Medium | Adds cross-cutting mode event/state |
| 9 | 2.5 Gate persistence/direct writes | ≤3 per step | Medium | Ensures View mode does not write `knogra-graph` |
| 10 | 2.6 Gate feature mutations | ≤3 per step | Medium | Blocks edit operations below UI layer |
| 11 | 2.7 UI toggle and affordance gating | ≤3 per step | Low-Medium | UX layer; relies on feature guards |
| 12 | 4.1 Update primer | 1 | None | Documentation |

**Total files modified:** ~14 (but max 3 per step)
**New files:** likely 1 (`app-mode.ts`), plus optional UI component if needed
**Method signature changes:** None expected in revised Phase 2
**New dependencies:** None.

---

## Testing Strategy

Each step should be verified:
1. **Manual:** Run the app, reproduce the bug/scenario, confirm fix
2. **Console:** Check debug logs (`d_fold`, `d_transition`) for correct behavior
3. **QA Review:** Run QA Engineer agent on changed files

For Phase 2 (regime model), critical test cases:
- Nested persistence suspension: entering View mode then running a transition must not re-enable GraphSaver after transition ends
- Nested persistence suspension: fold/collapse during an existing suspension must restore the previous suspension state
- View mode: drag node, switch scene, return — position restored to original
- View mode: fold node, switch scene, return — fold state restored to original
- Edit mode: drag node, switch scene, return — position persisted
- Transition: navigate during view mode, no DB corruption
