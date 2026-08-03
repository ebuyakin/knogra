/**
 * QuickTitleEditor - chromeless popover for renaming a node in place.
 *
 * Editing the title is the dominant node edit, so it should not cost a full
 * modal. The popover is anchored below the node (never over it — node width is
 * design-driven and an overlay would look misaligned), holds a single-line
 * input and nothing else: Enter commits, Escape cancels, Tab escalates to the
 * full Node Editor carrying the typed text.
 *
 * The component owns positioning and key handling only. It knows nothing about
 * NodeEditor, the feature layer or storage — saving, conflict checks and
 * escalation are all caller-supplied callbacks.
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import '../../styles/quick-title-editor.css';

export interface QuickTitleEditorHandlers {
  /** Persist the new title. Called only when the title changed and is valid. */
  onSave: (title: string) => Promise<void>;
  /** True when another node already uses this title. */
  hasConflict: (title: string) => boolean;
  /** Open the full editor, seeded with whatever the user had typed. */
  onEscalate: (typedTitle: string) => void;
}

const POPOVER_WIDTH = 260;
/** Gap between the node's bounding box and the popover. */
const NODE_GAP = 12;
/** Minimum distance kept from the container edges. */
const EDGE_MARGIN = 8;
/** Keeps the connector triangle inside the popover's rounded corners. */
const CONNECTOR_INSET = 14;

export class QuickTitleEditor {
  #cy: Core;
  #container: HTMLElement;
  #element: HTMLDivElement | null = null;
  #input: HTMLInputElement | null = null;
  #hint: HTMLDivElement | null = null;
  #handlers: QuickTitleEditorHandlers | null = null;
  #nodeId: NodeId | null = null;
  #originalTitle = '';
  #outsideClickHandler: (event: MouseEvent) => void;
  #viewportChangedHandler: () => void;

  constructor(cy: Core, container: HTMLElement) {
    this.#cy = cy;
    this.#container = container;

    this.#outsideClickHandler = (event) => {
      if (this.#element?.contains(event.target as Node)) return;
      this.hide();
    };

    // Panning, zooming or leaving the scene detaches the popover from its node,
    // so the edit is abandoned rather than left floating.
    this.#viewportChangedHandler = () => {
      if (this.#element) this.hide();
    };
    this.#cy.on('pan zoom scene:changed', this.#viewportChangedHandler);
  }

  isOpen(): boolean {
    return this.#element !== null;
  }

  show(nodeId: NodeId, currentTitle: string, handlers: QuickTitleEditorHandlers): void {
    this.hide();

    if (this.#cy.getElementById(nodeId).length === 0) return;

    this.#nodeId = nodeId;
    this.#originalTitle = currentTitle;
    this.#handlers = handlers;

    const popover = document.createElement('div');
    popover.className = 'quick-title-editor';
    popover.addEventListener('mousedown', (event) => event.stopPropagation());

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quick-title-editor-input';
    input.value = currentTitle;
    input.setAttribute('aria-label', 'Node title');
    input.addEventListener('keydown', (event) => this.#handleInputKeydown(event));
    input.addEventListener('input', () => this.#clearHint());
    popover.appendChild(input);

    this.#container.appendChild(popover);
    this.#element = popover;
    this.#input = input;
    this.#position();

    input.focus();
    // Select-all so typing replaces the title outright, the usual rename idiom.
    input.select();

    document.addEventListener('click', this.#outsideClickHandler, true);
  }

  hide(): void {
    if (this.#element) {
      this.#element.remove();
      this.#element = null;
    }
    this.#input = null;
    this.#hint = null;
    this.#handlers = null;
    this.#nodeId = null;
    this.#originalTitle = '';
    document.removeEventListener('click', this.#outsideClickHandler, true);
  }

  destroy(): void {
    this.hide();
    this.#cy.off('pan zoom scene:changed', this.#viewportChangedHandler);
  }

  // ===========================================================================
  // INTERACTION
  // ===========================================================================

  #handleInputKeydown(event: KeyboardEvent): void {
    // The global shortcut handler must never see typing in this field.
    event.stopPropagation();

    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        this.#commit();
        break;
      case 'Escape':
        event.preventDefault();
        this.hide();
        break;
      case 'Tab':
        event.preventDefault();
        this.#escalate();
        break;
    }
  }

  #commit(): void {
    if (!this.#input || !this.#handlers) return;

    const title = this.#input.value.trim();
    if (!title) {
      this.#showHint('Title cannot be empty');
      return;
    }
    if (title === this.#originalTitle) {
      this.hide();
      return;
    }
    if (this.#handlers.hasConflict(title)) {
      this.#showHint('Another node already has this title');
      return;
    }

    // Capture before hide(), which clears the handlers.
    const { onSave } = this.#handlers;
    this.hide();
    void onSave(title).catch((error) => {
      console.error('Quick title save failed:', error);
    });
  }

  #escalate(): void {
    if (!this.#input || !this.#handlers) return;

    const typedTitle = this.#input.value;
    const { onEscalate } = this.#handlers;
    this.hide();
    onEscalate(typedTitle);
  }

  #showHint(message: string): void {
    if (!this.#element) return;

    if (!this.#hint) {
      this.#hint = document.createElement('div');
      this.#hint.className = 'quick-title-editor-hint';
      this.#hint.setAttribute('role', 'alert');
      this.#element.appendChild(this.#hint);
    }
    this.#hint.textContent = message;
    this.#position();
    this.#input?.focus();
  }

  #clearHint(): void {
    if (!this.#hint) return;
    this.#hint.remove();
    this.#hint = null;
    this.#position();
  }

  // ===========================================================================
  // POSITIONING
  // ===========================================================================

  /**
   * Anchor the popover below the node's rendered box, flipping above it and
   * clamping to the container when there is not enough room.
   */
  #position(): void {
    if (!this.#element || !this.#nodeId) return;

    const node = this.#cy.getElementById(this.#nodeId);
    if (node.length === 0) return;

    const box = node.renderedBoundingBox();
    const nodeCenterX = (box.x1 + box.x2) / 2;
    const maxLeft = Math.max(
      EDGE_MARGIN,
      this.#container.clientWidth - POPOVER_WIDTH - EDGE_MARGIN
    );
    const left = Math.min(Math.max(nodeCenterX - POPOVER_WIDTH / 2, EDGE_MARGIN), maxLeft);

    const height = this.#element.offsetHeight;
    let top = box.y2 + NODE_GAP;
    let isAbove = false;

    if (top + height + EDGE_MARGIN > this.#container.clientHeight) {
      const topIfAbove = box.y1 - NODE_GAP - height;
      if (topIfAbove >= EDGE_MARGIN) {
        top = topIfAbove;
        isAbove = true;
      } else {
        top = Math.max(EDGE_MARGIN, this.#container.clientHeight - height - EDGE_MARGIN);
      }
    }

    this.#element.style.left = `${left}px`;
    this.#element.style.top = `${top}px`;
    this.#element.classList.toggle('quick-title-editor-above', isAbove);

    // The connector keeps pointing at the node even when the popover is clamped.
    const connectorX = Math.min(
      Math.max(nodeCenterX - left, CONNECTOR_INSET),
      POPOVER_WIDTH - CONNECTOR_INSET
    );
    this.#element.style.setProperty('--quick-title-connector-x', `${connectorX}px`);
  }
}
