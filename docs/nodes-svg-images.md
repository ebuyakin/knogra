# Node SVG Images

> **Status:** Current, with planned extensions marked inline. Shipped 2026-08-15/16; build order and
> session-by-session reasoning are in `.github/project-journal.md`.
> **Last reviewed:** 2026-08-17
> **Authority:** Design for AI-generated SVG images attached to nodes, and the **hub** of the three
> image documents. Not authoritative over [Architecture](architecture.md),
> [Node design system](node-design-system.md), or [Theme architecture](theme-architecture.md) — where
> they disagree with this, they win.
> **Scope of this document:** the image as a stored, secured, rendered artifact — the record,
> rendering, the trust boundary, the node editor tab, interchange, settings, the file map, and the
> decisions index for all three documents. What a preset *is* is in
> [Node image presets](node-image-presets.md); what the model is *told* is in
> [Node image generation](node-image-generation.md). Rationale and rejected alternatives are in the
> project journal.
> **Related:** [Node image presets](node-image-presets.md),
> [Node image generation](node-image-generation.md),
> [Documentation map](README.md), [Node design system](node-design-system.md),
> [Theme architecture](theme-architecture.md), [Workspace architecture](workspace-architecture.md)

---

## 1. Purpose

Every landmark in Knogra is a text card; nodes differ by position and wording, not shape. Morph
transitions track shapes, and there are none. This feature attaches an SVG image to a node.

**Vector artwork, not photorealism.** Icons, symbols, schematics, diagrams, plots, maps — and, where
a subject warrants it, elaborate ones. A visual sibling of the equation feature. Complexity is
bounded by the preset that asked for the drawing, not by this document's vocabulary and not by the
size cap (D29, D30).

**Generated, not sourced.** Images from different sources arrive with different stroke weights,
palettes and abstraction levels, and a scene assembled from them is a zoo. Generation can be
**constrained** by a stored preset, which is what makes many images per scene viable rather than one
or two. Raster is excluded outright — it does not survive free zooming and cannot be composed into
the node's own SVG the way MathJax output already is.

**An image is node-level content; whether it is *shown* is a scene-level design choice**, exactly as
with equations. The same node can carry one image and display it in one scene and not another. This
is the model D20 defends.

---

## 2. Scope

**In scope for v1**

- One image per node, shared by every scene that shows it.
- Two node designs: image only, image with title.
- Generation from a user description plus a selected preset, refined through correction turns
  ([generation](node-image-generation.md) §8).
- User-authored **presets**: named, editable, seeded with starters, with a dedicated editor.
- Paste SVG source and upload `.svg`.
- Sanitization and size/shape validation at every entry point.
- Save the node's SVG to a file.
- Thematic colour: an image may take its palette from the theme of the scene it appears in (§5.3).

**Out of scope**

- Online image search or any network fetch other than the user's own AI provider — contradicts the
  privacy position and reintroduces the consistency problem.
- Raster in any form, including embedded inside an SVG.
- Batch generation across a scene — scenes are deliberately heterogeneous, so a scene is the wrong
  unit of work.
- Multiple images per node — deferred, see §2.1.
- Theme-bound presets. The palette resolves against the scene theme (§5.3), but a preset is not
  owned by a theme.

### 2.1 Designed-for extensions

Out of scope, but requirements on v1's design:

- **Growing the preset vocabulary.** Descriptor values expand through a **data map**, never branches
  in prompt composition, and the registry **normalises on read**. Adding a descriptor is then one map
  entry plus one control.
- **Multiple images per node.** Images are their own records keyed by id (§4.3), owned by a node
  (§4.5). "Exactly one" may be baked into the UI and the node's reference field only — never into the
  storage shape or the cascade logic.

Direction only, not a v1 constraint: scene-level image selection would move selection from node to
scene record, which is a model change rather than a widening.

---

## 3. Prerequisite — stylesheet node-rule pruning — **DONE**

`StyleGenerator.pruneStaleNodeRules(stylesheet, scene)`, called from `transition.ts` after
`pruneStaleEdgeRules`. Per-node morph rules used to accumulate across a traversal — harmless for text
cards, expensive with image payloads. Removal-only; a node in `cy` but absent from `scene.nodes` now
renders with Cytoscape defaults rather than a stale rule.

---

## 4. Data model

