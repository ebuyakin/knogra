/**
 * Node Editor - equation generation dialog
 *
 * Nested prompt dialog for AI-generated LaTeX. Anchored to the Cytoscape
 * container rect and hosted inside the editor modal so it dims only the editor.
 */

import { createTextarea, el, text } from './editor-fields';
import type { NodeEditorOnGenerateEquation } from './node-editor-types';

export interface EquationDialogOptions {
  /** Element the overlay is appended to — the editor modal. */
  host: HTMLElement;
  containerRect: DOMRect | null;
  title: string;
  currentEquation: string;
  generate: NodeEditorOnGenerateEquation;
  onGenerated: (latex: string) => void;
}

const GENERATE_LABEL = 'Generate (Ctrl+↵)';

export function equationButtonLabel(equation: string): string {
  return equation.trim() ? 'Replace Equation' : 'Add Equation';
}

function buildEquationPrompt(title: string): string {
  const subject = title.trim() || 'this node';
  return `Generate a LaTeX equation for "${subject}".`;
}

export function showEquationDialog(options: EquationDialogOptions): void {
  const { host, containerRect, title, currentEquation, generate, onGenerated } = options;

  const overlay = el('div', 'node-editor-equation-overlay');
  if (containerRect) {
    overlay.style.left = `${containerRect.left}px`;
    overlay.style.top = `${containerRect.top}px`;
    overlay.style.width = `${containerRect.width}px`;
    overlay.style.height = `${containerRect.height}px`;
  }

  const dialog = el('div', 'node-editor-equation-dialog');
  dialog.addEventListener('click', (event) => event.stopPropagation());

  const heading = text('h3', currentEquation.trim() ? 'Replace Equation' : 'Add Equation');
  heading.className = 'node-editor-equation-title';

  const promptInput = createTextarea(
    'Prompt',
    buildEquationPrompt(title),
    'Describe the equation you want',
    5
  );
  promptInput.input.classList.add('node-editor-equation-prompt');

  const error = text('div', '');
  error.className = 'node-editor-equation-error';

  const footer = el('div', 'node-editor-equation-footer');
  const cancelBtn = text('button', 'Cancel') as HTMLButtonElement;
  cancelBtn.className = 'node-editor-btn node-editor-btn-cancel';
  const generateBtn = text('button', GENERATE_LABEL) as HTMLButtonElement;
  generateBtn.className = 'node-editor-btn node-editor-btn-save';

  const close = (): void => overlay.remove();

  const setBusy = (busy: boolean): void => {
    generateBtn.disabled = busy;
    cancelBtn.disabled = busy;
    promptInput.input.disabled = busy;
    generateBtn.textContent = busy ? 'Generating...' : GENERATE_LABEL;
  };

  const fail = (message: string): void => {
    error.textContent = message;
    setBusy(false);
    promptInput.input.focus();
  };

  const submit = async (): Promise<void> => {
    const prompt = promptInput.input.value.trim();
    if (!prompt) {
      error.textContent = 'Prompt is required.';
      return;
    }

    error.textContent = '';
    setBusy(true);

    try {
      const result = await generate({ title, currentEquation, prompt });
      if (result.type === 'clarification') {
        fail(result.message);
        return;
      }
      onGenerated(result.latex.trim());
      close();
    } catch (caught) {
      fail(caught instanceof Error ? caught.message : 'Could not generate equation.');
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
  host.appendChild(overlay);
  promptInput.input.focus();
  promptInput.input.select();
}
