/**
 * Node menu — builds the MenuItem tree for a right-click on a node.
 * Pure construction: no DOM, no Cytoscape event wiring. Actions delegate
 * to features/editors through MenuDependencies.
 */

import type { NodeId } from '../../core/main-types';
import type { MenuItem, MenuPosition } from './menu-renderer';
import type { MenuDependencies, StyleClipboard } from './menu-context';
import { buildArrangeMenu } from './menu-context';
import { openNodeEditor } from '../components/editor-openers';
import { graphStore } from '../../storage/graph-store';
import { isEditMode } from '../../storage/app-mode';

export function buildNodeMenu(
  deps: MenuDependencies,
  clipboard: StyleClipboard,
  nodeId: NodeId,
  position: MenuPosition
): MenuItem[] {
  const editMode = isEditMode();

  // Check if this is the central node
  const currentSceneId = deps.features.scene.getCurrentSceneId();
  const currentScene = currentSceneId
    ? graphStore.scenes.find(s => s.id === currentSceneId)
    : null;
  const isCentralNode = currentScene?.centralNodeId === nodeId;

  // Check if this is the anchor node
  const node = graphStore.nodes.find(n => n.id === nodeId);
  const isAnchor = node?.isAnchor === true;

  const isFolded = deps.features.scene.isFolded(nodeId);
  const canFold = deps.cy.getElementById(nodeId as string).outgoers('node').length > 0 && !isFolded;

  // Path mode restricts navigation and deletion (paths-architecture §14.5).
  // Enforcement lives in the Transition and Graph features; these flags only
  // keep the menu honest about what it will actually do.
  const pathMode = deps.features.path.isPathMode();

  return [
    {
      label: 'Go to scene (G)',
      enabled: !pathMode,
      action: async () => {
        await deps.features.transition.goToSceneByNode(nodeId);
      }
    },
    {
      label: 'Edit node (E)',
      enabled: editMode,
      action: () => {
        openNodeEditor(deps, nodeId);
      }
    },
    {
      label: 'Link to anchor (Shift+B)',
      action: () => {
        const result = deps.features.graph.getLinkToAnchor(nodeId);
        deps.anchorLinkTooltip.showAtRenderedPosition(result, position);
      }
    },
    ...(isFolded ? [{
      label: 'Unfold (Z)',
      action: async () => {
        await deps.features.scene.unfoldNode(nodeId);
      }
    }] : canFold ? [{
      label: 'Fold (Z)',
      action: async () => {
        await deps.features.scene.foldNode(nodeId);
      }
    }] : []),
    {
      label: 'Copy style',
      enabled: editMode,
      action: () => {
        const ctx = deps.features.scene.getNodeEditContext(nodeId);
        if (ctx) {
          clipboard.nodeDesign = {
            design: { id: ctx.design.id, params: { ...ctx.design.params } },
            scale: ctx.scale,
            sourceNodeId: nodeId,
            sourceTags: ctx.nodeData.tags ?? []
          };
        }
      }
    },
    buildPasteStyleItem(deps, clipboard, nodeId, editMode),
    buildArrangeMenu(deps.features, editMode),
    {
      label: 'Scene',
      enabled: editMode,
      children: [
        {
          label: 'Include',
          enabled: editMode,
          children: [
            {
              label: 'All edges (S)',
              enabled: editMode,
              action: () => {
                deps.features.scene.includeAllIncidentEdges(nodeId);
              }
            },
            {
              label: 'Neighbours (C)',
              enabled: editMode,
              action: async () => {
                await deps.features.scene.expandNodeAnimated(nodeId, 'both');
              }
            },
            {
              label: 'Children (R)',
              enabled: editMode,
              action: async () => {
                await deps.features.scene.expandNodeAnimated(nodeId, 'children');
              }
            },
            {
              label: 'Parents (P)',
              enabled: editMode,
              action: async () => {
                await deps.features.scene.expandNodeAnimated(nodeId, 'parents');
              }
            }
          ]
        },
        {
          label: 'Exclude',
          enabled: editMode,
          children: [
            {
              label: 'Neighbours (Shift+C)',
              enabled: editMode,
              action: async () => {
                await deps.features.scene.excludeNeighboursAnimated(nodeId);
              }
            },
            {
              label: 'Descendants (Shift+R)',
              enabled: editMode,
              action: async () => {
                await deps.features.scene.collapseNodeAnimated(nodeId);
              }
            },
            {
              label: 'Branch (X)',
              action: async () => {
                await deps.features.scene.excludeNode(nodeId);
              },
              enabled: editMode && !isCentralNode
            }
          ]
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
            deps.features.graph.addConnectedNode(nodeId, 'child');
          }
        },
        {
          label: 'Add parent (Shift+A)',
          enabled: editMode,
          action: () => {
            deps.features.graph.addConnectedNode(nodeId, 'parent');
          }
        },
        {
          label: 'Add edge (I)',
          enabled: editMode,
          action: () => {
            deps.edgeCreationMode.start(nodeId, false);
          }
        },
        {
          label: 'Add edges… (Shift+I)',
          enabled: editMode,
          action: () => {
            deps.edgeCreationMode.start(nodeId, true);
          }
        },
        {
          label: 'Delete node (D)',
          action: async () => {
            await deps.features.graph.deleteNode(nodeId);
          },
          enabled: editMode && !isCentralNode && !isAnchor && !pathMode
        },
        {
          label: 'Set as anchor',
          action: async () => {
            await setAsAnchor(deps, nodeId);
          },
          enabled: editMode && isCentralNode && !isAnchor
        }
      ]
    }
  ];
}