All node-image types live in **`core/node-image-types.ts`**; `main-types.ts` keeps only an index entry
(D17).

### 4.1 The image record

```ts
export type NodeImageId = string;
export type NodeImageSizeClass = 'small' | 'medium' | 'large';
export type NodeImageOrigin = 'generated' | 'uploaded' | 'pasted';

export interface NodeImage {
  id: NodeImageId;
  ownerNodeId: NodeId;          // 1:1 in v1; widens to many without a schema change
  svg: string;                  // sanitized source; never raster
  aspectRatio: number;          // from viewBox, extracted once at ingest
  sizeClass: NodeImageSizeClass;
  origin: NodeImageOrigin;
  colourMode: NodeImageColourMode;  // 'thematic' | 'fixed' — planned, §5.3
  prompt?: string;              // the description that produced it; the seed for regeneration
  createdAt: Date;
}
```

No reference to the preset that produced it (D14). `colourMode` is a **value copied** from the
preset, not a reference: render-time treatment depends on it, so the record must be self-describing.
Uploads and pastes are always `fixed`, as is any record predating the field — it carries literal hex
and no tokens, so there is nothing to substitute and no migration to run.

### 4.2 The node reference

`node.properties.imageId` — `NodeImageId | undefined`. Must be added to `NODE_SYSTEM_PROPERTIES` in
`config/node-properties.ts`: hidden from the Advanced tab's raw JSON editor **and** carried through on
save. A key hidden but not preserved is deleted on every save.

### 4.3 Why the bytes are not on the node

`GraphStore.init()` loads whole tables into memory for the session with no paging or eviction. Bytes
on the node would make every image resident from app start — a 300-node graph with icons on half at
60 KB is ~9 MB resident, doubled again as JS strings.

**`nodeImages` must not be added to `init()`.** `backgroundImages` is an existing unbounded full-table
load and is *not* a precedent to follow.

### 4.4 Schema migration

`GRAPH_DB_VERSION` 3 → 4, adding `nodeImages: 'id, ownerNodeId'` to `GRAPH_DB_SCHEMA`. Purely
additive.

### 4.5 Ownership and deletion

An image is owned by **exactly one** node; detaching it deletes the record, so orphans are
unreachable — no reference counting, no sweep, no garbage collection. The cascade belongs in
`cascadeNodeDeletion` (`storage/node-deletion.ts`), reached from both deletion entry points in
`features/graph/graph.ts`. Cross-node reuse is refused: it would reintroduce reference counting.

---

## 5. Rendering

### 5.1 The two designs

| ID | Label | Layout |
|---|---|---|
| `image-node` | Image | Image alone in the node box |
| `image-caption-node` | Image with Title | Title bar + image, mirroring `equation-compact-node` |

Registered in `config/design-manifest.ts` and `styles/designs/design-registry.ts` per
[node-design-system.md](node-design-system.md). Both support the standard `colorOverrides` /
`effects` / `gradient` params and share one renderer.

**Technique:** the stored SVG is nested inside a wrapper `<svg x y width height>` and fills that
sub-viewport through its own viewBox — no string surgery at render time. This depends on root
`width`/`height` being stripped at ingest (§7).

When `imageId` is absent or unresolvable, the design renders the node's title rather than failing.

### 5.2 Sizing

- **Image aspect ratio** from the SVG's `viewBox`, never from `width`/`height`.
- **Base width** from `sizeClass`, resolved through three settings (§10). Intrinsic SVG size is never
  adopted.
- **Per-node `scale`** applies on top, unchanged.

The node box has two modes, chosen per node by the `fixedAspect` design param:

- **Free (default).** Height follows the image: `topHeight + imageHeight + 2 × vPadding`.
- **Fixed.** Height follows the node's own `aspectRatio`, and the image is *contained* in whatever
  the title bar and padding leave — scaled down to fit, centred, and **never upscaled past the
  size-class width**, because the class is the author's stated size and a node shape that happens to
  leave more room is not a request for a bigger picture. A ratio extreme enough to leave nothing is
  honoured only down to a 12 px floor, so the node cannot collapse.

The size class is a **display** setting and reaches generation not at all: an SVG carries no size, and
the same image can appear in several scenes at different ones. See
[generation](node-image-generation.md) §6.

Width is authoritative in both modes, which is what lets one placement expression cover them: with a
free aspect the region below the title bar is exactly the image plus its vertical padding, so
"centre in the region" reduces to the padded position.

