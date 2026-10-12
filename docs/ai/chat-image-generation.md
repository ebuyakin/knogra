# Generated images in notes

> Status: Current. Built 2026-10-04; describes the code as it is.
> Authority: Canonical for the Generate image source in the note editor: the Run / Draft / Configure flow, the request to the image model, the provider layer beneath it, the attachment record, storage weight, and the transfer rules. Supersedes the rejection of image generation in chat-image-retrieval.md §5 for this one use; that document stays canonical for retrieval.
> Related: [chat-image-retrieval.md](../chat-image-retrieval.md) (the sibling source and the attachment model), [chat-panel-architecture.md](../chat-panel-architecture.md) (notes and attachments), [ai-provider-architecture.md](ai-provider-architecture.md) (registry, resolution, timeouts), [ai-chat-api-call-composition.md](ai-chat-api-call-composition.md) (the chat call Draft borrows), [vendor-capabilities.md](vendor-capabilities.md) (the vendor facts this relies on), [node-image-generation.md](../node-image-generation.md) (the other generator, for what is deliberately not shared)

## 1. What this is, and what it is not

A third image source for a note.
The note editor's Image group has Upload and Search online; this adds Generate.
The user writes what the picture should show, or has the chat model draft it, and an image model draws it.
The result is an ordinary note image: same attachment record, same timeline rendering, same viewer, same context menu, same export and import.

Why now, when chat-image-retrieval §5 rejected generation in July 2026: that rejection was about the models of the time producing confidently wrong diagrams.
The current generation (vendor-capabilities §2) renders text and composition well enough, and the use here is narrower than "an image for any node": a user who asked for a diagram, reading it, deciding whether to keep it.
What makes it work is the prompt, and that is why Draft (§3.3) is part of the feature rather than an extra: an image model given a node title draws a decoration; given a paragraph of concrete visual content drawn from the node's comment, equation and conversation, it draws the diagram.

What it is not:
- Not part of the chat. The picture request carries no system prompt, no history, no scene or graph context, no action block; the chat's send path is untouched. Same stance as the equation generator and the node SVG generator. Draft borrows the chat's context for one side call (§3.3) and stores nothing.
- Not a node image. Node images are SVG symbols rendered inside the node (nodes-svg-images.md); a content-rich raster diagram is material about the node and lives in its notes.
- Not an illustration pipeline for assistant replies. Considered and set aside (journal, 2026-10-03/04): every vendor does it differently, Anthropic cannot do it at all, and the image's position in prose and the history semantics would have touched the best-tested code in the app.
- Not a conversation with the image model. Editing is one call at a time with the current image as the starting point (§3.4); there is no transcript and no vendor-side state.

## 2. The user flow

The note editor's Image group has three buttons; the third is new.

    Image
    [ Upload ]  [ Search online ]  [ Generate ▾ ]

Generate opens a small menu on hover (as Suggest and Connect do) or at once on click, stacked upward so the most used row is nearest the button:

    Run          saves the note at once and generates for the saved note (§2.2)
    Draft        the chat model writes the picture description into the textarea (§3.3); the user edits, then runs
    Configure…   opens the image settings dialog (§2.1); its Save and Run button saves the settings and runs

The menu is its own small module, `chat-panel/generate-menu.ts`.
Not the Cytoscape context menu's renderer: quick-action-menu.ts records why (it belongs to the graph surface and positions inside the Cytoscape container).
Not a generalisation of quick-action-menu.ts either: that was done and reverted on 2026-10-04 under the rule that the feature touches no working component it does not need; the relationship picker stays as it is.

Two models, two calls: Draft is the chat provider; Run is the separately selected image provider and model.

### 2.1 The image settings dialog

Configure opens a compact dialog holding every generated-image setting (§4.4) in order of use: Shape, Detail, Background, Style, Clear prompt after generation, Image Model Provider, then each capable provider's Image Model.
They are ordinary settings, declared once in setting-definitions.ts (`GENERATED_IMAGE_SETTINGS`, under Notes → Generated Images) and stored in localStorage like every other setting, so the same values appear in the main Settings modal: one list, two views.
The dialog renders its rows itself, label beside input with the description as the tooltip, in the node editor's frame and colours (its CSS classes for inputs and buttons), centred on the Cytoscape area and draggable by its header like the other modals.
Edits are staged until Save; Cancel, Escape and a click outside discard them; Save and Run saves, closes, and runs.
An extraction of the Settings modal's row renderer into a shared module was done and reverted on 2026-10-04: the duplication of a few input rows is the smaller cost.

