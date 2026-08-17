# Node Image Generation

> **Status:** Current, with planned extensions marked inline.
> **Last reviewed:** 2026-08-17
> **Owns:** everything between *"the user wants a picture of X"* and *"a raw SVG exists"* — the
> dialog, the message structure, prompt composition, colour, the correction conversation, the
> provider call. Says what the model is **told** about a preset value;
> [presets](node-image-presets.md) says what the value **is** (D34).
> Subordinate to [Node SVG images](nodes-svg-images.md), which owns the record, rendering, the trust
> boundary, interchange, the file map, and the decisions index (D1–D34).
> **Related:** [presets](node-image-presets.md), [hub](nodes-svg-images.md),
> [Theme architecture](theme-architecture.md)

---

## 1. Shape of the path

One provider call per turn: a description plus a selected preset in, raw SVG out. No ideation stage —
deciding what a concept should *look* like belongs in the per-node chat, which knows the graph (D12).

The path lives under `src/ai/node-image/` and shares nothing with chat — its own contract, vocabulary,
composer and generator (D18). `ai/prompts.ts` is never touched.

Three boundaries hold throughout:

- **Output is untrusted**, no more so than a paste, and passes the same sanitizer before anything
  stores or renders it ([hub](nodes-svg-images.md) §7).
- **`ai/` imports nothing from `styles/`.** The palette is resolved by the caller and passed in (§7).
- **Nothing here reaches storage.** Accept sets the editor's draft; the editor's Save persists
  ([hub](nodes-svg-images.md) §8).

---

## 2. The generation dialog

`ui/components/node-editor/image-generation-dialog.ts`, following `equation-dialog.ts`: an overlay
inside the node editor modal, busy state, `Ctrl+Enter` submits, `Escape` closes.

It carries a scrolling **conversation** pane — the description box, then every correction (§8) — a
**preset** selector with *Manage presets* beside it (D19), and its **own size control** seeded from the
Image tab, since size is stated in the prompt and so must be chosen before generating; Accept writes
it back. Results preview with **Accept**; Generate becomes **Redraw** once a correction box is open. A
sanitizer rejection offers the raw source rather than swallowing it.

Four non-obvious details:

- **The overlay is measured onto the editor frame** through a `getEditorRect` dep. The editor is
  draggable, so an assumed centre showed three stacked frames.
- **The conversation pane is measured, then pinned.** A real correction field is appended, the pane's
  height read, and the probe removed — so the pane fits exactly two messages plus the rule between
  them, and the modal's geometry never moves as turns accumulate. Deriving it from row counts would be
  a second source of truth for what the browser actually renders.
- **A dev-only `Prompt` button** renders the composed transcript into the result pane, gated on
  `import.meta.env.DEV`. It shares one `buildRequest()` with Generate — a preview on a second code
  path would be worth nothing.
- **The result pane is never empty**; an empty bordered box reads as an input. A provider failure
  restores the last good image rather than clearing it, since that failure says nothing about the
  image on screen.

The description seeds **empty behind a placeholder**. An earlier seed restated the title the prompt
already carries, and invited Generate without editing.

**Changing the preset discards the conversation** (§8, D27), and the dialog says so first.

---

## 3. Message structure

Two messages:

| Message | Carries | Varies with |
|---|---|---|
| **System** | The invariant contract: role, how to read a request, revision semantics, output shape, SVG structure, restrictions | Nothing — it is a constant |
| **User** | The brief: subject, description, every preset-derived section, and every per-request number | Every request |

The line is **invariant contract versus per-request brief** (D26). The contract is what the app
*enforces* — the sanitizer rejects violations — and is true of every request Knogra will ever make.
The brief is user-authored and unenforced.

Since each generation is an independent call this is a filing convention, not a behavioural one: the
model gets both messages either way and the transcript is re-sent in full each turn, so there is no
token argument on either side. It is chosen for where the churn lands — the contract is stable and
lives as a constant, the brief is where all tuning happens and is composed in one place.

**Precedence: the system message wins outright.** Stated once, in the contract, as a single rule:
follow the user's message wherever it does not conflict with the system message. It replaced two
rules that could disagree — *"follow every instruction exactly"* in the contract and *"where a section
conflicts with the request, follow the request"* in the brief — which between them authorised the
model to override the one requirement the app actually enforces, the viewBox. Across turns, the newest
correction wins over everything before it.

