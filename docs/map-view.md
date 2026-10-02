# Map View (user-facing name: Helicopter view)

> Status: Draft, normative. Agreed in design on 2026-09-23; becomes Current when the v1 scope in §11 ships.
> Last reviewed: 2026-09-23
> Authority: Canonical for the map view: its vocabulary, concepts, invariants, behaviour, data model, architecture, and the decisions behind them. During implementation, where code and this document disagree, this document wins until it is amended in the same session.
> Related: [Product vision](knogra-vision.md), [Architecture](architecture.md), [Layout architecture](layout-architecture.md), [Scene transitions](scene-transitions.md), [Workspace architecture](workspace-architecture.md), [Node placement](node-placement.md)

## 1. Purpose

The vision document describes travelling the graph as "a flashlight over a large landscape".
A flashlight orients you only if the landscape exists: what you walked away from must still be behind you when you look back.
The current model has no landscape.
It has independent per-scene layouts that share nodes, and a morph that tweens between them.
The morph gives continuity only while two layouts agree about where things are, and any serious customisation of a scene destroys that agreement.
The author then maintains agreement by hand, which is tedious, or gives up, and transitions become disorienting.

The map view is the landscape.
It is one derived, navigable view per node in which every relationship has a fixed direction across the whole graph.
Moving from one map to the next never rotates anything: distances and sizes change, directions do not.
Scenes as they exist today are unchanged and remain the place for free, question-driven layouts; in this document they are called study scenes only where the contrast matters.

Naming follows the layout-domain rule (layout-architecture.md §1.1): the UI names the effect, the code names the mechanism.
The UI says Helicopter view.
Code, settings, storage and this document say map view.

## 2. Vocabulary

The map reuses the graph but draws it differently, so several of its terms sit next to existing terms that mean something else.
Each entry below says what the term is and what it must not be confused with.
Use these words and no others in code, comments, settings and UI copy for this feature.

    focus       The node a map is centred on; "the map of N" means the map focused on N.
                Not the anchor, which is the graph's designated starting node (Node.isAnchor).
                Not a scene's central node, though a map entered from a scene is focused on that scene's central node.

    box         A drawn element representing a node, identified by its address from the focus.
                Not a node: one node may have several boxes on one map.

    line        A drawn element joining a box to its parent box, representing one edge between the two nodes.
                Not an edge: one edge may have several lines on one map, and a box joined to its parent by several edges has several lines, drawn as a bundle (§3).

    address     The sequence of node ids from the focus to a box, written joined by `/`, for example `A/B/C`.
                A box's address is its identity; a line's identity is its child box's address.
                Not a path: a Path is the existing feature, a saved sequence of scenes. Neither "path" nor "route" is used for the map.

    map tree    The tree of all boxes and lines a map shows.
                The map walks the graph from the focus to build it.
                Never called unfolding, expansion or fold: fold and unfold are the study-scene subtree feature, and expand is reserved for pulling a node's children into a scene.

    twin        A box whose node has another box on the same map, reached by a different address.
                An ordinary box, not a reference to the other one.

    landmark    A depth-1 box: full size, readable, and the only kind of box navigation can target.
                A role of the box, not of the node: a node can be a landmark and, as a twin, a marker on the same map.

    marker      A depth-2 box: the node's own design at marker scale, a miniature of itself, marking direction and existence.
                Not a navigation target; shows its title on hover and balloons on right-click or double-click (§5.3).

    fan         All the markers of one landmark.

    leaf        The ellipse around a landmark on which its fan sits, its major axis on the focus-to-landmark line (§3).
                The markers' counterpart of the ring: the ring is the focus's, a leaf is a landmark's.

    bearing     The direction of a box as seen from its parent box: the compass angle of the line at the parent.
                A property of the edge, one number per end for the whole graph: the source's end and the target's end, coupled within the allowance (I2).
                Not the edge's direction, which means source to target and plays no part in the map.

    allowance   How far the two ends of an edge may diverge from exact opposition, in degrees; `map.twinAllowance`, 0 makes them rigid.

    length      The distance along a line from the parent box to the box.
                A property of the line, per map.

    scale       The size of a box, in the sense of the existing per-scene node scale.
                A property of the box, per map.

    depth       Hops from the focus along the map tree: 0, 1 or 2.
                The same count Grow & Arrange calls "degree" in its menu; not the degree of a node in the graph-theory sense.

    map view    The feature, and one instance of it: the map of one focus.
                Helicopter view in the UI only.

## 3. Concepts

The map tree.
The map of a focus is the graph walked into a tree of addresses: from the focus, follow every edge in either direction, never stepping straight back to the node just come from, to a depth of two.
Edge direction (source, target) plays no part in the walk; it is only drawn.
Parallel edges, several between the same two nodes, give one box and one line per edge (decided 2026-10-02): an address is a node path, so the box exists once, and every edge joins it, each line in its own type's colour and arrow, drawn as a bundle of curves by the renderer as a scene draws them; before, the walk kept whichever edge it met first and the rest were invisible.
The bundle's spread is a fraction of the line's drawn length, capped at the renderer's default, so two lines joining boxes a short way apart do not loop out around them; the budget treats the bundle as one direction, which is right while the spread is small against the sector and accepted otherwise.
The backtrack rule says "node", not "edge", for the same reason: a second edge back to the parent would otherwise make the parent a marker of its own child.
Every node has exactly one map, and it always exists, because it is derived.

Twins and repeated lines.
In a triangle A, B, C with edges AB, AC, BC, the map of A holds the boxes `A/B`, `A/C`, `A/B/C` and `A/C/B`: B and C each have two boxes, and the edge BC has two lines.
The two lines leave from the two ends of BC and point opposite ways within the allowance (I2): the C twin hangs off B in B's direction of C, the B twin hangs off C in C's direction of B.
With the allowance at 0 the pair is exactly parallel; at 30 degrees it is nearly so, and still reads as one relationship whose two lines point at each other's box.
Twins may additionally be joined by a twin link, a dotted line between the two boxes (Cytoscape `line-style: dotted`), switched on by setting.
A twin link is neither a box nor a line: it has no bearing, no length and no parent, takes no part in geometry, drag or address rewriting, and is regenerated from the map tree on every render.
The element model carries this kind from v1 (§7.2); rendering twin links is v2.

