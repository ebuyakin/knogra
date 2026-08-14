# Node SVG Images

> **Status:** Draft — specification under review, not yet implemented
> **Last reviewed:** 2026-08-15
> **Authority:** Proposed design for AI-generated SVG pictograms attached to nodes. Supersedes the
> original idea note of the same name. Not authoritative over [Architecture](architecture.md),
> [Node design system](node-design-system.md), or [Theme architecture](theme-architecture.md) —
> where this document and those disagree, they win and this one is wrong.
> **Related:** [Documentation map](README.md), [Knogra vision](knogra-vision.md),
> [Node design system](node-design-system.md), [Theme architecture](theme-architecture.md),
> [Workspace architecture](workspace-architecture.md), [Markdown architecture](markdown-architecture.md)

---

## 1. Purpose

Knogra is built for visual learners, and every landmark in it is currently a text card. Nodes differ
from one another by position and wording, not by shape. Spatial recall attaches to *silhouettes*,
and a traversal model built on morph transitions — where the eye tracks shapes, not labels — has
nothing to track.

This feature attaches an SVG pictogram to a node so that it can be recognised at a glance and from a
distance.

### 1.1 Symbolic, not analogous

The images are **icons, pictograms, schematics, diagrams, plots** — not photographs, faces, or
landscapes. The intent is hieroglyphic encoding of a concept, a visual sibling of the equation
feature: where an equation states a concept precisely, a pictogram states it memorably.

This is a product constraint first and a technical one second, but it happens to align with what
LLMs are actually good at. Models write competent SVG for geometric, schematic, and iconographic
subjects, and poor SVG for illustrative ones. The size cap in §5.3 exists partly to enforce this
boundary mechanically: an SVG that exceeds it has almost certainly stopped being a pictogram.

### 1.2 Why AI generation is the primary path, not search

Sourced icon sets and web search were considered and rejected as the primary path.

The decisive argument is **stylistic consistency**. Knogra treats visual coherence as a product
value — themes, contrast, vignette, shadow geometry, and scene layout have all been tuned
deliberately. Images gathered from different sources arrive with different stroke weights, corner
radii, palettes, and levels of abstraction. A scene assembled from them is a zoo, and even two
mismatched images break the composition.

Generation solves this because generation can be *constrained*. A stored style contract (§6) is
injected into every request, so the output is an icon set for this workspace rather than a
collection of unrelated pictures. That inversion also settles the density question: mismatched
images tolerate at most one or two per scene, while a consistent set can be used on many nodes or
all of them.

Raster formats are excluded outright: they do not survive Knogra's free zooming, and they cannot be
composed into the node's own SVG the way MathJax output already is.

### 1.3 Relationship to designs

An image is **node-level content**; whether it is *shown* is a **scene-level** design choice, exactly
as with equations. The same node can render as a plain text card in a summary scene, as a
title-plus-equation card in a derivation scene, and as a pictogram in a third. This is the core
Knogra mechanic, not an inconsistency to be resolved.

---

## 2. Scope

**In scope for v1**

- One image per node, stored once and shared by every scene that shows it.
- Two new node designs: image only, and image with title.
- AI generation in two steps — metaphor, then SVG — with the metaphor visible and editable.
- Paste SVG source and upload `.svg` file as alternative entry points.
- Workspace-level style contract, editable, applied to every generation.
- Sanitization and size/shape validation at every entry point.
- Save the node's SVG to a file from the node editor.

**Explicitly out of scope**

- Online image search or any network fetch other than the user's own AI provider. This would
  contradict the privacy position stated in the README and the privacy policy, and it would
  reintroduce the consistency problem the feature exists to avoid.
- Raster images of any kind, including raster embedded inside an SVG.
- Batch generation across a scene. Considered and rejected: scenes are fluid and deliberately
  heterogeneous in design, so a scene is the wrong unit of work. Consistency is delivered by the
  style contract, not by batching.
