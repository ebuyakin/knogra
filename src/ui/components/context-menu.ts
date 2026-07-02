/**
 * ContextMenu - Handles context menu UI for graph elements
 * Shows menus on right-click, delegates actions to FeatureAPI
 */

import type { Core } from 'cytoscape';
import type { EdgeTypeId, NodeId } from '../../core/main-types';
import type { FeatureAPI } from '../../features/feature-api';
import type { EdgeCreationMode } from '../edge-creation-mode';
import type { NodeEditor, NodeEditorContext } from './node-editor';
import type { EdgeEditor } from './edge-editor';
import type { EdgeTypeManager } from './edge-type-manager';
import type { EdgeTypeVisibilityModal } from './edge-type-visibility-modal';
import type { NodePicker } from './node-picker';
import type { NodeManager } from './node-manager';
import type { BackgroundEditor } from './background-editor';
import type { ThemeEditor } from './theme-editor';
import type { QuizPanel } from './quiz-panel';
import type { AnchorLinkTooltip } from './anchor-link-tooltip';
import { graphStore } from '../../storage/graph-store';
import { getAppMode, isEditMode, setAppMode } from '../../storage/app-mode';
import { getSetting } from '../../config';
import { exportWorkspace, showImportDialog, newWorkspace } from '../../storage/workspace';
import { exportMermaidGraph, showImportMermaidDialog } from '../../storage/mermaid';
import { SettingsModal } from './settings-modal';
import { generateEquationFromPrompt } from '../../ai/equation-generator';

interface CopiedEdgeStyle {
  typeId: EdgeTypeId;
  params: Record<string, unknown> | null;
}

export interface MenuItem {
  label: string;
  action?: () => void;
  enabled?: boolean;
  children?: MenuItem[];  // For sub-menus
  separator?: boolean;    // Render a visual divider instead of an item
}

export class ContextMenu {
  #cy: Core;
  #container: HTMLElement;
  #features: FeatureAPI;
  #edgeCreationMode: EdgeCreationMode;
  #nodeEditor: NodeEditor;
  #edgeEditor: EdgeEditor;
  #edgeTypeManager: EdgeTypeManager;
  #edgeTypeVisibilityModal: EdgeTypeVisibilityModal;
  #nodeManager: NodeManager;
  #backgroundEditor: BackgroundEditor;
  #themeEditor: ThemeEditor;
  #quizPanel: QuizPanel;
  #anchorLinkTooltip: AnchorLinkTooltip;
  #menuElement: HTMLDivElement | null = null;
  #copiedEdgeStyle: CopiedEdgeStyle | null = null;
  #copiedNodeDesign: { design: { id: string; params: Record<string, unknown> }; scale: number } | null = null;

  constructor(cy: Core, container: HTMLElement, features: FeatureAPI, edgeCreationMode: EdgeCreationMode, nodeEditor: NodeEditor, edgeEditor: EdgeEditor, edgeTypeManager: EdgeTypeManager, edgeTypeVisibilityModal: EdgeTypeVisibilityModal, _nodePicker: NodePicker, nodeManager: NodeManager, backgroundEditor: BackgroundEditor, themeEditor: ThemeEditor, quizPanel: QuizPanel, anchorLinkTooltip: AnchorLinkTooltip) {
    this.#cy = cy;
    this.#container = container;
    this.#features = features;
    this.#edgeCreationMode = edgeCreationMode;
    this.#nodeEditor = nodeEditor;
    this.#edgeEditor = edgeEditor;
    this.#edgeTypeManager = edgeTypeManager;
    this.#edgeTypeVisibilityModal = edgeTypeVisibilityModal;
    this.#nodeManager = nodeManager;
    this.#backgroundEditor = backgroundEditor;
    this.#themeEditor = themeEditor;
    this.#quizPanel = quizPanel;
    this.#anchorLinkTooltip = anchorLinkTooltip;
    this.#setupContextMenuListeners();
  }

