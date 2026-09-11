/**
 * Shelf Context Menu
 *
 * Builds the right-click menu for a shelf item. Owns the menu DOM only; what each
 * command does is supplied by the caller, because every shelf command has to pass
 * through the interaction guard in `panel-api.ts`.
 */

import { isEditMode } from '../../storage/app-mode';

export interface ShelfMenuActions {
  onAdd: (index: number) => void;
  onRemoveHere: (index: number) => void;
  onRemoveEverywhere: (index: number) => void;
  onClearShelf: () => void;
}

const MENU_STYLE = `
  position: fixed;
  background: var(--bg-secondary, #161b22);
  border: 1px solid var(--border-primary, #30363d);
  border-radius: 6px;
  padding: 4px;
  z-index: 1000;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
`;

const ITEM_STYLE = `
  padding: 8px 12px;
  border-radius: 4px;
  color: var(--text-primary, #e6edf3);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
`;

let openMenu: HTMLElement | null = null;

export function closeShelfContextMenu(): void {
  openMenu?.remove();
  openMenu = null;
}

/**
 * Show the menu for one shelf item. "Add to scene" repeats what clicking the item
 * already does, because that affordance is invisible; it is offered only in edit
 * mode, where placement is allowed.
 */
export function showShelfContextMenu(
  index: number,
  x: number,
  y: number,
  actions: ShelfMenuActions
): void {
  closeShelfContextMenu();

  const menu = document.createElement('div');
  menu.className = 'shelf-context-menu';
  menu.style.cssText = `${MENU_STYLE} left: ${x}px; top: ${y}px;`;

  const commands: { label: string; run: () => void }[] = [];
  if (isEditMode()) {
    commands.push({ label: 'Add to scene', run: () => actions.onAdd(index) });
  }
  commands.push(
    { label: 'Remove from this shelf', run: () => actions.onRemoveHere(index) },
    { label: 'Remove from all shelves', run: () => actions.onRemoveEverywhere(index) },
    { label: 'Clear this shelf', run: () => actions.onClearShelf() }
  );

  for (const command of commands) {
    menu.appendChild(createMenuItem(command.label, command.run));
  }

  document.body.appendChild(menu);
  openMenu = menu;

  const rect = menu.getBoundingClientRect();
  if (rect.bottom > window.innerHeight) menu.style.top = `${y - rect.height}px`;
  if (rect.right > window.innerWidth) menu.style.left = `${x - rect.width}px`;
}

function createMenuItem(label: string, run: () => void): HTMLElement {
  const item = document.createElement('div');
  item.textContent = label;
  item.style.cssText = ITEM_STYLE;
  item.onmouseenter = () => { item.style.backgroundColor = 'var(--bg-tertiary, #1c2128)'; };
  item.onmouseleave = () => { item.style.backgroundColor = 'transparent'; };
  item.addEventListener('click', (event) => {
    event.stopPropagation();
    closeShelfContextMenu();
    run();
  });
  return item;
}