**Nothing now breaks a tie between the description and a knob line.** The brief's precedence rule went
with its headings when the brief was flattened (§5). A description asking for something an
unspecified-elsewhere knob contradicts has no stated resolution. Accepted for now, to be revisited
against real output rather than in advance.

---

## 4. The system contract

`NODE_IMAGE_SYSTEM_CONTRACT` in `prompt/system-contract.ts`. Not user-facing: editing it breaks
ingestion, since the sanitizer and the designs depend on what it promises.

**It is a constant, and takes no parameters** — which is the test of whether something belongs in it.
The byte cap was interpolated in until a stored setting value silently overrode a raised default, so
the contract would have stated one limit while the sanitizer enforced another. A number that differs
between installs is not an invariant; it moved to the brief (§6).

**Flat numbered rules, no headings, no justifications.** Headings invited sentences that explained
rather than instructed, and every explanation was one more claim for the model to reconcile. Gone with
them: *"unescaped characters are the most common way these answers fail"*, *"SVG paints an unspecified
fill black"*, and the aside about what a node is. The rules they justified all remain.

Also removed, as saying nothing: *"express every coordinate and every stroke width in viewBox units"*
— with no `width` or `height` attribute there is no other unit available — and *"nothing in these
instructions describes the picture"*, which was false, since the fill and colour rules plainly
constrain how the picture looks.

The ten rules, in order:

| # | Rule |
|---|---|
| 1 | The system message has absolute priority; follow the user's message where it does not conflict |
| 2 | Conversation semantics, including that the first message may attach an image to modify or one to match in style |
| 3 | Return exactly one JSON object, `{"type":"svg","svg":"…"}`, nothing around it |
| 4 | Single-quoted XML attributes, and the SVG on one line |
| 5 | One root `<svg>` with `xmlns` and `viewBox`, no `width`/`height`; coordinates to one decimal place |
| 6 | An explicit `fill` on every shape, `fill='none'` where stroked but not filled |
| 7 | Six-digit hex only — no colour names, no `rgb()`, no shorthand |
| 8 | No `<title>`, no `<desc>` |
| 9 | No network, no scripting; the permitted `href` value is a same-document `#fragment` |

**Rule 1 names no exceptions**, deliberately. An earlier draft said *"rules 3 to 11 are the exception"*;
naming the covered rules only invited the reader to look for ones that were not covered. All system
rules are absolute, so saying so once is enough.

**Rule 2 names the attachments** because the brief introduces each with a sentence rather than a
heading (§5.5), and the contract is where the shape of a conversation is described.

**Rule 4 removes the failure mode rather than warning about it.** XML permits single-quoted attribute
values, so the markup carries no `"` to escape inside a JSON string; one line removes literal
newlines. JSON escaping is the most fragile step in the path.

**Rule 6 exists because omission is not a colour choice.** `line-art` claims "fills are none", but a
path with no `fill` attribute renders black. No rule about colour *choice* catches an absent
attribute, and it must fire even when every descriptor is unspecified.

**Rule 5's rounding** is the real driver of file size for a given drawing — `M 47.3821904 12.9930012`
against `M 47.4 13` — invisible at the size these are drawn, and unlike a byte target it is something
a model can comply with. There is no preset for which seven decimal places is right, which is the test
for contract membership.

**The viewBox is not stated here.** Origin and grid are said once, in the brief, in every case (§6).

**Opacity left the contract entirely.** It was rule 8 for part of a session — *"draw at full opacity,
never set opacity, fill-opacity or stroke-opacity"* — and became the `transparencyAllowed` knob
instead (D50). The reason for the rule is real: the node surface beneath the image is translucent, so
a partly transparent mark composites onto an unpredictable colour. That is why the forbidden arm is
worth having, not why it should be compulsory.

**There is no clarification arm.** Every request returns a drawing. A vague description earns a vague
image and the user fixes it with a revision turn, which is a better tool than a question that throws
the attempt away. `NodeImageClarificationResult` survives in the result union for the dialog's own
empty-description guard, and as defensive parsing — not as an instruction.

**Size cap** from `node.imageMaxKB`, default **1024 KB** (D30) — stated in the brief (§6), not the
contract, because it is a setting. A guard against workspace bloat, not a busy-ness control.

---

## 5. The brief

