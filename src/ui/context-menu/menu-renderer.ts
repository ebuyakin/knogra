/**
 * Menu renderer — generic DOM rendering for context menus.
 * Knows nothing about graph semantics: takes MenuItem trees, renders them
 * into the given container, handles positioning, submenu hover behavior,
 * and closing. The single open menu is tracked here.
 */

export interface MenuItem {
  label: string;
  action?: () => void;
  enabled?: boolean;
  children?: MenuItem[];  // For sub-menus
  separator?: boolean;    // Render a visual divider instead of an item
  header?: boolean;       // Render `label` as a non-interactive group caption
}

export interface MenuPosition {
  x: number;
  y: number;
}

/** Matches the submenu `min-width` set below; used to budget cascade space. */
const SUBMENU_MIN_WIDTH = 200;

/**
 * How many submenu levels the chosen direction must accommodate. The deepest
 * menu is the node menu's Scene › Include › item, so three submenu levels can
 * sit beside the root.
 */
const SUBMENU_CASCADE_DEPTH = 3;

type SubmenuDirection = 'right' | 'left';

export class MenuRenderer {
  #container: HTMLElement;
  #menuElement: HTMLDivElement | null = null;
  /**
   * Chosen once per opening and applied to every level, so the cascade never
   * zigzags back over its own parent menus.
   */
  #submenuDirection: SubmenuDirection = 'right';

  constructor(container: HTMLElement) {
    this.#container = container;
  }

  /**
   * Show a menu at the given rendered position
   */
  show(items: MenuItem[], position: MenuPosition): void {
    // Close existing menu
    this.close();

    // Create menu element
    const menu = document.createElement('div');
    menu.className = 'graph-context-menu';
    menu.style.position = 'absolute';
    menu.style.left = `${position.x}px`;
    menu.style.top = `${position.y}px`;
    menu.style.backgroundColor = 'var(--bg-secondary, #161b22)';
    menu.style.border = '1px solid var(--border-primary, #30363d)';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';
    menu.style.padding = '3px';
    menu.style.minWidth = '180px';
    menu.style.zIndex = '1000';
    menu.style.color = 'var(--text-primary, #e6edf3)';
    menu.style.fontSize = '13px';

    // Add menu items
    this.#renderMenuItems(menu, items);

    // Add to container
    this.#container.appendChild(menu);
    this.#menuElement = menu;

    // The menu is a child of the Cytoscape container, so its pointer events
    // bubble to cy's canvas handlers — cy would hit-test the node under the
    // clicked menu row and tap-select it (stealing selection from the intended
    // node). Item `click` still fires (actions run); we only stop the
    // press/release events cy uses for tap/selection. Applies to node, edge,
    // and canvas menus alike, and to submenu items (descendants of this root).
    for (const eventName of ['mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
      menu.addEventListener(eventName, (e) => e.stopPropagation());
    }

    // Adjust position if menu overflows container bounds
    const menuRect = menu.getBoundingClientRect();
    const containerRect = this.#container.getBoundingClientRect();

    // Adjust if overflows bottom
    if (menuRect.bottom > containerRect.bottom) {
      const newTop = position.y - menuRect.height;
      menu.style.top = `${Math.max(0, newTop)}px`;
    }

    // Adjust if overflows right
    if (menuRect.right > containerRect.right) {
      const newLeft = position.x - menuRect.width;
      menu.style.left = `${Math.max(0, newLeft)}px`;
    }

    this.#submenuDirection = this.#chooseSubmenuDirection(menu);
  }

  /**
   * Pick the side the whole submenu cascade will open towards: the side with
   * room for the full cascade, or — if neither fits — the roomier one.
   */
  #chooseSubmenuDirection(menu: HTMLElement): SubmenuDirection {
    const menuRect = menu.getBoundingClientRect();
    const containerRect = this.#container.getBoundingClientRect();
    const spaceRight = containerRect.right - menuRect.right;
    const spaceLeft = menuRect.left - containerRect.left;
    const required = SUBMENU_MIN_WIDTH * SUBMENU_CASCADE_DEPTH;

    if (spaceRight >= required) return 'right';
    if (spaceLeft >= required) return 'left';
    return spaceRight >= spaceLeft ? 'right' : 'left';
  }

  /**
   * Close the open menu, if any
   */
  close(): void {
    if (this.#menuElement) {
      this.#menuElement.remove();
      this.#menuElement = null;
    }
  }

