# Node Image Presets

> **Status:** Current, with planned extensions marked inline.
> **Last reviewed:** 2026-08-17
> **Owns:** the preset record — what the knobs are, what values they take, where they are stored, how
> they are edited. Says what a value **is**; [generation](node-image-generation.md) says what the
> model is **told** about it (D34). Subordinate to [Node SVG images](nodes-svg-images.md), which owns
> the image record, rendering, the trust boundary, interchange, the file map, and the decisions index
> (D1–D34).
> **Terminology:** the record is a **preset** — `NodeImagePreset`. Drafts before 2026-08-16 called it
> a template; nothing should still use that word.
> **Related:** [hub](nodes-svg-images.md), [generation](node-image-generation.md),
> [Architecture](architecture.md)

---

## 1. What a preset is

A **preset** is a named, editable bundle of drawing specifications, selected **per image** at
generation time, with one marked as the default (D11).

Cross-image coherence — the reason this feature generates rather than sources images — comes from
keeping a preset constant across a graph while the subject varies. `icon` and `plot` are legitimately
different kinds of drawing, which is why presets are a collection rather than one global setting.

A preset is **not a theme** (the palette resolves against the scene's theme, but a preset is not owned
by one), **not referenced by an image** (D14 — `colourMode` is copied onto the record, a value not a
reference), and **not a settings entry** (it behaves as one for storage and transfer, §4, but the
settings API is one typed value per key and has no shape for a collection of named records).

---

## 2. The record

```ts
// core/node-image-types.ts
export interface NodeImagePreset {
  id: NodeImagePresetId;
  name: string;

  /** What is drawn — the language of briefing an illustrator. */
  content: {
    imageType: NodeImageType;
    form: NodeImageForm;
    depth: NodeImageDepth;
    enclosure: NodeImageEnclosure;
    textAllowed: NodeImagePermission;
  };

  /** How it is drawn — the properties a vector editor exposes. */
  technical: {
    renderMode: NodeImageRenderMode;
    strokeWeight: NodeImageStrokeWeight;
    aspect: NodeImageAspect;               // §3.4
    detailLevel: NodeImageDetailLevel;     // an element budget — §3.2
    backdrop: NodeImageBackdrop;
    gradientsAllowed: NodeImagePermission;
    transparencyAllowed: NodeImagePermission;
  };

  /** How colour is chosen and whether it follows the theme. */
  colour: {
    colourMode: NodeImageColourMode;       // §3.3
    paletteSize: NodeImagePaletteSize;
  };

  extraInstructions: string;   // free prose, appended verbatim
  createdAt: Date;
  updatedAt: Date;
}
```

**The record's halves are shaped for editing; the prompt is shaped for a model.** They no longer line
up, and are not meant to. The record keeps `content` / `technical` / `colour` because that is how
values are stored and normalised; the prompt is composed by three builders grouped by the question a
knob answers, which cut across both halves — `depth` and `textAllowed` live in `content` and compose
with *technique*, `backdrop` lives in `technical` and composes with *colour*. Cases that seem to
straddle the line (*is "no text" content or technical?*) were evidence that forcing the two to match
was the mistake.

`colour` is its own group because `colourMode` decides how the image is treated at render time.

**Size is not a preset field.** It is a per-image decision made in the generation dialog: the same
drawing language covers a small glyph and a large plot.

---

## 3. Vocabulary

### 3.1 Drawing — what the picture is

| Descriptor | Values |
|---|---|
| Image type | icon · symbol · schematic · flow diagram · plot · map · figure · portrait |
| Form | geometric · mixed · organic |
| Detail | very simple · simple · moderate · detailed · very detailed · elaborate |

**`artisticStyle` was removed** (D49). Six idioms — flat vector, hand-drawn, engraved, woodcut,
painterly, blueprint — added one session and deleted the next, on the evidence of actual output: none
of them moved the result predictably. A knob whose values do not mean the same thing every time fails
D42's own test, and a specific style is better said in Extra instructions, which is more expressive
than a dropdown. Deleting it also removed the last vocabulary competing with `form` for the same job.

The wider lesson recorded with it: **the model is mediocre at drawing, and elaborate instructions do
not fix that.** Sophistication in the prompt was buying nothing.

**Form is the axis `geometric` used to smuggle in** (D47). Every style value was silent about what
shapes the drawing is made of, so the model always took the safe route — `<circle>` is easier to get
right than four Bézier control points that have to land well — and images came back made of
rectangles.

