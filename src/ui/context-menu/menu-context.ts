/**
 * Menu context — shared infrastructure for the context menu builders.
 *
 * MenuDependencies bundles everything a menu action may need (features,
 * editors, modals) so builders receive one object instead of a long
 * parameter list. StyleClipboard holds copy/paste style state shared
 * between the node and edge menus across menu invocations. The shared
 * item builders (mode toggle, arrange submenu) are used by more than
 * one menu surface.
 */

import type { Core } from 'cytoscape';
import type { EdgeTypeId, NodeId } from '../../core/main-types';
import type { FeatureAPI } from '../../features/feature-api';
import type { ArrangeGroup } from '../../features/arrange/tools/types';
import { ARRANGE_GROUP_LABELS } from '../../features/arrange/tools/registry';
import type { EdgeCreationMode } from '../edge-creation-mode';
import type { NodeEditor } from '../components/node-editor/node-editor';
import type { EdgeEditor } from '../components/edge-editor';
import type { EdgeTypeManager } from '../components/edge-type-manager';
import type { EdgeTypeVisibilityModal } from '../components/edge-type-visibility-modal';
import type { NodeManager } from '../components/node-manager';
import type { BackgroundEditor } from '../components/background-editor';
import type { ThemePicker } from '../components/theme-picker';
import type { QuizPanel } from '../components/quiz-panel';
import type { AnchorLinkTooltip } from '../components/anchor-link-tooltip';
import type { PasteStyleDialog } from '../components/paste-style-dialog';
import type { MenuItem } from './menu-renderer';
import { getAppMode, setAppMode } from '../../storage/app-mode';

/**
 * Everything the menu builders and their actions can reach.
 * Assembled once by UIComponentAPI and handed to ContextMenu.
 */
export interface MenuDependencies {
  cy: Core;
  container: HTMLElement;
  features: FeatureAPI;
  edgeCreationMode: EdgeCreationMode;
  nodeEditor: NodeEditor;
  edgeEditor: EdgeEditor;
  edgeTypeManager: EdgeTypeManager;
  edgeTypeVisibilityModal: EdgeTypeVisibilityModal;
  nodeManager: NodeManager;
  backgroundEditor: BackgroundEditor;
  themePicker: ThemePicker;
  quizPanel: QuizPanel;
  anchorLinkTooltip: AnchorLinkTooltip;
  pasteStyleDialog: PasteStyleDialog;
}

export interface CopiedEdgeStyle {
  typeId: EdgeTypeId;
  params: Record<string, unknown> | null;
}

export interface CopiedNodeDesign {
  design: { id: string; params: Record<string, unknown> };
  scale: number;
  sourceNodeId: NodeId;
  sourceTags: string[];
}

/**
 * Copy/paste style state. Lives on ContextMenu (one per app), shared by
 * the node and edge menu builders so a style copied from one right-click
 * is pasteable on the next.
 */
export class StyleClipboard {
  edgeStyle: CopiedEdgeStyle | null = null;
  nodeDesign: CopiedNodeDesign | null = null;
}

/**
 * Edit/view mode toggle item.
 */
export function createModeMenuItem(): MenuItem {
  const currentMode = getAppMode();
  const nextMode = currentMode === 'view' ? 'edit' : 'view';
  return {
    label: nextMode === 'view' ? 'Disable edit (V)' : 'Enable edit (V)',
    action: () => setAppMode(nextMode)
  };
}

/**
 * Build the selection-scoped "Arrange nodes" submenu from the arrange tool
 * registry, so a newly registered tool appears here with no UI change. Tools
 * are listed in registry order under their group's heading — which carries the
 * operation, leaving each item to name only its axis or shape — and each entry
 * is enabled only once the selection is large enough for that tool.
 *
 * "Undo arrange" is present only while the last arrangement is still undoable;
 * its appearance and disappearance are the affordance, so there is no
 * permanently greyed entry. It also keeps the submenu reachable after the user
 * has deselected — otherwise the offer would be unreachable the moment they
 * clicked the canvas to look at the result.
 */
export function buildArrangeMenu(features: FeatureAPI, editMode: boolean): MenuItem {
  const arrange = features.arrange;
  const selectionSize = arrange.selectionSize();
  const canUndo = editMode && arrange.canUndo();

  const children: MenuItem[] = [];
  if (canUndo) {
    children.push({
      label: 'Undo arrange',
      action: () => {
        arrange.undo();
      }
    });
  }

  let previousGroup: ArrangeGroup | null = null;
  for (const tool of arrange.tools()) {
    if (tool.group !== previousGroup) {
      children.push({ label: ARRANGE_GROUP_LABELS[tool.group], header: true });
      previousGroup = tool.group;
    }
    children.push({
      label: tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label,
      enabled: editMode && selectionSize >= tool.minNodes,
      action: () => {
        arrange.run(tool.id);
      }
    });
  }

  return {
    label: 'Arrange nodes',
    enabled: editMode && (selectionSize >= arrange.minimumSelection() || canUndo),
    children
  };
}
