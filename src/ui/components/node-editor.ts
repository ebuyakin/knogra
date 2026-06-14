/**
 * NodeEditor - Modal dialog for editing node properties
 * Pure UI component - no business logic
 */

import type { Node, NodeId, DesignId, SceneId } from '../../core/main-types';
import { AVAILABLE_DESIGNS } from '../../styles/designs/design-registry';
import { getTheme } from '../../styles/themes';
import '../../styles/node-editor.css';

/**
 * Scene-specific context for the node being edited
 */
export interface NodeEditorContext {
  sceneId: SceneId;
  themeId: string;
  scale: number;
  position: { x: number; y: number };
  viewportPosition: { x: number; y: number };
  containerRect: DOMRect;
}

export type NodeEditorOnSave = (
  nodeId: NodeId,
  contentUpdates: Partial<Node>,
  designUpdates: { id: DesignId; params: Record<string, unknown> },
  scaleUpdate: number
) => void;

export interface NodeEditorEquationRequest {
  title: string;
  currentEquation: string;
  prompt: string;
}

export interface NodeEditorEquationResult {
  type: 'equation';
  latex: string;
}

export interface NodeEditorEquationClarification {
  type: 'clarification';
  message: string;
}

export type NodeEditorOnGenerateEquation = (
  request: NodeEditorEquationRequest
) => Promise<NodeEditorEquationResult | NodeEditorEquationClarification>;

export class NodeEditor {
  #modalElement: HTMLDivElement | null = null;
  #nodeId: NodeId | null = null;
  #onSave: NodeEditorOnSave | null = null;
  #onGenerateEquation: NodeEditorOnGenerateEquation | null = null;
  #containerRect: DOMRect | null = null;
  #isDragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;

  show(
    nodeId: NodeId,
    currentData: Node,
    currentDesign: { id: DesignId; params: Record<string, unknown> },
    context: NodeEditorContext,
    onSave: NodeEditorOnSave,
    onGenerateEquation?: NodeEditorOnGenerateEquation
  ): void {
    this.#nodeId = nodeId;
    this.#onSave = onSave;
    this.#onGenerateEquation = onGenerateEquation ?? null;
    this.#render(currentData, currentDesign, context);
  }