Depth rule.
The focus and the landmarks are readable: full size, equations and images legible.
Markers are miniatures: the same design at marker scale, marking direction and existence, not content.
Because a marker is the node drawn small rather than a substitute glyph, marker to landmark and back is a pure size change, which is what keeps the transition free of crossfades.
A line is drawn at a weight for its box: its stroke width and arrow scale are its edge type's multiplied by the box's rendered scale to the power `map.lineScalePower`, so lines into markers are thin and small-arrowed as lines into landmarks are lighter than on a scene when the landmarks are shrunk, and `W`, `M`, `<`, `>` carry the lines with the boxes.
The power is below 1 because line weight is perceived sublinearly; fully proportional lines into a marker at 0.2 vanish.
Dimming marker lines was tried first (decided against 2026-09-27): a heavy pale line is still heavy, and lightness was compensating for the wrong thing.
Nothing beyond depth 2 is shown.

The frame.
The map is sized by the screen, and the zoom is `map.baseZoom`, 1 by default: a node is drawn at the pixel size its design specifies, the size it has in a study scene at zoom 1, so the focus is always the same readable size.
The map never changes the zoom on its own; `+` and `-` change it for the session and `F` puts it back.
Bearings and lengths live in a true frame; the map is drawn with x multiplied by `map.horizontalStretch` about the focus, the same factor in every map, so directions stay consistent across re-focuses and opposite stays opposite; a line's drawn angle is not its stored angle, and nothing depends on the drawn angle but consistency.
A drag converts back to the true frame before writing a bearing.

Drawn directions (decided 2026-10-02).
A landmark's stored direction is a target, not a pixel: the map draws it as close to the stored direction as the ring's readability allows, moved by at most `map.landmarkDeviation` degrees, and never stores the difference.
The reason is that a direction can be right where it was set and unreadable elsewhere: a marker placed near its landmark's trunk is a legitimate choice on that map, and the same two edges are landmarks on the neighbour's map, where no scale makes them legible side by side; no seeding rule prevents what an author did on purpose.
Each landmark needs a half-sector at which the budget below would give it the readable floor, `map.landmarkFloor`: its pitch along the tangent at that floor, over the box's share, through the arc per degree at its radius.
The ring is cut at its widest gap and read as a line; landmarks that would sit closer than their needs allow form a block, spaced within by their needs and placed so that its members' displacements cancel, and blocks that then touch merge, so three landmarks on one direction spread into three places centred on where they were; order around the focus is kept by construction, each displacement is capped last, and a ring that is genuinely full saturates its caps and the budget shrinks what is left.
A pairwise relaxation was tried first (2026-10-02) and left the third of three coincident landmarks behind: pushing a pair apart by half the shortfall each sent one of them past the next neighbour, which the pair never looked at.
A landmark's fan moves with it as a whole; the fan's own angles are untouched, and when the landmark becomes the focus its fan becomes the ring at the stored directions.
Markers are not deviated: a crowded fan is the scale's problem, a crowded ring is readability's.
A dragged landmark's drawn direction becomes its stored one, so the drag accepts what it sees and that box's deviation is spent; its neighbours re-relax on the next presentation.
Deviation is derived with crowding, frozen during a drag, and depends on the screen through the arc per degree, so the same map on two screens can differ slightly while the stored directions do not.
A drawn-time deviation was set aside on 2026-09-28 as a substitute for fixing the stored directions; it is accepted here as a complement to them, bounded, and for landmarks only.

Default positions (decided 2026-09-26, replacing derived lengths and a derived zoom).
Every landmark's centre lies on the ring: the circle whose radius is `map.ringRadius` of half the surface's height, stretched into an ellipse by the horizontal stretch; a landmark's position is the stretched image of the circle's point at its drawn direction, so evenly seeded bearings stay evenly spaced along the ellipse.
Every marker's near edge lies on its landmark's leaf: an ellipse centred on the landmark with its major axis on the focus-to-landmark line.
Its semi-axis across the line is, per side, the box's half-extent across it plus the clearance the sector budget below allowed on that side, so a near neighbour squeezes the leaf on its side only and the room on the other side is used: the leaf is two half-ellipses sharing the axis (decided 2026-09-28; a single symmetric semi-axis from the average of the two sides let a leaf reach into a narrow side by what the wide side had paid for, and two leaves overlapped on a ring whose gaps were uneven).
Its semi-axis along the line is the larger of the two across times `map.leafAspect`, the leaf's shape being a setting as the ring's stretch is.
Each half is then enlarged, keeping its shape, until the box's corners on its side keep that side's clearance, since an ellipse through the half-extents passes close to a wide box's corners, and the same rule keeps a wide sideways box inside a leaf whose aspect would otherwise cut through its ends; the shared axis takes the larger enlargement.
The leaf is symmetric front and back (decided 2026-09-27): an egg shortened toward the focus, inherited from the circular leaf where it kept markers off the trunk, put the box's back corners against a short axis, and the corner rule then inflated the whole leaf, sending the markers ahead far out while those behind hugged the box.
Last, each leaf's semi-axis along the line is capped so that the leaf and its farthest marker stay inside the surface at the base zoom, never shorter than the box's own half-extent plus the clearance: a landmark near the top or bottom of the ring has a long arc and a leaf to match, and the room ahead of it is the one thing the arc does not know.
The clearance is a fraction of the landmark, not of the marker, because markers are often dots and twice a dot is no visible air.
Two shapes were tried and rejected (2026-09-26/27): a circle around the centre, whose radius either cut a wide box's ends or floated its sides, and the box's outline pushed out by the clearance, which is exact but reads as a rectangle around a wide box.
Distances are measured in the drawn frame, where the boxes are, and converted to a true length for storage.
The leaf's size follows the landmark's rendered size, so a crowded map's leaves shrink with its landmarks and an enlarged landmark's leaf grows with it (Manual scales below).
A length the author dragged is the centre-to-centre distance and replaces the ring or leaf position for that box.

