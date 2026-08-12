# Pictogram Node Design

> **Status:** Draft — specification for v2. Not implemented. No code in `src/` reflects this document yet.
> **Last reviewed:** 2026-08-11
> **Authority:** Proposed design. Authoritative for *intent and approach*; every implementation
> detail is provisional until built. Where it describes **current** system behaviour (§2), that
> behaviour was verified against code and in the browser on the date above.
> **Related:** [Node design system](node-design-system.md), [Theme architecture](theme-architecture.md),
> [Knogra vision](knogra-vision.md), [Chat image retrieval](chat-image-retrieval.md)

---

## 1. Summary

Add a node design that renders a **vector pictogram** (a small inline SVG glyph) alongside the node
title, so nodes become *visually* identifiable rather than only readable.

Pictograms are drawn from a **library** — workspace-local, with an optional shared catalogue hosted
alongside the marketing site — and can be suggested by the AI assistant based on node content.

**Explicitly not** raster images. See §4.

---

## 2. Key technical finding (verified 2026-08-11)

**Knogra's node rendering pipeline is vector-sharp end to end.** This is the finding that makes the
whole feature cheap, and it is counter-intuitive enough to be worth recording.

Every node design serialises its artwork to an SVG data URI and hands it to Cytoscape as
`background-image` with `background-opacity: 0` (see `getDefaultNodeStyle` in
`src/styles/designs/default-node.ts`). It would be reasonable to assume the SVG is rasterised once
at its intrinsic size and then bitmap-stretched onto the canvas — which would impose a resolution
ceiling on fine detail.

**That assumption is wrong.** Blink and Gecko treat SVG images specially: an `SVGImage` is drawn by
replaying the SVG document into the destination rectangle at device resolution, and re-rasterised
when the destination size changes. Confirmed empirically — nodes stay crisp at arbitrary canvas
zoom and at `scale` 5×.

**Consequences for this feature:**

- Fine line detail is safe. No resolution ceiling, no size variants, no detail levels in the
  library format.
- A pictogram library can use whatever stroke weight and complexity looks right aesthetically.
- Pictograms remain legible when the user zooms in to inspect a single node *and* when zoomed out.

### 2.1 What actually breaks at large `scale` — and why it matters here

`scale` multiplies only `nodeStyle.width` / `nodeStyle.height` (`StyleGenerator`, three call sites
in `src/styles/style-generator.ts`). Nothing re-renders. The visible artefacts at 5×+ are
**proportionality**, not resolution, and the two failure modes pull in opposite directions:

| Element | Where it lives | Behaviour at 5× |
|---|---|---|
| Drop shadow | Inside the SVG (`getShadowPadding`, `buildShadowFilter`) | Scales **with** the node → bloated, heavy |
| Theme / selection / central border | Cytoscape `border-width`, in graph units | Does **not** scale → hairline, affordance weakens |
| Gradients, vignette `spread` | Percentage-based inside the SVG | Correct at any scale |

A pictogram is inside the SVG, so it inherits the *shadow* behaviour: its strokes scale with the
node. See §5.5 — this needs a deliberate decision, not a default.

`NODE_SCALE_MAX` was raised from `3.0` to `5.0` on 2026-08-11 (`src/config/node-settings.ts`);
10× was trialled and rejected as unnecessary, not as broken.

---

## 3. Motivation and use cases

The product thesis is spatial, associative thinking. Text-only nodes make every scene a wall of
labels — the user reads to navigate, rather than recognising. Pictograms add a second, faster
channel.

### 3.1 Recognition at scan speed

Shape and silhouette are processed far faster than text. In a dense scene, or at a zoom level where
labels are too small to read, a pictogram still identifies a node. This directly complements the
Mermaid-import density work: it makes large single-scene graphs more navigable, not merely legal.

### 3.2 Memory palaces

Listed as a first-class use case in `README.md`. Memory technique depends on *distinctive imagery*,
not verbal labels — a pictogram is the associative hook the feature currently asks users to imagine
for themselves.

### 3.3 Quiz mode

