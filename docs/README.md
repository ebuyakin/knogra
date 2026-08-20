# Knogra Documentation Map

> **Status:** Current index  
> **Last reviewed:** 2026-08-20  
> **Authority:** Use this file to orient within `docs/`. It classifies documents by current usefulness and points to the canonical sources when older documents overlap.

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
| [ai-assistant-vision.md](ai-assistant-vision.md) | Current | AI assistant behavior, architecture, graph-action flow, and preconfigured Scene/Node/Suggest/Connect command model. |
| [ai-chat-api-call-composition.md](ai-chat-api-call-composition.md) | Current | Authoritative AI chat API call composition, quick-action prompt contract, and scene/node request behavior. |
| [edge-types-architecture.md](edge-types-architecture.md) | Current | Workspace-specific edge types, theme-aware type styles, scene-local edge visibility, selected-edge affordances, and current AI context boundary. |
| [edge-curve-style-unbundling.md](edge-curve-style-unbundling.md) | Current | Design rationale and implementation record for separating per-edge curve/layout from visual style. |
| [mermaid-fan-layout.md](mermaid-fan-layout.md) | Current | Canonical model for the Mermaid-import fan layout and the shared scene-composition / adjacency layer used by every Mermaid-import layout. |
| [layout-architecture.md](layout-architecture.md) | Current | Canonical layout-domain terminology (§1.1), auto-layout feature structure, the pluggable scene-layout registry, and the radial outer-ring-spreading algorithm. Renamed from `autolayout-architecture.md`. |
| [arrange-architecture.md](arrange-architecture.md) | Current | Arrange feature: selection-scoped geometric tools (align, distribute, circle, grid — axis-aligned and diagonal, rotate, tighten/spread), their contract, the tool registry, the shared execution pipeline, and the one-shot undo. |
| [autolayout-grow-arrange.md](autolayout-grow-arrange.md) | Current | Grow & Arrange: pulling in the central node's degree-≤N neighbourhood, then arranging, with a seed-and-arrange animation. |
| [telemetry-design.md](telemetry-design.md) | Current | Anonymous usage-counting design and privacy constraints. |
| [landing-app-interaction.md](landing-app-interaction.md) | Current | User-facing landing/app scenarios and implementation status. |
| [chat-image-retrieval.md](chat-image-retrieval.md) | Current | Implemented 2026-07-09 — image retrieval into the per-node chat (`src/ai/image-search/`, Wikimedia source). The wider "learning space" material in the later sections is still proposal. |
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
| [marketing.md](marketing.md) | Current | Canonical marketing copy and directory listing notes. |
| [marketing-raw-ideas.md](marketing-raw-ideas.md) | Scratchpad | Brainstorming and rejected copy; not canonical. |