Composed per request into the user message. Sections are grouped by the **question they answer**, not
by which half of the preset record they came from — the record is shaped for editing, the prompt for a
model, and there is no rule that they match (D25).

```
Draw the SVG image as described here: <description>

<starting point sentence, then its SVG>

<knob line>

<knob line>
…

## Extra instructions

<style reference sentence, then its SVG>

Use exactly the viewBox as follows: "0 0 100 75". Keep the entire SVG text under 1024 KB.

<closing discipline line>
```

**The knob lines carry no headings and no lead-ins** (D51). Each expansion is already a complete
instruction, and a heading above a group of them only invited a second sentence explaining what the
group was for — *"Draw a picture that meets every one of these requirements:"* and its siblings.
The three groups still exist as *builders*, one per editor tab, but the model sees one flat list.

With every knob unspecified the brief collapses to four lines: the request, the viewBox and cap, and
the closing rule. That is the intended baseline, not a broken prompt.

**The viewBox and the byte cap sit at the tail**, together, away from the drawing language. Both are
numbers the app enforces rather than things to draw, and the tail is the most recent thing read.

The request is **one sentence, verb and description joined by a colon**, not a `## The request`
heading with prose beneath it: the verb governs the description, so the two are one sentence.
Labelled `Subject:` / `Draw:` fields meant nothing to a model with no idea what a node title is.

The closing line is the one thing deliberately restated across messages — *"Return the JSON object
described in the system message, and nothing else."* Recency is worth one sentence; restating the
whole contract is not.

### 5.1 Expansions, not names

Every descriptor value expands to a **written paragraph**, never to its own name: `icon` becomes *"a
bold pictogram: a single subject reduced to its most recognisable outline, with no incidental
detail."* The user picks a word; the model receives a specification. That is the entire value of
predefining descriptors, why they cannot live in the free-prose field, and why the preset editor
renders these same strings ([presets](node-image-presets.md) §5.1).

The map is **data, not branches**: adding a value is one entry plus one control, never a change to
composition. An unspecified value is a filtered-out entry, on the same principle.

**No `Type:` / `Form:` labels, and no section lead-ins.** Each expansion is a complete sentence, so
nothing is needed to make it parse as one.

### 5.2 The three builders

Grouped by the question the knob answers, one group per editor tab, so a control and the sentence it
emits never sit on different tabs:

| Builder | Knobs |
|---|---|
| `drawing-rules.ts` | image type, form, detail |
| `technique-rules.ts` | aspect, line weight, depth, text, line and fill, enclosure |
| `colour-rules.ts` | colours, palette size, backdrop, gradients, transparency |

**`artisticStyle` was removed entirely** (D49). Six idioms — flat vector, hand-drawn, engraved,
woodcut, painterly, blueprint — and none of them moved the output predictably. A knob whose values do
not mean the same thing every time fails D42's test, and a specific style is better said in Extra
instructions, which is more expressive than a dropdown. It also removed the last thing competing with
`form` for the same job.

**`transparencyAllowed` was added** (D50), as a direction rather than a permission for the same reason
gradients are one: "transparency is allowed" and silence say the same thing to a model, so the stated
arm asks for it. Default *unspecified*, which is a live risk — nothing now stops a model emitting
semi-transparent marks by default onto a translucent surface.

**Backdrop composes with colour, not with technique.** All three of its values are colour decisions:
no colour behind, the surface colour, or the surface and drawing colours swapped.

Two rules easy to get wrong:

- **Where text is permitted, only `sans-serif` / `serif` / `monospace` may be named** (D16). The SVG is
  nested inside the node's own SVG, where no specific font is guaranteed.
- **Backdrop, enclosure and the no-frame rule describe one region.** Backdrop paints it, enclosure
  draws its boundary, and *"no frame, border, or padding"* applies **only** when backdrop is
  `transparent` and enclosure is `none` — the one conditional line, because stating it
  unconditionally contradicts the other two.

### 5.3 Measurements

- **Stroke weight is a number** — thin / medium / heavy → 1 / 2 / 3.5 units, held in
  `NODE_IMAGE_STROKE_WIDTHS` as data because the margin rule needs the width, not the sentence.
  Fixing the viewBox scale buys this; absolute numbers are followed and adjectives are not.
