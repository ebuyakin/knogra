/**
 * Map core scene
 *
 * The map core as a Scene object: the focus and the landmarks with their
 * lines, every node in its default design at its box's rendered scale, the
 * map's base frame as viewport with the focus at the focal point, no fold
 * state (docs/map-view.md §2, §8). This skeleton is what the map and a study
 * scene have in common and what carries the visual continuity between them;
 * markers exist only on the map and are the map's to add and remove around it.
 *
 * Under its own id, `map:<focus>`, it is the map core scene, the transient
 * picture the transition feature transitions to (STM) and from (MTS) in a
 * handoff. Under an id the transition feature assigns it is the study scene a
 * focus without one gets when the map is left for it, and what a study scene
 * is reset to. Pure: plain data in, a plain object out.
 */

import type { Edge, EdgeId, Node, NodeId, Scene, SceneId, ThemeId } from '../../core/main-types';
import type { MapLayout } from './geometry';
import type { MapBox, MapTree } from './map-tree';
import { resolveDefaultDesign } from './default-design';

/** What the shown or the prepared map has that a scene is made from. */
export interface MapPicture {
  tree: MapTree;
  layout: MapLayout;
  nodeById: Map<NodeId, Node>;
  edgeById: Map<EdgeId, Edge>;
  themeId: ThemeId;
}

/** The id of the transient map core scene; `map:` keeps it apart from the transition feature's `scene-...` ids. */
export function mapCoreSceneId(focusNodeId: NodeId): SceneId {
  return `map:${focusNodeId}`;
}

/** The map core as a scene: the map core scene under its own id, a study scene under one the transition feature assigns. */
export function mapCoreSceneOf(picture: MapPicture, zoom: number, id: SceneId = mapCoreSceneId(picture.tree.focusNodeId)): Scene {
  const boxes = picture.tree.boxes.filter(box => box.depth <= 1);
  return buildScene(picture, boxes, id, zoom);
}

function buildScene({ tree, layout, nodeById, edgeById, themeId }: MapPicture, boxes: MapBox[], id: SceneId, zoom: number): Scene {
  const nodes: Scene['nodes'] = {};
  for (const box of boxes) {
    const node = nodeById.get(box.nodeId);
    const position = layout.positions.get(box.address);
    if (!node || !position) continue;
    nodes[box.nodeId] = {
      position: { x: position.x, y: position.y },
      scale: layout.scales.get(box.address) ?? 1,
      design: resolveDefaultDesign(node),
    };
  }

  // The lines of the chosen boxes and no other edge: the scene canvas's picture must be the map's at the swap.
  const addresses = new Set(boxes.map(box => box.address));
  const edges: Scene['edges'] = {};
  for (const line of tree.lines) {
    if (!addresses.has(line.address) || !edgeById.has(line.edgeId)) continue;
    edges[line.edgeId] = { design: { id: 'default', params: {} } };
  }

  const now = new Date();
  return {
    id,
    title: nodeById.get(tree.focusNodeId)?.title ?? 'untitled',
    centralNodeId: tree.focusNodeId,
    nodes,
    edges,
    themeId,
    viewport: { zoom, pan: { x: 0, y: 0 }, focalPoint: { x: 0, y: 0 } },
    createdAt: now,
    updatedAt: now,
  };
}