Padding is per-axis — `hPadding` / `vPadding`, default 14 — reusing `default-node`'s names rather
than inventing a third convention. The title bar's height derives from `titleFontSize` rather than
sitting frozen at 30 px, so raising the font size widens the bar that holds it.

All four knobs plus `fixedAspect` are exposed in the Design tab through the per-design declaration
in `design-registry.ts` (D22).

Width and height feed Cytoscape directly, so they determine hit area, edge endpoints, and
arrange/autolayout spacing — the interaction to watch in testing.

### 5.3 Colour and theme

Two behaviours, chosen per image by `colourMode` (§4.1):

- **thematic** — the SVG carries colour **tokens**, substituted from the theme of whichever scene the
  node appears in, so one image reads correctly everywhere (D32). This does not reverse D4:
  substitution is not regeneration.
- **fixed** — the SVG carries whatever literal colours it was made with, and is never recoloured at
  render time.

**An image ingested as fixed can be made thematic**, and the reverse, through the recolour dialog —
the author assigns each of its colours to a palette slot by hand (generation §7.7). Ingest still sets
`fixed` unconditionally, because at that moment nobody has said which colour is ink and which is
ground.

**The two are not exclusive within one image.** Tokens and literal hex coexist in the same document
with no special handling, so part of a drawing can follow the theme while a brand colour stays put.
`colourMode` means *this document may contain tokens*, which is exactly what the render path needs to
know.

**Substitution happens where the node SVG is composed** — `styles/designs/image-node.ts`, which
already knows the scene and already regenerates per scene. The cache stores the token form and
substitutes on use; the editor preview and *save to file* use the same function.

The theme's image palette, the token syntax and the generation-time pass are
[generation](node-image-generation.md) §7. The palette is resolved by the **caller**, never inside
`ai/`.

### 5.4 Quiz mode

Quiz hides images as it hides labels; the node keeps its dimensions. No new branches were needed:
quiz masks by regenerating the design with `effects.textOpacity: 0`, and the image sits in the same
group that already wraps the equation designs' rendered SVG.

### 5.5 Loading and caching

`storage/node-image-cache.ts` — bounded LRU keyed by image id, so residency tracks recently visited
scenes rather than the graph.

- `ensure(id): Promise<void>` — loads from `nodeImages` if not cached.
- `get(id): { svg, aspectRatio, sizeClass } | undefined` — synchronous.

**The bound is bytes, not entries** (D33) — `MAX_CACHED_BYTES`, 20 MB of SVG source, with a running
total so eviction needs no scan. An entry count was defensible while the size cap was 150 KB; at 1 MB
(§7) the same 200-record bound admitted 200 MB, and the point of a cache is a ceiling on memory rather
than on records.

Eviction **exempts the image just loaded**, because it is the one about to be drawn: a single image
larger than the whole budget would otherwise be evicted the instant it arrived and reloaded on every
frame.

The `await ensure()` lives **in the designs**, not in `generateNodeStyle` — they are already async, and
a node whose design shows no image loads none. The cache lives in **`storage/`** because it is read by
the designs but invalidated by `features/node.ts`; keeping it in `styles/` would force a
`features/ → styles/` import that otherwise does not exist.

---

## 6. Generation

**Canonical docs: [Node image generation](node-image-generation.md) for the call and the prompt,
[Node image presets](node-image-presets.md) for the knobs.** What this document depends on from them:

- Generation is **one call per turn**, a description plus a selected preset, with no ideation stage
  (D12). Refinement is a conversation in which the preset is fixed (D27, D28).
- A **preset** is a named, editable, user-owned bundle stored in localStorage (D11, D13, D15).
- The generator's raw SVG passes the same trust boundary (§7) as upload and paste, and lands in the
  Image tab as a draft (§8) — never in storage.
- `ai/` receives a resolved preset and palette as parameters and imports nothing from `styles/`.
- Nothing in the path is shared with chat (D18).
- Shelf nodes never arrive with images (D5).

---

## 7. Trust boundary

SVG is executable content. **All three entry points are untrusted**, model output no less than upload
and paste. `ai/svg-sanitizer.ts` is the single choke point, and every image passes through it **before
it is stored** — never at render time, never conditionally on origin.

**Reject:** `empty` · `too-large` · `entity-declaration` · `not-xml` · `not-svg` · `no-viewbox` ·
`embedded-image`.