Its expansions name SVG elements rather than adjectives, because that is what a model can act on:
*"path elements using cubic Bézier segments (C and S commands)"* is a thing it either does or does
not do, where *"interesting curvature"* is not.

**`silhouette` is gone** (D47). It named a *rendering* — solid fill, no interior detail — which
`renderMode: filled` already says, and it contradicted `line-art` outright. **`figure` and `portrait`
are new**, and are admitted despite naming a subject because each carries a framing convention a
preset can usefully fix for a whole graph: a portrait is a head-and-shoulders crop, a figure is a
whole body.

**`schematic` and `flow-diagram` stay separate.** They were considered for merging into "box and arrow
diagram", which describes the second and misdescribes the first — a bicycle schematic has no boxes and
no arrows. A schematic shows one thing's parts; a flow diagram shows steps joined by arrows.

### 3.2 Technique — how it is drawn

| Spec | Values |
|---|---|
| Aspect | square · landscape 4:3 · portrait 3:4 · landscape 16:9 · portrait 9:16 · strip 3:1 · column 1:3 |
| Line weight | thin (1 unit) · medium (2) · heavy (3.5) |
| Depth | 2D · 3D |
| Text | permitted · not permitted (D16) |
| Line and fill | line art · filled · mixed |
| Enclosure | none · circle · rounded square |

**Depth replaced `viewpoint`**, which spent four of its five values on projections wanted once in a
blue moon — isometric, top-down, cross-section — while burying the distinction that changes every
image. Those four are better said in Extra instructions on the rare occasion they are wanted.

**Line weight is absolute, and its labels say so.** The viewBox is fixed at 100 units on its longest
side, so "2 units" is the same width in every image — which is what makes a set of pictograms read as
a set, and why the option labels carry the number. The margin rule that keeps strokes inside the
viewBox is computed from it, so dropping the knob would leave that rule guessing.

**Detail level is an element budget**, not an adjective, and it composes with *Drawing* rather than
here — it says how much picture there is, not how it is rendered. A path counts once per distinct
shape it draws, and curve complexity is free. It is the only remaining control on busy-ness now that
the byte cap has been raised to a bloat guard (D30), which is why it is stated as a number:

| Value | Elements |
|---|---|
| very simple | at most 8 |
| simple | at most 25 |
| moderate | at most 70 |
| detailed | at most 200 |
| very detailed | at most 500 |
| elaborate | at most 2000 |

**Ceilings, not ranges** (D47). A range reads as a target and was answered with decorative filler.
`elaborate` was *"more than 500"* until that made it the one tier with a floor instead of a ceiling in
a set reworded to ceilings.

Geometric, because the useful range spans two orders of magnitude. The labels describe **detail**, not
size: the generation dialog's own Small/Medium/Large control sits a few pixels away and means the
rendered width. The top tiers are bounded by the model's output length rather than by the byte cap —
see [generation](node-image-generation.md) §6.

**Sixteen controls became nine, then eight** (D42, D49). The test each survivor had to pass: its
values mean the same thing every time, *and* it is either needed for consistency across a whole graph
or high-leverage enough to set on most images. Abstraction, viewpoint, composition, motion cues,
corner treatment, dashed strokes and finally artistic style all failed one arm or the other.

**There is no file-size knob**, and this was considered and rejected. It would duplicate
`node.imageMaxKB`, which the sanitizer actually enforces, reopening the bug that moved the cap into
the brief; it is a poor complexity control (D30); and a model cannot predict the serialised byte
length of markup it is about to emit. The usable form of that idea is coordinate precision, which is
an invariant and lives in the contract.

### 3.3 Colour

| Spec | Values |
|---|---|
| Colour mode | thematic · fixed |
| Palette size | unspecified · 1 · 2 · 3 · 4 |

- **thematic** — the scene theme's four image colours are named in the brief, the result is tokenised,
  and the colours are substituted from whichever scene the node appears in, so one image reads
  correctly in every theme (D32).
- **fixed** — no colours are named, and whatever the model drew with is frozen into the image and
  never recoloured. They come from the subject (a UK flag is red, white and blue), from the model's
  own judgement, or from prose in the preset's Direction field — which is why this tab needs no
  colour-picker row.

Uploaded and pasted images are always `fixed`, and are never recoloured.

