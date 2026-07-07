# Chat Image Retrieval & Node Learning Space

> **Status:** Draft — proposed design, not yet implemented. Under active discussion.
> **Last reviewed:** 2026-07-09
> **Authority:** Design intent and architectural direction for retrieving real (non-generated) images into the per-node chat. Supersedes the `todo.md` line "Image search by LLM." Specs below are proposals pending the open decisions in §12.
> **Related:** [Documentation map](README.md), [Chat panel architecture](chat-panel-architecture.md), [AI assistant vision](ai-assistant-vision.md), [Workspace architecture](workspace-architecture.md)

---

## 1. Vision context — the chat as a node's "learning space"

Knogra's canvas is the **map of connections between nodes**: scenes and edges show how concepts relate. Each node also has an *interior*: its own private, node-scoped chat (independent of every other node's chat). Today that interior already accumulates three material types on a single timeline — AI conversation, user notes, and tutorial content (see [chat panel architecture](chat-panel-architecture.md)).

This feature graduates the chat panel from a *conversation log* into a **materials workspace**: the place where everything a user gathers *about a single concept* lives together. Images are the first non-text material. Video is a plausible next step. The organising principle:

- **Canvas** = relationships *between* concepts.
- **Node chat** = everything *inside* one concept — dialogue, notes, and now retrieved visuals.

Images therefore live **in the chat**, not embedded in the Cytoscape-rendered node. There is no "node background image" work in this feature.

---

## 2. Problem statement

Much of what people learn is inherently visual — a portrait of a historical figure, a schematic of the Bohr model, a diagram of hydrogen orbitals. Today the AI assistant can only return text (with LaTeX). For a tool whose entire premise is *visual learning*, the inability to bring a correct image into a concept's space is a real gap.

The naïve approach — **AI image generation** — is rejected (see §5). Current image models produce inaccurate diagrams and hallucinated portraits; a confidently-wrong visual in a learning tool is worse than none. The problem is therefore **retrieval of real, existing, correct images**, not synthesis.

---

## 3. Goals

- Bring **real, existing** images into a node's chat, on request.
- Support both a **pre-configured request** (like existing quick actions) and **free-text** requests.
- Serve the two headline cases: **portraits/photos of real subjects** and **standard scientific/technical diagrams**.
- Keep the feature **accurate and license-clean** — curated, openly-licensed sources with attribution.
- Preserve Knogra's **local-first, offline-capable, no-mandatory-server** character.
- Provide **plumbing for multiple sources**, shipping Wikimedia first.

## 4. Non-goals

- **Image generation** (rejected, §5).
- **General/arbitrary web image search** (Google/Bing/SerpAPI) as the primary mechanism (§5).
- Embedding images inside Cytoscape node rendering (out of scope by design, §1).
- Understanding/analysing user-supplied images with a multimodal model (not this feature).
- Video (noted as a future material type, not built here).

---

## 5. Key decisions & rejected alternatives

| Option | Verdict | Reason |
|---|---|---|
| **AI image generation** | Rejected | Inaccurate diagrams, hallucinated portraits. Unacceptable for a learning tool. |
| **General web search (Google/Bing/SerpAPI)** | Rejected as primary | CORS-blocked → forces a proxy; key cost lands on Knogra (breaks free/BYOK model); arbitrary licensing + link rot. |
| **Curated open sources (Wikimedia et al.)** | **Chosen** | CORS-open, no key, open-licensed, human-curated (accurate), attribution built in. |
| **MCP server as the retrieval mechanism** | Deferred | Over-engineered for v1; a browser app is not an MCP host, and an HTTP MCP server reintroduces hosting + CORS. Legitimate *later* as a user-pluggable source ecosystem. |
| **LLM/provider as the image fetcher** | Rejected | Retrieval is deterministic. The LLM is demoted to an **optional query planner** (§8). Provider choice is irrelevant to retrieval; the feature works with **no API key** for the common case. |

---

## 6. Constraints