**Strip:** `<script>` · `<foreignObject>` · every `on*` attribute · every `href`/`xlink:href` that is
not a same-document fragment · root `width`/`height`.

Three rules beyond the obvious, each load-bearing:

- **Entity declarations are checked on the raw text before parsing.** `DOMParser` expands entities
  during the parse that would otherwise be the first look at the content, so a billion-laughs payload
  must be caught by string inspection or not at all.
- **Any `<image>` element is rejected**, not only raster ones — a non-raster `<image>` is a nested
  document this pass has not inspected.
- **Root `width`/`height` are stripped**, because §5.2 never adopts intrinsic size and the designs'
  nesting technique depends on their absence.

`<style>` is deliberately **not** stripped: the display rule blocks external subresource loading, and
stripping it would break legitimately styled images.

**Display rule:** previews render as `<img src="data:image/svg+xml,...">`. Never `innerHTML`, never
inline injection into the document.

**Size cap:** `node.imageMaxKB`, default **1024 KB** (D30). It exists to stop a workspace filling up
with megabyte images, not to police how elaborate a drawing is — a few large images and nothing else
is a legitimate graph. Busy-ness is controlled by the preset's element budget
([generation](node-image-generation.md) §6), which is a far better proxy than bytes: one `path` can
be 4 KB.

---

## 8. Node editor — Image tab

A fifth tab in `ui/components/node-editor/`, added to `NODE_EDITOR_TAB_IDS`, following the existing
tab contract: owns its DOM, returns values from `read()`, returns `null` on its own validation
failure, knows nothing about the other tabs.

```ts
export interface ImageTabValues {
  changed: boolean;                  // an untouched tab has no verdict
  image: NodeImage | null;
  removedImageIds: NodeImageId[];
}
```

**Nothing reaches storage until Save.** The tab reports the record it wants persisted and the ids it
superseded; the shell passes both to the save callback, which calls
`features.node.applyImageChange()`. Cancel therefore cannot leave an orphan.

`changed` is required, not decorative: the tab is built synchronously but loads the existing record
asynchronously, so "no image in hand" and "no image wanted" are different states. Conflating them
silently detached the image when the editor was opened and saved quickly.

**The design is never touched** (D20). An image is node-level content; whether it is shown is a
scene-level design choice (§1.3), so attaching, replacing or removing a picture leaves the node's
design alone. The tab imports nothing from `styles/designs/` and carries no design dependency.

The Content tab's equation path still switches design on generate. That asymmetry was reviewed
against D20's argument and kept deliberately (D24); it is not an oversight.

Contents: preview · size · generate · upload · save-as · **recolour** · remove. The preset editor is
reached from the generation dialog (D19), not from here.

**The SVG source box is gone from the UI, and the paste path with it.** Too technical for the audience
the tab is for. `accept()` and the sanitizer path behind it are intact, and `'pasted'` survives as a
`NodeImageOrigin` for records that already carry it — restoring the control is a UI change only. Its
stylesheet rules are kept and marked reserved.

**Recolour** opens its own dialog: [generation](node-image-generation.md) §7.7. It rewrites the tab's
draft in place — same id, same origin, only `svg` and `colourMode` change — so it is an edit rather
than a new attachment and supersedes nothing. Like everything else here, it reaches storage only on
Save, which is also the only undo it has.

**Layout.** A stage pairing the preview with a control column. The panel takes the editor body's
height and distributes it rather than summing fixed pieces — the control column sets the stage height.
Details in `node-editor.css`.

### 8.1 The generation dialog

Specified in [Node image generation](node-image-generation.md) §2. The contract that matters here: the
dialog **sets the tab's draft only and never writes storage**, so an accepted image is lost if the
editor is then cancelled — accepted deliberately, since that is what keeps cancel safe. The same rule
covers a whole correction conversation: nothing in it is persisted, and Accept commits only the last
image.

---

## 9. Interchange

**Workspace file** — images always included, no dialog. `nodeImages` rides inside `GraphData` (D7).
Node images deliberately do **not** join `showImageTransferDialog`, which exists for multi-megabyte
chat photographs; the asymmetry is intentional and should not be "fixed" into symmetry.

