/**
 * Editor openers — open the node/edge editors for a given element.
 * Shared by the double-tap listeners (in ContextMenu wiring) and the
 * node/edge menu actions, so the open-with-context logic exists once.
 */

import type { NodeId } from '../../core/main-types';
import type { NodeEditorContext } from '../components/node-editor/node-editor';
import type { MenuDependencies } from './menu-context';
import { isEditMode } from '../../storage/app-mode';
import { generateEquationFromPrompt } from '../../ai/equation-generator';

export function openNodeEditor(deps: MenuDependencies, nodeId: NodeId): void {
  if (!isEditMode()) return;

  const editContext = deps.features.scene.getNodeEditContext(nodeId);

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
    containerRect: deps.container.getBoundingClientRect()
  };

  deps.nodeEditor.show(
    nodeId,
    editContext.nodeData,
    editContext.design,
    context,
    async (id, contentUpdates, designUpdates, scaleUpdate) => {
      await deps.features.node.update(id, contentUpdates);
      await deps.features.scene.updateNodeStyle(id, {
        design: designUpdates,
        scale: scaleUpdate
      });
    },
    async (request) => {
      return generateEquationFromPrompt(request);
    },
    (title) => deps.features.graph.findNodeByTitle(title, nodeId)
  );
}

export function openEdgeEditor(deps: MenuDependencies, edgeId: string): void {
  if (!isEditMode()) return;

  const context = deps.features.scene.getEdgeEditContext(edgeId);
  if (!context) {
    console.warn(`Edge ${edgeId} not found in scene`);
    return;
  }

  deps.edgeEditor.show(
    edgeId,
    context.editableStyleParams,
    context,
    (id, payload) => {
      deps.features.edge.update(id, { typeId: payload.typeId });
      if (payload.visualParams !== undefined) {
        // Save edge visual style via scene feature
        deps.features.scene.updateEdgeStyle(id, payload.visualParams);
      }
      if (payload.curveParams !== undefined) {
        // Save edge curve/layout via scene feature
        deps.features.scene.updateEdgeCurve(id, payload.curveParams);
      }
    }
  );
}
