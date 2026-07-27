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
      { key: 'Ctrl+E', description: 'Save and close editor' },
      { key: 'A', description: 'Add child node' },
      { key: 'Shift+A', description: 'Add parent node' },
      { key: 'L', description: 'Add edge (link) — click target node' },
      { key: 'Shift+L', description: 'Add edge repeatedly from the selected node' },
      { key: 'D / Del', description: 'Delete selected node or edge' },
      { key: 'S', description: 'Add incident edges to scene' },
      { key: 'Shift+S', description: 'Add scene-only graph edges' },
      { key: 'M', description: 'Open node manager' },
      { key: 'V', description: 'Enable / disable edit mode' },
    ]
  },
  {
    title: 'Scene: Navigation',
    shortcuts: [
      { key: 'G', description: 'Go to scene (selected node)' },
      { key: 'Shift+G', description: 'Go to scene (fade, no animation)' },
      { key: 'I', description: 'Show link to anchor for selected node' },
      { key: '[ / ]', description: 'Navigate back / forward in history or path' },
      { key: 'Arrows', description: 'Navigate between nodes' },
      { key: 'Escape', description: 'Deselect all' },
      { key: 'F', description: 'Fit graph to view' },
      { key: 'Shift+F', description: 'Fit to background image' },
      { key: '+ / − / 0', description: 'Zoom in / out / reset zoom and pan (current scene)' },
      { key: 'Shift +/−/0', description: 'Zoom all scenes in / out / reset to current' },
      { key: 'H', description: 'Toggle hidden connection badges' },
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
      { key: 'C / J / P', description: 'Include neighbours (all, children, parents)' },
      { key: 'Shift+C', description: 'Exclude neighbours (private branches) from scene' },
      { key: 'Shift+J', description: 'Exclude descendants from scene' },
      { key: 'X', description: 'Exclude selected node or edge from scene' },
      { key: 'Z', description: 'Toggle fold / unfold' },
      { key: 'O / Shift+O', description: 'Rotate scene clockwise / counter-clockwise' },
      { key: 'W / Shift+W', description: 'Spread / tighten scene spacing around central node' },
      { key: 'T / U / Y', description: 'Align selected nodes into a row / column / diagonal' },
    ]
  },
  {
    title: 'Chat / Misc',
    shortcuts: [
      { key: '`', description: 'Focus chat input' },
      { key: 'Escape', description: 'Unfocus chat input' },
      { key: 'Ctrl+,', description: 'Open settings' },
      { key: 'F1', description: 'Show this shortcut reference' },
    ]
  },
  {
    title: 'Scene: Edges (Bezier)',
    shortcuts: [
      { key: 'J / K', description: 'Bend selected edge clockwise / counterclockwise' },
      { key: 'Shift J / K', description: 'Bend selected edge with large steps' },
      { key: 'H / L', description: 'Move bending point toward edge target / source' },
      { key: 'Shift H / L', description: 'Move bending point with large steps' },
      { key: 'R', description: 'Restore edge standard style' },
    ]
  }
];