  hide(): void {
    if (this.#modalElement) {
      this.#modalElement.remove();
      this.#modalElement = null;
      this.#nodeId = null;
      this.#onSave = null;
      this.#onGenerateEquation = null;
      this.#containerRect = null;
    }
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================

  #render(
    currentData: Node,
    currentDesign: { id: DesignId; params: Record<string, unknown> },
    context: NodeEditorContext
  ): void {
    this.hide();
    this.#containerRect = context.containerRect;

    const modal = this.#el('div', 'node-editor-modal');
    const dialog = this.#el('div', 'node-editor-dialog');

    const cx = context.containerRect.left + context.containerRect.width / 2;
    const cy = context.containerRect.top + context.containerRect.height / 2;
    dialog.style.left = `${cx}px`;
    dialog.style.top = `${cy}px`;
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.addEventListener('click', (e) => e.stopPropagation());

    // ======================= TOP (fixed) =======================
    const top = this.#el('div', 'node-editor-top');

    const header = this.#el('div', 'node-editor-header');
    header.appendChild(this.#text('span', `ID: ${this.#nodeId}`));
    header.appendChild(this.#text('span', `Scene: ${context.sceneId}`));
    top.appendChild(header);
    this.#setupDrag(header, dialog);

    const titleInput = this.#createTextarea('Title', currentData.title, 'Press Enter for explicit line breaks', 1);
    const tagsInput = this.#createTextInput('Tags', (currentData.tags || []).join(', '), 'e.g., physics, quantum, important');
    const equationValue = (currentData.properties?.equation as string) || '';
    const equationInput = this.#createTextarea('Equation (LaTeX)', equationValue, 'e.g., E = mc^2', 3);
    top.append(titleInput.container, tagsInput.container, equationInput.container);
    dialog.appendChild(top);

    // ======================= MIDDLE (scrollable) =======================
    const middle = this.#el('div', 'node-editor-middle');

    // Section 1: Properties (JSON) — foldable, starts collapsed
    const propsWithoutEq = { ...currentData.properties };
    delete propsWithoutEq?.equation;
    const propsJson = Object.keys(propsWithoutEq || {}).length > 0 ? JSON.stringify(propsWithoutEq, null, 2) : '';
    const propertiesInput = this.#createTextarea('', propsJson, '{\n  "key": "value"\n}', 4);
    middle.appendChild(this.#createFoldable('Properties (JSON)', propertiesInput.container, false));

    // Section 2: Design Type + Scale — always visible (not foldable)
    const designIdSelect = this.#createSelect('Design Type', currentDesign.id, AVAILABLE_DESIGNS.map(d => d.id));

    // Scale: single-row layout matching color+opacity rows
    const scaleContainer = this.#el('div', 'node-editor-color-opacity-row');
    const scaleLabel = this.#text('span', 'Scale');
    scaleLabel.className = 'node-editor-color-label';
    const scaleNumInput = document.createElement('input');
    scaleNumInput.type = 'number';
    scaleNumInput.className = 'node-editor-scale-input';
    scaleNumInput.min = '0.2';
    scaleNumInput.max = '3.0';
    scaleNumInput.step = '0.05';
    scaleNumInput.value = context.scale.toFixed(2);
    const scaleSliderInput = document.createElement('input');
    scaleSliderInput.type = 'range';
    scaleSliderInput.className = 'node-editor-opacity-slider';
    scaleSliderInput.min = '0.2';
    scaleSliderInput.max = '3.0';
    scaleSliderInput.step = '0.05';
    scaleSliderInput.value = String(context.scale);
    scaleSliderInput.addEventListener('input', () => {
      scaleNumInput.value = scaleSliderInput.valueAsNumber.toFixed(2);
    });
    scaleNumInput.addEventListener('input', () => {
      const v = parseFloat(scaleNumInput.value);
      if (!isNaN(v) && v >= 0.2 && v <= 3.0) scaleSliderInput.value = String(v);
    });
    scaleContainer.append(scaleLabel, scaleNumInput, scaleSliderInput);
    middle.append(designIdSelect.container, scaleContainer);

    // Section 3: Colors & Opacity — foldable, starts expanded
    const params = currentDesign.params || {};
    const colorOverrides = (params.colorOverrides as Record<string, string>) || {};
    const effects = (params.effects as Record<string, number>) || {};

    // Resolve theme defaults for display
    const theme = getTheme(context.themeId);
    const themeBgColor = theme.node.background.color;
    const themeBgOpacity = (theme.node.background as { opacity: number }).opacity;
    const themeBgAltColor = theme.node.backgroundAlt.color;
    const themeBgAltOpacity = (theme.node.backgroundAlt as { opacity: number }).opacity;
    const themeTextColor = theme.node.text.color;
    const themeTextOpacity = (theme.node.text as { opacity: number }).opacity;

    const colorContent = this.#el('div', '');
    const textRow = this.#createColorWithOpacity('Text', colorOverrides.text, themeTextColor, effects.textOpacity ?? themeTextOpacity, themeTextOpacity);
    const bgRow = this.#createColorWithOpacity('Background', colorOverrides.background, themeBgColor, effects.backgroundOpacity ?? themeBgOpacity, themeBgOpacity);
    const bgAltRow = this.#createColorWithOpacity('Background Alt', colorOverrides.backgroundAlt, themeBgAltColor, effects.backgroundAltOpacity ?? themeBgAltOpacity, themeBgAltOpacity);
    colorContent.append(textRow.container, bgRow.container, bgAltRow.container);
    middle.appendChild(this.#createFoldable('Colors & Opacity', colorContent, false));

    // Section 4: Design Parameters (JSON) — foldable, starts collapsed
    const designParamsJson = Object.keys(params).length > 0 ? JSON.stringify(params, null, 2) : '';
    const designParamsInput = this.#createTextarea('', designParamsJson, '{\n  "fontSize": 14\n}', 8);
    middle.appendChild(this.#createFoldable('Design Parameters (JSON)', designParamsInput.container, true));

    dialog.appendChild(middle);

    // ======================= BOTTOM (fixed) =======================
    const bottom = this.#el('div', 'node-editor-bottom');

    const meta = this.#el('div', 'node-editor-meta');
    const { x: mx, y: my } = context.position;
    const { x: vx, y: vy } = context.viewportPosition;
    meta.appendChild(this.#text('div', `Model: (${Math.round(mx)}, ${Math.round(my)})  Viewport: (${Math.round(vx)}, ${Math.round(vy)})`));
    if (currentData.createdAt || currentData.updatedAt) {
      const parts: string[] = [];
      if (currentData.createdAt) parts.push(`Created: ${new Date(currentData.createdAt).toLocaleDateString()}`);
      if (currentData.updatedAt) parts.push(`Updated: ${new Date(currentData.updatedAt).toLocaleDateString()}`);
      meta.appendChild(this.#text('div', parts.join('  ')));
    }
    bottom.appendChild(meta);

    const actionRow = this.#el('div', 'node-editor-action-row');
    const equationActions = this.#el('div', 'node-editor-equation-actions');
    if (this.#onGenerateEquation) {
      const equationBtn = this.#text('button', this.#getEquationButtonLabel(equationInput.input.value)) as HTMLButtonElement;
      equationBtn.className = 'node-editor-btn node-editor-btn-cancel';
      equationBtn.title = 'Generate a LaTeX equation with AI';
      equationBtn.addEventListener('click', () => {
        this.#showEquationPromptDialog(
          titleInput.input.value,
          equationInput.input.value,
          async (equation) => {
            equationInput.input.value = equation;
            equationBtn.textContent = this.#getEquationButtonLabel(equationInput.input.value);
            equationInput.input.focus();
          }
        );
      });
      equationInput.input.addEventListener('input', () => {
        equationBtn.textContent = this.#getEquationButtonLabel(equationInput.input.value);
      });
      equationActions.appendChild(equationBtn);
    }

    const buttons = this.#el('div', 'node-editor-buttons');
    const cancelBtn = this.#text('button', 'Cancel') as HTMLButtonElement;
    cancelBtn.className = 'node-editor-btn node-editor-btn-cancel';
    cancelBtn.addEventListener('click', () => this.hide());

    const saveShortcut = navigator.platform.toLowerCase().includes('mac') ? '⌘E' : 'Ctrl+E';
    const saveBtn = this.#text('button', `Save (${saveShortcut})`) as HTMLButtonElement;
    saveBtn.className = 'node-editor-btn node-editor-btn-save';
    saveBtn.title = `Save changes and close (${saveShortcut})`;
    saveBtn.addEventListener('click', () => {
      this.#handleSave(
        titleInput.input.value,
        tagsInput.input.value,
        equationInput.input.value,
        propertiesInput.input.value,
        designIdSelect.select.value,
        scaleSliderInput.valueAsNumber,
        designParamsInput.input.value,
        bgRow.getColor(),
        bgAltRow.getColor(),
        textRow.getColor(),
        bgRow.getOpacity(),
        bgAltRow.getOpacity(),
        textRow.getOpacity()
      );
    });

    buttons.append(cancelBtn, saveBtn);
    actionRow.append(equationActions, buttons);
    bottom.appendChild(actionRow);
    dialog.appendChild(bottom);

    // ======================= EVENTS =======================
    modal.addEventListener('click', (e) => { if (e.target === modal) this.hide(); });
    const handleKeydown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', handleKeydown);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        saveBtn.click();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    modal.appendChild(dialog);
    document.body.appendChild(modal);
    this.#modalElement = modal;

    titleInput.input.focus();
    titleInput.input.select();
  }

  #getEquationButtonLabel(equation: string): string {
    return equation.trim() ? 'Replace Equation' : 'Add Equation';
  }

  #showEquationPromptDialog(
    title: string,
    currentEquation: string,
    onEquationGenerated: (equation: string) => Promise<void>
  ): void {
    if (!this.#modalElement || !this.#onGenerateEquation) return;

    const overlay = this.#el('div', 'node-editor-equation-overlay');
    if (this.#containerRect) {
      overlay.style.left = `${this.#containerRect.left}px`;
      overlay.style.top = `${this.#containerRect.top}px`;
      overlay.style.width = `${this.#containerRect.width}px`;
      overlay.style.height = `${this.#containerRect.height}px`;
    }
    const dialog = this.#el('div', 'node-editor-equation-dialog');
    dialog.addEventListener('click', (event) => event.stopPropagation());

    const heading = this.#text('h3', currentEquation.trim() ? 'Replace Equation' : 'Add Equation');
    heading.className = 'node-editor-equation-title';

    const promptInput = this.#createTextarea(
      'Prompt',
      this.#buildEquationPrompt(title),
      'Describe the equation you want',
      5
    );
    promptInput.input.classList.add('node-editor-equation-prompt');

    const error = this.#text('div', '');
    error.className = 'node-editor-equation-error';

    const footer = this.#el('div', 'node-editor-equation-footer');
    const cancelBtn = this.#text('button', 'Cancel') as HTMLButtonElement;
    cancelBtn.className = 'node-editor-btn node-editor-btn-cancel';
    const generateBtn = this.#text('button', 'Generate') as HTMLButtonElement;
    generateBtn.className = 'node-editor-btn node-editor-btn-save';

    const close = (): void => overlay.remove();
    const submit = async (): Promise<void> => {
      const prompt = promptInput.input.value.trim();
      if (!prompt) {
        error.textContent = 'Prompt is required.';
        return;
      }

      error.textContent = '';
      generateBtn.disabled = true;
      cancelBtn.disabled = true;
      promptInput.input.disabled = true;
      generateBtn.textContent = 'Generating...';

      try {
        const result = await this.#onGenerateEquation?.({ title, currentEquation, prompt });
        if (!result) throw new Error('Equation generation is not available.');

        if (result.type === 'clarification') {
          error.textContent = result.message;
          generateBtn.disabled = false;
          cancelBtn.disabled = false;
          promptInput.input.disabled = false;
          generateBtn.textContent = 'Generate';
          promptInput.input.focus();
          return;
        }

        await onEquationGenerated(result.latex.trim());
        close();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Could not generate equation.';
        error.textContent = message;
        generateBtn.disabled = false;
        cancelBtn.disabled = false;
        promptInput.input.disabled = false;
        generateBtn.textContent = 'Generate';
        promptInput.input.focus();
      }
    };

    cancelBtn.addEventListener('click', close);
    generateBtn.addEventListener('click', () => void submit());
    overlay.addEventListener('click', close);
    overlay.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        close();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    });

    footer.append(cancelBtn, generateBtn);
    dialog.append(heading, promptInput.container, error, footer);
    overlay.appendChild(dialog);
    this.#modalElement.appendChild(overlay);
    promptInput.input.focus();
    promptInput.input.select();
  }

  #buildEquationPrompt(title: string): string {
    const subject = title.trim() || 'this node';
    return `Generate a LaTeX equation for "${subject}".`;
  }