### 2.2 Run, and what the user sees

Run saves the note immediately with its current text (the node title when the textarea is empty) and closes the editor; the note renders as it is and a line "Generating image…" appears under it.
A long request must not leave the editor open looking unfinished, and after twenty seconds the textarea has usually lost focus, so there would be no Enter or blur left to save with.
When the picture arrives it is written onto the saved note (`chatStore.setMessageAttachments`), the note is re-rendered with the image and its caption, and the timeline scrolls so the note's bottom edge meets the panel's, once the image has decoded; not to the end, since the note may sit mid-conversation.
With Clear prompt on, the note's text is emptied at that moment.
A failure leaves a red line under the note, "Image generation failed: … (click to dismiss)", and the note untouched.

Gates, read when the menu opens: Run and Draft are enabled when an image provider is configured (§4.3) and greyed with a title saying what is missing otherwise; Draft additionally needs the chat provider's key, the same condition that enables the chat input.
One gate for both, deliberately: a drafted prompt with nothing to send it to is a dead end.
A user whose only key is Anthropic's cannot configure an image provider and sees both rows greyed, which is the honest state (vendor-capabilities §2.3); Configure is always enabled.

The note text is what Run sends as the picture description and is the caption under the image; the technical sentences of §3.2 are appended at the moment of the call and never written into the note.

### 2.3 Display

Images in notes are read in the panel first and in the viewer second.
`.note-image` is as wide as the panel, its height following the image's shape, shrunk only beyond 70vh (chat-panel.css; the fraction is repeated as `NOTE_IMAGE_MAX_HEIGHT_FRACTION` in note-image-generation.ts, and the two must agree); an image smaller than the panel keeps its own size, since `max-width: 100%` never enlarges.
Before 2026-10-04 the cap was 240 px, which would have shrunk a panel-shaped picture to a thumbnail.
The rule applies to every note image, uploaded, retrieved and generated alike: one record type, one rendering rule.

## 3. The request

### 3.1 Prompt

What is sent, in this order, blank lines between:

    <the note's text, or the node title>
    <ai.imageStyle>                         the user's style suffix; empty, or "No style instruction" on, sends nothing
    <background sentence>                   from ai.imageBackground (§3.2)
    <legibility sentence>                   from ai.imageDetail and the frame (§3.2), ending with the typeface sentence

The style suffix exists because the user should not retype how pictures should look on every note; what they show is the note's text.
Default: "Clear schematic diagram in textbook style. Flat colours, clean thin lines, no shading or gradients. Leave a generous empty margin around the drawing, at least one tenth of the image on every side, with nothing touching the edges. Label only the essential parts with short, correctly spelled words. No decorative elements, no people, no frame, no title, no caption."
The suffix says nothing about background, label size or typeface: those come from settings and the frame, so they are composed in code (`image-generation.ts`) and the suffix stays free of them.

The typeface sentence asks for a plain sans-serif like Helvetica or Arial, regular weight: the app's UI font is the system sans stack (global.css --font-sans), which image models know by those names, and labels in it read as part of the panel.

### 3.2 Shape, detail, background, size and format

The picture is read in the panel, so the panel's visible area, the viewer's box, is what it is composed for: roughly 480 by 600 CSS px on a laptop, taller than wide, beside 14 px text.
Three settings say how a request relates to that box; all are read by Run and told to Draft.

Shape (`ai.imageShape`), what the vendor's aspect is set to:

    panel        the frame: the note's width and 70vh, measured when Run or Draft is pressed; each adapter snaps it to what its vendor accepts (Gemini: the SDK's listed ratios, 3:4 for the box above; OpenAI: an exact size in multiples of 16, about 816x1024). Default.
    square       1:1
    portrait     3:4
    landscape    4:3
    wide         16:9

Detail (`ai.imageDetail`), how dense the picture may be, and therefore what it costs and weighs:

    panel        read in place. The legibility sentence names the frame's size beside 14 px text, few labelled parts, labels about one eightieth of the image height "like fine caption text", the drawing as the main thing, thick lines. 1K tier (OpenAI quality medium); stored at 1200 px long side. Default.
    fine         read in the viewer. The sentence allows density and says the picture will be viewed enlarged. 2K tier (OpenAI quality high); stored at about 2000 px long side; two to four times the cost and weight, which the setting's description says.