**Presets** are their own top-level envelope member, `nodeImagePresets`, and follow the *settings*
rules rather than the graph's (D21): carried in the file, cleared by `clearAllData()` exactly when
settings are, and owned end to end by `storage/node-image-presets.ts`, which already holds the key,
the record shape and the normaliser.

It is the one envelope member **not** normalised on parse. Every other member collapses an absent
value into an empty default; here absent and empty must stay distinguishable — absent means the file
predates the feature and the reader's own presets are left alone, while an empty collection means its
author deleted theirs. `WORKSPACE_VERSION` stays `2.0`: an optional member is compatible both ways.

**Design params need no transfer code at all.** They live at `Scene.nodes[id].design.params` and the
`scenes` table is dumped verbatim, so a layout knob travels the day it is added.

**Markdown** — images, descriptions and presets are all excluded, and the user is not asked (D9).

---

## 10. Settings

New keys under the `node` domain in `config/setting-definitions.ts`:

| Key | Purpose |
|---|---|
| `node.imageSizeSmall` / `Medium` / `Large` | Base render widths in px for the three size classes |
| `node.imageMaxKB` | Sanitizer size cap, default 1024 KB. Kilobytes rather than bytes: nobody types 1048576, and the sanitizer multiplies |

These are app behaviour, not drawing language. Everything shaping generated output lives in presets,
including the default preset selection — see [Node image presets](node-image-presets.md) §4.

---

## 11. Open

Two that this document owns:

- **Workspace import does not re-sanitize node images.** A fourth ingest path where §7 counts three.
  Mitigated by images being drawn through data URIs in image contexts, where script does not execute.
- **The Image tab's colour badge reads a single flag**, so a document holding both tokens and literals
  reports "Theme colours". `hasColourTokens()` is the input a "Mixed" state would need.

The rest are in [Node image generation](node-image-generation.md) §10 (the descriptor vocabulary is
still unjudged, nothing breaks a tie between the description and a knob, the recolour clustering
threshold is a guess) and in [Node image presets](node-image-presets.md) §6 (contradictory descriptor
combinations, starter values).

---

## 12. Implementation history

Shipped in three passes: steps 1–5 (storage, sanitizer, cache, designs, manual paths) on 2026-08-15;
step 6a–6f (presets, prompt vocabulary, palette, generator, preset editor, generation dialog) on
2026-08-16; then preset export/import (§9), design independence (D20), the per-design layout controls
(D22) and fixed-aspect sizing (§5.2).

On 2026-08-17 the prompt was restructured and the documentation split into three (D34): this hub,
[presets](node-image-presets.md), and [generation](node-image-generation.md). A second pass the same
day built most of what that session had planned — the message split (D26), unspecified descriptor
values and the tri-state permissions (D31), the *Open* starter, the correction conversation (D27,
D28), the `aspect` control, the six-tier element budget, the coordinate-precision rule, and the
cache's byte bound (D33).

**Thematic colour (D32) is built** — `ColorTheme.imagePalette`, four colours per theme, `colourMode`,
the OKLab tokeniser and render-time substitution. Nothing in the three documents is marked **Planned**
any longer.

Since then: the preset vocabulary was trimmed from sixteen controls to nine (D42), the editor
regrouped into *Drawing / Size / Colour / Extra instructions*, and generation gained two optional
attachments — the node's own image as a starting point, and a sibling node's image as a style
reference (D43).

**Not yet judged:** no output has been assessed against the descriptor vocabulary. The wording for
artistic style and depth is first-pass, and the image type value list still carries the `icon` /
`silhouette` contradiction.

The step order and its verification criteria are in the project journal, which is the record of work.

---

## 13. Decisions index

What was settled, so it is not relitigated and a later reader can tell a deliberate choice from an
oversight. Covers all three documents; [presets](node-image-presets.md) and
[generation](node-image-generation.md) reference these ids rather than keeping their own lists.
**The reasoning is in the project journal** — this is the index, not the argument. Decisions that
*reverse* an earlier one keep their argument here, since those are the ones most likely to be
re-proposed.

