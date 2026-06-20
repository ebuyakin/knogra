/**
 * EdgeCreationMode
 *
 * Temporary UI interaction for creating one or more edges from a fixed source node.
 */

import type cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import type { NodeId } from '../core/main-types';
import type { FeatureAPI } from '../features/feature-api';
import { isEditMode } from '../storage/app-mode';

export class EdgeCreationMode {
  #cy: Core;
  #container: HTMLElement;
  #features: FeatureAPI;
  #tapHandler: ((event: cytoscape.EventObject) => void) | null = null;
  #persistent = false;

  constructor(cy: Core, container: HTMLElement, features: FeatureAPI) {
    this.#cy = cy;
    this.#container = container;
    this.#features = features;
  }

  start(sourceId: NodeId, persistent = false): void {
    if (!isEditMode()) return;

    this.cancel();
    this.#persistent = persistent;
    this.#container.style.cursor = 'crosshair';

    const handler = (event: cytoscape.EventObject): void => {
      const targetId = event.target.id() as NodeId;
      if (targetId === sourceId) return;

      this.#features.graph.addEdge(sourceId, targetId);

      if (!this.#persistent) {
        this.cancel();
      }
    };

    this.#tapHandler = handler;
    this.#cy.on('tap', 'node', handler);
  }

  cancel(): void {
    if (this.#tapHandler) {
      this.#cy.off('tap', 'node', this.#tapHandler);
      this.#tapHandler = null;
    }

    this.#persistent = false;
    this.#container.style.cursor = 'default';
  }
}
