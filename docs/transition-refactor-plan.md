# Transition feature: restoring the layering — plan and target state

> **Status:** Temporary plan, 2026-10-02. Deleted when done; the durable description of the target state goes into scene-transitions.md §2 and §4 as each step lands.
> **Authority:** none over behaviour. Every step below is an extraction with no behaviour change; scene-transitions.md remains the spec of what transitions do.
> **Why:** the map handoff (map-view.md §8) needs "morph from this Scene object to that one" and "open this Scene object instantly" as Layer 1 primitives. They do not exist, because the router runs the morph itself; adding the handoff to the router (as was started on 2026-10-02 and is reverted by step 5) would have extended the defect.

## 1. The defect, stated once

scene-transitions.md §2.2 defines four layers with an ownership rule: Layer 0 routes, Layer 1 orchestrators coordinate a sequence, Layer 2 animators execute, Layer 3 operators do one thing; each class creates only its direct children.
`transition.ts` (952 lines) is Layer 0 and does Layer 1, Layer 3 and policy work:

    orchestration      `#executeTo` classifies, reclassifies for fold state, reclassifies edges, removes hidden stowaways, runs the three phases one at a time, swaps the central flag between them, crossfades the canvas background, applies fold state, checks the invariant, prunes the stylesheet, writes the scratch. `SceneToSceneOrchestrator` exposes three phase methods and orchestrates nothing
    open modes         `openScene` chooses instant / fade / animated and runs the fade path inline (30 lines duplicating `OpenCloseOrchestrator.openFade`, which exists and is not called from there)
    DOM styling        `#applyCanvasBackground` and `hexToRgb` style the container; a Layer 3 concern used by open and morph alike
    scene policy       find by central node, the View-mode refusal, and the factory call, three times in three slightly different forms (`#executeToNode`, `#ensureSceneExists`, `goToSceneByNode`)
    debug plumbing     `window.transitionDebug` defined here, read by the orchestrator through `window`; `shared-core-animator` imports `waitForStep` from the orchestrator, an import upward across layers
    current scene      the scratch id is read in six places and written in three, in the router and in both orchestrators; `OpenCloseOrchestrator.close` looks the current scene up in the store itself

The handoff additions of 2026-10-02 (`openBehind`, `morphTo`, `ensureScene`, `#executeTo`, `#currentScene`) follow the same shape and are reshaped by step 5, not kept.

## 2. Target state

