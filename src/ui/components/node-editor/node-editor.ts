/**
 * NodeEditor - modal dialog for editing node properties.
 *
 * Shell responsibilities only: fixed frame, title field, tab strip, save
 * composition and drag. Each tab owns its own fields and reports typed values;
 * the merge of those values into node properties and design params happens here
 * so the tabs stay unaware of each other.
 */

import type { Node, NodeId, DesignId } from '../../../core/main-types';
import { createAdvancedTab } from './advanced-tab';
import { createContentTab, type ContentTab } from './content-tab';
import { createDesignTab, mergeDefaultNodeLayoutParams, type DesignTab } from './design-tab';
import { createIdentityTab } from './identity-tab';
import { createTextarea, el, text } from './editor-fields';
import { readActiveTab, writeActiveTab } from './tab-memory';
import type {
  AdvancedTabValues,
  ContentTabValues,
  DesignTabValues,
  EditorTab,
  NodeEditorCheckTitleConflict,
  NodeEditorContext,
  NodeEditorOnGenerateEquation,
  NodeEditorOnSave,
  NodeEditorTabId
} from './node-editor-types';
import '../../../styles/node-editor.css';

export type {
  NodeEditorContext,
  NodeEditorOnSave,
  NodeEditorOnGenerateEquation,
  NodeEditorCheckTitleConflict,
  NodeEditorEquationRequest,
  NodeEditorEquationResult,
  NodeEditorEquationClarification
} from './node-editor-types';

interface TabDescriptor {
  id: NodeEditorTabId;
  label: string;
  panel: HTMLElement;
  button: HTMLButtonElement;
}

export class NodeEditor {
  #modalElement: HTMLDivElement | null = null;
  #nodeId: NodeId | null = null;
  #onSave: NodeEditorOnSave | null = null;
  #checkTitleConflict: NodeEditorCheckTitleConflict | null = null;
  #originalTitle = '';
  #containerRect: DOMRect | null = null;
  #handleKeydown: ((event: KeyboardEvent) => void) | null = null;
  #isDragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;

  show(
    nodeId: NodeId,
    currentData: Node,
    currentDesign: { id: DesignId; params: Record<string, unknown> },
    context: NodeEditorContext,
    onSave: NodeEditorOnSave,
    onGenerateEquation?: NodeEditorOnGenerateEquation,
    checkTitleConflict?: NodeEditorCheckTitleConflict
  ): void {
    // Tear down any open instance first: `hide()` clears the editing state, so it
    // must run before the new state is captured.
    this.hide();
    this.#nodeId = nodeId;
    this.#onSave = onSave;
    this.#checkTitleConflict = checkTitleConflict ?? null;
    this.#originalTitle = currentData.title;
    this.#render(nodeId, currentData, currentDesign, context, onGenerateEquation ?? null);
  }

  hide(): void {
    this.#clearKeydownHandler();
    if (this.#modalElement) {
      this.#modalElement.remove();
      this.#modalElement = null;
      this.#nodeId = null;
      this.#onSave = null;
      this.#checkTitleConflict = null;
      this.#containerRect = null;
    }
  }