| # | Decision | Where |
|---|---|---|
| D1 | Quiz hides images; dimensions preserved | §5.4 |
| D2 | Images are node-owned, 1:1, deleted with their node — no reference counting, no cross-node reuse | §4.5 |
| D3 | Regeneration replaces in place; no history, but `prompt` is persisted | §4.1 |
| D4 | No auto-regeneration on theme change; drift accepted. Substitution (D32) is not regeneration | §5.3 |
| D5 | Shelf nodes never arrive with images | §6 |
| D6 | Image CRUD on `GraphStore` — a second module declaring the same Dexie database is version skew waiting to happen | §4.3 |
| D7 | `nodeImages` rides inside `GraphData`; `WORKSPACE_VERSION` stays `2.0` | §9 |
| D8 | Style parameters are fixed enums plus one prose field | presets §3 |
| D9 | The generating description is not emitted to Markdown | §9 |
| D10 | Image ids are `prefix-timestamp-random`, not `crypto.randomUUID()` — undefined outside a secure context, including the dev server | §4.1 |
| D12 | No metaphor stage; one call per turn | §6 |
| D13 | Presets live in localStorage, not a fifth IndexedDB database | presets §4 |
| D14 | `NodeImage` carries no `presetId`; `colourMode` is a copied value, not a reference | §4.1 |
| D15 | Starters are seeded once, never merged; *restore starters* is explicit | presets §4 |
| D16 | Text in generated images is a preset option, restricted to generic font families | presets §3.1 |
| D17 | Node-image types live in `core/node-image-types.ts` | §4.1 |
| D19 | The preset editor is reached from the generation dialog, never from Settings | presets §5 |
| D21 | Presets are their own envelope member and follow the settings rules, clearing included | §9 |
| D22 | Layout knobs are declared per design, not branched on per design | §5.2 |
| D24 | D20 applies to images only; the equation path keeps its design switch — the asymmetry is deliberate | §8 |
| D25 | Prompt sections are grouped by the question they answer, not by which half of the preset record they came from | generation §5 |
| D26 | System message carries the invariant contract; the user message carries the whole brief | generation §3 |
| D27 | A preset is fixed for the length of a conversation; changing it starts a new one | generation §8 |
| D28 | Redraw is a conversation — correction turns carry prose only, history is transient, only the newest SVG is kept in full | generation §8 |
| D31 | Every descriptor may be left unspecified, emitting no line — the only real lever on over-specification | presets §3.5 |
| D33 | The image cache bounds by bytes, not entry count | §5.5 |
| D34 | Three documents, split at the code's seam: value versus expansion | header |
| D35 | Aspect folds orientation into its value; ratios stop at 3:1 | presets §3.4 |
| D36 | No file-size preset knob — coordinate precision in the contract is the version a model can obey | presets §3.2 |
| D37 | The legibility floor is stated only below *very detailed*; above it the image is meant to be examined zoomed in | generation §6 |
| D38 | A correction is `{ svg, text }` on a list, not a `brief \| correction` union — same invariant, one fewer type | generation §8 |
| D39 | Colour mode is `thematic \| fixed`, and `paletteSize` applies in **both** — a colour count is obeyable, and a knob dead in half its modes is not a knob | presets §3.3 |
| D40 | The theme's four image colours are handed over untagged — no fill/line split and no per-colour job, because either would collide with `renderMode` | generation §7.1 |
| D41 | Colour snapping is measured in OKLab, not RGB | generation §7.3 |
| D42 | Sixteen preset controls trimmed to nine; a knob survives only if its values are unambiguous **and** it is needed for consistency or set on most images | presets §3.1 |
| D43 | Reference images travel as SVG source text, never through a vision API | generation §5.5 |
| D44 | The contract requires six-digit hex for every colour, which is what makes colour handling a text pass rather than an SVG parse | §7 |
| D45 | The generation prompt states **no display size**; `sizeClass` is a display setting and reaches generation not at all | generation §6 |
| D46 | `aspect` has no *unspecified* and no *free*, and a returned viewBox that is not the requested one is rejected | presets §3.4, generation §6 |
| D47 | `form` splits out of `artisticStyle`; `silhouette` dropped, `figure` and `portrait` added; the element budget becomes a ceiling and curve complexity is free | presets §3.1, generation §6 |
| D48 | Gradients are stated as a direction, not a permission — "permitted" and silence were the same instruction | presets §3.2 |
| D49 | `artisticStyle` removed entirely — six idioms that moved the output unpredictably; a specific style belongs in Extra instructions | presets §3.1 |
| D50 | Opacity leaves the system contract and becomes the `transparencyAllowed` knob — a rendering choice is not an enforced invariant | generation §4 |
| D51 | The brief is flat: no section headings, no lead-ins, and one precedence rule stated once in the system message | generation §3, §5 |
| D52 | The surfaces line is removed — a fixed-colour image is fixed because its colours belong to the subject | generation §7.5 |
| D53 | Recolouring is manual assignment, not proximity snapping — an imported image needs the opposite of its nearest palette colour | generation §7.7 |

