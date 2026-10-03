# Map View, implementation checklist

> Status: Working checklist, temporary. Delete when v1 ships and the journal entry is written.
> Created: 2026-09-23
> Authority: Sequencing and verification only. What is being built is specified in [map-view.md](map-view.md); where the two disagree, that document wins.

Rules for this checklist: one step at a time, in order; a step is done when type-check and lint pass and every browser check in it has been seen to pass; tick the boxes as they pass; a check that fails becomes a note under its step, not a silent skip.
The verification ladder is the usual one: `npm run type-check`, `npm run lint`, then the browser.

## Step 1. Data model and store

Storage layer only, no behaviour.

- [x] `core/main-types.ts`: `Edge.bearing?: number`, `Node.defaultDesign?: { id; params }`, `MapView`
- [x] `config/storage-config.ts`: `MAP_DB_NAME`, `MAP_DB_VERSION`, `MAP_DB_SCHEMA` — a separate database like paths and themes, not a graph-DB version bump (decision recorded in map-view.md §6.2)
- [x] `storage/map-store.ts` (new): own Dexie DB, cache on init, get by focus, put, delete by focus, clearAll
- [x] `storage/node-deletion.ts`: delete the node's map record in the cascade (step 7)
- [x] `storage/workspace/transfer.ts`, `envelope.ts`, `workspace.ts`: `mapViews` exported, imported, cleared on reset; optional member normalised to empty
- [x] `docs/workspace-architecture.md`: sources table, envelope example, key list, database count
- [x] type-check, lint

Browser:
- [x] app starts on an existing workspace; devtools Application tab shows a `knogra-map` database with a `mapViews` store
- [x] export a workspace; the file contains `mapViews: []`
- [x] import a workspace file saved before this step; opens unchanged

## Step 2. Settings and pure core

No Cytoscape, no DOM.

- [x] `config/map-settings.ts` (new): the `map` domain per map-view.md §6.4
- [x] `config/index.ts`: the `map` domain registered in all six places a domain appears
- [x] `config/setting-definitions.ts`: the Helicopter view section, after Auto-layout
- [x] `features/map-view/map-tree.ts` (new): walk with a filter predicate → boxes, lines, twins
- [x] `features/map-view/geometry.ts` (new): positions from bearings, lengths, scales and defaults; focus at the origin; bearing helpers
- [x] `features/map-view/default-design.ts` (new): the content rule behind `Node.defaultDesign`
- [ ] type-check, lint

Browser: none; behaviour is seen in step 3.

## Step 3. Static map, enter and leave

First visible result.

