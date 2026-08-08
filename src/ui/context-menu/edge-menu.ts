/**
 * Edge menu — builds the MenuItem tree for a right-click on an edge.
 * Pure construction: no DOM, no Cytoscape event wiring. Actions delegate
 * to features/editors through MenuDependencies.
 */

import type { MenuItem } from './menu-renderer';
import type { MenuDependencies, StyleClipboard } from './menu-context';
import { openEdgeEditor } from './editor-openers';
import { isEditMode } from '../../storage/app-mode';
import { pickVisualParams } from '../../styles/edge-visual-resolver';

export function buildEdgeMenu(
  deps: MenuDependencies,
  clipboard: StyleClipboard,
  edgeId: string
): MenuItem[] {
  const editMode = isEditMode();
  const selectedEdges = deps.cy.edges(':selected');
  const selectedEdgeIds = new Set(selectedEdges.map(edge => edge.id()));
  const useSelectedEdgesAsPasteTargets = selectedEdges.length > 1 && selectedEdgeIds.has(edgeId);
  const pasteTargets = useSelectedEdgesAsPasteTargets
    ? selectedEdges
    : deps.cy.getElementById(edgeId);

  return [
    {
      label: 'Edit edge (dbl tap)',
      enabled: editMode && !useSelectedEdgesAsPasteTargets,
      action: () => {
        openEdgeEditor(deps, edgeId);
      }
    },
    {
      label: 'Exclude from scene (X)',
      enabled: editMode,
      action: () => {
        deps.features.scene.excludeEdge(edgeId);
      }
    },
    {
      label: 'Copy style',
      enabled: !useSelectedEdgesAsPasteTargets,
      action: () => {
        const context = deps.features.scene.getEdgeEditContext(edgeId);
        if (context) {
          clipboard.edgeStyle = {
            typeId: context.typeId,
            params: context.hasStyleOverride ? pickVisualParams(context.design.params) : null
          };
        }
      }
    },
    {
      label: useSelectedEdgesAsPasteTargets ? `Paste style to ${pasteTargets.length} edges` : 'Paste style',
      enabled: editMode && clipboard.edgeStyle !== null,
      action: async () => {
        const copiedStyle = clipboard.edgeStyle;
        if (!copiedStyle) return;

        for (const edge of pasteTargets) {
          const targetEdgeId = edge.id();
          await deps.features.edge.update(targetEdgeId, { typeId: copiedStyle.typeId });
          await deps.features.scene.updateEdgeStyle(
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
        deps.edgeTypeVisibilityModal.show();
      }
    },
    {
      label: 'Manage edge types',
      action: () => {
        deps.edgeTypeManager.show();
      }
    },
    {
      label: 'Delete edge (D)',
      // Blocked in path mode (paths-architecture §14.6) — enforced in Graph.
      enabled: editMode && !deps.features.path.isPathMode(),
      action: () => {
        deps.features.graph.deleteEdge(edgeId);
      }
    }
  ];
}