- Per-node image variants / a multi-image strip. Deferred, not refused — see §2.1.
- Theme-level style contracts. The contract is workspace-level in v1, with the data shaped so it can
  move to theme level later (§2.1, §6.2).

### 2.1 Designed-for extensions

Two extensions are **out of scope for v1 but are requirements on its design**. Neither may be made
expensive by a v1 shortcut, and each carries a named seam that must exist from the start.

**Theme-level style contracts.** The contract will eventually live on the theme, so that switching
theme switches icon language with it. The seam: the contract is a **self-contained record with its
own type**, resolved through a single accessor, never a scatter of loose settings keys read at call
sites. Moving its home then means changing the accessor, not the generator, the dialog, or the
prompt composition. Colours are already resolved against the scene theme at request time (§5.3),
which is the same resolution step a theme-level contract would use.

**Multiple images per node.** A node will eventually own several images and select which one renders,
with a strip UI comparable to background-image selection. The seams: images are stored as **their own
records keyed by id** rather than inlined on the node (§4.3), and ownership is a **node → image**
relation (§4.5) that widens from one to many without changing the deletion or export story. What v1
must not do is bake "exactly one" into the storage shape or the cascade logic — only into the UI and
the node's reference field, which are the cheap places to widen.

A third, weaker extension is noted for direction only: scene-level image selection, so the same node
could show different images in different scenes, the way design and scale already vary per scene.
This is *not* a design constraint on v1 — it would move image selection from node to scene record and
is a genuine model change, not a widening.

---

## 3. Prerequisite fix — stylesheet node-rule pruning

**This is not part of the feature and must land first, on its own merits.**

`StyleGenerator` has `removeEdgeFromStylesheet` but **no equivalent for nodes**. On `openScene` the
stylesheet is rebuilt from a fresh base, so per-node rules are scene-scoped there. The scene-to-scene
morph path is different: it adds rules for arriving nodes through `addNodesToStylesheet` and never
removes rules for departed ones. Ghost rules are cleaned up; real node rules are not. Per-node rules
therefore accumulate across a traversal session until the next `openScene`.

Today this is invisible, because a text-card rule holds a few kilobytes of encoded SVG. With image
payloads it becomes a leak with teeth: every subsequent `cy.style().fromJson(...).update()` — on
every fold, scale step, and arrange — re-parses the accumulated dead payload.

**Required:** a `removeNodesFromStylesheet` in `styles/style-generator.ts`, called at the end of the
morph transition for nodes no longer present in `cy`. Verified independently before any image design
ships.

---

## 4. Data model

### 4.1 The image record

New IndexedDB table `nodeImages` in the existing `knogra-graph` database, alongside
`backgroundImages`.

```ts
// core/main-types.ts
export type NodeImageId = string;

export interface NodeImage {
  id: NodeImageId;
  /** Sanitized SVG source. The only representation stored; never raster. */
  svg: string;
  /** viewBox aspect ratio (width / height), extracted once at ingest. */
  aspectRatio: number;
  /** Base render width in px before per-node scale — see §5.2. */
  sizeClass: NodeImageSizeClass;
  /** How this image came to exist, for provenance display and future filtering. */
  origin: 'generated' | 'uploaded' | 'pasted';
  /** The metaphor the image depicts. Present for generated images; the seed for regeneration. */
  metaphor?: string;
  /** The user prompt that produced it. Present for generated images. */
  prompt?: string;
  createdAt: Date;
}

export type NodeImageSizeClass = 'small' | 'medium' | 'large';
```

`metaphor` is deliberately persisted rather than discarded. It is the semantic content of the image
— the only part of it that is meaningful outside SVG — and it is what makes regeneration, Markdown
projection (§9.3), and any future restyling possible.

### 4.2 The node reference

The node holds a reference, not bytes:

```ts
node.properties.imageId  // NodeImageId | undefined
```

`imageId` must be added to `NODE_SYSTEM_PROPERTIES` in `config/node-properties.ts`, so the Advanced
tab hides it from the raw JSON editor and carries it through on save. Both halves of that decision
are required; a key hidden but not preserved is deleted on every save.

