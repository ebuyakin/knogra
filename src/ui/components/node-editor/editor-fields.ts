/**
 * Node Editor - form field factories
 *
 * Presentation-only builders shared by the three tabs and the shell. They were
 * private methods on `NodeEditor`; splitting the tabs out left them without an
 * owner, so they get their own module rather than one tab importing another.
 */

export function el(tag: string, className: string): HTMLDivElement {
  const element = document.createElement(tag) as HTMLDivElement;
  element.className = className;
  return element;
}

export function text(tag: string, content: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = content;
  return element;
}

/** Non-foldable section caption. Tabs replaced the collapsible sections. */
export function caption(title: string): HTMLElement {
  const element = text('div', title);
  element.className = 'node-editor-caption';
  return element;
}

export function createTextInput(
  label: string,
  value: string,
  placeholder?: string
): { container: HTMLDivElement; input: HTMLInputElement } {
  const container = el('div', 'node-editor-field');
  container.appendChild(text('label', label)).className = 'node-editor-label';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'node-editor-input';
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  container.appendChild(input);
  return { container, input };
}

export interface TextareaOptions {
  /**
   * Grow the row count to fit existing content. Off for fields inside the fixed
   * frame that must not push their neighbours around (the title).
   */
  autoGrow?: boolean;
}

export function createTextarea(
  label: string,
  value: string,
  placeholder: string,
  rows: number,
  options: TextareaOptions = {}
): { container: HTMLDivElement; input: HTMLTextAreaElement } {
  const container = el('div', 'node-editor-field');
  if (label) {
    container.appendChild(text('label', label)).className = 'node-editor-label';
  }
  const input = document.createElement('textarea');
  input.className = 'node-editor-textarea';
  input.value = value;
  input.placeholder = placeholder;
  input.rows = rows;
  if (value && options.autoGrow !== false) {
    const lineCount = value.split('\n').length + 1;
    if (lineCount > rows) input.rows = lineCount;
  }
  container.appendChild(input);
  return { container, input };
}

export function createSelect(
  label: string,
  currentValue: string,
  options: string[]
): { container: HTMLDivElement; select: HTMLSelectElement } {
  const container = el('div', 'node-editor-inline-row');
  const labelEl = text('span', label);
  labelEl.className = 'node-editor-inline-label';
  const select = document.createElement('select');
  select.className = 'node-editor-select';
  for (const option of options) {
    const optionEl = document.createElement('option');
    optionEl.value = option;
    optionEl.textContent = option;
    optionEl.selected = option === currentValue;
    select.appendChild(optionEl);
  }
  container.append(labelEl, select);
  return { container, select };
}

export function createNumberInput(
  label: string,
  value: number,
  min: string,
  max: string,
  step: string
): { container: HTMLLabelElement; input: HTMLInputElement } {
  const container = document.createElement('label');
  container.className = 'node-editor-number-row';
  const labelEl = text('span', label);
  labelEl.className = 'node-editor-inline-label';
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'node-editor-scale-input';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = String(value);
  container.append(labelEl, input);
  return { container, input };
}

export interface ColorWithOpacityRow {
  container: HTMLDivElement;
  getColor: () => string | undefined;
  getOpacity: () => number;
}

/**
 * Combined colour picker + opacity slider on one line. `getColor()` returns
 * `undefined` while the row still follows the theme, so the caller can tell
 * "explicitly this colour" from "no override".
 */
export function createColorWithOpacity(
  label: string,
  colorValue: string | undefined,
  themeColor: string,
  opacityValue: number
): ColorWithOpacityRow {
  const container = el('div', 'node-editor-inline-row');

  const labelEl = text('span', label);
  labelEl.className = 'node-editor-inline-label';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'node-editor-color-input';
  colorInput.value = colorValue || themeColor;

  let isColorSet = !!colorValue;

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
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

  const opacityVal = text('span', opacityValue.toFixed(2));
  opacityVal.className = 'node-editor-opacity-value';
  opacityInput.addEventListener('input', () => {
    opacityVal.textContent = opacityInput.valueAsNumber.toFixed(2);
  });

  container.append(labelEl, colorInput, resetBtn, opacityInput, opacityVal);

  return {
    container,
    getColor: (): string | undefined => (isColorSet ? colorInput.value : undefined),
    getOpacity: (): number => opacityInput.valueAsNumber
  };
}

export function numberParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Returns null and focuses the offending input when the value is out of range. */
export function readNumberInput(input: HTMLInputElement, label: string): number | null {
  const value = input.valueAsNumber;
  const min = input.min ? Number(input.min) : -Infinity;
  const max = input.max ? Number(input.max) : Infinity;
  if (!Number.isFinite(value) || value < min || value > max) {
    alert(`${label} must be a number between ${input.min} and ${input.max}.`);
    input.focus();
    return null;
  }
  return value;
}
