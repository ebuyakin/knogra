# Export / Import Redesign — Plan

> **Temporary working document.** Sequencing, steps, risks and open issues for two independent
> workstreams. Delete when both have shipped.
>
> Normative specs live elsewhere and are the source of truth:
> [Workspace architecture](workspace-architecture.md) (Part 1) and
> [Markdown architecture](markdown-architecture.md) (Part 2). Nothing here overrides them.
>
> **Last updated:** 2026-08-12

## Order

**Part 1 first.** It is self-contained, nothing in it depends on Part 2, and the reverse is not
true — Build and Update both offer save-first and both have to describe what the workspace file is.
Part 1 also contains the only one-way door (removing ZIP export), so it is better settled while it
is the only thing in flight. Part 2 is larger and lands on stable ground afterwards.

---

# Part 1 — Workspace file: ZIP → JSON

## Steps

| # | Step | Done when |
|---|---|---|
| 1 | `workspace/envelope.ts` — pure, no IO | A real workspace serializes to an envelope and parses back to equivalent data, verified from the console |
| 2 | Export switches to JSON | Save produces `<name>-knogra.json`; no ZIP is written |
| 3 | Import gains content sniffing; ZIP reader moves to `legacy-zip.ts` verbatim | Save → Open round-trips losslessly, and a v1.5 `.knogra` still opens |
| 4 | User-visible copy + `input.accept` | Accept list is `.json,.knogra`; every string in Appendix A is applied; copy follows workspace-architecture §3.1 |
| 5 | Cross-repo rollout | The landing page opens a published graph in its new format. **Deferred — ships with Part 2 as step L5**, since the two release together and the app must be live first either way |

## Risks

| Risk | Severity | Handling |
|---|---|---|
| ~~Published JSON is larger than the ZIP it replaces~~ | — | **Resolved** — measured, size-neutral at worst. See Resolved below |
| Memory pressure from one-shot `JSON.stringify` / `JSON.parse` | Low | One contiguous string instead of nine, held alongside the source object and the Blob. Bounded by the 1 MB per-image upload cap: ~14 MB of string at ten background images, ~68 MB at fifty, against V8's ~512 MB ceiling |
| Catalog / app version skew | Medium | Deploy ordering below |
| Privacy carve-outs lost in the rewrite | Medium | The envelope builder reuses `transfer.ts` unchanged, so they hold by construction |
| Telemetry counter continuity | Low | Keep `workspace_exported` / `workspace_imported`; new names are a deliberate act, not a side effect |

## Cross-repo deploy ordering

A hard constraint, not a closing chore:

1. **App ships first**, reading legacy ZIP *and* workspace JSON. `showImportDialog`'s
   `input.accept = '.knogra'` must also accept `.json`. Detection is by content sniffing, so
   `importFromUrl`'s hardcoded `application/zip` MIME is harmless.
2. **Then** `knogra-graphs/catalog.json` may point `file:` at `.json`. Keeping both variants during
   the transition costs nothing and removes the deadline.
3. **In the same step**, `knogra-site/src/scripts/graph-open.ts` — which hardcodes `+ '.knogra'` for
   the download filename — must be updated, along with the two `.knogra` mentions and the JSZip row
   in `knogra/README.md`.

Reverse 1 and 2 and every visitor running a cached app build gets a failed catalog open.

## Resolved

**Size — 2026-08-12.** The premise was inverted. `zip.generateAsync({ type: 'blob' })` passes no
`compression` option and JSZip defaults to `STORE`, so the legacy `.knogra` was **never compressed**
— a 629-node workspace ships as 2.6 MB where DEFLATE would have produced ~165 KB. There is no
compression to give up, and no composition in which the JSON file is worse than what ships today:
text-heavy workspaces shrink ~40% (2.6 MB → 1.5 MB), image-heavy ones are unchanged (~4.1 MB either
way, because base64 PNG is already compressed and gzip only recovers the 4/3 expansion). Over the
wire the catalog gains ~17×, since `.knogra` is served uncompressed and `.json` is gzipped.