### 2.1 Files

    src/features/transition/
      transition.ts                         Layer 0. ~250 lines. Public entry points; regime guards; the brackets every transition shares; which scene is current; routing to one orchestrator with Scene objects. Touches no element.
      current-scene.ts                      Layer 0 helper, new. The instance's current scene: the scratch id and the transient Scene object; the only writer of `cy.scratch('currentSceneId')`.
      scene-resolution.ts                   Policy + pure drafts, new; replaces scene-factory-utils.ts. Find by central node; the create-or-refuse policy; the draft from the current scene's offsets (moved verbatim from the factory, made pure by taking the node title).
      canvas-theme-operator.ts              Layer 3, new. The container's background colour and vignette, with or without a CSS transition. Used by both orchestrators.
      step-debug.ts                         Dev-only, new. `window.transitionDebug` and `waitForStep`; removes the upward import.
      element-classification-utils.ts       Pure, kept; gains `reclassifyForFold` (the pure part of the router's fold reclassification) and `reclassifyEdges`.
      fold-state-handler.ts                 Kept as is.
      transition-invariants.ts              Kept as is.
      opening-closing/
        open-close-orchestrator.ts          Layer 1. `open(scene, mode)` and `close(scene, mode)`, each complete: background, stylesheet, viewport, animator, fold state, invariant. The inline fade in the router is gone; `openFade` is the one fade path.
        open-scene-animator.ts              Kept.
        close-scene-animator.ts             Kept.
      scene-to-scene/
        scene-to-scene-orchestrator.ts      Layer 1. `morph(current, target, options)`: everything from classification to the stylesheet prune. The three phase methods become private.
        departure-animator.ts               Kept.
        shared-core-animator.ts             Kept; `waitForStep` imported from step-debug.ts.
        arrival-animator.ts                 Kept.
        shared-core-animation/              Kept.

Deleted: `scene-factory-utils.ts` (its content moves to scene-resolution.ts).

### 2.2 Public interface of Transition (Layer 0), after

    goToSceneByNode(nodeId, { fade? })        guards (path mode, map view); resolve or create the target; fade mode → close + open; else → morph; announce
    goToSceneFromPath(sceneId)                guards; adjacent → morph, else close + open; no announce (the path owns its history)
    openScene(sceneId, { skipAnimation?, fade? })    look up; open(mode); announce
    closeScene({ fade? })                     current; close(mode)
    openBehind(scene)                         map handoff: open(scene, 'instant'); the object becomes current; no announce
    morphTo(scene)                            map handoff: morph(current, scene); announce when the store holds the target
    ensureScene(nodeId, draft)                map handoff: resolution with the given draft

Every entry point runs inside one private bracket, `#transition(kind, body)`: `transitionStart`, saver suspension, the transition record, `transitionEnd` and the record's completion or failure in `finally`. Today each entry point writes its own variant of the bracket; `openBehind` and `closeScene` differ from the others in what they emit, so the bracket takes options.

"Announce" means `eventBus.emit('sceneChanged')` and `cy.emit('scene:changed')` for the path, exactly where they are emitted today; a transient scene is never announced.

### 2.3 Public interface of the orchestrators, after

    SceneToSceneOrchestrator
      morph(current: Scene, target: Scene, options: { isNewScene: boolean }): Promise<void>
        classification (classifyElements, reclassifyForFold, reclassifyEdges, stowaway removal), departure, central flag swap, canvas theme crossfade, shared movement, arrival, fold state, invariant, stylesheet prune. Returns when the instance shows `target`. Does not write the scratch, does not save, does not announce.

    OpenCloseOrchestrator
      open(scene: Scene, mode: 'instant' | 'fade' | 'animated'): Promise<void>
        elements cleared, canvas theme (instant for 'instant'), base stylesheet, viewport, the animator for the mode, fold state, invariant, the central node selected. Does not write the scratch, does not announce.
      close(scene: Scene, mode: 'fade' | 'animated'): Promise<void>
        the animator for the mode, elements cleared, `foldedNodes` scratch cleared. Takes the scene; never looks it up.

Both orchestrators create their own `FoldStateHandler` (stateless over `cy`; the ownership rule says a class creates its direct children, and each orchestrator applies fold state in its own sequence). `transition-invariants` is called by each orchestrator at its end.

### 2.4 Dependency direction, after

    transition.ts           → opening-closing/open-close-orchestrator, scene-to-scene/scene-to-scene-orchestrator, current-scene, scene-resolution, events/event-bus, storage/graph-saver, storage/graph-store (lookups only), config (the mode setting), utils/diagnostics/transition-buffer
                            ✗ no longer: styles/*, core/style-types, classification utils, fold-state-handler, transition-invariants, utils/pure/scene-calculations
    orchestrators           → their animators, fold-state-handler, transition-invariants, canvas-theme-operator, classification utils, step-debug, styles/*, storage/graph-store, config
    animators, operators    unchanged, except shared-core-animator → step-debug instead of the orchestrator
    scene-resolution        → storage/graph-store, storage/app-mode, utils/pure/scene-calculations, core types
    canvas-theme-operator   → core/style-types only
    current-scene           → cytoscape Core, core types

No new external dependencies. No new storage. No new settings. No new events.

### 2.5 Where each piece of transition.ts goes

    lines (today)   piece                                        destination                           verbatim?
    46–68           transitionDebug object, window exposure      step-debug.ts                         yes
    70–75           hexToRgb                                     canvas-theme-operator.ts              yes
    126–170         goToSceneByNode                              stays; body shrinks to resolve + route + announce
    181–236         goToSceneFromPath                            stays; body shrinks to route
    244–357         openScene                                    router keeps lookup + bracket + announce; mode choice and the three mode paths → OpenCloseOrchestrator.open; the inline fade path deleted in favour of openFade (verify equivalence first, §4 step 2)
    370–448         openBehind, morphTo, ensureScene (2026-10-02) rewritten as routings over the new primitives
    450–485         closeScene                                   router keeps bracket; mode choice → OpenCloseOrchestrator.close(scene, mode); scratch clearing → current-scene
    491–520         #applyCanvasBackground                       canvas-theme-operator.ts              yes
    530–602         #executeToNode                               stays as resolve + route; the auto-create branch → scene-resolution
    604–612         #currentScene                                current-scene.ts
    613–636         #viewportCenter, #logScenePositions          orchestrator (private) / deleted if unused after the move
    638–875         #executeTo                                   classification + reclassification (pure parts) → element-classification-utils; stowaway removal, phases, central flag, background, fold, invariant, prune → SceneToSceneOrchestrator.morph; scratch write → current-scene; the new-scene save and the announce → router
    883–924         #findSceneByCenter, #ensureSceneExists       scene-resolution.ts
    935–951         #updateCentralNodeStyle                      SceneToSceneOrchestrator (private)    yes

## 3. The map handoff, on the target state

    openBehind(scene)     #transition('openBehind', { announce: false }) → open(scene, 'instant'); current = scene
    morphTo(scene)        #transition('morphTo', { announce: store holds scene }) → morph(current, scene); current = scene
    ensureScene(n, draft) scene-resolution.ensure(n, draft)

Three routings; nothing else in the feature knows the map exists. The map side and `ui/map-handoff.ts` are as map-view.md §7.6 and §8 describe.

## 4. Steps, each verified before the next

Every step is a move with no behaviour change. Verification is in the browser, with `DEBUG.d_transition` on and the transition buffer (`knogra.snapshot()`) compared before and after for the same actions.

    1  [done 2026-10-02] canvas-theme-operator.ts; step-debug.ts.
       Router and shared-core-animator import from them. Verify: a morph with a theme change (background crossfades); step mode still pauses (`transitionDebug.stepMode = true`).
    2  [done 2026-10-02; the stale openFade replaced by the inline fold-aware path, openInstant/openAnimated/setViewport private, FoldStateHandler owned] OpenCloseOrchestrator.open(scene, mode) and close(scene, mode).
       Before deleting the inline fade in openScene, diff it against openFade line by line; they differ today in which elements fade (visible only vs all) and in edge target opacity — openFade must do what the inline path does, since the inline path is the one that has been running. Verify: open instant (theme change), open animated (app load), fade mode on and off for goToSceneByNode and from the path, close in both modes.
    3  [done 2026-10-02; reclassifyForFold and keepAnimatedEdges in the utils with an InstanceView for the cy reads, stowaway removal between them in the orchestrator; #executeTo kept as the thin post-morph tail in Transition: scratch, the new-scene save, announce; the scene-4 debug logs deleted] reclassifyForFold and reclassifyEdges into element-classification-utils; SceneToSceneOrchestrator.morph; #executeTo deleted.
       The largest move; verbatim, the three phase calls and everything between them in the same order. Verify: animated morph with a ghost (a node whose design differs between scenes), a fold round trip (fold in A, go to B, come back), a transition where the old central departs, auto-creation of a scene for a node without one, a stowaway case (fold a node in A whose node is a neighbour in B, go to B).
    4  [done 2026-10-02; CurrentScene is the only writer of the scratch id, the orchestrators' close paths clear only the fold scratch; scene-resolution holds findSceneByCentral, ensureScene, draftFromCurrent and the pure buildSceneFromOffsets with the title and edge endpoints passed in] current-scene.ts; scene-resolution.ts; scene-factory-utils.ts deleted.
       Verify: the auto-create cases again; the path panel back and forward; closeScene followed by openScene.
    5  [done 2026-10-02; plus the shared bracket #run, which every entry point now uses, openBehind without the input guard and goToSceneFromPath recording the path step over the inner calls] openBehind, morphTo, ensureScene rewritten as routings; the mapViewChanged guard kept.
       Verify: type-check only; the callers do not exist yet.
    6  [done 2026-10-02] Documents: scene-transitions.md §2.1 (hierarchy), §4.1 (entry points), §4.2 ("Executed by SceneToSceneOrchestrator.morph"), a note on current-scene and scene-resolution; architecture.md §3.5 the transition folder listing. This file deleted (Eugene).

Steps 1 and 2 are independent of each other; 3 depends on 1; 4 on 3; 5 on 2, 3 and 4.

## 5. Risks, named

    the inline fade vs openFade     two implementations of one thing; if they differ, the inline one is the behaviour users have. Diff before deleting.
    fold reclassification           120 lines with cy reads (edge endpoints from cy when present, from the store otherwise). Moved as one block; the cy reads stay with the orchestrator, the pure parts go to the utils with the same inputs.
    scratch ownership               today both orchestrators write `currentSceneId` on close; after, only current-scene does. close() must still clear `foldedNodes`.
    the shared-core-animator import  it imports `waitForStep` from the orchestrator today; moving it is a one-line change but it is in the 725-line file on the `any` debt list — touch only the import.
    transition buffer kinds         `startTransition` kinds stay 'toNode' | 'fromPath' | 'openScene' | 'closeScene'; openBehind and morphTo record as 'openScene' and 'toNode' with a note, so the dev snapshot format does not change.
