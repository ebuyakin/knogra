# Edge Types Architecture

> **Status:** Current  
> **Last reviewed:** 2026-06-20  
> **Authority:** Current architecture and implementation guide for edge types, typed edge styling, and scene-local edge visibility.  
> **Related:** [Documentation map](README.md), [Architecture](architecture.md), [Scene transitions](scene-transitions.md), [Theme architecture](theme-architecture.md), [AI chat API call composition](ai-chat-api-call-composition.md), [Workspace architecture](workspace-architecture.md)

## 1. Purpose

Knogra supports edges as graph relationships. Edge types make those relationships semantically and visually distinct without requiring every individual edge to be styled by hand.

The edge types feature provides workspace-specific relationship types such as `related`, `part of`, `example of`, `causes`, or `precedes`. Each type has centrally managed visual styling, and scenes can visually hide or dim edge types without removing those edges from the scene or graph.

The goal is to make relationship semantics first-class in the graph while preserving Knogra's scene model: scenes decide which relationships are contextually included, and visibility controls decide how visually prominent those included relationships are.

---

## 2. Current State

Current implementation facts that shape the feature:

- `Edge` in `src/core/main-types.ts` now has a first-class `typeId`.
- `EdgeType` records are workspace-level graph data stored in the `edgeTypes` object store.
- New and imported workspaces seed or normalize starter edge types, including the default `related` type.
- Edge type styles resolve from theme-owned `edgeStyleSlots`, optional edge type `styleOverride`, and optional per-edge scene override.
- `Scene.edges[edgeId].design` remains the scene-specific per-edge override layer.
- `Scene.edgeTypeVisibility` is scene-local display state and participates in the resolved visual state of each edge.
- `StyleGenerator` can generate base edge styles, type selector rules, and per-edge override rules.
- `edge-visual-resolver.ts` resolves the declarative edge visual state from theme, edge type, type override, per-edge scene override, and scene edge type visibility.
- Scene open/reload and immediate visibility changes use the resolver for target opacity, avoiding hidden-edge flicker.
- Shared scene-to-scene morph analysis, edge ghosts, real crossfade edges, and tween edges use resolved old/new edge visual states while preserving the existing transition analysis shape.
- The Edge Type Manager can rename types, choose thematic slots, and configure type-level visual overrides.
- The Edge Editor can enable or clear individual per-edge overrides.
- Copy/paste edge style copies both `typeId` and optional individual override state.
- Mermaid export/import now maps Mermaid labels to edge type names and creates edge types during import.
- AI scene context currently remains unchanged; edge type semantics are intentionally deferred until their user-facing value is clearer.

The important architectural lesson from the visibility work is that edge types are not only a data and UI feature. They participate in scene style resolution, transition analysis, ghost rendering, open/close animations, fold/unfold behavior, GraphSaver persistence, workspace import/export, Mermaid conversion, and context menu affordances. Treating visibility as a late display patch makes the system fragile because transition code actively owns runtime opacity during animation.

---

## 3. Product Decisions

These decisions define the current feature:

- Edge types are workspace-specific.
- Edge types are persisted in a dedicated `edgeTypes` object store inside `knogra-graph`, alongside the existing graph object stores for nodes, edges, scenes, and background images.
- New and imported workspaces start with configurable starter edge types: `related`, `part-of`, and `example-of`.
- The UI remembers the last selected edge type and uses it as the default for newly created edges.
- Users can create custom edge types.
- Edge type deletion is not currently implemented. Existing types can be renamed and restyled.
- Edge type visibility is a visual scene control only. It does not remove the edge from the scene and does not affect AI context.
- Edge type visibility must be part of the scene's resolved edge visual state, not an after-the-fact stylesheet patch.
- View mode may allow transient edge type visibility changes, but those changes must not be persisted.
- Invisible edges are not intended to be selectable from the graph canvas.
- Edge titles remain freeform metadata, but are not rendered on the canvas by default because labels would clutter the visual picture.
- Edge types are managed in a dedicated Edge Type Manager overlay, not as ordinary scalar settings in the Settings modal.
- Scene-local visibility controls should use the user-facing label **Edges visibility** and must be reachable from the empty canvas context menu. They may also be reachable from an edge context menu, but canvas access is required so users can recover after hiding all edges.
- AI context may eventually include edge type semantics for scene edges, but that is deferred.

---

## 4. Terminology