- **CORS.** Retrieval runs in the browser. Sources must serve anonymous cross-origin requests (API *and* image bytes), or the source is out unless a proxy is accepted.
- **No mandatory server.** Knogra deploys with only `api/ping.ts`. A proxy is *architecturally available* on Vercel but must not be required by the core path. Wikimedia needs none.
- **Local-first / offline.** Users expect their workspace to work offline. Storage strategy must account for this (§9).
- **BYOK / cost.** No new mandatory API key. No per-request cost borne by Knogra.
- **Licensing.** Only openly-licensed sources; store and display attribution.
- **Workspace weight.** Stored image bytes inflate IndexedDB and `.knogra` exports; this must be controllable (§9).

---

## 7. Sources

### 7.1 Primary — Wikimedia (Commons / Wikipedia)

Near purpose-built for this feature:

- **CORS-open, keyless.** MediaWiki/Commons API serves anonymous cross-origin requests (`origin=*`); image bytes on `upload.wikimedia.org` are CORS-permissive too. *Validated 2026-07-08.*
- **Open-licensed with attribution metadata** (public domain / CC; author + license + source returned by the API).
- **Human-curated = accurate.** Real portraits and thousands of vetted scientific diagrams (Bohr model, orbitals, etc.).
- **Maps to nodes.** `pageimages` returns an article's lead image in one call; full Commons search returns candidates.

#### Two retrieval strategies (validated)

Hand-testing (Napoleon / Bohr model / hydrogen orbitals) showed the source needs **two strategies chosen by intent**:

- **Entity / portrait** (e.g. "Napoleon") → **`pageimages`** on the Wikipedia article. Returns one canonical lead image; near-perfect. *Downside:* no license in this call — needs a follow-up **`imageinfo`** request for the credit line.
- **Concept / diagram** (e.g. "Bohr model") → **Commons File-namespace search** (`generator=search`, `gsrnamespace=6`). Returns multiple candidates with license + artist + description inline (`extmetadata`). *Downside:* relevance ranking is imperfect — a "featured/picture-of-the-day" image can wrongly take the #1 slot (an EM-spectrum diagram outranked the actual Bohr model). This is exactly why **top-N + user prune** (§10.4) is the right UX rather than auto-picking one.

The Wikimedia source picks a strategy per request (article-first for entity-like queries, else Commons search). The optional query planner (§8) can also decide/sharpen.

#### Implementation gotchas (from validation)

- Results are keyed by `pageid`; **sort by the `index` field** for true rank order — do not rely on object key order.
- Render/store the rasterized **`thumburl` (PNG)**, not the raw `.svg` `url` — consistent and already downscaled.
- `pageimages` license requires a **second `imageinfo`** call; Commons search returns it inline.
- `extmetadata` provides `Artist`, `LicenseShortName`, `LicenseUrl`, and an `AttributionRequired` flag to respect.

### 7.2 Future sources (pluggable, not day-one)

| Source | Best for | Key? |
|---|---|---|
| Openverse | broad CC image search (aggregates Flickr, museums) | optional |
| Met Museum Open Access | art, historical objects | none |
| NASA Image Library | astronomy / physics | none |
| Smithsonian / Europeana | cultural heritage | free key |

All added behind the same `ImageSource` interface (§10.2). "Limited, curated sources" is a **quality filter**, not a limitation.

---

## 8. The LLM's role — optional query planner

Retrieval is deterministic: `query → source API → candidates → bytes`. The LLM does **not** fetch images. Its only value is **query planning / disambiguation**:

- Map a free-text or node-context request ("electron orbits in hydrogen") to a good source query.
- Optionally rank/pick among returned candidates.

Consequences:

- The feature **works with no API key** in the common case (node title *is* the query).
- **Provider-agnostic** — any text model (Gemini, OpenRouter, …) can plan queries; no multimodal capability needed.
- BYOK becomes an *enhancement* (smarter queries), never a requirement.

---

## 9. Storage strategy

### 9.1 The storage setting

A single global setting — **"Store retrieved images for offline use"** (`ai.storeRetrievedImages`, default **on**) — governs how retrieved images persist. It:

