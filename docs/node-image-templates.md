# Node Image Presets and Generation

> **Status: SUPERSEDED — 2026-08-17. Do not read, do not cite, do not edit.**
> Split into [node-image-presets.md](node-image-presets.md) (the preset record, vocabulary, storage,
> editor) and [node-image-generation.md](node-image-generation.md) (the dialog, message structure,
> prompt composition, colour, the correction conversation, the generator).
> Kept only until the doc references in source comments are repointed; delete after that.
> Everything below is stale — in particular the colour section, §3's prompt layers, and the byte cap.

---

## 1. What this document covers

Everything between "the user wants a picture of X" and "a sanitized SVG exists". The parent document
owns everything on either side of that: how an image is stored, rendered, secured, edited, and
exported.

The generation path depends on the rest of the feature only through types — paste and upload give a
fully usable feature with no AI involvement at all.

---

## 2. Presets

A **preset** is a named, editable bundle of content descriptors and technical specs, selected **per
image** at generation time with one marked as the default (D11).

Cross-graph coherence — the reason this feature generates rather than sources images — comes from
users keeping the *technical* half constant while varying the *content* half. `icon` and `plot` are
legitimately different kinds of drawing; a graph needing both is not incoherent.

```ts
// core/node-image-types.ts
export interface NodeImagePreset {
  id: NodeImagePresetId;
  name: string;
  content: {
    imageType: NodeImageType;
    abstraction: NodeImageAbstraction;
    viewpoint: NodeImageViewpoint;
    composition: NodeImageComposition;
    motionCues: boolean;
    enclosure: NodeImageEnclosure;
    textAllowed: boolean;
  };
  technical: {
    renderMode: NodeImageRenderMode;
    strokeWeight: NodeImageStrokeWeight;
    cornerTreatment: NodeImageCornerTreatment;
    paletteSize: NodeImagePaletteSize;
    detailLevel: NodeImageDetailLevel;
    backdrop: NodeImageBackdrop;
    gradientsAllowed: boolean;
    dashesAllowed: boolean;
  };
  styleDirection: string;   // free prose, appended verbatim
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.1 Content descriptors — what is drawn

| Descriptor | Values |
|---|---|
| Image type | icon · schematic · plot · flow diagram · symbol · silhouette · map |
| Abstraction | literal · stylised · abstract |
| Viewpoint | flat front-on · three-quarter · isometric · top-down · cross-section |
| Composition | single subject · subject in context · paired contrast · sequence |
| Motion cues | permitted · not permitted |
| Enclosure | none · circle · rounded square |
| Text | permitted · not permitted (D16) |

### 2.2 Technical specs — how it is rendered

| Spec | Values |
|---|---|
| Render mode | line art · filled · mixed |
| Stroke weight | thin · medium · heavy |
| Corner treatment | sharp · rounded |
| Palette size | 1 · 2 · 3 colours |
| Detail level | minimal · moderate · detailed |
| Backdrop | transparent · theme surface · contrast fill |
| Gradients | permitted · not permitted |
| Dashed strokes | permitted · not permitted |
| Style direction | free prose |

**Size is not a preset field.** It is a per-image decision made in the dialog, because the same icon
language legitimately covers a small glyph and a large plot.

### 2.3 Storage

**localStorage**, key `knogra.nodeImagePresets`, one record holding both the collection and the
default selection. `storage/node-image-presets.ts` owns it, synchronously. Not IndexedDB (D13); not a
merged manifest (D15).

- **Seed lazily when the key is absent.** One rule covers first run, `Ctrl+N` with *keep settings*
  unchecked, and workspace files predating the feature, and distinguishes *absent* (seed) from *empty*
  (the user deleted them — respect it).
- **Normalise on read** — fill missing or unrecognised fields from `NODE_IMAGE_PRESET_DEFAULTS`.
  localStorage is untrusted input, and with no merge nothing else backfills a field added by a later
  build.
- **Refuse to delete the last preset.** Generation needs one to exist. Enforced in the registry, not
  the UI ([architecture.md](architecture.md) §3.10), and reported to the caller as `'refused-last'`.

The vocabulary, the field defaults and the starters all live in
`config/node-image-preset-definitions.ts`, shaped after `edge-type-settings.ts`. Starters are **seeds,
not built-ins** — copied into the collection with fresh ids and indistinguishable from user records
afterwards. No `isBuiltIn` flag, no merge on read. Four ship: *Icon*, *Schematic*, *Plot*, *Emblem*.

**Presets behave as a kind of setting** (D21). They are exported as their own envelope member,
`nodeImagePresets`, not inside `settings` (a flat scalar map); they are cleared by `clearAllData()`
exactly when settings are; and the same module owns both the key and the transfer pair, so nothing
else learns the record shape. The absent-versus-empty distinction above is what forces that member to
skip the envelope's normalisation — see [nodes-svg-images.md](nodes-svg-images.md) §9. Nothing in
persisted graph data references a preset (D14), which is what keeps them out of the graph database.

### 2.4 The editor

`ui/components/node-image-preset-editor.ts` with `styles/node-image-preset-editor.css` — create,
duplicate, rename, edit, delete, set default, and *restore starters* (additive, fresh copies, never
overwriting).

Shaped after `theme-picker.ts`: draggable modal centred on the graph viewport, preset list on the
left, two tabs on the right mirroring the record's two halves. Save semantics follow
`edge-type-manager.ts` — field edits are drafts committed on Save, while add / duplicate / delete /
restore / make-default take effect immediately, because a half-committed collection is worse than an
immediate one. Re-reading the registry after a structural action preserves pending drafts.

**Reached from the generation dialog** (D19), beside the preset selector — never from the Settings
modal: sixteen controls is a wall inside a scalar settings list, the settings system has no shape for
a collection of named records, and no launcher-button pattern exists there to follow. The dialog
rather than the Image tab, because presets are compared where they are used, and a seventh button
would have blown the tab's control column.

---

## 3. Prompt composition

### 3.1 Layers

| Layer | Configurable | Scope | Source |
|---|---|---|---|
| Boilerplate | No | Fixed in code | `NODE_IMAGE_SVG_RULES` in `ai/node-image/prompt-composer.ts` |
| Content descriptors | Yes | Preset | §2.1 |
| Technical specs | Yes | Preset | §2.2 |
| Description | — | Per image | User free text |

Resolved per request rather than stored: the **palette** (§4) and the **size class**.

### 3.2 Boilerplate

Carries what must never vary: JSON response shape, viewBox convention, self-containment, no scripts
or external references, size cap. Not user-facing — editing it would break ingestion
([nodes-svg-images.md](nodes-svg-images.md) §7).

Four rules in it must be stated precisely:

- **viewBox: origin `0 0`, longest side `100`, no `width`/`height` attributes.** Fixing the scale but
  not the shape lets stroke weights be absolute numbers while allowing a plot to be wide — the node's
  aspect ratio is derived *from* the viewBox.
- **Stroke weight reaches the model as a number:** thin / medium / heavy → 1 / 2 / 3.5 units.
- **When text is permitted**, only the generic families `sans-serif`, `serif`, `monospace` may be
  named — the SVG is a data URI nested in a node's own SVG, where no specific font is guaranteed.
- **Backdrop, enclosure and the no-frame rule describe the same region.** Backdrop paints it,
  enclosure draws its boundary, and "no frame, no border, no padding" applies **only** when backdrop
  is `transparent` and enclosure is `none`. The sole conditional in an otherwise fixed boilerplate.

### 3.3 Vocabulary

Every descriptor value expands to a **written paragraph** in `ai/node-image/prompt-composer.ts`, not
to its own name: `icon` becomes *"a bold pictogram: one subject, heavy silhouette, no incidental
detail, readable at thumbnail size."* The user picks a word; the model receives a specification. This
expansion is the entire value of predefining descriptors, and why they cannot live in the free-prose
field.

The value→paragraph map is **data, not branches**, so adding a value is one map entry plus one control
and never a change to composition.

**Nothing here is shared with chat, and nothing here goes in `ai/prompts.ts`** (D18). Image generation
lives entirely under `ai/node-image/`: its own boilerplate, its own vocabulary, its own composer, its
own generator. An earlier draft placed the boilerplate alongside `NODE_EQUATION_VALUE_RULES` so a
future chat-driven image action could interpolate it; that future was then ruled out, and the sharing
argument with it.

### 3.4 Composed shape

```
[boilerplate]

