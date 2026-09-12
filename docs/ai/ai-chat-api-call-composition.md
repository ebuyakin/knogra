# AI Chat API Call Composition

> **Status:** Current
>
> **Last reviewed:** 2026-09-12
>
> **Authority:** How a chat request is assembled and what happens to the reply. Everything around
> the prompt text: the call envelope, where the text comes from and what fills it, conversation
> history, the difference between what the timeline shows and what is sent, the reply contract, and
> the two math pipelines. The shelf's own model, filtering and acceptance rules are
> [shelf-architecture.md](shelf-architecture.md).
>
> **No prompt text lives here, or anywhere in `docs/`.** Since 2026-09-12 the text is the Markdown
> files in `src/ai/prompts/`, and they are the only copy. Read them directly; they are written to be
> read. Vendor transport and reply parsing are in
> [ai-provider-architecture.md](ai-provider-architecture.md); the timeline UI and chat storage are in
> [chat-panel-architecture.md](../chat-panel-architecture.md); what the assistant is for and how the
> AI layer is organized are in [ai-assistant-vision.md](ai-assistant-vision.md).

## Scope

What Knogra sends to the model when the user chats, and what it does with what comes back.

## Provider Call Shape

All AI chat requests go through `ChatSession.sendMessage()` in `src/ai/chat-session.ts`.

The provider interface receives two inputs:

```typescript
sendMessage(messages: ProviderMessage[], systemPrompt: string): Promise<AIResponse>
```

Four adapters map this shared shape onto their vendor API: Gemini, OpenAI, Anthropic and
OpenRouter. Every adapter passes the system prompt and the messages through unchanged; only the
envelope differs. How each one does it, how a provider is resolved, how timeouts and errors are
handled, and how the JSON action block is parsed out of a reply are all in
[ai-provider-architecture.md](ai-provider-architecture.md).

The user API key and selected provider/model come from local settings. Knogra does not proxy these
chat requests through a Knogra backend.

## The Envelope

One provider call carries three things.

    system    the system message, rebuilt from scratch on every call from the current scene. Never stored.
    history   every earlier message of this node's conversation whose source is ai or absent, as role/content
              pairs. Assistant turns hold the prose only: the JSON action block is stripped before storage,
              so the model never re-reads its own actions.
    user      the latest user message: a quick-action message or free-typed text.

The shelf reaches the model through the system message, in its own section: what is pending for
this scene, and what is pending elsewhere and not yet in the graph. That section, not the
conversation history, is how the model knows what it has already proposed.

## Where The Text Comes From

Every sentence the model reads is in a Markdown file under `src/ai/prompts/`. Code supplies values:
titles, one-line lists, counts, settings, and the flags that decide which blocks exist. Nothing in
TypeScript is prose, with two exceptions noted below.

    system-prompt.md   the system message: role, {{> workspace}}, the Response contract, Language, Custom Instructions
    workspace.md       the Workspace half: central node, relationship types, current scene, selected nodes,
                       outside connections, rest of the graph, node shelf
    scene.md           the Scene button's message
    node.md            the Node button's message
    suggest.md         the Suggest button's message: opening, {{> edge-type}}, closing, shortcut additions
    connect.md         the Connect button's message, same shape
    edge-type.md       what is said about the relationship wanted; one of four forms, shared by Suggest and Connect

The exceptions: the four `displayText` strings in `prompts.ts` are timeline labels the model never
sees, and the letter `X` standing for the proposed node appears both in the arrows code builds and in
the sentences of `edge-type.md`.

### The renderer

