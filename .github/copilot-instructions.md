# Copilot Instructions

## 1. What Knogra Is

Browser-based knowledge-graph editor: nodes (concepts) + edges (relationships) organized into **scenes** (different views of the same underlying graph). Spatial-memory tool with AI-assisted exploration and authoring. Entry point: `src/main.ts`. Full vision: `docs/knogra-vision.md`.

## 2. Rules of Engagement

Be prudent and practical. Break complex responses into digestible chunks. Explain step by step. Infer the user's familiarity with each concept; explain unfamiliar terms before relying on them. Keep answers within ~300 words when appropriate.

### Rule 0: Explicit Approval Required
- **Discuss first, code second**: always discuss before making any changes
- Wait for explicit confirmation before modifying the codebase
- Flag signature changes, new dependencies, or new imports explicitly

### Rule 1: Incremental Changes
- **Max 3 files per step**: small, verifiable increments
- Allow review between steps; remove obsolete code immediately, don't defer

### Rule 2: File Size & Structure
- **~300 lines max per file**: extract subroutines when files grow large
- Clear separation of concerns; proper encapsulation

### Rule 3: Limit Complexity
- **Max 3 nested logical layers**: restructure if deeper nesting is needed
- Use early returns; prefer simple data structures; avoid over-engineering

### Rule 4: Code Quality
- **Naming**: meaningful, descriptive, searchable; camelCase for variables/functions, PascalCase for classes/types; avoid repetition (`dataData`, `handleHandle`)
- **Type safety**: always use type aliases (`NodeId`, `EdgeId`, `SceneId`, `ThemeId`) instead of raw strings; explicit return types on all functions; avoid `any`; use `undefined` explicitly
- **Comments**: explain *why*, not *what*

### Rule 5: Prefer Built-in Tools Over Terminal
- Use built-in editor tools for file reading/editing — they produce reviewable diffs in chat
- Terminal only for: running scripts, installs, git operations, builds, complex shell pipelines
- Never use `sed`/`awk` to edit source files

### Rule 6: Scene Specification Notation
When discussing user actions, bugs, or feature behavior involving scenes, use abbreviated scene notation to make communication unambiguous:

- **Nodes & edges**: `A→B, A→C, B→D` (directed, using `→`)
- **Roles**: inline — `A (central)`, `D (focused)`, `B (fold-root)`
- **Actions**: against the named nodes — `fold B`, `unfold A`, `exclude C`, `move D to (x, y)`

Example: *"Scene: `A→B, A→C, B→D, B→E, C→D, C→E`, A central. Steps: fold A → unfold A → unfold B. Expected: C loses fold badge."*

Use this notation from the start of any bug report, feature spec, or design discussion that involves scene structure or user interactions. It eliminates ambiguity and makes reasoning about state changes precise.

## 3. Code Structure (`src/`)

- `core/` — pure type definitions; no runtime deps; foundation for all other modules
- `events/` — `EventBus` for cross-module signaling (e.g. `sceneChanged`)
- `config/` — settings definitions, debug flags, storage keys, shortcut definitions; read via `getSetting()`
- `storage/` — Dexie/IndexedDB stores, `app-state.ts` (localStorage), `graph-saver.ts`, workspace import/export
- `styles/` — theme definitions, Cytoscape style generation
- `features/` — vertical-slice modules: `transition/`, `scene/`, `path/`, `edge.ts`, `node.ts`, `graph.ts`; exposed via `feature-api.ts`
- `background/` — canvas background rendering (selective color, image processing)
- `ui/` — DOM panels, modals, context menus, keyboard handler, node/edge editors
- `ai/` — chat session, context-builder, prompts, node-shelf, providers
- `utils/` — generic helpers
- `main.ts` — entry point; constructs Cytoscape, `FeatureAPI`, panels, UI components

## 4. Dependency Map

Top-level module dependencies (regenerate with `node .ws/deps/generate-deps.js` can be expanded and customized as needed):

```
src/core        → []
src/utils       → []
src/events      → [src/core]
src/config      → [src/ai, src/core, src/styles]
src/storage     → [src/ai, src/config, src/core, src/events]
src/styles      → [src/config, src/core, src/storage]
src/background  → [src/config, src/core, src/features, src/storage]
src/features    → [src/background, src/config, src/core, src/events, src/storage, src/styles]
src/ai          → [src/config, src/core, src/events, src/features, src/storage]
src/ui          → [src/ai, src/config, src/core, src/events, src/features, src/storage, src/styles]
src/main.ts     → [src/ai, src/background, src/features, src/storage, src/styles, src/ui, src/utils]
```

## 5. Documentation

Consult the relevant doc before implementing features in its domain. Do not load preemptively — know they exist and read when needed.

- `docs/knogra-vision.md` — product vision and long-term direction
- `docs/architecture.md` — system architecture overview
- `docs/workspace-architecture.md` — workspace import/export format
- `docs/theme-architecture.md` — theming system
- `docs/paths-architecture.md` — paths feature design
- `docs/chat-panel-architecture.md` — AI chat panel
- `docs/transition-sequence-spec.md` — scene transition sequencing
- `docs/fold-unfold-design.md` — fold/unfold feature
- `docs/background-design.md` — background rendering
- `docs/node-design-system.md` — node styling system
- `docs/project-plan.md`, `docs/release-plan.md` — active milestones and priorities

## 6. Debugging

- Debug flags: `isDebug('d_*')` in `src/config/debug-flags.ts` — e.g. `d_transition`, `d_edgeStyle`
- Step-mode transitions: `window.transitionDebug.stepMode = true` then `.next()` to advance
- **Diagnostics snapshot** (`src/utils/diagnostics/`): structured telemetry dump from the running app — use it to diagnose bugs without requiring manual reproduction. The snapshot lives at `.ws/snapshots/knogra-snapshot.json`. **Always read it using `read_file` in full from the beginning** — do not rely on an attached version, which VS Code will summarize and lose structure. Key segments: `transitions[]` (one structured record per recent transition: element counts, timing, errors), `cy` (live Cytoscape state: all node positions, classes, scratch values), `saverEvents[]` (GraphSaver suspend/resume/sync log — useful for diagnosing timing races), `invariantDrift[]` (detected divergences between graphStore in-memory positions and last-persisted values), `actions[]` (recent user actions: sceneChanged, fold, unfold), `persisted.graph` (full IndexedDB export — off by default in lean snapshots). If the snapshot covers too many unrelated events, ask the user to run `knogra.clearBuffers()` in devtools before reproducing the bug, then take a fresh snapshot. Full segment reference: `src/utils/diagnostics/snapshot.ts` file-level JSDoc.
- **Common mistakes**: `.github/common-mistakes.md` — read when working in unfamiliar areas.

## 7. Project Journal

`.github/project-journal.md` — session-by-session history of completed work. **Always read using `read_file` tool — never rely on an attached version**, which VS Code will summarize and lose detail. Entries are in **reverse chronological order**; read from the top (line 1) and stop when you have enough depth — there is no need to read the full history unless explicitly asked. Use the **Tags** and main theme in each entry header to navigate to relevant sessions quickly. End-of-session update workflow is in `.github/prompts/update-primer.prompt.md`.

## 8. My Setup

- VS Code on Mac; project on Ubuntu 24.04 VM (12 GB RAM) via UTM/SSH
- Project folder: `~/pro/knogra/`
- All agentic work on the VM, not Mac; VS Code extensions and MCP servers run on the VM