Draw: <description>                              ← user, per image
Subject: <node title>

Type: <imageType paragraph>                      ← descriptor expansions
Abstraction: … Viewpoint: … Composition: …
Motion cues: … Enclosure: … Text: …

Render mode: … Stroke weight: 2 units. Corners: …  ← technical specs
Detail: … Gradients: … Dashes: …
Additional direction: <styleDirection>
Displayed at about 128 px wide.                  ← size class

Palette — Primary #e6edf3, Accent #58a6ff.       ← resolved palette
Sits on #07090c; do not draw in that colour.
```

The composer is a **pure function**: `(template, palette, sizeClass, description, title) → string`.

---

## 4. Palette resolution

`NodeImagePalette` is a record of named roles, so a sixth role can be added without touching prompt
composition:

| Role | Theme source |
|---|---|
| `surface` | `node.background` **composited over** `canvas.background` |
| `surfaceAlt` | `node.backgroundAlt` |
| `ink[0]` primary | `node.text` |
| `ink[1]` accent | `node.accent` — palette size 2+ |
| `ink[2]` muted | `node.textSecondary` — palette size 3 |

Two rules that are easy to get wrong:

- **The surface must be composited, not read raw.** `DEFAULT_THEME.node.background` is `#000000` at
  opacity `0.5` over a canvas of `#0d1117`, so the colour the image actually sits on is neither.
  Passing the raw hex misinforms the model about contrast.
