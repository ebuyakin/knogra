import type { Core } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import type { AnchorLinkResult } from '../../features/graph/anchor-traversal';
import '../../styles/anchor-link-tooltip.css';

const TOOLTIP_TIMEOUT_MS = 7000;

export class AnchorLinkTooltip {
  #cy: Core;
  #container: HTMLElement;
  #element: HTMLDivElement | null = null;
  #hideTimeout: ReturnType<typeof setTimeout> | null = null;
  #clickHandler: (event: MouseEvent) => void;
  #keydownHandler: (event: KeyboardEvent) => void;
  #sceneChangedHandler: () => void;

  constructor(cy: Core, container: HTMLElement) {
    this.#cy = cy;
    this.#container = container;
    this.#clickHandler = (event) => {
      if (this.#element?.contains(event.target as Node)) return;
      this.hide();
    };
    this.#keydownHandler = (event) => {
      if (event.key === 'Escape') {
        this.hide();
      }
    };
    this.#sceneChangedHandler = () => this.hide();
    this.#cy.on('scene:changed', this.#sceneChangedHandler);
  }

  showAtRenderedPosition(result: AnchorLinkResult, position: { x: number; y: number }): void {
    this.#show(result, position);
  }

  showForNode(result: AnchorLinkResult, nodeId: NodeId): void {
    const node = this.#cy.getElementById(nodeId);
    if (node.length === 0) {
      const rect = this.#container.getBoundingClientRect();
      this.#show(result, { x: rect.width / 2, y: rect.height / 2 });
      return;
    }

    const position = node.renderedPosition();
    this.#show(result, { x: position.x, y: position.y });
  }

  hide(): void {
    if (this.#hideTimeout) {
      clearTimeout(this.#hideTimeout);
      this.#hideTimeout = null;
    }
    if (this.#element) {
      this.#element.remove();
      this.#element = null;
    }
    document.removeEventListener('click', this.#clickHandler, true);
    document.removeEventListener('keydown', this.#keydownHandler);
  }

  destroy(): void {
    this.hide();
    this.#cy.off('scene:changed', this.#sceneChangedHandler);
  }

  #show(result: AnchorLinkResult, position: { x: number; y: number }): void {
    this.hide();

    const tooltip = document.createElement('div');
    tooltip.className = `anchor-link-tooltip anchor-link-tooltip-${result.status}`;
    tooltip.setAttribute('role', 'status');
    tooltip.setAttribute('aria-live', 'polite');
    tooltip.textContent = this.#formatResult(result);

    this.#container.appendChild(tooltip);
    this.#element = tooltip;
    this.#positionTooltip(tooltip, position);

    document.addEventListener('click', this.#clickHandler, true);
    document.addEventListener('keydown', this.#keydownHandler);
    this.#hideTimeout = setTimeout(() => this.hide(), TOOLTIP_TIMEOUT_MS);
  }

  #positionTooltip(tooltip: HTMLDivElement, position: { x: number; y: number }): void {
    const offset = 14;
    tooltip.style.left = `${position.x + offset}px`;
    tooltip.style.top = `${position.y - offset}px`;

    const tooltipRect = tooltip.getBoundingClientRect();
    const containerRect = this.#container.getBoundingClientRect();

    if (tooltipRect.right > containerRect.right) {
      tooltip.style.left = `${Math.max(8, position.x - tooltipRect.width - offset)}px`;
    }
    if (tooltipRect.top < containerRect.top) {
      tooltip.style.top = `${position.y + offset}px`;
    }
    if (tooltipRect.bottom > containerRect.bottom) {
      tooltip.style.top = `${Math.max(8, containerRect.height - tooltipRect.height - 8)}px`;
    }
  }

  #formatResult(result: AnchorLinkResult): string {
    switch (result.status) {
      case 'linked':
        return result.titles.slice(0, -1).join(' / ') || result.titles[0] || 'Anchor';
      case 'no-anchor':
        return 'No anchor node is set.';
      case 'missing-target':
        return 'Node not found.';
      case 'disconnected':
        return `No link from ${result.anchorTitle} to ${result.targetTitle}.`;
    }
  }
}