- affects **only retrieved images** (`origin:'retrieved'`). Uploaded images (`origin:'note'`) have no link and are always stored as bytes.
- governs **future behaviour only**. Turning it **off** never purges bytes already stored; turning it **on** never mass-downloads existing link-only images — they localise lazily (§9.4).

This *replaces* the earlier separate "render preference" idea: if bytes are stored they are rendered, if absent the link is rendered. Storage policy and render behaviour are the same axis, so there is one control, not two.

### 9.2 Two categories, two states

- **Uploaded** (`origin:'note'`): bytes only, **no link**. All-or-nothing.
- **Retrieved** (`origin:'retrieved'`): **always carries `sourceUrl`**; may or may not hold `dataUrl`. Two states:
  - **Stored** = link + bytes.
  - **Linked** = link only.

Every storage control below moves retrieved images between **Stored** and **Linked**. Uploaded images never move.

### 9.3 Retrieval defers the download to the pick

The candidate strip renders from thumbnail links; **no bytes are fetched for unpicked candidates**. When the user picks one:

- setting **on** → download the picked image's bytes once → save **Stored**.
- setting **off** → save the link only → **Linked**.

### 9.4 Display — lazy localise

At render time, per retrieved image:

- **Stored** → render bytes, no network (always, regardless of setting).
- **Linked**, setting **on** → render the link now and, **once**, download + persist bytes in the background (becomes **Stored**; next open is offline).
- **Linked**, setting **off** → render the link on every open; never persisted.

Lazy localisation is the mechanism that heals a graph imported as links: only images on **visited** nodes download, not the whole graph.

### 9.5 Export — two size levers

Export shows a dialog (only when the workspace contains in-note images) with two independent checkboxes:

- **Include uploaded images** — default **on**. Off → uploaded images are omitted from the file (no link fallback; the exporter keeps their originals).
- **Include retrieved image files** — default **off**. Off → retrieved images export as **links only** (bytes stripped, `sourceUrl` kept). Retrieved images are always recoverable from their source, so light exports are the sensible default; the importing workspace decides whether to keep them as links or localise them (§9.4).

Stripping retrieved bytes is guarded by the presence of `sourceUrl`, so it can never orphan an image.

### 9.6 Import — two keep/strip levers