Quiz mode hides node labels. A pictogram survives that, enabling a genuinely different drill:
*recall the concept from its image*. This is a stronger retrieval cue than position alone, and it
turns quiz mode into something closer to flashcards with spatial context. **Decide deliberately**
whether quiz mode hides pictograms too — both behaviours are defensible and it should be a setting,
not an accident.

### 3.4 Categorical encoding

A pictogram can mark a node's *kind* rather than its content: person, equation, event, place,
source/citation, open question, definition, example. Knogra has rich edge typing but no comparable
node-level semantic marker. Pictograms could become that, informally, without adding a node-type
system to the data model.

### 3.5 Wayfinding across transitions

Scene transitions move between focused views. Recognising "the node I came from" by silhouette is
faster than re-reading its title, which should make the spatial model stick better.

### 3.6 Presentation and paths

Paths are guided tours for revision, presentation and storytelling. Pictograms give path steps
visual identity — closer to slides than to an outline.

### 3.7 Shorter titles

If a pictogram carries part of the meaning, titles can be terser, nodes smaller, scenes denser and
more readable. A second-order benefit, but it compounds with §3.1.

### 3.8 Language independence

Pictograms read the same across languages — relevant for shared/published graphs and for the
library being usable by non-English speakers.

---

## 4. Scope and non-goals

**In scope:** inline vector pictograms (SVG glyph markup), a library to pick them from, AI-assisted
selection, theming integration.

**Out of scope, deliberately:**

- **Raster images (PNG/JPEG/WebP).** They would break the zoom experience that §2 shows the app
  currently gets for free, and would force a much heavier storage architecture (blob table, Dexie
  migration, workspace format bump, downscaling pipeline, size limits, asset GC). If photographic
  content is ever wanted, it is a *separate* feature with a separate design document — not an
  extension of this one.
- **Per-node freehand drawing.** A drawing tool is its own product surface.
- **Animated SVG.** `<animate>` and friends are stripped by the sanitiser (§6); the canvas would
  not replay them anyway.
- **Full-colour illustrations.** See §5.4 — they cannot survive multi-theme rendering.

---

## 5. Architecture

### 5.1 Composition: splice, do not nest

The pictogram's markup is **spliced inline** into the node's SVG string as a `<g>` element, before
the document is encoded to a data URI.

Do **not** use `<image href="data:image/svg+xml,...">`. SVG rendered as an image runs in the
browser's secure static mode, where nested and external resource handling varies across engines.
Splicing produces one flat document, one data URI, no fetching, no cross-engine surprises.

Two mechanical requirements:

- **ID namespacing.** Existing designs use fixed IDs (`grad-0`, `fx-0`, `clip-0`, `vignette-0`).
  Spliced pictogram markup may carry its own `id`s for gradients or clip paths, and duplicates
  across the two documents will collide. The sanitiser (§6) must rewrite every `id` and every
  internal `url(#…)` reference with a per-node prefix.
- **Coordinate isolation.** Wrap the pictogram in `<g transform="translate(x,y) scale(s)">`
  computed from its `viewBox`, so the library artwork never has to know the node's coordinate
  system.

### 5.2 The design file

`src/styles/designs/pictogram-node.ts`, exporting `getPictogramNodeStyle(node, params, theme)`,
following the shape of `default-node.ts`.

Registration is compiler-guided and cheap:

- `src/styles/designs/design-registry.ts` — one member on the `Design` union, one `switch` case.
  The `never` exhaustiveness check makes a partial implementation a type error.
- `src/config/design-manifest.ts` — one `{ id, label }` entry; `AVAILABLE_DESIGNS` and the settings
  UI derive from it automatically.

`getNodeStyle` is already `async` (the equation designs await MathJax), so asynchrony is available
if the pictogram must be fetched — though §7 aims to make the render path synchronous.

### 5.3 Sizing and layout

`default-node.ts` derives node size from text: `computeTextLayout` picks the line count whose
resulting box is closest to a target aspect ratio. A pictogram fixes part of the box, so that logic
needs adapting rather than reusing.

