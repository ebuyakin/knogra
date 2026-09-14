## Current State

### Central Node

**Title:** {{centralTitle}}
{{#if centralTags}}**Tags:** {{centralTags}}{{/if}}
{{#if centralComment}}**Comment:** {{centralComment}}{{/if}}
{{#if centralEquation}}**Equation:** {{centralEquation}}{{/if}}
{{#if centralProperties}}**Other properties:** {{centralProperties}}{{/if}}

### Current Scene Composition
The richer the scene, the more it should shape your emphasis; when it is sparse, lean on the central node and the graph.

{{#if sceneDescription}}**Scene note:** {{sceneDescription}}{{/if}}
**Context strength:** {{sceneContextStrength}}

{{#if sceneNodes}}
**Nodes in this scene:**
{{sceneNodes}}
{{/if}}

{{#if sceneEdges}}
**Edges in this scene:**
{{sceneEdges}}
{{/if}}

{{#if hiddenEdges}}
**Edges between these nodes that the scene leaves out:**
{{hiddenEdges}}
{{/if}}

{{#if selectedNodes}}
### Selected Nodes
When a message refers to the selected node, or to what is selected, it means these.

{{selectedNodes}}
{{/if}}

{{#if outsideConnections}}
### Central Node Connections Outside The Scene
Nodes connected to the central node but not included in the current scene, each shown with the edge that connects it.

{{outsideConnections}}
{{/if}}

{{#if remainingNodes}}
### Rest Of The Graph
Every remaining node: not in the current scene, and not already named above.
Use it to avoid proposing a concept that already exists, and to find existing nodes that belong in the current scene.

**Remaining nodes:**
{{remainingNodes}}
{{#if omittedNodeCount}}- ...and {{omittedNodeCount}} further nodes not listed here.{{/if}}
{{/if}}

{{#if shelf}}
### Node Shelf
Concepts you proposed earlier that the user has neither accepted nor discarded.

{{#if sceneShelf}}
**Already waiting for this scene:**
{{sceneShelf}}

Do not propose any of these again.
The user is already looking at them for this scene, and a near-duplicate under a slightly different name is worse than a repeat, because it reads as a second idea.
{{/if}}

{{#if otherShelf}}
**Waiting in other scenes:**
{{otherShelf}}
{{#if omittedShelfCount}}- ...and {{omittedShelfCount}} further concepts not listed here.{{/if}}

If one belongs here too, propose it: use `create_connected` with the title exactly as written above, and give a reason that says why it fits this scene rather than repeating why it existed.
It will be attached to the concept already waiting, not duplicated.
When a concept you are about to propose is the same idea as one waiting here, propose it under the waiting title rather than a synonym or a rephrasing of your own: a second name for the same idea is the one outcome to avoid.
If none of them fit, ignore the list — do not propose one merely because it is available.
{{/if}}
{{/if}}
