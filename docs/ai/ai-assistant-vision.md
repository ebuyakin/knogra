# AI Assistant: Vision & Architecture

> **Status:** Current
>
> **Last reviewed:** 2026-09-10
>
> **Authority:** What the assistant is for, how its capabilities are meant to behave, and how the
> `src/ai` layer is organized. Deliberately holds no prompt text and no copy of the action schema:
> the prompt is [ai-prompt-etalon.md](ai-prompt-etalon.md), how a call is assembled is
> [ai-chat-api-call-composition.md](ai-chat-api-call-composition.md), and vendor transport is
> [ai-provider-architecture.md](ai-provider-architecture.md).
>
> **Related:** [Documentation map](../README.md), [Chat panel architecture](../chat-panel-architecture.md), [Product vision](../knogra-vision.md)

> **Note:** The AI chat is one mode of the broader chat panel, which also serves as a notebook and tutorial content pane. See [Chat Panel Architecture](../chat-panel-architecture.md) for the full panel design.

## Overview

Knogra's AI Assistant is a **situationally-aware learning companion** that helps users explore and build their knowledge graph. Unlike a generic chatbot, it understands the graph structure, the user's learning journey, and can propose concrete actions to develop the knowledge base.

---

## Core Principles

### 1. User-Driven Learning
The AI **suggests**, never executes automatically. The user decides what to add, connect, or explore. This maintains active learning engagement and better memorization.

