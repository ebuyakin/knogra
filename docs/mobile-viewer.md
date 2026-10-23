# Mobile viewer

> Status: Current. Spec and plan agreed on 2026-10-19; built and tuned in emulation on 2026-10-19 and 20, on an iPhone from 2026-10-20. Version 2, the home-screen app with the library pane (§15), built 2026-10-22 and in use on the phone since; the user's own file added 2026-10-23. This text describes what is built. The viewer is in private use before its public launch (a version, the site's feature text and a post are that launch's work).
> Last reviewed: 2026-10-23
> Authority: Canonical for the mobile viewer: what it is for, what it shows, how it is driven by touch, what it stores on the phone, what it reuses from the app and what it writes of its own. Where code and this document disagree during implementation, this document wins until amended in the same session.
> Related: [Product vision](knogra-vision.md), [Map view](map-view.md), [Workspace architecture](workspace-architecture.md), [Architecture](architecture.md)

## 1. Purpose

The vision names two modes: construction, where a graph is built, and travel and review, where it is walked, read and recalled.
Knogra has only ever shipped the first, and only on a desktop, because building a graph needs a large screen.
Reviewing one does not.
The mobile viewer is the travel and review mode on the device where review actually happens: a phone, in the minutes that have no computer.

It is a viewer, not an editor.
It shows a graph that was built elsewhere as a sequence of one-ring maps, the same directions as on the desktop, and lets the user travel, read the notes of each concept and take the quiz.
Nothing on the phone changes the graph.

Two audiences, served by the same page:
the author who built a graph on the desktop and wants it on the phone for review;
the visitor who found a graph in the library on knogra.io and cannot try knogra on a phone today.
The visitor gets their graph from the library on knogra.io; the author either publishes there or opens the desktop's export from the phone's Files app (§4.1), which is where a synced folder puts it.
Fetching files from other hosts is out of scope for this version and recorded in §13.

## 2. Vocabulary

The viewer reuses the map view's terms (map-view.md §2) and adds a few of its own.
Use these words in code, comments and this document.

    viewer        The mobile page and everything on it. Not the app: the app is the desktop editor at index.html.
    pane          One of the four screens the viewer swipes between: library, quiz, map, notes. The map pane is home.
    one-ring map  The map the phone draws: the focus and its landmarks, nothing beyond. Not the desktop map, which draws two hops.
    phone layout  The algorithms that place a one-ring map on a phone surface: the rows, portrait, and the bands, landscape (§5.3). Not the desktop layout (geometry.ts), which they replace, not extend.
    install       Writing a workspace file, fetched from the library or picked from the phone's files, into the phone's browser storage, replacing whatever graph was there. Not an import in the editor's sense: there is no workspace on the phone to protect.
    bar           The strip with a pane's buttons: along the bottom in portrait, a column at the right edge in landscape.
    portrait, landscape   The phone's two orientations, taller than wide and wider than tall. The CSS and the layouts switch on the orientation media query.

The terms focus, landmark, box, line, direction, balloon, re-focus and travel mean what map-view.md says.
Markers do not exist on the phone.

## 3. The page

The viewer is a second page of the app, `view.html`, served at `https://app.knogra.io/view.html`, built from the same bundle as the editor by a second Vite entry.
It has its own HTML, its own CSS and its own startup script.
It does not share index.html, so the desktop editor's mobile gate (the "Knogra is a desktop application" message) never applies to it, and the editor's grid never loads on a phone.

The page opens in any browser.
It is shaped for a phone, portrait or landscape, each with a layout of its own (§5.3) and a place for its bars (§8); it works in a desktop window without any promise about looking good there.

The address carries one optional parameter:

    view.html?graph=<file url>    Install the file at that URL, then show it.
    view.html                     Show the graph already on the phone; with none, open on the library pane (§8).

The URL must start with `https://knogra.io/graphs/`, the same allowlist the editor applies to `?import=` (main.ts), for the same reason: the parameter is anyone's to craft and install replaces what is stored.
Any other URL is ignored and the page behaves as if the parameter were absent.
The parameter is removed from the address after it is read, so a reload does not reinstall.
Why that matters for the home screen: an icon saved with `?graph=X` would reinstall X at every open, undoing a graph chosen from the library pane.

The home-screen app (2026-10-22). The page carries what iOS needs to save it as an app: `apple-touch-icon` (public/apple-touch-icon.png, 180×180, exported from public/logo.svg, since iOS does not take SVG), the app-capable tags, the status bar over the page (the CSS pads for the safe areas), the name under the icon, and public/viewer.webmanifest with standalone display for the browsers that read one.
Saved to the home screen, the viewer opens without Safari's bars, with its own storage, separate from Safari's (§4.3).

