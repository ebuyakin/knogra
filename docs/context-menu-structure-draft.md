# Context Menu Structure Draft

> **Status:** Temporary working draft  
> **Last updated:** 2026-06-21  
> **Purpose:** Shared draft for iterating on Node, Edge, and Canvas context menu organization before implementation.

## Design Principles

- Keep object-specific actions on the object's menu.
- Keep scene-wide actions on the canvas menu.
- Duplicate commands only when duplication improves recovery or discoverability.
- Use Knogra's project verbs consistently:
  - **Add** creates a new graph object.
  - **Include** brings an existing graph object into the current scene.
  - **Exclude** removes an object from the current scene only.
  - **Delete** removes an object from the graph/database.
  - **Edit** changes the current object or scene property.
  - **Manage** opens a broader management surface.

## Node Context Menu

Node menu subject: the clicked node.

```text
Go to node scene
Edit node
Fold / Unfold
Copy style
Paste style
Scene
  Include all node edges (S)
  -----------------
  Include neighbors
  Include children
  Include parents
  -----------------
  Exclude descendants
  Exclude node + descendants
Graph
  Add child
  Add parent
  -----------------
  Delete node
  Set as anchor
  -----------------
  Add edge (L)
  Add multiple edges (Shift+L)
```

### Node Notes

- Keep `Include all edges` on the node menu because it operates on the clicked node.
- Do not add `Include all scene edges` here; that command is scene-wide and belongs on the canvas menu.
- `Add edge` and `Add edges` can remain top-level even though they create graph relationships, because they are frequent direct-manipulation actions from a specific node.
- `Add child` and `Add parent` can stay under `Graph` because they create graph nodes and relationships.

## Edge Context Menu

Edge menu subject: the clicked edge.

```text
Edit
Exclude from scene
---------------
Copy style
Paste style
----------------
Edges visibility
Manage edge types
----------------
Delete edge
```

### Edge Notes

- Keep this menu mostly flat while it remains short.
- Keep `Edges visibility` here as a convenience for users already thinking about edges.
- Keep `Manage edge types` here because edge-type management is discoverable from an edge.
- `Delete edge` should be explicit; plain `Delete` is less clear than node menu naming.
- If the menu grows later, style actions could move into a `Style` submenu.

## Canvas Context Menu

Canvas menu subject: the current scene, view, or workspace.

```text
Add node here
Manage nodes
Scene
  Edges visibility
  Include all scene edges
  Edit theme
  Edit background
Zoom
  Fit graph
  Fit to background
Enable edit / Disable edit
Workspace
  New
  Import
  Export
  Mermaid import
  Mermaid export
Settings
```

### Canvas Notes

- This menu needs the most cleanup because it currently mixes scene editing, view commands, workspace operations, and app settings at the top level.
- Keep `Edges visibility` on the canvas menu because users need a recovery path after hiding all edges.
- Keep `Include all scene edges` on the canvas menu because it operates on all currently included scene nodes.
- Consider keeping `Manage nodes` top-level because it is a major management surface and has shortcut `M`.
- Keep workspace import/export grouped under `Workspace`.
- Keep settings top-level unless the menu still feels too long after grouping.

## Naming Candidates

Current or proposed labels to revisit during polish:

| Current label | Candidate label | Notes |
|---|---|---|
| Add free node | Add node | Shorter; canvas position already implies free placement. |
| Edit Edge | Edit | Edge menu context already supplies the object. |
| Delete | Delete edge | Avoid ambiguity. |
| Edit image | Edit background | Matches scene/background terminology. |
| Fit graph (F) | Fit graph | Shortcut display can be handled consistently later. |
| Fit to image (Shift+F) | Fit to background | Matches background terminology. |
| Include all edges | Include all edges | Acceptable for now; later candidates include `Include node edges` or `Include connected edges`. |
| Include all scene edges | Include all scene edges | Acceptable for now; later candidate: `Include scene edges`. |

## Open Questions

- Should `Mode` be a submenu, or should `Enable edit / Disable edit` remain top-level?
- Should `Settings` remain top-level, or move under `Workspace` / `App`?
- Should `Manage edge types` also appear on the canvas menu under `Scene`, or only on edge menus and other edge-type UI surfaces?
- Should shortcut hints be shown in context menus now, or deferred until the F1 shortcut audit?