### 2. Situational Awareness
The AI understands:
- **General awareness** — that the chat is part of the learning app (not a generic chat), what the application is, how it works, and the AI assistant's role.
- **Current concept** (central node of the scene)
- **Related concepts** (connected nodes, visible scene)
- **Current selection** (selected node or nodes when the user invokes the Node command)
- **Learning journey** (navigation history, previous discussions)
- **Graph structure** (what exists, what's missing)

### 3. Conversation Continuity
Each node has **one ongoing conversation** that persists across sessions. When switching scenes, the conversation for the new central node is loaded, allowing seamless continuation.

### 4. Structured Proposals
AI responses contain both:
- **Conversational text** (explanations, answers)
- **Structured actions** (node creation, connections, equation updates)

---

## Key Features

### A. Contextual Chat
- Conversation associated with each node (stored in IndexedDB)
- System prompt built dynamically from graph/scene state
- Conversation loaded/saved on scene transitions

Preconfigured chat commands provide common starting points without changing provider mode:

| Command | Purpose | Reply shape |
|---|---|---|
| **Scene** | Discuss the current scene as a whole around its central node. | Explanatory; actions forbidden. |
| **Node** | Explain the currently selected node(s) in scene context; falls back to the central node when nothing is selected. | Explanatory; actions forbidden. |
| **Suggest** | Propose brand-new concepts connected to the central node. | `create_connected` actions. |
| **Connect** | Find existing graph nodes that belong in the current scene. | `include_existing` actions. |

Suggest and Connect can be directed by relationship. Clicking either button opens a menu built from
the workspace's own edge types, grouped as Child, Parent and Any; picking a row constrains the
request to that relationship, and the app then stamps the user's choice onto every action that comes
back. Picking nothing leaves the model free to choose the relationship itself.

The visible timeline stores compact command text, while the provider receives the fuller hidden command prompt. Each command can have optional setting-driven additions appended to that hidden prompt. Exact command wording is in [ai-prompt-etalon.md](ai-prompt-etalon.md); how a call is assembled is in [AI chat API call composition](ai-chat-api-call-composition.md).

### B. Node Shelf (Suggestion Panel)

A horizontal shelf at the bottom of the viewport showing AI-suggested nodes. Two categories:

| Type | Badge | Click Action | Source |
|------|-------|-------------|--------|
| **Create New** | (none) | Creates new node + edge in graph & scene | AI generates title/properties |
| **Include Existing** | ∃ badge | Adds existing node to scene + restores edges | AI references by title |

**Create New** — AI suggests a new concept. Clicking creates the node and one edge to the central node, with the relationship type and direction the action carries.

**Include Existing** — AI suggests an existing graph node that isn't in the current scene. Clicking:
1. Resolves the title to a `nodeId` in `graphStore`
2. Calculates a collision-free position near the central node
3. Adds node to scene and restores all edges to nodes already in scene
4. If no edges exist, creates a fallback edge to the central node

Both paths anchor on the central node rather than the selection, because the request that produced
the suggestion named the central node; anchoring elsewhere would assert a relationship nobody asked
for.

**Deduplication rules:**
- `create_connected`: skip if title or equation already exists anywhere in graph
- `include_existing`: skip if node is already in current scene or already on shelf
- Re-filter on scene load (stale localStorage items get cleaned up)

**Right-click** on any shelf item shows a context menu with "Remove from shelf".

**UI distinction for existing nodes:**
- Small badge overlay (∃) on the shelf item, visually similar to the hidden-connections badge
- The preview renders the node's **actual design** from the database (not shelf design settings)

### C. Context & Prompt Architecture

The system prompt gives the model scene-aware graph context rather than a generic chat setup. It
distinguishes:

- the scene central node
- the workspace's own relationship vocabulary, so an edge reads as the sentence its type forms
- currently selected node(s), when present
- the scene's nodes and edges, and separately the edges that exist between scene nodes without being shown
- the central node's neighbours that the scene does not hold
- every remaining node in the graph

This enables the AI to:
- Avoid suggesting duplicates (`create_connected` for something that exists)
- Suggest relevant existing nodes (`include_existing`) with exact title matching
- Name a relationship type and direction for every action it proposes
- Treat scene membership, runtime selection, and graph connectivity as different signals
- Weight answers by scene richness instead of overfitting sparse scenes

`include_existing` uses `title` rather than `nodeId` — the model does not know internal ids, and
title-to-id resolution happens when the action reaches the shelf. Relationship type names resolve
the same way, in `src/ai/edge-type-resolution.ts`.

The schema itself, the resolution rules and the exact prompt text are in
[ai-prompt-etalon.md](ai-prompt-etalon.md) and are deliberately not repeated here.

### D. Equation Support
- AI can generate/edit LaTeX equations
- Equations stored in node properties (`properties.equation`, `properties.derivation`, etc.)
- Rendered via MathJax in both nodes and suggestion previews
- Update equation action integrated into chat flow

---

## Architecture

### Architecture Constraints
- **UI never accesses graphStore directly** — suggestion-panel renders from ShelfItem data, not from graphStore
- **Feature internals stay internal** — position calculation stays inside Scene, not exposed to AI module
- **AI module uses FeatureAPI only** — node-shelf makes one high-level call to Scene, doesn't orchestrate low-level operations
- **Scene owns compound operations** — `includeExistingNode()` encapsulates include + edges + position, similar to how Graph owns `addConnectedNode()`

### Data Flow: include_existing

```
AI Response → provider adapter (parse JSON)
  → chat-session.ts (emit actions)
  → chat-panel.ts (stamp the chosen relationship, if any)
  → panel-api.ts (route to shelf)
  → node-shelf.ts (filter, store, emit change)
  → suggestion-panel.ts (render with badge)

User clicks →
  → node-shelf.ts placeNode()
    → resolve title → nodeId
    → scene.includeExistingNode(nodeId, design, centralNodeId)
```

### Data Flow: create_connected

```
AI Response → provider adapter → chat-session.ts → chat-panel.ts → panel-api.ts
  → node-shelf.ts → suggestion-panel.ts

User clicks →
  → node-shelf.ts placeNode()
    → resolve edgeType + direction → edge type id, child/parent
    → graph.addConnectedNode(centralId, direction, title, props, design, edgeTypeId)
```

### Provider Layer

Four vendors are supported — Gemini, OpenAI, Anthropic and OpenRouter — behind one interface, with
the user's own key and no proxy. The registry, resolution and fallback order, timeouts, shared reply
parsing and the per-vendor facts are all in
[ai-provider-architecture.md](ai-provider-architecture.md) and are not repeated here.

### Module Structure

Folder granularity for the whole layer. The file-by-file map of the chat call chain is in
[AI chat API call composition](ai-chat-api-call-composition.md).

```
src/ai/
├── types.ts                  # Chat, proposed-action and relationship-slot types
├── chat-session.ts           # One conversation per node; builds context, sends calls
├── context-builder.ts        # Assembles the system prompt from graph and scene state
├── prompts.ts                # Prompt templates and quick-action assembly
├── relationship-slot.ts      # Edge types → menu choices, constraint sentences, stamping
├── edge-type-resolution.ts   # The model's words → edge type id and direction
├── node-shelf.ts             # Shelf items from AI responses; placement on accept
├── shelf-design-selector.ts  # Visual design for shelf previews
├── equation-generator.ts     # Self-contained equation call, no graph context
├── latex-sanitizer.ts        # Repairs LaTeX damaged by JSON escaping
├── providers/                # Vendor adapters, resolution, timeouts, reply parsing
├── node-image/               # SVG pictogram generation (own document set)
└── image-search/             # Wikimedia image retrieval into chat

src/storage/chat-store.ts     # IndexedDB conversations

src/ui/panels/
├── chat-panel/               # Timeline, input, quick actions, relationship menu
├── suggestion-panel.ts       # Shelf rendering
└── panel-api.ts              # Routes actions between AI and UI
```

---

## Data Model

### ChatMessage
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

### Conversation
```typescript
interface Conversation {
  nodeId: NodeId;
  messages: ChatMessage[];
  updatedAt: Date;
}
```

### ProposedAction

The union of everything the model may propose. Two members reach the node shelf,
`create_connected` and `include_existing`; the rest are defined but not routed there. Each shelf
action carries a relationship — a type name from the workspace vocabulary and a direction relative
to the central node.

The declarations are in `src/ai/types.ts` and are not copied here; the wire form the model writes,
and how each field is resolved, are in [ai-prompt-etalon.md](ai-prompt-etalon.md).

### ShelfAction (subset routed to shelf)
```typescript
type ShelfAction = CreateConnectedAction | IncludeExistingAction;
```

---

## Equation Handling

### Storage
Equations are stored as node properties:
- `properties.equation` — Main equation
- `properties.derivation` — Derivation steps
- `properties.example` — Example application
- (Extensible for other equation-related properties)

### Rendering
- MathJax renders equations in:
  - Node visuals
  - Suggestion panel previews
  - Chat messages (inline math)

### AI Generation
User can request equation generation/modification in chat:
- "Add the wave equation to this node"
- "Show me the derivation of E=mc²"
- "Fix the equation — use partial derivatives"

AI responds with `update_property` action containing LaTeX.

---

## Integration Points

### Scene Transitions
When scene changes:
1. Save current conversation to IndexedDB
2. Load conversation for new central node
3. Update chat panel display
4. Clear and rebuild suggestion panel

### Graph Modifications
When user accepts a suggestion:
1. Execute corresponding graph action (via FeatureAPI)
2. Remove item from suggestion panel
3. Optionally: AI acknowledges in chat

### Feature API Connection
Suggestions execute via existing features:
- `include_existing` → `scene.includeExistingNode(nodeId)`
- `create_connected` → `graph.addConnectedNode()`
- `connect_nodes` → `graph.addEdge()`
- `update_property` → `features.node.update()`

---

## Future Considerations

- **Streaming responses** — Provider interface can support `streamMessage()`
- **Multiple providers** — Add adapters without changing core logic
- **Learning analytics** — Track which suggestions accepted, concepts mastered
- **Spaced repetition** — AI suggests review based on time since last visit
- **Export/share journeys** — Curated paths through the graph
