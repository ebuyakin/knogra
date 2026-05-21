/**
 * ConnectionBadgeManager - Shows hidden connection counts on nodes
 * Displays X/Y badge where X=hidden parents, Y=hidden children
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';
import { findDirectChildren, findDirectParents } from '../../features/utils/pure/scene-calculations';
import { eventBus } from '../../events/event-bus';

export class ConnectionBadgeManager {
  #cy: Core;
  #container: HTMLElement;
  #badgeLayer: HTMLDivElement;
  #badges: Map<NodeId, HTMLDivElement> = new Map();
  #visible: boolean = false;

  constructor(cy: Core, container: HTMLElement) {
    this.#cy = cy;
    this.#container = container;

    // Create badge overlay layer
    this.#badgeLayer = document.createElement('div');
    this.#badgeLayer.className = 'connection-badge-layer';
    this.#badgeLayer.style.display = 'none';
    this.#container.appendChild(this.#badgeLayer);

    // Setup Cytoscape event listeners for position updates
    this.#setupEventListeners();
    
    // Subscribe to transition events to hide/show badges
    this.#setupTransitionListeners();
  }

  /**
   * Toggle badge visibility
   */
  toggle(): void {
    this.#visible = !this.#visible;
    if (this.#visible) {
      this.show();
    } else {
      this.hide();
    }
  }

  /**
   * Show all badges
   */
  show(): void {
    this.#visible = true;
    this.#badgeLayer.style.display = 'block';
    this.updateAll();
  }

  /**
   * Hide all badges
   */
  hide(): void {
    this.#visible = false;
    this.#badgeLayer.style.display = 'none';
  }

  /**
   * Update all badges (recalculate counts and positions)
   */
  updateAll(): void {
    if (!this.#visible) return;

    // Get all nodes currently in scene
    const nodesInScene = new Set<NodeId>(
      this.#cy.nodes().map(n => n.id() as NodeId)
    );

    // Remove badges for nodes no longer in scene
    for (const [nodeId, badge] of this.#badges) {
      if (!nodesInScene.has(nodeId)) {
        badge.remove();
        this.#badges.delete(nodeId);
      }
    }

    // Update/create badges for each node in scene
    this.#cy.nodes().forEach(node => {
      const nodeId = node.id() as NodeId;
      this.#updateBadge(nodeId, nodesInScene);
    });
  }

  /**
   * Update badge for a single node
   */
  #updateBadge(nodeId: NodeId, nodesInScene: Set<NodeId>): void {
    // Calculate hidden counts
    const allParents = findDirectParents(nodeId, graphStore.edges);
    const allChildren = findDirectChildren(nodeId, graphStore.edges);
    
    const hiddenParents = allParents.filter(id => !nodesInScene.has(id)).length;
    const hiddenChildren = allChildren.filter(id => !nodesInScene.has(id)).length;

    // Get or create badge element
    let badge = this.#badges.get(nodeId);

    // Hide badge if no hidden connections
    if (hiddenParents === 0 && hiddenChildren === 0) {
      if (badge) {
        badge.style.display = 'none';
      }
      return;
    }

    // Create badge if doesn't exist
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'connection-badge';
      this.#badgeLayer.appendChild(badge);
      this.#badges.set(nodeId, badge);
    }

    // Update content
    badge.textContent = `${hiddenParents}/${hiddenChildren}`;
    badge.style.display = 'block';

    // Update position
    this.#positionBadge(nodeId, badge);
  }

  /**
   * Position badge at top-right corner of node
   */
  #positionBadge(nodeId: NodeId, badge: HTMLDivElement): void {
    const node = this.#cy.getElementById(nodeId);
    if (node.length === 0) return;

    const bbox = node.renderedBoundingBox();
    
    // Position at top-right, slightly overlapping
    const x = bbox.x2 - 8;  // Offset left from right edge
    const y = bbox.y1 - 8;  // Offset up from top edge

    badge.style.left = `${x}px`;
    badge.style.top = `${y}px`;
  }

  /**
   * Setup event listeners for position/content updates
   */
  #setupEventListeners(): void {
    const updatePositions = () => {
      if (!this.#visible) return;
      this.#cy.nodes().forEach(node => {
        const nodeId = node.id() as NodeId;
        const badge = this.#badges.get(nodeId);
        if (badge && badge.style.display !== 'none') {
          this.#positionBadge(nodeId, badge);
        }
      });
    };

    const updateAll = () => this.updateAll();

    // Position updates (pan, zoom, drag)
    this.#cy.on('pan zoom', updatePositions);
    this.#cy.on('position', 'node', updatePositions);

    // Content updates (nodes added/removed)
    this.#cy.on('add remove', updateAll);
  }

  /**
   * Subscribe to transition events to hide badges during animations
   */
  #setupTransitionListeners(): void {
    eventBus.on('transitionStart', () => {
      // Hide badge layer during transition (preserves #visible state)
      this.#badgeLayer.style.display = 'none';
    });

    eventBus.on('transitionEnd', () => {
      // Restore badge layer if it was visible before transition
      if (this.#visible) {
        this.#badgeLayer.style.display = 'block';
        this.updateAll();  // Recalculate for new scene
      }
    });
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.#badgeLayer.remove();
    this.#badges.clear();
    // Note: Cytoscape event handlers are cleaned up when cy is destroyed
  }
}
