# Knogra Documentation Map

> **Status:** Current index  
> **Last reviewed:** 2026-09-10  
> **Authority:** Use this file to orient within `docs/`. It classifies documents by current usefulness and points to the canonical sources when older documents overlap.

> **Folder structure in progress.** The AI documents moved into `ai/` on 2026-09-10; other subject
> folders are being introduced the same way. Cross-references inside documents and in code comments
> have not all been repointed yet, so a relative link may be stale even when the target exists.

## Status Legend

| Status | Meaning |
|---|---|
| Current | Describes the current product, architecture, or implementation model. |
| Current with caveats | Mostly current, but has a named area that should be verified before relying on it. |
| Draft | Active proposal or work-in-progress spec; not yet ratified or implemented. |
| Historical | Useful for project memory, rationale, or completed implementation history; not a source of current requirements. |
| Superseded | Replaced by another document for current decisions. Keep only as background. |
| Deferred | Valid design idea intentionally postponed beyond v1. |
| Scratchpad | Non-canonical notes, rejected drafts, or raw thinking. |

## Product And Planning

| Document | Status | Notes |
|---|---|---|
| [knogra-vision.md](knogra-vision.md) | Current | Product direction and core UX primitives. |
| [roadmap.md](roadmap.md) | Draft | Raw idea list for v2. Not a commitment and not sequenced. |
| [project-plan.md](project-plan.md) | Historical | Early project plan; read through current docs and `todo.md`. |
| [knogra-product-discussion.md](knogra-product-discussion.md) | Historical | Early Python/Neo4j R&D planning background. |

Completed release and migration plans (`release-plan.md`, `release-plan-v1-5.md`,
`site-separation-plan.md`, `export-import-redesign-plan.md`) were deleted on 2026-08-20. What they
recorded now lives in `.github/project-journal.md`.

## Architecture

