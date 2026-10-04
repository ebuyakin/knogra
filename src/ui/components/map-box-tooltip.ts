/**
 * MapBoxTooltip — hover on the map view's small boxes.
 * Hovering a box the feature says needs a preview (every marker, and a
 * landmark crowding shrank) shows its title beside it. A single tap anywhere
 * collapses an open balloon; the clicks that open one are wired with the
 * map's other clicks in ContextMenu (docs/map-view.md §5.3). Same HTML
 * overlay pattern as AnchorLinkTooltip.
 */

import type { Core, EventObject } from 'cytoscape';
import type { FeatureAPI } from '../../features/feature-api';
import '../../styles/map-box-tooltip.css';

export class MapBoxTooltip {
  #cy: Core;
  #container: HTMLElement;
  #features: FeatureAPI;
  #element: HTMLDivElement | null = null;

  constructor(cy: Core, container: HTMLElement, features: FeatureAPI) {
    this.#cy = cy;
    this.#container = container;
    this.#features = features;
    this.#setupEventListeners();
  }

  hide(): void {
    if (this.#element) {
      this.#element.remove();
      this.#element = null;
    }
  }

  #setupEventListeners(): void {
    this.#cy.on('mouseover', 'node', (event: EventObject) => {
      const elementId = event.target.id() as string;
      // A ballooned box is readable as it is; the tooltip would sit on top of it.
      if (!this.#needsPreview(event) || this.#features.mapView.isBallooned(elementId)) return;
      // A node the map quiz hides must not be given away by its title.
      const nodeId = this.#features.mapView.nodeOf(elementId);
      if (nodeId !== null && this.#features.mapQuiz.statusOf(nodeId) === 'hidden') return;
      this.#show(event.target.data('title') as string, event.target.renderedPosition());
    });
    this.#cy.on('mouseout', 'node', () => this.hide());
    this.#cy.on('grab', 'node', () => this.hide());
    // The clicks that balloon a box (right-click, double-click) take the tooltip away first.
    this.#cy.on('cxttap dbltap', () => this.hide());
    this.#cy.on('tap', () => this.#features.mapView.collapsePreview());
  }

  #show(title: string, position: { x: number; y: number }): void {
    this.hide();
    const tooltip = document.createElement('div');
    tooltip.className = 'map-box-tooltip';
    tooltip.textContent = title;
    this.#container.appendChild(tooltip);
    this.#element = tooltip;

    const offset = 14;
    tooltip.style.left = `${position.x + offset}px`;
    tooltip.style.top = `${position.y - offset}px`;
    const tooltipRect = tooltip.getBoundingClientRect();
    const containerRect = this.#container.getBoundingClientRect();
    if (tooltipRect.right > containerRect.right) {
      tooltip.style.left = `${Math.max(8, position.x - tooltipRect.width - offset)}px`;
    }
  }

  #needsPreview(event: EventObject): boolean {
    return typeof event.target.id === 'function' && this.#features.mapView.needsPreview(event.target.id() as string);
  }
}