**Palette size applies in both modes** (D39), which reverses the earlier design where it was thematic
only. A knob dead in half its modes is the defect that killed the orientation split (D35) and the
per-descriptor capability record. In `thematic` it selects the first *n* of the theme's four colours.
In `fixed` it states a count and no colours: *use exactly three colours* is an instruction a model can
act on, unlike a byte budget (D36), and a graph drawn in three colours throughout reads as a set even
where the hues differ per subject.

*unspecified* behaves as it does everywhere else, with one asymmetry worth stating. In `fixed` mode it
emits nothing. In `thematic` mode the colour list is still sent — all four — with no instruction about
how many to use, because the palette is a constraint the tokeniser enforces regardless; only the count
is left open.

`colourMode` is the one preset value copied onto the image record, because render-time treatment
depends on it. It is also the one control on this tab with no *unspecified* value: the app has to
decide whether to substitute, so silence is not available to it. The mechanism is
[generation](node-image-generation.md) §7.

### 3.4 Aspect

Without it the model picks the short side of the viewBox freely, so nodes across a graph end up
different shapes — against the coherence goal that justifies presets at all. `aspect` fixes it in the
preset, and the chosen ratio is stated to the model as an exact viewBox rather than as an adjective.

**The one descriptor with neither *unspecified* nor *free*** (D46), against D31's rule that every
descriptor carries an open value. Both were removed together because both said the same thing to the
model — "choose the shape yourself" — and that is the behaviour the knob exists to prevent. Every
image needs a viewBox, so an open value does not withhold a decision, it delegates it. Seven concrete
ratios are freedom enough, and a preset built for a plot picks 16:9 rather than abstaining.

Two things fall out. `NODE_IMAGE_ASPECT_VIEWBOXES` becomes the single place the 100-unit grid is
written down, and the node's height is bounded: with the extremes at 3:1, a generated image can no
longer produce an arbitrarily tall node. (An *uploaded* one still can — the sanitizer takes any
viewBox, as it must.)

**Orientation is folded into the value rather than split into a second control.** A separate
portrait/landscape knob would be dead for `square`, and would admit *square portrait*,
which means nothing — a dependent field needing exactly the per-descriptor capability record rejected
in §6. Merged, the list is seven entries, which is not a wall.

**Ratios stop at 3:1.** Width feeds Cytoscape directly — it sets hit area, edge endpoints and arrange
spacing — so past about three to one a node stops behaving like a node in the layout.

### 3.5 Unspecified values

Every descriptor carries an **unspecified** value that emits **no line into the prompt** (D31), and it
is the default for every field. The single exception is `colourMode`, which must resolve to one of two
treatments before the image can be rendered at all (§3.3).

This is the only real lever on over-specification: relocating text between messages removes no
constraint, leaving a knob unset does. It is mechanical, because the value→prose maps are data — an
unspecified value is a filtered-out entry, never a branch. A section left with no lines emits no
heading either; with everything unspecified both rule sections vanish, which is the intended baseline
rather than a broken prompt.

The four permissions were `boolean` and could not express it: `false` says *forbidden*, which is an
instruction, not silence. They are now `NodeImagePermission` — unspecified · allowed · forbidden — and
the registry normalises a stored `false` to *unspecified* rather than to an instruction.

A fifth starter, **Open**, has everything unspecified and is the default selection. It is the baseline
to judge against: with no descriptor firing, a bad image is the request's fault or the contract's, and
every other starter is a departure from it that can be compared one field at a time.

The tension, stated so it is not rediscovered: **every unspecified descriptor is a degree of freedom
the model resolves differently on every image**, and coherence is the whole argument for generating
rather than sourcing. The escape hatch is for an author who has looked at real output and knows which
knob is hurting them.

---

## 4. Storage

**localStorage**, key `knogra.nodeImagePresets`, one record holding both the collection and the
default selection. `storage/node-image-presets.ts` owns it, synchronously. Not IndexedDB (D13); not a
merged manifest (D15).

- **Seed lazily when the key is absent.** One rule covers first run, `Ctrl+N` with *keep settings*
  unchecked, and workspace files predating the feature, and it distinguishes *absent* (seed) from
  *empty* (the user deleted them — respect it).
- **Normalise on read** — fill missing or unrecognised fields from `NODE_IMAGE_PRESET_DEFAULTS`.
  localStorage is untrusted input, and with no merge nothing else backfills a field added by a later
  build. This is also what makes changing a starter's values a one-line change with no migration.