`src/ai/prompts.ts` reads every `.md` in the folder by file name (`import.meta.glob`, inlined into
the bundle at build time; nothing is fetched at runtime) and renders four constructs:

    {{name}}                      a value: string or number
    {{#if name}} ... {{/if}}      kept when the value is truthy: a non-empty string, a non-zero number,
                                  true, a non-empty list. Blocks nest.
    {{#each name}} ... {{/each}}  repeated once per record in a list, with the record's fields inside.
                                  Does not nest.
    {{> name}}                    the file name.md, rendered in place with the same data

A data record declares every placeholder its file may use, present even when empty. A key the
record does not have is therefore a misspelling, in the file or in the code, never an empty value:
dev builds throw on it and on any `{{...}}` left after rendering; production warns and carries on.
Runs of three or more newlines collapse to two, so a dropped block leaves no gap.

The files are laid out one sentence per line, and the model receives them that way. Sentences that
were separated by spaces when the text lived in TypeScript are now separated by newlines; nothing
else changed in the move.

## The System Message

One system message serves every request. Quick-action buttons supply a prewritten user message; they
do not select a different system prompt, a different provider mode, or command-specific context.
`buildSystemPrompt()` in `src/ai/context-builder.ts` fills the `SystemPromptData` record from the
current `SceneContext`, `graphStore`, the shelf store and two settings, and `renderSystemPrompt()`
renders `system-prompt.md` with it. When the central node cannot be found, a session still loaded
for a node deleted underneath it, `buildSystemPrompt()` returns `null` and `ChatSession` refuses the
send with an error in the chat; no degraded prompt is sent and no user turn is stored.

### What code computes

    Scene context strength    a coarse label, weak / moderate / strong with a parenthetical reason, from the number
                              of non-central scene nodes, the number of scene edges, and how many touch the central
                              node. calculateSceneContextStrength().
    Scene edges               split in two by splitInSceneEdges(): those the scene includes, and those that exist in
                              the graph between two scene nodes without being included. Both reach the model under
                              different headings, because the second set is meaning the user has recorded but is not
                              looking at.
    Outside connections       one entry per neighbour of the central node that the scene does not hold, each with its
                              edge. getOutsideConnections().
    Rest Of The Graph         the true remainder: every node neither in the scene nor already named above. The only
                              unbounded list, so the only one capped: the first 200 nodes, comments trimmed to 200
                              characters. The count of omitted nodes goes to the file, which says so on the last line.
    Node shelf                this scene's placements, and the entries pending elsewhere that are not yet in the graph,
                              capped at 50 with the omitted count announced the same way.
    Every node list           one line format from formatNodeForPrompt(); only Selected Nodes uses a multi-line form.
                              The central node is skipped inside lists because its own section carries the same content.
    Every edge                Source -[label]-> Target from formatEdgeArrow(), the label being the type's forward
                              label, else the type name, else "relates to". An edge title follows as "— note: ...".
    Relationship types        one record per EdgeType for the file's {{#each}}: name, description, forward label,
                              inverse label. The reading sentence is in the file.
    Other properties          the central node's saved properties except comment and equation, which have their own lines.
    Language, Custom          the two settings, trimmed; their sections exist only when non-empty. They are the only
    Instructions              two sections the user authors directly.

## User Messages

The request sent to the model always includes the current conversation history plus the latest
user message.

For an arbitrary typed message, the same text is saved in the chat timeline, kept in memory for the
conversation, and sent to the provider as the latest user message.

For quick actions, the visible chat text differs from the message sent:

    Scene      scene.md          "Discuss “<central node title>” and the full content of the current scene."
    Node       node.md           "Explain the selected node(s): “<titles>”." or "Explain “<central node title>”."
    Suggest    suggest.md        "Suggest new concepts to add to my knowledge graph."
    Connect    connect.md        "Find existing concepts that belong in this scene."

`resolveQuickActionMessage()` in `prompts.ts` renders the file named by the action id with the
shortcut's additional instructions and, for Suggest and Connect, the relationship the user chose.
Scene and Node display text is composed at click time in `chat-panel.ts` from the live selection and
central node; the static `displayText` in `prompts.ts` is only the fallback.

### The relationship slot

The menu on the Suggest and Connect buttons offers the workspace's edge types under Child, Parent
and Any. `buildSlotGroups()` in `src/ai/relationship-slot.ts` builds each menu row and, beside it,
the `EdgeTypeConstraint` record that `edge-type.md` renders. Exactly one of the record's four form
flags is true:

    anyRelationship   the button itself, or "Any" on the menu. Type and direction free.
    bothAxes          a type under Child or Parent. The arrow carries the direction: BMW -[has part]-> X,
                      with the readings in the type's own words.
    directionOnly     the Child or Parent heading itself. The arrow loses its label: BMW -> X.
    typeOnly          a type under Any. Named in words, since an arrow would assert a direction the user left open.

The record also carries the arrow, the forward and inverse readings, the central title and the type
name; the file uses whichever its form needs. Building the row label and the record in one place is
what keeps what the user picked and what the model is told from disagreeing.

When a slot is carried, its short label is appended to the display text, "Suggest new concepts to
add to my knowledge graph — child, Composition.", so two otherwise identical requests are
distinguishable in the timeline. The label never goes to the model.

### Shortcut additions

Each of the four quick actions has a setting for additional instructions. When non-empty, the text
is appended to that action's message under "Additional instructions for this shortcut:", by the
file's own `{{#if shortcutInstructions}}` block. It never reaches the system prompt, and the visible
chat text stays the base display text. The additions are meant to bias or narrow the shortcut, not
replace it.

### What the four commands are for

Scene and Node are explanatory. Scene interprets the whole current scene and is deliberately not
redirected by the selection unless the selection is structurally important. Node explains the
requested node or nodes as concepts, the selection or the central node when nothing is selected,
using the scene only as invisible calibration. Both files currently end with "Reply in prose only";
that is a sentence in the file, not a code path, and can be removed to let them propose actions.

Suggest proposes concepts that do not exist in the graph, brand-new or already waiting on the shelf
for another scene; Connect finds existing nodes that belong in the scene. Both ask for the action
block and neither forbids prose.

## Assistant Messages

A reply is prose, and may end with one JSON action block. The system message asks for the prose
every time, including on action requests, and asks that it not list the block item by item.
Provider adapters parse the block and return the actions separately from the prose.

Recommendations that should become graph or scene changes must be represented as actions, not
prose-only suggestions; the shelf is populated only from the block.

Only shelf-supported actions are routed to the node shelf: `create_connected` and
`include_existing`. When the request carried a relationship slot, `stampSlot()` overwrites the
model's `edgeType` and `direction` on every action, but only on the axis the user actually named,
before the actions reach the shelf.

What the timeline stores is the prose, as the model wrote it, for every kind of request. A reply
that carried a block and no prose would store an empty turn, which providers reject when it is
replayed as history, so it stores a fixed line instead ("Suggestions added to the node shelf."). Between
2026-09-10 and 2026-09-12 a reply with accepted actions stored the shelf's one-line-per-item summary
in place of the prose; turns stored then remain as they were. What the shelf accepts, and what
happens when the user acts on an item, are in [shelf-architecture.md](shelf-architecture.md); where
an accepted node lands on the canvas is in [node-placement.md](../node-placement.md).

## The Reply Contract

The action block's shape is stated in `system-prompt.md` under Actions. This is what the app does
with each field.

### Resolving edgeType

The model writes a type as a string; `src/ai/edge-type-resolution.ts` resolves it to an edge type id.

    1. exact match on a type name, case-insensitive, trimmed        "Composition" → that type
    2. failing that, exact match on a forward label, same rules     "has part"    → that type
    3. failing that, or when the field is missing, the default      anything else → first type in registry order

Step 2 exists because every edge in the prompt is written with its label, not its name, so the
label is the string the model has actually been reading. Inverse labels are deliberately not
matched: "is part of" would mean the Composition type with its direction reversed, and there is no
way to tell whether the model had already accounted for that in its own `direction` field.

### Resolving direction

    "new -> central"          edge from the new node to the central node
    "central -> new"          edge from the central node to the new node
    missing or unrecognised   treated as "central -> new"

`include_existing` uses "existing -> central" and "central -> existing" the same way. When the
graph already holds an edge between that node and the central node, that edge is used as it is and
both fields are ignored.

### What each field becomes

    title        the new node's title, or the lookup key for an existing node
    edgeType     the created edge's type
    direction    which end of that edge the new node takes
    properties   the new node's properties; equation is stored raw, comment is the node's own description
    reason       shelf text for one scene, never stored on the node

### Shelf items written before the relationship slot existed

Items already in `localStorage` from before 2026-09-09 carry `connectionType: "child" | "parent"`
and no `edgeType`. Only "parent" is rewritten, to "new -> central"; "child" and a missing value
fall through the direction fallback above to "central -> new". The edge type is the default in
every case.

## Math Rendering Contract

Math reaches the user through two pipelines with opposite formats.

Chat prose is rendered by `renderMarkdown()` and then typeset by MathJax in
`chat-message-renderer.ts`. MathJax accepts `$...$`, `\(...\)`, `$$...$$`, `\[...\]`, and bare
`\begin{env}...\end{env}` blocks, so no single model convention is privileged. Because the markdown
pass injects `<p>`, `<br>`, `<em>`, and `<li>` into the text, math spans are lifted into
placeholders before those transforms and restored afterwards; otherwise a multi-line `$$...$$`
block is split across elements and never typesets. Fenced ` ```latex `, ` ```math `, and ` ```tex `
blocks are converted to display math.

Node equations (`properties.equation`) are compiled by `tex2svgPromise()` in the equation node
designs, which treats the string as TeX source. Delimiters there are literal input and must not
survive, so `latex-sanitizer.ts` strips them and repairs control characters left by JSON escape
collisions (`\frac` parsing into a formfeed, `\nabla` into a newline). Provider adapters escape
invalid `\u` sequences before `JSON.parse` so commands such as `\upsilon` do not abort the whole
action block.

The contract for a stored equation value is stated in `system-prompt.md` under Equations, and a
second time as `NODE_EQUATION_VALUE_RULES` in `equation-generator.ts`. Two copies on purpose: the
equation generator is independent of the chat and may come to say something different.

### Equation generation is a separate call

The node editor's equation generator (`equation-generator.ts`) does not use any of the chat
composition above. It sends its own system prompt with a single user message containing the node
title, the current equation, and the user's description, no graph, no scene, no conversation
history, through a fresh provider instance. Its result returns to the node editor and is never
written to the chat store, so it cannot enter a later chat request.

## AI, Notes, Tutorial, And Legacy Messages

The chat panel timeline can contain AI dialog, user notes, and tutorial content. Only AI dialog is
included in future AI requests.

    ai          include
    undefined   include, as legacy AI dialog
    note        exclude
    tutorial    exclude

This matters because `ChatSession` loads the node's full timeline into memory. Filtering prevents
notes or tutorial messages from being sent to the model as if they were part of the AI conversation.

## Diagnostics

`DEBUG.d_chat = true` in the console prints every request as handed to the provider, the system
prompt and each message in order, and every reply as the model wrote it before the prose and the
block are separated. It is the way to see what the model sees; the files show the text, the trace
shows the text filled in.

## Files And Responsibilities

    src/ai/prompts/*.md                     the text. Seven files, listed above.
    src/ai/prompts.ts                       the renderer; the SystemPromptData and quick-action record types; the
                                            quick-action table; resolveQuickActionMessage()
    src/ai/context-builder.ts               fills SystemPromptData from graph, scene, shelf and settings; buildSystemPrompt()
    src/ai/chat-session.ts                  loads a node's conversation, refuses a send without a central node, sends the
                                            call, stores the prose, routes actions
    src/ai/relationship-slot.ts             edge types → menu rows and their EdgeTypeConstraint records; stamps a chosen
                                            slot onto returned actions
    src/ai/edge-type-resolution.ts          the type name and direction a model wrote → what the graph stores
    src/ai/latex-sanitizer.ts               repairs LaTeX damaged by JSON escape collisions; normalizes equation values
    src/ai/providers/                       vendor adapters, provider resolution, timeouts, shared reply parsing
    src/ai/shelf/node-shelf.ts              routes actions to the shelf store; performs the edit when the user accepts an item
    src/ai/shelf/shelf-store.ts             the shelf's persisted shape, entries and placements, reconciliation
    src/ui/panels/chat-panel/chat-panel.ts  quick-action buttons, scene context for ChatSession, the pending slot
    src/ui/panels/chat-panel/quick-action-menu.ts   the relationship menu on the Suggest and Connect buttons
    src/ui/panels/panel-api.ts              routes parsed shelf actions from chat to the node shelf
