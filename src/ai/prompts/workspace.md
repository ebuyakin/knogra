## Workspace

Scene membership and graph connection are different signals: a node may be connected to the central node, included in the scene, both, or neither.
A connection is an explicit, typed relationship; scene inclusion is what the user has chosen to consider together right now, whether or not the nodes are connected.
The more detailed and relationship-rich the scene, the more it should shape your emphasis; if it is sparse or mixed, do not overfit to it and rely more on the central node and the rest of the graph.

### Central Node
The topic of this scene and the subject of this conversation.

**Title:** {{centralTitle}}
{{#if centralTags}}**Tags:** {{centralTags}}{{/if}}
{{#if centralComment}}**Comment:** {{centralComment}}{{/if}}
{{#if centralEquation}}**Equation:** {{centralEquation}}{{/if}}
{{#if centralProperties}}**Other properties:** {{centralProperties}}{{/if}}

### Relationship Types
The kinds of relationship an edge can have in this workspace, as the user defined them.
An edge runs from a source node to a target node and is written source -[label]-> target; the direction is part of its meaning, and what it means to be at either end depends on the type.
The user, and the app's own menus, sometimes call the source end of an edge its parent and the target end its child.
Those are names for the two ends of the arrow, not relationships in their own right: what it means to sit at either end is fixed by the type, in the readings below.
Understand the words when the user uses them, and answer in the type's own words rather than repeating them.
Each type is given below with its name, what it means, and how an edge A -[label]-> B of that type reads from A to B and, where the user gave one, from B back to A.

{{#each relationshipTypes}}
- {{name}}: {{#if description}}{{description}} {{/if}}Reads "A {{forwardLabel}} B"{{#if inverseLabel}}; from the other end, "B {{inverseLabel}} A"{{/if}}.
{{/each}}

### Current Scene
The nodes and edges the user has gathered around the central node.
The scene is evolving: it may hold only the central node, a loose context, or a detailed local structure.

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
**Edges between these nodes that the scene does not show:**
{{hiddenEdges}}
{{/if}}

{{#if selectedNodes}}
### Selected Nodes
Nodes the user has highlighted in the scene right now.
When a request refers to the selected node, or to what is selected, it means these.
Read each from all of its content: the comment is the user's own clarification and overrides a generic reading of the title, and the equation is the precise form the user means.

{{selectedNodes}}
{{/if}}

{{#if outsideConnections}}
### Central Node Connections Outside The Scene
Nodes connected to the central node but not included in the current scene, each shown with the edge that connects it.
This is graph structure the user has not brought into the scene.

{{outsideConnections}}
{{/if}}

{{#if remainingNodes}}
### Rest Of The Graph
Every remaining node: not in the current scene, and not already named above.
The graph may be incomplete; part of the user's work is building it, refining nodes, and identifying meaningful relationships between them.
Use this section to understand the larger project, to avoid proposing a concept that already exists, and to find existing nodes that belong in the current scene.
Together with the sections above it is the whole graph.

**Remaining nodes:**
{{remainingNodes}}
{{#if omittedNodeCount}}- ...and {{omittedNodeCount}} further nodes not listed here.{{/if}}
{{/if}}

{{#if shelf}}
### Node Shelf
Concepts you proposed earlier that the user has neither accepted nor discarded.
Nothing listed here is in the graph or in any scene — each is waiting for the user's decision.

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

These were proposed for scenes other than this one.
If one belongs here too, propose it: use `create_connected` with the title exactly as written above, and give a reason that says why it fits this scene rather than repeating why it existed.
It will be attached to the concept already waiting, not duplicated.
When a concept you are about to propose is the same idea as one waiting here, propose it under the waiting title rather than a synonym or a rephrasing of your own: a second name for the same idea is the one outcome to avoid.
If none of them fit, ignore the list — do not propose one merely because it is available.
{{/if}}
{{/if}}
