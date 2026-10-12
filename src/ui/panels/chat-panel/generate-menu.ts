/**
 * Generate menu
 *
 * The rows above the note editor's Generate button: Run, Draft, Configure
 * (docs/ai/chat-image-generation.md §2). Opens on hover after a delay, as the
 * relationship picker on Suggest and Connect does, or at once on click; closes
 * on a pick, when the pointer leaves it, on an outside click or Escape. Items
 * are given in order of use, and the menu stacks them upward so the first is
 * nearest the button. A disabled row is greyed and carries a title saying what
 * would enable it.
 *
 * Its own small module, like quick-action-menu.ts, and for the same reason not
 * the Cytoscape context menu: that one belongs to the graph surface. Not shared
 * with the picker either; the picker is a working component this feature
 * leaves alone.
 */

export interface GenerateMenuItem {
  label: string;
  action: () => void;
  enabled: boolean;
  /** Shown on a disabled row; says what would enable it. */
  title?: string;
}

/** Long enough that a pointer crossing the toolbar does not open it. */
const OPEN_DELAY_MS = 220;
const CLOSE_DELAY_MS = 260;
const EDGE_MARGIN_PX = 8;
const GAP_ABOVE_ANCHOR_PX = 6;

let openMenu: HTMLDivElement | null = null;
let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Wire a button once. The items are read at open time because their enabled
 * state depends on settings that change.
 */
export function attachGenerateMenu(anchor: HTMLElement, getItems: () => GenerateMenuItem[]): void {
  anchor.addEventListener('mouseenter', () => {
    cancelClose();
    openTimer = setTimeout(() => showMenu(anchor, getItems()), OPEN_DELAY_MS);
  });

  anchor.addEventListener('mouseleave', () => {
    cancelOpen();
    scheduleClose();
  });

  anchor.addEventListener('click', () => {
    cancelOpen();
    showMenu(anchor, getItems());
  });
}

export function closeGenerateMenu(): void {
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

function showMenu(anchor: HTMLElement, items: GenerateMenuItem[]): void {
  closeGenerateMenu();

  const menu = document.createElement('div');
  menu.className = 'generate-menu';
  for (const item of items) {
    menu.appendChild(createRow(item));
  }

  menu.addEventListener('mouseenter', cancelClose);
  menu.addEventListener('mouseleave', scheduleClose);

  document.body.appendChild(menu);
  positionAbove(menu, anchor);
  openMenu = menu;

  document.addEventListener('click', handleOutsideClick, true);
  document.addEventListener('keydown', handleKeydown, true);
}

function createRow(item: GenerateMenuItem): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'generate-menu-row';
  row.textContent = item.label;

  if (!item.enabled) {
    row.classList.add('generate-menu-row--disabled');
    if (item.title) row.title = item.title;
    return row;
  }

  // Keep the textarea focused: the editor saves on blur, and the picked action
  // reads the textarea.
  row.addEventListener('mousedown', (event) => event.preventDefault());
  row.addEventListener('click', (event) => {
    event.stopPropagation();
    closeGenerateMenu();
    item.action();
  });
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
  const top = Math.max(EDGE_MARGIN_PX, anchorRect.top - menuRect.height - GAP_ABOVE_ANCHOR_PX);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

// ============================================================================
// LIFECYCLE
// ============================================================================

function handleOutsideClick(event: MouseEvent): void {
  if (openMenu && !openMenu.contains(event.target as Node)) {
    closeGenerateMenu();
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeGenerateMenu();
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
  closeTimer = setTimeout(closeGenerateMenu, CLOSE_DELAY_MS);
}
