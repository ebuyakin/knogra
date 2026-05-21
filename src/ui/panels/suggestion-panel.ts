/**
 * Suggestion Panel
 * Pure rendering component for displaying suggested nodes
 * Business logic handled by NodeShelf
 */

import type { Core } from 'cytoscape';
import type { ShelfItem } from '../../ai/types';
import type { Node } from '../../core/main-types';
import type { Design } from '../../styles/designs/design-registry';
import { getNodeStyle } from '../../styles/designs/design-registry';
import { getTheme } from '../../styles/themes';
import { getSetting } from '../../config';
import { eventBus } from '../../events/event-bus';
import { isEditMode } from '../../storage/app-mode';
import '../../styles/suggestion-panel.css';

// ============================================================================
// SUGGESTION PANEL
// ============================================================================

export class SuggestionPanel {
  #container: HTMLElement;
  #shelfContainer: HTMLElement;
  #items: ShelfItem[] = [];
  #onItemClick: ((index: number) => void) | null = null;
  #onItemDismiss: ((index: number) => void) | null = null;
  #contextMenu: HTMLDivElement | null = null;

  constructor(container: HTMLElement, _cy: Core) {
    this.#container = container;

    // Create shelf structure
    this.#container.innerHTML = `
      <div class="suggestion-panel">
        <div class="suggestion-shelf"></div>
      </div>
    `;

    this.#shelfContainer = this.#container.querySelector('.suggestion-shelf')!;

    // Close context menu on click outside
    document.addEventListener('click', () => this.#closeContextMenu());
    eventBus.on('appModeChanged', () => {
      void this.#renderItems();
    });
  }

  /**
   * Set handler for when an item is clicked
   */
  onItemClick(handler: (index: number) => void): void {
    this.#onItemClick = handler;
  }

  /**
   * Set handler for when an item is dismissed (right-click)
   */
  onItemDismiss(handler: (index: number) => void): void {
    this.#onItemDismiss = handler;
  }

  // ==========================================================================
  // PUBLIC RENDER METHODS
  // ==========================================================================

  /**
   * Render for scene transition: full exit/enter animation
   * Uses inline styles for reliable state control between phases
   */
  async renderTransition(items: ShelfItem[]): Promise<void> {
    const exitDuration = getSetting('ai.shelfExitDuration');
    const pauseBetween = getSetting('ai.shelfPauseBetween');
    const enterDuration = getSetting('ai.shelfEnterDuration');

    // Set CSS variable for exit animation duration
    this.#shelfContainer.style.setProperty('--shelf-exit-duration', `${exitDuration}ms`);

    // PHASE 1: EXIT (if there are existing items)
    if (this.#items.length > 0) {
      this.#shelfContainer.classList.add('shelf-exiting');
      await this.#delay(exitDuration);
      this.#shelfContainer.classList.remove('shelf-exiting');
    }

    // PHASE 2: HOLD INVISIBLE + PAUSE
    // Use inline styles to keep container invisible during pause
    this.#shelfContainer.style.opacity = '0';
    this.#shelfContainer.style.transform = 'translateX(50px)';
    
    await this.#delay(pauseBetween);

    // PHASE 3: RENDER (still invisible)
    this.#items = items;
    await this.#renderItems();

    // PHASE 4: ENTER (if there are new items)
    if (items.length > 0) {
      // Force reflow to ensure starting position is registered
      void this.#shelfContainer.offsetWidth;

      // Set transition and animate to visible
      this.#shelfContainer.style.transition = `opacity ${enterDuration}ms ease-out, transform ${enterDuration}ms ease-out`;
      this.#shelfContainer.style.opacity = '1';
      this.#shelfContainer.style.transform = 'translateX(0)';
      
      await this.#delay(enterDuration);

      // Cleanup: remove inline styles, return to CSS control
      this.#shelfContainer.style.transition = '';
      this.#shelfContainer.style.opacity = '';
      this.#shelfContainer.style.transform = '';
    } else {
      // No new items, just clear the invisible state
      this.#shelfContainer.style.opacity = '';
      this.#shelfContainer.style.transform = '';
    }
  }

  /**
   * Render for item removal: animate out specific item, then collapse gap
   */
  async renderRemoval(index: number, items: ShelfItem[], style: 'place' | 'dismiss'): Promise<void> {
    const removalDuration = getSetting('ai.shelfRemovalDuration');
    const removalPause = getSetting('ai.shelfRemovalPause');
    const collapseDuration = getSetting('ai.shelfCollapseDuration');
    
    const itemElements = this.#shelfContainer.querySelectorAll('.suggestion-item');
    const targetElement = itemElements[index] as HTMLElement | undefined;

    if (targetElement) {
      // Step 1: Fly/fade out
      targetElement.style.setProperty('--shelf-item-duration', `${removalDuration}ms`);
      targetElement.classList.add(style === 'place' ? 'item-placing' : 'item-dismissing');
      await this.#delay(removalDuration);
      
      // Step 2: Pause
      await this.#delay(removalPause);
      
      // Step 3: Collapse width (remaining items slide left)
      const currentWidth = targetElement.offsetWidth;
      targetElement.style.width = `${currentWidth}px`;
      targetElement.style.overflow = 'hidden';
      
      // Force reflow
      void targetElement.offsetWidth;
      
      targetElement.style.transition = `width ${collapseDuration}ms ease-out, margin ${collapseDuration}ms ease-out, padding ${collapseDuration}ms ease-out`;
      targetElement.style.width = '0';
      targetElement.style.marginLeft = '0';
      targetElement.style.marginRight = '0';
      targetElement.style.paddingLeft = '0';
      targetElement.style.paddingRight = '0';
      await this.#delay(collapseDuration);
    }

    // Step 4: Update items and re-render
    this.#items = items;
    await this.#renderItems();
  }

  /**
   * Render for AI addition: append new items and animate them in
   * Existing items remain static, only new items animate
   */
  async renderAddition(items: ShelfItem[], meta: { startIndex: number; count: number }): Promise<void> {
    const additionDuration = getSetting('ai.shelfAdditionDuration');

    // Update internal items
    this.#items = items;

    // Create and append only the new items (from startIndex)
    const newElements: HTMLElement[] = [];
    for (let i = meta.startIndex; i < items.length; i++) {
      const shelfItem = items[i];
      const element = await this.#createSuggestionItem(shelfItem, i);
      
      // Start invisible and offset
      element.style.opacity = '0';
      element.style.transform = 'translateX(50px)';
      
      this.#shelfContainer.appendChild(element);
      newElements.push(element);
    }

    // Force reflow
    void this.#shelfContainer.offsetWidth;

    // Animate new items in
    for (const el of newElements) {
      el.style.transition = `opacity ${additionDuration}ms ease-out, transform ${additionDuration}ms ease-out`;
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    }

    await this.#delay(additionDuration);

    // Cleanup inline styles
    for (const el of newElements) {
      el.style.transition = '';
      el.style.opacity = '';
      el.style.transform = '';
    }
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  #delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async #renderItems(): Promise<void> {
    // Clear shelf
    this.#shelfContainer.innerHTML = '';

    if (this.#items.length === 0) {
      return;
    }

    // Render each suggestion
    for (let index = 0; index < this.#items.length; index++) {
      const shelfItem = this.#items[index];
      const element = await this.#createSuggestionItem(shelfItem, index);
      this.#shelfContainer.appendChild(element);
    }
  }

  async #createSuggestionItem(
    shelfItem: ShelfItem,
    index: number
  ): Promise<HTMLElement> {
    const item = document.createElement('div');
    const isExisting = shelfItem.action.type === 'include_existing';
    const editMode = isEditMode();
    item.className = isExisting ? 'suggestion-item suggestion-item--existing' : 'suggestion-item';
    item.title = editMode
      ? shelfItem.action.reason || shelfItem.action.title
      : 'Enable edit to place suggestions';
    item.style.cursor = editMode ? '' : 'not-allowed';
    item.style.opacity = editMode ? '' : '0.55';

    // Create a mock node for SVG generation
    const mockNode: Node = {
      id: `suggestion-${index}`,
      title: shelfItem.action.title,
      tags: [],
      properties: shelfItem.properties
    };

    // Generate SVG using the design from ShelfItem
    const theme = getTheme(shelfItem.themeId);
    const design = shelfItem.design as Design;
    const style = await getNodeStyle(mockNode, design, theme);
    
    // Extract SVG from background-image
    const svgDataUrl = style['background-image'] as string;
    const svgHtml = this.#dataUrlToImgTag(svgDataUrl, style.width, style.height);

    // Badge for include_existing items
    const badge = isExisting ? '<div class="shelf-badge-existing">∃</div>' : '';

    item.innerHTML = `
      <div class="suggestion-node-preview">
        ${svgHtml}
        ${badge}
      </div>
    `;

    // Click handler
    item.addEventListener('click', () => {
      if (!isEditMode()) return;
      this.#onItemClick?.(index);
    });

    // Right-click context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.#showContextMenu(index, e.clientX, e.clientY);
    });

    return item;
  }

  // ==========================================================================
  // CONTEXT MENU
  // ==========================================================================

  #showContextMenu(index: number, x: number, y: number): void {
    this.#closeContextMenu();

    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.backgroundColor = 'var(--bg-secondary, #161b22)';
    menu.style.border = '1px solid var(--border-primary, #30363d)';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';
    menu.style.padding = '4px';
    menu.style.zIndex = '1000';
    menu.style.minWidth = '160px';

    const item = document.createElement('div');
    item.textContent = 'Remove from shelf';
    item.style.padding = '8px 12px';
    item.style.cursor = 'pointer';
    item.style.borderRadius = '4px';
    item.style.color = 'var(--text-primary, #e6edf3)';
    item.style.fontSize = '13px';
    item.addEventListener('mouseenter', () => {
      item.style.backgroundColor = 'var(--bg-tertiary, #1c2128)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.backgroundColor = 'transparent';
    });
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#onItemDismiss?.(index);
      this.#closeContextMenu();
    });

    menu.appendChild(item);
    document.body.appendChild(menu);
    this.#contextMenu = menu;

    // Adjust if overflows viewport
    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`;
    }
    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`;
    }
  }

  #closeContextMenu(): void {
    if (this.#contextMenu) {
      this.#contextMenu.remove();
      this.#contextMenu = null;
    }
  }

  /**
   * Convert data URL to img tag with scaled dimensions and effects
   */
  #dataUrlToImgTag(dataUrl: string, width: number, height: number): string {
    const scale = getSetting('ai.shelfPreviewScale');
    const opacity = getSetting('ai.shelfPreviewOpacity');
    const grayscale = getSetting('ai.shelfPreviewGrayscale');

    const scaledWidth = Math.round(width * scale);
    const scaledHeight = Math.round(height * scale);
    const style = `opacity: ${opacity}; filter: grayscale(${grayscale}%);`;

    return `<img src="${dataUrl}" width="${scaledWidth}" height="${scaledHeight}" style="${style}" alt="Node preview" />`;
  }
}