Derived scales: the sector budget (decided 2026-09-27, replacing pairwise clearance checks).
Distances are fixed by the frame; what adapts to crowding is size, and the measure of crowding is a landmark's sector: half the angular gap to each ring neighbour, so evenly seeded bearings give equal sectors and a drag that crowds a pair narrows both.
The two halves of a sector differ whenever the neighbours are unevenly spaced, which they are whenever a node's edges were seeded on several maps, and the budget is taken per half: the box and the fan, symmetric about the landmark, are sized from the narrower half as if the sector were twice it; the clearance is per side.
The sector cuts an arc from the ring, measured in the drawn frame at the landmark's radius, and the arc is spent along the ring's tangent: the landmark's box, a marker on each side of it, the clearance between box and marker on each side, and breathing space toward the neighbouring branch on each side.
The four have weights, `map.arcLandmarkShare`, `map.arcMarkerShare`, `map.arcClearanceShare`, `map.arcBreathingShare`, the last three counted twice and the whole normalised; each of the first three then takes its share of the arc or its uncrowded size, whichever is smaller, and what is left over is air.
A box's size along the tangent is its pitch: the offset along the tangent at which a copy of the box clears it, its width when it points up or down, its height when it points sideways, between the two on a diagonal.
It is not the box's shadow on the tangent (tried first, 2026-09-27): boxes are axis-aligned and clear on either axis, so along a diagonal they slide past each other long before their shadows separate, and the shadow shrank every diagonal landmark for a collision that could not happen.
So on a crowded ring landmarks differ in scale by direction, a wide box pointing up needing two to three times the arc of the same box pointing sideways; the horizontal stretch offsets part of this, since the stretched ring has more arc per degree at the top than at the sides.
That gives, per landmark: its scale, its fan's marker scale from `map.markerScale` of it, and its leaf's clearance on each side, at most `map.leafClearance` of its height.
The fan's scale is lowered further if every pair of markers that are neighbours in angle around the landmark would not clear by `map.markerGap`; the leaf shrinks with the markers, so this is found by bisection between a scale that fits and one that does not, the fan placed afresh at each scale tried.
Two markers clear when either their horizontal distance exceeds their half-widths plus the gap, or their vertical distance exceeds their half-heights plus the gap; the gap is a fraction of the two boxes' half-diagonals at their scale, averaged, so it shrinks with them.
Neither scale goes below `map.scaleFloor` of its default: past that, overlap is accepted rather than boxes vanishing, and two neighbours that share a bearing will overlap at the floor, which is the truthful outcome and a drag's to fix.
Landmarks never shrink to make room for markers beyond their own share: they are the readable tier and markers are miniatures (decided 2026-09-26, after a hub of twenty landmarks was driven to the floor by four fans under the earlier leaf-to-leaf check).
Derived values are computed when a map is presented, re-focused, reset or resized, and frozen for the duration of a drag, so dragging one box moves its own subtree and the other lines of its edge and nothing else.

Manual scales.
The author's scales are multipliers on the derived ones, per map for all landmarks or all markers (`W`, `M`) and per box (`<`, `>`), so they survive a change in crowding: "bigger than the map would make it" stays true when the map's own answer changes.
Manual scales change the boxes and the leaves around them, never the ring: a leaf is measured from its landmark's rendered edge, and a marker keeps its near edge on the leaf at its rendered size, so W carries a fan outward with the box and M moves each marker out by its own extra depth (decided 2026-09-27; before, the leaf followed the derived size and W grew a box into its markers).
The clearance stays the budget's, so W moves the box's edge and does not also inflate the air.
A landmark's leaf also has its own multiplier, `,` and `.` (§5.3), applied after the surface cap, so a fan may be pushed past the surface as the scene's spread may, but never inside its box.

## 4. Invariants

These are normative.
An implementation that violates one is wrong, whatever else it does.

I1. Positions are derived, never stored.
A box's position is its parent box's position plus its line's length along its line's bearing.
The focus box is at the origin.

I2. One bearing per end of an edge, the two ends coupled.
`bearing` means "the target is at this angle from the source"; `bearingBack` means "the source is at this angle from the target".
A line is drawn at the angle of the end it leaves from, on every map, at every depth.
The two ends may differ from exact opposition by at most the allowance, `map.twinAllowance`; a `bearingBack` that is absent reads as the exact reverse of `bearing`, and the reverse likewise, until it is seeded (§6.5).
There is no per-map or per-line bearing: the same end of the same edge is drawn at the same angle wherever it appears.
Decided 2026-09-28, replacing one number per edge: one-ended seeding planted the third edge of every triangle straight into a direction already taken at its far end, and the two ends of an edge had no freedom to part; a bounded divergence gives each box's fan its own room while keeping the transition trackable (I8).

I3. Length and scale are per map.
Two lines of one edge on the same map may have different lengths; two boxes of one node may have different scales.
A box in the map of A and the corresponding box in the map of B are different boxes with independent scale, and likewise their lines.

I4. Membership is derived.
A map contains exactly the boxes and lines the walk produces.
There is no include, exclude, fold or hide.

I5. Design is the node's.
A box is drawn with its node's default design (§6.3).
The map has no per-box design.

I6. Dragging a box writes two things.
The new angle of the box from its parent box becomes the bearing of the end the line leaves from, globally, so every map that draws that end follows on its next render.
The other end follows only as far as the allowance requires: it stays where it is until the divergence would exceed the allowance, then moves with the dragged end, keeping the divergence at the allowance.
The new distance becomes the length of the line, locally.
Everything else on the map that depends on either number follows during the drag (§5.3).

I7. Re-focusing is address rewriting.
Going from the map of A to the map of its neighbour B, every box of A's map maps to a box of B's map by rewriting its address: `A/B/x` becomes `B/x`, `A/x` becomes `B/A/x` for x other than B, and `A` becomes `B/A`.
A box whose rewritten address is not a valid address in B's map (too deep, or a step back along the edge just walked) leaves; boxes of B's map with no preimage arrive.

