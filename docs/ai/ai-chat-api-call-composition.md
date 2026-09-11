# AI Chat API Call Composition

> **Status:** Current
>
> **Last reviewed:** 2026-09-10
>
> **Authority:** How a chat request is assembled and what happens to the reply. Everything *around*
> the prompt: the call envelope, which code builds which section of the system message, conversation
> history, the difference between what the timeline shows and what is sent, and the two math
> pipelines. The shelf's own model, filtering and acceptance rules are
> [shelf-architecture.md](shelf-architecture.md).
>
> **No prompt text lives here.** The verbatim rendering is
> [ai-prompt-etalon.md](ai-prompt-etalon.md), and it is the only copy in `docs/`. A second copy is
> what rotted this document between 2026-07-25 and 2026-09-09. Vendor transport and reply parsing
> are in [ai-provider-architecture.md](ai-provider-architecture.md); the timeline UI and chat
> storage are in [chat-panel-architecture.md](../chat-panel-architecture.md); what the assistant is
> for and how the AI layer is organized are in [ai-assistant-vision.md](ai-assistant-vision.md).

## Scope

What Knogra sends to the model when the user chats, and what it does with what comes back — with
the prompt itself held one document away, so this file can change when the mechanics change and the
etalon can change when the words change.

## Provider Call Shape

All AI chat requests go through `ChatSession.sendMessage()` in `src/ai/chat-session.ts`.

The provider interface receives two inputs:

```typescript
sendMessage(messages: ProviderMessage[], systemPrompt: string): Promise<AIResponse>
```

Four adapters map this shared shape onto their vendor API: Gemini, OpenAI, Anthropic and
OpenRouter. How each one does it, how a provider is resolved, how timeouts and errors are handled,
and how the JSON action block is parsed out of a reply are all in
[ai-provider-architecture.md](ai-provider-architecture.md).

The user API key and selected provider/model come from local settings. Knogra does not proxy these chat requests through a Knogra backend.

## The Envelope

One provider call carries three things.

- **system** — the system message, rebuilt from scratch on every call from the current scene. Never stored.
- **history** — every earlier message of this node's conversation whose `source` is `ai` or absent, as role/content pairs. Assistant turns hold the cleaned prose only: the JSON action block is stripped before storage, so the model never re-reads its own actions. A turn that produced shelf items holds the shelf's summary of what it accepted instead of the prose.
- **user** — the latest user message: a quick-action prompt or free-typed text.

The shelf reaches the model through the system message, in its own section: what is pending for this
scene, and what is pending elsewhere and not yet in the graph. Before that section existed, the
assistant's prose was the only surviving trace of what it had proposed, which is why action requests
did not forbid prose. That reason is gone.

## The System Message

One system message serves every request. Quick-action buttons supply a prewritten user message; they
do not select a different system prompt, a different provider mode, or command-specific context.
`buildSystemPrompt()` in `src/ai/context-builder.ts` assembles it from the current `SceneContext` and
`graphStore`. When the central node cannot be found it returns `SYSTEM_PROMPT.fallback` and nothing
else.

Its text is not reproduced here. The verbatim rendering, for one fixed graph fixture, is
[ai-prompt-etalon.md](ai-prompt-etalon.md).

### Where each section comes from

Every section is one of four kinds:

- **fixed** — a hardcoded string in `src/ai/prompts.ts`, identical on every call.
- **templated** — fixed prose with `{{placeholders}}` filled per call.
- **computed** — derived from the graph and scene at call time. The line shape is fixed by code; the content is the user's graph.
- **setting** — text the user typed into Settings, present only when non-empty.

In the order the model reads them:

| Section | Kind | Built by |
|---|---|---|
| Role | fixed | `SYSTEM_PROMPT.role` |
| `## Workspace` intro | fixed | `SYSTEM_PROMPT.workspaceIntro` |
| Central Node | templated | `renderCentralNodeSection()` |
| Relationship Types | templated + computed | `renderRelationshipTypesSection()`, one line per `EdgeType` |
| Current Scene | templated + computed | `renderVisibleSceneSection()` |
| Selected Nodes | templated + computed | `renderSelectedNodesSection()`; omitted when nothing is selected |
| Central Node Connections Outside The Scene | templated + computed | `renderConnectedConceptsSection()`; omitted when empty |
| Rest Of The Graph | templated + computed | `renderRestOfGraphSection()` |
| `## Response` intro | fixed | `SYSTEM_PROMPT.responseIntro` |
| Prose | fixed | `SYSTEM_PROMPT.prose` |
| Actions | fixed | `SYSTEM_PROMPT.actionSchema` |
| Equations | fixed | `SYSTEM_PROMPT.equations` |
| Language | setting | inline in `buildSystemPrompt()`, from `ai.responseLanguage` |
| Custom Instructions | setting | inline in `buildSystemPrompt()`, from `ai.customInstructions` |