| Document | Status | Notes |
|---|---|---|
| [architecture.md](architecture.md) | Current | Main authoritative architecture document; scene/fold terminology should defer to [scene-transitions.md](scene-transitions.md) where overlapping. |
| [scene-transitions.md](scene-transitions.md) | Current | Canonical source for scene manipulation, transitions, fold semantics, and related invariants. |
| [workspace-architecture.md](workspace-architecture.md) | Current | Canonical for saving, opening, and creating workspaces: file format (workspace JSON, plus the legacy `.knogra` ZIP which is read forever), transfer, storage keys, and startup. The Markdown document is out of scope. |
| [markdown-architecture.md](markdown-architecture.md) | Current | Implemented 2026-08-13. Canonical for the Knogra Markdown document and its three operations — Build (document → new graph), Update (document → open graph, content only), and Export — with the id-based identity model. |
| [paths-architecture.md](paths-architecture.md) | Current | Paths feature model and implementation history. Part II covers navigation modes (history/path), the path manager, and the full-path generator. |
| [chat-panel-architecture.md](chat-panel-architecture.md) | Current | Chat, notes, tutorial timeline, and chat storage model. |
| [ai/ai-assistant-vision.md](ai/ai-assistant-vision.md) | Current | What the assistant is for, how its capabilities behave, and the `src/ai` module map. Carries no prompt text and no action schema. |
| [ai/ai-provider-architecture.md](ai/ai-provider-architecture.md) | Current | Canonical for how AI providers are declared, resolved, and called: the provider registry, resolution and fallback order, shared reply parsing, request timeouts, and the per-vendor facts for Gemini, OpenAI, Anthropic, and OpenRouter. |
| [ai/ai-chat-api-call-composition.md](ai/ai-chat-api-call-composition.md) | Current | Canonical for everything around the chat prompt: the call envelope, the prompt files and their renderer, what code computes, conversation history, display text versus sent text, the reply contract, and the two math pipelines. Contains no prompt text; that is `src/ai/prompts/*.md`. |
| [ai/shelf-architecture.md](ai/shelf-architecture.md) | Draft | Canonical for the node shelf: the entry/placement model, the segregation of duties between assistant and user, the lifecycle across scenes, validity and reconciliation, storage and migration, and the management commands. |
| [ai/chat-image-generation.md](ai/chat-image-generation.md) | Current | Built 2026-10-04. Canonical for the Generate image source in the note editor: Run / Draft / Configure, the request to the image model (shape, detail, background, the legibility sentences), the `ImageProvider` layer with Gemini and OpenAI adapters, the attachment record, weight, and transfer. |
| [ai/vendor-capabilities.md](ai/vendor-capabilities.md) | Current | Reference, dated. What the four AI vendors' current models can do and the exact wire shapes for image output. Re-verify before relying on a number; the agent's training data is reliably behind here. |
| [edge-types-architecture.md](edge-types-architecture.md) | Current | Workspace-specific edge types, theme-aware type styles, scene-local edge visibility, selected-edge affordances, and (§11) the boundary at which types reach the assistant. |
| [edge-curve-style-unbundling.md](edge-curve-style-unbundling.md) | Current | Design rationale and implementation record for separating per-edge curve/layout from visual style. |
| [mermaid-fan-layout.md](mermaid-fan-layout.md) | Current | Canonical model for the Mermaid-import fan layout and the shared scene-composition / adjacency layer used by every Mermaid-import layout. |
| [layout-architecture.md](layout-architecture.md) | Current | Canonical layout-domain terminology (§1.1), auto-layout feature structure, the pluggable scene-layout registry, and the radial outer-ring-spreading algorithm. Renamed from `autolayout-architecture.md`. |
| [map-view.md](map-view.md) | Current | Normative spec, agreed 2026-09-23, shipped in 1.8, for the map view (UI: Helicopter view): one derived view per node in which every edge has a fixed bearing across the whole graph, boxes are addresses, and re-focusing never rotates. Separate feature on a second Cytoscape instance. |
| [mobile-viewer.md](mobile-viewer.md) | Current | Built 2026-10-19 to 23, tuned on an iPhone; in private use before its public launch. Canonical for the mobile viewer: a second page (`view.html`, `src/mobile/`) that installs a graph on a phone, from the knogra.io library or from the phone's own files, and shows it as one-ring maps with travel, balloon, read-only notes and a quiz. §11 fixes what it may import; a new dependency is a change to the document first. §13 holds the parked layout rethink. |
| [arrange-architecture.md](arrange-architecture.md) | Current | Arrange feature: selection-scoped geometric tools (align, distribute, circle, grid — axis-aligned and diagonal, rotate, tighten/spread), their contract, the tool registry, the shared execution pipeline, and the one-shot undo. |
| [autolayout-grow-arrange.md](autolayout-grow-arrange.md) | Current | Grow & Arrange: pulling in the central node's degree-≤N neighbourhood, then arranging, with a seed-and-arrange animation. |
| [telemetry-design.md](telemetry-design.md) | Current | Anonymous usage-counting design and privacy constraints. |
| [landing-app-interaction.md](landing-app-interaction.md) | Current | User-facing landing/app scenarios and implementation status. |
| [chat-image-retrieval.md](chat-image-retrieval.md) | Current | Implemented 2026-07-09 — image retrieval into the per-node chat (`src/ai/image-search/`, Wikimedia source). The wider "learning space" material in the later sections is still proposal. Its §5 rejection of image generation was reversed for notes on 2026-10-04; see [ai/chat-image-generation.md](ai/chat-image-generation.md). |
| [node-placement.md](node-placement.md) | Current | Canonical rules for placing a **single** node added to or included in a scene (add child/parent, shelf create/include, node manager): reference resolution, between-spokes direction, nearest clearing radius, and the `node.spacing` multiplier. Multi-node expansion defers to [node-expansion-spec.md](node-expansion-spec.md). |
| [node-expansion-spec.md](node-expansion-spec.md) | Current | Implemented in `donut-placement.ts`. Canonical for the multi-node expansion placement algorithm ("include children/parents/neighbours"). |
| [context-menu-structure-draft.md](context-menu-structure-draft.md) | Historical | Menu IA draft from the 2026-06 reorganization; the shipped structure has since evolved. Current menu structure is read directly from the builders in `src/ui/context-menu/`. |