I8. The continuity guarantee.
After clicking any box, the box you came from is within the allowance plus the landmark deviation of the reversed direction of the edge you clicked along, and nothing else on the map has rotated.
Exactly one line can turn on a re-focus, the one between the old focus and the new, by the divergence of its two ends and the deviation each map drew it with (§3 Drawn directions): on the first map it leaves the old focus at that end's angle, on the second it leaves the new focus at the other end's; every other line leaves from the same end on both maps and keeps its angle, a landmark's fan moving with the landmark as a whole.
This follows from I2 and I7 and is the property the whole design exists to provide; at allowance 0 and deviation 0 it is the exact statement it was before 2026-09-28.

## 5. Behaviour

### 5.1 Entering

From a scene, the canvas menu item Helicopter view opens the map focused on the scene's central node; inside the map, the menu offers Back to scene.
No entry shortcut in v1: the scene's keyboard namespace is nearly exhausted (layout-architecture.md §1.1), and an entry key waits for the leader-key redesign of the keyboard handler, a separate task already on the roadmap.
Inside the map the keyboard is the map's own, since the scene's bindings never run while it is shown, and keys are chosen to read as their scene counterparts do:

    W / Shift+W     all landmarks enlarge / shrink
    M / Shift+M     all markers enlarge / shrink
    , / .           the selected boxes in / out: a landmark's whole fan, a marker along its own ray
    < / >           the selected boxes enlarge / shrink
    G               re-focus on the selected landmark
    [ / ]           previous / next focus
    F               back to the base frame: base zoom, focus at the centre
    = / -           zoom in / out about the focus, for the session
    Escape          collapse an open balloon; otherwise back to the scene
On entry the map instance is shown over the scene instance (§7) with a crossfade in v1 and a handoff morph in v2 (§8).

### 5.2 Navigating

Navigation is one degree at a time: double-clicking a landmark re-focuses the map on its node, as double-clicking navigates in a scene; a single click selects it, for the scale keys.
Markers are not navigation targets.
A jump of two hops, if ever wanted, is two transitions in sequence, not a new mechanism.

With a single hop, every box's fate is fixed by the address rewriting of I7, and the transition is that rewriting made visible.
Take the map of A with landmarks B, C, D and markers under each, and click B.
A becomes `B/A`, a landmark within the allowance and the deviation of the reversed bearing.
`A/B` becomes the focus.
`A/C` and `A/D` become `B/A/C` and `B/A/D`, markers under A.
`A/B/Bx` become `B/Bx`, landmarks.
`A/C/Cx` and `A/D/Dx` have no valid address in B's map and leave.
`B/Bx/Bxx` arrive.
Twins are what make this a pure rewriting: if C is also B's neighbour, A's map has both the landmark `A/C` and the marker `A/B/C`, and in B's map they swap roles, the marker under B growing into the landmark `B/C` and the landmark shrinking into the marker `B/A/C`.
A leaving marker whose node is also a neighbour of B dies under its old parent and is born as a landmark under B; the address model says so and the transition does not special-case it.

The transition runs in three phases, the same skeleton as a scene transition (scene-transitions.md: departure, shared movement, arrival) with one deliberate difference: departure goes inward, into the parent, never outward from the centre.
It is a strict subset of the scene transition: departing, shared move-only, arriving and the viewport, with no design change, so survivors keep their elements throughout as shared nodes do in a scene morph, and the phases run on the same driver, one animation-frame loop with one batch per frame, rendered positions interpolated on straight lines with the zoom back-solved.
Size is tweened only for role changers, never for leavers or arrivals: a size change invalidates the renderer's element texture cache and re-rasterises the node's SVG face every frame, which for equation nodes dominates the frame; position and opacity leave the cache intact.
The scene's departure and arrival make the same choice, and so a marker slides rather than shrinks or grows.

    depart    leaving markers slide into their parent boxes and fade, drawn beneath them
    move      every surviving box moves in one movement: the new focus to the viewport centre, every length to the target map's values, and the few boxes that change role rescale, markers to landmarks and landmarks to markers, their lines' weights tweened with them
    arrive    new markers appear beneath their parents at their final size and slide out, fading in

The phases are sequential; each has its own duration setting (§6.4), as scene transitions have, because tuning by eye through those knobs is how the scene transition was made and how this one will be.
Because bearings are shared, no line turns during move; boxes slide along rays and rescale.
Twin links, when enabled, fade out in depart and fade in in arrive; they are never tweened.
When the theme follows the focus's scene (§5.6) and the new focus's theme differs, the background and styles crossfade during move, as the scene morph crossfades to its target theme.

The focus is always at the centre of the viewport, and the author does not pan.
The zoom is `map.baseZoom` on entry, after a re-focus and on `F`, and the map never changes it on its own; `+` and `-` step it about the focus for the session and it is never stored.
Cytoscape refuses wheel and pinch zoom while user panning is off, which is why the keys exist.
The map is sized by the screen (§3 The frame): the ring is a fraction of the surface's height, so a resize lays the map out again.

The map keeps its own back and forward history of focuses for the session.
Scene paths (the Path feature) do not record map visits in v1.

### 5.3 Adjusting

In Edit mode the author may drag a landmark or a marker and change a box's scale.
The focus box is not draggable: it has no parent line, so a drag would have nothing to write.
In View mode the map is navigable and nothing writes.

Dragging is live.
On every pointer move the map takes the dragged box's current angle from its parent as the provisional bearing of the end its line leaves from and its current distance as the provisional length, then re-derives positions (I1) for everything affected: the dragged box's subtree moves rigidly with it, and a line of the other end of the same edge on this map pivots about its own parent box only once the allowance is reached, keeping its own length, with its subtree following.
A dragged landmark's drawn direction is its stored direction from the first pixel: whatever deviation it was drawn with is spent (§3 Drawn directions), and the other landmarks keep the deviations they were presented with until the next presentation.
In the triangle, dragging C' turns B' about C only after C' has turned by the allowance; at allowance 0, B' orbits C from the first pixel.
A landmark's markers move with it but keep their bearings, which are the edges' and global: a fan seeded pointing north-east still points north-east after its landmark is dragged south.
Nothing is persisted until release; on release the bearing is written to the edge and the length to the line's record.
Other maps are not on screen and simply re-derive from the stored bearing when next opened.

