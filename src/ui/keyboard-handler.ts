/**
 * KeyboardHandler - Handles keyboard shortcuts for graph operations
 * Listens to keyboard events, delegates actions to FeatureAPI
 */

import type cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import type { NodeId } from '../core/main-types';
import type { FeatureAPI } from '../features/feature-api';
import type { ConnectionBadgeManager } from './components/connection-badge';
import { isDebug } from '../config/debug-flags';
import type { NodeEditor, NodeEditorContext } from './components/node-editor';
import type { NodeManager } from './components/node-manager';
import { SettingsModal } from './components/settings-modal';
import { ShortcutOverlay } from './components/shortcut-overlay';
import { getAppMode, isEditMode, setAppMode } from '../storage/app-mode';
import { exportWorkspace, showImportDialog, newWorkspace } from '../storage/workspace';
import { generateEquationFromPrompt } from '../ai/equation-generator';

export class KeyboardHandler {
  #cy: Core;
  #features: FeatureAPI;
  #badgeManager: ConnectionBadgeManager | null;
  #nodeEditor: NodeEditor | null;
  #nodeManager: NodeManager | null;
  #container: HTMLElement | null;
  #settingsModal: SettingsModal;
  #shortcutOverlay: ShortcutOverlay;
  #enabled: boolean = true;
  #keydownHandler: (event: KeyboardEvent) => void;

