/**
 * Selection Commands
 * Shortcut actions that operate on the current selection and are needed by more
 * than one binding block (Delete and D both remove; X excludes; edge bending
 * and exclusion both need the "exactly one edge" rule).
 */

import type { Core } from 'cytoscape';
import type { EdgeId, NodeId } from '../../core/main-types';
import type { KeyboardContext } from './keyboard-context';
import { getAppMode, isEditMode, setAppMode } from '../../storage/app-mode';
import { openNodeEditor, openQuickRename } from '../components/editor-openers';

/**
 * The selected edge, but only when it is unambiguously the target: exactly one
 * edge selected and no nodes alongside it.
 */
export function getSingleSelectedEdgeId(cy: Core): EdgeId | null {
  const selectedEdges = cy.edges(':selected');
  if (selectedEdges.length !== 1 || cy.nodes(':selected').length > 0) return null;
  return selectedEdges.first().id() as EdgeId;
}

export function toggleAppMode(): void {
  setAppMode(getAppMode() === 'view' ? 'edit' : 'view');
}

export async function handleSelectedEdgeBendShortcut(
  context: KeyboardContext,
  key: string,
  largeStep: boolean
): Promise<boolean> {
  if (!isEditMode()) return false;

  const edgeId = getSingleSelectedEdgeId(context.cy);
  if (!edgeId) return false;

  if (key === 'r') {
    return context.features.scene.resetEdgeCurveOverride(edgeId);
  }

  const commands = {
    h: 'positionTowardTarget',
    j: 'strengthDown',
    k: 'strengthUp',
    l: 'positionTowardSource'
  } as const;
  const command = commands[key as keyof typeof commands];
  if (!command) return false;

  await context.features.scene.adjustEdgeBend(edgeId, command, { largeStep });
  return true;
}

export async function excludeSelectedNodeOrEdgeFromScene(context: KeyboardContext): Promise<void> {
  if (!isEditMode()) return;

  const selectedNode = context.cy.$('node:selected');
  if (selectedNode.length > 0) {
    const nodeId = selectedNode.first().id() as NodeId;
    const centralNodeId = context.features.scene.getCentralNodeId();
    if (nodeId !== centralNodeId) {
      await context.features.scene.excludeNode(nodeId);
    }
    return;
  }

  const edgeId = getSingleSelectedEdgeId(context.cy);
  if (edgeId) {
    context.features.scene.excludeEdge(edgeId);
  }
}

export async function deleteSelectedNodeOrEdge(context: KeyboardContext): Promise<void> {
  if (!isEditMode()) return;

  const selectedNode = context.cy.$('node:selected');
  if (selectedNode.length > 0) {
    const nodeId = selectedNode.first().id() as NodeId;
    await context.features.graph.deleteNode(nodeId);
    return;
  }

  const edgeId = getSingleSelectedEdgeId(context.cy);
  if (edgeId) {
    context.features.graph.deleteEdge(edgeId);
  }
}

export function toggleSelectedNodeLinkToAnchor(context: KeyboardContext): void {
  if (!context.anchorLinkTooltip) return;

  if (context.anchorLinkTooltip.isOpen()) {
    context.anchorLinkTooltip.hide();
    return;
  }

  const selected = context.cy.$('node:selected');
  if (selected.length === 0) return;

  const nodeId = selected.first().id() as NodeId;
  const result = context.features.graph.getLinkToAnchor(nodeId);
  context.anchorLinkTooltip.showForNode(result, nodeId);
}

/**
 * Edit the currently selected node.
 *
 * `titleOverride` carries text typed in the quick rename popover into the full
 * editor, so escalating from it never loses the edit in progress.
 */
export function editSelectedNode(context: KeyboardContext, titleOverride?: string): void {
  if (!context.nodeEditor || !context.container) return;

  const selected = context.cy.$('node:selected');
  if (selected.length === 0) return;

  openNodeEditor(
    { container: context.container, features: context.features, nodeEditor: context.nodeEditor },
    selected.first().id() as NodeId,
    titleOverride
  );
}

/** Rename the selected node through the anchored quick popover. */
export function quickRenameSelectedNode(context: KeyboardContext): void {
  if (!context.quickTitleEditor || !context.nodeEditor || !context.container) return;

  const selected = context.cy.$('node:selected');
  if (selected.length !== 1) return;

  openQuickRename(
    {
      container: context.container,
      features: context.features,
      nodeEditor: context.nodeEditor,
      quickTitleEditor: context.quickTitleEditor
    },
    selected.first().id() as NodeId
  );
}