Scale uses the selection-scoped Enlarge / Shrink vocabulary and, in the map container, its keys; a selected box, landmark or marker, gets its own scale.
All landmarks or all markers of a map can be enlarged or shrunk together from the map menu, which changes the map's default for that role (`landmarkScale`, `markerScale` on the record); a box with its own scale keeps it.
Scaling never moves the ring (§3 Manual scales); the leaves follow the boxes' rendered edges, so an enlarged landmark carries its fan outward rather than growing into it, and overlaps between neighbours that follow are the author's to accept or to fix.
Distance is the scene's `,` and `.` (tighten / spread), on the selection: a selected landmark's whole fan moves in or out, its leaf multiplied (`leaf` on its box record) so the change survives a change in crowding; a selected marker moves along its own ray, its `length` written as a drag writes it, so a moved marker is a hand-placed marker; the focus has nothing to move.
Drag, scale and distance are the only layout gestures the map has; there is no auto-layout, arrange or rotate in v1.

Resetting, from the map menu, Edit mode only.
Distances and sizes: the map's record is deleted and the map is shown from defaults; nothing outside this map changes.
Directions too: in addition, the bearing of every edge drawn on this map is cleared and seeded afresh by §6.5.
Bearings are global, so this reaches every other map those edges appear on, and the menu says so.
Every map and every direction: all map records and all bearings in the workspace, behind a confirmation; the clean slate for judging the defaults.

Reading a small box without leaving the map.
A box needs a preview when it is drawn below `map.previewScale`: every marker, and a landmark that crowding shrank below readable (extended to landmarks 2026-09-27; the shrinking is accepted, the balloon makes it livable).
Hovering such a box shows a tooltip with the node's title, a DOM overlay positioned from the rendered position as the fold and connection badges are.
The map's clicks (decided 2026-10-02; before, a single click ballooned, which fought selection):

    single click    select, as everywhere
    right-click     on a box that needs a preview, balloon it, or collapse it if it is the one ballooned; on any other box or on empty space, the map menu
    double-click    on a landmark, re-focus; on a marker, balloon
    elsewhere       a single click anywhere collapses an open balloon, as does Escape, which then leaves the map on its next press

Ballooning tweens the box's rendered size to the preview scale about its own centre, raised above its neighbours, and back when collapsed.
The balloon is an inline, transient size change, the mechanism grow-arrange uses for entrants; the box's stored scale is untouched and nothing is written.
A ballooned landmark that becomes the focus is not collapsed first; the move grows it from its ballooned size.
Neither the tooltip nor the balloon is navigation.

### 5.4 Filtering

A filter restricts the walk.
An edge whose type is filtered out is not followed, so boxes reachable only through it do not exist; a node whose tags are filtered out is not walked through, so its subtree goes with it.
What remains is a subset of the full map with every bearing unchanged: a filtered map and the full map are one picture with parts removed, never two layouts.
I8 holds under any filter, because the box you came from lies along the edge just walked, which is by construction not filtered.
The filter belongs to the session, not to a map, so that exploring the graph one edge type at a time carries the filter from map to map; it is not stored in the map record.
The walk takes a filter predicate from v1; the filter UI is v2 and may reuse the scene's edge-type visibility model.
Filtering is the intended answer to hubs (§10).

### 5.5 Leaving

A command opens the current focus's study scene through the existing transition feature, or returns to the scene the map was entered from.
If the focus has no scene, the existing scene auto-creation applies unchanged.
Chat and notes follow the focus throughout (§7.3), so leaving the map for the node's scene changes nothing in the learning space.

### 5.6 Theme

`map.themeMode` has two values, and the choice is where continuity matters more to the author.
`fixed`: every map uses `map.themeId`; continuity inside the map across every focus.
`scene`: a map uses the theme of the study scene owned by its focus, falling back to the theme of the scene the map was entered from when the focus has none; continuity at the boundary when leaving the map for that scene, at the price of a theme crossfade on re-focus (§5.2).

### 5.7 Absent by design

In the map there is no include or exclude, no fold, no per-box design, no shelf, no arrange, no auto-layout, no background image, no quiz, and no path recording.
Adding and deleting nodes and edges from the map is v2 (§11).

## 6. Data model

All three changes are additive and optional.
Every existing workspace, IndexedDB record and workspace file remains valid without modification.

### 6.1 Edge bearings

    Edge.bearing?: number        the target as seen from the source
    Edge.bearingBack?: number    the source as seen from the target

Degrees, 0 = east, increasing clockwise on screen (y down), the convention `rotate` and `orderChildrenByAngle` already use.
Absent means that end is unassigned; see §6.5. An edge with `bearing` and no `bearingBack`, every edge from before 2026-09-28, reads back as the exact reverse until its target's end is seeded.
Parallel edges share their ends: a box has one direction, so every edge between the same two nodes carries the same two angles, swapped for an edge that runs the other way; seeding and a drag write all of them, and a pair from before 2026-10-02, where only the first edge was ever seeded, is reconciled from that edge when next laid out. Copies rather than one leading edge, so that deleting any edge of the pair moves nothing.
Stored on the Edge record rather than in a separate store so that deletion, export, validation and the store cache need no new code.

### 6.2 Map view record

Its own Dexie database, `knogra-map`, as paths and themes have (`storage/map-store.ts`), rather than an object store in the graph database.
The graph database's Dexie instance is private to `GraphDataStore`, so a store inside it would mean a version bump and new methods on that class; a separate database keeps the map view out of both.
The cost is one more database to carry in the workspace file and to clear on reset, which paths already pay.

    mapViews: 'focusNodeId, updatedAt'

    interface MapView {
      focusNodeId: NodeId;
      boxes: Record<string, { length?: number; scale?: number; leaf?: number }>;   // key: address, e.g. 'A/B/C'; overrides only; leaf is a landmark's multiplier on its leaf
      landmarkScale?: number;                                         // the author's multiplier on the derived landmark scale; absent = 1
      markerScale?: number;                                           // the author's multiplier on the derived marker scale; absent = 1
      updatedAt: Date;
    }

