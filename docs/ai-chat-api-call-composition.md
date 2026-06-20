# AI Chat API Call Composition

> **Status:** Current  
> **Last reviewed:** 2026-06-16  
> **Authority:** Current implementation contract for AI chat API calls and prompt/context assembly. Use with [AI assistant vision](ai-assistant-vision.md) and [Chat panel architecture](chat-panel-architecture.md).  

## Purpose

This document explains what Knogra sends to the integrated LLM when the user uses AI chat.

It has three jobs:

1. State the current API-call composition.
2. Define the canonical system-message structure.
3. Keep implementation notes separate from text that is actually sent to the model.

## Provider Call Shape

All AI chat requests go through `ChatSession.sendMessage()` in `src/ai/chat-session.ts`.

The provider interface receives two inputs:

```typescript
sendMessage(messages: ProviderMessage[], systemPrompt: string): Promise<AIResponse>
```

Provider adapters map this shared shape to their vendor API:

- **Gemini** sends `systemPrompt` as `systemInstruction` and conversation messages as `contents`.
- **OpenRouter** sends `systemPrompt` as the first `system` message, followed by conversation messages.

The user API key and selected provider/model come from local settings. Knogra does not proxy these chat requests through a Knogra backend.

## Current System Message Behavior

The system prompt is built dynamically by `buildSystemPrompt()` in `src/ai/context-builder.ts` from the current `SceneContext` and `graphStore`.

The same system prompt is used for typed messages and for quick actions. Quick-action buttons only provide prewritten user messages; they do not select a different provider mode or command-specific system prompt.

The current system prompt uses the canonical structure below, including scene relationships and scene context strength.

Terminology matters for this contract:

- **Central node** means the node that owns the current scene. The scene is a curated exploration of that node/topic.
- **Currently selected node(s)** means the user's runtime Cytoscape selection inside the current scene. Selection is not persisted and may contain one node, several nodes, or no nodes.
- Prompt text should use these terms consistently: central node for the scene owner, and currently selected node(s) for runtime selection.

## Canonical System Message

This is the current system-message structure. The text between the boundary lines is sent to the model, with template placeholders filled at runtime.

````md
====================== BEGIN SYSTEM MESSAGE ======================

You are an AI collaborator inside Knogra, a graph-based workspace where users work with connected ideas.

The graph contains nodes, each representing an idea, concept, topic, entity, or other unit of meaning. Edges represent relationships between nodes.

Ground your response in the context below. The scene central node is the main topic of the current scene. The current scene shows the user's curated working frame for exploring that central node. The full graph shows the user's evolving larger project. Currently selected node(s), when present, identify the requested subject for the Node quick action. Use section labels to interpret the context, but do not repeat app labels such as "central node" or "selected node" in the response unless the user asks about the app state.

Scene membership and graph connection are different signals. A node may be directly connected to the central node in the full graph, included in the current scene, both, or neither. Direct graph connections show explicit semantic relationships. Scene inclusion shows what the user has chosen to consider together right now, even when some included nodes are indirect neighbors or not connected to the central node.

Answer the user's latest request directly. Treat scene context strength as a weighting signal: the more detailed, coherent, and relationship-rich the current scene is, the more it should shape your emphasis. If the scene is empty, sparse, weakly connected, or mixed, do not be confused and do not overfit; rely more on the central node and full graph.

When helping with equations, write equations in LaTeX syntax, for example \frac{a}{b}, \alpha, x^{2}; the app renders equations with MathJax.

## Scene Central Node
The main topic of this scene. The scene exists to explore, study, question, or develop this node through the visible nodes and edges.

