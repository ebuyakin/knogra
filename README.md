# Knogra

**Think in graphs. Learn visually.**

Knogra is a browser-based knowledge graph editor where every concept gets its own focused view. Navigate between nodes with smooth spatial transitions, annotate with an AI assistant that understands your graph, and arrange layouts that reflect how you think — not just how the algorithm thinks.

<img width="800" height="450" alt="knogra-demo" src="https://github.com/user-attachments/assets/0ce38a19-63a9-4b12-b405-8ed209199da3" />

**[knogra.io](https://knogra.io)** — runs entirely in the browser, no account required.

---

## Getting started

**Option A — start fresh:** Go to [app.knogra.io](https://app.knogra.io) and start building. Double-click the canvas to create a node, drag between nodes to connect them, click a connected node to transition into its scene.

**Option B — start with the tutorial:** On [knogra.io](https://knogra.io), click the **Tutorial** button. It opens the tutorial graph directly in the app — a pre-built interactive graph that walks you through the core concepts.

**Option C — explore example graphs:** The **Library** section on the landing page lists available graphs. Click **Open** to load one into the app, or **Download** to save the `.knogra` file and import it later with `Ctrl+O`.

**Keyboard shortcuts:** `Ctrl+S` export workspace · `Ctrl+O` import workspace · `Ctrl+N` new workspace · `F1` show all shortcuts

**Your work is auto-saved** to the browser's IndexedDB. Use `Ctrl+S` to download a `.knogra` backup file anytime.

---

## What you can build

- **Mind maps** — free-form thinking with structure when you need it
- **Concept maps** — labeled relationships, not just hierarchies
- **Memory palaces** — spatial navigation that builds associations that stick
- **Equation collections** — LaTeX math rendering inside nodes
- **Semantic networks** — classic knowledge representation, modern interface

## Features

- **Scenes & transitions** — each node gets a focused view; navigate between them with fluid animations
- **Layout tools** — radial auto-layout for a whole scene, plus align, distribute, circle, grid, and spacing tools for any selection
- **AI assistant** — context-aware chat per node; suggests new concepts and connections (BYOK — Gemini, OpenRouter)
- **Quiz mode** — hide node labels in the graph and self-grade recall while navigating scenes
- **Design system** — 20+ node designs, multiple themes, background images with color grading
- **Paths** — guided tours through your graph for revision, presentation, or storytelling
- **Fold & unfold** — collapse branches to focus, expand to explore
- **Mermaid import / export** — turn Mermaid diagrams into navigable drill-down scenes, or export any graph back to Mermaid
- **Export / import** — full workspace snapshots as `.knogra` files

## Privacy

Your work stays in your browser — IndexedDB storage, works offline, no account required. AI calls go directly from your browser to your chosen provider — no proxy, no logging. No personal data, no third-party trackers, no cookies. The only data Knogra receives is anonymous, aggregate usage counts (app opens, workspace import/export) — simple tallies with no per-user identity. Full details in the [Privacy Policy](https://knogra.io/privacy).

---

## Tech stack

| Layer | Library |
|---|---|
| Graph rendering | [Cytoscape.js](https://js.cytoscape.org/) |
| Storage | [Dexie](https://dexie.org/) (IndexedDB wrapper) |
| Build | [Vite](https://vitejs.dev/) + TypeScript |
| Math rendering | MathJax (LaTeX in nodes) |
| Layout | Custom — radial auto-layout, geometric arrange tools, Mermaid fan layout |
| Workspace files | JSZip |
| Telemetry | Upstash Redis via Vercel (anonymous counters only) |

No frontend framework — vanilla TypeScript throughout.

---

## Local development

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build → dist/
npm run type-check # TypeScript check without building
```

The app is served at the domain root and deploys to `app.knogra.io`. The marketing site (`knogra.io`) is a separate repo — `knogra-site`.

## Self-hosting

Deploy to Vercel by connecting this repo in the Vercel dashboard. Vercel auto-detects Vite, builds to `dist/`, and serves `api/ping.ts` as a serverless function.

For telemetry (optional): add an [Upstash Redis](https://vercel.com/marketplace?category=storage&search=redis) integration in Vercel. It injects the required env vars automatically:

```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Without these, the app works fully — pings silently fail.

---

## License

MIT © 2026 Knogra