The colour of the browser's own bars. viewer.css paints the page's root with the colour of the viewer's bars (`--bar-color`, the canvas darkened as the bars darken it) and the panes with the canvas colour.
Safari on iOS 26 takes its bar colour from the root and ignores the `theme-color` tag (reported by developers, not by Apple); the tag is set too, from the theme of every map shown, for the browsers that read it.
The same root colour fills the safe-area strips around the panes, so the bar reads as running to the screen's edge. In landscape the side strips stand beside the map and the bar column, where the bar colour made the column look half as wide again (seen 2026-10-22), so there the strips are painted in the canvas colour, as borders on the viewer in place of the padding; the bottom strip keeps the bar colour, as in portrait.

The status line ("Loading…", the empty message) lies over the map's centre, out of the page's flow. In the flow it took 24px of the map's column while the first map was drawn and gave them back when hidden, which left the first map's focus 12px off centre until the first travel re-framed it: the notch on the first travel after a reload, seen 2026-10-22.

A home-screen app on iOS 26 gets a viewport short by the status bar's height (measured 873 of 932 on 2026-10-22, a WebKit regression reported by several projects); the page is sized with 100lvh in standalone display mode, which still sees the whole screen. In Safari the page stays at 100%, where 100lvh would run under Safari's bars.

Landscape in a browser. Safari's bars, with the tab row, take about a third of the height in landscape, and a page cannot hide them: there is no element fullscreen on iPhone, and the bars collapse only under a real scroll, which the viewer has none of.
So in a browser (display-mode: browser), in landscape, on a touch device (pointer: coarse), a note stands in for the map: landscape needs the home-screen app, or turn the phone to portrait. CSS alone; the panes stay built behind it, so a rotation back is instant.
The home-screen app has no bars and is the mode landscape is for.

## 4. Data on the phone

### 4.1 Install

Install fetches the workspace file, identifies and parses it with the app's own functions (`detectWorkspaceFormat` and `parseEnvelope` in workspace/envelope.ts, `readLegacyZip` for the old ZIP), clears the phone's stores and writes the graph, background images, map records, conversations and custom themes into them, through the same transfer functions the editor's import uses (workspace/transfer.ts).
The editor's own three-line reader is private to workspace.ts; the viewer repeats those three lines rather than importing workspace.ts, which carries the dialogs.
The viewer composes these steps itself rather than calling `importWorkspace`, because that function asks questions on the way (validation, scale to fit, in-note image choices) that make sense in an editor and not on a phone.
Nothing in the file is interpreted; the viewer shows what the author made.

Not installed: the file's settings and app state.
The desktop map settings (ring radius, horizontal stretch, the arc shares) belong to the desktop layout and would mislead the phone layout; the viewer has its own values in code.
API keys are never in a file (the export blocklist) and the viewer never asks for one.