  #clearKeydownHandler(): void {
    if (!this.#handleKeydown) return;
    document.removeEventListener('keydown', this.#handleKeydown);
    this.#handleKeydown = null;
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================

  #render(
    nodeId: NodeId,
    currentData: Node,
    currentDesign: { id: DesignId; params: Record<string, unknown> },
    context: NodeEditorContext,
    onGenerateEquation: NodeEditorOnGenerateEquation | null
  ): void {
    this.#containerRect = context.containerRect;

    const modal = el('div', 'node-editor-modal');
    const dialog = el('div', 'node-editor-dialog');

    // Centred on the Cytoscape container, not the browser window, so the dialog
    // stays over the graph regardless of surrounding chrome.
    dialog.style.left = `${context.containerRect.left + context.containerRect.width / 2}px`;
    dialog.style.top = `${context.containerRect.top + context.containerRect.height / 2}px`;
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.addEventListener('click', (event) => event.stopPropagation());

    // ---------------------------- title bar --------------------------------
    const titleBar = el('div', 'node-editor-titlebar');
    const titleBarLabel = text('span', 'Edit Node');
    titleBarLabel.className = 'node-editor-titlebar-label';
    const titleBarGrip = text('span', '⠿');
    titleBarGrip.className = 'node-editor-titlebar-grip';
    titleBar.append(titleBarLabel, titleBarGrip);
    this.#setupDrag(titleBar, dialog);

    // Fixed rows: a long title scrolls inside the box instead of resizing the
    // frame, which must stay stable while the dialog is open.
    const titleField = createTextarea(
      'Title',
      currentData.title,
      'Press Enter for explicit line breaks',
      2,
      { autoGrow: false }
    );
    titleField.container.classList.add('node-editor-title-field');
    titleField.input.classList.add('node-editor-title-input');

    // ------------------------------- tabs ----------------------------------
    const designTab = createDesignTab({
      design: currentDesign,
      scale: context.scale,
      themeId: context.themeId
    });

    const contentTab = createContentTab({
      node: currentData,
      generateEquation: onGenerateEquation,
      getOverlayHost: () => this.#modalElement,
      getContainerRect: () => this.#containerRect,
      getTitle: () => titleField.input.value,
      applyDesign: (designId) => designTab.selectDesign(designId)
    });

    const advancedTab = createAdvancedTab({
      node: currentData,
      designParams: currentDesign.params || {}
    });

    const identityTab = createIdentityTab({ nodeId, node: currentData, context });

    const body = el('div', 'node-editor-body');
    const tabStrip = el('div', 'node-editor-tabs');
    const tabs = this.#buildTabs(
      [
        { id: 'content', label: 'Content', panel: contentTab.element },
        { id: 'design', label: 'Design', panel: designTab.element },
        { id: 'advanced', label: 'Advanced', panel: advancedTab.element },
        { id: 'identity', label: 'Identity', panel: identityTab.element }
      ],
      tabStrip,
      body
    );
    this.#activateTab(tabs, readActiveTab());

    // ------------------------------ footer ---------------------------------
    const footer = el('div', 'node-editor-footer');
    const footerLeft = el('div', 'node-editor-footer-group');
    const footerRight = el('div', 'node-editor-footer-group');

    if (contentTab.equationButton) footerLeft.appendChild(contentTab.equationButton);

    const cancelBtn = text('button', 'Cancel') as HTMLButtonElement;
    cancelBtn.type = 'button';
    cancelBtn.className = 'node-editor-btn node-editor-btn-neutral';
    cancelBtn.addEventListener('click', () => this.hide());

    const saveShortcut = navigator.platform.toLowerCase().includes('mac') ? '⌘E' : 'Ctrl+E';
    const saveBtn = text('button', `Save (${saveShortcut})`) as HTMLButtonElement;
    saveBtn.type = 'button';
    saveBtn.className = 'node-editor-btn node-editor-btn-neutral';
    saveBtn.title = `Save changes and close (${saveShortcut})`;
    saveBtn.addEventListener('click', () => {
      this.#handleSave(titleField.input.value, contentTab, designTab, advancedTab);
    });

    footerRight.append(cancelBtn, saveBtn);
    footer.append(footerLeft, footerRight);

    dialog.append(titleBar, titleField.container, tabStrip, body, footer);

    // ------------------------------ events ---------------------------------
    modal.addEventListener('click', (event) => {
      if (event.target === modal) this.hide();
    });

    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        this.hide();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault();
        if (this.#modalElement !== modal) return;
        saveBtn.click();
      }
    };
    this.#handleKeydown = handleKeydown;
    document.addEventListener('keydown', this.#handleKeydown);

    modal.appendChild(dialog);
    document.body.appendChild(modal);
    this.#modalElement = modal;

    titleField.input.focus();
    titleField.input.select();
  }

  // ===========================================================================
  // TABS
  // ===========================================================================