Import shows a symmetric dialog (only when the file contains in-note images). It decides **what to keep from the file**; it never downloads (downloading is §9.4's job, driven by the setting):

- **Import uploaded images** — default **on**. Off → drop them (gone; no link).
- **Import retrieved image files** — default **on**. Off → keep the links only (import as **Linked**, discard the file's bytes).

After import, retrieved images behave purely per the importing workspace's setting: **Linked** images heal lazily if the setting is on, or stay links if off. The dialog only sets the starting state; it triggers no fetches.

### 9.7 Byte format & size

- **Downscale on save** by requesting the source thumbnail (`iiurlwidth`), consistent with the existing image pipeline.
- **Format: base64 data URL** (decided, §12.2). Consistent with the existing note-attachment code and lifecycle-free (`img.src` and forget). Blob would save ~33% storage but adds `URL.createObjectURL`/`revokeObjectURL` lifecycle management; not worth it for already-downscaled images. Revisit only if graphs prove very image-heavy.

---

## 10. Architecture

### 10.1 Module placement

A dedicated retrieval module, **not** inside the provider adapters:

```
src/ai/image-search/
  image-source.ts      # ImageSource interface + registry
  wikimedia-source.ts  # first implementation (keyless, CORS-direct)
  image-search.ts      # orchestration: plan query → search → normalise candidates
  query-planner.ts     # optional LLM-assisted query resolution (degrades to node title)
```

Dependency direction: `image-search` depends on `core` types and (optionally) an `AIProvider` for planning. Provider adapters do **not** depend on `image-search`. Persistence extends `storage/chat-store`.

### 10.2 `ImageSource` interface (sketch)

```typescript
interface ImageCandidate {
  sourceUrl: string;          // always present
  thumbnailUrl?: string;      // for the candidate strip
  title: string;
  width?: number;
  height?: number;
  attribution: {
    author?: string;
    license?: string;         // e.g. "CC BY-SA 4.0", "Public domain"
    sourceName: string;       // e.g. "Wikimedia Commons"
    sourcePageUrl?: string;
  };
}

interface ImageSource {
  readonly id: string;        // "wikimedia"
  readonly name: string;
  search(query: string, opts?: { limit?: number }): Promise<ImageCandidate[]>;
}
```

A registry maps `id → ImageSource`; adding a source is registering one implementation.

### 10.3 Data model — generalised chat attachment

Today `NoteImageAttachment` (in `core/chat-types.ts`) is local-only, base64, "notes only," and explicitly stripped from AI requests. Generalise it into a chat image attachment carrying provenance and supporting link + stored bytes:

```typescript
type AttachmentOrigin = 'note' | 'retrieved';   // retrieved = from an ImageSource

interface ChatImageAttachment {
  id: string;
  type: 'image';
  origin: AttachmentOrigin;
  sourceUrl: string;                 // always present
  mimeType: string;
  name: string;
  width: number;
  height: number;
  dataUrl?: string;                  // downscaled bytes when stored (§9.4); absent in link-only
  attribution?: ImageCandidate['attribution'];  // retrieved images only
}
```

**No migration.** The image-in-notes feature is unreleased/experimental — there is no persisted user data to upgrade. Generalising `NoteImageAttachment` is a plain code refactor.

**Images are not sent to the LLM (v1).** Retrieved images are *materials in the learning space*, not request context — exactly like notes today (local-only, stripped from provider messages). Sending images *back* to the model would require multimodal (vision) request support in the adapters, a vision-capable model, and higher cost; that is a separate future feature, not part of this one.

### 10.4 Retrieval pipeline

Image search is an **image source for a note**, invoked from the note editor's attachment zone (alongside "Add image" from disk). There is no AI-command-bar button and no posting to the chat timeline.

```
note editor → "Find image"
  → query = editor text, else central node title
  → ImageSource.search(query, { exclude: already-shown }) → ImageCandidate[]
  → download bytes (server thumbnail) + keep sourceUrl/fullUrl
  → show top N as a pick-one thumbnail strip in the editor
  → user clicks one → it becomes the note's single image (origin 'retrieved')
  → "More" fetches the next N (exclude-shown); save flows through the normal note path
```

The strip is the browsing surface: the user sees N thumbnails, can hit **More** to reroll, and only commits on pick. Default ranking is the source's own relevance; a configured provider can sharpen the query later (P2).

### 10.5 UI / rendering

- **Entry point: the note editor.** "Find image" sits next to "Add image" in the attachment zone. Both produce the note's single image attachment; the only difference is the source (web vs disk). The AI-command bar stays purely AI commands.
- **Pick-one strip.** Results render as a thumbnail strip *inside* the editor (replacing the single-preview area until a pick is made). Clicking a thumbnail sets the note's image and collapses back to the normal preview; **More** replaces the strip with the next N (exclude-shown); **Cancel** dismisses it.
- **Single image per note** is preserved: a found image replaces any current attachment, exactly like "Add image".
- Once saved, a found image is an **ordinary image note** (`source: 'note'`, attachment `origin: 'retrieved'`) — same object as a manual image note, so delete / edit / context menu / clear-by-"Notes" / lightbox all apply uniformly. Provenance lives only on `origin`.
- **Attribution** shown as a small **caption line beneath the image** (author · license · source link) in display mode.
- States inside the strip: **searching**, **empty** ("No images found"), **error**.

---

## 11. Phasing

### P1 — Wikimedia retrieval into chat (four steps)

1. **Step 1 — Generalise the attachment model.** Pure refactor of `core/chat-types.ts` (`NoteImageAttachment → ChatImageAttachment` + `origin`/`sourceUrl`/`attribution`, `dataUrl` optional) and its callers. No new behaviour; existing note-images keep working. *Foundation for Steps 2–3.*
2. **Step 2 — Wikimedia retrieval.** `ai/image-search/` module (`ImageSource` registry + `wikimedia-source` + `retrieveImages`), `imageResultCount` setting. Images store bytes (offline works); export stays heavy for now. *Headline, fully demoable.*
   - *Follow-up (done):* consolidated the entry point into the **note editor** as "Find image" (pick-one strip; query = editor text or node title); removed the AI-bar button and the post-to-chat path; added a full-resolution **lightbox** (View image).
3. **Step 3 — Storage policy + export/import dialogs (separable feature).** Three parts: (3a) the `ai.storeRetrievedImages` setting, retrieval deferring the byte download to the pick, and lazy localise on display (§9.1–9.4); (3b) the export dialog with **Include uploaded images** (default on) / **Include retrieved image files** (default off) checkboxes, stripping guarded by `sourceUrl` (§9.5); (3c) the symmetric import dialog (§9.6). *Needs Step 1's `sourceUrl`/`origin`.*
4. **Step 4 — Polish.** An "Images" scope in the clear-chat dialog. (The old separate `imageRenderPreference` is subsumed by the Step 3 storage setting — §9.1.)

### Later

- **P2 — Query planner.** Optional LLM query resolution + candidate ranking; enables free-text image intent.
- **P3 — More sources.** Openverse / museums behind the same interface; import-side "download to localise".
- **Future.** Video as a material type; MCP-based user-pluggable sources.

---

## 12. Decisions (resolved 2026-07-08; storage model revised 2026-07-09)

1. **Storage** — *Decided (revised 2026-07-09).* One global setting `ai.storeRetrievedImages` (default **on**) is the single storage/render axis for retrieved images (retrieved-only, future-only, non-destructive). Retrieval defers the byte download to the pick; display heals **Linked→Stored** lazily when the setting is on. The export/import size levers are two keep/strip checkboxes each (uploaded / retrieved); retrieved defaults to **off on export**, **on on import** (§9).
2. **Byte format** — *Decided.* **base64 data URL** (lifecycle-free, matches existing note code). Blob deferred unless graphs prove very image-heavy (§9.7).
3. **Downscale** — *Decided.* Downscale on save via the existing image pipeline. Export inclusion handled by the uploaded / retrieved checkboxes, not a separate payload (§9.5–9.7).
4. **Candidate selection** — *Decided (revised).* In the note-editor context, results show as a **pick-one thumbnail strip**; the user clicks one to attach and **More** rerolls. (This reverses the earlier "no strip" call, which applied to the abandoned post-to-chat flow — a strip is the right UI when choosing one image for one note.) Default **N=3**, user-configurable (§7 setting).
5. **Host message** — *Decided (revised).* A found image is attached to a **single note** composed in the editor (`source: 'note'`, attachment `origin: 'retrieved'`) — the same object type as a manual image note. No multi-post to the chat. Retrieved images are **not** sent to the LLM in v1 (§10.3).
6. **Migration** — *Moot.* Image-in-notes is unreleased; no data migration, just a refactor (§10.3).
7. **N (results per request)** — *Decided.* Default **3**, user-configurable in the settings overlay (new `ai.*` setting).
8. **Rendering-preference setting** — *Superseded (2026-07-09).* Folded into the single global `ai.storeRetrievedImages` storage setting (§9.1): stored bytes are always rendered when present, otherwise the link — there is no separate render toggle.
9. **Attribution display** — *Decided.* Small **caption line beneath the image** (author · license · source link); image placement follows the existing note-attachment layout (§10.5).
10. **Entry point / routing** — *Decided (revised).* Image search is invoked from the **note editor** ("Find image" beside "Add image"), not the AI-command bar. The picked image is saved through the normal note path (`chatStore`), so there is no separate post-to-chat method. Query = editor text, else central node title.
11. **Debug tracing** — *Decided.* New `d_image` flag in `debug-flags.ts` for the retrieval module.
12. **Reroll / repeat search** — *Decided.* Within the strip, **More** returns the best results **not yet shown this session** (the editor tracks shown `sourceUrl`s and the source over-fetches, paginating Commons internally, capped, filtering them out). A saved retrieved image's context menu matches notes (Copy/Edit/Delete note), and **View image** opens a full-resolution lightbox (`fullUrl` when online, stored bytes offline).