| Term | Definition |
|---|---|
| **Edge type** | Workspace-defined semantic category for graph edges, for example `part of` or `example of`. |
| **Type registry** | Workspace-level collection of available edge types and their visual styles. |
| **Default edge type** | Fallback type assigned to existing, imported, or newly created edges when no explicit type is chosen. |
| **Type style** | Centrally managed Cytoscape style parameters applied to every edge of a type. |
| **Per-edge override** | Optional scene-specific style override for one edge, layered over its type style. |
| **Included edge** | Edge exists in `scene.edges`; it is part of the scene's contextual structure. |
| **Visible edge** | Included edge whose type visibility state allows it to render visibly. |
| **Invisible edge** | Included edge hidden for visual decluttering only; it remains scene context. |
| **Out-of-scene graph edge** | Edge exists in the global graph but is not in `scene.edges`; it is not part of the current scene context. |

The important three-level distinction is:

1. Edge is in the scene and visible.
2. Edge is in the scene but invisible or muted for visual aesthetics.
3. Edge is in the graph but not in the scene.

AI scene context distinguishes level 3 from levels 1 and 2 through scene membership. It currently does not distinguish level 1 from level 2 for inclusion purposes.

---

## 5. Goals And Non-Goals

### Goals

- Assign a semantic type to every edge.
- Centrally define and edit style per edge type.
- Automatically update all edges of a type when its style changes.
- Allow per-scene visibility controls per edge type without mutating scene membership.
- Preserve current per-edge custom styling as an override capability.
- Keep edge type data portable inside `.knogra` workspaces.
- Keep relationship types available for future AI context composition if product value justifies it.

### Non-Goals

- Global edge type presets shared across all workspaces.
- Removing scene membership when a type is hidden.
- Replacing themes with edge types.
- Replacing per-edge titles or properties; edge type is a separate semantic field.
- Relationship reasoning or ontology validation.
- Edge type deletion/reassignment workflows.

---

## 6. Data Model

### 6.1 Core Types

Edge types use a primitive ID and workspace-level type definition:

