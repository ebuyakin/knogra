# Changelog

What changed in Knogra, release by release, written for the people who use it.
The app updates itself: app.knogra.io serves the newest version on the next page load, so this file is where to look when something behaves differently.
Dates are the day a version went live.
Development history lives in git; reasoning lives in the project's design docs.

## 1.8.0 — 2026-10-18

### Added

- Helicopter view: a map above the scenes, built from the graph itself. Press `/` in any scene to open the map of its central node: the node at the centre, its neighbours around it as landmarks, theirs beyond as markers. Every connection keeps one fixed direction wherever you are, so moving from concept to concept never turns the map.
- On the map: walk it with the arrow keys or H J K L, `Space` balloons a small node, `G` re-focuses on the selected landmark, `[` and `]` step through the map's own history, `Enter` opens the focus's scene (created from the map if it has none), `Escape` returns to the scene you came from. Drag a landmark or marker to adjust distance and direction; `R` resets this map's distances and sizes, `Shift+R` the directions too.
- Helicopter view settings in their own Settings category: General, Landmarks, Markers, Arc split, Animation. The map can follow the focus scene's theme or use a fixed one.
- Reset a scene to its map shape: the central node and its direct connections at their map places in their default designs, everything else removed. Scene design → Auto-layout → Reset to map shape…, or `Shift+/`. Edit mode, confirmed.
- Quiz mode works on the map as well as in a scene.
- Pictures for notes, drawn by an image model: a Generate source in the note editor beside Upload and Search online. Draft lets the chat model write the description from the note's context; Configure chooses the image provider, shape, detail and background; Run on a note that already has a picture changes that picture rather than drawing a new one. Gemini and OpenAI image models; the picture is saved with the note and travels with exports.
- `Shift+N` goes to the anchor's scene, the same as the Home button.
- Paths → Clear history… restarts the history at the current scene, so the path you save next begins where you want.
- `Shift+/` and `Shift+N` in the F1 reference; Workspace and Edges swapped columns so the three columns balance.

### Changed

- The third starter relationship type is now Sequence ("leads to" / "follows from"): before and after in whatever sense the subject orders things, time, cause, derivation, prerequisite. It replaces Association, which named no relation of its own. Existing workspaces keep their own type names; only new workspaces get Sequence.
- The third relationship style draws an open vee arrowhead in every theme instead of a circle. Applies to every workspace, meaning untouched.
- Home now navigates to the anchor's scene like any other navigation: the anchor is appended to the history and `[` leads back. It used to clear the history first; that is now Clear history in Paths.
- In Paths, "Save current trail…" is now "Save history as path…": the history is the live sequence, a path is a saved one.
- Settings: clicking a heading in the tree scrolls to it; the `+`/`−` sign or a double-click folds it.
- Note images display at the panel's width, capped at 70% of the window height, instead of a fixed 240 px.

### Fixed

- Maps with many equation nodes animate smoothly. Each formula is compiled once per session and node faces are served in a form the renderer does not re-hash on every frame.
- The first open of a map after a reload no longer flashes bare landmarks.
- Returning from a map you had re-focused away from the entered scene no longer loses the central node.
- An edit made just before navigating away is saved before the transition, so it no longer travels into the next scene as a stray node.
- The central node no longer disappears during the transition from the map back to a scene.

## 1.7.0 — 2026-09-15

### Added

- OpenAI and Anthropic as AI providers, alongside Gemini and OpenRouter. Each provider has its own settings (reasoning effort, output limit, web search where the vendor offers it). An Anthropic key must be scoped to a workspace when you create it in their Console.
- Suggest and Connect by relationship type: the assistant's quick actions take the type you mean, as child, parent or either, and the assistant reads your workspace's relationship types with their meanings and directions.
- One shelf for the whole workspace: suggestions the assistant made stay available across scenes, and a shelf entry can be placed from any node that fits it.
- A help icon on the path panel for the F1 reference.
- SVG images in nodes can be recoloured with a transparent colour and a transparent background.

### Changed

- The Edge Type Manager has a new layout; relationship types keep a stable order, and new workspaces start with factory styles for the three starter types.
- New nodes are placed by their actual size, so large nodes no longer land on their neighbours.
- The image preset "Open" is now "Basic", with no backdrop.
- The assistant's instructions were rewritten and restructured; replies to Suggest and Connect keep their prose.

### Fixed

- Pasting a style onto the same node in a different scene works.
- The second tier of the quick-action menu no longer vanishes between the row and its submenu.

## 1.6.0 — 2026-08-22

The largest release since launch: nodes can carry generated artwork, a whole graph can be authored as a Markdown file, and workspace files became plain JSON.

### Added

- AI-generated node images. Describe what a concept looks like and get an SVG pictogram drawn into the node. Presets hold the visual language (subject type, technique, colour, aspect) so an entire graph comes back in one style. Generated art can follow the active theme's palette and recolour itself when you switch themes. You can also upload your own SVG, or recolour any image against the theme by assigning each of its colours a role.
- Markdown documents. A graph is expressible as a single Markdown file: a Mermaid diagram for the structure, prose per node beneath it. Import builds it into scenes; Update re-syncs an existing graph from an edited file; Export writes any graph out. Under Workspace → Markdown.
- Layout and arrange tools: align, distribute, circle, grid, diamond, rotate, spacing and node scaling, all operating on any selection, with a one-shot undo. Bulk unfold. A unified placement algorithm so new nodes land somewhere sensible.
- Six new themes, sixteen built in, and a rebuilt theme editor that shows every setting at once.
- Paths: a path manager, two navigation modes (free history and a saved path walked in order), and a generator that walks the whole graph to build a route covering every scene.
- `F2` opens a quick rename popover without the full editor.

### Changed

- Workspace files are plain JSON. Saving produces one readable `.json` file instead of a `.knogra` archive: smaller, greppable, diffable. Files saved by earlier versions still open. Export and Import became Save and Open throughout, and saved files get incrementing names.
- The node editor was rebuilt around tabs in a fixed frame, with modal styling unified across the app.

### Fixed

- Scene-scoped edge styles no longer leak between scenes; fold no longer wipes edge data.
- Transition opacity pollution and SVG non-determinism resolved; stale nodes are cleared on scene transitions.
- The first right-click is responsive.
- Many other fixes and usability improvements throughout.

## Before 1.6

1.5.0 went live on 2026-07-21 with the separation of the app (app.knogra.io) from the site (knogra.io).
Earlier versions were not recorded here; git has them.
