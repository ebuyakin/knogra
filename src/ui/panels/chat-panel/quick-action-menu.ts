/**
 * Quick Action Menu
 *
 * The relationship picker that opens from the Suggest and Connect buttons: three
 * direction rows, each with a submenu of relationship types.
 *
 * Deliberately not the Cytoscape context menu (`src/ui/context-menu/`). That one
 * is owned by the graph surface, positions inside the Cytoscape container, and
 * carries submenu-cascade logic for a three-level tree. This is a two-level menu
 * anchored to a button in a panel; sharing would mean bending one to the other.
 *
 * Opens on hover after a delay, above the button so it never covers what you are
 * about to click.
 */

import type { RelationshipSlot } from '../../../ai/types';
import type { SlotGroup } from '../../../ai/relationship-slot';
import '../../../styles/quick-action-menu.css';

/** Long enough that a pointer crossing the quick-action row does not open it. */
const OPEN_DELAY_MS = 220;
const CLOSE_DELAY_MS = 260;
const EDGE_MARGIN_PX = 8;

let openMenu: HTMLDivElement | null = null;
let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Wire a button once. The groups are read at open time because they depend on the
 * central node and on the workspace's edge types, both of which change.
 */
export function attachQuickActionMenu(
  anchor: HTMLElement,
  getGroups: () => SlotGroup[],
  onPick: (slot: RelationshipSlot) => void
): void {
  anchor.addEventListener('mouseenter', () => {
    cancelClose();
    openTimer = setTimeout(() => showMenu(anchor, getGroups(), onPick), OPEN_DELAY_MS);
  });

  anchor.addEventListener('mouseleave', () => {
    cancelOpen();
    scheduleClose();
  });

  // A plain click sends the unconstrained request, so the menu must get out of the way.
  anchor.addEventListener('click', () => {
    cancelOpen();
    closeQuickActionMenu();
  });
}

export function closeQuickActionMenu(): void {
  cancelOpen();
  cancelClose();
  openMenu?.remove();
  openMenu = null;
  document.removeEventListener('click', handleOutsideClick, true);
  document.removeEventListener('keydown', handleKeydown, true);
}

// ============================================================================
// RENDERING
// ============================================================================

function showMenu(anchor: HTMLElement, groups: SlotGroup[], onPick: (slot: RelationshipSlot) => void): void {
  closeQuickActionMenu();

  const menu = document.createElement('div');
  menu.className = 'qa-menu';

  for (const group of groups) {
    menu.appendChild(createGroupRow(group, onPick));
  }

  menu.addEventListener('mouseenter', cancelClose);
  menu.addEventListener('mouseleave', scheduleClose);

  document.body.appendChild(menu);
  positionAbove(menu, anchor);
  openMenu = menu;

  document.addEventListener('click', handleOutsideClick, true);
  document.addEventListener('keydown', handleKeydown, true);
}

function createGroupRow(group: SlotGroup, onPick: (slot: RelationshipSlot) => void): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'qa-menu-row';

  const label = document.createElement('span');
  label.textContent = group.label;
  row.appendChild(label);

  row.addEventListener('click', () => {
    onPick(group.slot);
    closeQuickActionMenu();
  });

  if (group.options.length === 0) return row;

  row.classList.add('qa-menu-row--parent');

  const arrow = document.createElement('span');
  arrow.className = 'qa-menu-arrow';
  arrow.textContent = '◀';
  row.appendChild(arrow);

  const submenu = document.createElement('div');
  submenu.className = 'qa-submenu';

  for (const option of group.options) {
    const item = document.createElement('div');
    item.className = 'qa-menu-row';
    item.textContent = option.label;
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      onPick(option.slot);
      closeQuickActionMenu();
    });
    submenu.appendChild(item);
  }

  row.appendChild(submenu);
  return row;
}

/** Above the button, and never past the left edge; the panel is docked right. */
function positionAbove(menu: HTMLDivElement, anchor: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  const left = Math.min(
    Math.max(EDGE_MARGIN_PX, anchorRect.left),
    window.innerWidth - menuRect.width - EDGE_MARGIN_PX
  );
  const top = Math.max(EDGE_MARGIN_PX, anchorRect.top - menuRect.height - 6);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

// ============================================================================
// LIFECYCLE
// ============================================================================

function handleOutsideClick(event: MouseEvent): void {
  if (openMenu && !openMenu.contains(event.target as Node)) {
    closeQuickActionMenu();
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeQuickActionMenu();
}

function cancelOpen(): void {
  if (openTimer) clearTimeout(openTimer);
  openTimer = null;
}

function cancelClose(): void {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
}

function scheduleClose(): void {
  cancelClose();
  closeTimer = setTimeout(closeQuickActionMenu, CLOSE_DELAY_MS);
}
