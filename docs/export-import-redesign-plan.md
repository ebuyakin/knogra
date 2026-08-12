# Export / Import Redesign — Plan

> **Temporary working document.** Sequencing, steps, risks and open issues for two independent
> workstreams. Delete when both have shipped.
>
> Normative specs live elsewhere and are the source of truth:
> [Workspace architecture](workspace-architecture.md) (Part 1) and
> [Markdown architecture](markdown-architecture.md) (Part 2). Nothing here overrides them.
>
> **Last updated:** 2026-08-11

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
| 5 | Cross-repo rollout | The landing page opens a published graph in its new format. **Deferred — ships with Part 2**, since the two release together and the app must be live first either way |

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
| L0 | Identity primitive: `externalId` on nodes and `ChatMessage`; the system-property list, with the advanced tab stripping it and `#composeProperties` re-attaching it | The field survives a store round-trip, is invisible in the node editor, **and still exists after opening that editor and pressing Save** |
| L0b | Folder rename `mermaid/` → `markdown/` | Mechanical, lands alone, type-check between |
| L1 | `document/` — parse + serialize, note keys, ai-chat keys, heading registration, diagram-optional | A real workspace serializes to a document and parses back to equivalent data |
| L2 | `planUpdate(…) → UpdatePlan`, including the notes guard | Correct counts per section and correct unmatched entries, with no write path connected |
| L3 | Appliers: Build changes, Update apply, dev-only relabel helper | Build stamps `externalId` and `source: 'note'`; an Update applies and survives a reload |
| L4 | UI: export section chooser, Update settings + preview, View-mode refusal, menu renames | Every path reachable from the canvas menu; Update refuses in View mode from the command itself |

L0's done-when is the whole point of L0: without it every later layer is built on an id that
erases itself.

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
| Existing graphs cannot bootstrap their prose | Medium | markdown §6.4 relabel helper |
| Update run in View mode | Medium | markdown §5.5 |
| User lands on the wrong scene after the reload | Medium | markdown §5.7 |
| Irreversible content loss with no undo | Medium | markdown §5.5 save-first |
| Tag replacement changes node appearance via style copying | Medium | markdown §5.3 |
| New heading not registered as a terminator, leaking into the diagram body | Low | markdown §4.3 |
| The rename touches many import paths at once | Low | L0b lands alone |

## Open issues

1. **Where the system-property list lives** — `config/` or `core/`. It is data, not configuration,
   but `config/` already holds storage keys and shortcut tables.
2. **Menu labels.** *Build graph from Markdown…* / *Update graph from document…* /
   *Export as Markdown…* are working names. "Build" is clear in the doc; unclear whether it reads
   right in a canvas menu next to *Open workspace from file…*.
3. **Build with no diagram** — currently refused. Alternative: allow it as a no-op that reports
   nothing was created. Refusal is simpler and probably right.
4. **Relabel helper naming** on the `knogra.*` diagnostics surface, and whether it is scoped to the
   open workspace only (assumed yes).
5. **Document version marker.** `<!-- knogra:doc v1 -->` has no consumer yet. Confirm it earns its
   place, or drop it until a v2 grammar actually exists.
