/**
 * Shortcut Definitions
 * Single source of truth for all keyboard shortcuts.
 * Used by ShortcutOverlay (F1) and potentially tutorial generation.
 *
 * Keep descriptions to ~40 characters: the F1 overlay lays the categories out
 * in balanced columns, and a description that wraps costs a whole extra row.
 */

export interface ShortcutEntry {
  key: string;
  description: string;
}

export interface ShortcutCategory {
  title: string;
  /**
   * Which F1 overlay column this category is laid out in. Declared rather than
   * balanced automatically so related categories stay side by side; categories
   * appear within a column in declaration order.
   */
  column: 1 | 2 | 3;
  shortcuts: ShortcutEntry[];
}

export const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Graph',
    column: 1,
    shortcuts: [
      { key: 'E', description: 'Edit selected node' },
      { key: '; / F2', description: 'Rename node (Tab for full editor)' },
      { key: 'Ctrl+E', description: 'Save and close editor' },
      { key: 'A', description: 'Add child node' },
      { key: 'Shift+A', description: 'Add parent node' },
      { key: 'I', description: 'Add edge — click the target node' },
      { key: 'Shift+I', description: 'Add edges repeatedly from the node' },
      { key: 'D / Del', description: 'Delete selected node or edge' },
      { key: 'S', description: 'Add incident edges to scene' },
      { key: 'Shift+S', description: 'Add edges between nodes in scene' },
      { key: 'M', description: 'Open node manager' },
      { key: 'Double tap', description: 'Add node on empty canvas' },
    ]
  },
  {
    title: 'Scene: Navigation',
    column: 2,
    shortcuts: [
      { key: 'G / Shift+G', description: 'Go to scene (with / without animation)' },
      { key: '[ / ]', description: 'Back / forward in history or path' },
      { key: 'HJKL', description: 'Navigate between nodes (or Arrows)' },
      { key: 'Shift+HJKL', description: 'Navigate and centre on the node' },
      { key: 'N', description: 'Reset zoom, centre on selected node' },
      { key: 'Escape', description: 'Deselect all' },
      { key: 'F / Shift+F', description: 'Fit scene to view / to image' },
      { key: '+ / − / 0', description: 'Zoom in / out / reset (current scene)' },
      { key: 'Shift +/−/0', description: 'Zoom in / out / reset (all scenes)' },
    ]
  },
  {
    title: 'Scene: Editing',
    column: 3,
    shortcuts: [
      { key: 'C / R / P', description: 'Include neighbours / children / parents' },
      { key: 'Shift+C', description: 'Exclude neighbours (private branches)' },
      { key: 'Shift+R', description: 'Exclude descendants' },
      { key: 'X', description: 'Exclude node or edge from scene' },
      { key: 'Z', description: 'Toggle fold / unfold' },
      { key: 'Shift+Z', description: 'Unfold all folded nodes (one tier)' },
      { key: 'Q', description: 'Auto-layout the scene' },
      { key: '1 – 4', description: 'Grow by N degrees, then auto-layout' },
      { key: 'O / Shift+O', description: 'Rotate cw / ccw (selection or scene)' },
      { key: 'W / Shift+W', description: 'Enlarge / shrink nodes (positions stay)' },
      { key: '> / <', description: 'Enlarge / shrink selected nodes only' },
      { key: 'T / U / Y', description: 'Align row / column / diagonal' },
      { key: 'Shift+T/U/Y', description: 'Distribute row / column / diagonal' },
      { key: 'Shift+Q', description: 'Arrange selection on a circle' },
      { key: ', / .', description: 'Tighten / spread selection (distance)' },
    ]
  },
  {
    title: 'Workspace',
    column: 3,
    shortcuts: [
      { key: 'Ctrl+S', description: 'Save workspace to file' },
      { key: 'Ctrl+O', description: 'Open workspace from file' },
      { key: 'Ctrl+N', description: 'New workspace' },
    ]
  },
  {
    title: 'Chat',
    column: 1,
    shortcuts: [
      { key: '`', description: 'Focus chat input' },
      { key: 'Escape', description: 'Unfocus chat input' },
    ]
  },
  {
    title: 'Edges — with an edge selected',
    column: 2,
    shortcuts: [
      { key: 'J / K', description: 'Bend edge clockwise / anticlockwise' },
      { key: 'Shift+J / K', description: 'Bend with large steps' },
      { key: 'H / L', description: 'Move bend toward target / source' },
      { key: 'Shift+H / L', description: 'Move bend with large steps' },
      { key: 'R', description: 'Restore standard edge style' },
    ]
  },
  {
    title: 'Misc',
    column: 1,
    shortcuts: [
      { key: 'V', description: 'Enable / disable edit mode' },
      { key: 'B', description: 'Toggle hidden connection badges' },
      { key: 'Shift+B', description: 'Toggle link to anchor' },
      { key: 'Ctrl+,', description: 'Open settings' },
      { key: 'F1', description: 'Show this reference' },
    ]
  }
];