No viewport is stored: the focus is always at the centre and the zoom is the base zoom, a setting (§5.2).
Records written during development carry an ignored `zoom` key.

`length` is the length of the box's line (the line is identified by its child box's address); `scale` is the box's own.
A record exists only once the author has adjusted something; a map with no record renders entirely from defaults.
A key whose address is no longer walkable (an edge or node was deleted) is ignored on load and dropped on the next save.
Deleting a node deletes its record.

### 6.3 Node default design

    Node.defaultDesign?: { id: DesignId; params: Record<DesignParameterId, unknown> }

The same shape as a scene node's design.
When absent, a content rule applies: the configured equation design when the node carries an equation, an image design when it owns an image, otherwise the configured basic design.
`grow-arrange.ts` (`pickEntrantDesign`) and `scene-factory-utils.ts` already answer "what design does this node get in a new scene" with two different rules; the field and its rule become the one answer for both, for single-node placement, and for the map.
Setting the field from the node editor is part of v1 only if cheap; the map reads it and falls back to the rule.

### 6.4 Settings

Under a new `map` settings domain, data only, in `config/`:

    map.baseZoom              the zoom of the map surface (default 1): a node at the pixel size its design specifies; the one knob for screen size
    map.ringRadius            the landmark ring's vertical semi-axis as a fraction of half the surface's height (default 0.6)
    map.horizontalStretch     the factor every horizontal offset is multiplied by (default 1.5); the ring's horizontal semi-axis is the vertical one times this
    map.arcLandmarkShare      weight of the landmark's box in its sector's arc (default 0.4)
    map.arcMarkerShare        weight of a marker to the side of the box, counted on both sides (default 0.1)
    map.arcClearanceShare     weight of the clearance between the box's side and its markers, both sides (default 0.1); the leaf's minor semi-axis
    map.arcBreathingShare     weight of the air toward the neighbouring branch, both sides (default 0.1)
    map.leafClearance         clear space between a landmark's side and its markers when the sector is roomy, as a fraction of the landmark's height (default 0.5); the sector budget can only lower it
    map.leafAspect            the leaf's semi-axis along the focus-to-landmark line as a multiple of its semi-axis across it (default 1.6); 1 is round
    map.markerScale           a marker's scale as a fraction of its landmark's, before crowding lowers it (default 0.3)
    map.markerGap             minimum clear space between neighbouring markers of one landmark, as a fraction of their half-diagonal (default 0.5); the fan's marker scale is lowered until it holds
    map.scaleFloor            the least fraction of its default a crowded fan's scale may reach (default 0.3)
    map.landmarkFloor         the least scale a crowded landmark may reach, the readable floor (default 0.6)
    map.landmarkDeviation     how far a landmark may be drawn from its stored direction, in degrees, to keep the ring readable (default 45); 0 draws stored directions exactly
    map.twinAllowance         how far the two ends of an edge may diverge from exact opposition, in degrees (default 30); 0 makes them rigid, as before 2026-09-28
    map.previewScale          rendered scale of a ballooned box (default 1); a box drawn below it can be ballooned, whichever its role
    map.lineScalePower        a line's width and arrow scale are its type's times its box's scale to this power (default 0.5); 1 fully proportional, 0 never
    map.twinLinks             draw dotted links between twins (v2; default off)
    map.themeMode             'fixed' | 'scene' (§5.6)
    map.themeId               the theme under 'fixed'
    map.animate               animate re-focusing
    map.departDuration        phase durations (ms), as transition-settings.ts has for scenes
    map.moveDuration
    map.arriveDuration
    map.phasePause            hold between phases (ms); 0 normally, raised to watch each phase

Landmark scale is 1 and depth is 2; neither is a setting in v1.

### 6.5 Seeding bearings for existing edges

Every edge in every existing workspace lacks bearings, and every edge from before 2026-09-28 lacks its target's end.
Seeding is per end: when a map is laid out, each parent box seeds the ends of its lines that are unassigned, and stores them at once.
An end whose partner end is assigned is coupled: it prefers the exact reverse of the partner and slides within the allowance to the direction that leaves the widest gap among the spokes already at its box; if no direction within the allowance clears them it takes the least crowded one, and the allowance is what makes that rare.
An end whose partner end is also unassigned is free, and both ends are decided together: the box's free ends, together, are spread evenly into the gaps between the spokes it already has, each gap taking a share in proportion to its width, the same margin at both ends of a gap, so that a whole map at once, as after a reset, comes out equally spaced, five landmarks at 72 degrees rather than four right angles and a fifth splitting one.
Which free end takes which slot is chosen so that the far ends land as clear as possible of the spokes their own boxes already have, the far end of each being set to the exact reverse of the slot it gets; this is what stops the third edge of a triangle from being planted into a direction its far end already uses (decided 2026-09-28, the one-ended rule did exactly that on every triangle).
The slots themselves do not move for the far ends: a box with no spokes may turn its whole set, a pure rotation, but with spokes present the set stays put, because shifting it toward a spoke halves the margin there and the parent's evenness is what is looked at (a shifted fan put a marker on its landmark's trunk, 2026-09-28).
Around the whole circle, at the focus and at a landmark alike: a node's neighbours have one set of directions that serves both its views, the ring when it is the focus and the leaf when it is a landmark, and the ring is the view that is read.
A sector rule that fanned a landmark's markers ahead of it was tried and dropped on 2026-09-26: it crowded the same node's landmarks into that sector when it became the focus.
One new edge with both ends free therefore lands in the middle of the widest gap at its parent, the rule single-node placement uses (node-placement.md), shifted within that gap if its far end asks for it.
The map depends on the graph and the settings alone, never on whether a scene exists or what it contains: the map is the basis a study scene is made from, not the other way round (decided 2026-09-24; seeding from scene positions was the earlier rule and was dropped).
Seeding is a normal edit and saves normally; it is not a migration and never runs over the whole graph at once.