- [x] `index.html`, `main.ts`: the `#map` surface and the second instance, created in the composition root and injected, as the scene's are (decision 2026-09-23, map-view.md §7.1); `FeatureAPI(cy, backgroundRenderer, mapCy)`
- [x] `features/map-view/map-view.ts` (new): the class over the injected instance; show and hide; focus centred, no pan, zoom re-centres; `boxesOf` and `nodeOf` lookups (§7.5)
- [x] `features/map-view/render.ts` (new): elements by kind; styles through `StyleGenerator.generateNodeStyle` keyed by address; fixed theme mode only
- [x] `features/map-view/seeding.ts` (new): bearing seeding per map-view.md §6.5, written through graphStore
- [x] `features/map-view/geometry.ts`: `widestGapBearing` added for seeding rule 3 (the scene's rule is private to position-expansion.ts)
- [x] `features/feature-api.ts`: the `mapView` entry
- [x] `ui/context-menu/canvas-menu.ts`: Helicopter view item on the scene canvas
- [x] `ui/context-menu/map-menu.ts` (new) and `context-menu.ts`: Back to scene and Settings on right-click in the map — not in the original list; the Back item must come from the UI layer, which the feature may not import
- [x] corrected 2026-09-23: the UI first obtained the map instance through `features.mapView.cy`, a feature handing out infrastructure. Now `main.ts` injects `mapCy` and `mapContainer` into `UIComponentAPI`, `MenuDependencies` carries `mapCy`, and `MapView` keeps its instance private (map-view.md §7.1)
- [x] `ui/keyboard/keyboard-handler.ts`: one early return while the map is active
- [x] type-check, lint

Browser:
- [x] from a scene, Helicopter view opens; the focus is at the viewport centre
- [x] landmarks sit at the bearings the scene had (seeding rule 1); markers are small
- [x] a triangle A, B, C shows the twins `A/B/C` and `A/C/B` with antiparallel lines
- [x] Back returns to the scene; `knogra.auditScene()` is clean; nothing moved
- [x] with `DEBUG.d_saver` on, GraphSaver never fired while the map was shown
- [x] View mode: the map opens and shows the same picture

## Step 4. Adjusting

- [x] `features/map-view/interaction.ts` (new): live drag with re-derivation on every move, persist bearing and length on release
- [x] `features/map-view/preview.ts` (new): the balloon, a style tween on the instance
- [x] `features/map-view/render.ts`: returns each node's base style; `restyleBoxes` for scale changes
- [x] `features/map-view/map-view.ts`: `MapState`; `scaleSelected`, `togglePreview`, `collapsePreview`; focus ungrabbable, Edit mode gates grabbing; zoom remembered on hide once the author has zoomed
- [x] `ui/components/map-marker-tooltip.ts` (new) + `styles/map-marker-tooltip.css`: the DOM tooltip on hover; click routes to the feature's balloon; Escape and click-elsewhere collapse — UI, not the feature, because it is DOM (split from the planned `marker-preview.ts`)
- [x] `ui/keyboard/bindings/map-bindings.ts` (new): `<` / `>` scale the selected boxes; claims every key while the map is active, replacing step 3's bare early return in `keyboard-handler.ts`
- [x] `ui/components/ui-component-api.ts`: constructs the tooltip on the map instance
- [ ] type-check, lint

Browser:
- [ ] in the triangle, dragging C' makes B' orbit C during the drag
- [ ] release, leave the map, re-open it: the bearing and the length are there
- [ ] open the map of B: the BC line has the new bearing
- [ ] scale a landmark with the Enlarge / Shrink keys; persists per map
- [ ] hover a marker: title tooltip; click it: balloon; Escape: collapses
- [ ] View mode: drag does nothing, scale keys do nothing, no writes

## Step 5. Re-focus

- [x] `features/map-view/refocus-animator.ts` (new): `rewriteAddress`, `planRefocus`, and the three phases, each with its duration setting; the swap (a render) sits between move and arrive because element ids cannot be renamed
- [x] `features/map-view/history.ts` (new): back and forward over focuses
- [x] `features/map-view/map-view.ts`: `focusOn` (one degree, guarded against re-entry), `back`, `forward`, `#derive` shared with `show`; emits `mapViewChanged` on show, re-focus, hide; zoom kept across a re-focus
- [x] `events/event-bus.ts`: `mapViewChanged { active, focusNodeId }` on enter, re-focus and leave (§7.3, §7.5)
- [x] `ai/chat-session.ts`: subscribe so the learning space follows the focus; restores what was loaded on leaving
- [x] `ui/context-menu/context-menu.ts`: tap on a landmark → `focusOn`, beside the map's `cxttap`, where the scene's tap-to-navigate also lives
- [x] `ui/context-menu/map-menu.ts`: Previous focus, Next focus
- [ ] type-check, lint

Browser:
- [ ] double-click a landmark: leaving markers slide into their parents; one movement; new markers slide out of their parents
- [ ] the box you came from is a landmark at the reversed bearing; nothing rotated
- [ ] in the triangle with edge BC, click B: the marker `A/B/C` grows into the landmark `B/C` and the landmark `A/C` shrinks into the marker `B/A/C`
- [ ] the chat panel shows the new focus's conversation
- [ ] back and forward retrace the focuses
- [ ] `map.animate` off: the same end state, instantly

## Step 6. The handoff (spec §8, §7.6), theme, docs

Rewritten 2026-10-02: the engine does the morph through the map's scene; the crossfade plan is gone.

- [x] spec §8 rewritten with the enter and leave sequences; §5.1, §5.5, §7.3, §7.4, §7.6 (who runs the handoff: a UI flow module; port and events declined), §11; architecture.md §3.5 "sequences across features live in the UI", MapView catalog row, §3.10 regime row
- [x] engine (02.10, after the transition feature's layering was restored first, see scene-transitions.md §2.1 and the journal): `openBehind(scene)`, `morphTo(scene)`, `ensureScene(nodeId, draft)` as routings over `OpenCloseOrchestrator.open` and `SceneToSceneOrchestrator.morph`; `CurrentScene` holds the transient scene; `goToSceneByNode` and `goToSceneFromPath` guarded by mapViewChanged
- [ ] map: `prepare(nodeId)`, `mapScene()` pure over tree and layout, `takeOver()`, `arriveTwins()`, `convergeTwins()`; `sceneFromMap` = the map's scene minus markers, for creation
- [ ] flow: `ui/map-handoff.ts` with enter(), back(), leaveTo(nodeId); the menu and the keys call it; GraphSaver suspended while the map's scene is current
- [ ] commands: menu "Open this node's scene"; Escape back; G decided
- [ ] `map.themeMode` `scene`, with the fallback to the entered scene's theme and the crossfade during move
- [ ] `docs/map-view.md`: status Draft → Current; any place the code diverged, amended
- [ ] `docs/README.md`: the map-view.md row's status
- [ ] journal entry
- [ ] delete this file (Eugene)

Browser:
- [ ] scene → map: nodes of the scene glide to their ring and leaf places, designs crossfade where the scene's differ, twins' second boxes slide out after the swap
- [ ] map → navigate → leave to the new focus's scene: markers depart, landmarks settle, the scene's own transitions still work afterwards; a node without a scene gets one made of its landmarks
- [ ] back to the entered scene; Escape
- [ ] measure the move phase on an equation-heavy map
- [ ] theme mode `scene`: re-focusing between nodes whose scenes have different themes crossfades

## After v1, separately

- [ ] unify `grow-arrange.ts` `pickEntrantDesign` and `scene-factory-utils.ts` on `default-design.ts` (changes existing behaviour; own verification)

## Notes

(failed checks, surprises, and decisions taken during implementation go here, dated)

2026-09-23, step 5: arriving markers stayed at their parent's position and snapped right on the next drag.
Cause: `cy.add({ position })` keeps the given object as the element's live position, so the layout Map's objects were aliased into the instance; `node.position(origin)` in the arrive phase then overwrote the layout's target through the alias and the animation ran from the parent to the parent.
Fix: the render hands Cytoscape copies, and the animator animates to copies.
Rule worth keeping: the layout is the feature's data; never pass its objects into the instance.

2026-09-23, step 5: landmarks could sit outside the viewport with no way to bring them in.
Wheel zoom had never worked: Cytoscape's wheel handler requires user panning to be enabled, and it was off to pin the focus.
Decision: the zoom is derived, not chosen. The map fits itself symmetrically about the focus (`fit.ts`), on entry, during the move phase, after a drag or scale settles, and on resize; `userZoomingEnabled` off; the `zoom` field dropped from the record.

2026-09-24, step 5: the re-focus animation ran at a low frame rate with flicker, far below the scene morph.
Analysis against `shared-core-animator.ts`: a re-focus is a strict subset of a scene transition (departing, shared move-only, arriving, viewport; no design change, so no crossfade or ghosts), which the scene does with one rAF loop and one batch per frame, positions interpolated in screen space with the zoom back-solved, size tweened only where scale changes, and shared elements persisting.
Mine ran one Cytoscape animation per element (unbatched, size tweened on every survivor, quadratic re-styling against the per-box rules), animated zoom and positions separately (bent paths), and replaced every element at a swap, which existed only because element ids were addresses.
Fix: opaque element ids (`box-N`, `line-N`) with address tables in the state, survivors keep their elements, leavers removed and arrivals added, role changers restyled after the move; the three phases run on the scene's driver.
`boxesOf(nodeId)` now returns element ids, which is what a hosted feature needs.

2026-09-24, step 5: still sluggish with many equation markers, worst while they shrank.
Cause: a node's size is part of its texture-cache key, so tweening width and height invalidates the cache and re-rasterises the SVG face every frame for every leaver and arrival; equations are large SVGs. The scene never tweens size for departures or arrivals, only position and opacity.
Fix: depart and arrive are position and opacity only (slide into, slide out of, drawn beneath the parent); size tweens remain for role changers in the move phase. Spec §5.2 amended.
Left unexplained with certainty: why shrinking felt worse than growing; texture atlas retirement at large element sizes is the best candidate.

2026-09-24, layout: the default map read as rings around each landmark, markers filling all 360 degrees including back toward the focus.
Decision (spec §3 Default lengths, §6.5 rule 3): default line length is border to border, each box's clearance along the line from its rendered size plus a gap; a marker's gap falls with its angle to the trunk (1 ahead, 0.4 behind, cosine-smooth); marker bearings are seeded in a 120-degree sector ahead of the landmark.
`landmarkLength` and `markerLength` now mean the gap, not the centre distance; defaults 200 and 80.
Base styles are generated before layout, since the layout needs sizes; a scale change re-lays the map.
Two constants kept out of settings for now: the 0.4 inward fraction (geometry.ts) and the 60-degree sector half-width (seeding.ts).
Later the same day both became settings (`markerReachBehind`, `markerSector`), with `landmarkGap`, `markerGap` and `horizontalStretch`: the reset ring had landmarks touching at north and south, and the map should use a landscape screen. Separation grows a ring or a fan by one factor; the stretch is a drawn-frame x multiplier with bearings kept true underneath (spec §3 Separation, The drawn frame).

2026-09-24, seeding: rules 1 and 2 (bearings from scene positions) dropped.
The map depends on the graph and the settings only; the map is the basis a study scene is made from, not the reverse. Spec §6.5 amended; the Reset menu's "Directions too" now always yields the geometric default.

2026-09-24, seeding: after a reset five landmarks came out at four right angles and a fifth splitting one, because seeding was one edge at a time into the widest gap.
Now the unassigned lines of a parent are distributed together, evenly into the existing gaps in proportion to width (`distributeBearings`); one edge added later still takes the widest gap. The two widest-gap functions went.

2026-09-24, drag: dragging one landmark moved every other landmark, because the ring's separation factor was recomputed inside the live drag; and a dragged box was counted in pairs it could not move to clear.
Now the separation factors are part of the layout, frozen for a drag, and computed over default-length boxes only.

2026-09-24, scaling: W and M grew the boxes and the distances alike, so the picture did not change.
Now geometry uses nominal sizes (the settings' scales), never a map's group scales or a box's own; scaling moves nothing.

2026-09-24, branches overlapping: a fourth layout pass (`fitBranchesInWedges`) keeps each branch between the bisectors to its neighbours by pushing the landmark outward along its own line until its fan fits; per landmark, capped at a 5-degree half-wedge; frozen for a drag like the rest.

2026-09-26, the layout model replaced (spec §3 The frame, Default positions, Derived scales, Manual scales).
The derived zoom, derived lengths and the separation and wedge passes had grown into three interacting mechanisms; a map of a node whose edges were seeded as a fan elsewhere blew up in size.
Now the frame is fixed by the screen: zoom is `map.baseZoom`, landmarks sit on a ring that is a fraction of the surface's height (stretched into an ellipse), markers on a leaf proportional to their landmark, and what adapts to crowding is size, lowered from the defaults until neighbours clear by gaps that are fractions of box size, no lower than `map.scaleFloor`.
The author's scales are multipliers on the derived ones; + - F act on the zoom for the session; drag still writes a bearing and a length.
Seeding is around the whole circle everywhere; the sector rule went (it crowded a node's landmarks when it became the focus).
Gone: `landmarkLength`, `markerLength`, `markerSector`, `fit.ts` (Eugene to delete the file).

2026-09-26, the leaf measured from the edge, not the centre.
A leaf of radius `leafRadius` half-diagonals was a circle through the landmark's corners, and a text box is three times wider than tall: markers ahead sat on the box's end, markers above floated, markers behind (0.4 of the radius) sat inside the box.
Now a marker sits edge to edge with its landmark along its own ray plus a clearance of `map.leafClearance` marker half-diagonals, `markerReachBehind` of that behind; the leaf is the box's outline pushed out.
`map.leafRadius` renamed to `map.leafClearance` because the meaning changed and a stored 1.5 would have been read as a clearance; the map settings are unreleased, so nothing in users' browsers carries the old key.

2026-09-26, landmarks no longer pay for leaves.
SuperNode's map, twenty landmarks four of them with fans, sat at the floor with landmarkGap 0.15: the leaf-to-leaf check on the landmark scale, with leaves as circles at nominal marker size, needed 512 px between neighbours that were 115 px apart, and every bare landmark inherited the result.
Now the landmark scale comes from landmark boxes only, and each fan's scale is lowered until its leaf fits the room to its ring neighbours (to a bare neighbour's box, to the midpoint toward a neighbour with a fan).
The leaf follows the fan scale, which the old two-pass derivation could not do (positions at nominal size, then a ratio), so the fan scale is found by bisection over placements; `circlePairScale` gone.
Kept as is: the leaf as a circle for the room check, a generous bound for a wide box with sparse markers; replacing it with marker-versus-neighbour box checks is the next refinement if the fans come out too small.

2026-09-27, the leaf clearance in landmark heights; lines weighted for their boxes.
The clearance had been a multiple of the marker's half-diagonal, and markers are often dots: twice a dot is no visible air. Now `map.leafClearance` is a fraction of the landmark's height (default 0.5).
Lines were dimmed toward markers (`map.markerLineOpacity`) to stop them outweighing the small boxes; the true correction is weight, so every line's width and arrow scale are now its type's times its box's rendered scale to `map.lineScalePower` (default 0.5, sublinear because fully proportional lines into a 0.2 marker vanish). Inline per line, since a data-mapped rule cannot multiply a base that differs by edge type; bases read from the generated rules once per map. Role changers' lines tween weight during move; the opacity rule, its tween and the line's `depth` data went with it.

2026-09-27, the sector budget (Eugene's model), replacing the pairwise checks.
The room was where crowding bites, tangentially along the ring, and the pairwise checks approximated it with circles and a midpoint rule that shrank fans for a circle never drawn. Now each landmark's sector arc is shared between box, side markers, clearances and air by weights (`map.arc*Share`), each item taking its share or its uncrowded size; that yields the landmark's scale, its fan's scale and its leaf's side clearance in closed form, per landmark. The leaf is an egg: ahead `leafClearance` of the height, sides from the budget, behind by the reach.
Per-landmark scales are direction-dependent (a wide box pointing up spends its width, sideways its height); one scale per map as the minimum over the ring is a one-line alternative if the ring reads unevenly. `landmarkGap`, `deriveLandmarkScale`, `leafFitsRoom`, `leafRadius`, `ringNeighbours` gone; `DerivedScales` is now per landmark and carries the side clearances so a drag reshapes nothing.
Seeding fix the same day: with no spokes the circle has no ends, so N newcomers go at 360k/N, not 360k/(N+1), which had left a double gap across east.
Later the same day: the leaf became a true ellipse centred on the landmark (the outline-offset leaf read as a rectangle), with the shadow measure replaced by the pitch (it shrank diagonal landmarks for collisions that cannot happen), and its shape a setting: side semi-axis from the budget, ahead = side × `map.leafAspect`, behind by the reach, the whole enlarged until the box's corners keep the side clearance. `leafClearance` now only names the roomy-sector side clearance. Vocabulary: fan, leaf added to §2.
`markerReachBehind` gone: with the ellipse it shortened the back axis to 0.64 of the side one, the back corners then drove the corner factor and the front inflated to 2× while the back hugged the box (Interpretations of QM: Copenhagen far out, Solvay on the box). The leaf is symmetric.
Leaves capped to the surface at the base zoom (rayToViewport); balloon-on-click extended to any box below `map.previewScale` (renamed from `markerPreviewScale`), a shrunk landmark included.
W/M settled: leaves follow rendered sizes (W carries the fan out, M moves markers by their own depth), the ring never moves; `,` `.` added as the scene's tighten/spread on the selection: a landmark's leaf multiplier (`boxes[address].leaf`, additive record field), a marker's absolute length. `#applyScales` now moves every box, since any scale change can move a leaf.

2026-09-28, one bearing per end, coupled within an allowance (Eugene's proposal; spec I2, I6, I8, §6.1, §6.5, §9).
A triangle A, B, C showed the one-ended seeding planting A–C straight into the direction B–C already used at C: a lone newcomer at a box takes the continuation of the trunk, and the third edge of every triangle then collides at its far end.
Now `Edge.bearingBack` (additive) is the target's end; a line is drawn at the angle of the end it leaves from; the two ends may diverge by `map.twinAllowance` (30); a drag writes its end and drags the partner along only at the allowance; exactly one line turns on a re-focus, the one between the two focuses, by at most the allowance.
Seeding is per end: a coupled end slides within the allowance to the widest gap at its box; free ends take even slots at their parent, with the phase of the slot set and the slot assignment chosen for the far ends' clearance (exhaustive up to six, greedy beyond), the far end set to the exact reverse, so seeding stays the only writer besides a drag.
An Untangle command was considered and dropped: the seeding is meant to place right the first time; old bearings are cleared by Reset every map and every direction, which now clears both ends.
Same day, two corrections from the first test: the phase shift of a slot set is allowed only at a spoke-less box (with spokes it halved the margin to the trunk and put Wave Function on Quantum Mechanics' trunk); the sector budget is per half-sector, scales from the narrower half, clearance per side, the leaf two half-ellipses sharing the axis (Founders and Wave Function on QM's map overlapped because the symmetric leaf averaged a narrow gap with a wide one).

2026-10-02, landmark deviation (Eugene's proposal; spec §3 Drawn directions, I8, §9, §10).
A marker dragged close to its landmark's trunk is legitimate on that map and makes two landmarks coincide on the neighbour's; no seeding rule can prevent an intended placement. Stored directions are now targets: `relaxRing` gives each landmark the half-sector the budget needs for `map.landmarkFloor` (0.6, new; `map.scaleFloor` is the markers' now), each within `map.landmarkDeviation` (45°), order kept; derived with crowding, frozen for a drag, never stored; a dragged landmark's deviation is spent. First written as a pairwise push-apart, which left the third of three coincident landmarks behind (a push sent one past the next neighbour); replaced the same day by blocks: the ring cut at its widest gap, touching landmarks merged into a block spaced by needs and centred to cancel displacements, caps applied last.

2026-10-02, parallel edges (spec §2 line, §3 map tree, §6.1).
The walk kept the first edge it met between a pair and dropped the rest. Now one box, one line per edge, bundled by `curve-style: bezier` on every map line (a lone bezier line is straight); lines keyed by address plus edge id (`LineKey`) in the element tables and the animator; the backtrack rule is by node, not edge, or a parallel edge would make a parent its child's marker. The edges of a pair share their ends as copies, orientation-aware (`siblingEnds`), written by seeding (`Pairs.share`, with `reconcile` for pre-existing pairs) and by a drag; a leading-edge rule was declined because deleting it would re-seed the pair and move the box.

2026-10-02, bundle spread: Cytoscape's `control-point-step-size` is a fixed 40 px, so two parallel lines between boxes dragged close looped out around them; now each line's step is 12% of its drawn length, between 2 and 40, set with the weight and refreshed on a drag's release. The budget still treats a bundle as one direction; accepted.

2026-10-02, clicks (spec §5.3): single click selects everywhere; right-click balloons a small box, else the map menu; double-click re-focuses a landmark, balloons a marker; Escape collapses a balloon before it leaves the map (both handlers used to fire at once). The map's clicks are wired together in ContextMenu; the tooltip component keeps hover and tap-to-collapse. Group drag on the map (the grabbed box's turn and length ratio applied to every selected box about its own parent, descendants excluded) was discussed and left for Eugene to decide after more use. The trunk may now turn by allowance plus deviation on a re-focus; everything else still does not.