### The reversals

**D11 — the style contract became a collection of user-authored presets.** *Reverses the original
flat-settings design and the implementation built against it.* The parameter set tripled once content
descriptors were added, and every preset must be editable and duplicable — a collection of named
editable records has no shape in a settings system whose API is one typed value per key.

**D18 — image generation shares nothing with chat.** *Reverses a draft that placed the SVG rules
beside the equation rules in `ai/prompts.ts` so a future chat action could interpolate them.* Chat
will not generate node images: coherence needs sixteen style parameters plus a preset selection and a
chat turn carries none of them, so what it produced would be exactly the mismatched zoo §1 rejects.
Everything between "the user wants a picture of X" and "a raw SVG exists" lives under `ai/node-image/`.

**D20 — image and design are independent; the node editor never switches design.** *Reverses the
Image tab's `applyDesign(node.imageDesign)` on attach.* An image is node-level data; a design is the
node's property in a given scene. Mutating a scene property because node data changed is a coupling
the model does not have, and it silently discarded the user's choice between the two image designs
every time a picture was replaced. Cost: attaching an image to a text card shows nothing until a
design is chosen — accepted, the Design tab is one click away. Loose ends in §11.

**D23 — `padding` became `hPadding` / `vPadding`, with no alias.** Separate axes cannot be exposed
while a single `padding` stays authoritative, and `hPadding ?? padding ?? 14` is the compatibility
shim the architecture rules out. The names are `default-node`'s rather than a third convention. Cost:
a `padding` set by hand through the Advanced JSON tab is ignored.

**D29 — "pictogram" is not the framing word, and complexity is not capped by vocabulary.** *Reverses
§1's "symbolic, not analogous" as a hard boundary.* The word contradicted presets selecting `plot`,
`map` or `schematic`, and it ruled out elaborate schematics and infographics that are legitimately in
scope. What survives is one line — vector artwork, not photorealism. How elaborate a drawing may be
is the preset's decision.

**D30 — the byte cap is a bloat guard, not a busy-ness control.** *Reverses the cap's stated purpose
and its 150 KB value, now 1 MB.* Preventing a workspace full of megabyte images is worth a cap;
preventing a user from making a few large images is not. Busy-ness moves to the element budget, which
is a better proxy anyway. Two consequences carried elsewhere: the cache bounds by bytes (D33) and the
prompt's *"has stopped being a pictogram"* line is gone (D29).

**D32 — thematic images store role tokens and resolve at render.** *Extends rather than reverses D4.*
A thematic image carries `var(--knogra-image-ink-n, #hex)` tokens, substituted where the node SVG is
composed, so one drawing reads correctly under every theme. The literal hex stays as the fallback, so
an unsubstituted image degrades to its generation-time colours rather than to black. Costs: each theme
gains a hardcoded four-colour image palette, uploads and pastes cannot participate, and legibility
across themes is only as good as the palettes we pick.

---

## 14. File map

Every path the feature owns, and every shared file it reaches into. Authoritative: if code and this
table disagree, one of them is a defect.

Base names are unique across `src/`. Two are deliberately longer than they need to be:
`node-image-preset-definitions.ts` so it cannot be confused with the registry that stores those
presets, and `prompt-composer.ts` so it cannot be confused with `ai/prompts.ts`, which this feature
never touches (D18).

### 14.1 Feature-owned files