```ts
export type EdgeTypeId = string;
export type EdgeStyleSlotId = 'edge-style-1' | 'edge-style-2' | 'edge-style-3';

export interface EdgeType {
  id: EdgeTypeId;
  name: string;
  description?: string;
  forwardLabel?: string;
  inverseLabel?: string;
  thematicStyleSlotId: EdgeStyleSlotId;
  styleOverride?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

`thematicStyleSlotId` points to one of three theme-owned edge style slots. `styleOverride` is optional and stores manual deviations from the selected thematic style.

`Edge.typeId` identifies the workspace edge type:

```ts
export interface Edge {
  id: EdgeId;
  title: string;
  sourceId: NodeId;
  targetId: NodeId;
  typeId: EdgeTypeId;
  tags: string[];
  properties: Record<EdgePropertyId, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

`forwardLabel` and `inverseLabel` are optional but useful because direction matters. For example, if `A -> B` has type `part-of`, the forward label might be `is part of`, and the inverse label might be `has part`.

### 6.2 Scene Visibility State

Edge type visibility belongs to the scene, not to the graph edge and not to the type registry:

```ts
export type EdgeTypeVisibilityMode = 'show' | 'dim' | 'hide';

export interface Scene {
  // existing fields...
  edgeTypeVisibility?: Record<EdgeTypeId, EdgeTypeVisibilityMode>;
}
```

Default behavior: missing visibility entry means `show`.

Semantics:

- `show`: use the normal resolved edge style.
- `dim`: use half of the resolved standard opacity. If the normal resolved opacity is `0.8`, dimmed opacity should be `0.4`.
- `hide`: use opacity `0` and disable interaction.

Visibility state must not remove the edge from `scene.edges`.

The key rule is that visibility is part of the resolved scene visual state for the edge. It is not an independent late opacity mutation after scene elements have already been rendered or animated.

### 6.3 Per-Edge Override

The existing scene edge design shape stores individual overrides:

```ts
scene.edges[edgeId].design
```

For typed edges, scene edge design is an override layered over the resolved type style. Existing workspaces with custom edge designs preserve those designs as overrides.

---

## 7. Storage And Workspace Persistence

### 7.1 IndexedDB Object Store

The graph database persists edge types in a dedicated object store alongside the existing graph stores:

```ts
export const GRAPH_DB_SCHEMA = {
  nodes: '++id, title, tags',
  edges: '++id, title, sourceId, targetId, typeId, tags',
  scenes: '++id, title',
  backgroundImages: '++id, name',
  edgeTypes: 'id, name'
};
```

`GRAPH_DB_VERSION` is `3`. `GraphStore` loads and caches edge types alongside graph data, seeds starter edge types when the store is empty, and normalizes existing edges to the default type when an edge has no valid `typeId`.

Because edge types are workspace-specific graph data, storing them in `knogra-graph` is the most coherent default. Their selected thematic style slot and optional manual override are part of the workspace relationship vocabulary, while the actual slot aesthetics belong to themes. Edge types should not live in `knogra.settings` because exported workspaces must carry their relationship vocabulary, and settings may be preserved independently from graph data during workspace flows.

### 7.2 Workspace Export/Import

Workspace export/import includes edge types. Since edge types are stored in `knogra-graph`, `edgeTypes` is included inside the graph export payload with nodes, edges, and scenes.

The import validator checks that every `edge.typeId` resolves to an existing edge type. Unknown or missing type IDs are reassigned to the default type during import/migration. This handles older workspaces that have no edge type data.

### 7.3 New Workspace Defaults

New workspace creation seeds the edge type registry from a configurable starter set defined in `src/config/edge-type-settings.ts`.

Starter set:

| ID | Name | Forward label | Notes |
|---|---|---|---|
| `related` | Related | relates to | Default fallback type. |
| `part-of` | Part of | is part of | Useful for entity/attribute and whole/part structures. |
| `example-of` | Example of | is example of | Useful for instance/class or example/concept structures. |

`related` is the default fallback type.

---

## 8. Style Cascade

Edge style resolves through this cascade:

```text
Theme default edge style
  -> Theme edge style slot selected by EdgeType
  -> EdgeType manual style override
  -> Per-edge scene override
  -> Scene edge type visibility
  = Resolved scene edge visual state

Resolved scene edge visual state
  -> Runtime styles from transition/fold/selection/preview
```

The first block is declarative scene state. The second block is temporary runtime animation state. Runtime opacity bypasses must never become the authority for final visibility.

Resolver shape:

```ts
interface ResolvedEdgeVisualState {
  style: Record<string, unknown>;
  opacity: number;
  events: 'yes' | 'no';
  visibilityMode: EdgeTypeVisibilityMode;
}
```

The resolver considers the edge, its edge type, the scene edge override, the scene theme, and the scene's edge type visibility state. Scene opening and transition code asks for old and new resolved visual states instead of independently recomputing partial edge styles.

Each theme owns three thematic edge style slots: `edge-style-1`, `edge-style-2`, and `edge-style-3`. These slots are visual/aesthetic choices defined by the theme, not workspace relationship semantics. Edge types are workspace semantic objects that usually choose one of these slots.

This keeps the number of visually distinct edge families small. In practice, most workspaces benefit from two or three clear relationship categories; more types can become hard to maintain and differentiate.

### 8.1 Selector Strategy

Type styles are generated as Cytoscape selectors keyed by edge data:

```ts
edge[typeId = "part-of"]
```

Per-edge overrides can continue to use the existing ID selectors:

```ts
edge[id = "e123"]
```

Ordering matters. Type rules must appear after the base `edge` rule, and per-edge override rules must appear after type rules. Visibility-derived style may be emitted as selectors, but those selectors are an implementation detail of the resolved visual state, not an independent source of truth.

### 8.2 Visibility Rules

Scene visibility can be emitted as additional selectors or computed style merges. Selector-based rules can still be useful:

```ts
edge[typeId = "part-of"]
edge[typeId = "part-of"].edge-type-hide
edge[typeId = "part-of"].edge-type-dim
```

Alternatively, Cytoscape data selectors can use a scene-specific field like `typeVisibilityMode`, updated when scene visibility controls change:

```ts
edge[typeId = "part-of"][typeVisibilityMode = "hidden"]
```

The implementation avoids removing edges from Cytoscape just to hide them, because that would blur the distinction between scene inclusion and visual visibility.

However, selector-based visibility must not be treated as a late overlay that fights animation opacity bypasses. If Cytoscape animations set `opacity: 1` as a bypass, that bypass overrides stylesheet opacity. Therefore transition and open/close code must animate toward the resolved target opacity (`0`, dim opacity, or normal opacity), and cleanup must remove temporary bypasses only after the final stylesheet state is already correct.

---

## 9. Scene And Transition Behavior

### 9.1 Scene Loading

When building Cytoscape elements for a scene, scene open paths:

- Include `typeId` from graph edge data.
- Include scene edge design override if present.
- Resolve each edge's target visual state before it is first displayed.
- Include any visibility mode data needed by selectors if selector emission is used.
- Apply base edge style, type style rules, per-edge override rules, central/selected rules, and visibility-derived rules in deterministic order.
- Hidden edges do not flash as visible during scene load. If an edge resolves to opacity `0`, it is added at opacity `0` and is not animated to `1` first.
- Dimmed edges animate to the dimmed target opacity, not to `1` followed by a correction.

### 9.2 Scene Saving

GraphSaver persists `edge.typeId` as graph edge content. Scene extraction persists `edgeTypeVisibility` as part of the scene and continues persisting `scene.edges[edgeId].design` for overrides.

### 9.3 Scene Transitions

Transition analysis compares fully resolved edge visual states between scenes after theme, edge type style, edge type override, per-edge override, and scene visibility are applied.

Behavior:

- If only non-structural visual fields change, tween where possible.
- If curve style, control points, segment/taxi fields, or endpoint geometry changes, use ghost crossfade.
- If visibility changes from show/dim to hide, fade to opacity `0` but keep the edge included in the target scene.
- If visibility changes from hide to show/dim, fade in to the target resolved opacity.
- If visibility changes from show to dim or dim to show, tween opacity between the old and new resolved opacity.
- If a hidden edge also changes color, width, arrow, or curve style, those changes still belong to the same old-state to new-state visual transition. Hidden status does not cause the edge to disappear from transition analysis.
- AI/context state is unaffected by these visual transitions.

Ghost handling is visibility-aware in the shared morph phase:

- Ghost edges carry the old scene's resolved visual state, including old visibility opacity.
- Real edges carry the target scene's resolved visual state, including target visibility opacity.
- A ghost for an already hidden old edge may have opacity `0` and may not need a visible fade-out, but it should still be logically consistent with the old scene state.
- The final state after cleanup must be the target scene's resolved visual state with no stale opacity bypasses from the animation.

This fits the existing transition specification: shared elements morph from old visual state to new visual state. Edge type visibility is one dimension of that visual state, just like color, width, or curve style.

### 9.4 Fold/Unfold And Visibility

Fold/unfold is non-destructive scene visibility for nodes and their incident edges. Edge type visibility is also non-destructive, but it is independent of fold state.

The two mechanisms must compose:

- Folded edges are hidden because an endpoint is folded.
- Type-hidden edges are hidden because their edge type is hidden in the scene.
- Unfolding a node should not make a type-hidden edge visible.
- If an edge is both folded and type-hidden, either reason is sufficient for it not to render.

Fold/unfold paths hide and reveal elements through fold state. Type visibility remains independent: selecting and folding a node clears transient edge selection, and unfolding a node should not make a type-hidden edge visible.

### 9.5 Open/Close And Flicker Avoidance

Open scene paths must not show hidden edges and then turn them off. The correct behavior is:

1. Resolve target edge visual states before adding or fading in edges.
2. Add hidden target edges with opacity `0`.
3. Animate visible target edges to their resolved target opacity.
4. Animate dimmed target edges to their dimmed target opacity.
5. Clear temporary animation bypasses only after the stylesheet/resolved state already represents the same final value.

Close scene paths can fade currently rendered edges out from their current resolved opacity to `0`. Type-hidden edges already at `0` should not visibly participate, but they may still be removed with the rest of the scene during cleanup.

### 9.6 Edge Selection And Transition Safety

Edge selection is a temporary UI affordance for edge editing and style-copy workflows. It is not scene state, graph data, or transition state.

Selected edges use a Cytoscape `edge:selected` style underlay so users can see which edges are selected. The underlay color follows the resolved edge line color, and the selection rule only turns the underlay on; it does not alter the edge's semantic color, type style, scene override, or visibility state.

Because selected-edge underlays are UI-only visual effects, they must not participate in transition ghosting, close/open fades, or scene-to-scene morph visuals. The existing UI `TransitionInputGuard` listens to `transitionStart` and clears only selected edges before transition visuals begin:

```ts
cy.edges(':selected').unselect();
```

This deliberately preserves selected nodes. Node selection remains a meaningful app interaction state used for navigation, keyboard commands, active-node inheritance, and central-node affordances.

This is an accepted Cytoscape boundary for the UI layer: UI components may use Cytoscape directly for ephemeral interaction state such as selection, rendered positions, temporary input blocking, and DOM overlay positioning. Domain mutations such as adding/removing graph elements, changing scene membership, editing node/edge data, and persisting visual designs should still go through feature APIs and storage-owned flows.

---

## 10. UI Model

### 10.1 Edge Editor

The edge editor edits edge type and scene-specific visual override state:

- Edge type selector.
- Optional per-edge style override controls.
- Reset override / use type style action.

The editor should not make users believe changing an individual edge style changes the whole type unless they explicitly choose to edit the type style.

### 10.2 Edge Type Manager

The dedicated workspace-level Edge Type Manager overlay supports:

- Create type.
- Rename type.
- Choose one of the three thematic edge style slots.
- Edit optional manual style override.
- Show edge count per type.
- Add new types.

It currently does not support deletion, directional label editing, ontology tools, or complex validation.

The Settings modal is not the primary editor for edge type records. Settings are best kept for scalar defaults and app/user preferences, while edge types are workspace graph data.

### 10.3 Scene Visibility Controls

The compact scene-level control for edge type visibility uses the user-facing label **Edges visibility**:

- Toggle show / dim / hide per type.
- Apply only to the current scene.
- Persist in `scene.edgeTypeVisibility` in Edit mode.
- In View mode, visibility changes are allowed as transient visual changes and must not be persisted, matching the current View mode behavior for pan/zoom and other visual-only changes.
- Hidden/invisible edge types are not intended to be selectable from the graph canvas, because selecting an invisible object would feel accidental and confusing.

The command must be available from the empty canvas context menu. It may also be available from edge context menus for convenience, but canvas access is required because users can hide every edge and still need a way to restore visibility.

The modal lists edge types present in the current scene, with counts and a three-way state:

| Edge type | Count | Display |
|---|---:|---|
| Related | 12 | Show / Dim / Hide |
| Part of | 4 | Show / Dim / Hide |

Use plain user-facing text (`Show`, `Dim`, `Hide`) rather than implementation terms.

### 10.4 Remembered Type

The UI remembers the last edge type assigned through edge editing and uses it as the default for new edge creation. This is interaction/session state, not graph semantics and not an edge type registry concern.

Implementation decisions:

- The remembered type is stored in `knogra.state` as `lastEdgeTypeId` through `AppStateManager`.
- `Graph.addEdge()` is the single defaulting point for new edges, so keyboard, context-menu, connected-node, and shelf-driven edge creation all inherit the same remembered type behavior.
- `Edge.update()` records `lastEdgeTypeId` when a caller changes an edge's `typeId`.
- `Graph.addEdge()` validates the remembered id against `graphStore.edgeTypes` before using it. If the stored id is absent from the current workspace, new edges fall back to the configured default edge type (`related`).
- This state is cleared with the rest of `knogra.state` on new workspace flows.

### 10.5 Edge Style Copy/Paste And Multi-Selection

Edge style copy/paste copies both the edge type and the optional scene-specific override:

```ts
interface CopiedEdgeStyle {
  typeId: EdgeTypeId;
  params: Record<string, unknown> | null;
}
```

Copy is a single-source operation. When the context edge is part of a multi-edge selection, `Copy style` and `Edit Edge` are disabled because their source/subject would be ambiguous.

Paste is a one-or-many target operation. If multiple edges are selected and the context edge is part of that selection, the menu shows `Paste style to N edges` and applies the copied type and override state to all selected edges. If the context edge is not part of the selected set, paste applies only to the context edge.

Destructive operations remain single-edge operations. `Exclude from scene` and `Delete` affect only the context edge, even when multiple edges are selected.

---

## 11. AI Context

AI context currently does not include edge type semantics. It can eventually include edge type for scene edges regardless of visibility mode. Visibility is a visual decluttering control, not a semantic/contextual exclusion mechanism.

For example, instead of:

```text
- Newton's laws -> Classical mechanics
```

AI context could render:

```text
- Newton's laws are part of Classical mechanics
```

or, when no directional label exists:

```text
- Newton's laws -> Classical mechanics (type: Part of)
```

Edge title remains optional metadata or a note, not the primary relationship type. Edge titles are not rendered on the canvas by default because they would add clutter.

Scene membership remains the contextual boundary. If an edge is in the graph but not in `scene.edges`, it should not be rendered as part of the Current Scene relationships, even if both endpoint nodes are visible for some reason. Existing Directly Connected and Full Graph sections can continue to provide broader graph awareness.

AI integration is deliberately deferred. The visual correctness of typed edge styling and scene-local visibility is the current priority.

---

## 12. Theme-Aware Type Styles

The open theme-style question is settled: themes define three thematic edge style slots, and edge types select one of those slots.

Settled decisions:

| Question | Decision |
|---|---|
| Initial starter set | `related`, `part-of`, `example-of`. |
| View mode visibility changes | Allowed, but transient and not persisted. |
| Hidden edge selectability | Hidden/invisible edges are not intended to be selectable from the canvas. |
| Edge title rendering | Keep titles as metadata, but do not render them by default. |
| Unknown edge type IDs on import | Reassign to the default type. |
| Storage location | Dedicated `edgeTypes` object store in `knogra-graph`. |
| Type management UI | Dedicated Edge Type Manager overlay. |
| Theme-aware styling | Three theme-owned thematic edge style slots; edge types reference a slot and may optionally override it. |

### Thematic Edge Style Slots

Each theme defines exactly three thematic edge style slots:

| Slot | Purpose |
|---|---|
| `edge-style-1` | Default or neutral relationship style. |
| `edge-style-2` | Strong/accent relationship style. |
| `edge-style-3` | Secondary or subtle relationship style. |

The exact visual meaning of each slot belongs to the theme. A high-contrast theme might use strongly separated colors and widths; a calm theme might use softer differences. The slots are not edge types themselves and do not carry relationship semantics.

Edge types are workspace-level semantic records. In the Edge Type Manager, each edge type chooses one thematic slot:

```ts
export interface EdgeType {
  id: EdgeTypeId;
  name: string;
  description?: string;
  forwardLabel?: string;
  inverseLabel?: string;
  thematicStyleSlotId: EdgeStyleSlotId;
  styleOverride?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

For example, the workspace edge type `part-of` may use `edge-style-2`. In a scene using the `forest` theme, `part-of` edges render with the `forest` theme's second edge style. In a scene using the `ocean` theme, the same `part-of` edges render with the `ocean` theme's second edge style.

### Theme Type Shape

`ColorTheme` includes a small fixed set of edge style slots:

```ts
export interface ColorTheme {
  // existing fields...
  edge: EdgeStyle;
  edgeStyleSlots?: Record<EdgeStyleSlotId, EdgeStyle>;
}
```

If a theme omits `edgeStyleSlots`, the style generator derives fallback slots from `theme.edge` so older/custom themes remain valid.

### Manual Overrides

An edge type may optionally define `styleOverride`. This override is layered over the selected thematic slot. This is useful when a workspace needs one type to deviate from the theme-provided slot without creating more thematic slots.

The cascade becomes:

```text
Theme default edge style
  -> Theme edge style slot selected by EdgeType
  -> EdgeType manual style override
  -> Per-edge scene override
  -> Scene edge type visibility
  -> Runtime transition/selection styles
```

### Complexity Limit

The number of thematic edge styles is fixed at three. This is enough for most practical graphs and encourages users to keep relationship categories clear. The app supports more than three edge types, but multiple edge types may share the same thematic style slot.

---

## 13. Architectural Risks

- **Style duplication:** Per-edge rules can accumulate if type styles and override rules are not ordered and replaced carefully.
- **Transition drift:** Transitions already have special edge style handling; typed style resolution must be shared rather than reimplemented differently in each transition path.
- **Opacity authority conflict:** Visibility implemented as late stylesheet opacity conflicts with Cytoscape animation bypasses such as `edge.style('opacity', 1)`. The resolver must define final target opacity, and animations must tween toward that target.
- **Open-scene flicker:** Hidden edges can flash visible if open paths add or animate them to opacity `1` before applying visibility. Hidden/dim state must be known before first render/fade-in.
- **Ghost mismatch:** Ghost edges must use the old scene's resolved visual state, including visibility. Real edges must use the target scene's resolved visual state.
- **Fold/unfold inconsistency:** Fold/unfold can reintroduce edges; those paths must apply the same resolved visual state as normal scene open/transition paths.
- **Recovery affordance:** If `Edges visibility` only appears on edge context menus, users can hide all edges and lose the command. It must be available from the canvas menu.
- **Migration mistakes:** Existing workspaces need all edges to receive a default `typeId` without losing custom scene designs.
- **UX ambiguity:** Users must understand the difference between editing one edge's override and editing the central style for a type.
- **Context ambiguity:** Visibility controls must not accidentally change AI context or scene membership semantics.