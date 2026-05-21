# AI-Assisted Spatial Knowledge Graph Explorer — Product Vision (internal)

## One-liner
A learning workspace where a subject becomes a navigable graph of “learning points”, explored through node-focused spatial scene that you can manually shape, with AI helping you ask, build, and review. Knoledge graph meets Memory palace meets Mindmapping meets Prezi and all of that supplemented by AI assistant helping to build, navigate, make sense, memorize, and test knowledge.

## Problem
Complex subjects are inherently networked, but most learning media are linear (textbooks) or devolve into unusable “hairball” graphs (auto-generated PKM graphs) or overwhelming infinite canvases.

We want to close the structure–recall gap:
- keep the learner oriented while exploring non-linear knowledge
- make the *act of organizing* part of understanding and memorization
- support repeatable traversal paths for review, not just storage

## Product idea
Model a subject (body of knowledge) as a graph:
- **Node = learning point** (concept, experiment, person, equation, debate, idea, theorem, question etc.)
- **Edge = relationship** (logical, historical, causal, derivation, analogy, example of, expansion of …)
- **Node has attached knowledge objects**: notes, links, images, equations, code, PDFs/videos, tags/properties, AI chats focused on the topic (e.g. status: active/deferred/learned)

The key UX is not a single global map. It’s a sequence of **node-focused scenes** that the user travels.

## Core UX primitives
### 1) Node-focused scene (local manifold)
Every node can have one or more **scenes** (e.g. conceptual/historical/mathematical).
A scene defines:
- the subset of nearby nodes/edges included (rule-based and/or curated)
- a persistent **2D layout** (manual positioning encouraged, never mandatory)
- optional scene-level decorations (background image/icons/anchors) to strengthen spatial distinctiveness

### 2) Focus mechanic
- A node is always “centered” (active learning point).
- The graph canvas primarily shows the active node and its node-focused scene (which is some neighbourhood of the node in the graph).
- Node details (properties + attached materials + AI chat) are visible without losing graph context (side pane pattern, modal windows).

### 3) Travelling (the differentiator)
- Clicking a node in the current scene transitions to that node’s scene.
- The transition should **morph** (preserve visual continuity): shared nodes move smoothly; irrelevant nodes fade; new nodes appear.
- The goal is a “flashlight over a large landscape” feeling without rendering a single huge static graph.

## Modes
- **Construction mode**: create/edit nodes and edges, accept AI suggestions, arrange layouts, attach materials, discuss the node with AI assistant.
- **Travel / review mode**: mostly traverse views, read materials, recall, and test knowledge.

## AI responsibilities (scaffold, not dump)
1) **Contextual Q&A per node**
- Ask questions while focused on a node.
- Store the Q&A as an artifact attached to that node; optionally cross-link to other nodes mentioned/implicated.
- Convert some set of materials (e.g. a textbook) into a knowledge graph.

2) **Graph growth suggestions**
- Propose *nodes + relations* relevant to the active node and current scene type.
- UI should be proposal → curate: user approves what becomes real.
- (Optional UX concept) “ghost nodes”: suggested nodes appear semi-transparent; click to solidify.

3) **Graph-based tests / recall**
- Generate prompts and quizzes from graph structure: relationships, paths, analogies, definitions.
- Use the user’s current focus/scene type to keep testing relevant.

## Data model (conceptual)
- `Node`: id, title, type, tags/properties, attachments, ai_artifacts
- `Edge`: id, from, to, type, properties
- `Scene`: id, node_id (owner), scene_type, membership (rule + overrides), layout (node_id -> x,y), decorations
- `Attachment`: typed blobs/links/markdown/snippets with metadata
- `AIArtifact`: Q&A turns, summaries, suggestions accepted/rejected, provenance

Key property: **layout is per scene**, not global.

## Architecture principles
- **Local-first UX**: fast interactions, minimal cognitive load; autosave layout edits.
- **Pluggable storage**: graph store interface supports local DB (IndexedDB/SQLite) and/or remote graph DB.
- **Deterministic identities**: stable node/edge IDs so layouts, transitions, and AI references remain consistent.
- **Graph context as a tool**: AI reads/writes via a constrained API (graph query + propose changes), not via raw DB access.
- **Separation of concerns**:
  - client: rendering, interaction, layout editing, animations
  - server: auth (if needed), persistence/sync, AI orchestration, embeddings/retrieval

## Tech stack (high-level, not a commitment)
Client (hard part):
- web app with a graph/canvas library that supports manual positioning + programmatic animation (e.g. React Flow-class tooling, Cytoscape)
- smooth transitions between two layouts (scene A → scene B)

Server (TBD):
- lightweight API for graph CRUD + scene storage + AI calls (FastAPI-class is sufficient)

Storage options (TBD):
- local: IndexedDB (browser) or SQLite (desktop wrapper) for early prototyping
- remote: Neo4j / ArangoDB / SurrealDB-class graph store
- retrieval: embeddings index (pgvector/Pinecone-class) for node text + attachments + AI artifacts