## Visual Systems

| Document | Status | Notes |
|---|---|---|
| [theme-architecture.md](theme-architecture.md) | Current | Theme cascade, style generation, and scene theme behavior. |
| [node-design-system.md](node-design-system.md) | Current | Built-in node designs and node-level visual parameters. |
| [node-design-parameters.md](node-design-parameters.md) | Current | Cheat sheet of configurable JSON params for the default and equation/compact-equation node designs. |
| [nodes-svg-images.md](nodes-svg-images.md) | Current | Hub of the three node-image documents, and canonical for the image as a stored artifact: the image record, the two image designs and their sizing, the sanitization trust boundary, the node editor's Image tab, interchange, settings, the file map (§14), and the decisions index (§13) covering all three. |
| [node-image-presets.md](node-image-presets.md) | Current | Canonical for the preset record — what the knobs are, what values they take, localStorage storage and seeding, and the preset editor. Says what a value *is*; not what the model is told about it. Subordinate to [nodes-svg-images.md](nodes-svg-images.md). |
| [node-image-generation.md](node-image-generation.md) | Current | Canonical for everything between "the user wants a picture" and "a raw SVG exists": the generation dialog, message structure, prompt composition, the colour and theme-token system, the correction conversation, and the provider call. Subordinate to [nodes-svg-images.md](nodes-svg-images.md). |
| [background-design.md](background-design.md) | Current | Scene background canvas system and theme integration. |
| [central-node-styling-refactor.md](central-node-styling-refactor.md) | Current with caveats | Current central-node styling contract; broad transition sequencing defers to [scene-transitions.md](scene-transitions.md). |
| [node-styling-diagram.md](node-styling-diagram.md) | Current with caveats | Current styling principles and call-flow reference; some old diagram names are historical. |
| [node-rank-z-index.md](node-rank-z-index.md) | Deferred | Explicit z-index design intentionally postponed beyond v1. |
| [pictogram-node-design.md](pictogram-node-design.md) | Superseded | Proposed a **library** of pre-made glyphs; the shipped feature generates drawings per node instead ([nodes-svg-images.md](nodes-svg-images.md)). **§2/§2.1 remain live** — a verified finding that node SVGs are re-rasterised at device resolution (so there is no resolution ceiling), and what actually breaks at high `scale`. Recorded nowhere else; fold into [node-design-system.md](node-design-system.md) before deleting. |

## Superseded Transition Documents

| Document | Status | Notes |
|---|---|---|
| [transition-sequence-spec.md](transition-sequence-spec.md) | Superseded | Replaced by [scene-transitions.md](scene-transitions.md). |
| [fold-unfold-design.md](fold-unfold-design.md) | Historical / partly superseded | Fold basics remain useful; transition and invariant sections defer to [scene-transitions.md](scene-transitions.md). |
| [refactoring-plan.md](refactoring-plan.md) | Historical | Implementation plan and bug record for transition/fold stabilization; current authority lives in [architecture.md](architecture.md) and [scene-transitions.md](scene-transitions.md). **Retained despite being a completed plan**: the journal has no entries between 2026-05-23 and 2026-06-14, so this is the only record of the regime-model and fold-state work from that gap. |

## Marketing

| Document | Status | Notes |
|---|---|---|
| [marketing.md](marketing.md) | Superseded | Superseded 2026-09-20 by the live site (`knogra-site` repo), which is the source of truth for copy. Background only: friction points, pillars, keywords, directory-listing notes. |
| [marketing-raw-ideas.md](marketing-raw-ideas.md) | Scratchpad | Brainstorming and rejected copy; not canonical. |