### 4.3 Why the bytes are not on the node

The `equation` property is the tempting precedent and it is the wrong one: an equation is tens of
bytes, an SVG is tens of kilobytes.

`GraphStore.init()` reads `nodes`, `edges`, `edgeTypes`, `scenes`, and `backgroundImages` whole into
memory arrays and keeps them for the session, with no paging and no eviction. Bytes on the node mean
**every image in the graph is resident from app start**, whether or not any scene shows it. A
300-node graph with icons on half of them at 60 KB is roughly 9 MB permanently resident, plus the
same again as JS strings after deserialization, on a hot cache that every feature reads.

A separate table also buys separability for export decisions, a node record that stays cheap to scan,
and the room to hold several images per node later (§2.1) without reshaping storage.

It deliberately does **not** buy cross-node reuse: images are owned, not shared (§4.5).

`backgroundImages` is an existing unbounded full-table load and is *not* a precedent to follow — it
survives only because there are few of them. `nodeImages` must not be added to `init()`.

### 4.4 Schema migration

`GRAPH_DB_VERSION` 3 → 4 in `config/storage-config.ts`, adding `nodeImages: 'id, createdAt'` to
`GRAPH_DB_SCHEMA`. Purely additive: Dexie creates the table, existing data is untouched, and a
workspace saved by an older build opens unchanged with no images.

### 4.5 Ownership and deletion

**An image is owned by exactly one node.** It is not shared between nodes, and detaching it from its
node deletes the record. Two consequences, both deliberate:

- **Orphans cannot occur.** There is no reachable state in which a `nodeImages` record exists without
  an owner, so no reference counting, no sweep on workspace open, no garbage collection.
- **Cascade deletion is one line.** When a node is deleted, its image is deleted with it, exactly as
  its chat conversation, its scenes, and its shelf entries already are.

The cascade belongs in `cascadeNodeDeletion` (`storage/node-deletion.ts`), which is the established
single choke point for node-related cleanup and is reached from both deletion entry points in
`features/graph/graph.ts`. Nothing else needs to know.

Ownership is the reason cross-node reuse is refused. Reuse would require reference counting on every
detach and every cascade — precisely the complexity that ownership removes. When a node owns several
images (§2.1), they are all owned by that node and the cascade still deletes the set unconditionally.

---

## 5. Rendering

### 5.1 The two designs

| ID | Label | Layout |
|---|---|---|
| `image-node` | Image | Image alone in the node box |
| `image-caption-node` | Image with Title | Title bar + image, mirroring `equation-compact-node` |

Registered in `config/design-manifest.ts` and `styles/designs/design-registry.ts` following the
documented five-step procedure in [node-design-system.md](node-design-system.md). Both use
`shadow-utils.ts`, both support the standard `colorOverrides` / `effects` / `gradient` params, and
`image-caption-node` reuses the title-bar treatment of the compact equation design so the two read
as siblings.

The rendering technique is not new. `equation-compact-node` already takes SVG produced elsewhere
(MathJax), reads its `viewBox`, scales it into a section of the node's own SVG, and encodes the
result as `data:image/svg+xml;charset=utf-8,` + `encodeURIComponent`. The image designs do the same
thing with less work, because the SVG is already in hand and needs no typesetting pass.

When `imageId` is absent or unresolvable, the design renders the node's title in the box rather than
failing — a node must never disappear because an image is missing.

### 5.2 Sizing

Node dimensions are content-derived, as with `default-node`, where the title drives the box. Here the
image drives it:

- **Aspect ratio** comes from the SVG's `viewBox`, never from `width`/`height` attributes.
- **Base width** comes from `sizeClass`, resolved through three settings (§10). The intrinsic SVG
  size is never adopted directly — an author-chosen class is predictable, and an arbitrary intrinsic
  size is not.
- **Per-node `scale`** applies on top, unchanged, from both the Design tab slider and the `>` / `<`
  shortcut.

