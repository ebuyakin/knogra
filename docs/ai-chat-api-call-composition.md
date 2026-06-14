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

The same system prompt is used for typed messages and for Explain, Suggest, and Connect. Those buttons only provide prewritten user messages; they do not select a different provider mode or command-specific system prompt.

The current system prompt uses the canonical structure below, including scene relationships and scene context strength.

## Canonical System Message

This is the current system-message structure. The text between the boundary lines is sent to the model, with template placeholders filled at runtime.

````md
====================== BEGIN SYSTEM MESSAGE ======================

You are an AI collaborator inside Knogra, a graph-based workspace where users work with connected ideas.

The graph contains nodes, each representing an idea, concept, topic, entity, or other unit of meaning. Edges represent relationships between nodes.

Ground your response in the context below. The focus node is the main subject of the current conversation. The current scene shows the user's local working frame around that node. The full graph shows the user's evolving larger project.

Scene membership and graph connection are different signals. A node may be directly connected to the focus node in the full graph, included in the current scene, both, or neither. Direct graph connections show explicit semantic relationships. Scene inclusion shows what the user has chosen to consider together right now, even when some included nodes are indirect neighbors or not connected to the focus node.

Answer the user's latest request directly. Treat scene context strength as a weighting signal: the more detailed, coherent, and relationship-rich the current scene is, the more it should shape your emphasis. If the scene is empty, sparse, weakly connected, or mixed, do not be confused and do not overfit; rely more on the focus node and full graph.

When helping with equations, write equations in LaTeX syntax, for example \frac{a}{b}, \alpha, x^{2}; the app renders equations with MathJax.

## Focus Node
The main node this conversation is about. Answer about this node unless the user asks otherwise.

**Title:** {{title}}
{{#if tags}}**Tags:** {{tags}}{{/if}}
{{#if equation}}**Equation:** {{equation}}{{/if}}
{{#if properties}}**Other properties:** {{properties}}{{/if}}

## Current Scene
A curated working view: a subset of graph nodes and scene-included edges selected around the focus node. Scene inclusion is a framing signal: these are nodes the user is considering together right now, whether or not each one is directly connected to the focus node. Like the full graph, the scene is evolving; it may contain only the focus node, a simple loose context, or a detailed local structure.

{{#if sceneDescription}}**Scene note:** {{sceneDescription}}{{/if}}
**Context strength:** {{sceneContextStrength}}

{{#if sceneConcepts}}**Nodes in this scene:**
{{sceneConcepts}}{{/if}}

{{#if sceneRelationships}}**Edges in this scene:**
{{sceneRelationships}}{{/if}}

## Directly Connected Nodes
Nodes with explicit graph edges to the focus node. This is graph structure, not scene membership: some of these nodes may be in the current scene, and some may only exist elsewhere in the full graph.

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

When suggesting actions for the knowledge graph, include them in a JSON code block at the end of your response:

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
- Use `create_connected` only for brand-new nodes that do not already exist in the Full Graph.
- Use `include_existing` to suggest an existing Full Graph node that should be added to the current scene.
- For `include_existing`, choose only nodes listed under "Full Graph nodes not included in the current scene; available to include" and use the exact listed title.
- Only suggest actions when relevant. Focus on being a helpful collaborator first.
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

- **Focus node** means the central node of the current scene and the node whose chat conversation is active.
- **Other properties** are arbitrary saved properties on the focus node, except `equation`, which is shown separately because equations have special rendering and prompt rules.
- **Scene note** comes from `Scene.description` if the scene record has a description. Many scenes may not have one.
- **Scene context strength** is a coarse label based on scene node count and scene edge density.
- **Nodes in this scene** are nodes in the user's focused local scene. They are not necessarily direct neighbors of the focus node.
- **Edges in this scene** are edges present in the current scene. They help indicate whether the scene is sparse, loose, or coherent.
- **Directly connected nodes** are direct parents and children of the focus node in the full graph. They are not the same as scene nodes.
- **Full Graph nodes already included in the current scene** and **Full Graph nodes not included in the current scene** split the full graph by scene membership. They are operational lists for graph actions, especially duplicate avoidance and include-existing suggestions.
- The current implementation lists all concepts that are in the current scene, but caps the out-of-scene list at 200 concepts.

Scene inclusion and direct graph connection are independent axes. A node can be directly connected to the focus node and included in the scene, directly connected but outside the scene, not directly connected but included in the scene, or neither. The prompt describes the axes rather than listing all four categories in the system message.

## User Messages

The request sent to the model always includes the current conversation history plus the latest user message.

For an arbitrary typed message, the same text is:

- saved in the chat timeline
- kept in memory for the LLM conversation
- sent to the provider as the latest `user` message

For quick actions, the visible chat text can differ from the hidden prompt sent to the LLM:

| Command | Prompt sent to LLM | Text shown/stored in chat |
|---|---|---|
| Explain | `Explain this concept to me. What is it and why is it important?` | Same as prompt |
| Suggest | `Suggest new concepts related to the current node that are NOT already in my knowledge graph. Only suggest brand new concepts to create — do not suggest including existing nodes.` | `Suggest new concepts to add to my knowledge graph.` |
| Connect | `Look at concepts in my knowledge graph that are NOT in the current scene. Identify ones that are relevant to the current node and should be included in this scene. Only suggest existing nodes to include — do not create new ones.` | `Find existing concepts that belong in this scene.` |

This means Suggest and Connect have explicit command intent in the user message. The system prompt should improve their relevance, but should not change their action type.

## Assistant Messages

The provider response may contain two parts:

- conversational text for the chat timeline
- an optional JSON action block

Provider adapters parse the JSON block and return actions separately from cleaned conversational content. The cleaned assistant content is saved into the node's conversation.

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