- **Marks stay inside the viewBox, strokes included.** "Fills the frame" plus round caps puts half a
  stroke outside. The brief states a margin — half the stroke width plus one unit. It used to redefine
  the phrase *"filling the frame"*, which appeared nowhere else in the prompt while *"meets the edges
  of the viewBox"* and *"extends to the edges"* went unpatched; the margin and no-frame rules now
  agree on the word **margin**. **It obeys `strokeWeight` like any other descriptor**: with no weight
  set there is no width to compute a margin from, and emitting it anyway made it the one rule an
  author could not switch off, which is what D31 exists to prevent.
- **The model is no longer told the viewBox is enforced.** *"An image with any other viewBox is
  discarded"* went with the other justifications. The rejection still happens in `viewbox-check.ts`.

### 5.4 Extra instructions

`extraInstructions` verbatim, only when non-empty. Its own heading because it is neither content nor
rendering, and it is the one place a user can say what the vocabulary cannot. Named for what it does
rather than for style alone — *"always include a scale bar"* is not a style note.

### 5.5 Attached images: starting point and style reference

Two optional sections carry an SVG rather than a sentence. Both are **source text, not pictures**
(D43): our images are already SVG, every provider takes text, and the correction conversation already
proves a model can read markup — where a vision channel would mean rasterising, provider-specific
multimodal message parts, capability detection and a fallback for models without it.

| Block | Source | Says |
|---|---|---|
| Starting point | The image already on this node | *"Here is the image you need to modify and improve according to the description above…"* |
| Style reference | Another node's image, picked in the dialog | *"Here is the image you should use as a style reference…"* |

**Neither carries a heading.** Each opens with a sentence saying what to do with the SVG that follows,
which is a job a heading cannot do — and the contract's rule 2 says an attachment will be introduced
that way. `## Extra instructions` keeps its heading, being free prose with no such sentence.

**The starting point is offered honestly, not as a fabricated prior turn.** Seeding it as an assistant
message would have put the model straight into the revision mode the contract already describes, but
an uploaded image may break every rule the contract sets — multi-line, double quotes, colour names —
and presenting that as the model's own output reads as licence to break them again. So it is a
labelled block that says where the image came from and what to do with it.

**A style reference disowns its subject explicitly**, because handed a picture a model's first
instinct is to draw that picture.

Three rules both obey:

- **Colour tokens are resolved to hex first.** A thematic image is stored as `var(--knogra-image-ink-1,
  …)`, and sending that would teach the model to answer in tokens.
- **First turn only.** The brief is recomposed on every request, so leaving them in would re-send whole
  images beside a correction history that has already superseded them; once the model has produced
  something, its own output is what corrections work against.
- **The style reference comes after every knob line**, so the specification is stated first and the
  example arrives as something to match within it rather than as a competing instruction. It also
  keeps a large attachment from separating the request from the rules that qualify it.

**Neither is capped.** A 1 MB attachment is a few hundred thousand tokens and will simply fail against
a model with a smaller context window, and both can be present at once. Accepted deliberately rather
than overlooked; the guard is one line if it turns out to matter.

The style reference list is *nodes in the current scene that carry an image*, which is the coherence
unit that justifies the feature. It is composed in the UI from two feature queries — scene answers
which nodes are present, node answers which of those have images — because features may not import
each other.

---

## 6. Shape, complexity, and the element budget

**The prompt states no rendered size.** An SVG has none — it carries a coordinate grid and a shape,
and how wide it is drawn is a scene-level decision taken long after generation, by the size class, the
node's `scale` and the design holding it. The same image can appear in several scenes at different
sizes, so a stated pixel width was one answer out of several. `sizeClass` therefore has **no influence
on generation at all**: it is a display setting, like padding, and the selector in the dialog is there
only because that is where the user happens to be.

The brief once quoted a width and derived a feature floor from it — *"one unit is about 1.3 px, do not
draw a feature under 3 units"* — with a second arm that switched the floor off at the top two detail
tiers, because at 500 elements every shape is already at it. That special case was the tell: the floor
and the element budget were two levers answering the same question and contradicting each other three
lines apart. How fine to draw is the job of the image type and the budget, and it is now said once.

**Aspect** is stated as an exact viewBox rather than as an adjective — `"0 0 100 75"`, not *"a bit
wider than tall"*. It is the one descriptor with **no unspecified and no free** (D46): every image
needs a viewBox, so leaving it open only moved the choice to the model, and the two open values
emitted the same sentence. `NODE_IMAGE_ASPECT_VIEWBOXES` is therefore the single place the 100-unit
grid is written down. See [presets](node-image-presets.md) §3.4 for the values.