Proposed **slot model** — pictogram occupies a reserved region, text lays out in the remainder:

| Variant | Layout | Suits |
|---|---|---|
| `left` | Glyph left, text right | Long titles, list-like scenes |
| `top` | Glyph above centred text | Short titles, card feel |
| `background` | Large glyph, low opacity, text over it | Ambient/categorical marking |
| `only` | Glyph alone, no text | Maximum density; pairs with quiz mode |

Sizing rule: glyph edge = `pictogramScale × fontSize × k`, so the glyph tracks typography rather
than being an absolute size. Start with `left` and `top`; the others are additive later.

### 5.4 Theming — constrains the library format

With multiple themes and 20+ designs, full-colour artwork will clash somewhere. The format that
survives is **monochrome line art with a single substitutable colour**: library SVGs use
`currentColor` (or one designated token) which the design rewrites to `theme.node.text.color`, or
to `colorOverrides.text` when the user has overridden it.

**Decide this before commissioning any artwork.** Retrofitting a library to be themeable is far
more expensive than constraining it up front. A per-node `pictogramColor` override and a
`pictogramOpacity` knob can then sit alongside the existing `colorOverrides` / `effects` params.

### 5.5 Stroke scaling under `scale`

Per §2.1, artwork inside the SVG scales with the node while Cytoscape-level borders do not. For
stroked pictograms this means a 5× node has 5×-thick glyph strokes.

Two options — pick one and record it:

- **Filled paths only** in the library format. Sidesteps the problem entirely; also renders more
  predictably. *Recommended.*
- **`vector-effect="non-scaling-stroke"`** on strokes. Keeps stroke weight constant in device
  pixels, which matches the border behaviour but will look thin on large nodes and is one more
  thing the sanitiser must allow and validate.

### 5.6 Data model and storage

Reference by id, do not inline blindly:

```
Scene.nodes[nodeId].design = {
  id: 'pictogram-node',
  params: {
    pictogramId: 'lib:atom',      // reference into the pictogram store
    slot: 'left',
    pictogramScale: 1.0,
    pictogramColor?: string,       // else theme.node.text.color
    pictogramOpacity?: number,
    ...existing DefaultNodeParams (fontSize, aspectRatio, colorOverrides, effects, gradient)
  }
}
```

A pictogram is 1–20 KB of text, so the storage pressure that forces a separate table for photos
largely evaporates. Two viable options:

| Option | Mechanism | Cost | Verdict |
|---|---|---|---|
| **A. Inline markup in `design.params`** | Sanitised SVG string stored per scene node | No schema change, no migration, **no workspace format bump**; duplicates markup per scene; enlarges every Scene record, which GraphSaver rewrites frequently | Fine for a prototype |
| **B. `pictograms` Dexie table** | `{ id, name, tags, markup, viewBox, source, createdAt }`, referenced by `pictogramId` | Dexie version bump + migration, `transfer.ts` export/import, workspace format bump | **Recommended for the real thing** |

Option B mirrors the existing `backgroundImages` precedent exactly — own table in
`src/storage/graph-store.ts`, exported by `exportBackgroundImages()` in
`src/storage/workspace/transfer.ts`, referenced by id from scenes. Following that shape keeps the
storage layer internally consistent.

**Ship B from the start if possible.** Migrating A→B later means rewriting user scene records,
which is exactly the kind of data migration worth avoiding.

**Asset lifecycle** is an open question either way: what happens to a stored pictogram when the
last node referencing it is deleted? Reference counting, a GC pass, or deliberate orphan
tolerance. Worth checking how `backgroundImages` handles this today — the gap may already exist
and would be inherited.

---

## 6. Security — the dominant risk

SVG from a shared catalogue, a user upload, or an AI response is **untrusted markup being injected
into a document**. This is OWASP A03 (injection) and is a larger risk than any performance concern
in this feature.

SVG can carry `<script>`, event handler attributes, `<foreignObject>` containing arbitrary HTML,
external `href`/`xlink:href` references (silent tracking beacons — directly contrary to the privacy
guarantees in `README.md`), and CSS `@import`.

