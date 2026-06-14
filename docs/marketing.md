# Knogra — Marketing Copy

> **Status:** Current  
> **Last reviewed:** 2026-06-14  
> **Authority:** Canonical source for approved marketing copy and directory listing notes.  
> **Related:** [Documentation map](README.md), [Marketing raw ideas](marketing-raw-ideas.md), [Product vision](knogra-vision.md)

**Canonical** copy for every place Knogra is described. Each slot has one purpose, one consumer, one approved version.

- Brainstorm and rejected drafts → `marketing-raw-ideas.md`
- Site body content (hero, features section, etc.) is **not** in this file — it lives in `index.html` directly.

---

## Canonical Names

| Field | Value |
|-------|-------|
| Product name | Knogra |
| Full title | Knogra — Knowledge Graph Explorer |
| Tagline | Think in graphs. Learn visually. |
| Key phrase | Beyond mind maps. |
| Domain | https://knogra.io |

---

# SECTION A — On-Site Metadata

Copy embedded in `index.html` and served on every page load. Each item is consumed by a different audience or system.

---

## A1. `<title>` — Browser Tab & Google Search Result Title

**Consumed by:** Browser tab label, bookmark managers, Google/Bing search result blue link
**Visibility limit:** ~60 chars
**Goal:** Identity + searchable category

> **Knogra — Knowledge Graph Explorer**

---

## A2. `<meta name="description">` — Google/Bing Search Snippet

**Consumed by:** Google and Bing search result cards (gray text under the title)
**Visibility limit:** ~155–160 chars before truncation
**Goal:** Click-through from search; balance keywords and intrigue

> Beyond mind maps. Knogra is a knowledge graph in motion — flowing scenes tame complexity, anchor ideas in spatial memory. As you learn, the map draws itself.

*Status: approved. Will be applied to `index.html` once Section A is fully reviewed.*

---

## A3. Open Graph — Social Link Previews

**Consumed by:** Facebook, LinkedIn, Slack, Discord, iMessage, Telegram, WhatsApp, Threads
**Displayed:** When someone pastes `knogra.io` into any of those platforms
**Goal:** Click-through from social context; can be more confident/intriguing than search snippet

| Field | Value |
|-------|-------|
| `og:type` | `website` |
| `og:url` | `https://knogra.io/` |
| `og:title` | Knogra — Knowledge Graph Explorer |
| `og:description` | Beyond mind maps. Knogra is a knowledge graph in motion — flowing scenes tame complexity, anchor ideas in spatial memory. As you learn, the map draws itself. |
| `og:image` | `https://knogra.io/og-image.jpg` (1200×630) |

*Status: approved — identical to A2.*

---

## A4. Twitter Card — Twitter/X Link Previews

**Consumed by:** Twitter/X (and Bluesky, which honors Twitter cards)
**Displayed:** Tweet previews when link is posted
**Goal:** Same as Open Graph — usually identical copy

| Field | Value |
|-------|-------|
| `twitter:card` | `summary_large_image` |
| `twitter:title` | Knogra — Knowledge Graph Explorer |
| `twitter:description` | *(same as `og:description`)* |
| `twitter:image` | `https://knogra.io/og-image.jpg` |

---

## A5. Schema.org JSON-LD — Machine-Readable Description

