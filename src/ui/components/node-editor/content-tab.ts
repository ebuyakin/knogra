/**
 * Node Editor - Content tab
 *
 * The everyday fields: comment, tags, equation. Title lives in the shell above
 * the tab strip, so renaming a node never costs a tab switch.
 */

import type { DesignId, Node } from '../../../core/main-types';
import { getSetting } from '../../../config';
import { createTextInput, createTextarea, el, text } from './editor-fields';
import { equationButtonLabel, showEquationDialog } from './equation-dialog';
import type {
  ContentTabValues,
  EditorTab,
  NodeEditorOnGenerateEquation
} from './node-editor-types';

export interface ContentTabDeps {
  node: Node;
  generateEquation: NodeEditorOnGenerateEquation | null;
  /** Element the equation overlay attaches to — the editor modal. */
  getOverlayHost: () => HTMLElement | null;
  getContainerRect: () => DOMRect | null;
  /** Current title text, used to seed the equation prompt. */
  getTitle: () => string;
  /** Ask the Design tab to switch design; returns false when the design is unavailable. */
  applyDesign: (designId: DesignId) => boolean;
}

export type ContentTab = EditorTab<ContentTabValues>;

export function createContentTab(deps: ContentTabDeps): ContentTab {
  const element = el('div', 'node-editor-panel');

  const commentValue = (deps.node.properties?.comment as string) || '';
  const comment = createTextarea(
    'Comment',
    commentValue,
    'Freeform notes about this node; included in AI context for the current scene',
    4
  );

  const tags = createTextInput(
    'Tags',
    (deps.node.tags || []).join(', '),
    'e.g., physics, quantum, important'
  );

  const equationValue = (deps.node.properties?.equation as string) || '';
  const equation = createTextarea('Equation (LaTeX)', equationValue, 'e.g., E = mc^2', 3);

  element.append(comment.container, tags.container, equation.container);

  // Directly under the field it writes to, rather than in the shell's footer:
  // it acts on this tab alone and means nothing from any other tab.
  if (deps.generateEquation) {
    element.appendChild(buildEquationButton(deps, deps.generateEquation, equation.input));
  }

  return {
    element,
    read: (): ContentTabValues => ({
      tags: tags.input.value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
      comment: comment.input.value,
      equation: equation.input.value
    })
  };
}

function buildEquationButton(
  deps: ContentTabDeps,
  generate: NodeEditorOnGenerateEquation,
  equationInput: HTMLTextAreaElement
): HTMLButtonElement {
  const button = text('button', equationButtonLabel(equationInput.value)) as HTMLButtonElement;
  button.type = 'button';
  button.className = 'node-editor-btn node-editor-btn-neutral';
  button.title = 'Generate a LaTeX equation with AI';

  button.addEventListener('click', () => {
    const host = deps.getOverlayHost();
    if (!host) return;
    showEquationDialog({
      host,
      containerRect: deps.getContainerRect(),
      title: deps.getTitle(),
      currentEquation: equationInput.value,
      generate,
      onGenerated: (latex) => {
        equationInput.value = latex;
        button.textContent = equationButtonLabel(latex);
        deps.applyDesign(getSetting('node.equationDesign'));
        equationInput.focus();
      }
    });
  });

  equationInput.addEventListener('input', () => {
    button.textContent = equationButtonLabel(equationInput.value);
  });

  return button;
}