**A returned image whose viewBox is not the requested one is discarded**, by
`ai/node-image/viewbox-check.ts`. Not a warning: the aspect is what the node's shape comes from, and
the grid is what makes stroke weights consistent across a scene, so an image that ignores either is
not the image that was asked for. The check is **not** in the sanitizer — upload and paste share that
path, and an SVG from anywhere else has every right to a 512-unit grid. **The prompt no longer says
that the check exists**, the sentence having gone with the other justifications (§4).

**The element budget** is `detailLevel` as a **ceiling**, not a range. It said *"draw roughly 26 to 70
elements"* until that turned out to read as a target and to be answered with decorative filler —
dozens of small circles added to reach the number. A count still beats bytes as a busy-ness control —
one `path` can be 4 KB — and with the cap raised to a bloat guard (D30) it is the only thing policing
complexity.

The definition riding with it does two jobs. A path counts **per shape**, so the count is not gameable
by one monstrous path; and **curve complexity is free**, so a richly curved path is one element. The
second was added with `form` (D47): a count taken literally scores forty circles above twelve
elaborately curved paths, which is exactly backwards. The definition also no longer enumerates the
primitives, having read as a menu with `path` buried in it.

It lives with the budget rather than in the contract because it is meaningless without a number to
qualify, and disappears with it.

The tiers are geometric because the useful range spans two orders of magnitude, and the ceiling is not
the byte cap: **1 MB is four to seven thousand elements**, while eight thousand output tokens is
nearer two hundred. The top tiers are limited by what the selected model will emit, and exceeding that
fails as a truncated response rather than as a simpler drawing.

Nothing validates the result against the budget, and nothing should — models count badly, and
rejecting a good image for carrying twenty-seven shapes instead of twenty-five would be absurd.

**The byte cap is stated here**, from `node.imageMaxKB`. It sits with size rather than in the
contract because it comes from a setting, and a stored value overrides a raised default. It is **not**
a preset knob: a second source for the same number reopens exactly the bug that moved it out of the
contract, it is a poor complexity control (D30), and a model cannot predict the serialised byte length
of markup it is about to emit. Coordinate precision (§4) is the version of that idea a model can obey.

---

## 7. Colour

### 7.1 The palette

Each theme carries an **image palette**: four drawing colours plus the surfaces behind them. The four
are hand-picked per theme for how they look together and hardcoded alongside the theme's other
colours — no editor UI, the themes are not user-authored. They are not derived from `node.text` /
`accent` / `textSecondary`, which exist for text legibility and are too few and too similar to draw
with.

| Role | Source |
|---|---|
| `surface` | `node.background` **composited over** `canvas.background` |
| `surfaceAlt` | `node.backgroundAlt` |
| `ink[0..3]` | The theme's four image colours, ordered by intended dominance |

**The four are handed over untagged** (D40). No fill-versus-line split, no per-colour job: the set is
stated and the model decides how to use it. Tagging them would freeze a usage decision into the theme
record, where it collides with `renderMode` — `filled` draws no outlines, so line colours would be
dead, and `line-art` fills nothing, so fill colours would be. Revisit only if real output shows the
model using the palette badly.

**Order is dominance, not contrast rank.** It decides which colours survive truncation when
`paletteSize` is 1–3, so position means importance to the theme's look. This is a change from the
earlier "most legible first" wording, which fought the truncation rule.

Three further rules:

- **The surface is composited, not read raw.** `DEFAULT_THEME.node.background` is `#000000` at opacity
  `0.5` over a canvas of `#0d1117`; the colour the image actually sits on is neither. A raw hex
  misinforms the model about contrast.
- **Every ink must be legible against that theme's surface.** Retinting promises legibility in themes
  the image was never generated for, and only a guarantee on the palette makes that promise good.
  Enforced two ways rather than left to a doc rule: `imagePalette` is **required** on `BuiltInTheme`,
  so the compiler demands one from all sixteen themes and a forgotten palette cannot silently inherit
  the default's; and a dev-only startup check logs any ink whose contrast against `surface` or
  `surfaceAlt` is too low.
- **`resolveNodeImagePalette(themeId, paletteSize)` lives in `styles/`**, and the **caller** resolves
  and passes it — never `ai/`.

