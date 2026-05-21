/**
 * FoldBadgeManager — Shows a "+" indicator on fold-root nodes.
 * Always visible (not toggled). Positioned at bottom-right of the node.
 * Follows the same HTML overlay pattern as ConnectionBadgeManager.
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import type { FeatureAPI } from '../../features/feature-api';
import { eventBus } from '../../events/event-bus';

export class FoldBadgeManager {
  #cy: Core;
  #features: FeatureAPI;
  #badgeLayer: HTMLDivElement;
  #badges: Map<NodeId, HTMLDivElement> = new Map();

  constructor(cy: Core, container: HTMLElement, features: FeatureAPI) {
    this.#cy = cy;
    this.#features = features;

    // Create badge overlay layer
    this.#badgeLayer = document.createElement('div');
    this.#badgeLayer.className = 'fold-badge-layer';
    container.appendChild(this.#badgeLayer);

    this.#setupEventListeners();
    this.#setupTransitionListeners();
  }

  /** Scan all nodes and show/hide badges based on current scene fold state. */
  updateAll(): void {
    const foldRoots = new Set<NodeId>();
    this.#cy.nodes().forEach(node => {
      const nodeId = node.id() as NodeId;
      if (this.#features.scene.isFolded(nodeId)) {
        foldRoots.add(nodeId);
      }
    });

    // Remove badges for nodes that are no longer fold roots
    for (const [nodeId, badge] of this.#badges) {
      if (!foldRoots.has(nodeId)) {
        badge.remove();
        this.#badges.delete(nodeId);
      }
    }

    // Create/update badges for current fold roots
    for (const nodeId of foldRoots) {
      let badge = this.#badges.get(nodeId);
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'fold-badge';
        badge.textContent = '+';
        badge.addEventListener('click', async () => {
          await this.#features.scene.unfoldNode(nodeId);
          this.updateAll();
        });
        this.#badgeLayer.appendChild(badge);
        this.#badges.set(nodeId, badge);
      }
      this.#positionBadge(nodeId, badge);
    }
  }

  /** Position badge at bottom-right corner of node */
  #positionBadge(nodeId: NodeId, badge: HTMLDivElement): void {
    const node = this.#cy.getElementById(nodeId);
    if (node.length === 0) return;

    const bbox = node.renderedBoundingBox();
    const x = bbox.x2 - 4;
    const y = bbox.y2 - 4;

    badge.style.left = `${x}px`;
    badge.style.top = `${y}px`;
  }

  #setupEventListeners(): void {
    const updatePositions = (): void => {
      for (const [nodeId, badge] of this.#badges) {
        this.#positionBadge(nodeId, badge);
      }
    };

    // Position updates (pan, zoom, drag)
    this.#cy.on('pan zoom', updatePositions);
    this.#cy.on('position', 'node', updatePositions);

    // Fold state changes and scene composition changes trigger a full scan.
    this.#cy.on('style', 'node', () => this.updateAll());
    this.#cy.on('add remove', () => this.updateAll());
  }

  #setupTransitionListeners(): void {
    eventBus.on('transitionStart', () => {
      this.#badgeLayer.style.display = 'none';
    });

    eventBus.on('transitionEnd', () => {
      this.#badgeLayer.style.display = 'block';
      this.updateAll();
    });

    eventBus.on('sceneChanged', () => {
      this.updateAll();
    });
  }

  destroy(): void {
    this.#badgeLayer.remove();
    this.#badges.clear();
  }
}