- **Ink is ordered by guaranteed contrast** — `text` first, because a theme author has already made it
  legible against that surface; `textSecondary` last, because it is the weakest.

Surfaces are stated to the model as **context, never as drawing colours**; ink is the permitted
palette, truncated to `paletteSize`.

`resolveNodeImagePalette(themeId, paletteSize)` lives in `styles/`, and the **caller** resolves it and
passes it in — never `ai/` (§5).

---

## 5. The generator

`ai/node-image/svg-generator.ts`, built on the same provider plumbing as `ai/equation-generator.ts`:
independent of chat sessions and chat persistence, provider resolved through the same
`resolveProviderConfig` pattern, JSON-only. It shares no prompt text with chat (D18).

```ts
export type SvgImageResult =
  | { type: 'svg'; svg: string }
  | { type: 'clarification'; message: string };
```

The `clarification` arm mirrors the equation generator, so an under-specified request returns a
question rather than a bad drawing.

**Receives a resolved preset and palette as parameters.** It never reads the registry and never
resolves a theme, exactly as `equation-generator` takes plain strings rather than reaching for graph
state. This keeps `ai/` free of any import from `styles/` — an edge that does not exist today.

Provider resolution is a private copy of the one in `equation-generator.ts` and `chat-session.ts`.
Deduplicating the three is a change to the provider module on its own merits, not part of this
feature.

### 5.1 Backdrop strip

Models emit full-bleed background rectangles regardless of instruction. When the preset asks for a
transparent backdrop, a leading `<rect>` covering the viewBox is removed.

In the generator, **not** the sanitizer, which stays a pure security boundary — and only for generated
images, never uploads or pastes, mirroring the rule that user material is never altered.

**String-based, never DOM-based.** `DOMParser` expands entity declarations during the parse, so
parsing here would run ahead of the sanitizer's billion-laughs check, which works on raw text. The
match is confined to a rect in the only position a background rect can occupy — first element in the
document.

### 5.2 Model routing

Same provider and model as chat; no separate setting. When failure indicates capability rather than
accident — unparseable output, no SVG element, prose instead of markup — the message names the model
and suggests switching.

---

## 6. The generation dialog

The `equation-dialog.ts` pattern — an overlay hosted inside the editor modal rather than a third
window, busy state, `Ctrl+Enter` submits, `Escape` closes.

One stage, carrying a **description** seeded from the node title, a **preset** selector with a
**Manage presets** button beside it (§2.4), and its **own size control** seeded from the tab (size is
stated in the prompt, so it must be chosen before generating; Accept writes it back). Result previewed
with **Accept** / **Redraw**; sanitizer rejections offer the raw source rather than swallowing it.

Three things the plan did not anticipate, each load-bearing:

- **The overlay is measured onto the editor frame**, through a `getEditorRect` dep, rather than
  centred on the Cytoscape container. The editor is draggable, so an assumed centre showed three
  stacked frames.
- **A dev-only `Prompt` button** renders the composed system + user prompt into the result pane, gated
  on `import.meta.env.DEV` so Vite drops it from production. It shares one `buildRequest()` with
  Generate — a preview built on a second code path would be worth nothing.
- **The result pane is never empty.** An empty bordered box read as an input, so it always carries a
  hint, a preview, or monospaced source text.

Capability is injected (`NodeEditorOnGenerateImage`) rather than imported, following the equation
precedent, and `resolveNodeImageWidth` is exported from `styles/designs/image-node.ts` so the prompt
cannot state a width the design does not draw at.

Accept sets the tab's draft only, so an accepted image is lost if the editor is then cancelled —
accepted deliberately, since that rule is what keeps cancel safe
([nodes-svg-images.md](nodes-svg-images.md) §8).

---

## 7. Open questions

- Descriptor combinations can contradict each other (`plot` + `isometric` + `abstract`). v1 does not
  guard them; revisit if real output shows it matters.
- Starter preset values are shipping guesses. They are revisable once there is generated output to
  judge them against — an enum member is a one-line change with no storage consequence, since the
  registry normalises on read.
- Whether `plot` and `flow diagram` earn their place given that text is optional and unreadable at
  icon size.