Language and Custom Instructions are appended last and vanish entirely when their setting is empty.
They are the only two sections the user authors directly.

### The template renderer

`{{key}}` is substituted. `{{#if key}}...{{/if}}` drops its whole run when the value is empty, so the
model never sees a heading with nothing under it. Sections are joined with one blank line, and runs
of three or more newlines collapse to two, so a dropped placeholder leaves no gap behind.

### What "computed" computes

- **Scene context strength** is a coarse label — weak, moderate or strong, each with a parenthetical reason — derived from the number of non-central scene nodes, the number of scene edges, and how many of those edges touch the central node. `calculateSceneContextStrength()`.
- **Scene edges** are split in two by `splitInSceneEdges()`: those the scene includes, and those that exist in the graph between two nodes of the scene without being included in it. Both reach the model, under different headings, because the second set is meaning the user has recorded but is not currently looking at.
- **Outside connections** are node-based, one entry per neighbour of the central node that the scene does not hold, each shown with its edge. `getOutsideConnections()`.
- **Rest Of The Graph** is the true remainder: every node neither in the scene nor already named above. It is the only unbounded list, so it is the only one capped — see the etalon for the two limits and the sentence that announces truncation.
- **Every node list** uses one line format, built by `formatNodeForPrompt()`; only Selected Nodes uses a multi-line form. The central node is skipped inside lists because its own section carries the same content.
- **Every edge** is written `Source -[label]-> Target` by `formatEdgeArrow()`, the label being the type's forward label, else the type name, else `relates to`. An edge title follows as `— note: ...`.
- **Other properties** on the central node are its arbitrary saved properties except `equation`, which is shown separately because equations carry their own rendering and prompt rules.
- **Scene note** is `Scene.description`, absent on most scenes.

## User Messages

The request sent to the model always includes the current conversation history plus the latest user message.

For an arbitrary typed message, the same text is:

- saved in the chat timeline
- kept in memory for the LLM conversation
- sent to the provider as the latest `user` message

For quick actions, the visible chat text can differ from the hidden prompt sent to the LLM:

| Command | Prompt sent to the model | Text shown and stored in chat |
|---|---|---|
| Scene | Fixed text; see the etalon. | `Discuss “<central node title>” and the full content of the current scene.` (falls back to `Discuss the current scene.` when the central node has no title) |
| Node | Fixed text; see the etalon. | `Explain the selected node(s): “<selected titles>”.`, or `Explain “<central node title>”.` when nothing is selected |
| Suggest | Assembled from three parts; see the etalon. | `Suggest new concepts to add to my knowledge graph.` |
| Connect | Assembled from three parts; see the etalon. | `Find existing concepts that belong in this scene.` |

When Suggest or Connect carries a relationship slot, the slot's short label is appended to the
display text — "Suggest new concepts to add to my knowledge graph — child, Composition." — so two
otherwise identical requests are distinguishable in the timeline. The label never goes to the model;
the constraint sentence spliced into the prompt is what the model sees, and it is built alongside
the label in `src/ai/relationship-slot.ts` so the two cannot disagree.

Scene and Node display text is composed at click time in `chat-panel.ts` from the live selection and central node; the static `displayText` in `prompts.ts` is only the fallback. The prompt and context sent to the model are unaffected.

### What the four commands are for

Scene and Node are explanatory: they ask for prose and are told not to return actions. Scene
interprets the whole current scene and is deliberately not redirected by the selection unless the
selection is structurally important. Node explains the requested node or nodes as concepts — the
selection, or the central node when nothing is selected — using the scene only as invisible
calibration.

Suggest and Connect are action requests: Suggest proposes concepts that do not exist yet, Connect
finds existing nodes that belong in the scene. Both are assembled from an opening sentence, a
middle sentence carrying the relationship slot, and a closing sentence, so choosing a relationship
replaces exactly one sentence. `buildSlottedPrompt()` in `src/ai/prompts.ts` does the assembly.

The text of all four, and all four forms the slot can take, are in the etalon.

Quick actions may also have user-configured shortcut additions in settings. These additions are appended to the quick action's hidden prompt sent to the LLM, not to the global system prompt. The visible chat text remains the base display text so the timeline stays readable.

```md
{{base quick-action prompt}}

Additional instructions for this shortcut:
{{configured shortcut additions}}
```

