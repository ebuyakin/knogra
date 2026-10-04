# Pluggable transition animators — working plan

> Status: Working plan, temporary. Delete when every step below is marked done and scene-transitions.md describes the result.
> Date: 2026-10-03
> Authority: None over the product; the target state here becomes normative only once it is in scene-transitions.md.
> Related: [Scene transitions](scene-transitions.md) §2, §4.2; [Map view](map-view.md) §8; [Autolayout architecture](autolayout-architecture.md) §3 (the registry pattern mirrored here)

## 1. Why

A transition has three phases, departure, morphing, arrival, and each can be done in more than one way.
Today each phase is one concrete class and the orchestrator knows their methods, so a second way of doing a phase has nowhere to go.
The first need is the map handoff (map-view.md §8): on entering the map, markers must grow out of their landmarks, as a re-focus arrives them, not fly in from the viewport edge; on leaving they must shrink back into them.
The general need is the product's: users assembling their own transition sequences.
One mechanism serves both: a phase is an interface, an animator is one implementation of a phase, a recipe names one animator per phase, and the orchestrator runs the recipe without knowing any implementation.

## 2. Vocabulary

    phase       departure, morphing or arrival; the fixed order of a transition (scene-transitions.md §1.3)
    animator    one way of doing one phase; a class implementing that phase's interface, named by an id
    recipe      three ids, one per phase: { departure, morphing, arrival }; plain data
    registry    per phase, the table from id to animator constructor, like autolayout's algorithms/registry.ts
    glue        what the orchestrator does between phases and belongs to no phase: classification, the central flag swap, the canvas theme crossfade, fold state, the invariant, the stylesheet reconciliation

## 3. Target state

### 3.1 Files

    src/features/transition/scene-to-scene/
      scene-to-scene-orchestrator.ts   Layer 1. classify; resolve the recipe; run departure, glue, morphing, arrival, glue. Knows no implementation.
      animators.ts                     the three interfaces and their context types (§3.2). Types only.
      recipe.ts                        TransitionRecipe, the id unions, resolveRecipe(override) = override, else the settings, else the built-in
      animator-registry.ts             createDeparture(id, cy), createMorphing(id, cy, backgroundRenderer), createArrival(id, cy); unknown id falls back to the built-in
      cascade.ts                       helpers an animator may use: graphReach(scene, centralId, endpointsOf) → Map<NodeId, { distance, parent }>, layersByDistance, bucketEdges, instanceEndpoints, directionBetween, viewportEdgePoint, delay. Not part of any interface.
      arrival-elements.ts              helpers an arrival animator may use: presentEdges (the folded-endpoint filter), addArrivingNodes (at a start position per node, styled), addArrivingEdges, applyArrivingEdgeStyles. Not part of any interface.
      departure-fly-out.ts             today's departure-animator.ts, class DepartureFlyOut implementing DepartureAnimator; takes over the orchestrator's departure branch logic (old central departing or shared; edges before or in parallel)
      departure-shrink.ts              new, class DepartureShrink (§3.4)
      morphing-parallel.ts             today's shared-core-animator.ts, class MorphingParallel implementing MorphingAnimator; its operators stay in morphing/ (today's shared-core-animation/)
      arrival-fly-in.ts                today's arrival-animator.ts, class ArrivalFlyIn implementing ArrivalAnimator; takes over the orchestrator's arrival branch logic (edges after or in parallel)
      arrival-grow.ts                  new, class ArrivalGrow (§3.4)

    Files and classes are named role first, variant second, so the folder sorts by phase and a new variant lands beside its siblings.

    src/config/transition-settings.ts  the id unions, DEPARTURE_ANIMATORS, MORPHING_ANIMATORS, ARRIVAL_ANIMATORS as { id, label } lists; settings `departureAnimator`, `morphingAnimator`, `arrivalAnimator` holding ids, defaults 'fly-out', 'parallel', 'fly-in'
    src/config/setting-definitions.ts  three select rows under Transition, one per phase
    src/features/transition/transition.ts   transitionTo(scene, recipe?: Partial<TransitionRecipe>); every other entry point passes none
    src/ui/map-handoff.ts              enter passes { arrival: 'grow' }; leave and back pass { departure: 'shrink' }

File renames are `git mv`, Eugene's, done before step 1 edits:

    departure-animator.ts        → departure-fly-out.ts
    arrival-animator.ts          → arrival-fly-in.ts
    shared-core-animator.ts      → morphing-parallel.ts
    shared-core-animation/       → morphing/

### 3.2 Interfaces

Each phase is one method that does the whole phase from a context object.
The context is the same for every implementation of that phase, so a new animator is written against the interface alone.

    interface DepartureAnimator {
      readonly id: DepartureAnimatorId;
      run(context: DepartureContext): Promise<void>;
    }
    interface DepartureContext {
      nodes: NodeId[];          // departing nodes, the old central included when it departs
      edges: EdgeId[];          // departing edges
      currentScene: Scene;
      targetScene: Scene;       // to know whether the old central departs
      viewportCenter: Position; // fallback for direction when the central is not in the instance
    }
    // Contract: when run resolves, every departing node and edge has been removed from the instance.

    interface MorphingAnimator {
      readonly id: MorphingAnimatorId;
      run(context: MorphingContext): Promise<void>;
    }
    interface MorphingContext {
      nodes: NodeId[];          // shared nodes
      currentScene: Scene;
      targetScene: Scene;
      targetPositions: TargetPositions;
      targetScales: Record<NodeId, number>;
      isNewScene: boolean;      // a drafted target has no viewport to glide to
    }
    // Contract: when run resolves, every shared node is at its target position, scale and design; the viewport is the target's; a new central that was arriving has been brought in (today's 2.3.C).

    interface ArrivalAnimator {
      readonly id: ArrivalAnimatorId;
      run(context: ArrivalContext): Promise<void>;
    }
    interface ArrivalContext {
      nodes: NodeId[];          // arriving nodes, the new central already excluded by the orchestrator when morphing brought it in
      edges: EdgeId[];          // arriving edges, central-to-shared ones already excluded for the same reason
      targetScene: Scene;
      targetPositions: TargetPositions;
      viewportCenter: Position;
    }
    // Contract: when run resolves, every arriving node and edge is in the instance, visible, at its target.