  #buildTabs(
    definitions: Array<{ id: NodeEditorTabId; label: string; panel: HTMLElement }>,
    strip: HTMLElement,
    body: HTMLElement
  ): TabDescriptor[] {
    const tabs: TabDescriptor[] = definitions.map((definition) => {
      const button = text('button', definition.label) as HTMLButtonElement;
      button.type = 'button';
      button.className = 'node-editor-tab';
      strip.appendChild(button);
      body.appendChild(definition.panel);
      return { ...definition, button };
    });

    for (const tab of tabs) {
      tab.button.addEventListener('click', () => {
        this.#activateTab(tabs, tab.id);
        writeActiveTab(tab.id);
      });
    }

    return tabs;
  }

  #activateTab(tabs: TabDescriptor[], activeId: NodeEditorTabId): void {
    for (const tab of tabs) {
      const isActive = tab.id === activeId;
      tab.button.classList.toggle('active', isActive);
      tab.panel.classList.toggle('active', isActive);
    }
  }

  // ===========================================================================
  // SAVE
  // ===========================================================================

  #handleSave(
    title: string,
    contentTab: ContentTab,
    designTab: DesignTab,
    advancedTab: EditorTab<AdvancedTabValues>
  ): void {
    if (!this.#nodeId || !this.#onSave) return;

    const content = contentTab.read();
    if (!content) return;
    const design = designTab.read();
    if (!design) return;
    const advanced = advancedTab.read();
    if (!advanced) return;

    const conflict = this.#checkTitleConflict?.(title) ?? null;
    if (conflict && title !== this.#originalTitle) {
      const proceed = confirm(
        `A node titled "${conflict.title}" already exists.\n\nSave this node with the same title anyway?`
      );
      if (!proceed) return;
    }

    const properties = this.#composeProperties(advanced, content);
    const designParams = this.#composeDesignParams(advanced, design);

    const contentUpdates: Partial<Node> = {
      title,
      tags: content.tags.length > 0 ? content.tags : undefined,
      properties: Object.keys(properties).length > 0 ? properties : undefined
    };

    this.#onSave(
      this.#nodeId,
      contentUpdates,
      { id: design.designId, params: designParams },
      design.scale
    );
    this.hide();
  }

  #composeProperties(
    advanced: AdvancedTabValues,
    content: ContentTabValues
  ): Record<string, unknown> {
    const properties = { ...advanced.properties };
    if (content.equation.trim()) properties.equation = content.equation.trim();
    if (content.comment.trim()) properties.comment = content.comment.trim();
    return properties;
  }

  /**
   * Design-tab controls win over the raw JSON for the keys they own; any other
   * key the user typed into the JSON survives untouched.
   */
  #composeDesignParams(
    advanced: AdvancedTabValues,
    design: DesignTabValues
  ): Record<string, unknown> {
    const designParams = { ...advanced.designParams };

    const colors: Record<string, string> = {
      ...((designParams.colorOverrides as Record<string, string>) || {})
    };
    this.#applyOverride(colors, 'text', design.colors.text);
    this.#applyOverride(colors, 'background', design.colors.background);
    this.#applyOverride(colors, 'backgroundAlt', design.colors.backgroundAlt);
    if (Object.keys(colors).length > 0) {
      designParams.colorOverrides = colors;
    } else {
      delete designParams.colorOverrides;
    }

    const effects: Record<string, number> = {
      ...((designParams.effects as Record<string, number>) || {})
    };
    this.#applyOpacity(effects, 'textOpacity', design.opacities.text);
    this.#applyOpacity(effects, 'backgroundOpacity', design.opacities.background);
    this.#applyOpacity(effects, 'backgroundAltOpacity', design.opacities.backgroundAlt);
    if (Object.keys(effects).length > 0) {
      designParams.effects = effects;
    } else {
      delete designParams.effects;
    }

    if (design.defaultNodeLayout) {
      mergeDefaultNodeLayoutParams(designParams, design.defaultNodeLayout);
    }

    return designParams;
  }

  #applyOverride(
    target: Record<string, string>,
    key: string,
    value: string | undefined
  ): void {
    if (value !== undefined) {
      target[key] = value;
    } else {
      delete target[key];
    }
  }

  /**
   * The design tab reports an opacity only when it differs from the theme
   * default; the default is stored as absence (mirrors #applyOverride).
   */
  #applyOpacity(target: Record<string, number>, key: string, value: number | undefined): void {
    if (value !== undefined) {
      target[key] = value;
    } else {
      delete target[key];
    }
  }

  // ===========================================================================
  // DRAG
  // ===========================================================================

  #setupDrag(handle: HTMLElement, dialog: HTMLElement): void {
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', (event: MouseEvent) => {
      this.#isDragging = true;
      const rect = dialog.getBoundingClientRect();
      this.#dragOffsetX = event.clientX - rect.left;
      this.#dragOffsetY = event.clientY - rect.top;
      // Pin to the current visual position before the centring transform is dropped
      dialog.style.left = `${rect.left}px`;
      dialog.style.top = `${rect.top}px`;
      dialog.style.transform = 'none';
      document.body.style.cursor = 'move';
      event.preventDefault();
    });

    document.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.#isDragging) return;
      dialog.style.left = `${event.clientX - this.#dragOffsetX}px`;
      dialog.style.top = `${event.clientY - this.#dragOffsetY}px`;
    });

    document.addEventListener('mouseup', () => {
      this.#isDragging = false;
      document.body.style.cursor = '';
    });
  }
}
