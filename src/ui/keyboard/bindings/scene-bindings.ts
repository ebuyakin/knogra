/**
 * Scene Bindings
 * The scene-editing shortcuts: fold, expand/collapse, add/delete, edge
 * creation, auto-layout, arrange and node scaling. Last block consulted.
 *
 * Every branch here is edit-only, and each one swallows its key before the mode
 * check so a View-mode press never leaks to the browser.
 */

import type { NodeId } from '../../../core/main-types';
import type { KeyboardContext } from '../keyboard-context';
import { getSetting } from '../../../config';
import { isEditMode } from '../../../storage/app-mode';
import { deleteSelectedNodeOrEdge, excludeSelectedNodeOrEdgeFromScene } from '../selection-commands';

/**
 * Neighbourhood radius (in hops) for the grow-and-arrange shortcuts, keyed by
 * the pressed digit. Mirrors the "N degrees" entries in the Auto-layout menu.
 */
const AUTOLAYOUT_GROW_KEYS: Record<string, number | undefined> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4
};

export async function handleSceneKeys(
  context: KeyboardContext,
  event: KeyboardEvent,
  key: string,
  ctrl: boolean
): Promise<boolean> {
  const { cy, features } = context;

  // Shift+C - Exclude neighbours (private branches, any direction)
  if (key === 'c' && event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      await features.scene.excludeNeighboursAnimated(nodeId);
    }
    return true;
  }

  // Z - Toggle fold/unfold node
  if (key === 'z' && !event.shiftKey && !ctrl) {
    event.preventDefault();
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      if (features.scene.isFolded(nodeId)) {
        await features.scene.unfoldNode(nodeId);
      } else {
        await features.scene.foldNode(nodeId);
      }
    }
    return true;
  }

  // Shift+Z - Unfold all folded nodes in the scene (one tier)
  if (key === 'z' && event.shiftKey && !ctrl) {
    event.preventDefault();
    await features.scene.unfoldAllNodes();
    return true;
  }

  // C - Expand all (children + parents)
  if (key === 'c' && !event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      await features.scene.expandNodeAnimated(nodeId, 'both');
    }
    return true;
  }

  // R - Include child(r)en
  if (key === 'r' && !event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      await features.scene.expandNodeAnimated(nodeId, 'children');
    }
    return true;
  }

  // Shift+R - Exclude descendants (collapse downstream subtree)
  if (key === 'r' && event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      await features.scene.collapseNodeAnimated(nodeId);
    }
    return true;
  }

  // P - Expand parents
  if (key === 'p' && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      await features.scene.expandNodeAnimated(nodeId, 'parents');
    }
    return true;
  }

  // A - Add child
  if (key === 'a' && !event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      features.graph.addConnectedNode(nodeId, 'child');
    }
    return true;
  }

  // Shift+A - Add parent
  if (key === 'a' && event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      features.graph.addConnectedNode(nodeId, 'parent');
    }
    return true;
  }

  // X - Exclude selected node or edge from scene
  if (key === 'x' && !ctrl) {
    event.preventDefault();
    await excludeSelectedNodeOrEdgeFromScene(context);
    return true;
  }

  // D - Delete selected node or edge
  if (key === 'd' && !ctrl) {
    event.preventDefault();
    await deleteSelectedNodeOrEdge(context);
    return true;
  }

  // Shift+S - Include all graph edges between nodes already in the scene
  if (key === 's' && event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    features.scene.includeAllSceneEdges();
    return true;
  }

  // S - Include all incident edges from graph into the scene
  if (key === 's' && !event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const nodeId = selected.first().id() as NodeId;
      features.scene.includeAllIncidentEdges(nodeId);
    }
    return true;
  }

  // Shift+I - Add edges repeatedly from the selected node
  if (key === 'i' && event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const sourceId = selected.first().id() as NodeId;
      context.edgeCreationMode?.start(sourceId, true);
    }
    return true;
  }

  // I - Add edge (link)
  if (key === 'i' && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selected = cy.$('node:selected');
    if (selected.length > 0) {
      const sourceId = selected.first().id() as NodeId;
      context.edgeCreationMode?.start(sourceId, false);
    }
    return true;
  }

  // O / Shift+O - Rotate clockwise / counter-clockwise.
  // Scoped by the selection: with two or more nodes selected the selection
  // turns rigidly about its own centroid; otherwise the whole scene turns
  // about its central node. Same rule of thumb as every arrange tool — to
  // keep a node out of the rotation, don't select it.
  if (key === 'o' && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const rotatingSelection = features.arrange.selectionSize() >= 2;
    if (rotatingSelection) {
      features.arrange.run(event.shiftKey ? 'rotate-ccw' : 'rotate-cw');
    } else {
      features.autolayout.rotate(
        features.scene.getCentralNodeId(),
        event.shiftKey
          ? -getSetting('autolayout.rotateStep')
          : getSetting('autolayout.rotateStep')
      );
    }
    return true;
  }

  // W - Enlarge the scene's nodes: positions pack about the central node while
  // the viewport zooms in to match, so only apparent node size changes.
  if (key === 'w' && !event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    features.autolayout.scaleScene(
      features.scene.getCentralNodeId(),
      1 / getSetting('autolayout.densityStep')
    );
    return true;
  }

  // Shift+W - Shrink the scene's nodes: the inverse of W.
  if (key === 'w' && event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    features.autolayout.scaleScene(
      features.scene.getCentralNodeId(),
      getSetting('autolayout.densityStep')
    );
    return true;
  }

  // Q - Auto-layout the current scene about the central node (no expansion)
  if (key === 'q' && !event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    await features.autolayout.apply(features.scene.getCentralNodeId());
    return true;
  }

  // Shift+Q - Arrange the selected nodes on a circle about their centroid
  if (key === 'q' && event.shiftKey && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    features.arrange.run('circle');
    return true;
  }

  // , / . - Tighten / spread the selected nodes about their centroid.
  // Distance between the nodes changes; their size does not (contrast W).
  if ((key === ',' || key === '.') && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    features.arrange.run(key === ',' ? 'tighten' : 'spread');
    return true;
  }

  // < / > - Shrink / enlarge the selected nodes themselves: their `scale`
  // changes, positions do not (contrast , / . and W). No fallback when
  // nothing is selected — the scene-wide gesture is W / Shift+W.
  //
  // Deliberately no Shift guard: these are the shifted characters on US
  // layouts but unshifted on most ISO layouts, where `<` sits on its own key.
  // Matching the character rather than the chord keeps both working.
  if ((key === '<' || key === '>') && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    const selectedIds = cy.$('node:selected').map(node => node.id() as NodeId);
    if (selectedIds.length === 0) return true;
    const step = getSetting('node.scaleStep');
    await features.scene.scaleNodes(selectedIds, key === '>' ? step : 1 / step);
    return true;
  }

  // 1-4 - Pull in the degree-N neighbourhood, then auto-layout the scene.
  // Deliberately no Shift guard: on layouts where the digits are the shifted
  // characters (AZERTY), Shift+digit is the only way to type them.
  const growDegree = AUTOLAYOUT_GROW_KEYS[key];
  if (growDegree !== undefined && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    await features.autolayout.growAndArrange(
      features.scene.getCentralNodeId(),
      growDegree
    );
    return true;
  }

  // T / Shift+T - Align the selected node centres into a row (shared Y), or
  // distribute them with even horizontal gaps (Y untouched).
  if (key === 't' && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    features.arrange.run(event.shiftKey ? 'distribute-horizontal' : 'align-row');
    return true;
  }

  // U / Shift+U - Align into a column (shared X), or distribute with even
  // vertical gaps (X untouched).
  if (key === 'u' && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    features.arrange.run(event.shiftKey ? 'distribute-vertical' : 'align-column');
    return true;
  }

  // Y / Shift+Y - Align onto the min-X → max-X diagonal line, or distribute
  // with even gaps along that line (perpendicular offsets untouched).
  if (key === 'y' && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    features.arrange.run(event.shiftKey ? 'distribute-diagonal' : 'align-diagonal');
    return true;
  }

  // 8 / 9 - Grid / diagonal grid on the selection. **Undocumented on purpose**:
  // absent from F1 and from the menu labels, which still present both tools as
  // menu-only. A temporary authoring convenience for building demo graphs,
  // parked on two of the free digits until the arrange leader key replaces it
  // (docs/arrange-architecture.md §7). No Shift guard, matching the digits above.
  if ((key === '8' || key === '9') && !ctrl) {
    event.preventDefault();
    if (!isEditMode()) return true;
    features.arrange.run(key === '8' ? 'grid' : 'grid-diagonal');
    return true;
  }

  return false;
}