  // ===========================================================================
  // FORM HELPERS
  // ===========================================================================

  #el(tag: string, className: string): HTMLDivElement {
    const el = document.createElement(tag) as HTMLDivElement;
    el.className = className;
    return el;
  }

  #text(tag: string, content: string): HTMLElement {
    const el = document.createElement(tag);
    el.textContent = content;
    return el;
  }

  #createTextInput(label: string, value: string, placeholder?: string): { container: HTMLDivElement; input: HTMLInputElement } {
    const container = this.#el('div', 'node-editor-field');
    container.appendChild(this.#text('label', label)).className = 'node-editor-label';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'node-editor-input';
    input.value = value;
    if (placeholder) input.placeholder = placeholder;
    container.appendChild(input);
    return { container, input };
  }

  #createTextarea(label: string, value: string, placeholder: string, rows: number): { container: HTMLDivElement; input: HTMLTextAreaElement } {
    const container = this.#el('div', 'node-editor-field');
    container.appendChild(this.#text('label', label)).className = 'node-editor-label';
    const input = document.createElement('textarea');
    input.className = 'node-editor-textarea';
    input.value = value;
    input.placeholder = placeholder;
    input.rows = rows;
    // Auto-size to content if content is taller than default rows
    if (value) {
      const lineCount = value.split('\n').length + 1;
      if (lineCount > rows) input.rows = lineCount;
    }
    container.appendChild(input);
    return { container, input };
  }

  #createSelect(label: string, currentValue: string, options: string[]): { container: HTMLDivElement; select: HTMLSelectElement } {
    const container = this.#el('div', 'node-editor-field');
    container.appendChild(this.#text('label', label)).className = 'node-editor-label';
    const select = document.createElement('select');
    select.className = 'node-editor-select';
    for (const opt of options) {
      const el = document.createElement('option');
      el.value = opt;
      el.textContent = opt;
      el.selected = opt === currentValue;
      select.appendChild(el);
    }
    container.appendChild(select);
    return { container, select };
  }

  #createFoldable(title: string, content: HTMLElement, startCollapsed: boolean): HTMLDivElement {
    const section = this.#el('div', 'node-editor-section');
    if (startCollapsed) section.classList.add('collapsed');

    const header = this.#el('div', 'node-editor-section-header');
    const toggle = this.#text('span', '▼');
    toggle.className = 'node-editor-section-toggle';
    const titleEl = this.#text('span', title);
    titleEl.className = 'node-editor-section-title';
    header.append(toggle, titleEl);

    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
      if (!section.classList.contains('collapsed')) {
        // Scroll the expanded section into view after layout update
        requestAnimationFrame(() => section.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
    });

    const wrapper = this.#el('div', 'node-editor-section-content');
    wrapper.appendChild(content);

    section.append(header, wrapper);
    return section;
  }

  /**
   * Combined color picker + opacity slider on one line.
   * Returns container element and accessors for color and opacity values.
   */
  #createColorWithOpacity(
    label: string,
    colorValue: string | undefined,
    themeColor: string,
    opacityValue: number,
    _themeOpacity: number
  ): { container: HTMLDivElement; getColor: () => string | undefined; getOpacity: () => number } {
    const container = this.#el('div', 'node-editor-color-opacity-row');

    const labelEl = this.#text('span', label);
    labelEl.className = 'node-editor-color-label';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'node-editor-color-input';
    colorInput.value = colorValue || themeColor;

    let isColorSet = !!colorValue;

    const resetBtn = document.createElement('button');
    resetBtn.className = 'node-editor-color-reset';
    resetBtn.textContent = isColorSet ? 'Reset' : '(theme)';
    resetBtn.addEventListener('click', () => {
      isColorSet = false;
      colorInput.value = themeColor;
      resetBtn.textContent = '(theme)';
    });
    colorInput.addEventListener('input', () => {
      isColorSet = true;
      resetBtn.textContent = 'Reset';
    });

    const opacityInput = document.createElement('input');
    opacityInput.type = 'range';
    opacityInput.className = 'node-editor-opacity-slider';
    opacityInput.min = '0';
    opacityInput.max = '1';
    opacityInput.step = '0.05';
    opacityInput.value = String(opacityValue);

    const opacityVal = this.#text('span', opacityValue.toFixed(2));
    opacityVal.className = 'node-editor-opacity-value';
    opacityInput.addEventListener('input', () => {
      opacityVal.textContent = opacityInput.valueAsNumber.toFixed(2);
    });

    container.append(labelEl, colorInput, resetBtn, opacityInput, opacityVal);

    return {
      container,
      getColor: (): string | undefined => isColorSet ? colorInput.value : undefined,
      getOpacity: (): number => opacityInput.valueAsNumber
    };
  }

  // ===========================================================================
  // SAVE HANDLER
  // ===========================================================================

  #handleSave(
    title: string,
    tagsString: string,
    equation: string,
    propertiesJson: string,
    designId: string,
    scale: number,
    designParamsJson: string,
    bgColor: string | undefined,
    bgAltColor: string | undefined,
    textColor: string | undefined,
    bgOpacity: number,
    bgAltOpacity: number,
    textOpacity: number
  ): void {
    if (!this.#nodeId || !this.#onSave) return;

    const tags = tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);

    let properties: Record<string, unknown> = {};
    try {
      if (propertiesJson.trim()) properties = JSON.parse(propertiesJson);
    } catch {
      alert('Invalid JSON in Properties field. Please fix and try again.');
      return;
    }
    if (equation.trim()) properties.equation = equation.trim();

    let designParams: Record<string, unknown> = {};
    try {
      if (designParamsJson.trim()) designParams = JSON.parse(designParamsJson);
    } catch {
      alert('Invalid JSON in Design Parameters field. Please fix and try again.');
      return;
    }

    // Merge visual controls into designParams (controls take precedence over JSON)
    const colorOv: Record<string, string> = { ...(designParams.colorOverrides as Record<string, string> || {}) };
    if (bgColor !== undefined) colorOv.background = bgColor; else delete colorOv.background;
    if (bgAltColor !== undefined) colorOv.backgroundAlt = bgAltColor; else delete colorOv.backgroundAlt;
    if (textColor !== undefined) colorOv.text = textColor; else delete colorOv.text;

    if (Object.keys(colorOv).length > 0) {
      designParams.colorOverrides = colorOv;
    } else {
      delete designParams.colorOverrides;
    }

    // Merge opacity values
    const fx: Record<string, number> = { ...(designParams.effects as Record<string, number> || {}) };
    if (bgOpacity < 1) fx.backgroundOpacity = bgOpacity; else delete fx.backgroundOpacity;
    if (bgAltOpacity < 1) fx.backgroundAltOpacity = bgAltOpacity; else delete fx.backgroundAltOpacity;
    if (textOpacity < 1) fx.textOpacity = textOpacity; else delete fx.textOpacity;
    if (Object.keys(fx).length > 0) {
      designParams.effects = fx;
    } else {
      delete designParams.effects;
    }

    const contentUpdates: Partial<Node> = {
      title,
      tags: tags.length > 0 ? tags : undefined,
      properties: Object.keys(properties).length > 0 ? properties : undefined
    };

    this.#onSave(this.#nodeId, contentUpdates, { id: designId as DesignId, params: designParams }, scale);
    this.hide();
  }

  // ===========================================================================
  // DRAG
  // ===========================================================================

  #setupDrag(handle: HTMLElement, dialog: HTMLElement): void {
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', (e: MouseEvent) => {
      this.#isDragging = true;
      const rect = dialog.getBoundingClientRect();
      this.#dragOffsetX = e.clientX - rect.left;
      this.#dragOffsetY = e.clientY - rect.top;
      // Pin to current visual position before flexbox centering is lost
      dialog.style.left = `${rect.left}px`;
      dialog.style.top = `${rect.top}px`;
      dialog.style.transform = 'none';
      document.body.style.cursor = 'move';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.#isDragging) return;
      dialog.style.left = `${e.clientX - this.#dragOffsetX}px`;
      dialog.style.top = `${e.clientY - this.#dragOffsetY}px`;
    });

    document.addEventListener('mouseup', () => {
      this.#isDragging = false;
      document.body.style.cursor = '';
    });
  }
}