Decided: **unindented**, no ZIP export, `jszip` read-only for legacy files. Step 2 is unblocked.
Recorded in workspace-architecture §5.1–§5.2. Background-image bulk — pre-existing, unbounded, and
not controllable by the user on export — is noted there as §11 future work and is out of scope here.

**Dialog copy — 2026-08-12.** Two findings. First, §3.1 specified a Save dialog that does not exist:`exportWorkspace()` downloads directly, and its two conditional dialogs are validation and in-note
images. That row was a leftover from the abandoned configurable-export design and is gone — Save
stays silent, and the browser's download indicator is the confirmation. Second, labels use **single
verbs**: Save / Open / New, never `Save (Export)`. The dual form was considered and rejected because
workstream 2 puts *Export as Markdown…* in the same canvas menu, where a second "Export" would mean
something materially different. Technical accuracy is preserved where it belongs — code, both specs,
and the telemetry counters keep export/import. Exact strings in Appendix A.

**`appVersion` — 2026-08-12.** Stays `1.5.0`. `APP_VERSION` is one constant consumed by both the
manifest and the diagnostics snapshot; it is bumped once at release, not mid-workstream. The
reader dispatches on `manifest.format`, and `manifest.version` is the format marker — neither
depends on the app version.

## Open issues

None. Steps 1–4 are implemented and verified; step 5 ships with Part 2.

## Appendix A — every user-visible string

Approved 2026-08-12. Everything here except the last row is pure copy, independent of the format
change, and belongs to step 4.

| Where | Current | New |
|---|---|---|
| `canvas-menu.ts` | `New (⌘N)` | `New… (⌘N)` |
| `canvas-menu.ts` | `Import (⌘O)` | `Open from file… (⌘O)` |
| `canvas-menu.ts` | `Export (⌘S)` | `Save to file… (⌘S)` |
| `shortcut-definitions.ts` | `Export workspace` | `Save workspace to file` |
| `shortcut-definitions.ts` | `Import workspace` | `Open workspace from file` |
| Open dialog — title | `Import Workspace` | `Open workspace from file` |
| Open dialog — body | *This will replace your current workspace with the imported one. Your current data will be lost unless you export it first.* | *This replaces everything currently in this browser — graph, scenes, chat, images, paths and themes.* |
| Open dialog — checkbox | `Export workspace to a file first (recommended)` | `Save current workspace to a file first (recommended)` |
| Open dialog — button | `Import` | `Open` |
| New dialog — checkbox | `Export workspace to a file first (recommended)` | `Save current workspace to a file first (recommended)` |
| Validation — subtitle, save | *…You can still export it as a backup, but fix these before sharing.* | *…You can still save it, but fix these before sharing.* |
| Validation — subtitle, open | *…You can still import it, but some scenes may not render correctly.* | *…You can still open it, but some scenes may not render correctly.* |
| Validation — buttons | `Export anyway` / `Import anyway` | `Save anyway` / `Open anyway` |
| Image dialog — title | `Export Images` / `Import Images` | `Images in notes` (both directions; the intro states which way) |
| Image dialog — button | `Export` / `Import` | `Save` / `Open` |
| Image dialog — descriptions | *…are exported* / *…are imported* | *…are written to the file* / *…are brought in* |
| `mermaid.ts` | `Export current workspace to a .knogra file first (recommended)` | `Save current workspace to a file first (recommended)` |
| `workspace.ts` — alert | *Failed to import workspace. The file may be corrupted.* | *Could not open the workspace file. It may be corrupted, or not a Knogra workspace.* |
| `workspace.ts` — alert | *Invalid workspace file: missing manifest* | Superseded by the §5.3 sniffing error: *This is not a Knogra workspace file.* |

Deliberately unchanged: the New dialog's title, body and *Preserve settings* checkbox (already
accurate); the scale-to-fit dialog (carries no export/import vocabulary); and the `Mermaid import` /
`Mermaid export` menu items, which workstream 2 renames.

