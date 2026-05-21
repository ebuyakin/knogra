# Landing Page ↔ App Interaction Spec

User-facing scenarios and expected behavior. Technical rules are derived from these — not the other way around.

---

## Actors and surfaces

- **Landing page** (`/`) — the marketing/catalog page
- **App** (`/app/`) — the editor
- **Catalog modal** — the "Open?" confirmation that may appear on the landing page before navigating to the app
- **Import dialog** — the existing in-app dialog that handles "replace current workspace?" with an "export first" checkbox

---

## Scenarios

### A. First-time user, opens app directly

The user has never visited the app before. They go to `/app/` directly (bookmark, or clicked "Launch App" on the landing page).

**What they see:** The app opens with a single empty node ("New Idea") in the center. No dialogs, no prompts. Ready to use.

---

### B. First-time user, opens a graph from the catalog

The user has never used the app. They go to the landing page, see the Library, and click **Open** on a graph card — for example the tutorial.

**What they see:** Nothing happens on the landing page. The app opens and immediately loads the chosen graph — no dialogs, no prompts. They land in the graph they clicked, ready to explore.

---

### C. Returning user, opens app directly

The user has a workspace they've been building. They navigate to `/app/` (bookmark, reload, "Launch App").

**What they see:** Their workspace opens exactly where they left off — same scene, no dialogs.

---

### D. Returning user, opens a graph from the catalog — declines replacement

The user has a real workspace. They go to the landing page and click **Open** on a catalog card.

**What they see:** A dialog appears on the landing page *before* leaving it. The dialog explains that their current workspace will be replaced and offers:
- **Download** — saves the chosen graph as a file without doing anything else. The user stays on the landing page with their workspace intact.
- **Cancel** — closes the dialog. Nothing changes.
- **Proceed** — navigates to the app.

If the user clicks **Download** or **Cancel**, nothing happens to their workspace.

---

### E. Returning user, opens a graph from the catalog — accepts replacement

Continuing from D: the user clicks **Proceed**.

**What they see:** The app opens and loads their current workspace as normal. Then the standard Import dialog appears on top of it — the same dialog they'd see if they used File → Import inside the app. It shows their current workspace is about to be replaced, offers an "Export first" checkbox, and has Import and Cancel buttons.

From here the behavior is identical to a normal in-app import: they can export first, import directly, or cancel.

---

### F. Returning user, downloads a graph from the catalog

The user has a workspace and wants to save a catalog graph to their computer to use later (or share), without opening it now.

**What they see:** After the catalog modal appears (scenario D), they click **Download**. The browser's save dialog opens. The `.knogra` file is saved to their computer. The modal closes. They stay on the landing page with their workspace untouched.

---

### G. User opens the app in two tabs

Whether by accident or intentionally, the user opens `/app/` in a second browser tab.

**What they see:** The app loads normally in both tabs, but a yellow warning banner appears at the top of the second tab: *"Knogra is already open in another tab. Using multiple tabs simultaneously may cause data loss."* with a Dismiss button. The app remains fully functional.

---

## What should NOT happen (anti-scenarios)

- **A/B first-time user should never see any dialog.** If the app or the catalog triggers an "Import Workspace" dialog on a user who has no data, that is a bug.
- **C returning user should never see any dialog** just from opening the app. Dialogs only appear if the user explicitly initiates an import action.
- **D/E the catalog dialog should appear on the landing page, not after the app loads with a blank canvas.** The blank-canvas dialog is the current broken behavior.
- **Workspace data should never be replaced without the user explicitly confirming.** Silent replacement on any path is a data-loss bug.

---

## Open design question

In scenario B, the user clicks Open and the app immediately loads the graph with no confirmation at all. This is the desired behavior (no friction, nothing to lose). But should there be a brief visual confirmation that the import happened? For example a toast notification: *"Tutorial loaded — 26 nodes."* Optional polish for later.

---

## Implementation status

| Scenario | Status | Notes |
|---|---|---|
| A | ✅ Working | Cold-start seed added |
| B | ❌ Broken | In-app import dialog appears; should be silent |
| C | ✅ Working | |
| D | ✅ Working | Landing modal implemented |
| E | ✅ Working | In-app import dialog appears over loaded workspace |
| F | ✅ Working | Download implemented in landing modal |
| G | ✅ Working | Tab-guard banner implemented |

