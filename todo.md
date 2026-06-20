# TODO

# Release of version 1
- [x] Public release of v1
- [x] Registration and launch on TAIFT site

# Version 1.1 
- [x] Review project documentation.
- [x] Mermaid diagrams import/export
- [x] LaTeX equation generator for nodes
- [x] Edge types styling. Edge editor upgrade.

# deferred to V1.3
- [~] additional node designs (duplicating defaults but with different color scheme for each theme) - deferred. not sure it's a good idea.
- [~] default node design (based on previous design used, not on parent) - defer.
- [~] mermaid import with equations. deferred
- [~] shortcut for the contextual menu
- [~] Edges settings section in the settings overlay. what's left?
- [~] keyboard control of layout management (node movements with shortcuts)
- [~] keyboard control of edges selection (shortcuts) and navigation between them
- [~] morphing trajectory (separate motion from zooming)
    
# V1.1 bugs and extra features
- [x] Import dialog (in mermaid import) located in the center of the screen, shall be located in the center of the cytoscape pane / viewport, like all other dialogs.
- [x] image is not loaded
- [x] large graphs blocks loading
- [x] if node title is not suitable for equation generation
- [x] console error messages (telemetry in production)
- [x] AI chat context based on scene content and scene relationships.
- [x] pasting style to multiple edges (discuss, probably not doable)
- [x] include all edges of all nodes in the scene.
- [x] Optimize context menu structure and order of items.
- [x] Delete nodes procedure doesn't work (creates data errors) (High impact!)
- [x] edge type manager - more compact design, less prominent dropdowns
- [x] edge visibility - the same changes as edge type manager
- [x] edge editor - title/heading size and padding. 'override style - allignment with type. headings and controls alignment, more spacious and more pleasant look. alignment and dragability.
- [x] Theme editor - color scheme is different from others
- [x] stronger dimming of edge types (1/4 rather than 1/2 of the normal - or both)
- [x] update F1 with new key bindings.
- [x] clockwise/counterclockwise - swap
- [x] customize button-linked messages (Scene, Node, Suggest, Connect) in settings
- [x] Fine tune edges style for different themes
- [x] Shortcuts for edges bending
- [x] Mermaid import layout ordering refinement and extraction
- [x] ordering of the nodes on import from mermaid
- [x] ai request on the selected node.. 'Scene' and 'Node' commands/prompts
- [x] node path to the anchor scene.
- [x] when adding/replacing equation - switch design to equation node by default
- [x] special code in equation that causes an error.
- [~] edge type modifications are not applied immediately on save.
- [x] Enter on equation generation.
- [x] distance to the anchor in the node manager
- [x] graph statistics report

- [x] node spacing in mermaid import. increase min radius (but keep min interval)
- [x] Exposing nodes aspect ratio, width controls in node editor
- [x] Uniqueness of node titles

- [x] exclude edge from the scene shortcut
- [x] delete edge shortcut
- [ ] Quizzes. Big one.
- [ ] z-index of the nodes/edges


