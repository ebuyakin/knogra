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
import type { MenuItem, MenuPosition } from './menu-renderer';
import { buildNodeMenu } from './node-menu';
import { buildEdgeMenu } from './edge-menu';
import { buildCanvasMenu } from './canvas-menu';
import { openNodeEditor, openEdgeEditor } from '../components/editor-openers';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';

export type { MenuItem } from './menu-renderer';
export type { MenuDependencies } from './menu-context';

export class ContextMenu {
  #deps: MenuDependencies;
  #renderer: MenuRenderer;
  #clipboard = new StyleClipboard();
  #pendingShow: number | null = null;

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
      this.#showWhenActive(buildNodeMenu(this.#deps, this.#clipboard, nodeId, position), position);
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
      this.#showWhenActive(buildEdgeMenu(this.#deps, this.#clipboard, edgeId), position);
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
        this.#showWhenActive(buildCanvasMenu(this.#deps, position), position);
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
   * Show a menu only while the window is active.
   *
   * On macOS a right-click into an inactive window does not activate it. The
   * menu would render but receive no hover events, and would swallow its first
   * click as the activation click. Withholding it keeps the screen honest, and
   * — because the menu can then only exist in a focused window — guarantees the
   * `blur` handler below actually fires when the user switches away.
   *
   * The retry covers platforms where a click *does* activate the window:
   * activation can land after this handler runs, so a single synchronous test
   * would wrongly suppress the menu there.
   */
  #showWhenActive(items: MenuItem[], position: MenuPosition): void {
    this.#cancelPendingShow();
    if (document.hasFocus()) {
      this.#renderer.show(items, position);
      return;
    }
    this.#pendingShow = requestAnimationFrame(() => {
      this.#pendingShow = null;
      if (document.hasFocus()) this.#renderer.show(items, position);
    });
  }

  #cancelPendingShow(): void {
    if (this.#pendingShow !== null) {
      cancelAnimationFrame(this.#pendingShow);
      this.#pendingShow = null;
    }
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.#cancelPendingShow();
    this.#renderer.close();
    this.#deps.cy.off('cxttap');
  }
}