- **Refuse to delete the last preset.** Generation needs one to exist. Enforced in the registry, not
  the UI ([architecture.md](architecture.md) §3.10), and reported to the caller as `'refused-last'`.

The vocabulary, the field defaults and the starters all live in
`config/node-image-preset-definitions.ts`, shaped after `edge-type-settings.ts`. Starters are **seeds,
not built-ins** — copied into the collection with fresh ids and indistinguishable from user records
afterwards. No `isBuiltIn` flag, no merge on read. Four ship: *Icon*, *Schematic*, *Plot*, *Emblem*.

**Transfer** follows the settings rules, not the graph's (D21): `nodeImagePresets` is its own
top-level envelope member, cleared by `clearAllData()` exactly when settings are, and owned end to end
by the same module that holds the key and the normaliser. It is the one envelope member deliberately
**not** normalised on parse, for the absent-versus-empty reason above. Details in
[nodes-svg-images.md](nodes-svg-images.md) §9.

Nothing in persisted graph data references a preset (D14), which is what keeps them out of the graph
database.

---

## 5. The editor

`ui/components/node-image-preset-editor.ts` with `styles/node-image-preset-editor.css` — create,
duplicate, rename, edit, delete, set default, and *restore starters* (additive, fresh copies, never
overwriting).

Shaped after `theme-picker.ts`: a draggable modal centred on the graph viewport, the preset list on
the left, tabs on the right. Save semantics follow `edge-type-manager.ts` — field edits are drafts
committed on Save, while add / duplicate / delete / restore / make-default take effect immediately,
because a half-committed collection is worse than an immediate one. Re-reading the registry after a
structural action preserves pending drafts.

**Tabs do not mirror the record's groups, and no longer try.** They are *Drawing*, *Technique*,
*Colour*, *Extra instructions*, grouped by the question a knob answers, while the record keeps
`content` and `technical` apart for storage. The content/technical boundary is one the docs themselves
admit users cannot place (§2), so the editor stops asking them to: `depth` and `textAllowed` sit on
*Technique* though they are stored under `content`, and `backdrop`, `gradientsAllowed` and
`transparencyAllowed` sit on *Colour* though they are stored under `technical` — all three are
decisions about how colour is applied.

The tabs and the prompt's three builders are now **one to one**, which is what the earlier *Size* tab
could not manage: it fed one section while *Drawing* fed two. Controls sit in two-column grids, with
Name in the first tab's first cell, and the grid reserves three rows on every tab so the preview below
it does not jump as you switch.

**Reached from the generation dialog** (D19), beside the preset selector — never from the Settings
modal. A wall of controls is unmanageable inside a scalar settings list, the settings system has no
shape for a collection of named records, and no launcher-button pattern exists there to follow. The
dialog rather than the node editor's Image tab, because presets are compared where they are used.

### 5.1 The rule preview

Each tab shows the **actual prompt lines** the current selections produce, refreshed in place as a
control changes.

It must never be a second set of sentences written for display. The entire value of predefining
descriptors is that one word expands into a specification
([generation](node-image-generation.md) §5.1); an editor that shows the word and hides the
specification gives an author nothing to choose between *stylised* and *abstract* with. So the
builders are exported from the composer and the editor renders their output — display strings written
in the UI would agree on the day they were written and drift the first time the prompt is tuned.

Refresh is **in place**: re-rendering the pane would rebuild every control and steal focus from the
one just changed.

The mapping is mechanical: **each tab renders exactly the builder it corresponds to**. Two exceptions
remain — the viewBox line is emitted at the tail of the brief rather than among the knob lines, so
*Technique* appends it to its own preview; and `extraInstructions` has no preview at all, because it
reaches the prompt unchanged and a preview would echo what was just typed. Any knob left unspecified
emits nothing, which is why the pane has an empty state rather than going blank.

---

## 6. Open questions

- **Contradictory combinations.** `filled` render mode with a stated line weight is expressible and
  self-contradicting, as is `line-art` with a filling backdrop. No guard; revisit if real output shows
  it matters. A per-descriptor capability record was considered and rejected as machinery out of
  proportion to the problem.
- **Starter values are shipping guesses**, revisable once there is judged output to argue from. The
  registry normalises on read, so changing one has no storage consequence.
- **Whether `plot` and `flow-diagram` earn their place** given that text is optional and often
  unreadable at icon size.
- **`form` and `depth` are unjudged**, and are the two knobs added on the same reasoning that
  `artisticStyle` was added and then removed (§3.1).