Large is intentionally large. A `sin` plot illustrating *Trigonometric function* legitimately occupies
a substantial share of the canvas, and that is flexibility rather than a defect. `sizeClass` is
chosen at generation time (and editable afterwards) so the model can be told to draw at the right
level of detail for the size it will be shown at.

Height and width feed Cytoscape directly, so they determine hit area, edge endpoints, and
arrange/autolayout spacing. `features/arrange/tools/distribute.ts` already handles heterogeneous
footprints deliberately, so no layout change is expected — but this is the interaction to watch in
testing.

### 5.3 Colour and theme

Generated SVGs carry literal colours drawn from the style contract, which is resolved against the
scene's theme at generation time. They are **not** re-tinted at render.

This is a deliberate trade. Tinting would survive theme changes but would discard the model's colour
decisions and flatten diagrams that need more than one colour to be readable. Baked colours look
right on creation and can drift if the workspace theme changes later; the mitigation is that the
contract constrains output to a small palette, and regeneration is cheap because the metaphor is
stored.

Uploaded and pasted SVGs are never recoloured. They are the user's own material.

### 5.4 Quiz mode

**Quiz mode hides images**, as it hides node labels.

The reason is the same reason the feature exists: a pictogram is a strong recall cue, and in several
cases a stronger one than the title. Leaving it visible while hiding the title would not test recall,
it would replace one prompt with an easier one. The node renders as an empty box of its normal
dimensions — size and position are spatial cues the quiz already preserves, and preserving them keeps
the scene's layout intact while removing the content.

### 5.5 Loading and caching

Designs need the SVG synchronously; loading is asynchronous. A small module —
`styles/designs/node-image-cache.ts` — closes the gap:

- `ensure(id): Promise<void>` — loads one record from `nodeImages` if not already cached.
- `get(id): { svg, aspectRatio, sizeClass, encoded } | undefined` — synchronous read.

`StyleGenerator.generateNodeStyle` awaits `ensure()` before dispatching to the design; the design
reads synchronously. `generateNodeStyle` and its whole call chain are already `async`, so this costs
nothing structurally.

The cache holds both raw and `encodeURIComponent`-encoded forms, because the encode would otherwise
be repeated on every stylesheet touch. It is bounded (LRU, size configurable) and keyed by image id,
so residency tracks *scenes visited recently*, not the graph.

Direction note: this makes `styles/` depend on `storage/`. That edge already exists —
`styles/themes/index.ts` imports `storage/theme-store` — so this follows precedent rather than
opening a new path. It should be recorded in [architecture.md](architecture.md) §3.4 either way.

---

## 6. Generation

### 6.1 Two steps, both visible

Generation runs as metaphor → image, and the intermediate step is shown to the user rather than
hidden inside one call.

1. **Metaphor.** The model proposes how to depict the concept — for *Modesty*, a human contour
   covering itself with its hands. This is where a model is most likely to choose something the user
   would reject, including for reasons (cultural, disciplinary, personal) it cannot anticipate.
   The proposal is plain text, editable, and regenerable.
2. **SVG.** The confirmed metaphor plus the style contract plus the size class produce the drawing.
   This step is largely mechanical and is where models perform well, provided the instructions are
   precise.

The user can iterate at either step: rewrite the metaphor and redraw, or keep the metaphor and redraw
for a different result. The dialog closes only on accept.

### 6.2 The style contract

A single stored specification injected into every generation request, and the mechanism by which a
workspace acquires one icon language instead of a pile of unrelated drawings. **Workspace-level in
v1**, persisted with settings and travelling with the workspace file via `exportSettings()`.

It is a **self-contained record with its own type**, resolved through one accessor. This is a
requirement, not a style preference — it is the seam that lets the contract move to theme level later
without touching the generator, the dialog, or prompt composition (§2.1).

Colours are resolved at request time from the current scene's theme rather than stored literally, so
the contract stays portable across themes.

#### 6.2.1 What the user controls

The parameters split three ways, and the split is the design question that matters. **This breakdown
is a proposal and needs its own review pass before implementation** — the categories are settled, the
specific enum members are not.