Known coupling, kept as glue: the morphing animator brings in a new central that is arriving (today's stage 2.3.C), so the orchestrator removes it and its edges to shared nodes from the arrival context, as it does today.
This is a contract between the morphing and arrival phases, written down here so a second morphing animator knows to honour it or the glue is changed.

Step-debug pauses stay with the implementations: today's `[1.x]` and `[3.x]` stage names move with the code into fly-out and fly-in; new animators name their own stages.

### 3.3 Recipe and selection

    type TransitionRecipe = { departure: DepartureAnimatorId; morphing: MorphingAnimatorId; arrival: ArrivalAnimatorId };

    resolveRecipe(override?: Partial<TransitionRecipe>): TransitionRecipe
      per phase: override[phase] ?? getSetting(`transition.${phase}Animator`); an id the registry does not know → the built-in

    SceneToSceneOrchestrator.transition(current, target, { isNewScene, recipe? })
      resolves the recipe, obtains the three animators from the registry (constructed once per id and kept), runs them in order

    Transition.transitionTo(scene, recipe?)   passes the override through; goToSceneByNode and goToSceneFromPath pass none, so they use the settings

The settings are new keys, additive, and the ids are strings; an unknown id (a removed animator) falls back to the built-in, never fails.

### 3.4 The new animators

    grow      ArrivalAnimator 'grow'. An arriving node starts at its parent's target position, invisible, and slides to its own place fading in, with its edges fading in alongside.
              Parent: the BFS predecessor on the path back to the central in the target scene (cascade.graphDistances); a node with no path anchors on the central.
              Layers closest first, with transition.arrivalLayerDuration and arrivalLayerStagger; no size tween.
              On the map's scene: landmarks grow out of the focus, then markers out of their landmarks, the re-focus's arriving move.

    shrink    DepartureAnimator 'shrink'. The mirror: a departing node slides into its parent's current position fading out, edges fading with their layer; farthest first, with departureLayerDuration and departureLayerStagger.
              Parent from the current scene. A departing old central zooms out in place, as fly-out does (the helper is shared).

Both reuse the cascade helpers; neither adds a timing setting.

## 4. Steps

Each step ends with type-check, lint, and the browser check named; the next step starts only after that.

    [x] 0  Eugene: the four git mv of §3.1 with the imports, eslintrc paths and comments following; committed 2026-10-03 as its own boundary
    [x] 1  Interfaces, recipe, registry, settings; orchestrator runs via the registry; the three existing classes implement the interfaces, fly-out and fly-in taking the orchestrator's branch logic into their run methods.
           No behaviour change. Browser: an ordinary transition, a transition where the old central departs, a path step; identical to before; step mode shows the same stage names. Verified 2026-10-03.
    [x] 2  cascade.ts: the BFS (now returning parents), layering, edge bucketing and the viewport edge point extracted from fly-out and fly-in, which use them.
           No behaviour change. Browser: the same three checks. Verified 2026-10-03.
    [x] 3  arrival-grow.ts; arrival-elements.ts (the adding of arriving nodes and edges, shared with fly-in); the settings UI rows; map-handoff enter passes { recipe: { arrival: 'grow' } }. Verified 2026-10-03 after 3b.
    [x] 3b Seen on 2026-10-03 while checking grow: X's markers morphed instead of leaving and growing back; then, with a `morphOnly` request making them travel, the twins' second boxes still arrived on the map after the engine's markers, two steps. Resolved by level, not by node (map-view.md §8): the map's scene is the focus and the landmarks only; the engine moves those, and the map grows every marker out of its landmark in one tween after the swap (`arriveMarkers`), shrinking them back before leaving (`convergeMarkers`). `morphOnly` and its reclassification were removed as unnecessary. Grow runs its layers one after another, since a fixed stagger launched children from a parent still in flight; and `addArrivingNodes` copies a start position, since Cytoscape adopts the object it is given.
           Browser: enter, landmarks X lacked grow out of the focus, then every marker grows out of its landmark together; leave, every marker shrinks into its landmark, then landmarks Y lacks depart and Y's other nodes arrive.
    [x] 4  departure-shrink.ts; departure-elements.ts (zoom out the central, fade edges, remove the departed; shared with fly-out); map-handoff leave and back pass { recipe: { departure: 'shrink' } }. Verified 2026-10-03.
           Browser: leave and back, markers shrink into their landmarks; the ordinary transition with 'shrink' selected.
    [x] 5  Docs: scene-transitions.md §2.1 tree and the paragraph on interfaces, registry and helpers, §4.2 (the recipe, the coupling, phases 1 and 3 per animator), appendix; map-view.md §8 step 3 and leave step 4 name the animators; architecture.md transition folder listing. Done 2026-10-03. Delete this file (Eugene).

## 5. Not in this round

A second morphing animator; saved, named recipes with labels; a recipe per scene or per edge type; a UI for assembling sequences.
All of them are the same TransitionRecipe object from a different source, and none needs the orchestrator to change.
