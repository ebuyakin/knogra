# AI Assistant: Vision & Architecture

> **Note:** The AI chat is one mode of the broader chat panel, which also serves as a notebook and tutorial content pane. See [Chat Panel Architecture](chat-panel-architecture.md) for the full panel design.

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

### B. Node Shelf (Suggestion Panel)

A horizontal shelf at the bottom of the viewport showing AI-suggested nodes. Two categories:

| Type | Badge | Click Action | Source |
|------|-------|-------------|--------|
| **Create New** | (none) | Creates new node + edge in graph & scene | AI generates title/properties |
| **Include Existing** | ∃ badge | Adds existing node to scene + restores edges | AI references by title |

**Create New** — AI suggests a new concept. Clicking creates the node connected to central.

**Include Existing** — AI suggests an existing graph node that isn't in the current scene. Clicking:
1. Resolves the title to a `nodeId` in `graphStore`
2. Calculates collision-free position (near selected node, or central if none selected)
3. Adds node to scene and restores all edges to nodes already in scene
4. If no edges exist, creates a fallback edge to selected or central node

**Deduplication rules:**
- `create_connected`: skip if title or equation already exists anywhere in graph
- `include_existing`: skip if node is already in current scene or already on shelf
- Re-filter on scene load (stale localStorage items get cleaned up)

**Right-click** on any shelf item shows a context menu with "Remove from shelf".

**UI distinction for existing nodes:**
- Small badge overlay (∃) on the shelf item, visually similar to the hidden-connections badge
- The preview renders the node's **actual design** from the database (not shelf design settings)

### C. Context & Prompt Architecture

The system prompt provides the AI with full graph awareness:

```
## Knowledge Graph
**In current scene:**
- Maxwell's Equations (∇·E = ρ/ε₀)
- Four-Potential (A_μ) (A_μ = (φ/c, -A))

**Not in current scene (available to include):**
- Lorentz Force
- Gauge Invariance
- Wave Equation (□²ψ = 0)
```

This enables the AI to:
- Avoid suggesting duplicates (`create_connected` for something that exists)
- Suggest relevant existing nodes (`include_existing`) with exact title matching
- Understand the full knowledge structure

**Action schema in prompt:**
```json
[
  { "type": "create_connected", "title": "...", "connectionType": "child", "properties": {...}, "reason": "..." },
  { "type": "include_existing", "title": "Exact existing title", "reason": "..." }
]
```

Note: `include_existing` uses `title` (not `nodeId`) — the AI doesn't know internal IDs. Title→nodeId resolution happens at parse time.

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
AI Response → gemini-adapter.ts (parse JSON)
  → chat-session.ts (emit actions)
  → panel-api.ts (route to shelf)
  → node-shelf.ts (filter, store, emit change)
  → suggestion-panel.ts (render with badge)

User clicks →
  → node-shelf.ts placeNode()
    → resolve title → nodeId
    → scene.includeExistingNode(nodeId)
```

### Data Flow: create_connected

```
AI Response → gemini-adapter.ts → chat-session.ts → panel-api.ts
  → node-shelf.ts → suggestion-panel.ts

User clicks →
  → node-shelf.ts placeNode()
    → graph.addConnectedNode(centralId, direction, title, props, design)
```

### Provider Layer (Vendor-Agnostic)

```
src/ai/providers/
├── provider.ts              # Interface, types, factory
├── gemini-adapter.ts        # Google Gemini (direct API)
└── openrouter-adapter.ts    # OpenRouter (OpenAI-compatible, multi-model)
```

**Interface:**
```typescript
interface AIProvider {
  sendMessage(
    messages: ChatMessage[],
    systemPrompt: string
  ): Promise<AIResponse>;
}

interface AIResponse {
  content: string;
  actions: ProposedAction[];
}
```

**Provider configuration (stored in localStorage via settings):**
```typescript
type ProviderType = 'gemini' | 'openrouter';

// Settings keys:
// ai.provider   → 'gemini' | 'openrouter'
// ai.model      → model identifier (e.g. 'gemini-2.0-flash', 'anthropic/claude-sonnet-4')
// ai.apiKey     → user's API key (BYOK — never sent to our servers)
```

**OpenRouter integration:**
- Endpoint: `https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatible)
- Model list: fetched from `https://openrouter.ai/api/v1/models` (public, no auth)
- Supports all major models (GPT-4o, Claude, Gemini, Llama, Mistral, etc.)
- Users bring their own OpenRouter API key

**Settings UI flow:**
1. User selects provider (Gemini / OpenRouter)
2. Enters API key (masked, stored in localStorage)
3. Selects model from dropdown (Gemini: 2-3 models; OpenRouter: fetched live)
4. On app load, key is read from settings → `createProvider()` → chat ready

**Key is loaded at startup** from localStorage (not from env variables).
Build-time `VITE_GEMINI_API_KEY` is removed in favour of runtime user-provided keys.

### Module Structure

```
src/ai/
├── types.ts              # ChatMessage, ProposedAction, ShelfAction, Conversation
├── chat-session.ts       # Manages current conversation
├── context-builder.ts    # Builds system prompt from graph state
├── node-shelf.ts         # Maintains shelf items from AI responses
├── shelf-design-selector.ts  # Selects visual design for shelf previews
├── prompts.ts            # Prompt templates
└── providers/            # (see above)

src/storage/
├── chat-store.ts         # IndexedDB for conversations

src/ui/
├── panels/
│   ├── chat-panel.ts     # Message history + input
│   ├── suggestion-panel.ts # Shelf rendering
│   └── panel-api.ts      # Routes actions between AI and UI
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
```typescript
type ProposedAction =
  | { type: 'include_existing'; title: string; reason: string }
  | { type: 'create_connected'; title: string; connectionType: 'child' | 'parent';
      properties?: Record<string, string>; reason: string }
  | { type: 'connect_nodes'; sourceId: NodeId; targetId: NodeId; reason: string }
  | { type: 'update_property'; nodeId: NodeId; propertyKey: string;
      propertyValue: string; reason: string }
  | { type: 'add_tag'; nodeId: NodeId; tag: string; reason: string };
```

### ShelfAction (subset routed to shelf)
```typescript
type ShelfAction = CreateConnectedAction | IncludeExistingAction;
```

---

## System Prompt Structure

The context builder assembles a dynamic system prompt:

```
You are a learning companion helping explore a knowledge graph.

## Current Situation
- Central concept: "{nodeTitle}"
- Description: "{nodeDescription}"
- Tags: {nodeTags}
- Equations: {nodeEquations}

## Connected Concepts
- Parents: {parentNodes}
- Children: {childNodes}

## Visible Scene
{sceneNodes with brief descriptions}

## Learning Journey
- Previous concepts explored: {recentHistory}
- Concepts with ongoing discussions: {nodesWithChats}

## Your Role
1. Answer questions about the current concept
2. Explain relationships to connected concepts
3. Suggest new concepts to explore (as structured actions)
4. Help with equations when asked
5. Identify gaps in the knowledge structure

## Response Format
Provide conversational response, then structured suggestions.
Use the following JSON format for suggestions:
[... action schema ...]
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