**Fixed selections** — enumerated, so the composed prompt is deterministic and the resulting style is
inspectable and reproducible:

| Parameter | Values (proposed) |
|---|---|
| Render mode | line art / filled / mixed |
| Stroke weight | thin / medium / heavy |
| Corner treatment | sharp / rounded |
| Palette size | 1 / 2 / 3 colours |
| Detail level | minimal / moderate / detailed |

**Free prose** — one "additional style direction" field for intent no enum anticipates: *hand-drawn
feel*, *isometric*, *technical-drawing conventions*. Appended to the composed prompt verbatim.

**Not user-facing** — the machine half of the contract: viewBox convention, the prohibitions (no text
labels, no gradients, no raster, no external references), and the JSON response shape. These are
correctness rather than taste, they exist to keep output inside what the sanitizer will accept, and
exposing them would invite silently breaking §7.

Image **size is not part of the contract**. It is a per-image decision made at generation time
(§5.2), because the same icon language legitimately covers a small glyph and a large plot.

#### 6.2.2 Where it is edited

The canonical editor is in **Settings**, where workspace-scoped configuration belongs. The Image tab
carries a shortcut that opens it, because the moment a user wants to change the contract is the
moment they are unhappy with a result — the same reasoning that puts the theme picker within reach
from more than one place.

It ships with a considered default, so a user who never opens it still gets consistent output.

### 6.3 Module

`ai/svg-image-generator.ts`, structured as a direct sibling of `ai/equation-generator.ts`:
independent of chat sessions and chat persistence, provider resolved through the same
`resolveProviderConfig` pattern, JSON-only response, discriminated-union result.

```ts
export type SvgMetaphorResult =
  | { type: 'metaphor'; metaphor: string }
  | { type: 'clarification'; message: string };

export type SvgImageResult =
  | { type: 'svg'; svg: string }
  | { type: 'clarification'; message: string };
```

The `clarification` arm mirrors the equation generator's contract, so an under-specified request
comes back as a question rather than a bad drawing.

### 6.4 Model routing

The image generator uses **the same provider and model as chat**, resolved exactly as the equation
generator resolves it. No separate model setting.

SVG authoring is a demanding capability and weaker models fail at it. When output fails validation in
a way that indicates capability rather than accident — unparseable output, no SVG element,
persistent prose instead of markup — the error message names the model and suggests switching, rather
than reporting a generic failure. The user is not left guessing whether the prompt or the model was
at fault.

---

## 7. Trust boundary

SVG is executable content. It can carry `<script>`, `on*` handlers, `<foreignObject>` with arbitrary
HTML, external `xlink:href`, and `<use>` referencing remote documents. **All three entry points are
untrusted** — upload and paste obviously, and model output no less so, since it is remote content
shaped by a user-controlled prompt.

`ai/svg-sanitizer.ts` (sibling of `ai/latex-sanitizer.ts`, the existing precedent for
boundary normalization) is the single choke point. Every image passes through it before it is stored
— never at render time, never conditionally on origin.

**Reject** when: the source does not parse as XML with `DOMParser`; the root element is not `<svg>`;
no usable `viewBox` is present; the byte length exceeds the cap; or an embedded raster
(`<image>` with a `data:image/...` or remote href) is found.

**Strip** on the way through: `<script>`, `<foreignObject>`, every `on*` attribute, `<use>` with an
external target, and any `href`/`xlink:href` that is not a same-document fragment reference.

**Display rule:** the editor preview renders the image as `<img src="data:image/svg+xml,...">`. Never
`innerHTML`, never inline injection into the document. The Cytoscape path is already image-context
and does not execute script, but that is the renderer's property rather than a guarantee this
codebase owns, and the preview is the exposure that would matter.

Size cap: a configurable byte limit on the sanitized source, defaulting to 150 KB. Pictograms observed
in practice sit well under 100 KB, so the cap rejects the case where the model has stopped drawing an
icon.

---

## 8. Node editor — Image tab