| Path | Owns |
|---|---|
| `src/core/node-image-types.ts` | Image record, generation vocabulary, preset record |
| `src/config/node-image-preset-definitions.ts` | Value sets, labels, field defaults, 4 starters |
| `src/storage/node-image-presets.ts` | localStorage registry: seed, normalise, CRUD, last-preset guard, workspace transfer |
| `src/storage/node-image-cache.ts` | Bounded LRU over the `nodeImages` table |
| `src/ai/node-image/svg-sanitizer.ts` | Trust boundary for all three entry points (§7) |
| `src/ai/node-image/prompt/prompt-composer.ts` | The brief's assembly, the correction transcript, and the request/prompt types |
| `src/ai/node-image/prompt/system-contract.ts` | `NODE_IMAGE_SYSTEM_CONTRACT` — the enforced half, no parameters |
| `src/ai/node-image/prompt/rule-primitives.ts` | `Specified`, `rule`, `permission`, `stated` — where D31 is implemented |
| `src/ai/node-image/prompt/drawing-rules.ts` | Image type, form and the element budget — the *Drawing* group |
| `src/ai/node-image/prompt/technique-rules.ts` | Aspect viewBoxes, stroke widths and margin, depth, text, render mode, enclosure — the *Technique* group |
| `src/ai/node-image/prompt/colour-rules.ts` | Palette, backdrop, gradients, transparency, no-frame rule — the *Colour* group |
| `src/ai/node-image/viewbox-check.ts` | Rejects a returned image whose viewBox is not the one requested |
| `src/ai/node-image/svg-generator.ts` | Provider call, JSON-only, conversation turns, backdrop strip, result union |
| `src/styles/node-image-palette.ts` | `resolveNodeImagePalette(themeId, paletteSize)` and the dev legibility audit |
| `src/styles/node-image-tokens.ts` | Tokenising an accepted image, listing and mapping colours for recolour, and substituting at render (§5.3) |
| `src/styles/designs/image-node.ts` | Both designs, one renderer, both sizing modes (§5.1, §5.2) |
| `src/ui/components/node-editor/image-tab.ts` | Upload, size, save-as, recolour, remove (§8), and the colour-mode badge |
| `src/ui/components/node-editor/image-generation-dialog.ts` | The generation overlay, the correction conversation, the preset editor entry point, and the template picker (generation §2, §5.5) |
| `src/ui/components/node-editor/image-recolour-dialog.ts` | Manual colour-to-slot assignment with live preview (generation §7.7) |
| `src/ui/components/node-image-preset-editor.ts` | Preset CRUD, duplicate, restore starters |
| `src/styles/node-image-preset-editor.css` | That editor's stylesheet — one per `ui/components/` modal |

### 14.2 Shared files reached into

None of these are the feature's to reshape. The ones worth knowing about, because what they carry is
not obvious from the file name:

- `storage/graph-store.ts` — node image CRUD, deliberately outside `init()` (§4.3).
- `storage/node-deletion.ts` — the ownership cascade (§4.5).
- `storage/workspace/envelope.ts` — the deliberately un-normalised `nodeImagePresets` member (§9);
  `workspace.ts` assembles and adopts it, `workspace/transfer.ts` clears its key with settings (D21).
- `styles/designs/design-registry.ts` — both designs registered, plus the per-design layout-control
  declaration; `styles/designs/default-node.ts` exports the defaults it references (D22), and
  `ui/components/node-editor/design-tab.ts` renders them.
- `config/node-properties.ts` — `imageId` in `NODE_SYSTEM_PROPERTIES`, hidden *and* preserved on save.
- `main.ts` — dev-only console handles on the registry, composer, palette and generator.

Routine registrations, listed for completeness: `config/storage-config.ts` (schema v4, the presets
key), `config/node-settings.ts` and `config/setting-definitions.ts` (§10), `config/design-manifest.ts`,
`features/node.ts` (`applyImageChange()`), `node-editor-types.ts`, `node-editor.ts`,
`editor-openers.ts`, `styles/node-editor.css`.

### 14.3 Folder isolation

One folder exists — `src/ai/node-image/` — because the generation path is genuinely independent of
chat (D18) and reaches three files. Everywhere else the feature holds one or two files per layer, so
the `node-image-` prefix carries the grouping instead. Create a per-layer subfolder when a layer
reaches three feature files or one outgrows a single responsibility — not before.

Three constraints hold whatever the file count, because each encodes a dependency direction:

- **The cache stays at or below `styles/`.** `styles/designs/image-node.ts` reads it, so a home in
  `features/` would invert the direction. It lived in `styles/designs/` once and moved out because
  caching a persisted record is storage coherence, not styling.
- **`ai/` imports nothing from `styles/`.** The palette is resolved by the caller and passed in
  ([generation](node-image-generation.md) §7).
- **No cross-layer subsystem folder.** One folder holding types, config, persistence, generation,
  designs and UI would import from six places and be imported by four. `src/background/` is not a
  precedent: it has a single role, and its images, settings and editor live in the normal layers.