Secure static mode gives real protection **on the canvas**, but it is not a sufficient defence:

1. It is a browser behaviour being relied on as the sole control, with no defence in depth.
2. It does not cover the **picker UI**, which will render pictograms as live DOM for browsing. That
   is where XSS actually happens.
3. A hosted community catalogue means redistributing third-party SVG, raising the bar further.

**Build the sanitiser first — before the design file, not as a hardening pass at the end.**

`src/styles/designs/pictogram-sanitizer.ts` (or `src/core/`, if it should stay dependency-light):

- **Allowlist only.** Elements: `g, path, circle, ellipse, rect, line, polyline, polygon, defs,
  linearGradient, radialGradient, stop, clipPath, use, title, desc`. Attributes: geometry (`d, x,
  y, cx, cy, r, rx, ry, width, height, points`), `transform`, `viewBox`, `fill`, `stroke`,
  `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `opacity`, `fill-opacity`,
  `stroke-opacity`, `fill-rule`, `clip-path`, `offset`, `stop-color`, `stop-opacity`, `id`.
  Everything else is dropped.
- **Explicitly reject:** `script`, `foreignObject`, `image`, `style`, `animate*`, `set`, `a`, any
  `on*` attribute, any `href`/`xlink:href` that is not a same-document `#fragment`, any `url()`
  that is not a same-document fragment, and processing instructions / DOCTYPE / entities.
- **Rewrite** all `id`s and internal `url(#…)` references with a per-node prefix (§5.1).
- **Constrain size** — reject markup over a modest byte ceiling and beyond a node-count limit;
  a pathological path can be a rendering DoS.
- **Parse, don't regex.** Use `DOMParser` with `image/svg+xml`, walk the tree, rebuild output from
  the allowlist. Never pattern-match on the raw string.
- **Sanitise on ingest *and* before render.** Assume the store can contain hostile data — it
  survives export/import round trips through files the user may have received from someone else.
- **Never** `innerHTML` raw library markup into the picker.

Workspace import is an existing trust boundary: a `.knogra` file from an untrusted source can carry
pictogram markup. Re-sanitise on import.

---

## 7. The library

### 7.1 Two tiers

- **Workspace-local:** pictograms stored in the user's workspace (§5.6), travelling inside
  `.knogra` exports. Sources: the shared catalogue, direct upload, AI generation.
- **Shared catalogue:** a curated set hosted as static assets, browsable and searchable in-app.

### 7.2 Shared catalogue architecture

Reuse the pattern already proven for the demo graph library: a static index plus asset files
fetched at runtime from a separate repository (`knogra-graphs` does exactly this for the landing
page catalogue). Concretely: an index JSON (`{ id, name, tags[], keywords[], file }`) plus one SVG
per pictogram, with client-side search over the index.

**Non-negotiable rule: cache into the workspace on use.** Once a node references a pictogram, its
markup lives in the user's IndexedDB and travels inside their export. A graph must **never** depend
on network availability to render — the offline-first, no-account guarantee in `README.md` is a
product commitment, not an implementation detail.

Curated catalogue content is *trusted* content — sanitise it at submission time, server-side or in
the publishing workflow, so the shipped assets are already clean. The client still sanitises (§6).

### 7.3 Search

Tag and keyword matching over a small client-side index is sufficient to start. Semantic search is
a later refinement and pairs naturally with §8.

---

## 8. AI integration

**Selection, not generation.** Language models produce poor free-form SVG — path data tends to come
out crude and mis-proportioned — and generation means feeding untrusted markup into the renderer on
every use.

The higher-value design: the assistant reads the node's title and scene context (machinery that
already exists for chat) and **picks from the curated catalogue**, offering two or three candidates.
Better artwork, no new trust boundary, and it reuses the existing suggestion flow.

If generation is pursued anyway, constrain it to **composing catalogue primitives** rather than
emitting arbitrary paths, and route output through the full sanitiser with no exceptions.

`docs/chat-image-retrieval.md` describes existing image-retrieval behaviour in chat and is the
natural place to look for an acquisition path.