  /**
   * Render menu items (recursive for sub-menus)
   */
  #renderMenuItems(container: HTMLElement, items: MenuItem[]): void {
    items.forEach(item => {
      if (item.header) {
        // A heading opens its group, so every heading but the first also
        // carries the divider that would otherwise sit above it.
        const followsAnotherGroup = container.childElementCount > 0;
        const heading = document.createElement('div');
        heading.className = 'graph-context-menu-heading';
        heading.textContent = item.label;
        heading.style.padding = followsAnotherGroup ? '8px 10px 3px' : '4px 10px 3px';
        heading.style.fontSize = '11px';
        heading.style.color = 'var(--text-secondary, #8b949e)';
        heading.style.cursor = 'default';
        heading.style.userSelect = 'none';
        if (followsAnotherGroup) {
          heading.style.marginTop = '4px';
          heading.style.borderTop = '1px solid var(--border-primary, #30363d)';
        }
        container.appendChild(heading);
        return;
      }
      if (item.separator) {
        const divider = document.createElement('div');
        divider.className = 'graph-context-menu-separator';
        divider.style.height = '1px';
        divider.style.margin = '4px 6px';
        divider.style.backgroundColor = 'var(--border-primary, #30363d)';
        container.appendChild(divider);
        return;
      }
      const itemElement = document.createElement('div');
      itemElement.className = 'graph-context-menu-item';
      itemElement.style.padding = '5px 10px';
      itemElement.style.cursor = item.enabled === false ? 'default' : 'pointer';
      itemElement.style.opacity = item.enabled === false ? '0.5' : '1';
      itemElement.style.borderRadius = '3px';
      itemElement.style.transition = 'background-color 0.15s ease';
      itemElement.style.position = 'relative';
      itemElement.style.display = 'flex';
      itemElement.style.justifyContent = 'space-between';
      itemElement.style.alignItems = 'center';

      // Label
      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      itemElement.appendChild(labelSpan);

      // Sub-menu indicator arrow
      if (item.children && item.children.length > 0) {
        const arrow = document.createElement('span');
        arrow.textContent = '▶';
        arrow.style.fontSize = '8px';
        arrow.style.marginLeft = '8px';
        arrow.style.opacity = item.enabled === false ? '0.5' : '1';
        itemElement.appendChild(arrow);
      }

      // Sub-menu container (hidden by default)
      let subMenu: HTMLDivElement | null = null;
      let hideTimeout: ReturnType<typeof setTimeout> | null = null;

      if (item.children && item.children.length > 0) {
        subMenu = document.createElement('div');
        subMenu.className = 'graph-context-submenu';
        subMenu.style.position = 'absolute';
        subMenu.style.top = '0';
        subMenu.style.marginLeft = '0';  // Remove gap to prevent hover loss
        subMenu.style.backgroundColor = 'var(--bg-secondary, #161b22)';
        subMenu.style.border = '1px solid var(--border-primary, #30363d)';
        subMenu.style.borderRadius = '6px';
        subMenu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';
        subMenu.style.padding = '3px';
        subMenu.style.minWidth = `${SUBMENU_MIN_WIDTH}px`;
        subMenu.style.whiteSpace = 'nowrap';
        subMenu.style.display = 'none';
        subMenu.style.zIndex = '1001';

        this.#renderMenuItems(subMenu, item.children);
        itemElement.appendChild(subMenu);

        // Submenu hover - cancel hide timeout when entering submenu
        subMenu.addEventListener('mouseenter', () => {
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
        });

        subMenu.addEventListener('mouseleave', () => {
          if (subMenu) {
            subMenu.style.display = 'none';
          }
          itemElement.style.backgroundColor = 'transparent';
        });
      }

      // Hover effects
      itemElement.addEventListener('mouseenter', () => {
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
        if (item.enabled !== false) {
          itemElement.style.backgroundColor = 'rgba(88, 166, 255, 0.18)';
        }
        if (subMenu && item.enabled !== false) {
          // Every level opens towards the direction chosen for this menu.
          if (this.#submenuDirection === 'right') {
            subMenu.style.left = '100%';
            subMenu.style.right = 'auto';
          } else {
            subMenu.style.left = 'auto';
            subMenu.style.right = '100%';
          }
          subMenu.style.display = 'block';

          // Adjust submenu position if it overflows container bounds
          const subMenuRect = subMenu.getBoundingClientRect();
          const containerRect = this.#container.getBoundingClientRect();

          // Adjust if overflows bottom
          if (subMenuRect.bottom > containerRect.bottom) {
            const overflow = subMenuRect.bottom - containerRect.bottom;
            const currentTop = parseInt(subMenu.style.top) || 0;
            subMenu.style.top = `${currentTop - overflow}px`;
          }
        }
      });
      itemElement.addEventListener('mouseleave', () => {
        itemElement.style.backgroundColor = 'transparent';
        if (subMenu) {
          // Delay hiding to allow mouse to move to submenu
          hideTimeout = setTimeout(() => {
            if (subMenu) {
              subMenu.style.display = 'none';
            }
          }, 80);
        }
      });

      // Click handler (only for items without children)
      if (item.enabled !== false && item.action && !item.children) {
        itemElement.addEventListener('click', (e) => {
          e.stopPropagation();
          item.action!();
          this.close();
        });
      }

      container.appendChild(itemElement);
    });
  }
}
