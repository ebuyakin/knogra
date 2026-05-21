# Scripts

Dev and build scripts for Knogra. Not part of the app bundle.

## Tutorial Pipeline (`tutorial/`)

Generates `tutorial.knogra` — the introductory graph served from the `knogra-graphs` repository and linked from the landing page catalog.

### Files

| File | Purpose |
|------|---------|
| `tutorial-content.md` | All tutorial text. Each `<!-- node: Title -->` section becomes a conversation on that node. Messages within a section are separated by `---`. Markdown headings can be used freely inside content. |
| `generate-tutorial.mjs` | Takes a `graph-*.knogra` file + `tutorial-content.md` → outputs `scripts/tutorial/tutorial.knogra` with conversations injected. Preserves graph structure, scenes, layouts, themes, settings. Auto-detects the latest `graph-*.knogra` file in the directory. |
| `tutorial.knogra` | Generated output (git-ignored). Import into the browser to review, then publish to `knogra-graphs`. |
| `tutorial-report.md` | Reconciliation report from the last run (git-ignored). Lists matched/unmatched nodes and settings drift. |
| `graph-*.knogra` | Latest exported graph from the browser (git-ignored). Named automatically by the app as `graph-welcome-to-knogra-YYYY-MM-DD.knogra`. This is the "source of truth" for graph structure, scenes, and layouts. |

### Workflow

```
Browser (design graph) → export graph-*.knogra → merge with tutorial-content.md → review → publish to knogra-graphs
```

**Step by step:**

1. **Design the graph** in the browser — add/remove nodes, compose scenes, arrange layouts, style nodes/edges.
2. **Export** with Ctrl+S → copy the downloaded file to `scripts/tutorial/` (it will be named `graph-welcome-to-knogra-YYYY-MM-DD.knogra`).
3. **Run the merge:**
   ```bash
   npm run tutorial
   ```
   No arguments needed — the script auto-detects the latest `graph-*.knogra` file, uses `tutorial-content.md` from the same directory, and outputs `scripts/tutorial/tutorial.knogra` + `scripts/tutorial/tutorial-report.md`.
4. **Review** — import `scripts/tutorial/tutorial.knogra` in the browser (Ctrl+O) to verify. Check `tutorial-report.md` for unmatched nodes or settings drift.
5. **Iterate** — to fix content, edit `tutorial-content.md` and re-run step 3. To fix graph structure or layout, go back to step 1.
6. **Publish** — see [Publishing](#publishing) below.

You can also pass explicit paths if needed:
```bash
npx tsx scripts/tutorial/generate-tutorial.mjs <input.knogra> <content.md> <output.knogra>
```

### How the merge works

- Reads the .knogra zip (a collection of JSON files)
- Parses `tutorial-content.md` into sections by `<!-- node: Title -->`
- Matches section titles to node titles (case-insensitive, normalizes `&`/`and`, extra spaces)
- Replaces `chat-history.json` in the zip with generated tutorial conversations
- All other files (graph.json, themes.json, settings.json, etc.) pass through untouched

### Title matching

The merge script matches `<!-- node: Title -->` in the .md to node titles in the graph. Matching is fuzzy:
- Case-insensitive
- `&` treated as `and`
- Multiple spaces collapsed
- Trailing punctuation stripped

Unmatched sections are reported as warnings — the script doesn't fail, it just skips them.

### .knogra file structure

A `.knogra` file is a ZIP archive containing JSON files:

| File | Content |
|------|---------|
| `manifest.json` | Format version, export timestamp |
| `graph.json` | All nodes and edges |
| `app-state.json` | Scenes, layouts, node positions, styling, viewport state |
| `chat-history.json` | Conversations per node (this is what the merge script replaces) |
| `settings.json` | App configuration |
| `themes.json` | Custom themes |
| `paths.json` | Saved navigation paths |
| `shelf.json` | AI suggestion shelf state |
| `background-images.json` | Scene background image data |

No executable code — just data. Safe to share and import.

### Publishing

The landing page catalog fetches graphs from the **`knogra-graphs`** GitHub repository
(`github.com/ebuyakin/knogra-graphs`). This is a separate repo that holds only `.knogra` files
and a `catalog.json` index. It is not a submodule — it is updated manually.

**To publish a new or updated tutorial:**

1. Generate `scripts/tutorial/tutorial.knogra` (steps 1–5 above).
2. Copy `tutorial.knogra` to your local `knogra-graphs/` folder.
3. Update `catalog.json` in `knogra-graphs` if the entry is new or metadata changed.
4. Push from a plain SSH terminal on Mac (not VS Code — the GitHub extension intercepts pushes):
   ```bash
   cd ~/path/to/knogra-graphs
   git add tutorial.knogra catalog.json
   git commit -m "Update tutorial graph"
   git push
   ```
5. The landing page will serve the new file immediately (GitHub raw URLs have no cache TTL to manage).

**`catalog.json` entry format:**
```json
{
  "id": "tutorial",
  "title": "Welcome to Knogra",
  "description": "An interactive introduction to knowledge graphs and the Knogra workflow.",
  "tags": ["tutorial", "getting-started"],
  "nodeCount": 26,
  "badge": "Start here",
  "file": "tutorial.knogra"
}
```

## Other Scripts

| Script | Purpose |
|--------|---------|
| `migrate-background-images.js` | One-time migration for background image format changes |
| `populate-sample-data.js` | Seeds the database with sample graph data (dev use) |
| `populate-sample-images.js` | Seeds sample background images (dev use) |