  /**
   * Setup context menu event listeners
   */
  #setupContextMenuListeners(): void {
    // Listen for right-click on nodes
    this.#cy.on('cxttap', 'node', (event) => {
      event.preventDefault();
      const nodeId = event.target.id() as NodeId;
      const position = event.renderedPosition;
      this.#showNodeMenu(nodeId, position);
    });

    // Double-click on node → edit or navigate based on setting
    this.#cy.on('dbltap', 'node', (event) => {
      const nodeId = event.target.id() as NodeId;
      if (getSetting('interaction.doubleClickNode') === 'navigate' || !isEditMode()) {
        this.#features.transition.goToSceneByNode(nodeId);
      } else {
        this.#openNodeEditor(nodeId);
      }
    });

    // Listen for right-click on edges
    this.#cy.on('cxttap', 'edge', (event) => {
      event.preventDefault();
      const edgeId = event.target.id();
      const position = event.renderedPosition;
      this.#showEdgeMenu(edgeId, position);
    });

    // Double-click on edge → open editor
    this.#cy.on('dbltap', 'edge', (event) => {
      if (!isEditMode()) return;
      const edgeId = event.target.id();
      this.#openEdgeEditor(edgeId);
    });

    // Listen for right-click on canvas
    this.#cy.on('cxttap', (event) => {
      // Only handle if not on a node or edge
      if (event.target === this.#cy) {
        event.preventDefault();
        const position = event.renderedPosition;
        this.#showCanvasMenu(position);
      }
    });

    // Close menu on any click outside
    document.addEventListener('click', () => {
      this.#closeMenu();
    });

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.#closeMenu();
      }
    });

    // Close stale custom menus when the browser window/tab stops being active.
    window.addEventListener('blur', () => {
      this.#closeMenu();
    });

    window.addEventListener('pagehide', () => {
      this.#closeMenu();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        this.#closeMenu();
      }
    });
  }

  /**
   * Show context menu for a node
   */
  #showNodeMenu(nodeId: NodeId, position: { x: number; y: number }): void {
    const editMode = isEditMode();

    // Check if this is the central node
    const currentSceneId = this.#features.scene.getCurrentSceneId();
    const currentScene = currentSceneId 
      ? graphStore.scenes.find(s => s.id === currentSceneId) 
      : null;
    const isCentralNode = currentScene?.centralNodeId === nodeId;
    
    // Check if this is the anchor node
    const node = graphStore.nodes.find(n => n.id === nodeId);
    const isAnchor = node?.isAnchor === true;
    
    const isFolded = this.#features.scene.isFolded(nodeId);
    const canFold = this.#cy.getElementById(nodeId as string).outgoers('node').length > 0 && !isFolded;

    const items: MenuItem[] = [
      {
        label: "Go to node's scene (G)",
        action: async () => {
          await this.#features.transition.goToSceneByNode(nodeId);
        }
      },
      {
        label: 'Show link to anchor (I)',
        action: () => {
          this.#showLinkToAnchor(nodeId, position);
        }
      },
      {
        label: 'Edit node (E)',
        enabled: editMode,
        action: () => {
          this.#openNodeEditor(nodeId);
        }
      },
      ...(isFolded ? [{
        label: 'Unfold (Z)',
        action: async () => {
          await this.#features.scene.unfoldNode(nodeId);
        }
      }] : canFold ? [{
        label: 'Fold (Z)',
        action: async () => {
          await this.#features.scene.foldNode(nodeId);
        }
      }] : []),
      {
        label: 'Copy style',
        enabled: editMode,
        action: () => {
          const ctx = this.#features.scene.getNodeEditContext(nodeId);
          if (ctx) {
            this.#copiedNodeDesign = {
              design: { id: ctx.design.id, params: { ...ctx.design.params } },
              scale: ctx.scale
            };
          }
        }
      },
      (() => {
        const selectedNodes = this.#cy.nodes(':selected');
        const count = selectedNodes.length;
        const label = count > 1 ? `Paste style to ${count} nodes` : 'Paste style';
        return {
          label,
          enabled: editMode && this.#copiedNodeDesign !== null,
          action: async () => {
            if (!this.#copiedNodeDesign) return;
            const targets = count > 1 ? selectedNodes : this.#cy.getElementById(nodeId);
            for (const target of targets) {
              await this.#features.scene.updateNodeStyle(target.id() as NodeId, {
                design: { id: this.#copiedNodeDesign.design.id, params: { ...this.#copiedNodeDesign.design.params } },
                scale: this.#copiedNodeDesign.scale
              });
            }
            // Re-select to restore active borders after stylesheet updates
            targets.select();
          }
        };
      })(),
      {
        label: 'Scene',
        enabled: editMode,
        children: [
          {
            label: 'Include all node edges (S)',
            enabled: editMode,
            action: () => {
              this.#features.scene.includeAllIncidentEdges(nodeId);
            }
          },
          {
            label: 'Include neighbors (C)',
            enabled: editMode,
            action: async () => {
              await this.#features.scene.expandNodeAnimated(nodeId, 'both');
            }
          },
          {
            label: 'Include children (J)',
            enabled: editMode,
            action: async () => {
              await this.#features.scene.expandNodeAnimated(nodeId, 'children');
            }
          },
          {
            label: 'Include parents (P)',
            enabled: editMode,
            action: async () => {
              await this.#features.scene.expandNodeAnimated(nodeId, 'parents');
            }
          },
          {
            label: 'Exclude descendants (Shift+C)',
            enabled: editMode,
            action: async () => {
              await this.#features.scene.collapseNodeAnimated(nodeId);
            }
          },
          {
            label: 'Exclude node + descendants (X)',
            action: async () => {
              await this.#features.scene.excludeNode(nodeId);
            },
            enabled: editMode && !isCentralNode
          }
        ]
      },
      {
        label: 'Graph',
        enabled: editMode,
        children: [
          {
            label: 'Add child (A)',
            enabled: editMode,
            action: () => {
              this.#features.graph.addConnectedNode(nodeId, 'child');
            }
          },
          {
            label: 'Add parent (Shift+A)',
            enabled: editMode,
            action: () => {
              this.#features.graph.addConnectedNode(nodeId, 'parent');
            }
          },
          {
            label: 'Add edge (L)',
            enabled: editMode,
            action: () => {
              this.#edgeCreationMode.start(nodeId, false);
            }
          },
          {
            label: 'Add multiple edges (Shift+L)',
            enabled: editMode,
            action: () => {
              this.#edgeCreationMode.start(nodeId, true);
            }
          },
          {
            label: 'Delete node (D)',
            action: async () => {
              await this.#features.graph.deleteNode(nodeId);
            },
            enabled: editMode && !isCentralNode && !isAnchor
          },
          {
            label: 'Set as anchor',
            action: async () => {
              await this.#setAsAnchor(nodeId);
            },
            enabled: editMode && isCentralNode && !isAnchor
          }
        ]
      }
    ];

    this.#showMenu(items, position);
  }

  /**
   * Open node editor (extracted for reuse)
   */
  #openNodeEditor(nodeId: NodeId): void {
    if (!isEditMode()) return;

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
      },
      (title) => this.#features.graph.findNodeByTitle(title, nodeId)
    );
  }

  #openEdgeEditor(edgeId: string): void {
    if (!isEditMode()) return;

    const context = this.#features.scene.getEdgeEditContext(edgeId);
    if (!context) {
      console.warn(`Edge ${edgeId} not found in scene`);
      return;
    }

    this.#edgeEditor.show(
      edgeId,
      context.editableStyleParams,
      context,
      (id, payload) => {
        this.#features.edge.update(id, { typeId: payload.typeId });
        if (payload.params !== undefined) {
          this.#features.scene.updateEdgeStyle(id, payload.params);
        }
      }
    );
  }

  #showLinkToAnchor(nodeId: NodeId, position: { x: number; y: number }): void {
    const result = this.#features.graph.getLinkToAnchor(nodeId);
    this.#anchorLinkTooltip.showAtRenderedPosition(result, position);
  }

  /**
   * Set a node as the anchor (root) of the graph
   * Only one node can be anchor at a time
   */
  async #setAsAnchor(nodeId: NodeId): Promise<void> {
    // Verify this node is central in some scene
    const nodeScene = graphStore.scenes.find(s => s.centralNodeId === nodeId);
    if (!nodeScene) {
      console.warn(`[ContextMenu] Cannot set anchor: node ${nodeId} is not central in any scene`);
      return;
    }
    
    // Clear existing anchor
    for (const node of graphStore.nodes) {
      if (node.isAnchor && node.id !== nodeId) {
        await this.#features.node.update(node.id, { isAnchor: false });
      }
    }
    
    // Set new anchor
    await this.#features.node.update(nodeId, { isAnchor: true });
    
    // Update visual indicator on Cytoscape node
    this.#updateAnchorVisuals(nodeId);
  }

  /**
   * Update visual styling for anchor node
   */
  #updateAnchorVisuals(anchorNodeId: NodeId): void {
    // Remove anchor class from all nodes
    this.#cy.nodes().removeClass('anchor');
    
    // Add anchor class to the new anchor
    const anchorNode = this.#cy.$id(anchorNodeId);
    if (anchorNode.length > 0) {
      anchorNode.addClass('anchor');
    }
  }

  /**
   * Show context menu for an edge
   */
  #showEdgeMenu(edgeId: string, position: { x: number; y: number }): void {
    const editMode = isEditMode();
    const selectedEdges = this.#cy.edges(':selected');
    const selectedEdgeIds = new Set(selectedEdges.map(edge => edge.id()));
    const useSelectedEdgesAsPasteTargets = selectedEdges.length > 1 && selectedEdgeIds.has(edgeId);
    const pasteTargets = useSelectedEdgesAsPasteTargets
      ? selectedEdges
      : this.#cy.getElementById(edgeId);

    const items: MenuItem[] = [
      {
        label: 'Edit edge',
        enabled: editMode && !useSelectedEdgesAsPasteTargets,
        action: () => {
          // Get edge edit context from scene feature
          const context = this.#features.scene.getEdgeEditContext(edgeId);
          if (!context) {
            console.warn(`Edge ${edgeId} not found in scene`);
            return;
          }

          // Show edge editor with callback
          this.#edgeEditor.show(
            edgeId,
            context.editableStyleParams,
            context,
            (edgeId, payload) => {
              this.#features.edge.update(edgeId, { typeId: payload.typeId });
              if (payload.params !== undefined) {
                // Save edge style via scene feature
                this.#features.scene.updateEdgeStyle(edgeId, payload.params);
              }
            }
          );
        }
      },
      {
        label: 'Exclude from scene (X)',
        enabled: editMode,
        action: () => {
          this.#features.scene.excludeEdge(edgeId);
        }
      },
      {
        label: 'Copy style',
        enabled: !useSelectedEdgesAsPasteTargets,
        action: () => {
          const context = this.#features.scene.getEdgeEditContext(edgeId);
          if (context) {
            this.#copiedEdgeStyle = {
              typeId: context.typeId,
              params: context.hasStyleOverride ? { ...context.design.params } : null
            };
          }
        }
      },
      {
        label: useSelectedEdgesAsPasteTargets ? `Paste style to ${pasteTargets.length} edges` : 'Paste style',
        enabled: editMode && this.#copiedEdgeStyle !== null,
        action: async () => {
          const copiedStyle = this.#copiedEdgeStyle;
          if (!copiedStyle) return;

          for (const edge of pasteTargets) {
            const targetEdgeId = edge.id();
            await this.#features.edge.update(targetEdgeId, { typeId: copiedStyle.typeId });
            await this.#features.scene.updateEdgeStyle(
              targetEdgeId,
              copiedStyle.params ? { ...copiedStyle.params } : null
            );
          }

          if (useSelectedEdgesAsPasteTargets) {
            pasteTargets.select();
          }
        }
      },
      {
        label: 'Edges visibility',
        action: () => {
          this.#edgeTypeVisibilityModal.show();
        }
      },
      {
        label: 'Manage edge types',
        action: () => {
          this.#edgeTypeManager.show();
        }
      },
      {
        label: 'Delete edge (D)',
        enabled: editMode,
        action: () => {
          this.#features.graph.deleteEdge(edgeId);
        }
      }
    ];

    this.#showMenu(items, position);
  }

  /**
   * Show context menu for canvas
   */
  #showCanvasMenu(position: { x: number; y: number }): void {
    const editMode = isEditMode();

    const items: MenuItem[] = [
      {
        label: 'Add node here',
        enabled: editMode,
        action: () => {
          // Convert screen position to graph coordinates
          const graphPos = {
            x: (position.x - this.#cy.pan().x) / this.#cy.zoom(),
            y: (position.y - this.#cy.pan().y) / this.#cy.zoom()
          };
          this.#features.graph.addFreeNode(graphPos);
        }
      },
      {
        label: 'Manage nodes (M)',
        action: () => {
          const graphPos = {
            x: (position.x - this.#cy.pan().x) / this.#cy.zoom(),
            y: (position.y - this.#cy.pan().y) / this.#cy.zoom()
          };
          this.#nodeManager.show(graphPos);
        }
      },
      {
        label: 'Scene',
        children: [
          {
            label: 'Edges visibility',
            action: () => {
              this.#edgeTypeVisibilityModal.show();
            }
          },
          {
            label: 'Include all scene edges (Shift+S)',
            enabled: editMode,
            action: () => {
              this.#features.scene.includeAllSceneEdges();
            }
          },
          {
            label: 'Edit theme',
            enabled: editMode,
            action: async () => {
              const currentThemeId = this.#features.scene.getThemeId();
              const containerRect = this.#container.getBoundingClientRect();
              const selectedThemeId = await this.#themeEditor.show(currentThemeId, containerRect);
              if (selectedThemeId) {
                await this.#features.scene.setTheme(selectedThemeId);
                const sceneId = this.#features.scene.getCurrentSceneId();
                if (sceneId) {
                  await this.#features.transition.openScene(sceneId, { skipAnimation: true });
                }
              }
            }
          },
          {
            label: 'Edit background',
            enabled: editMode,
            action: async () => {
              // Get current scene ID
              const sceneId = this.#features.scene.getCurrentSceneId();
              if (!sceneId) {
                console.warn('No scene currently open');
                return;
              }

              // Get scene from graphStore
              const scene = graphStore.scenes.find(s => s.id === sceneId);
              const currentImage = scene?.backgroundImages?.[0] || null;

              // Show editor with callbacks
              this.#backgroundEditor.show(
                currentImage,
                (imageId) => this.#features.sceneBackground.createConfig(imageId),
                async (updates) => {
                  await this.#features.sceneBackground.updateForScene(sceneId, updates);
                }
              );
            }
          }
        ]
      },
      {
        label: 'Zoom',
        children: [
          {
            label: 'Fit scene to nodes (F)',
            action: () => {
              this.#features.scene.fit();
            }
          },
          {
            label: 'Fit scene to image (Shift+F)',
            action: () => {
              this.#features.sceneBackground.fitToBackground();
            }
          },
          {
            label: 'Zoom in current scene (+)',
            action: () => {
              this.#features.scene.zoom(getSetting('interaction.zoomStep'));
            }
          },
          {
            label: 'Zoom out current scene (−)',
            action: () => {
              this.#features.scene.zoom(1 / getSetting('interaction.zoomStep'));
            }
          },
          {
            label: 'Reset zoom and pan for current scene (0)',
            action: () => {
              this.#features.scene.resetZoom();
            }
          },
          { label: '', separator: true },
          {
            label: 'Zoom in all scenes (Shift +)',
            action: () => {
              this.#features.scene.scaleAllScenesZoom(getSetting('interaction.zoomStep'));
            }
          },
          {
            label: 'Zoom out all scenes (Shift −)',
            action: () => {
              this.#features.scene.scaleAllScenesZoom(1 / getSetting('interaction.zoomStep'));
            }
          },
          {
            label: 'Reset zoom for all scenes (Shift 0)',
            action: () => {
              this.#features.scene.normalizeAllScenesToCurrent();
            }
          }
        ]
      },
      this.#createModeMenuItem(),
      {
        label: 'Quiz...',
        action: () => {
          this.#quizPanel.show();
        }
      },
      {
        label: 'Workspace',
        children: [
          {
            label: 'New (⌘N)',
            action: () => { newWorkspace(); }
          },
          {
            label: 'Import (⌘O)',
            action: () => showImportDialog()
          },
          {
            label: 'Export (⌘S)',
            action: () => { exportWorkspace(); }
          },
          {
            label: 'Mermaid import',
            action: () => { showImportMermaidDialog(); }
          },
          {
            label: 'Mermaid export',
            action: () => { exportMermaidGraph(); }
          }
        ]
      },
      {
        label: 'Settings (⌘,)',
        action: () => {
          new SettingsModal().open();
        }
      }
    ];

    this.#showMenu(items, position);
  }

  #createModeMenuItem(): MenuItem {
    const currentMode = getAppMode();
    const nextMode = currentMode === 'view' ? 'edit' : 'view';
    return {
      label: nextMode === 'view' ? 'Disable edit (V)' : 'Enable edit (V)',
      action: () => setAppMode(nextMode)
    };
  }

  /**
   * Show context menu at position
   */
  #showMenu(items: MenuItem[], position: { x: number; y: number }): void {
    if (!document.hasFocus()) {
      this.#closeMenu();
      return;
    }

    // Close existing menu
    this.#closeMenu();

    // Create menu element
    const menu = document.createElement('div');
    menu.className = 'graph-context-menu';
    menu.style.position = 'absolute';
    menu.style.left = `${position.x}px`;
    menu.style.top = `${position.y}px`;
    menu.style.backgroundColor = 'var(--bg-secondary, #161b22)';
    menu.style.border = '1px solid var(--border-primary, #30363d)';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';
    menu.style.padding = '3px';
    menu.style.minWidth = '180px';
    menu.style.zIndex = '1000';
    menu.style.color = 'var(--text-primary, #e6edf3)';
    menu.style.fontSize = '13px';

    // Add menu items
    this.#renderMenuItems(menu, items);

    // Add to container
    this.#container.appendChild(menu);
    this.#menuElement = menu;

    // Adjust position if menu overflows container bounds
    const menuRect = menu.getBoundingClientRect();
    const containerRect = this.#container.getBoundingClientRect();

    // Adjust if overflows bottom
    if (menuRect.bottom > containerRect.bottom) {
      const newTop = position.y - menuRect.height;
      menu.style.top = `${Math.max(0, newTop)}px`;
    }

    // Adjust if overflows right
    if (menuRect.right > containerRect.right) {
      const newLeft = position.x - menuRect.width;
      menu.style.left = `${Math.max(0, newLeft)}px`;
    }
  }

  /**
   * Render menu items (recursive for sub-menus)
   */
  #renderMenuItems(container: HTMLElement, items: MenuItem[]): void {
    items.forEach(item => {
      if (item.separator) {
        const divider = document.createElement('div');
        divider.className = 'graph-context-menu-separator';
        divider.style.height = '1px';
        divider.style.margin = '4px 6px';
        divider.style.backgroundColor = 'var(--border-primary, #30363d)';
        container.appendChild(divider);
        return;
      }
      const itemElement = document.createElement('div');
      itemElement.className = 'graph-context-menu-item';
      itemElement.style.padding = '5px 10px';
      itemElement.style.cursor = item.enabled === false ? 'default' : 'pointer';
      itemElement.style.opacity = item.enabled === false ? '0.5' : '1';
      itemElement.style.borderRadius = '3px';
      itemElement.style.transition = 'background-color 0.15s ease';
      itemElement.style.position = 'relative';
      itemElement.style.display = 'flex';
      itemElement.style.justifyContent = 'space-between';
      itemElement.style.alignItems = 'center';

      // Label
      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      itemElement.appendChild(labelSpan);

      // Sub-menu indicator arrow
      if (item.children && item.children.length > 0) {
        const arrow = document.createElement('span');
        arrow.textContent = '▶';
        arrow.style.fontSize = '8px';
        arrow.style.marginLeft = '8px';
        arrow.style.opacity = item.enabled === false ? '0.5' : '1';
        itemElement.appendChild(arrow);
      }

      // Sub-menu container (hidden by default)
      let subMenu: HTMLDivElement | null = null;
      let hideTimeout: ReturnType<typeof setTimeout> | null = null;
      
      if (item.children && item.children.length > 0) {
        subMenu = document.createElement('div');
        subMenu.className = 'graph-context-submenu';
        subMenu.style.position = 'absolute';
        subMenu.style.left = '100%';
        subMenu.style.top = '0';
        subMenu.style.marginLeft = '0';  // Remove gap to prevent hover loss
        subMenu.style.backgroundColor = 'var(--bg-secondary, #161b22)';
        subMenu.style.border = '1px solid var(--border-primary, #30363d)';
        subMenu.style.borderRadius = '6px';
        subMenu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';
        subMenu.style.padding = '3px';
        subMenu.style.minWidth = '200px';
        subMenu.style.whiteSpace = 'nowrap';
        subMenu.style.display = 'none';
        subMenu.style.zIndex = '1001';

        this.#renderMenuItems(subMenu, item.children);
        itemElement.appendChild(subMenu);
        
        // Submenu hover - cancel hide timeout when entering submenu
        subMenu.addEventListener('mouseenter', () => {
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
        });
        
        subMenu.addEventListener('mouseleave', () => {
          if (subMenu) {
            subMenu.style.display = 'none';
          }
          itemElement.style.backgroundColor = 'transparent';
        });
      }

      // Hover effects
      itemElement.addEventListener('mouseenter', () => {
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
        if (item.enabled !== false) {
          itemElement.style.backgroundColor = 'rgba(88, 166, 255, 0.18)';
        }
        if (subMenu && item.enabled !== false) {
          subMenu.style.display = 'block';
          
          // Adjust submenu position if it overflows container bounds
          const subMenuRect = subMenu.getBoundingClientRect();
          const containerRect = this.#container.getBoundingClientRect();
          
          // Adjust if overflows bottom
          if (subMenuRect.bottom > containerRect.bottom) {
            const overflow = subMenuRect.bottom - containerRect.bottom;
            const currentTop = parseInt(subMenu.style.top) || 0;
            subMenu.style.top = `${currentTop - overflow}px`;
          }
          
          // Adjust if overflows right - show on left side instead
          if (subMenuRect.right > containerRect.right) {
            subMenu.style.left = 'auto';
            subMenu.style.right = '100%';
          }
        }
      });
      itemElement.addEventListener('mouseleave', () => {
        itemElement.style.backgroundColor = 'transparent';
        if (subMenu) {
          // Delay hiding to allow mouse to move to submenu
          hideTimeout = setTimeout(() => {
            if (subMenu) {
              subMenu.style.display = 'none';
            }
          }, 80);
        }
      });

      // Click handler (only for items without children)
      if (item.enabled !== false && item.action && !item.children) {
        itemElement.addEventListener('click', (e) => {
          e.stopPropagation();
          item.action!();
          this.#closeMenu();
        });
      }

      container.appendChild(itemElement);
    });
  }

  /**
   * Close the context menu
   */
  #closeMenu(): void {
    if (this.#menuElement) {
      this.#menuElement.remove();
      this.#menuElement = null;
    }
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.#closeMenu();
    this.#cy.off('cxttap');
  }
}
