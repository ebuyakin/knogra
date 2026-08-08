/**
 * ContextMenu — public face of the context menu subsystem.
 * Owns the Cytoscape event wiring (right-click, double-tap) and menu
 * lifecycle (close on click/escape/blur). Menu content comes from the
 * per-surface builders (node-menu, edge-menu, canvas-menu); rendering
 * is delegated to MenuRenderer.
 */

import type { NodeId } from '../../core/main-types';
import type { MenuDependencies } from './menu-context';
import { StyleClipboard } from './menu-context';
import { MenuRenderer } from './menu-renderer';
import { buildNodeMenu } from './node-menu';
import { buildEdgeMenu } from './edge-menu';
import { buildCanvasMenu } from './canvas-menu';
import { openNodeEditor, openEdgeEditor } from './editor-openers';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';

export type { MenuItem } from './menu-renderer';
export type { MenuDependencies } from './menu-context';

export class ContextMenu {
  #deps: MenuDependencies;
  #renderer: MenuRenderer;
  #clipboard = new StyleClipboard();

  constructor(deps: MenuDependencies) {
    this.#deps = deps;
    this.#renderer = new MenuRenderer(deps.container);
    this.#setupContextMenuListeners();
  }

  /**
   * Setup context menu event listeners
   */
  #setupContextMenuListeners(): void {
    const cy = this.#deps.cy;

    // Listen for right-click on nodes
    cy.on('cxttap', 'node', (event) => {
      event.preventDefault();
      const nodeId = event.target.id() as NodeId;
      const position = event.renderedPosition;
      this.#renderer.show(buildNodeMenu(this.#deps, this.#clipboard, nodeId, position), position);
    });

    // Double-click on node → edit or navigate based on setting
    cy.on('dbltap', 'node', (event) => {
      const nodeId = event.target.id() as NodeId;
      if (getSetting('interaction.doubleClickNode') === 'navigate' || !isEditMode()) {
        this.#deps.features.transition.goToSceneByNode(nodeId);
      } else {
        openNodeEditor(this.#deps, nodeId);
      }
    });

    // Listen for right-click on edges
    cy.on('cxttap', 'edge', (event) => {
      event.preventDefault();
      const edgeId = event.target.id();
      const position = event.renderedPosition;
      this.#renderer.show(buildEdgeMenu(this.#deps, this.#clipboard, edgeId), position);
    });

    // Double-click on edge → open editor
    cy.on('dbltap', 'edge', (event) => {
      if (!isEditMode()) return;
      const edgeId = event.target.id();
      openEdgeEditor(this.#deps, edgeId);
    });

    // Double-click on empty canvas → create a free node there
    cy.on('dbltap', (event) => {
      if (event.target !== cy) return;
      if (!isEditMode()) return;
      this.#deps.features.graph.addFreeNode(event.position);
    });

    // Listen for right-click on canvas
    cy.on('cxttap', (event) => {
      // Only handle if not on a node or edge
      if (event.target === cy) {
        event.preventDefault();
        const position = event.renderedPosition;
        this.#renderer.show(buildCanvasMenu(this.#deps, position), position);
      }
    });

    // Close menu on any click outside
    document.addEventListener('click', () => {
      this.#renderer.close();
    });

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.#renderer.close();
      }
    });

    // Close stale custom menus when the browser window/tab stops being active.
    window.addEventListener('blur', () => {
      this.#renderer.close();
    });

    window.addEventListener('pagehide', () => {
      this.#renderer.close();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        this.#renderer.close();
      }
    });
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.#renderer.close();
    this.#deps.cy.off('cxttap');
  }
}
