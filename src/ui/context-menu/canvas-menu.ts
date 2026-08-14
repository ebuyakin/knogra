/**
 * Canvas menu — builds the MenuItem tree for a right-click on empty canvas.
 * Pure construction: no DOM, no Cytoscape event wiring. Actions delegate
 * to features/editors through MenuDependencies.
 */

import type { MenuItem, MenuPosition } from './menu-renderer';
import type { MenuDependencies } from './menu-context';
import { buildArrangeMenu, createModeMenuItem } from './menu-context';
import { graphStore } from '../../storage/graph-store';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';
import { exportWorkspace, showImportDialog, newWorkspace } from '../../storage/workspace';
import { exportDocument, showBuildDocumentDialog, showUpdateDocumentDialog } from '../../storage/markdown';
import { SettingsModal } from '../components/settings-modal';

export function buildCanvasMenu(deps: MenuDependencies, position: MenuPosition): MenuItem[] {
  const editMode = isEditMode();

  return [
    {
      label: 'New node (double tap)',
      enabled: editMode,
      action: () => {
        // Convert screen position to graph coordinates
        const graphPos = {
          x: (position.x - deps.cy.pan().x) / deps.cy.zoom(),
          y: (position.y - deps.cy.pan().y) / deps.cy.zoom()
        };
        deps.features.graph.addFreeNode(graphPos);
      }
    },
    {
      label: 'Manage nodes (M)',
      action: () => {
        const graphPos = {
          x: (position.x - deps.cy.pan().x) / deps.cy.zoom(),
          y: (position.y - deps.cy.pan().y) / deps.cy.zoom()
        };
        deps.nodeManager.show(graphPos);
      }
    },
    buildSceneDesignMenu(deps, editMode),
    buildArrangeMenu(deps.features, editMode),
    buildZoomMenu(deps),
    createModeMenuItem(),
    {
      label: 'Quiz...',
      action: () => {
        deps.quizPanel.show();
      }
    },
    {
      label: 'Workspace',
      children: [
        {
          label: 'New… (⌘N)',
          action: () => { newWorkspace(); }
        },
        {
          label: 'Open from file… (⌘O)',
          action: () => showImportDialog()
        },
        {
          label: 'Save to file… (⌘S)',
          action: () => { exportWorkspace(); }
        },
        {
          label: 'Markdown',
          children: [
            {
              label: 'Import…',
              action: () => { showBuildDocumentDialog(); }
            },
            {
              label: 'Update…',
              enabled: editMode,
              action: () => { showUpdateDocumentDialog(); }
            },
            {
              label: 'Export…',
              action: () => { exportDocument(); }
            }
          ]
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
}

function buildSceneDesignMenu(deps: MenuDependencies, editMode: boolean): MenuItem {
  return {
    label: 'Scene design',
    children: [
      {
        label: 'Auto-layout',
        children: [
          {
            label: 'No expansion (Q)',
            enabled: editMode,
            action: () => {
              deps.features.autolayout.apply(deps.features.scene.getCentralNodeId());
            }
          },
          {
            label: '1 degree (1)',
            enabled: editMode,
            action: () => {
              deps.features.autolayout.growAndArrange(deps.features.scene.getCentralNodeId(), 1);
            }
          },
          {
            label: '2 degrees (2)',
            enabled: editMode,
            action: () => {
              deps.features.autolayout.growAndArrange(deps.features.scene.getCentralNodeId(), 2);
            }
          },
          {
            label: '3 degrees (3)',
            enabled: editMode,
            action: () => {
              deps.features.autolayout.growAndArrange(deps.features.scene.getCentralNodeId(), 3);
            }
          },
          {
            label: '4 degrees (4)',
            enabled: editMode,
            action: () => {
              deps.features.autolayout.growAndArrange(deps.features.scene.getCentralNodeId(), 4);
            }
          }
        ]
      },
      {
        label: 'Node size',
        children: [
          {
            label: 'Enlarge (W)',
            enabled: editMode,
            action: () => {
              deps.features.autolayout.scaleScene(
                deps.features.scene.getCentralNodeId(),
                1 / getSetting('autolayout.densityStep')
              );
            }
          },
          {
            label: 'Shrink (Shift+W)',
            enabled: editMode,
            action: () => {
              deps.features.autolayout.scaleScene(
                deps.features.scene.getCentralNodeId(),
                getSetting('autolayout.densityStep')
              );
            }
          }
        ]
      },
      {
        label: 'Rotate',
        children: [
          {
            label: 'Clockwise (O)',
            enabled: editMode,
            action: () => {
              deps.features.autolayout.rotate(
                deps.features.scene.getCentralNodeId(),
                getSetting('autolayout.rotateStep')
              );
            }
          },
          {
            label: 'Anticlockwise (Shift+O)',
            enabled: editMode,
            action: () => {
              deps.features.autolayout.rotate(
                deps.features.scene.getCentralNodeId(),
                -getSetting('autolayout.rotateStep')
              );
            }
          }
        ]
      },
      ...(deps.features.scene.hasAnyFold() ? [{
        label: 'Unfold all (Shift+Z)',
        action: async () => {
          await deps.features.scene.unfoldAllNodes();
        }
      }] : []),
      {
        label: 'Edges visibility',
        action: () => {
          deps.edgeTypeVisibilityModal.show();
        }
      },
      {
        label: 'Include all edges (Shift+S)',
        enabled: editMode,
        action: () => {
          deps.features.scene.includeAllSceneEdges();
        }
      },
      {
        label: 'Scene theme',
        enabled: editMode,
        action: async () => {
          const currentThemeId = deps.features.scene.getThemeId();
          const containerRect = deps.container.getBoundingClientRect();
          const result = await deps.themePicker.show(currentThemeId, containerRect);
          if (!result) return;

          if (result.scope === 'all') {
            const sceneCount = deps.features.scene.getSceneCount();
            const confirmed = window.confirm(
              `Apply theme "${result.themeId}" to all ${sceneCount} scene${sceneCount === 1 ? '' : 's'}? This replaces each scene's current theme.`
            );
            if (!confirmed) return;
            await deps.features.scene.setThemeForAllScenes(result.themeId);
          } else {
            await deps.features.scene.setTheme(result.themeId);
          }

          const sceneId = deps.features.scene.getCurrentSceneId();
          if (sceneId) {
            await deps.features.transition.openScene(sceneId, { skipAnimation: true });
          }
        }
      },
      {
        label: 'Edit background',
        enabled: editMode,
        action: async () => {
          // Get current scene ID
          const sceneId = deps.features.scene.getCurrentSceneId();
          if (!sceneId) {
            console.warn('No scene currently open');
            return;
          }

          // Get scene from graphStore
          const scene = graphStore.scenes.find(s => s.id === sceneId);
          const currentImage = scene?.backgroundImages?.[0] || null;

          // Show editor with callbacks
          deps.backgroundEditor.show(
            currentImage,
            (imageId) => deps.features.sceneBackground.createConfig(imageId),
            async (updates) => {
              await deps.features.sceneBackground.updateForScene(sceneId, updates);
            }
          );
        }
      }
    ]
  };
}

function buildZoomMenu(deps: MenuDependencies): MenuItem {
  return {
    label: 'Zoom',
    children: [
      {
        label: 'Fit to nodes (F)',
        action: () => {
          deps.features.scene.fit();
        }
      },
      {
        label: 'Fit to image (Shift+F)',
        action: () => {
          deps.features.sceneBackground.fitToBackground();
        }
      },
      {
        label: 'Zoom in (+)',
        action: () => {
          deps.features.scene.zoom(getSetting('interaction.zoomStep'));
        }
      },
      {
        label: 'Zoom out (−)',
        action: () => {
          deps.features.scene.zoom(1 / getSetting('interaction.zoomStep'));
        }
      },
      {
        label: 'Reset zoom (0)',
        action: () => {
          deps.features.scene.resetZoom();
        }
      },
      { label: '', separator: true },
      {
        label: 'All scenes: zoom in (Shift +)',
        action: () => {
          deps.features.scene.scaleAllScenesZoom(getSetting('interaction.zoomStep'));
        }
      },
      {
        label: 'All scenes: zoom out (Shift −)',
        action: () => {
          deps.features.scene.scaleAllScenesZoom(1 / getSetting('interaction.zoomStep'));
        }
      },
      {
        label: 'All scenes: reset zoom (Shift 0)',
        action: () => {
          deps.features.scene.normalizeAllScenesToCurrent();
        }
      }
    ]
  };
}