### 6.6 Interchange

`Edge.bearing` and `Node.defaultDesign` travel on their records in the workspace file with no change to the format's structure.
`mapViews` is added to the workspace export and import lists (workspace-architecture.md) so map adjustments survive a save and open.
The Knogra Markdown document ignores all three; a map is a view, and the document carries no views.
The legacy `.knogra` ZIP contains none of them and reads as before.

## 7. Architecture

### 7.1 A second Cytoscape instance

Every delicate subsystem hangs off the scene's Cytoscape instance: GraphSaver's listeners, the transition engine, fold state, context menus, keyboard bindings, badges, the shelf.
The map view has a second instance on a second surface, `#map`, declared in `index.html` in the same grid cell as `#cy` and created in `main.ts` beside the scene instance, then handed to the feature through `FeatureAPI` exactly as the scene instance is handed to every other feature.
The feature shows and hides its surface and never creates DOM or an instance; that is the composition root's job (architecture.md §3.4, §3.8), and a reader of `index.html` or `main.ts` sees that the app has two canvases.
The UI layer receives the map instance and surface from `main.ts` too (`UIComponentAPI`, `MenuDependencies.mapCy`), exactly as it receives the scene's, and never obtains them from the feature; the feature keeps its instance private.
A feature that hands out infrastructure becomes a service locator, and the injection that keeps `main.ts` the one place where surfaces are known is lost.
None of the scene-instance listeners ever see a map element.
The scene instance, the Scene record, GraphSaver, the transition engine, fold, shelf, paths, arrange and auto-layout are not modified by this feature.

The map instance is a render surface, not a source of truth: GraphSaver never listens to it, and the map's two writes, the edge bearing and the map record, are explicit storage writes in the sense of architecture.md §3.1 and join its named list.

Costs accepted: two stylesheets built from the same generator, so drift is possible but visible; a second canvas in memory; no shared tween between the instances (§8).

### 7.2 Feature slice

    src/features/map-view/
      map-view.ts          public class MapView over the injected instance, the only feature-api entry; show, hide, lookups
      map-tree.ts          pure: graph + focus → the map tree (boxes and lines)
      geometry.ts          pure: map tree + bearings + lengths + scales → positions
      render.ts            builds map elements and their styles for the map instance; every element carries a kind, box, line or twin link, and geometry, drag and re-focus act on boxes and lines only
      interaction.ts       live drag → provisional bearing and length, re-derive; release → persist; click → re-focus; scale keys
      refocus-animator.ts  the re-focus animation (I7), map-local
      history.ts           back and forward over focuses
    src/storage/map-store.ts     the mapViews object store, cached like the other stores
    src/config/map-settings.ts   the map settings domain, data only

Layer placement follows architecture.md: the feature is a Features-layer slice, the store is Storage, the settings are Config.
The pure modules take plain data and return plain data, as the layout algorithms do (layout-architecture.md §3.1).

### 7.3 Interaction surface

    reads       graphStore nodes and edges; Node.defaultDesign; the design registry and StyleGenerator for node styles; a theme
    writes      Edge.bearing through graphStore; MapView records through the map store
    emits       mapViewChanged { active, focusNodeId } on entry, on every re-focus, and on leaving
    exposes     boxesOf(nodeId), nodeOf(elementId), focusNodeId, isActive(), show, hide, focusOn, back, forward, scaleSelected, togglePreview, collapsePreview; never its instance
    subscribes  nothing from other features
    calls       features.transition to open a study scene on leaving; the existing node editor for content edits (v2)
    touches     one early return in the keyboard handler while the map is active; one subscription in chat-session so the learning space follows the focus; the workspace export and import lists; the map database

Everything else is owned inside the slice.
The shape of the coupling is the same as the AI module's: read through graphStore, write through named stores, integrate through EventBus and FeatureAPI.
The map never emits `sceneChanged`: AppState would record a last scene that does not exist and Path would push it into history.

### 7.4 The map as a regime

While the map is shown, scene commands are unavailable, because their subject is not on screen.
This is a restrictive regime in the sense of architecture.md §3.10 and joins that table: purpose, the canvas is showing a map, not a scene; restricts, all scene-instance commands; owner, `features/map-view`; layer, Features; lifetime, session.
Enforcement belongs to the owner: the map announces itself through EventBus and the keyboard handler and menus guard their own entry points, exactly as View mode and Path mode do.

### 7.5 Hosting other features on the map