The configured additions are intentionally additive. They should bias or narrow the shortcut behavior without replacing the base command intent.

## Math Rendering Contract

Math reaches the user through two pipelines with opposite formats.

**Chat prose** is rendered by `renderMarkdown()` and then typeset by MathJax in `chat-message-renderer.ts`. MathJax accepts `$...$`, `\(...\)`, `$$...$$`, `\[...\]`, and bare `\begin{env}...\end{env}` blocks, so no single model convention is privileged. Because the markdown pass injects `<p>`, `<br>`, `<em>`, and `<li>` into the text, math spans are lifted into placeholders before those transforms and restored afterwards; otherwise a multi-line `$$...$$` block is split across elements and never typesets. Fenced ` ```latex `, ` ```math `, and ` ```tex ` blocks are converted to display math.

**Node equations** (`properties.equation`) are compiled by `tex2svgPromise()` in the equation node designs, which treats the string as TeX source. Delimiters there are literal input and must not survive, so `latex-sanitizer.ts` strips them and repairs control characters left by JSON escape collisions (`\frac` parsing into a formfeed, `\nabla` into a newline). Provider adapters escape invalid `\u` sequences before `JSON.parse` so commands such as `\upsilon` do not abort the whole action block.

The contract for a stored equation value is defined once as `NODE_EQUATION_VALUE_RULES` in `prompts.ts` and reused verbatim by the chat action schema and by `EQUATION_SYSTEM_PROMPT`.

### Equation Generation Is A Separate Call

The node editor's equation generator (`equation-generator.ts`) does not use any of the chat composition above. It sends its own `EQUATION_SYSTEM_PROMPT` with a single user message containing the node title, the current equation, and the user's description — no graph, no scene, no conversation history — through a fresh provider instance. Its result returns to the node editor and is never written to the chat store, so it cannot enter a later chat request. The delimiter rule for chat prose therefore never reaches that call.

## Assistant Messages

The provider response may contain two parts:

- conversational text for the chat timeline
- an optional JSON action block

Provider adapters parse the JSON block and return actions separately from cleaned conversational content.

Recommendations that should become graph or scene changes must be represented as JSON actions, not prose-only suggestions. The assistant may explain the rationale for an action in the conversational response, but the shelf will only show actions parsed from the final JSON block.

Only shelf-supported actions are routed to the node shelf:

- `create_connected`
- `include_existing`

When the request carried a relationship slot, `stampSlot()` overwrites the model's `edgeType` and
`direction` on every action — but only on the axis the user actually named — before the actions
reach the shelf.

Actions are routed to the shelf *before* the assistant message is stored, and what the shelf accepts
decides what the timeline records: one line per accepted item, replacing the model's prose. A reply
that carried no actions, or whose actions were all rejected, stores its prose unchanged. What the
shelf accepts, and what happens when the user acts on an item, are in
[shelf-architecture.md](shelf-architecture.md); where an accepted node lands on the canvas is in
[node-placement.md](../node-placement.md).

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
| `src/ai/prompts.ts` | Quick-action prompts and their three-part assembly, system prompt templates, action schema. |
| `src/ai/context-builder.ts` | Builds the system prompt from graph, scene, and settings state. |
| `src/ai/chat-session.ts` | Loads per-node conversation, appends messages, builds context, sends provider calls. |
| `src/ai/relationship-slot.ts` | Builds the slot menu's choices and their constraint sentences; stamps a chosen slot onto returned actions. |
| `src/ai/edge-type-resolution.ts` | Turns the type name and direction a model wrote into what the graph stores. |
| `src/ai/latex-sanitizer.ts` | Repairs LaTeX damaged by JSON escape collisions and normalizes equation values. |
| `src/ai/providers/` | Vendor adapters, provider resolution, timeouts, and shared reply parsing. See [ai-provider-architecture.md](ai-provider-architecture.md). |
| `src/ai/shelf/node-shelf.ts` | Routes actions to the shelf store, summarizes what was accepted, and performs the edit when the user accepts an item. |
| `src/ai/shelf/shelf-store.ts` | Owns the shelf's persisted shape, its entries and placements, and its reconciliation. |
| `src/ui/panels/chat-panel/chat-panel.ts` | Renders quick-action buttons, supplies scene context to `ChatSession`, holds the pending slot. |
| `src/ui/panels/chat-panel/quick-action-menu.ts` | The relationship menu that opens on the Suggest and Connect buttons. |
| `src/ui/panels/panel-api.ts` | Routes parsed shelf actions from chat to the node shelf. |