/**
 * Paste style item — three variants depending on selection and clipboard:
 * pasting back onto the copy source opens the tag-aware dialog; otherwise
 * paste applies directly to the clicked node or the whole selection.
 */
function buildPasteStyleItem(
  deps: MenuDependencies,
  clipboard: StyleClipboard,
  nodeId: NodeId,
  editMode: boolean
): MenuItem {
  const selectedNodes = deps.cy.nodes(':selected');
  const count = selectedNodes.length;
  const copied = clipboard.nodeDesign;
  const isSourceSelfPaste = copied !== null && count <= 1 && nodeId === copied.sourceNodeId;
  if (isSourceSelfPaste) {
    return {
      label: 'Paste style…',
      enabled: editMode,
      action: () => {
        deps.pasteStyleDialog.open({
          design: copied.design,
          scale: copied.scale,
          sourceNodeId: copied.sourceNodeId,
          sourceTags: copied.sourceTags
        });
      }
    };
  }
  const label = count > 1 ? `Paste style to ${count} nodes` : 'Paste style';
  return {
    label,
    enabled: editMode && copied !== null,
    action: async () => {
      if (!copied) return;
      const targets = count > 1 ? selectedNodes : deps.cy.getElementById(nodeId);
      for (const target of targets) {
        await deps.features.scene.updateNodeStyle(target.id() as NodeId, {
          design: { id: copied.design.id, params: { ...copied.design.params } },
          scale: copied.scale
        });
      }
      // Re-select to restore active borders after stylesheet updates
      targets.select();
    }
  };
}

/**
 * Set a node as the anchor (root) of the graph.
 * Only one node can be anchor at a time.
 */
async function setAsAnchor(deps: MenuDependencies, nodeId: NodeId): Promise<void> {
  // Verify this node is central in some scene
  const nodeScene = graphStore.scenes.find(s => s.centralNodeId === nodeId);
  if (!nodeScene) {
    console.warn(`[ContextMenu] Cannot set anchor: node ${nodeId} is not central in any scene`);
    return;
  }

  // Clear existing anchor
  for (const node of graphStore.nodes) {
    if (node.isAnchor && node.id !== nodeId) {
      await deps.features.node.update(node.id, { isAnchor: false });
    }
  }

  // Set new anchor
  await deps.features.node.update(nodeId, { isAnchor: true });

  // Update visual indicator on Cytoscape node
  deps.cy.nodes().removeClass('anchor');
  const anchorNode = deps.cy.$id(nodeId);
  if (anchorNode.length > 0) {
    anchorNode.addClass('anchor');
  }
}
