/**
 * Shortcut Definitions
 * Single source of truth for all keyboard shortcuts.
 * Used by ShortcutOverlay (F1) and potentially tutorial generation.
 */

export interface ShortcutEntry {
  key: string;
  description: string;
}

export interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutEntry[];
}

export const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Graph',
    shortcuts: [
      { key: 'E', description: 'Edit selected node' },
      { key: 'F2', description: 'Rename selected node (Tab for full editor)' },
      { key: 'Ctrl+E', description: 'Save and close editor' },
      { key: 'A', description: 'Add child node' },
      { key: 'Shift+A', description: 'Add parent node' },
      { key: 'I', description: 'Add edge (link) — click target node' },
      { key: 'Shift+I', description: 'Add edge repeatedly from the selected node' },
      { key: 'D / Del', description: 'Delete selected node or edge' },
      { key: 'S', description: 'Add incident edges to scene' },
      { key: 'Shift+S', description: 'Add scene-only graph edges' },
      { key: 'M', description: 'Open node manager' },
      { key: 'Double tap', description: 'On empty canvas — add a node there' },
    ]
  },
  {
    title: 'Scene: Navigation',
    shortcuts: [
      { key: 'G / Shift+G', description: 'Go to scene (with or without animation)' },
      { key: '[ / ]', description: 'Navigate back / forward in history or path' },
      { key: 'HJKL', description: 'Navigate between nodes (or use Arrow keys)' },
      { key: 'Shift+HJKL', description: 'Navigate and centre the view on the selected node' },
      { key: 'N', description: 'Reset zoom and centre on the selected node' },
      { key: 'Escape', description: 'Deselect all' },
      { key: 'F / Shift+F', description: 'Fit scene to view (or to background image)' },
      { key: '+ / − / 0', description: 'Zoom in / out / reset zoom and pan (current scene)' },
      { key: 'Shift +/−/0', description: 'Zoom all scenes in / out / reset to current' },
    ]
  },
  {
    title: 'Workspace',
    shortcuts: [
      { key: 'Ctrl+S', description: 'Export workspace' },
      { key: 'Ctrl+O', description: 'Import workspace' },
      { key: 'Ctrl+N', description: 'New workspace' },
    ]
  },
  {
    title: 'Scene: Editing',
    shortcuts: [
      { key: 'C / R / P', description: 'Include neighbours (all, children, parents)' },
      { key: 'Shift+C', description: 'Exclude neighbours (private branches) from scene' },
      { key: 'Shift+R', description: 'Exclude descendants from scene' },
      { key: 'X', description: 'Exclude selected node or edge from scene' },
      { key: 'Z', description: 'Toggle fold / unfold' },
      { key: 'Shift+Z', description: 'Unfold all folded nodes (one tier)' },
      { key: 'O / Shift+O', description: 'Rotate scene clockwise / counter-clockwise' },
      { key: 'W / Shift+W', description: 'Enlarge / shrink the nodes of the scene (positions stay put)' },
      { key: 'T / U / Y', description: 'Align selected nodes into a row / column / diagonal' },
      { key: 'Shift+T / U / Y', description: 'Distribute selected nodes with even gaps (horizontal / vertical / diagonal)' },
      { key: 'Shift+Q', description: 'Arrange selected nodes on a circle' },
      { key: ', / .', description: 'Tighten / spread the selected nodes (distance, not size)' },
    ]
  },
  {
    title: 'Chat',
    shortcuts: [
      { key: '`', description: 'Focus chat input' },
      { key: 'Escape', description: 'Unfocus chat input' },
    ]
  },
  {
    title: 'Scene: Edges (Bezier) — with an edge selected',
    shortcuts: [
      { key: 'J / K', description: 'Bend selected edge clockwise / counterclockwise' },
      { key: 'Shift J / K', description: 'Bend selected edge with large steps' },
      { key: 'H / L', description: 'Move bending point toward edge target / source' },
      { key: 'Shift H / L', description: 'Move bending point with large steps' },
      { key: 'R', description: 'Restore edge standard style' },
    ]
  },
  {
    title: 'Misc',
    shortcuts: [
      { key: 'V', description: 'Enable / disable edit mode' },
      { key: 'B', description: 'Toggle hidden connection badges' },
      { key: 'Shift+B', description: 'Toggle link to anchor for selected node' },
      { key: 'Ctrl+,', description: 'Open settings' },
      { key: 'F1', description: 'Show this shortcut reference' },
    ]
  }
];
