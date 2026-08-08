# Node Styling Architecture

> **Status:** Current with caveats  
> **Last reviewed:** 2026-06-14  
> **Authority:** Current styling principles and call-flow reference for node design updates. Some older method names in the diagram are historical; [theme-architecture.md](theme-architecture.md), [node-design-system.md](node-design-system.md), [central-node-styling-refactor.md](central-node-styling-refactor.md), and current code remain the authority for exact APIs.  
> **Related:** [Documentation map](README.md), [Theme architecture](theme-architecture.md), [Node design system](node-design-system.md), [Central node styling refactor](central-node-styling-refactor.md)

This document describes the correct architecture for node styling in Knogra.

## Principles

1. **UI layer only delegates** — no business logic in context-menu or other UI components
2. **Features own their domain** — Node handles node content, Scene handles scene-specific properties
3. **StyleGenerator is the only style authority** — all styling goes through StyleGenerator methods
4. **Always use fromJson().update()** — never use selector().style().update() as it appends to end

## Data Ownership

| Property | Owner | Feature |
|----------|-------|---------|
| title, tags, properties | Node entity | `Node.update()` |
| design, scale, position | Scene entity | `Scene.updateNodeStyle()`; scale also `Scene.scaleNodes()` |

## StyleGenerator Methods

| Method | Purpose | When to Use |
|--------|---------|-------------|
| `generateSceneStylesheet()` | Full scene stylesheet generation | Kept for potential future use; not currently on the main scene-open path |
| `addNodesToStylesheet()` | Add new nodes | `Scene.includeNode()`, `Graph.addNode()`, transitions, `Scene.scaleNodes()` (batched multi-node rebuild) |
| `updateNodeInStylesheet()` | Update existing node | `Scene.updateNodeStyle()` |
| `buildCentralAndSelectedRules()` | Build central/selected selector rules | Scene open and transition stylesheet rebuilds |
| `generateNodeStyle()` | Generate single style | Called internally by above methods |

## Call Flow Diagram

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'fontSize': '24px' }}}%%
flowchart LR
    subgraph UI ["UI Layer"]
        CM[context-menu]
    end

    subgraph Features ["Feature Layer"]
        Node[Node]
        Scene_open[Scene.open]
        Scene_include[Scene.includeNode]
        Scene_expand[Scene.expandNode]
        Scene_update[Scene.updateNodeStyle]
        Graph_add[Graph.addNode]
        Trans_stage6[Transition.stage6]
        Trans_central[Transition.updateCentral]
        EA_expand[expandNodeChildren]
    end

    subgraph Styles ["StyleGenerator"]
        GSS[generateSceneStylesheet]
        ANS[addNodesToStylesheet]
        UNS[updateNodeInStylesheet]
        BCSR[buildCentralAndSelectedRules]
        GNS[generateNodeStyle]
    end

    subgraph CY ["Cytoscape"]
        CY_JSON["fromJson.update"]
    end

    %% 0: CM -> Node
    CM --> Node
    %% 1: CM -> Scene_update
    CM --> Scene_update

    %% 2: Scene_open -> GSS
    Scene_open --> GSS
    %% 3: GSS -> GNS
    GSS --> GNS
    %% 4: Scene_include -> ANS
    Scene_include --> ANS
    %% 5: Scene_expand -> ANS
    Scene_expand --> ANS
    %% 6: Scene_update -> UNS
    Scene_update --> UNS
    %% 7: UNS -> GNS
    UNS --> GNS
    %% 8: Graph_add -> ANS
    Graph_add --> ANS
    %% 9: Trans_stage6 -> ANS
    Trans_stage6 --> ANS
    %% 10: EA_expand -> ANS
    EA_expand --> ANS
    %% 11: ANS -> GNS
    ANS --> GNS
    %% 12: Trans_central -> BCSR
    Trans_central --> BCSR

    %% 13: Scene_open -> CY
    Scene_open --> CY_JSON
    %% 14: Scene_include -> CY
    Scene_include --> CY_JSON
    %% 15: Scene_expand -> CY
    Scene_expand --> CY_JSON
    %% 16: Scene_update -> CY
    Scene_update --> CY_JSON
    %% 17: Graph_add -> CY
    Graph_add --> CY_JSON
    %% 18: Trans_stage6 -> CY
    Trans_stage6 --> CY_JSON
    %% 19: EA_expand -> CY
    EA_expand --> CY_JSON
    %% 20: Trans_central -> CY
    Trans_central --> CY_JSON

    %% Style all links same thickness
    %% White for StyleGenerator (0-12)
    linkStyle 0,1,2,3,4,5,6,7,8,9,10,11,12 stroke:#ffffff,stroke-width:2px
    %% Green for Cytoscape (13-20)
    linkStyle 13,14,15,16,17,18,19,20 stroke:#4ade80,stroke-width:2px
```

## Correct Stylesheet Order

Cytoscape applies styles in order — later rules override earlier ones (with equal specificity).

```
1. node[id="n1"] styles     ← specific node styles (first)
2. node[id="n2"] styles
3. edge                     ← base edge styles
4. edge[id="e1"]           ← edge overrides
5. node[?centralNode]       ← central node highlight
6. node:selected            ← selected state
7. node[?centralNode]:selected ← combined central + selected state
```

**Critical:** Node-specific styles must come before central/selected rules so that central and selection highlighting survive per-node design changes. Cytoscape resolves conflicts by stylesheet order: the last matching rule wins.

## Key Rules

### ✅ DO
- Call `Scene.updateNodeStyle()` for design/scale changes
- Call `Node.update()` for content changes (title, tags, properties)  
- Use `addNodesToStylesheet()` for adding new nodes
- Use `updateNodeInStylesheet()` for updating existing nodes
- Always apply via `cy.style().fromJson(stylesheet).update()`

### ❌ DON'T
- Put StyleGenerator calls in UI layer
- Use `cy.style().selector().style().update()` — appends to end, breaks order
- Mix node content and scene properties in a single update call

## Example: Node Editor Save

```typescript
// In context-menu.ts (UI layer)
this.#nodeEditor.show(nodeId, nodeData, design, context, async (id, contentUpdates, designUpdates, scaleUpdate) => {
  // Update node content (title, tags, properties)
  await this.#features.node.update(id, contentUpdates);
  
  // Update scene-specific style (design, scale)
  await this.#features.scene.updateNodeStyle(id, {
    design: designUpdates,
    scale: scaleUpdate
  });
});
```