### 7.2 Two modes

| Mode | Behaviour |
|---|---|
| `thematic` | The theme's colours are named, the result is tokenised, and colours are substituted per scene at render |
| `fixed` | No colours are named; whatever the model drew with is frozen into the image and never recoloured |

**`paletteSize` applies in both** (D39) — naming the colours in `thematic`, stating only a count in
`fixed`. Left *unspecified* it emits nothing in `fixed` mode, and in `thematic` mode sends all four
with no count. See [presets](node-image-presets.md) §3.3 for why the knob is not thematic-only.

Uploads and pastes are always `fixed`. `colourMode` is copied onto the image record, so the record is
self-describing at render time, and an older record without one reads as `fixed` — which is correct,
since it carries literal hex and no tokens.

There is no third "theme colours, frozen" mode. It would be `thematic` with substitution disabled, and
nothing wants that.

### 7.3 Tokenising a thematic result

The model always returns literal hex — asked for a placeholder it emits `#fff` about half the time, so
the token pass runs *after* generation and is deterministic.

**Every colour in the output is snapped to the nearest palette entry** and rewritten as a token. Not
conditionally: a half-retinted image is worse than a slightly altered one, and we told the model which
colours to use. A large snap distance logs a dev-only warning, so a model ignoring the palette is
visible rather than silent.

**Nearest is measured in OKLab** (D41), not in RGB. Euclidean distance over raw RGB channels separates
colours that look alike and merges ones that do not, and because the snap is unconditional every
misjudgement is visible in the result.

The token is a valid colour value carrying the original hex as its fallback:

```
fill='var(--knogra-image-ink-1, #58a6ff)'
```

It is syntactically valid wherever an SVG paint is expected, so an unsubstituted image renders in its
generation-time colours rather than black. **We never rely on the browser resolving `var()`** —
substitution is our own string pass, and the syntax is chosen for its fallback. A data-URI SVG is an
isolated document and would not inherit a custom property anyway.

`surface` is a token too, or `backdrop: theme-surface` and `contrast-fill` would not retint. It is a
snap target alongside the inks, so a mark drawn close to the surface stays close to it under every
theme rather than surfacing in one and vanishing in another.

**It is a text pass, not an SVG pass.** The contract requires six-digit hex (§4), which makes
`#rrggbb` unambiguous in the document text — so a colour is found wherever it sits, including inside
an inline `style` attribute or a `<style>` block, and neither direction has to parse SVG. The only
thing excluded is a same-document reference such as `url(#abcdef)`.

**Tokenising runs when the user accepts an image, not when the generator returns one.** The correction
conversation replays the previous SVG back to the model (§8), and a transcript full of `var(...)`
would teach it to answer in tokens. At generation time the palette is the current theme's anyway, so
the dialog's preview needs no substitution — the hex on screen is what the tokens will resolve to.

### 7.4 Substituting at render

`styles/node-image-tokens.ts` owns both directions, and both are called from `styles/`: the writer
from the generation dialog on Accept, the reader from `styles/designs/image-node.ts`, which already
knows the scene and already regenerates per scene. The cache stores the token form and the design
substitutes on use; the image tab's preview goes through the same function.

*(An earlier plan put the writer in `ai/node-image/colour-tokens.ts`. That followed from tokenising
inside the generator; once it moved to Accept, `ai/` had no part in it, and both directions share a
token format that is better kept in one file than split across a layer boundary.)*

**Palette size plays no part at render.** An image carries tokens only for the colours it used, and
nothing at render time knows which preset produced it (D14), so the theme's full four are always the
substitution source.

**Save SVG to file resolves to plain hex**, using the theme of the scene the export was invoked from.
Tokens are lossless but meaningless to every other tool.

### 7.5 What the brief says

What differs by mode is the colours themselves. In `thematic` the permitted list is named and nothing
outside it may be used, including black and white. In `fixed` no colours are named at all and the
section says only how many to use — or, with `paletteSize` unspecified, nothing about colour choice
whatsoever, leaving it to the subject, the model, and whatever the author wrote in Extra instructions.

**The listed colours carry no per-colour jobs** (§7.1). An earlier draft assigned them — primary for
the subject, accent for the single most important thing, the rest receding — which is a taxonomy the
palette does not actually have and which fights `renderMode`.