Every subsystem on the scene instance assumes that a Cytoscape element id is a node id.
On the map an element id is opaque (a box's address changes on every re-focus while its element persists, so the id can be neither), and a node may have several boxes.
So anything hosted on the map goes through the feature's lookups, `boxesOf` and `nodeOf`, never through element ids, and subsystems divide by what they are keyed on:

    node-keyed    chat, notes, shelf storage, node content editing
                  follow the focus with one subscription to mapViewChanged; nothing else changes
    scene-keyed   path history, last-scene app state, fold, edge visibility, backgrounds, quiz sampling, the AI context
                  need a map equivalent, or are absent by design (§5.7)

Shelf.
The shelf's storage is keyed by central node id and its panel reacts to a node id, so showing the shelf for the focus is one subscription.
Placement must be disabled while the map is shown, because the shelf places into the scene, which is not on screen; the `active` flag of the broadcast is how the panel knows.
Adding from the shelf on the map is a later, map-owned operation: add a node connected to the focus and give the new edge a bearing by widest gap.

Path panel.
The Path feature is a sequence of scene ids recorded from the scene instance.
The map's history (`history.ts`) is a sequence of focuses.
In v1 the panel keeps showing the scene history and greys itself while the map is active; later it renders whichever history is active.
Saved paths that include map visits would be an optional field on the Path record beside `scenes`, additive; not opened until the map has earned it.

Chat.
The conversation is node-keyed and follows the focus.
The context is scene-keyed: `context-builder.ts` reads the scene record for the composition it describes to the model.
The map's composition, focus, landmarks and markers, is the node's real neighbourhood and an equally good description; the seam is a "what is on screen" object built by the scene today and by the map later, consumed by context-builder, with a map variant of the Current Scene Composition section.
A change inside the AI module, not the map.

Quiz.
Quiz is built on the scene instance, samples from the scene record, and hides content by styling elements by node id.
On the map it samples from boxes and hides every box of a node, twins included: either a second Quiz bound to the map instance, or one Quiz over a small surface abstraction, an instance plus the two lookups.
Not v1.

## 8. Transitions between map and scene

Two instances cannot share one tween, so a literal morph across the boundary is not available.
What is available is a handoff that looks like one, because both instances render in graph coordinates into containers of the same size.

Map to scene.
The map instance reads the target Scene record and animates its own boxes to that scene's positions and scales, under the viewport the scene will open with.
Boxes whose node is absent from the scene fade; twins of a node present in the scene converge onto its position; nodes present only in the scene fade in as ghosts.
At the moment the pictures coincide the scene instance opens the scene without animation and the containers swap.
Scene to map is the same sequence reversed.
The scene engine is not involved beyond an instant open; the map's own animator does all the work.

This is v2.
V1 crossfades between the containers.
The handoff is what makes the map an intermediary between two arbitrary study scenes of different nodes: scene X to map of X, navigate to Y under the guarantee, map of Y to scene Y.

## 9. Decisions and rejected alternatives

Two bearings per edge, one per end, independent.
Rejected; accepted bounded (2026-09-28).
If the angle of B from C were independent of the angle of C from B, going from B's map to C's map would swing the B–C line by any amount, and the guarantee would be gone.
Coupled within an allowance, the swing is bounded and confined to the one line between the two focuses (I8), and the second number buys what the single number could not: a box's fan can be arranged without disturbing the fans of its neighbours, and an edge seeded at one end is not nailed into a collision at the other.
The single number is recovered by setting the allowance to 0.

Drawn directions exactly equal to stored directions.
Rejected (2026-10-02) for landmarks, kept for markers.
A marker set near its landmark's trunk on one map is two landmarks on top of each other on the neighbour's map, and the stored directions are both correct; only the drawing can give way, bounded by `map.landmarkDeviation`, in exchange for a trunk that turns by that much more on a re-focus (I8).

Bearings per address, so twins can be aimed freely.
Rejected.
The map of a node would then depend on how it was reached, there would be no single map to make one's own, and per-box state would fragment across arrival addresses.
Under I2, the same end of an edge is drawn at the same angle wherever it appears; the two ends point at each other's box within the allowance, and that is what the guarantee is made of.

The map as a Scene record with a type field.
Rejected.
The record would lie (positions are not the truth, bearings are), every scene consumer would have to learn the type, and the drift the design removes would come back through the record.
A type field on Scene may still be wanted for other reasons (§10); it is not how the map is represented.

Zero per-map state.
Rejected, after being proposed.
Length per line and scale per box are what let an author make a map distinctive and memorable without breaking direction.
The state is small and of a different shape from a scene's, which is the reason for a separate store rather than a reason for none.

Markers as glyph icons rather than miniatures.
Rejected for v1.
A glyph would make marker to landmark a design swap, which needs a crossfade, and the transition's whole quality is that it has none.
Miniatures make it a size tween, and the hover balloon (§5.3) covers reading a marker in place.
A dedicated glyph design may be reconsidered once v1 is seen.

Snap the other lines of an edge on release, instead of moving them during the drag.
Rejected.
Positions are derived (I1), so re-deriving on every move costs nothing and shows the author the whole consequence of a bearing change before it is committed.

Shared Cytoscape instance with a mode.
Rejected in favour of §7.1.

Bearings in a separate store keyed by edge id.
Rejected in favour of the Edge field: a separate store needs its own deletion cleanup, export entry and validation for no gain.

Multiple study scenes per node.
A separate feature.
It neither depends on nor blocks the map view; chat and notes stay node-owned under both.

## 10. Open questions

Crowding.
Answered for size by the sector budget (§3): what adapts is scale, never a bearing.
What remains open is residue: bearings are fixed once and never redistributed, and the per-end seeding with the allowance (§6.5, I2) is meant to stop collisions being planted; what editing plants on purpose is absorbed when drawing by the landmark deviation (§3 Drawn directions, 2026-10-02), so what is left is a ring genuinely fuller than its caps, and whether that needs anything beyond filtering is left until seen.
A deviation applied only when drawing was set aside on 2026-09-28 as a substitute for fixing the stored directions and accepted on 2026-10-02 as their complement: the stored directions are still what seeding and drags get right, and the deviation covers the case no stored direction can, a placement that is right on one map and unreadable on another.

Hubs.
A node with forty neighbours has forty landmarks, and the viewport cannot pan (§5.2).
The budget, the floor and the balloon on a shrunk landmark (§5.3) make such a map usable; filtering (§5.4) is the intended answer to making it readable, and whether an unfiltered hub also needs a cap is left until one is seen.

Shortcuts.
An entry key from the scene waits for the leader-key redesign of the keyboard handler; the map's own keys are in §5.1.
The F1 shortcut overlay does not list them yet.

## 11. Staging

V1.
Enter from the canvas menu; navigate by clicking landmarks with the three-phase re-focus animation; live drag to adjust bearing and length; scale a box, a role, and move a fan or a marker in or out; tooltip on hover and balloon on click for any small box; the walk's filter predicate (no UI); map-local history; leave to the focus's study scene or back to the entered scene; crossfade at both boundaries; bearings seeded per §6.5; the three data-model changes; settings; the doc map row; the regime row in architecture.md; this document's status to Current.

V2.
The handoff morph (§8); the filter UI by edge type and tag (§5.4); authoring in the map (add child or parent with a bearing assigned by widest gap, delete edge); default design editable from the node editor; twin links; crowding policy once seen in use.

Not planned.
Map visits in scene paths; per-box designs; folding in the map.