After install the page shows the graph.
Opening the page again without a parameter shows the stored graph, with no network.
Opening it with a parameter, or choosing a graph on the library pane (§8), replaces the stored graph: one graph on the phone at a time, the one last installed.
The installed file's URL is kept in localStorage under the viewer's own key (`knogra.viewer.graph`, registered in storage-config.ts with the app's keys, the one line of the viewer outside src/mobile and public/), so the library pane can mark the graph on the phone. Written last, after the stores.

The user's own file (2026-10-23). The install is split into fetching the text and installing it (`installFromUrl` and `installFile` in install.ts), and the library pane's "Open a file" hands a file from the phone's file picker to the second half.
This is how a graph not in the library reaches the phone: the desktop's export goes into iCloud Drive, OneDrive, Google Drive or anything else the Files app shows, and the picker reaches all of them with one mechanism. Both formats the reader knows are accepted (.json and the legacy .knogra).
A picked file has no URL, so the install clears the key instead of writing one: the pane then marks no row and says the graph came from a file. No new value shape in storage.
Trust is the desktop's: the file is the user's own, as when the editor opens one, which is why this is not the deferred "files from any URL" (§13).

### 4.2 What the phone writes

The viewer is read-only toward the graph, with one named exception that the shared code makes:

    Seeded directions   An edge the author never gave a direction on the desktop is seeded on first view, as on the desktop (`ensureBearings`), and the seed is written to the phone's store so the next map agrees with this one. The file on knogra.io is untouched.

The quiz writes nothing: the desktop's forces View mode for its session, but the viewer never edits, so there is no app mode to force.

No map record is ever written: the phone layouts take no adjustments, and a box dragged on the map (§8) is forgotten at the next travel.
No conversation is ever written.
Nothing is sent anywhere.

### 4.3 Storage lifetime

Safari on iOS removes a site's storage after seven days without a visit unless the page has been added to the home screen.
The viewer does not fight this: a graph gone from the phone is one tap away on the library pane.
Add to home screen is the recommended way to keep a graph; the page carries the metadata for it (§3). A home-screen app has its own storage, so its first open finds no graph and starts on the library pane. A full installable web app with offline caching is a later step (§13).

## 5. The map

### 5.1 What is shown

A one-ring map: the focus at the centre, each direct neighbour once as a landmark around it, one line per pair of nodes.
Twins (a node reachable by several edges) draw as one box.
Parallel edges draw as one line.
Nothing beyond the ring is drawn in this version.

The theme is the focus's own scene's theme when it has one, else the first scene's theme in the file; the viewer has no theme setting.
The page takes the map's colours: the page is the theme's canvas a shade darker, the bars and the side panes a translucent darkening over it, buttons and titles in the theme's secondary text colour with hairline borders, so nothing on the screen competes with the map.
Boxes draw in their node's default design at the box's rendered size, faces included (equation and image nodes), through the app's style generator, as the desktop map does.
Arrowheads are drawn larger than the desktop's (a factor in phone-map.ts), since at phone size the desktop's cannot be told apart, and every layout keeps a clearance between the focus and its landmarks so each line has a shaft to carry its head.

### 5.2 The invariant

The direction stored for an edge is read exactly as the desktop reads it (`resolveEnds`, `lineAngle`, geometry.ts), and the phone keeps three facts of it:

    order     going around the focus, the landmarks come in the same sequence as on the desktop
    side      a landmark east of the focus is drawn to its right, west to its left
    half      a landmark above the focus is drawn above it, below stays below

The angle itself is not kept.
The first version did keep it (the spec of 2026-10-19 said "exactly"), and the result on a phone in portrait was a map that shrank its east and west landmarks to squeeze them beside the focus while the top and bottom of the screen stayed empty: a direction chosen on a canvas twice as wide as tall, honoured to the degree on a screen half as wide as tall, wastes the long axis and spends the short one.
Order, side and half are what makes the map recognisable; the three are kept by construction in both layouts.
A landmark straight left or right of the focus has no half of its own and takes the one that balances the picture.

### 5.3 The phone layouts

Two, one per orientation, each written for its own problem and not for the other's: boxes are wide and short, a row of them reads as a line of text and a column does not, so the landscape layout is not the portrait one with its axes swapped (tried on 2026-10-20 and rejected on sight).
Both take the one-ring tree, the directions, the surface size and each node's natural size, and give a position, a size and a length per box in the shape the shared drawing and animation code reads (`MapLayout`).
Both draw the focus at the centre at its natural size capped to a fraction of the width (and, in landscape, to the landmark cap), and size every landmark on its own: the largest scale that fits the box in its slot, up to a cap (landmarkScaleMax, 0.8) and never below a floor (landmarkScaleMin, 0.35).
One common scale for all landmarks was the rule until 2026-10-21: one image box and three rows set the scale for every title-only box, which came out small with room all round them.
Numbers live in phone-map.ts.

Portrait, the rows (phone-row-layout.ts):

    Rows         The focus alone in the middle row; every other row holds at most one landmark on each side. Each side of the focus is a column in clockwise order cut at north and south, so order is kept; rows fill from the focus outward.
    Slots        Each side's rows get equal slots, the side's room over its rows, capped at a share of the height; the box is centred in its slot. The regular rhythm, and the room the shorter boxes keep, is what makes it look right; slots sized to their own boxes were tried and gave bigger boxes with no room between them. Between two rows a clearance is kept out of the slot (rowClearance, 20px, an arrowhead and a little), so the line to the far row ends in a head that does not land on the near row's box (seen 2026-10-22); a side with one row keeps the ordinary gap.
    Size         Per box: the cap, the slot's height over the box's height, the width over the box's width, whichever is least; the two boxes of a row that together outrun the width give up the same share. The floor last.
    Across       A landmark sits where its direction points, a nearly vertical one close above the focus, a nearly horizontal one at the edge; the two in a row are pushed apart only as far as clearing each other needs.
    Stagger      The two boxes of a row are set off its line a little, the more horizontal one toward the focus, so unequal boxes do not sit in near symmetry (which the eye reads as a mistake); the size on a tie. Within the slot's room only, so a crowded map stays aligned. Starved in practice (seen 2026-10-22): the per-box size fills the slot, so the room is near zero and the stagger seldom shows; reserving room before sizing is the fix, left for the layout rethink (§13).
    Wide pair    Two boxes that cannot share a row even at the margins take a double-height row, one behind the other, rather than shrinking the map.

Landscape, the bands (phone-band-layout.ts):

    Bands        Three: a row of landmarks above the focus, a row below, and the focus's own band with landmarks beside it. The middle band gets a slot like the rows, an equal share of the height; beside boxes fit it, they do not grow it (letting them grow until the rows reached the floor was tried on 2026-10-21 and squeezed the rows to nothing).
    Beside       At most two a side, from those within a band of the horizontal, the most horizontal first, each taken only if it would be no smaller beside the focus than in its row. A pair sits one wholly above the centre line and one wholly below, the more upward direction up, so the line to the far one passes clear of the near one; a lone one is set a little up or down by its direction. They are spread over the side's room, the far one at the margin.
    Rows         Boxes left to right in stored order, each where its direction points, pushed apart only to clear each other. Each row gets a slot, the side's room over its rows; a box is set off the row's edge by its direction, within its slot, so the rows bend around the focus (a straight edge was the rule until 2026-10-21).
    Size         Per box: the cap, the slot over the box's height, the row's share of the width; the floor last. A row too long for the width may split in two, the most vertical boxes in the far row; of one row and two, the plan whose smallest box is larger wins, fewer rows on a tie.

A landmark at the floor may be unreadable; the balloon is how it is read (§7).

### 5.4 Resize

A rotation lays the shown map out again for the new surface with the other layout and redraws it in place, without animation and without touching the history; a balloon or a selection goes with the old drawing, and a running quiz masks the new boxes as it masks any arrival.
The viewer listens to the window's resize, settled over a short delay, and does nothing when the surface has not actually changed.

### 5.5 Lines behind boxes

The layouts place boxes by direction and size and never look at the lines, so on a crowded portrait map a line to a far row runs behind a box of the near row. A line through a box is accepted as the lesser harm against boxes overlapping or shrinking (decided 2026-10-22), and its damage to the eye is reduced instead (phone-map.ts, line-crossings.ts, built 2026-10-22):

    Where       A detector over the layout's output finds, per line, the stretches that lie behind another landmark's box, as fractions of the drawn line; overlapping stretches merge, and the strip between two crossed boxes stays visible so the eye can follow the line.
    How         The line is painted as a gradient whose colour turns to the canvas colour over each stretch, with a 10px ramp (FADE_RAMP) at either end so the ends are soft. The canvas colour stands in for transparency, since the renderer keeps only a stop's colour and uses the line's one opacity for all stops.
    Portrait    Only. The bands keep their lines clear by construction.
    Travel      A surviving line is unfaded before it moves and faded for the new map after it arrives, so it travels whole and the eye keeps it: its holes close during the departure and the new ones open during the arrival, by a frame loop of the viewer's own over the stop positions, so refocus-animator.ts stays the desktop's. An arriving line gets its holes at the end, without a transition, which was judged not worth more.
    Not built   Bent lines (Cytoscape's unbundled bezier) and the desktop's margin trick. Kept as options if the fade proves insufficient.

## 6. Travel

A double tap on a landmark re-focuses the map on it, with the desktop's animation: leavers depart into the focus, survivors glide, arrivals come out of their parent (refocus-animator.ts).
The viewer keeps its own history of focuses, and the bar's Back steps through it, as `[` does on the desktop map.
The bar's Home re-focuses on the anchor, appended to the history.
Where the file has no anchor, the first scene's central node stands in for it, at startup and for Home.

## 7. Balloon

A box drawn below the readable scale balloons on tap: it grows to readable size over its neighbours, nothing else moves except a box near the edge, which is nudged inside the surface and back when it collapses (preview.ts).
One balloon at a time:

    Tap a small box            Balloon it; any other balloon collapses.
    Tap the ballooned box      Collapse it.
    Tap empty surface          Collapse it.
    Double tap a landmark      Re-focus; the balloon is released into the move, not collapsed first.

The focus never balloons; it is drawn readable.

A tap on a box acts only once the double-tap interval (300ms, shorter than the editor's since a finger is quicker than a mouse) has passed with no second tap: Cytoscape's `onetap`.
On the plain `tap` the two taps of a double tap ballooned the box and collapsed it before the travel (seen 2026-10-21).
A tap on the empty surface has no double tap and acts at once.

## 8. Panes and gestures

Four panes side by side, the map the home:

    library  |  quiz  |  map  |  notes

A horizontal swipe moves one pane left or right; a swipe past the end does nothing.
The map pane also has two bar buttons, Quiz and Notes, that go to the neighbouring panes, so the panes are discoverable before the swipe is known; the quiz pane's bar has Library.
From any side pane, a swipe back or the Map button on its own bar returns toward the map.

The library pane (2026-10-22, two sections since 2026-10-23) is a grouped list, the shape the phone's own settings use: a heading over a card of rows.

    Installed on this phone   One row: the graph the phone holds, named by its start node's title since a graph has no title of its own, with its source ("from the library" or "from a file") and its node count. On an empty phone the row says to pick a graph below or open a file.
    Demo library              The library's graphs from the site's index (§12): one row per graph, the title and the node count, nothing more, since the visitor learns about a graph on the site and the pane is for choosing. The installed one carries "✓ installed" in the accent and does nothing on a tap.

A tap on another library row installs it, by the same path as the link (§4.1), and reloads to its map. No confirmation: nothing on the phone is lost that cannot be fetched again; a running quiz ends.
The index is fetched each time the pane is shown. Without a connection the library's card says it needs one; the status row stands regardless, and the graph on the phone stays usable.
The bar holds "Open a file" beside Map: it opens the phone's file picker, and the picked file installs by the same path (§4.1). In the bar rather than in a section because every tappable thing sits within the thumb's reach, and a row that is not a graph would be the only one of its kind.
With no graph on the phone the viewer opens on this pane and the other three are locked.

Design rules the pane follows, so they are not rediscovered: the card tells the heading from the rows, so the two need not differ by size alone (heading 17px semibold, rows 16px); separators run between rows only, inside the card; rows are 48px tall, above the 44 a thumb needs; the installed mark is a tick on the detail, not a coloured row, since the accent on a whole row reads as tappable; a pressed row darkens; a long title is cut with an ellipsis and the count stays whole; headings are never in capitals.

Every interactive element sits within the thumb's reach and away from the map's own space: in portrait, each pane's bar runs along the bottom, the map's with its four buttons, each side pane's with its title and its Map button; in landscape, where height is the scarce axis, every bar stands as a column at the right edge, buttons gathered at its foot, the pane's title running down from its top like a book's spine.
Every button in a mode has the same width (a quarter of the bar in portrait, the column in landscape), so nothing moves when a bar swaps.
The top of the screen holds nothing to tap; a counter may sit there (§10.2), never a button.

Two constraints on the swipe:

    Edges       A swipe that starts at the left or right edge of the screen is the browser's back and forward gesture on iOS and never reaches the page. The pane swipe starts inside the screen; the viewer does not try to claim the edges.
    Scrolling   The notes pane scrolls vertically. A gesture there is a swipe only when it is mostly horizontal from its first movement; otherwise it is a scroll and the pane does not move.

The map pane does not pan or zoom; the map instance has both switched off, so a horizontal swipe over it is the viewer's to interpret.
There is no pinch.

A landmark can be dragged: to feel it, to peek under it on a crowded map, to clear room.
It stays where it is dropped until the next travel, Back or Home lays the map out afresh (a spring-back on release was built and taken out the same hour: a dragged box that stays is the useful one).
The focus cannot be dragged, since the layout and the frame are built around it; nothing is dragged during a travel.
A drag that starts on a box is the box's, not the strip's: the swipe code asks the map whether a box is held and stands aside.
Cytoscape tells a tap from a drag by whether the finger moved, so tap and double tap are unaffected.

The bar on the map pane, left to right: Quiz, Back, Home, Notes.
While a quiz runs the bar changes (§10).

## 9. Notes pane

The focus's saved notes and conversation, read only, rendered by the app's own message renderer (chat-message-renderer.ts: `renderNote`, `renderAIMessage`, `typesetMath`), so formulas, images and formatting look as they do on the desktop.
Context menus and note editing are not wired; the renderer's handlers are given no-ops.
No input field, no quick actions, no key.
A node without a conversation shows the node's title and a line saying there are no notes.
The pane follows the focus: travelling on the map changes what the notes pane shows the next time it is opened.

## 10. Quiz

### 10.1 Quiz pane

The quiz pane is where a quiz is configured, started and ended: the hidden share (50% to start), the counts of the session if one runs, Start or End.
Start slides the strip to the map, since that is where the quiz happens; End leaves you on the quiz pane.
The desktop's option to spare central nodes has no meaning here: on the map every landmark becomes the focus on travel, so every node is treated alike.
It is the mobile shape of the desktop's floating quiz panel, written for the phone; the desktop panel is not reused.

### 10.2 A running quiz

The viewer's own quiz, written in src/mobile/, behaving as the desktop's map quiz does (features/quiz.ts with graph-wide eligibility, which the viewer does not import, §11.1): every node in the graph is eligible, a sample of them is hidden by masking the box's face with the design's masked style, a hidden node stays masked wherever it appears, and the quiz walks map to map through travel.
A hidden box is revealed by touch, not by a button: the first tap selects it, the second reveals it and balloons it if it is small.
Correct and Wrong then grade it, once; both grey until the next reveal, so a repeated tap cannot count twice, and a verdict is not changed.
A revealed node left unjudged counts as skipped from the moment another is selected or revealed; it is not final: tap it again and a verdict still moves it from skipped to right or wrong.
The counts come from the session.
While it runs:

    Counter      Four parts: left of hidden, right, wrong, skipped. In portrait, one line in the top left corner of the map, where boxes seldom reach, nothing to tap; in landscape, four lines in the top corner of the button column. Never over the middle of the map.
    Quiz bar     Replaces the bar: Correct, Wrong, Back, Home. The verdicts act on the selected box; Back and Home work as always, so a lost user can return without leaving the quiz. Notes is gone, so there is no cheating.
    Hidden box   Never balloons masked. First tap selects, second tap reveals and balloons; a double tap reveals rather than travels.
    Travel       Allowed; the quiz is graph-wide and follows, and so does a rotation (§5.4).
    Panes        The notes pane is unavailable during a quiz, as the chat is veiled on the desktop. The quiz pane stays reachable to end the session.

Ending the quiz restores the bar and the masks.

## 11. Architecture

### 11.1 Where it lives

    view.html             The page. A second Vite entry beside index.html.
    src/mobile/           Everything the viewer writes of its own: the startup script, the page's modules, the phone layout, the panes, the gestures, the quiz, the CSS.

The viewer is kept as independent of the editor as the shared directions allow, and as isolated from it as a second page can be.
Two rules, both strict.

Inward: nothing under src/ outside src/mobile/ imports from src/mobile/.
The editor cannot be affected by the viewer except through the build configuration, which gains an entry.

Outward: src/mobile/ imports only from the places listed here, and from no other.

    core/                 types
    config/               settings access and storage names
    storage/              the stores and the transfer functions
    styles/               themes, the style generator, the canvas paint
    events/               the event bus, if needed at all
    utils/                MathJax initialisation
    features/map-view/    the modules named in §11.2, and no other feature
    ui/panels/chat-panel/chat-message-renderer.ts   the one file from ui/, a pure renderer (§9)

No other feature, nothing else from ui/, nothing from ai/.
A later change to a module the viewer reuses breaks the viewer at type-check, visibly; that is the intended failure, and the only way the editor's work should ever reach the viewer.

Changing either rule, adding a module to the list, or taking a new dependency of any kind inside src/mobile/ is a change to this document first: flagged, discussed and agreed before any code imports it.
This is stated because it has gone wrong before: dependencies introduced by an agent without asking were found only when they broke the app.
A dependency that seems obviously harmless is still a change to this list.
`npm run deps` can check the two rules mechanically once the folder exists.

### 11.2 Reused as is

Called from src/mobile/ without modification:

    storage/workspace/envelope.ts            detectWorkspaceFormat, parseEnvelope, WorkspaceFormatError; workspace/legacy-zip.ts readLegacyZip
    storage/workspace/transfer.ts            clearAllData, importGraphData, importConversations, importThemes, importMapViews: install (§4.1)
    storage/graph-store.ts, map-store.ts, chat-store.ts, theme-store.ts, app-mode.ts   the stores, as the editor uses them
    features/map-view/map-tree.ts            buildMapTree: the walk; the viewer keeps depth 0 and 1 and drops the rest
    features/map-view/seeding.ts             ensureBearings: directions for edges that have none
    features/map-view/geometry.ts            the direction functions (resolveEnds, lineAngle, normalizeBearing, signedAngleBetween, bearingBetween) and the types MapLayout, Size, Position, EdgeEnds; not layoutMapTree
    features/map-view/render.ts              ensureBaseStyles, renderMap, addElements, removeElements, restyleBoxes, lineBases, lineWeights, restyleLines, updateBoxData, updateLineData
    features/map-view/refocus-animator.ts    planRefocus, depart, move, arrive, settle, staleLineIds
    features/map-view/preview.ts             MarkerPreview: the balloon
    features/map-view/history.ts             MapHistory
    features/map-view/default-design.ts      resolveDefaultDesign
    features/map-view/face-url.ts            through render.ts
    ui/panels/chat-panel/chat-message-renderer.ts   renderNote, renderAIMessage, typesetMath
    styles/chat-panel.css                    the look of notes and assistant text (§9); the editor's base message rules are inline in index.html and the viewer repeats those six lines
    styles/canvas-theme.ts, styles/themes, styles/style-generator.ts   through the modules above
    utils/mathjax.ts                         initializeMathJax
    core/                                    types

Not reused, and why:

    features/map-view/map-view.ts     The desktop conductor: its derive step has the desktop layout and the record's adjustments built in, and its public surface is shaped for the handoff. The viewer writes its own, smaller conductor over the same lower modules.
    ui/map-handoff.ts, features/transition   The scene canvas does not exist on the phone.
    storage/workspace.ts importWorkspace     Asks questions (§4.1).
    features/quiz.ts                         A feature other than map-view (§11.1). The viewer's quiz is its own, with the same behaviour (§10.2).
    ui/components/quiz-panel.ts              A floating desktop panel (§10.1).
    ui/panels/chat-panel/chat-panel.ts, ai/chat-session.ts   Assume a scene instance and write to the chat store.
    config settings for the map              Desktop layout values (§4.1).

### 11.3 A recorded exception

architecture.md §4.2 says features do not import each other and shared utilities do not import feature files.
The viewer imports the map view feature's internal modules directly, which is a cross-feature import by the letter of that rule.
It is permitted here because the viewer is not a feature of the editor; it is a second page that uses the editor's parts, and the rule exists to keep the editor's features independent of each other, which it still does.
The permission is this section and extends to nothing else.

### 11.4 The viewer's own modules

As built:

    src/mobile/viewer.ts               Startup: parameter, install or load, instance, panes, first map or the library pane alone, the bar's Back and Home, the resize, the page's theme colours and the theme-color tag.
    src/mobile/install.ts              §4.1: install from a URL or from a file, the remembered file, the index URL.
    src/mobile/library-pane.ts         §8: the status row, the index as a list, install on tap or from the picker.
    src/mobile/phone-row-layout.ts     §5.3 portrait. Pure: tree, directions, surface, sizes in; MapLayout out.
    src/mobile/phone-band-layout.ts    §5.3 landscape. Same inputs and output.
    src/mobile/line-crossings.ts       §5.5: where a line runs behind a box. Pure geometry over a layout's output.
    src/mobile/phone-map.ts            The conductor: show, travel, balloon, resize, history, the drag's pinning of the focus, the line fades and their travel (§5.5), the layout numbers; calls the shared modules.
    src/mobile/gestures.ts             Tap, double tap, swipe, with the §8 constraints.
    src/mobile/panes.ts                The strip of four panes.
    src/mobile/notes-pane.ts           §9.
    src/mobile/quiz.ts                 §10.2: the session, sampling, masking, grading; the viewer's own.
    src/mobile/quiz-pane.ts            §10.1 and the running quiz's bar and counter.
    src/mobile/viewer.css              The page, the panes, the bars in both orientations, the notes' theme overrides, the library list, the home-screen rules (§3).
    public/apple-touch-icon.png, public/viewer.webmanifest   The home-screen icon and manifest (§3).

A ring layout (phone-layout.ts: landmarks on an ellipse at their exact directions, size then distance then a bounded deviation against crowding) was the first portrait layout and the first landscape one; replaced by the rows on 2026-10-19 (§5.2) and deleted when the bands replaced it in landscape on 2026-10-20.

Coding standards as in architecture.md §7.

## 12. The site

Built 2026-10-22, in the site repo.
The site shows View in Knogra on a graph's page when the visitor is on a phone (below 1025px, where Open is hidden), pointing at `https://app.knogra.io/view.html?graph=<file url>`, and keeps Open for desktops.
Only the page, not the library card: the page is where the visitor decides, as with Open. A plain link, no script: the viewer installs the file itself.
The note under the link says the editor needs a large screen and the viewer is a companion tool, so a phone visitor does not take the viewer for the product.
The link is a cross-link, not a contract: the `?graph=` parameter and the allowlisted prefix are contract 1. The third contract is the index.

The index, the third site contract (built 2026-10-22: knogra-site/src/pages/graphs/index.json.ts, a build-time endpoint like the site's sitemap).
The site publishes `https://knogra.io/graphs/index.json`, built with the library page from `loadLibrary()` (knogra-site/src/lib/graph-library.ts), so a graph dropped into public/graphs/ appears in both without a second step.
Under /graphs/ because the site's CORS rule already covers that path and the viewer then knows one prefix for the index and the files.
One array, in the library page's order:

    file          The absolute URL of the workspace file, under the allowlisted prefix.
    title         As on the library page.
    nodeCount     For the line under the title.

The viewer reads only these fields and ignores others, so the site may add to the index without an app release.
Changing or removing one is an app release, as with the other two contracts (CLAUDE.md).
Topic and a one-line description were in the first draft and dropped on 2026-10-22: the pane chooses, the site informs.
The site's "no catalog file" rule stands: the index is generated from the folder, not maintained by hand.

## 13. Out of scope, deferred, open

Out of scope for this version, stated so it stays out:

    Editing of any kind. (A box may be dragged on the map, §8, but nothing of it is kept.)
    AI calls; API keys.
    Settings screens.
    Paths.
    The second ring of markers.
    Syncing anything back to a desktop.
    Fetching files from hosts other than knogra.io/graphs. (A file the user picks on the phone is not a fetch, §4.1.)

Deferred, with the reason:

    Hints of what lies beyond a landmark (marks on its outer edge on the directions of its own edges)   Try after the one-ring map is seen on a real phone; may not be needed.
    Installable web app with offline caching   Add to home screen is enough to start; a service worker is a release concern of its own.
    Files from any URL   Needs the viewer to be shown safe against a hostile file's notes (the renderer's HTML output is not audited for that), and needs the host to allow cross-origin fetches. The library path has neither problem, and the user's own file (§4.1) carries the desktop's trust.
    Several graphs on one phone   One graph, last installed, chosen on the library pane; several until someone asks.
    A personal library of the user's files   Wanted (2026-10-23) as remembered rows that reinstall the latest export without the picker. Not buildable on an iPhone: the file input gives bytes and a name, never a path or a reusable handle (Safari has no showOpenFilePicker, WebKit bug 231706 open), and no browser lists a folder. The two shapes that are buildable were declined: copies of the files in IndexedDB (a new store, old versions kept, no fresher than the last pick) and rows holding URLs (needs the user to upload somewhere with cross-origin fetches allowed, the manual step moved, not removed). Reopen if the desktop learns to save in place to a synced folder under a fixed name.
    A desktop View link that protects the desktop workspace   On a desktop the viewer's install would replace the editor's workspace in the same browser profile. The site shows View only on phones; a desktop user who opens view.html?graph= anyway replaces their workspace, which the editor's own import would also do after a question. Whether the viewer should ask is open.

Open after the phone passes:

    The layout rethink (parked 2026-10-22)   The portrait rules have been patched one case at a time and each patch opened another case: strange maps still appear, small boxes with room all round them. Agreed framing for the next attempt, nothing decided: the rules are mechanisms, not goals; the one principle is that the screen is used efficiently and a box shrinks only when there is not enough room to place it readable without overlap; two structural faults in the current rules (the scale is of the natural size, not of a readable pixel height; boxes are placed between the focus and other boxes); two regimes rather than one formula, an ample one where every box fits at readable size and composition can honour the directions, and a packed one where rows are the price and crossings follow; the band is set by pressure (demand at readable size against the screen), not by node count. First step proposed: count the crossings over the library's graphs with the §5.5 detector, to see how often the packed regime is real.
    The numbers in §5.3 and the arrow factor in §5.1, until the rethink.
    Whether the bar's words should become dim contour icons (same width, quieter; but Quiz, Notes and Map have no universal sign). Words kept for now, to see how intrusive they are in use.

Settled on the phone (2026-10-22): the root colour matches the bars by eye; the landscape side strips in the canvas colour (§3). Settled in emulation, recorded so they are not reopened without a reason: Reveal is a second tap, not a button; the balloon opens on reveal; landscape has its own layout (§5.3); the counter stays out of the middle of the map (§10.2).

## 14. Plan

Each step is verifiable on its own and leaves the editor untouched.
Steps 1 to 6 can be verified in Chrome's device emulation; step 7 needs a phone.
Steps 1 to 6 passed on 2026-10-19; the layouts, the bars and the quiz were then reworked in emulation on 2026-10-20 as described above. Step 7 is next, by deploying to production, since the viewer is a page nobody links to.

    1  Page and install    view.html, the Vite entry, viewer.ts with the parameter handling and install.ts. Pass: on a phone-sized viewport, opening view.html?graph=<library file> fetches the file, installs it, and the page prints the graph's title and node count; opening view.html afterwards prints the same without network.
    2  One-ring map        phone-layout.ts and phone-map.ts show the anchor's map, static. Pass: the focus at the centre, every neighbour on its stored direction, nothing overlapping, nothing outside the surface, faces drawn.
    3  Travel              Double tap re-focuses with the animation; Back and Home on a first bar. Pass: a round trip anchor → neighbour → back shows the neighbour in the same direction both ways and no element left behind.
    4  Balloon             The §7 rules. Pass: each line of the §7 table.
    5  Panes and notes     The three panes, the swipe with its two constraints, the bar buttons, the notes pane. Pass: swipe and buttons agree; a scroll in the notes pane never swipes; a note with a formula and an image renders.
    6  Quiz                The quiz pane and the running-quiz bar and counter. Pass: a quiz over a small graph can be started, walked across two maps, revealed and graded, and ended, and the masks go.
    7  Real phone          Safari on an iPhone: the layout numbers, the viewport (address bar, 100vh), add to home screen, orientation. Pass: a reviewed graph is usable for ten minutes without reaching for the desktop.

The site's View link (§12) was built on 2026-10-22 with version 2 (§15), passed on the phone the same day, and the user's own file followed on 2026-10-23. Still to come, as the public launch: a version, the site's feature text, a post on how to use it, and the architecture.md pointer.

## 15. Phone pass: findings and the next version

Collected from use on an iPhone from 2026-10-20 on, each with what was seen and what it implied at the time.
The three became version 2, agreed on 2026-10-21 and built on 2026-10-22; the sections above describe it. Kept as the record of why.

    Home screen       A home-screen web app on iOS keeps its own storage, separate from Safari's, and the icon saves the address without ?graph= because the viewer removes the parameter after installing (§3). Opened from the icon, the page finds no graph and shows the empty message. Implies: keep the parameter in the address; remember the installed file's URL on the phone (a new localStorage key, to be agreed on its own); on open with the same URL show the stored graph without network, with another install it. Refreshing a graph that changed on knogra.io becomes a question of its own.
    Catalogue         Typing a file address on a phone is not a way to choose a graph. The viewer should show the library's list and install the chosen graph, replacing or keeping the one stored. Implies: the site publishes a list the viewer can fetch (an index beside the graphs), a third item in the site contract (§12); and a decision on one graph or several on the phone (§13).
    Icon              The home-screen icon is a bare "K" from the page's title. Implies the home-screen metadata of §4.3: an apple-touch-icon in PNG (iOS does not take the SVGs the repo has; 180×180 from public/logo.svg), the app-capable and status-bar tags, a manifest with standalone display, and a theme colour set from the map's theme so Safari's own bar matches the viewer's bars.

Decided on 2026-10-21, against the alternatives: one graph on the phone, not several (install replaces, as before); the list with the title and the node count only, not topic and a line; the address kept clean rather than carrying the parameter; the index generated on the site from the same enumeration as the library page, not a hand-kept file, and under /graphs/ for the CORS rule already there.
Built 2026-10-22 in this order: icon and colour, the site's index and View link, the remembered file and the library pane. Seen on the phone the same day and judged to work well; §3 records what the inspector showed on the way (the bar colour, the short viewport) and what the pass found (the side strips, the first-travel notch), §5.3 and §5.5 what it found on the map (the arrowheads on the near row, the lines behind boxes).
The fourth finding, after a few days' use: the author's own graph, built on the desktop and not in the library, had no way onto the phone. The file picker (§4.1, 2026-10-23) is the answer; a personal library that reinstalls the latest export was wanted and found unbuildable (§13).