**Title:** {{title}}
{{#if tags}}**Tags:** {{tags}}{{/if}}
{{#if equation}}**Equation:** {{equation}}{{/if}}
{{#if properties}}**Other properties:** {{properties}}{{/if}}

{{#if selectedNodes}}## Currently Selected Node(s)
Use these node(s) as the requested subject when the latest request uses the Node quick action. This section is routing context; do not mention selection state in the response unless the user asks about it.

{{selectedNodes}}{{/if}}

## Current Scene
A curated working view: a subset of graph nodes and scene-included edges selected around the central node. Scene inclusion is a framing signal: these are nodes the user is considering together right now, whether or not each one is directly connected to the central node. Like the full graph, the scene is evolving; it may contain only the central node, a simple loose context, or a detailed local structure.

{{#if sceneDescription}}**Scene note:** {{sceneDescription}}{{/if}}
**Context strength:** {{sceneContextStrength}}

{{#if sceneConcepts}}**Nodes in this scene:**
{{sceneConcepts}}{{/if}}

{{#if sceneRelationships}}**Edges in this scene:**
{{sceneRelationships}}{{/if}}

## Directly Connected To Central Node
Nodes with explicit graph edges to the scene central node. This is graph structure, not scene membership: some of these nodes may be in the current scene, and some may only exist elsewhere in the full graph.

{{#if parents}}**Broader or parent nodes:**
{{parents}}{{/if}}
{{#if children}}**Related detail or child nodes:**
{{children}}{{/if}}

## Full Graph
The user's evolving graph as it currently exists, including nodes both inside and outside the current scene. It may be incomplete; part of the user's work is building it, refining nodes, and identifying meaningful relationships between them. Use this section to understand the larger project, avoid duplicate suggestions, and find existing nodes that could be included in the current scene.

{{#if inScene}}**Full Graph nodes already included in the current scene:**
{{inScene}}{{/if}}

{{#if notInScene}}**Full Graph nodes not included in the current scene; available to include:**
{{notInScene}}{{/if}}

## Response Format

When suggesting actions for the knowledge graph, include them in a JSON code block at the end of your response. The node shelf is populated only from this JSON action block:

```json
[
   {
      "type": "create_connected",
      "title": "New Concept Name",
      "connectionType": "child",
      "properties": { "equation": "x = y^{2}" },
      "reason": "Brief explanation"
   },
   {
      "type": "include_existing",
      "title": "Exact title of existing node",
      "reason": "Brief explanation why this existing node belongs in the current scene"
   }
]
```

Action rules:
- Follow the user's latest request. Scene context should improve relevance, not override what the user asked for.
- If you recommend adding a brand-new concept, include a matching `create_connected` action in the JSON block. Do not present recommended new concepts only in prose.
- If you recommend including an existing concept in the current scene, include a matching `include_existing` action in the JSON block. Do not present recommended existing concepts only in prose.
- You may briefly explain why suggested actions are useful in the conversational response, but every actionable concept mentioned there must also appear in the JSON block.
- Use `create_connected` only for brand-new nodes that do not already exist in the Full Graph.
- Use `include_existing` to suggest an existing Full Graph node that should be added to the current scene.
- For `include_existing`, choose only nodes listed under "Full Graph nodes not included in the current scene; available to include" and use the exact listed title.
- Only suggest actions when relevant. Prioritize being a helpful collaborator first.
- When a node has an equation, write it in LaTeX syntax. Never use Unicode math symbols or informal notation.

======================= END SYSTEM MESSAGE =======================
````

## Runtime-Appended Sections

These sections are not part of the bounded core prompt above, but the app may append them after it.

### Language

If the user has configured a preferred AI response language in settings, the app appends:

```md
## Language
Always respond in {{language}}. Use {{language}} for node titles and concept names in your suggestions.
```

If no preferred language is configured, this section is omitted.

### Custom Instructions

If the user has configured extra AI instructions in settings, the app appends:

```md
## Custom Instructions
{{customInstructions}}
```

If no custom instructions are configured, this section is omitted.

## Implementation Notes Not Sent To The Model

This section explains fields in the prompt. It is documentation for developers, not system-message text.

- **Central node** means the node that owns the current scene and the node whose chat conversation is active.
- **Currently selected node(s)** are the user's runtime Cytoscape selection inside the current scene. They are not persisted and can differ from the central node.
- **Other properties** are arbitrary saved properties on the central node, except `equation`, which is shown separately because equations have special rendering and prompt rules.
- **Scene note** comes from `Scene.description` if the scene record has a description. Many scenes may not have one.
- **Scene context strength** is a coarse label based on scene node count and scene edge density.
- **Nodes in this scene** are nodes in the user's curated local scene. They are not necessarily direct neighbors of the central node.
- **Edges in this scene** are edges present in the current scene. They help indicate whether the scene is sparse, loose, or coherent.
- **Directly connected to central node** lists direct parents and children of the central node in the full graph. They are not the same as scene nodes.
- **Full Graph nodes already included in the current scene** and **Full Graph nodes not included in the current scene** split the full graph by scene membership. They are operational lists for graph actions, especially duplicate avoidance and include-existing suggestions.
- The system lists all concepts that are in the current scene, but caps the out-of-scene list at 200 concepts.

Scene inclusion and direct graph connection are independent axes. A node can be directly connected to the central node and included in the scene, directly connected but outside the scene, not directly connected but included in the scene, or neither. The prompt describes the axes rather than listing all four categories in the system message.

## User Messages

The request sent to the model always includes the current conversation history plus the latest user message.

For an arbitrary typed message, the same text is:

- saved in the chat timeline
- kept in memory for the LLM conversation
- sent to the provider as the latest `user` message

For quick actions, the visible chat text can differ from the hidden prompt sent to the LLM:

| Command | Prompt sent to LLM | Text shown/stored in chat |
|---|---|---|
| Scene | See [Canonical Scene Message](#canonical-scene-message). | `Discuss the current scene.` |
| Node | See [Canonical Node Message](#canonical-node-message). | `Explain the selected node(s).` |
| Suggest | `Suggest new concepts related to the scene central node that are NOT already in my knowledge graph. Only suggest brand new concepts to create — do not suggest including existing nodes. Return each suggested new concept as a create_connected action so it appears on the node shelf.` | `Suggest new concepts to add to my knowledge graph.` |
| Connect | `Look at concepts in my knowledge graph that are NOT in the current scene. Identify ones that are relevant to the scene central node and should be included in this scene. Only suggest existing nodes to include — do not create new ones. Return each suggested existing concept as an include_existing action so it appears on the node shelf.` | `Find existing concepts that belong in this scene.` |

This means Suggest and Connect have explicit command intent in the user message. The system prompt should improve their relevance, but should not change their action type.

Scene and Node provide two different explanatory shortcuts: Scene asks about the scene-level construction around the central node, while Node asks about the currently selected node(s) in the context of that central node and scene.

### Canonical Scene Message

The Scene quick action asks the assistant to interpret the whole current scene. It should not be redirected by the currently selected node(s), except when the selection is obviously important to understanding the scene structure.

The text between the boundary lines is sent as the latest user message for the Scene quick action, with shortcut-specific additions appended afterward if configured.

```md
====================== BEGIN SCENE MESSAGE ======================

Discuss the subject of the current scene as a whole.

The scene central node is the main topic. Use the visible nodes and edges as clues about the user's current angle, depth, and stage of exploration, then explain and develop the substance of that topic through the scene content. If the scene is rich, use its relationships to structure a more specific discussion. If the scene is sparse or contains only the central node, treat it as an early exploration and give a useful orientation to the topic without assuming the missing context is intentional.

Do not concentrate on any currently selected node unless it is clearly central to the scene structure. Avoid mostly describing the scene as an artifact or narrating the user's construction process; respond to the topic itself as illuminated by this scene.

Do not propose graph actions or include a JSON action block unless additions or changes would be genuinely useful for this scene-level discussion.

======================= END SCENE MESSAGE =======================
```

### Canonical Node Message

The Node quick action asks about the currently selected node(s), not necessarily the central node. It uses the requested node(s) as the primary subject and the scene's main topic as the interpretive context.

If no node is selected, Node falls back to explaining the main topic of the scene. If the requested node is also the main topic, Node explains that topic using scene content to infer what kind of explanation the user is looking for.

The text between the boundary lines is sent as the latest user message for the Node quick action, with shortcut-specific additions appended afterward if configured.

```md
======================= BEGIN NODE MESSAGE =======================

Explain the node or nodes identified for this request.

Concentrate on what the requested node(s) mean, why they matter, and how they help illuminate the subject of this scene. Use the main topic of the scene, visible scene nodes, and scene edges as context for the explanation. Start with the concept itself, not with interface status or a description of where the node appears.

If the requested node is also the main topic of the scene, explain the topic directly, using the scene contents to infer what kind of explanation the user is looking for. If multiple nodes are requested, explain them together and compare their roles in the scene. If no node is identified for this request, explain the main topic of the scene in its scene context.

Avoid turning this into a full scene review except where scene context clarifies the requested node(s). Do not propose graph actions or include a JSON action block unless additions or changes would be genuinely useful for this node-level explanation.

======================== END NODE MESSAGE ========================
```

Quick actions may also have user-configured shortcut additions in settings. These additions are appended to the quick action's hidden prompt sent to the LLM, not to the global system prompt. The visible chat text remains the base display text so the timeline stays readable.

```md
{{base quick-action prompt}}

Additional instructions for this shortcut:
{{configured shortcut additions}}
```

The configured additions are intentionally additive. They should bias or narrow the shortcut behavior without replacing the base command intent.

## Assistant Messages

The provider response may contain two parts:

- conversational text for the chat timeline
- an optional JSON action block

Provider adapters parse the JSON block and return actions separately from cleaned conversational content. The cleaned assistant content is saved into the node's conversation.

Recommendations that should become graph or scene changes must be represented as JSON actions, not prose-only suggestions. The assistant may explain the rationale for an action in the conversational response, but the shelf will only show actions parsed from the final JSON block.

Only shelf-supported actions are routed to the node shelf:

- `create_connected`
- `include_existing`

The shelf filters invalid or duplicate actions before displaying them:

- `create_connected` is skipped if the suggested title or equation already exists anywhere in the graph.
- `include_existing` is skipped if the title is not found in the graph or the node is already in the current scene.

When the user accepts a shelf item:

- `create_connected` creates a new graph node and edge connected to the current central node.
- `include_existing` adds an existing graph node to the current scene and connects it to the active node when possible, falling back to the scene's central node.

## AI, Notes, Tutorial, And Legacy Messages

The chat panel timeline can contain AI dialog, user notes, and tutorial content. Only AI dialog is included in future AI requests. Notes and tutorial content are timeline content, not part of the AI conversation.

Message source semantics are:

| Source | Meaning for AI request history |
|---|---|
| `ai` | Include. |
| `undefined` | Include as legacy AI dialog. |
| `note` | Exclude. |
| `tutorial` | Exclude. |

Provider history is filtered to AI/legacy messages only: provider calls include only messages whose `source` is `ai` or `undefined`.

This matters because `ChatSession` loads the node's full timeline into memory. Filtering prevents notes or tutorial messages from being sent to the LLM as if they were part of the AI conversation.

## Files And Responsibilities

| File | Responsibility |
|---|---|
| `src/ai/prompts.ts` | Quick-action prompts, system prompt templates, action schema. |
| `src/ai/context-builder.ts` | Builds the dynamic system prompt from graph, scene, and settings state. |
| `src/ai/chat-session.ts` | Loads per-node conversation, appends messages, builds context, sends provider calls. |
| `src/ai/providers/gemini-adapter.ts` | Maps provider call shape to Gemini and parses response actions. |
| `src/ai/providers/openrouter-adapter.ts` | Maps provider call shape to OpenRouter and parses response actions. |
| `src/ai/node-shelf.ts` | Filters and stores actionable node suggestions, then places accepted suggestions. |
| `src/ui/panels/chat-panel/chat-panel.ts` | Renders quick-action buttons and supplies current scene context to `ChatSession`. |
| `src/ui/panels/panel-api.ts` | Routes parsed shelf actions from chat to the node shelf. |