A fifth tab in `ui/components/node-editor/`, added to `NODE_EDITOR_TAB_IDS`, following the existing
contract exactly: it owns its DOM, returns `ImageTabValues` from `read()`, returns `null` when its own
validation fails, and knows nothing about the other tabs. The shell composes the result as it already
does.

```ts
export interface ImageTabValues {
  imageId: NodeImageId | undefined;
  sizeClass: NodeImageSizeClass;
}
```

Contents:

- **Preview** of the current image, or an empty state when there is none.
- **Generate** — opens the two-step dialog (§8.1).
- **Upload** (`.svg` file picker) and **Paste SVG** (textarea). Paste is nearly free to build and
  immediately useful, since it accepts output from any chat the user already has open.
- **Save as SVG** — writes the node's image to a file, following the download pattern already used
  by Markdown export. Round-trips the user's own material out of the app.
- **Size** — small / medium / large.
- **Remove** — clears `imageId` and deletes the `nodeImages` record. The image is owned by this node
  (§4.5), so detaching and deleting are the same act and there is nothing left behind.
- **Style contract** — an entry point to view and edit the workspace contract, so the user can adjust
  it at the moment they are dissatisfied with a result.

Metaphor and provenance are shown read-only alongside the preview for generated images.

### 8.1 The generation dialog

Structurally the `equation-dialog.ts` pattern — overlay anchored to the Cytoscape container rect,
hosted inside the editor modal so it dims only the editor, busy state, `Ctrl+Enter` to submit,
`Escape` to close — extended to two stages.

Stage 1 takes a prompt seeded from the node title and returns a metaphor into an editable field.
Stage 2 returns an SVG, previewed at the chosen size class, with **Accept**, **Redraw**, and **Back to
metaphor**. Failures surface inline, as in the equation dialog, and a sanitizer rejection offers the
raw source for inspection rather than swallowing it.

---

## 9. Interchange

### 9.1 Workspace file

Images are **always included, with no dialog**. The workspace file is a lossless snapshot; it is a
save, not a negotiation. `nodeImages` is exported and imported alongside `backgroundImages` in
`storage/workspace/transfer.ts`, and the envelope in `storage/workspace/envelope.ts` gains the
corresponding member.

Note a live inconsistency this decision does not resolve: `showImageTransferDialog` in
`storage/workspace/dialogs.ts` *does* offer to drop chat image bytes on workspace save. That escape
hatch exists because retrieved chat images can be tens of megabytes of photographs. A bounded set of
sub-150 KB pictograms is content rather than ballast, so node images do not join that dialog. The
asymmetry is intentional and recorded here so the next reader does not "fix" it into symmetry.

### 9.2 Markdown

Images are **excluded** and the user is not asked. Knogra Markdown is a lossy, human- and
AI-readable projection carrying no positions, scenes, designs, or themes; embedding base64 SVG in it
would defeat its purpose.

### 9.3 Markdown and the metaphor — open

Emitting the stored `metaphor` string as node content in Markdown would let the *meaning* of an image
round-trip and be regenerated on Build. Attractive, but it changes the document schema and is not
required by v1. Flagged in §13, not specified here.

---

## 10. Settings

New keys under the `node` domain in `config/setting-definitions.ts`:

| Key | Purpose |
|---|---|
| `node.imageDesign` | Design applied when an image is added to a node — the `node.equationDesign` precedent |
| `node.imageSizeSmall` / `Medium` / `Large` | Base render widths in px for the three size classes |
| `node.imageMaxBytes` | Sanitizer size cap, default 150 KB |
| `node.imageStyleContract` | The workspace style contract (§6.2) |

---

## 11. Files

**New**

```
src/storage/node-image-store.ts              # nodeImages CRUD, not loaded at init
src/styles/designs/node-image-cache.ts       # bounded id → { svg, encoded } cache
src/styles/designs/image-node.ts             # image-only design
src/styles/designs/image-caption-node.ts     # title + image design
src/ai/svg-image-generator.ts                # two-step generation
src/ai/svg-sanitizer.ts                      # trust boundary
src/ui/components/node-editor/image-tab.ts   # Image tab
src/ui/components/node-editor/image-dialog.ts# two-stage generation dialog
```