---

# Part 2 — Markdown document

## Steps

Bottom-up. The two riskiest pieces — grammar and Update semantics — are pure functions, so they are
console-testable against a real workspace via `window.debugger` before any UI exists.

| # | Step | Done when |
|---|---|---|
| L0 | Identity primitive: `externalId` on nodes and `ChatMessage`; the system-property list in `config/`, with the advanced tab stripping it and `#composeProperties` re-attaching it | The field survives a store round-trip, is invisible in the node editor, **and still exists after opening that editor and pressing Save** |
| L0b | Folder rename `mermaid/` → `markdown/`, `mermaid.ts` → `markdown.ts` beside it | Mechanical, lands alone, type-check between |
| L1 | `document/` — parse + serialize, note keys (two colons + token test), ai-chat keys, heading registration, diagram-optional | A real workspace serializes to a document and parses back to equivalent data, **and every pre-existing document still parses unchanged** |
| L2 | `planUpdate(…) → UpdatePlan`, including the notes guard | Correct counts per section and correct unmatched entries, with no write path connected |
| L3 | Appliers: Build changes (both `externalId` stamps, `source: 'note'`, no-diagram refusal), Update apply | Build stamps node **and** note ids; re-running the same authored document as an Update matches every note it created |
| L4 | UI: export section chooser, the single Update dialog, View-mode refusal, `Workspace ▸ Markdown` submenu, Build dialog copy | Every path reachable from the canvas menu; Update refuses in View mode from the command itself; ticking a section in the Update dialog recomputes its count |
| L5 | Cross-repo rollout (carried over from Part 1) | The landing page opens a published graph in the JSON format. Hard ordering below |

L0's done-when is the whole point of L0: without it every later layer is built on an id that
erases itself.

L5 spans three repos and inherits Part 1's ordering: **app live first** (reads both workspace
formats), **then** `knogra-graphs/catalog.json` may point `file:` at `.json`, and **in the same
step** `knogra-site/src/scripts/graph-open.ts` (hardcodes `+ '.knogra'` for the download filename)
and `knogra/README.md` (two `.knogra` mentions, the JSZip row, the "Mermaid import / export" feature
line, and the `Ctrl+S` / `Ctrl+O` wording). Reversing 1 and 2 breaks every cached app build.

## Explicitly untouched

Stated so nobody expands the blast radius mid-implementation:

- **All layout and slicing** — `layout/`, `scene-slice.ts`, `edge-mapping.ts`,
  `import-options-dialog.ts`, `import-settings-store.ts`. They move folder with the rename and are
  not otherwise edited.
- **All of `workspace/`** — `transfer.ts`, `validate.ts`, `dialogs.ts` are reused unchanged.
- **All stores** — no schema change, no DB version bump; `externalId` rides inside existing
  `properties` and message records.
- **`storage/graph-saver.ts`** — the applier *calls* `suspend()`; the saver is not modified.
- **`features/`, `ai/`, `styles/`, `background/`** — no Markdown code lives there and none is added.
- **`features/quiz.ts`, `features/path/`, `storage/app-mode.ts`** — the View-mode refusal is a
  single guard at Update's entry point. No regime gains a capability, none is added, and the table
  in [architecture.md](architecture.md) §3.10 does not change.
- **`ui/`** beyond the four files in markdown-architecture §8.3.

## Risks

| Risk | Severity | Where handled |
|---|---|---|
| `externalId` deleted by a node-editor Save | **High** — defeats the identity model silently | markdown §6.3, L0 |
| Debounced save clobbers applied content before reload | **High** | markdown §5.7 |
| Round-trippable section empty on every new graph (notes stamped `tutorial`) | **High** | markdown §5.1 |
| Build discards the document's note ids, so the first Update after a Build matches nothing and trips the §6.5 guard | **High** | markdown §5.1, L3 |
| Note-key grammar rejects or misreads pre-existing documents | **High** | markdown §4.3, L1 |
| Update run in View mode | Medium | markdown §5.5 |
| User lands on the wrong scene after the reload | Medium | markdown §5.7 |
| Irreversible content loss with no undo | Medium | markdown §5.5 save-first |
| Tag replacement changes node appearance via style copying | Medium | markdown §5.3 |
| New heading not registered as a terminator, leaking into the diagram body | Low | markdown §4.3 |
| The rename touches many import paths at once | Low | L0b lands alone |