**Consumed by:** Google's structured-data parser, AI assistants (Google SGE, Bing Copilot, ChatGPT browsing) when summarizing the tool
**Displayed:** Indirectly — as category badges in search results and as quoted descriptions in AI answers
**Goal:** Help machines classify Knogra and quote it accurately

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Knogra",
  "url": "https://knogra.io",
  "applicationCategory": "ProductivityApplication",
  "operatingSystem": "Web",
  "description": "AI-assisted knowledge graph editor for visual learners, researchers, and the deeply curious. Build concept maps, explore ideas spatially, and navigate complex knowledge with AI assistance.",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "featureList": [
    "Map ideas visually as connected nodes",
    "Build a living atlas: the same graph explored through multiple focused perspectives",
    "Cinematic scenes and transitions: navigate between focused views with smooth, animated transitions that anchor ideas in spatial memory",
    "Scales with knowledge: a large graph decomposes into a network of focused scenes — each readable on its own, all connected, no hairball at any size",
    "Topology-aware AI: the assistant understands your graph's structure — which concepts are central, which are isolated, and where the missing links are",
    "Think beyond hierarchy — map relationships across any dimension, unconstrained by folders or categories",
    "Design that emerges as you think — node styles, themes, and spatial layout become part of the work, not a separate 'now make it pretty' step",
    "Your data lives in human-readable JSON — portable, scriptable, and compatible with any tool",
    "Runs in your browser, stores everything locally — no account, no cloud, no data leaving your device"
  ]
}
```

---

# SECTION B — Off-Site / Directory Listings

Each external directory has its own form fields and audience. Copy here is **per-directory** so we can tailor language and test what works.

---

## B1. There's An AI For That (TAAFT)

**URL:** https://theresanaiforthat.com/ai/knogra/
**Status:** Live, launch scheduled May 27 2026 9am London. Verification pending (manual request submitted).
**Paid:** $49 submission; $200 PPC credits pending verification
**Audience:** AI tool discovery; users filter by AI category

**Currently displayed (auto-generated by their ChatGPT integration):**
> Knogra is an AI-assisted Knowledge Graph Explorer designed to cater to visual learners, researchers and those who are deeply curious. […]

*Auto-generated and we can't edit it until verified.*

**Desired copy (paste once edit rights granted):**

- **Tagline:** *(TBD)*
- **Short description:** *(TBD)*
- **Long description:** *(TBD)*
- **Tags:** Knowledge Graph · Mind Maps · Concept Maps · AI Tools · PKM · Visual Learning · Memory Palaces · Semantic Networks

---

## B2. Futurepedia — *(not yet submitted)*

**URL:** https://www.futurepedia.io/submit-tool
**Audience:** General AI tool directory; non-technical users

- **Tagline:** *(TBD)*
- **Short description:** *(TBD)*
- **Long description:** *(TBD)*

---

## B3. Toolify.ai — *(not yet submitted)*

**URL:** https://www.toolify.ai/submit
**Audience:** AI tool aggregator; SEO-focused

- **Tagline:** *(TBD)*
- **Short description:** *(TBD)*
- **Long description:** *(TBD)*

---

## B4. AlternativeTo — *(working draft, not yet submitted)*

**URL:** https://alternativeto.net/software/add/
**Audience:** Users searching for alternatives to specific tools
**Approach:** Position as alternative to **Obsidian** (graph-minded PKM users frustrated that the graph view is decorative) and **XMind** (mind-mappers hitting the single-hierarchy ceiling). Secondary: Roam, Logseq, Miro, Coggle, MindMeister.

**Suggest Knogra as alternative to:** Obsidian, XMind (primary); add others post-approval.

**Submission fields:**

- **Name:** Knogra
- **Website:** https://knogra.io
- **Platform:** Web
- **License:** Free (Open Source) — MIT
- **Icon:** `public/knogra-icon.svg` (280×280, transparent, blue→purple gradient graph mark)

**Short description** (= A2, ~155 chars):

> Beyond mind maps. Knogra is a knowledge graph in motion — flowing scenes tame complexity, anchor ideas in spatial memory. As you learn, the map draws itself.

**Long description** *(working draft — pending review)*:

> Looking for something between a mind map and a graph view? Knogra is a knowledge graph editor that fixes the gaps in both.
>
> Mind mapping tools (XMind, Coggle, MindMeister) force every idea into a single hierarchy radiating from one root. PKM graph views (Obsidian, Logseq, Roam) show the whole network at once as a flat, unreadable hairball — useful to look at, not to work inside. Knogra takes a third path.
>
> **One graph, many scenes.** Knogra stores a single underlying graph, but the workspace is organized into Scenes — focused views around a chosen central node, each with its own visible subset, layout, and background. Scenes are created automatically as you work; their look and arrangement get refined as a byproduct of thinking, not as a separate "now make it pretty" step. The same node can appear in many scenes (sized large in one, peripheral in another), but the graph behind them is one. Large graphs decompose into a connected network of small, readable scenes. No hairball at any scale.
>
> **Animated transitions — ideas stick because you move through them.** Clicking a node morphs the scene: shared nodes glide to their new positions, irrelevant ones fade, new ones appear. The continuity of motion is what makes spatial memory work — you remember a concept by where you came from and where you went next, not by which folder it lives in.
>
> **An AI that reads structure, not just text.** Standard chatbots are blind to the spatial relationships in your work. Knogra's assistant reads the graph itself — which concepts are central, which are isolated, where the missing links are. It proposes nodes and edges that fit your structure; you accept them with a click from a shelf, accelerating graph construction without giving up control. Bring your own API key — Gemini direct, or OpenRouter for all other providers. Calls go straight from your browser to the provider.
>
> **Local, free, open source.** No account, no cloud, no telemetry. Everything lives in your browser. Graphs export and import as human-readable JSON — you can store them, share them, or publish them in the Knogra library. MIT licensed.

**Tags:**

`knowledge-graph` · `mind-map` · `concept-map` · `pkm` · `visual-thinking` · `ai-assistant` · `local-first` · `open-source` · `semantic-network` · `spatial-memory`

---

## B5. Bing Webmaster Tools — *(not yet submitted)*

**URL:** https://www.bing.com/webmasters/
**Audience:** N/A — this is search engine indexing, not a directory listing
**Action:** Add site, import sitemap from Google Search Console (10 min)

---

# SECTION C — Reference Material

Supporting material referenced across sections — keywords, app facts, friction points, pillars. Used as raw material when composing per-directory copy in Section B.

---

## App Facts

| Field | Value |
|-------|-------|
| URL | https://knogra.io |
| App URL | https://knogra.io/app/ |
| Pricing | Free |
| Account required | No |
| Platform | Web (any modern browser) |
| Data storage | Local (IndexedDB, no server) |
| AI | Bring your own API key (Google Gemini or OpenRouter) |
| License | MIT |
| GitHub | https://github.com/ebuyakin/knogra |

---

## Keyword Cluster

**Primary:** knowledge graph, knowledge graph editor, AI knowledge graph, visual knowledge base
**Comparison (mind mapping):** mind map, mind mapping tool, concept map, concept mapping, semantic map, semantic network
**PKM / second brain:** personal knowledge management, PKM, second brain, knowledge management
**Modifiers:** AI-powered, AI-assisted, visual thinking, spatial learning, browser-based, local-first

---

## Category Tags

Knowledge Graph · Visual Learning · Mind Maps · Concept Maps · Memory Palaces · Semantic Networks · Productivity · AI Tools · PKM

---

## Core Friction Points

Use these to lead with pain before pitching the solution.

1. **The Hierarchy Prison** — Folders and file trees force a top-down structure. But insights happen at the periphery — connecting a mathematical concept to a musical structure, or a chemical process to a cooking technique. Knogra allows long-distance associations without a rigid folder system.

2. **The Blind AI Problem** — Standard AI chat is linear and context-blind to visual structure. Knogra's AI is topology-aware — it reads the graph, not just your messages. It understands spatial relationships and structural distance between ideas.

3. **The Death-by-PowerPoint Gap** — When you've mapped out a complex system and want to explain it to someone, you currently have to screenshot it, chop it up, and paste it into linear slides. Knogra's Scenes and Paths bridge the gap between deep interconnected thinking and step-by-step explanation.

4. **The Design Tax** — Most tools make you choose: think fast and look plain, or design carefully and look good. High-effort tools (Miro, Figma diagrams) produce rich visuals but the diagram *is* the work, not the thinking. Low-effort tools (Obsidian, Roam) are fast but visually flat — auto-layout, no hierarchy of importance, everything looks the same. Knogra eliminates the tax: visual richness emerges as you think, not as a separate design step.

5. **The Hairball Problem** — Traditional graph tools work fine for small examples but collapse at scale. Past 30 or 40 nodes, the graph view becomes a tangled hairball — visually unreadable, navigationally hopeless. Knogra decomposes a large graph into a network of focused scenes: each scene is small and readable, scenes connect through animated transitions, and the whole structure stays navigable no matter how large the underlying graph grows.

---

## Positioning Pillars

### Pillar 1 — Presentation Layer for Complex Systems
*Stop flattening your thoughts into slides.*

> Knogra gives your knowledge graph a camera crew. Use Scenes and Paths to build guided tours through complex systems, mathematical proofs, or research topics. Navigate smoothly from node to node with spatial animations that preserve the wider network context. A knowledge graph you can actually present from.

### Pillar 2 — Sovereign by Design
*Your research. Your data. Your API key.*

> No accounts, no servers, no cloud leakage. Built on local browser storage — your notes don't train models and your thoughts don't live on a remote server. Bring your own AI API key — calls go straight from your browser to your provider.

### Pillar 3 — Topology-Aware AI
*An AI that understands structure, not just text.*

> Most AI tools treat text as supreme. Knogra's AI reads the topology of your graph — which concepts are central clusters, which are isolated nodes, where the missing links are. It doesn't just answer questions; it suggests structural connections and expands your canvas based on the surrounding map.

### Pillar 4 — No Design Tax
*Most tools make you choose: think fast and look plain, or design carefully and look good.*

> Knogra eliminates the tradeoff. The visual richness of your graph — node styles, themes, backgrounds, spatial layout — emerges naturally as you think. Choosing a node design is part of placing a concept, not a separate "now let me make it pretty" phase. The result is a diagram that's both visually expressive and a direct trace of your thinking, not a post-hoc illustration of it.

### Pillar 5 — Scales with Your Thinking
*Most graph tools collapse past 30 nodes. Knogra doesn't.*

> Traditional graph views work fine for examples and demos but become tangled hairballs when your knowledge actually grows. Knogra decomposes a large graph into a connected network of focused scenes — each scene small enough to read at a glance, but the whole structure remains one graph. Complexity stays manageable because you navigate it scene by scene, not all at once.

---

## Audience Angles

| Audience | Hook | Platform |
|----------|------|----------|
| Obsidian / Logseq users | "The tool you use when you need to *work inside* the graph view, not just look at it" | r/ObsidianMD, r/PKMS |
| Visual learners / students | "Think in graphs. Learn visually." | r/productivity, r/InternetIsBeautiful |
| Researchers | "Map complex topics as a living atlas — one graph, many focused perspectives" | HN, r/PKMS |
| Developers / privacy-conscious | "Local-first, open source, bring your own AI key" | HN Show HN, r/selfhosted |

---

## OG / Social Image

`/public/og-image.jpg` — used for Open Graph and Twitter Card previews. Size: 1200×630.