The fraction overshoots on purpose: models set labels large by default and read a floor as a target, so one fortieth, the arithmetic answer, came out at twice the chat's size. It is one constant to move again.

Background (`ai.imageBackground`):

    none          nothing is said about the background; the model decides (added 2026-10-05, with the "No style instruction" checkbox, so a request can go to the model with the description alone; sometimes that draws better).
    light         a plain uniform pale off-white; the textbook look, a bright card in the dark panel. Default.
    dark          very dark, close to the panel's #0d1117, with light lines and labels; blends with the panel at a faint seam, since a model matches a colour only roughly.
    transparent   nothing behind the subject, light strokes; OpenAI passes `background: 'transparent'`. Gemini has no such parameter and returns an opaque PNG, so with Gemini the request is sent as dark (the adapter's `supportsTransparency` decides, in image-generation.ts).

The chat panel is not themed (its colours are constants in chat-panel.css), so the panel's own dark is the only honest reference; scene themes do not enter.

No vendor takes an arbitrary small size (OpenAI's floor is 655,360 pixels; Gemini's tiers are 0.5K, 1K, 2K, 4K), and resolution plays no part in legibility, which is composition; the tier only has to carry 2x of the displayed size.

    OpenAI       POST /v1/images/generations: exact size from shape and detail, quality by detail, output_format webp, output_compression 80, background when transparent; reply data[0].b64_json
    Gemini       generateContent with responseModalities ['IMAGE'] and imageConfig { aspectRatio, imageSize '1K' | '2K' } (the field names of the installed @google/genai 1.48); reply inlineData, PNG

The bytes are then re-encoded in the browser (§6) so that what is stored is independent of what the vendor returned.

### 3.3 Draft: the chat model writes the description

The model that knows the node best is the chat model: it has the system prompt with the node's comment and equation, the scene, the graph and the conversation so far.
Draft asks it for the picture description as a side call, not a chat turn.

`ChatSession.draftAside(instruction)` builds the system prompt from the current scene context and the history exactly as `sendMessage` does, appends the instruction as the last user message, calls the provider and returns the prose.
Nothing is stored, no event fires, the session state is unchanged, and the next real turn's history does not contain the draft.
It is the one provider call through ChatSession that writes no turn; the method's comment says so.
The reply still passes the adapters' action parser; the instruction forbids a block, and one that comes anyway is discarded.

The instruction is `src/ai/prompts/image-prompt.md`, rendered by `prompts.ts` (`renderImagePrompt`, `ImagePromptData`) like the quick-action files, and filled by `image-generation/draft-instruction.ts` from the image settings and the measured frame: describe one picture that explains the concept, only what can be seen, where, how arranged, which parts carry labels and what they say; the user's text as the start when there is one; the shape, size and background it will get; one paragraph, plain English whatever the chat language; nothing about style, colours, typefaces or resolution, which the app adds; prose only.
The reply goes into the textarea, where the user edits before Run; "Drafting…" shows in the Image group meanwhile, the editor is held open, and afterwards the editor and its controls are scrolled to the bottom of the panel, as a generated image is.

What it costs: one text call at chat rates with the full system prompt, a few seconds.

### 3.4 Editing: Run on a note that has an image

When the note already has an image, of any origin, Run changes it instead of drawing afresh (added 2026-10-05).
The menu row reads "Run on this image" and nothing else in the interface changes: to draw a new picture, remove the image with × first or start a new note, exactly as with Search online.
The text is the instruction ("make the magnet gap visible"); the request carries the instruction and the image and nothing else: no style suffix, no background or legibility sentence, no shape.
The picture already has its look, and restating it invites the model to redraw rather than change; a stylistic change is the user's to ask for.
The result keeps the source's proportions (OpenAI: no size on the edits call; Gemini: no aspect in imageConfig) and takes the image's place in the note; Detail still decides the tier and the stored size.
A series of edits is the expected use: each Run starts from the current image, and the note's text is whatever the user left there, cleared or not by the Clear prompt setting, so the last instruction is the starting point for the next.

    OpenAI       POST /v1/images/edits, multipart: model, prompt, image as a file part, quality, output_format webp, output_compression
    Gemini       generateContent with the image as an inlineData part before the instruction

A retrieved image that is changed keeps its credit: the result is origin 'generated' with the model and the prompt, and carries the source's `attribution`, which the caption shows after the model ("Generated by X, from <credit>").
The bytes come from the stored `dataUrl`, or from the link for a retrieved image kept link-only.

This is the one place the app sends a stored image to a vendor; the node SVG generator has long sent an image back as markup, and the chat sends the graph's content on every turn, so it is the same arrangement in a new form: the user's own action, to the vendor they chose and keyed.

### 3.5 One call, no state

Every request is independent.
Nothing from a previous generation is sent except, for an edit, the image itself; no server-side state is used (`store`, `previous_response_id` and their equivalents are never set).

## 4. Architecture

### 4.1 Module

    src/ai/image-generation/
      image-provider.ts               ImageProvider (name, supportsTransparency, generateImage), ImageFrame, ImageRequest (with an optional SourceImage for an edit, §3.4), GeneratedImage, ImageProviderConfig; createImageProvider(config), the one switch
      image-provider-resolution.ts    resolveImageProviderConfig(), isImageGenerationConfigured(), imageGenerationGap() (the sentence a disabled row shows)
      image-generation.ts             generateNoteImage(text, frame): resolve, reconcile the background with the provider, compose the prompt (§3.1), call, re-encode (§6), build the ChatImageAttachment
      draft-instruction.ts            draftInstruction(userText, frame): fills image-prompt.md's record from the image settings (§3.3)
      gemini-image-adapter.ts         GeminiImageAdapter
      openai-image-adapter.ts         OpenAIImageAdapter
      adapter-helpers.ts              targetAspect, nearestAspectRatio, blobFromBase64: what every adapter needs, kept out of image-provider.ts so the factory's imports do not cycle
      raster-reencoder.ts             reencodeRasterImage(blob, options): the WebP re-encoder of §6; the slice owns its medium's processing as node-image owns svg-sanitizer.ts

    src/ai/prompts/image-prompt.md    the drafting instruction (§3.3)
    src/ai/prompts.ts                 ImagePromptData, renderImagePrompt()
    src/ai/chat-session.ts            draftAside(instruction) (§3.3)

    src/ui/panels/chat-panel/
      note-attachment-zone.ts         the Image group: Upload, Search online, Generate ▾ and the strip; hands Run's text to the editor, runs Draft, opens Configure
      generate-menu.ts                the Run / Draft / Configure menu above the button
      image-settings-dialog.ts        Configure (§2.1); panel-owned like image-lightbox.ts
      note-image-generation.ts        Run after the save: the status line under the note, the call, the write onto the saved note, the re-render, the scroll; measureFrame()
      chat-note-editor.ts             saves on Run and hands the saved note to note-image-generation
      chat-message-renderer.ts        the "Generated by <model>" caption rule

The slice is a sibling of `image-search/`, which it mirrors: a vendor-agnostic contract, implementations, one orchestration function the UI calls, returning a `ChatImageAttachment`.
Naming follows `providers/`: `*-adapter.ts` files, `<Vendor>ImageAdapter` classes implementing the interface, a `create…()` factory with the one `switch`, a `resolve…Config()` beside it.
It imports `core` types, `config`, `providers/request-timeout.ts` and, for Draft, `prompts.ts`; it imports nothing from `chat-session`, `context-builder`, `image-search`, `node-image` or `utils`.
`src/utils/` was considered for the re-encoder and rejected on 2026-10-04: that folder holds app infrastructure (tab guard, telemetry), diagnostics, external wrappers (MathJax) and one cross-layer geometry helper; processing specific to one medium lives in the slice that produces it.
`AIProvider` is not extended: `sendMessage(messages, systemPrompt)` is a text contract and an image call is a different one. Two narrow interfaces beat one wide one (ai-provider-architecture §2).

### 4.2 Registry

`ProviderDescriptor` in `config/ai-providers.ts` gains one optional object:

    imageGeneration?: { modelSettingKey: SettingKey; modelLabel: string; defaultModel: string }

Present for Gemini and OpenAI; absent for Anthropic, which is how "cannot generate images" is stated, in the one table that already knows what each provider is.
`imageCapableProviders()` filters on it; the Settings sections add an Image Model row to each capable provider as the model row is generated today; `createImageProvider()` is the one `switch`, beside `createProvider()`.
`defaultModel` references `AI_DEFAULTS`, so model names are still written once.
The export blocklist and factory-reset keep-list are unaffected: no new key settings.

### 4.3 Resolution

`resolveImageProviderConfig()` beside `resolveProviderConfig()`, and unlike it, with no fallback chain:

    1. ai.imageProvider is 'none' (the default)      → null: the feature is off, Run and Draft greyed
    2. the named provider cannot draw or has no key   → null: greyed, the title says what is missing
    3. otherwise { type, apiKey, model }, the model from that provider's image-model setting, blank falling back to its default

The image provider is chosen explicitly and independently of the chat provider; the two share API keys but nothing else.
No "auto" and no silent fallback to another vendor: an image costs real money per call, and the user should know which vendor is drawing.

### 4.4 Settings

    ai.imageShape          select panel | square | portrait | landscape | wide, default 'panel'
    ai.imageDetail         select panel | fine, default 'panel'
    ai.imageBackground     select light | dark | transparent | none, default 'light'
    ai.imageStyle          textarea, the suffix of §3.1
    ai.imageOmitStyle      boolean, default off: send the description without the suffix
    ai.imageClearPrompt    boolean, default off: empty the note's text once the picture is generated
    ai.imageProvider       select none | gemini | openai (options from the registry's capable providers), default 'none'
    ai.geminiImageModel, ai.openaiImageModel    string, defaults in AI_DEFAULTS

One list in setting-definitions.ts (`GENERATED_IMAGE_SETTINGS`) is the Notes → Generated Images category and, through `generatedImageSettings()` with the capable providers' model rows appended, what the Configure dialog renders.
OpenAI's quality is not a setting: detail decides it, and a second knob for the same question would fight it.
All keys are additive settings in `AISettings` with defaults in `AI_DEFAULTS`; none is sensitive.

## 5. The attachment record

`ChatImageAttachment` (core/chat-types.ts), additively:

    AttachmentOrigin = 'note' | 'retrieved' | 'generated'
    prompt?: string      the text sent, style and technical sentences included, for provenance
    model?: string       the image model id that drew it

`mimeType` stays within the existing union: the stored bytes are WebP (§6), PNG for a transparent picture in a browser that cannot encode WebP.
`name` is the description, cut at 80 characters; it is the image's alt text and the viewer's title.
`sourceUrl` and `fullUrl` are absent: a generated image has no origin to link to; `attribution` is present only when the image was changed from a retrieved one (§3.4).

The caption: `buildNoteAttachments` in chat-message-renderer.ts has one rule for origin 'generated' with a `model`, "Generated by <model>", in the same `note-image-credit` style as the attribution caption.
`attribution` is not reused for it: `ImageAttribution` is source and license credit for a retrieved image, and a model id in `sourceName` would make one field mean two things.
The caption doubles as the AI-generated disclosure.

Older app versions reading a record with origin 'generated': the renderer uses `dataUrl` and ignores origin, `stripConversationImages` passes unknown origins through untouched, lazy-localise filters on 'retrieved'. Nothing breaks, nothing is lost.

## 6. Weight

Vendors return a PNG of one to several megabytes, above the note editor's 1 MB cap.
On arrival the bytes are drawn to a canvas and re-encoded as WebP at quality 0.85, scaled down to a long side set by detail: 1200 px for panel, 2000 px for fine.
Expected result 100 to 250 KB for panel, 300 to 700 KB for fine; the full-size original is discarded.

Nothing else in the app re-encodes raster images (uploads are validated and stored as received; retrieval asks Wikimedia for a thumbnail), and the re-encoder applies to generated images only: user material is never altered, and a retrieved image's size is the source's decision.

The upload limits (1 MB, 4096 px, constants in the attachment zone) are met by construction rather than checked: both long sides are under the dimension cap, and a WebP at 0.85 at either size is under a megabyte.
A browser that cannot encode WebP hands back PNG, which at these sizes can approach a megabyte; `image-generation.ts` detects the substituted type and re-encodes as JPEG, which every browser produces, except for a transparent picture, whose alpha JPEG would flatten to black, so it keeps the PNG.
No limit constant is shared between the UI and the slice: the slice guarantees its output's envelope, the UI guards what the user hands it.

## 7. Transfer: export and import

`countInNoteImages` and `stripConversationImages` in `storage/workspace/transfer.ts` sort attachments by whether a link can stand in for the bytes.
A generated image has bytes and no link, so it belongs with uploaded, not retrieved: counted under `uploaded`, kept or dropped by "Images uploaded or generated".
No new checkbox: a third lever for a category that behaves identically to the first would be a distinction without a difference.
The Markdown export already omitted images without a `sourceUrl`; its sentence names generated images too.
Import is symmetric. `knogra.snapshot()` already redacts every `dataUrl`.

## 8. Failures, limits, and what the user is told

    not configured              Run and Draft greyed; the title names the provider select, or the missing key
    vendor error                the red line under the note, with the vendor's message where readable
    moderation block            "The image model declined this prompt." (OpenAI error.code moderation_blocked; Gemini promptFeedback.blockReason)
    no image in the reply       Gemini's finish reason, or its text, or "returned no image"
    timeout                     the shared 120 s budget from request-timeout.ts
    unreachable OpenAI          the same "check the key" sentence as the chat adapter, since the vendor's 401 carries no CORS headers

Cost: one image is on the order of 0.03 to 0.15 USD depending on vendor and detail (vendor-capabilities §2), ten to a hundred times a chat turn; the Generated Images category's description says so.

Debug: `DEBUG.d_image` traces the request (provider, model, shape, detail, background, frame, and the prompt as sent) and the reply (type and size before and after re-encoding). `DEBUG.d_chat` shows a Draft's request as the chat would send it.

## 9. Not in this round

- OpenRouter as an image provider. Its 30-plus model catalogue makes the model choice a design question of its own. The registry makes it one descriptor entry, one adapter and one case when it comes.
- Several candidates per request in a pick-one strip, as search has. Each candidate costs money; one at a time is the honest default.
- A label-size knob. The fraction in the legibility sentence is a constant; a setting is cheap to add if one default does not serve.
- Using a generated image as the node's image. Node images are SVG by design.
- Streaming partial previews.

## 10. What was built, in order

    [x] 0   The attachment zone extracted from chat-note-editor.ts into note-attachment-zone.ts, no behaviour change
    [x] 1   Types and transfer: origin 'generated', prompt and model; the export counter, stripper and dialog label; the Markdown export sentence
    [x] 2   raster-reencoder.ts
    [x] 2a  The .note-image display rule
    [x] 3   The slice with the Gemini adapter; the registry capability; the settings; resolution
    [-] 3a  Extractions from settings-modal.ts and quick-action-menu.ts: done and reverted. Rule: the feature touches nothing it does not need
    [x] 3b  image-settings-dialog.ts
    [x] 4   The Generate button, its menu, Run; later moved to save first and generate for the saved note (note-image-generation.ts)
    [x] 5   Draft: image-prompt.md, draft-instruction.ts, ChatSession.draftAside
    [x] 6   The OpenAI adapter; the Images endpoint answered a browser caller, so no fallback to the Responses tool was needed
    [ ] 7   npm run deps on src/ai: image-generation imports only what §4.1 allows, and nothing imports it but chat-panel
    [x] 8   Docs

Besides the plan: Background, Clear prompt after generation, the typeface and label-size sentences, Save and Run, the textarea sizing to its text in the note editor, the Image group's title in sentence case.

## 11. Known edges

- Output quality rides on the drafted prompt and on three texts, each in one place: the instruction in image-prompt.md, the style suffix in Configure, the background and legibility sentences in image-generation.ts.
- Model ids churn every few months; they live in AI_DEFAULTS and a stale default fails loudly as a vendor error. vendor-capabilities.md is where to look first.
- Gemini generateContent is labelled legacy; Google states it stays supported. Moving to the Interactions API is a change to the Gemini adapters on their own merits.
- A dark picture meets the panel at a faint seam; only a transparent one blends fully, and only OpenAI draws those.
- Legal pages name the vendors and that content goes to them; a note prompt going to the same vendors needs no change there.

## 12. Decisions

- 2026-10-04: a separate command on the note, not an illustration pipeline in the chat.
- One Generate button with a Run / Draft / Configure menu, hover-opened, stacked upward in order of use.
- Draft on the chat provider, Run on an explicitly selected image provider with its own model setting, no auto and no fallback; both gated on the image provider being configured.
- Run saves first and generates for the saved note, so the editor never waits.
- Shape, detail and background as settings, with a measured "panel" shape; the display rule widened for all note images; OpenAI quality folded into detail; the technical sentences composed in code and never written into the note.
- A dedicated settings dialog rendering its own rows; the Settings modal and the relationship picker untouched (extractions reverted).
- The caption a renderer rule, not attribution.
- Gemini and OpenAI in v1; OpenRouter deferred.
- The re-encoder inside the slice, not in src/utils/.
- 2026-10-05: Run on a note with an image edits it, with the text and the image alone; a retrieved image keeps its credit through the edit; "No instruction" background and "No style instruction" for pure requests.

## 13. Architecture conformance

Reviewed against architecture.md (Sections 1, 3.2, 3.7, 3.8, 3.9, 4, 7) and ai-provider-architecture.md on 2026-10-04; held to through the build.

### 13.1 Layers and dependency direction

    core/chat-types.ts          types only, no logic; the additions are optional fields and one union member
    config/                     settings metadata; ai-providers.ts stays the one list of providers, extended, not duplicated
    ai/image-generation/        a vertical slice like image-search/ and node-image/, its medium's processing included; imports config, core, providers/request-timeout, prompts; never styles/, features/, storage/, ui/, utils/
    ai/chat-session.ts          gains one method; no new imports
    ai/prompts.ts               gains one record type and one render function; the renderer untouched
    storage/workspace/transfer  the two existing functions learn the new origin; no new store, no new table, no Dexie version
    ui/panels/chat-panel/       calls ai/ directly, as it already does for image-search and chat-session; writes through chatStore, which is the named debt of architecture §3.8 and is neither widened nor fixed here; measures its own DOM for the frame, which §4.2 allows the UI (ephemeral interaction state)

No feature is touched: the note is not a Cytoscape-derived mutation, and chat notes are already a named explicit storage workflow (Section 1, §5.1b).
No EventBus event is added: nothing outside the panel needs to know an image was generated.
No regime (§3.10) is involved.
No existing component outside the chat panel was modified.

### 13.2 Patterns reused, by name

    provider contract + factory switch       providers/provider.ts        → image-provider.ts
    resolution with a named rule             provider-resolution.ts       → image-provider-resolution.ts (the rule here is "none", stated)
    vendor adapter owns the request shape    *-adapter.ts                 → *-image-adapter.ts
    bounded call                             request-timeout.ts           → reused as is; the 120 s budget stands
    user-facing errors as full sentences     openai-adapter.ts            → same wording; the CORS-on-401 translation copied where it applies
    settings generated from the registry     setting-definitions.ts       → image-model rows and the provider select derive from descriptors; no hand list
    model names written once                 AI_DEFAULTS                  → defaultModel references it
    prompt text in .md, rendered             prompts/*.md, prompts.ts     → image-prompt.md with its own data record
    source → attachment orchestration        image-search.ts              → image-generation.ts, same shape of function, same debug flag
    one-shot generator independent of chat   equation-generator.ts        → image-generation.ts
    attachments carry provenance             origin, attribution          → origin 'generated', prompt, model
    button-anchored menu in the panel        quick-action-menu.ts         → generate-menu.ts follows its shape without sharing code
    modal frame and colours                  node-editor.css              → the dialog uses its classes; the node editor's code is untouched
    panel-owned dialog                       chat-panel/image-lightbox.ts → image-settings-dialog.ts lives beside it

### 13.3 Coding standards (architecture §7)

- File size: chat-note-editor.ts was 489 lines against a 300 target; step 0 extracted the attachment zone before anything was added. The zone is about 330 lines after Generate; if it grows again, the sources split into their own modules.
- Nesting: two levels, early returns; the adapters follow openai-adapter.ts, with the reading of the vendor's reply in module-level functions below the class.
- Naming: shared lexicon. "Generate" is the user's verb, "Run" starts it; "adapter" is the vendor class; "attachment" is the record; "origin" is provenance.
- Types: explicit return types, no `any` (the new files are not on the eslint override list), `Record<string, unknown>` for request bodies as the adapters do, vendor reply shapes declared as small interfaces with optional fields and read defensively.
- Comments explain why, headers explain the file's job and its boundary in prose. A comment that justifies a value changes when the value does.
- Settings read through `getSetting()` only, in the module that needs them, never passed down as flags from the UI.

### 13.4 Persistence

Additive only.
`origin: 'generated'` and two optional strings on a record that is already optional on messages; readable by every earlier version (§5).
No migration, no version bump, no new key in localStorage beyond ordinary settings.
Export files written by this version open in earlier versions with the image intact.