**Two rules that used to hold in both modes are gone.**

The **surfaces line** — *"the image sits on #X and #Y; never draw in either"* — was removed (D52).
It made sense for a thematic image and was wrong for a fixed one: a fixed-colour image is fixed
precisely because its colours belong to the subject, and *"draw the UK flag"* should produce the
flag's colours whatever is behind it. Contrast in fixed mode is what the knobs are for. In thematic
mode the palette still protects legibility, because the four inks are picked to hold against both
surfaces (§7.1).

The **opacity ban** left for the brief's other end: it became the `transparencyAllowed` knob rather
than an unconditional rule (§4, D50).

### 7.6 Relation to D4

D4 refuses auto-*regeneration* on theme change and still holds. Substitution is not regeneration: the
drawing is unchanged and only its paint resolves later (D32).

### 7.7 Recolouring an existing image

Tokenising by proximity (§7.3) answers one question: *this drawing was asked to use the palette and
drifted, put it back*. It is exactly wrong for an image brought in from elsewhere. A black glyph
uploaded into a dark theme snaps to the darkest palette entry and disappears — the author wants the
**opposite** of the nearest colour, and only the author knows which colour is ink and which is ground.

So recolouring is **manual assignment**, in its own dialog (D53):

1. `listImageColours(svg)` scans for hex, skips `url(#…)` references, and **clusters visually
   identical values** — OKLab distance under 0.05. Export tools emit `#000000`, `#010101` and
   `#0a0a0a` for one black, and every gradient stop is another literal, so an image an author calls
   two-colour routinely carries nine. Listing literals would have rejected images that plainly
   qualify.
2. Each group gets a dropdown: **Ink 1–4 · Surface · Black · White · Red · Green · Blue · Yellow ·
   Leave unchanged**. Palette slots become tokens; the six named colours become literal hex; unchanged
   keeps what was there.
3. `applyColourMapping` rewrites every member of each group, and the result is previewed live.

**One dialog serves both fixed and thematic images**, because it resolves tokens to hex before
listing. A thematic image then presents as the palette colours it currently uses, and re-assigning
those *is* a slot swap — no second code path, and no separate mode.

**Mixed images are the point, not an edge case.** Tokens and literals coexist in one document with no
special handling, so an image can follow the theme in part and ignore it in part — a glyph that
retints beside a brand colour that never moves. `colourMode` on the record is read back from the
result with `hasColourTokens()` rather than assumed, so an image mapped entirely to fixed colours is
recorded as `fixed`.

**The clustering is bounded.** `listImageColours` compares each colour against every group found so
far, which is quadratic in distinct colours; a traced SVG carries thousands. Callers that only need to
know *whether there are too many* pass `maxGroups`, and the scan stops one past it. The Image tab does
this on every render, memoised against the SVG it counted — without the bound it froze the tab.

**Above five colours the button is disabled.** Four inks plus a surface is what the palette can
express, and there is no path to reduce a busier image first.

**It is not reversible after saving.** The token's fallback is the palette colour the slot resolves to
now, not the colour that was replaced, so nothing in the file remembers the original. Inside the
editor it is free to undo — the dialog writes to the tab's draft, and cancelling the editor discards
it — and "Save as .svg" before recolouring is the way to keep a copy. Storing the original alongside
was rejected: `nodeImages` exists as a separate table *because* SVG payloads are large, and a second
copy per recoloured image fights that directly.

---

## 8. The correction conversation

Generate, look, say what is wrong, get a revision. Redraw was an independent second call with no
memory of the first; it is now the correction box.

**The preset is fixed for the conversation** (D27) and correction turns carry prose only. Wanting a
different preset means starting over — which keeps the transcript honest and avoids a brief that
half-applies. Changing the preset selector discards the conversation and says so.

The rule is stated in the type: a correction is `{ svg, text }` and **cannot reach a preset**, so it
cannot restate the drawing language.

```ts
export interface NodeImageCorrection {
  /** The sanitized SVG this correction is about. */
  svg: string;
  /** What the user asked to change. */
  text: string;
}
```

The request carries `corrections: NodeImageCorrection[]` rather than the union originally drafted here
(`{ kind: 'brief' } | { kind: 'correction' }`). The union held the same invariant with one more type
and a branch in the generator; a list of prose-only turns holds it structurally.
`composeNodeImagePrompt` returns `{ system, messages }`, the brief followed by one assistant/user pair
per correction.