## Resolved

All settled 2026-08-12, in a spec review before any Part 2 code. Normative text is in
[markdown-architecture.md](markdown-architecture.md); this is the record of what changed and why.

**Two defects found by reading the spec against the code.**

*Mandatory note ids contradicted the compatibility promise.* §4.3 required `<nodeId>:<noteId>:`
while §7 and §9 promised old documents still Build — and every existing document writes `<id>:
body`. The rule is now positional with a token test: the text between the first and second colon is
a note id **only** if it matches `[A-Za-z0-9_-]+` with no surrounding whitespace. The space after
the colon in every legacy entry is what disqualifies the candidate, so old bodies survive whole,
colons and all. `N1:intro: text` names a note; `N1: Note: this matters` does not. The residual
misread — no space *and* a body opening with a bare word and colon — was accepted. Two alternatives
were rejected: mandatory-and-drop-legacy-notes (throws away prose the current importer reads fine),
and "a note id only when alone on its line" (forbids one-line notes, which the user wants for
greppability).

*Build discarded the note ids it was handed.* §6.3 wrote `ChatMessage.externalId` only when Update
created a note, so the natural loop — author a document, Build, keep editing that file — failed on
its first Update: nothing resolved, and the §6.5 guard refused the whole notes section. Build now
stamps both ids, node and note. This also settled the open question of whether `externalId` earns
its cost: hand-authoring with one's own ids is a workflow to support, so it does.

**One dialog for Update, not two.** §5.5 listed settings, §5.6 showed counts, and neither said where
the checkboxes lived. They are the same screen, counts recomputed per tick — affordable because
planning is pure over a document parsed once and a graph read once, and necessary because "tags may
change appearance" has to be visible next to the switch that causes it.

**Menu shape.** `Workspace ▸ Markdown ▸ Import… / Update… / Export…` — nested, so the top-level menu
does not grow and the two artefacts stay visibly related. *Build* stays the spec's name for the
operation; *Import* is the label, disambiguated by nesting now that the workspace one is *Open*.
Same code-vs-UI split Part 1 settled. Working names *Build graph from Markdown…* and *New workspace
from document…* both dropped. One inaccuracy fixed along the way: the Build confirm dialog claims to
replace "your current workspace graph", but `clearAllData()` also wipes chat, paths, background
images and the shelf — it now says what the Open dialog says.

**System-property list → `config/`.** A declared table like the storage keys and shortcut
definitions beside it. `core/` holds types and no data.

**`markdown.ts` beside `markdown/`, not inside it.** Matches `storage/workspace.ts` +
`storage/workspace/`: entry point beside, parts within. Also keeps L0b mechanical.

**Build with no diagram: refused**, naming Update as the operation for content-only documents.

**No relabel helper.** §6.4 assumed every Markdown-built catalog graph carried `source: 'tutorial'`
prose. In practice only the shipped Tutorial graph does, and its prose has no reason to round-trip.
Build stops producing the mismatch, so nothing accumulates; the helper is a handful of lines if a
graph ever needs it.

**`<!-- knogra:doc v1 -->` dropped.** A hand-written document would never carry it, so no code may
branch on its absence — which is the only thing a version marker is for.

**Editorial.** Heading level is free on read, `##` on write under a `#` title; all six headings
(including the legacy `tutorial`) registered in the terminator/scrubber alternation; the §5.6 mock
uses real ids instead of the old positional `N7`.

## Open issues

None. Part 2 starts at L0.
