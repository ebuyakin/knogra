/**
 * View Bindings
 * Mode, panels, scene entry, editors, history, zoom and node navigation —
 * everything that reads or reframes the graph rather than restructuring it.
 *
 * The grouping is the original chain's own ordering, sliced rather than
 * regrouped: reordering these branches would change which meaning wins for keys
 * that appear in more than one block.
 */

import type { NodeId } from '../../../core/main-types';
import type { Direction } from '../../../features/scene/scene';
import type { KeyboardContext } from '../keyboard-context';
import { getSetting } from '../../../config';
import { isEditMode } from '../../../storage/app-mode';
import {
  deleteSelectedNodeOrEdge,
  editSelectedNode,
  quickRenameSelectedNode,
  toggleAppMode,
  toggleSelectedNodeLinkToAnchor
} from '../selection-commands';

/**
 * Node navigation directions, keyed by the pressed key. The vim-style keys
 * mirror the arrows so the hand can stay on the home row; edge bending claims
 * the same letters earlier, but only while an edge is selected, so the two
 * meanings never apply at once.
 */
const NAVIGATION_KEYS: Record<string, Direction | undefined> = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  h: 'left',
  j: 'down',
  k: 'up',
  l: 'right'
};

export async function handleViewKeys(
  context: KeyboardContext,
  event: KeyboardEvent,
  key: string,
  ctrl: boolean
): Promise<boolean> {
  const { cy, features } = context;

  // B - Toggle hidden connection badges
  if (key === 'b' && !event.shiftKey && !ctrl) {
    event.preventDefault();
    context.badgeManager?.toggle();
    return true;
  }

  // Shift+B - Toggle the selected node's link to the anchor
  if (key === 'b' && event.shiftKey && !ctrl) {
    event.preventDefault();
    toggleSelectedNodeLinkToAnchor(context);
    return true;
  }

  // V - Toggle View/Edit mode
  if (key === 'v' && !ctrl) {
    event.preventDefault();
    toggleAppMode();
    return true;
  }

  // M - Manage nodes
  if (key === 'm' && !ctrl) {
    event.preventDefault();
    if (context.nodeManager) {
      const extent = cy.extent();
      const graphCenter = {
        x: (extent.x1 + extent.x2) / 2,
        y: (extent.y1 + extent.y2) / 2
      };
      context.nodeManager.show(graphCenter);
    }
    return true;
  }

  // Shift+G - Go to scene with fade (quick, no animation)
  if (key === 'g' && event.shiftKey && !ctrl) {
    event.preventDefault();
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      features.transition.goToSceneByNode(nodeId, { fade: true });
    }
    return true;
  }

  // G - Go to scene (for selected node)
  if (key === 'g' && !event.shiftKey && !ctrl) {
    event.preventDefault();
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      features.transition.goToSceneByNode(nodeId);
    }
    return true;
  }

  // E - Edit selected node
  if (key === 'e' && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    editSelectedNode(context);
    return true;
  }

  // ; / F2 - Quick rename of the selected node.
  // `;` is the primary binding (home row on QWERTY, unshifted on AZERTY, no
  // browser meaning); F2 is kept for Windows rename muscle memory.
  if ((key === ';' || key === 'f2') && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    quickRenameSelectedNode(context);
    return true;
  }

  // [ - Navigate back in history
  if (key === '[' && !ctrl) {
    event.preventDefault();
    const sceneId = features.path.back();
    if (sceneId) {
      features.transition.goToSceneFromPath(sceneId);
    }
    return true;
  }

  // ] - Navigate forward in history
  if (key === ']' && !ctrl) {
    event.preventDefault();
    const sceneId = features.path.forward();
    if (sceneId) {
      features.transition.goToSceneFromPath(sceneId);
    }
    return true;
  }

  // F - Fit to view
  if (key === 'f' && !ctrl && !event.shiftKey) {
    event.preventDefault();
    features.scene.fit();
    return true;
  }

  // Shift+F - Fit to background image
  if (key === 'f' && !ctrl && event.shiftKey) {
    event.preventDefault();
    features.sceneBackground.fitToBackground();
    return true;
  }

  // = - Zoom in current scene
  if (key === '=' && !ctrl) {
    event.preventDefault();
    const step = getSetting('interaction.zoomStep');
    features.scene.zoom(step);
    return true;
  }

  // - - Zoom out current scene
  if (key === '-' && !ctrl) {
    event.preventDefault();
    const step = getSetting('interaction.zoomStep');
    features.scene.zoom(1 / step);
    return true;
  }

  // 0 - Refit scene and reset zoom to 1 (current scene)
  if (key === '0' && !ctrl) {
    event.preventDefault();
    features.scene.resetZoom();
    return true;
  }

  // + (Shift+=) - Zoom in all scenes
  if (key === '+' && !ctrl) {
    event.preventDefault();
    const step = getSetting('interaction.zoomStep');
    features.scene.scaleAllScenesZoom(step);
    return true;
  }

  // _ (Shift+-) - Zoom out all scenes
  if (key === '_' && !ctrl) {
    event.preventDefault();
    const step = getSetting('interaction.zoomStep');
    features.scene.scaleAllScenesZoom(1 / step);
    return true;
  }

  // ) (Shift+0) - Reset all scenes to current scene
  if (key === ')' && !ctrl) {
    event.preventDefault();
    features.scene.normalizeAllScenesToCurrent();
    return true;
  }

  // n - Reset zoom and centre the viewport on the selected node
  if (key === 'n' && !event.shiftKey && !ctrl) {
    event.preventDefault();
    const selected = cy.nodes(':selected');
    if (selected.length > 0) {
      features.scene.resetZoomOnNode(selected.first().id() as NodeId);
    }
    return true;
  }

  // Delete/Backspace - Delete selected node or edge
  if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    await deleteSelectedNodeOrEdge(context);
    return true;
  }

  // Escape - Deselect all
  if (key === 'escape') {
    event.preventDefault();
    cy.$(':selected').unselect();
    return true;
  }

  // Arrow keys / h j k l - Navigate between nodes
  // Shift+<direction>: also pan the viewport to centre the newly selected node
  const navigationDirection = NAVIGATION_KEYS[key];
  if (navigationDirection && !ctrl) {
    event.preventDefault();
    features.scene.navigateDirectional(navigationDirection, { center: event.shiftKey });
    return true;
  }

  return false;
}
