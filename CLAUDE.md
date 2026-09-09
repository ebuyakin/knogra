# CLAUDE.md — knogra

Instructions for Claude Code in this repo.

This file routes and sets norms. It does not describe the product or the architecture: those live in docs/ and are reproduced nowhere else, because a second copy drifts and then two files disagree. Anything about layers, folder structure, storage formats or how a subsystem works is a question for the docs listed below, not for this file.
How to talk to Eugene is settled in ~/.claude/CLAUDE.md and is not repeated here.

## History, and the Copilot transition

This repo was built with GitHub Copilot. `.github/copilot-instructions.md` is Copilot's instruction file. Claude Code does not load it, and it is not authoritative here.
Eugene keeps Copilot as a working fallback, so the two instruction sets are deliberately separate and will drift apart. This file is canonical for Claude Code sessions. Read the Copilot file only when asked, or when tracing why an older decision was made the way it was — never for current norms.

## What the app is

Knogra — a browser-based knowledge-graph editor: nodes and edges organised into scenes, with spatial transitions and AI-assisted authoring. Vite, TypeScript, Cytoscape, Dexie over IndexedDB. Local-first: no backend, no accounts, user data lives in the browser, AI calls go straight from the browser to the provider with the user's own key. Deploys to app.knogra.io.
Entry point is `src/main.ts`. Product direction is docs/knogra-vision.md; that document settles scope arguments, this one does not.

## Where the truth lives

    docs/README.md              Doc map. Every doc has a status (Current, Draft, Historical, Superseded, ...). Start here.
    docs/architecture.md        Layers, dependency direction, critical contracts, coding standards (§7).
    docs/<subsystem>.md         One canonical doc per subsystem; the map says which.
    package.json                The scripts. type-check is `tsc --noEmit`. There is no test script.

Read the relevant doc before working in its area, and check its status first — some are historical or superseded and say so in their header.
Docs record reasoning, including reasoning later falsified, which is the most useful thing in them and the reason to read rather than infer.
They can also lag the code. Check claims against the code when the answer matters, and say which of the two you actually verified.

## Files git does not track

`.github/project-journal.md`, `.github/project-journals/`, `todo.md` and `.ws/` are gitignored. Grep respects .gitignore and will not find them; open them by path.

## Session memory

`.github/project-journal.md` is the append-only long-term memory: what was done, why, what was rejected, what is still open. Entries are reverse-chronological; the format and the rules are in its own header. Older volumes are in `.github/project-journals/`.
When explicitly asked by Eugene, append an entry. Record decisions and the reasoning behind them, including the alternatives declined and why, not a changelog — the changelog is git.
`todo.md` is Eugene's active checklist. Read it, do not edit it.

## The sibling site repo

The marketing site is at ~/pro/knogra-site and deploys to knogra.io. It is outside this project, so nothing there loads automatically and reading it may prompt. Use /add-dir when a task needs sustained access.
Two contracts couple the repos, and both are stable because breaking either requires an app release:

1. The app's import allowlist pins `https://knogra.io/graphs/`.
2. The site's `src/lib/graph-extract.ts` parses the app's workspace export format.

Otherwise: no shared code, no shared build, cross-links are absolute URLs.
The site's legal pages name the AI providers the app sends data to. Adding or removing a provider is a change to those pages too.

## Working norms

- Root-cause over patch. Preserve dependency direction. Use the existing local abstraction rather than a parallel one. No compatibility shims, no cross-layer shortcuts.
- Before editing, say what will change. Always flag: signature changes, new dependencies, new storage keys or record shapes, migrations, broad refactors. Small verifiable steps.
- A new category of file: agree where it belongs before creating it.
- Match the standard already in the code — architecture.md §7, plus: meaningful searchable names, explicit return types, no `any`, shallow logic, early returns, one responsibility per unit. Comments explain why; names and types explain what. A comment that justifies a value must change when the value does.
- Persisted formats are the irreversible thing here. Workspace files, IndexedDB records and localStorage keys already in users' browsers must stay readable forever (the legacy `.knogra` ZIP still is). Nothing else in the repo carries that weight.
- Do not create or expand docs unless asked or to preserve knowledge that would otherwise live only in someone's head. But when a change makes a Current doc false, fix the doc in the same session — and check docs/architecture.md too, not only the subsystem doc. A new doc carries a status, a date and its authority in the header.
- Dead code goes. Unreferenced code does not stay neutral; it ages into a wrong answer.
- Deletion of files is Eugene's to do; say when it is needed.

## Verification

Eugene runs the shell. The ladder, cheapest first:

    npm run type-check      tsc --noEmit. Run after any non-trivial edit.
    npm run lint            eslint, zero warnings allowed.
    Manual in the browser   The only functional test there is. Say exactly what to exercise and what a pass looks like.

Silent failures are the ones to design checks for: a parser change that yields a normal-looking reply and an empty shelf, not an error.

## Diagnostics

Dev-only surfaces, documented nowhere but here and the code. Choose the lightest one that answers the question.

    DEBUG.<flag>                    Console traces per subsystem: d_transition, d_fold, d_saver, d_store, d_scene, d_background, d_chat, d_shelf, all. Defined in src/config/debug-flags.ts, toggled from devtools.
    window.debugger                 Live app objects: cy, features, graphSaver, components, panels, graphStore.
    knogra.auditScene()             Live Cytoscape state vs persisted scene records: fold state, presence, visibility.
    knogra.auditEdges()             Duplicate, orphan and dangling edges.
    window.transitionDebug          stepMode = true, then .next() to step a transition.
    knogra.clearBuffers()           Reset the action/transition/saver/error buffers before a focused repro.
    knogra.snapshot()  Ctrl+Shift+D Portable state capture. Read a snapshot file from the top, whole.
    npm run deps                    dependency-cruiser reports into .ws/deps/outputs/. For dependency direction, cycles and subsystem boundaries — not for local bug fixes.