---

## 9. Blast radius

**New files**

- `src/styles/designs/pictogram-node.ts` — the design
- `src/styles/designs/pictogram-sanitizer.ts` — security-critical, build first
- picker UI module under `src/ui/components/node-editor/`
- optional: catalogue client under `src/storage/` or a feature slice

**Modified**

- `src/styles/designs/design-registry.ts` — one union member, one case
- `src/config/design-manifest.ts` — one entry
- `src/core/design-types.ts` / `main-types.ts` — pictogram param and asset types
- `src/ui/components/node-editor/design-tab.ts` — mount the picker
- Option B only: `src/storage/graph-store.ts` (table + migration),
  `src/storage/workspace/transfer.ts` (export/import + format bump)

**Untouched** — verified, and the reason this is a contained feature:

- Layout and autolayout — read live `boundingBox()`, so any node size is handled
- Transitions — treat node style as opaque
- `scale` — multiplies width/height; works unchanged
- Fold/unfold, paths, Mermaid import/export, AI chat context — all design-agnostic

---

## 10. Suggested phasing

1. **Sanitiser + tests.** Standalone, no UI. The security foundation.
2. **Design file, hardcoded pictogram.** Prove splicing, ID namespacing, slot layout, theming and
   scale behaviour with one glyph inlined in code.
3. **Storage (Option B) + picker UI.** Upload, browse, choose, clear. Workspace-local only.
4. **Export/import round trip.** Format bump; verify a pictogram survives a `.knogra` cycle and is
   re-sanitised on import.
5. **Shared catalogue.** Static index + fetch + local cache.
6. **AI selection.** Suggest from catalogue using existing chat context.
7. **Extra slots** (`background`, `only`) and quiz-mode integration.

Steps 1–2 are independently valuable and answer most design questions before any storage commitment.

---

## 11. Open questions

1. **Option A or B** for storage (§5.6). Recommended B, but it front-loads a migration.
2. **Asset lifecycle** — reference counting, GC, or orphan tolerance? Check what `backgroundImages`
   does today.
3. **Quiz mode** — does hiding labels also hide pictograms? Probably a setting (§3.3).
4. **Filled paths vs. non-scaling strokes** (§5.5). Recommended filled.
5. **Does the pictogram participate in `colorOverrides`**, or get its own colour channel?
6. **Catalogue licensing** — a shared library needs an explicit licence for the artwork, and a
   contribution/review process if it accepts submissions.
7. **Does a pictogram belong to the node or to the scene?** Design params are scene-scoped today,
   so the same node could show different pictograms in different scenes. Consistent with the
   existing model, but arguably wrong for identity — a pictogram is arguably a property of the
   *concept*, not the view. This is the deepest modelling question here and deserves a decision
   before storage is fixed.

---

## 12. Code references

Current behaviour this document depends on (verified 2026-08-11):

| Concern | Location |
|---|---|
| Design → Cytoscape style contract | `src/styles/designs/default-node.ts`, `getDefaultNodeStyle` |
| SVG data URI encoding | `src/styles/designs/default-node.ts`, `renderSVG` return |
| Text layout / aspect targeting | `src/styles/designs/default-node.ts`, `computeTextLayout` |
| Design dispatch (exhaustive union) | `src/styles/designs/design-registry.ts`, `getNodeStyle` |
| Design list | `src/config/design-manifest.ts` |
| `scale` application (width/height only) | `src/styles/style-generator.ts`, three call sites |
| Cytoscape-level borders (do not scale) | `src/styles/style-generator.ts`, `buildCentralAndSelectedRules` |
| Scale bounds | `src/config/node-settings.ts`, `NODE_SCALE_MIN` / `NODE_SCALE_MAX` |
| Image-asset storage precedent | `src/storage/graph-store.ts`, `backgroundImages` table |
| Export/import precedent | `src/storage/workspace/transfer.ts`, `exportBackgroundImages` |
| Node editor design params UI | `src/ui/components/node-editor/design-tab.ts` |