**Modified**

```
src/core/main-types.ts                       # NodeImage, NodeImageId, NodeImageSizeClass
src/config/storage-config.ts                 # GRAPH_DB_VERSION 3 → 4, nodeImages schema
src/config/node-properties.ts                # imageId → NODE_SYSTEM_PROPERTIES
src/config/design-manifest.ts                # two design entries
src/config/setting-definitions.ts            # §10 keys
src/storage/node-deletion.ts                 # cascade image deletion (§4.5)
src/styles/designs/design-registry.ts        # two dispatch arms, two param types
src/styles/style-generator.ts                # await cache ensure; removeNodesFromStylesheet (§3)
src/features/transition/...                  # call the new prune (§3)
src/features/quiz.ts                         # hide images in quiz mode (§5.4)
src/ui/components/node-editor/node-editor.ts # fifth tab, compose ImageTabValues
src/ui/components/node-editor/node-editor-types.ts
src/ui/components/editor-openers.ts          # wire the generator callback
src/ui/components/settings-modal.ts          # style contract editor (§6.2.2)
src/storage/workspace/transfer.ts            # export/import nodeImages
src/storage/workspace/envelope.ts            # envelope member
```

---

## 12. Implementation order

Each step is independently verifiable; none of them leaves the app in a half-state.

1. **Stylesheet node-rule pruning** (§3) — separate change, separate verification. Blocks everything
   else.
2. **Storage** — types, schema bump, `node-image-store.ts`, cascade deletion (§4.5), workspace
   export/import. No UI. Verified by save/open round-trip of a hand-inserted record and by deleting
   its owner node.
3. **Sanitizer** — standalone, testable against a corpus of hostile and malformed SVG before anything
   depends on it.
4. **Cache + designs** — render an image node from a hand-inserted record, and hide it in quiz mode.
   This is the first visible result and the point at which transition, fold, arrange, quiz, and
   theme-switch behaviour should be exercised.
5. **Image tab, manual paths only** — paste, upload, size, save-as, remove. The feature is fully
   usable here without any AI involvement.
6. **Style contract + generation** — the two-step dialog, the generator module, model-capability
   messaging.

Steps 1–5 have no dependency on model behaviour. If generation quality disappoints, the work up to
step 5 still stands on its own.

---

## 13. Open questions

- **Style contract parameters** (§6.2.1). The three-way split is settled; the specific enum members
  need a dedicated review pass against real generated output before they are fixed.
- **Regeneration history.** Replace in place, or keep prior attempts as owned alternates? This is the
  natural first use of multiple-images-per-node (§2.1) and probably how that extension should arrive.
- **Metaphor in Markdown** (§9.3).
- **Theme change after generation.** Baked colours drift (§5.3). Is a "regenerate icons for this
  workspace" affordance wanted eventually, or is drift acceptable?
- **Shelf nodes.** AI-suggested nodes pick a design by whether they carry an equation. Should a
  suggested node ever arrive with an image, or is generation always an explicit user act?

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Resident memory growth | Separate table, excluded from `GraphStore.init()`, bounded LRU (§4.3, §5.5) |
| Stylesheet payload accumulation across transitions | Prerequisite prune, verified independently (§3) |
| Hostile or malformed SVG | Single sanitization choke point at ingest; preview via `<img>` only (§7) |
| Node dimensions disturbing layout tools | viewBox-derived aspect + author-chosen base width, never intrinsic size (§5.2) |
| Model produces poor SVG | Two-step flow with editable metaphor; capability-aware error messaging; steps 1–5 deliver value without generation (§6, §12) |
| Visual incoherence across a graph | Workspace style contract injected into every request (§6.2) |
| Scope creep into a general image feature | Raster excluded, online search excluded, size cap enforces the pictogram thesis (§2, §7) |