  constructor(
    cy: Core, 
    features: FeatureAPI, 
    badgeManager: ConnectionBadgeManager | null = null,
    nodeEditor: NodeEditor | null = null,
    nodeManager: NodeManager | null = null,
    container: HTMLElement | null = null
  ) {
    this.#cy = cy;
    this.#features = features;
    this.#badgeManager = badgeManager;
    this.#nodeEditor = nodeEditor;
    this.#nodeManager = nodeManager;
    this.#container = container;
    this.#settingsModal = new SettingsModal();
    this.#shortcutOverlay = new ShortcutOverlay();
    
    // Store handler reference for cleanup
    this.#keydownHandler = (event: KeyboardEvent) => {
      if (!this.#enabled) return;

      const key = event.key.toLowerCase();
      
      // Handle Escape from chat input (before the input field check)
      if (key === 'escape') {
        // Close shortcut overlay if open
        if (this.#shortcutOverlay.isOpen()) {
          event.preventDefault();
          this.#shortcutOverlay.hide();
          return;
        }

        const chatInput = document.querySelector('.chat-input') as HTMLTextAreaElement;
        if (document.activeElement === chatInput) {
          event.preventDefault();
          chatInput.blur();
          const centralNodeId = this.#features.scene.getCentralNodeId();
          if (centralNodeId) {
            this.#cy.$(':selected').unselect();
            this.#cy.getElementById(centralNodeId).select();
          }
          return;
        }
      }

      // F1 - Toggle shortcut overlay (works even in input fields)
      if (key === 'f1') {
        event.preventDefault();
        this.#shortcutOverlay.toggle();
        return;
      }

      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      this.#handleKeyPress(event);
    };

    document.addEventListener('keydown', this.#keydownHandler);
  }

  /**
   * Handle key press and execute appropriate command
   */
  async #handleKeyPress(event: KeyboardEvent): Promise<void> {
    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey || event.metaKey;

    // Cmd/Ctrl + , - Open settings
    if (key === ',' && ctrl) {
      event.preventDefault();
      this.#settingsModal.open();
      return;
    }

    // Cmd/Ctrl + Shift + D - Download diagnostics snapshot (dev only)
    if (key === 'd' && ctrl && event.shiftKey) {
      event.preventDefault();
      if (import.meta.env.DEV) {
        import('../utils/diagnostics/snapshot').then(({ downloadSnapshot }) => downloadSnapshot(this.#cy));
      }
      return;
    }

    // Cmd/Ctrl + S - Export workspace
    if (key === 's' && ctrl) {
      event.preventDefault();
      exportWorkspace();
      return;
    }

    // Cmd/Ctrl + O - Import workspace
    if (key === 'o' && ctrl) {
      event.preventDefault();
      showImportDialog();
      return;
    }

    // Cmd/Ctrl + N - New workspace
    if (key === 'n' && ctrl) {
      event.preventDefault();
      newWorkspace();
      return;
    }

    // ` (backtick) - Focus chat input
    if (key === '`' && !ctrl) {
      event.preventDefault();
      const chatInput = document.querySelector('.chat-input') as HTMLTextAreaElement;
      chatInput?.focus();
      return;
    }

    // H - Toggle hidden connection badges
    if (key === 'h' && !ctrl) {
      event.preventDefault();
      this.#badgeManager?.toggle();
      return;
    }

    // V - Toggle View/Edit mode
    if (key === 'v' && !ctrl) {
      event.preventDefault();
      this.#toggleAppMode();
      return;
    }

    // M - Manage nodes
    if (key === 'm' && !ctrl) {
      event.preventDefault();
      if (this.#nodeManager) {
        const extent = this.#cy.extent();
        const graphCenter = {
          x: (extent.x1 + extent.x2) / 2,
          y: (extent.y1 + extent.y2) / 2
        };
        this.#nodeManager.show(graphCenter);
      }
      return;
    }

    // Shift+G - Go to scene with fade (quick, no animation)
    if (key === 'g' && event.shiftKey && !ctrl) {
      event.preventDefault();
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        this.#features.transition.goToSceneByNode(nodeId, { fade: true });
      }
      return;
    }

    // G - Go to scene (for selected node)
    if (key === 'g' && !event.shiftKey && !ctrl) {
      event.preventDefault();
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        this.#features.transition.goToSceneByNode(nodeId);
      }
      return;
    }

    // E - Edit selected node
    if (key === 'e' && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      this.#editSelectedNode();
      return;
    }

    // [ - Navigate back in history
    if (key === '[' && !ctrl) {
      event.preventDefault();
      const sceneId = this.#features.path.back();
      if (sceneId) {
        this.#features.transition.goToSceneFromPath(sceneId);
      }
      return;
    }

    // ] - Navigate forward in history
    if (key === ']' && !ctrl) {
      event.preventDefault();
      const sceneId = this.#features.path.forward();
      if (sceneId) {
        this.#features.transition.goToSceneFromPath(sceneId);
      }
      return;
    }

    // F - Fit to view
    if (key === 'f' && !ctrl && !event.shiftKey) {
      event.preventDefault();
      this.#features.scene.fit();
      return;
    }

    // Shift+F - Fit to background image
    if (key === 'f' && !ctrl && event.shiftKey) {
      event.preventDefault();
      this.#features.sceneBackground.fitToBackground();
      return;
    }

    // + or = - Zoom in
    if ((key === '+' || key === '=') && !ctrl) {
      event.preventDefault();
      this.#features.scene.zoom(1.1);
      return;
    }

    // - - Zoom out
    if (key === '-' && !ctrl) {
      event.preventDefault();
      this.#features.scene.zoom(0.9);
      return;
    }

    // Delete/Backspace - Delete selected nodes
    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        await this.#features.graph.deleteNode(nodeId);
      }
      return;
    }

    // Escape - Deselect all
    if (key === 'escape') {
      event.preventDefault();
      this.#cy.$(':selected').unselect();
      return;
    }

    // Arrow keys - Navigate between nodes
    // Shift+Arrow: require same perpendicular coordinate (aligned navigation)
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
      event.preventDefault();
      const alignedOnly = event.shiftKey;
      this.#navigateToClosestNode(key, alignedOnly);
      return;
    }

    // =========================================================================
    // SCENE MANIPULATION SHORTCUTS
    // =========================================================================

    // Shift+C - Collapse node
    if (key === 'c' && event.shiftKey && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        await this.#features.scene.collapseNodeAnimated(nodeId);
      }
      return;
    }

    // Z - Toggle fold/unfold node
    if (key === 'z' && !event.shiftKey && !ctrl) {
      event.preventDefault();
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        if (this.#features.scene.isFolded(nodeId)) {
          await this.#features.scene.unfoldNode(nodeId);
        } else {
          await this.#features.scene.foldNode(nodeId);
        }
      }
      return;
    }

    // C - Expand all (children + parents)
    if (key === 'c' && !event.shiftKey && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        await this.#features.scene.expandNodeAnimated(nodeId, 'both');
      }
      return;
    }

    // J - Expand children
    if (key === 'j' && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        await this.#features.scene.expandNodeAnimated(nodeId, 'children');
      }
      return;
    }

    // P - Expand parents
    if (key === 'p' && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        await this.#features.scene.expandNodeAnimated(nodeId, 'parents');
      }
      return;
    }

    // A - Add child
    if (key === 'a' && !event.shiftKey && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        this.#features.graph.addConnectedNode(nodeId, 'child');
      }
      return;
    }

    // Shift+A - Add parent
    if (key === 'a' && event.shiftKey && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        this.#features.graph.addConnectedNode(nodeId, 'parent');
      }
      return;
    }

    // X - Exclude from scene
    if (key === 'x' && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        // Don't exclude central node
        const centralNodeId = this.#features.scene.getCentralNodeId();
        if (nodeId !== centralNodeId) {
          await this.#features.scene.excludeNode(nodeId);
        }
      }
      return;
    }

    // D - Delete node
    if (key === 'd' && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        await this.#features.graph.deleteNode(nodeId);
      }
      return;
    }

    // S - Include all incident edges from graph into the scene
    if (key === 's' && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const nodeId = selected.first().id() as NodeId;
        this.#features.scene.includeAllIncidentEdges(nodeId);
      }
      return;
    }

    // L - Add edge (link)
    if (key === 'l' && !ctrl) {
      event.preventDefault();
      if (!isEditMode()) return;
      const selected = this.#cy.$('node:selected');
      if (selected.length > 0) {
        const sourceId = selected.first().id() as NodeId;
        // Enter edge creation mode
        if (this.#container) {
          this.#container.style.cursor = 'crosshair';
        }
        
        const handler = (event: any) => {
          const targetId = event.target.id() as NodeId;
          if (targetId !== sourceId) {
            this.#features.graph.addEdge(sourceId, targetId);
          }
          this.#cy.off('tap', 'node', handler);
          if (this.#container) {
            this.#container.style.cursor = 'default';
          }
        };
        
        this.#cy.on('tap', 'node', handler);
      }
      return;
    }

    // Ctrl/Cmd + 0 - Fit to view
    if (ctrl && key === '0') {
      event.preventDefault();
      this.#cy.fit(undefined, 50);
      return;
    }
  }

  #toggleAppMode(): void {
    setAppMode(getAppMode() === 'view' ? 'edit' : 'view');
  }

  /**
   * Navigate to the closest node in the arrow direction
   * @param key - Arrow key pressed
   * @param alignedOnly - If true, only consider nodes with same perpendicular coordinate (±50px)
   */
  #navigateToClosestNode(key: string, _alignedOnly: boolean = false): void {
    const selected = this.#cy.nodes(':selected');
    
    // If no node selected, select first node
    if (selected.length === 0) {
      const firstNode = this.#cy.nodes().first();
      if (firstNode.length > 0) {
        firstNode.select();
      }
      return;
    }

    const currentNode = selected.first();
    const currentPos = currentNode.position();
    
    if (isDebug('d_nav')) console.log(`[nav] Current: ${currentNode.id()} at (${currentPos.x.toFixed(0)}, ${currentPos.y.toFixed(0)}), direction: ${key}`);

    // Try 90° sector first, then expand to 150° if empty
    let bestNode = this.#findClosestInSector(currentNode, currentPos, key, 45);
    if (!bestNode) {
      if (isDebug('d_nav')) console.log(`[nav] 90° sector empty, expanding to 150°`);
      bestNode = this.#findClosestInSector(currentNode, currentPos, key, 75);
    }

    const bestId = bestNode !== null ? bestNode.id() : 'none';
    if (isDebug('d_nav')) console.log(`[nav] Best: ${bestId}`);
    
    if (bestNode !== null) {
      currentNode.unselect();
      bestNode.select();
    }
  }

  /** Find closest visible node within ±halfAngle degrees of the arrow direction. */
  #findClosestInSector(
    currentNode: cytoscape.NodeSingular,
    currentPos: cytoscape.Position,
    key: string,
    halfAngle: number
  ): cytoscape.NodeSingular | null {
    // Convert halfAngle to a tangent ratio: tan(halfAngle) = perpendicular / parallel
    const maxRatio = Math.tan(halfAngle * Math.PI / 180);

    let bestNode: cytoscape.NodeSingular | null = null;
    let bestDist = Infinity;

    this.#cy.nodes().forEach(node => {
      if (node.id() === currentNode.id()) return;
      if (node.hidden()) return;

      const pos = node.position();
      const dx = pos.x - currentPos.x;
      const dy = pos.y - currentPos.y;
      if (dx === 0 && dy === 0) return;

      // parallel = distance along arrow axis, perp = distance across it
      let parallel = 0;
      let perp = 0;
      switch (key) {
        case 'arrowup':    parallel = -dy; perp = Math.abs(dx); break;
        case 'arrowdown':  parallel =  dy; perp = Math.abs(dx); break;
        case 'arrowright': parallel =  dx; perp = Math.abs(dy); break;
        case 'arrowleft':  parallel = -dx; perp = Math.abs(dy); break;
      }

      // Must be ahead in the arrow direction
      if (parallel <= 0) return;
      // Perpendicular offset must be within the angle
      if (perp > parallel * maxRatio) return;

      const dist = Math.sqrt(dx * dx + dy * dy);

      if (isDebug('d_nav')) console.log(`[nav]   ${node.id()}: dx=${dx.toFixed(0)}, dy=${dy.toFixed(0)}, dist=${dist.toFixed(0)} (±${halfAngle}°)`);

      if (dist < bestDist) {
        bestDist = dist;
        bestNode = node;
      }
    });

    return bestNode;
  }

  /**
   * Set badge manager (for late binding)
   */
  setBadgeManager(manager: ConnectionBadgeManager): void {
    this.#badgeManager = manager;
  }

  /**
   * Enable/disable keyboard shortcuts
   */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  /**
   * Edit the currently selected node
   */
  #editSelectedNode(): void {
    if (!this.#nodeEditor || !this.#container) return;

    const selected = this.#cy.$('node:selected');
    if (selected.length === 0) return;

    const nodeId = selected.first().id() as NodeId;
    const editContext = this.#features.scene.getNodeEditContext(nodeId);
    
    if (!editContext) {
      console.warn(`Node ${nodeId} not found in scene`);
      return;
    }

    const context: NodeEditorContext = {
      sceneId: editContext.sceneId,
      themeId: editContext.themeId,
      scale: editContext.scale,
      position: editContext.position,
      viewportPosition: editContext.viewportPosition,
      containerRect: this.#container.getBoundingClientRect()
    };

    this.#nodeEditor.show(
      nodeId,
      editContext.nodeData,
      editContext.design,
      context,
      async (id, contentUpdates, designUpdates, scaleUpdate) => {
        await this.#features.node.update(id, contentUpdates);
        await this.#features.scene.updateNodeStyle(id, {
          design: designUpdates,
          scale: scaleUpdate
        });
      },
      async (request) => {
        return generateEquationFromPrompt(request);
      }
    );
  }

  /**
   * Clean up
   */
  destroy(): void {
    document.removeEventListener('keydown', this.#keydownHandler);
  }
}