- **History is transient.** Held in the dialog, discarded on Accept, on close, and on a preset change.
  Nothing is persisted (D3), and `NodeImage.prompt` still records only the description that produced
  it — the corrections that shaped an image are not recoverable from the record.
- **Each result is sanitized**, exactly as a first result is.
- **A turn is committed only once it produced a usable image.** A sanitizer rejection or a provider
  failure leaves the correction where the user typed it, editable and unsent, so the transcript can
  never contain a turn the model did not answer.
- **Transcript growth is bounded.** The whole transcript is re-sent every turn, and an SVG is the
  largest thing in it. Only the **most recent** assistant SVG is kept in full; earlier ones are
  replaced with a short placeholder. Assistant turns are rebuilt as the JSON object the contract asks
  for rather than replayed verbatim, so the model sees its own output in the shape it was told to
  produce — including when the real reply arrived unwrapped and the generator recovered it.

**In the dialog**, the description box and every correction sit in one scrolling pane sized to hold
two messages and the rule between them. The description goes read-only once the first image arrives:
editing the original request midway is neither a correction nor a fresh start, and there is no reading
of it the contract can honour. Every message box is the same fixed height, because the pane is
measured to fit two of them and a box that changed size would make what fitted before a turn settled
overflow after it.

---

## 9. The generator

`ai/node-image/svg-generator.ts`, on the same provider plumbing as `ai/equation-generator.ts`:
independent of chat sessions and chat persistence, JSON-only.

```ts
export type NodeImageGenerationResult =
  | { type: 'svg'; svg: string }        // raw model output; NOT sanitized
  | { type: 'clarification'; message: string };
```

It **receives a resolved preset and palette as parameters** — never reads the preset registry, never
resolves a theme, exactly as `equation-generator` takes plain strings rather than reaching for graph
state. That is what keeps `ai/` free of any import from `styles/`.

Provider resolution is a private copy of the one in `equation-generator.ts` and `chat-session.ts`.
Deduplicating the three is a change to the provider module on its own merits, not part of this feature.

**Backdrop strip.** Models emit full-bleed background rectangles regardless of instruction, so with a
transparent backdrop a leading `<rect>` covering the viewBox is removed. In the generator, **not** the
sanitizer, which stays a pure security boundary — and only for generated images, never uploads or
pastes, mirroring the rule that user material is never altered. **String-based, never DOM-based**:
`DOMParser` expands entity declarations during the parse, so parsing here would run ahead of the
sanitizer's billion-laughs check, which works on raw text. The match is confined to the only position
a background rect can occupy — first element in the document.

**Model routing.** Same provider and model as chat; no separate setting. When a failure indicates
capability rather than accident — unparseable output, no SVG element, prose instead of markup — the
message names the model and suggests switching.

---

## 10. Open

- **No output has been judged against the descriptor vocabulary.** The structural work — the message
  split, unspecified values, aspect, the element budget, corrections, and now the flattened brief — is
  reasoning about the prompt, not evidence from images. Judging the descriptors one at a time is the
  next phase, and may reverse some of them. `artisticStyle` was removed on exactly that kind of
  evidence (D49); `form` and `depth` are the remaining unjudged additions.
- **Nothing breaks a tie between the description and a knob line** (§3). The brief's precedence rule
  went with its headings. To be revisited against real output.
- **`transparencyAllowed` defaults to unspecified**, so a model may emit semi-transparent marks onto a
  translucent surface with nothing said either way. If it shows up, the fix is `forbidden` on the
  starter presets, not a rule back in the contract.
- **Three sentences still say "the edges of the viewBox"** — the no-frame rule and both enclosure
  values — while the margin rule says to stay a computed distance inside them. The first was
  reconciled onto the word *margin*; the enclosure values were not. Latent: none fires unless the
  corresponding descriptor is set.
- **Whether the closing discipline line earns its breach** of the no-duplication rule, or whether the
  contract alone suffices.
- **The recolour clustering threshold (0.05) is a guess**, untested against real exports.
- **An image with five or more colours cannot be recoloured at all**, and there is no path to reduce
  it first.
- **Whether `fixed` colour mode should gain author-chosen hexes** on the preset's Colour tab. The
  recolour dialog now offers six named fixed colours per image, which may make this unnecessary.
