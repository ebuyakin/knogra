/**
 * Map scene
 *
 * The map as a Scene object: the picture the scene engine can draw and
 * transition to, which is how the map is entered and left (docs/map-view.md
 * §8). One node
 * per map node at its kept box's position, in the node's default design at
 * the box's rendered scale; the edges the map draws, the lines of the kept
 * boxes, and no other edge between those nodes, since the map does not show
 * them and the engine's picture must match the map's at the swap; the map's
 * base frame as the viewport; no fold state. The focus is at the map's
 * origin, so the focal point is the origin and the engine centres it as the
 * map does.
 *
 * Under its own id the object is transient, never persisted. Under an id the
 * engine assigns it is the study scene a focus without one gets when the map
 * is left for it: the map is the prototypical shape of a scene, so the new
 * scene is the map exactly as shown and nothing visible changes (§8). Pure:
 * plain data in, a plain object out.
 */

import type { Edge, EdgeId, Node, NodeId, Scene, SceneId, ThemeId } from '../../core/main-types';
import type { MapLayout } from './geometry';
import type { Address, MapBox, MapTree } from './map-tree';
import { resolveDefaultDesign } from './default-design';

/** What the shown or the prepared map has that a scene is made from. */
export interface MapPicture {
  tree: MapTree;
  layout: MapLayout;
  nodeById: Map<NodeId, Node>;
  edgeById: Map<EdgeId, Edge>;
  themeId: ThemeId;
}

/** The id of the transient map's scene; `map:` keeps it apart from the engine's `scene-...` ids. */
export function mapSceneId(focusNodeId: NodeId): SceneId {
  return `map:${focusNodeId}`;
}

/**
 * The one box of a node the map's scene keeps: its landmark box when it has
 * one, otherwise its first box. A twin's other boxes converge on it before
 * leaving and arrive from it after entering.
 */
export function keptAddress(tree: MapTree, nodeId: NodeId): Address | undefined {
  const boxes = tree.boxes.filter(box => box.nodeId === nodeId);
  return (boxes.find(box => box.depth === 1) ?? boxes[0])?.address;
}

/** The map as a scene: transient under its own id, a study scene under one the engine assigns. */
export function mapSceneOf({ tree, layout, nodeById, edgeById, themeId }: MapPicture, zoom: number, id: SceneId = mapSceneId(tree.focusNodeId)): Scene {
  const kept = keptBoxes(tree);
  const nodes: Scene['nodes'] = {};
  for (const box of kept) {
    const node = nodeById.get(box.nodeId);
    const position = layout.positions.get(box.address);
    if (!node || !position) continue;
    nodes[box.nodeId] = {
      position: { x: position.x, y: position.y },
      scale: layout.scales.get(box.address) ?? 1,
      design: resolveDefaultDesign(node),
    };
  }

  const keptAddresses = new Set(kept.map(box => box.address));
  const edges: Scene['edges'] = {};
  for (const line of tree.lines) {
    if (!keptAddresses.has(line.address) || !edgeById.has(line.edgeId)) continue;
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

/** One box per node, the kept one, in tree order. */
function keptBoxes(tree: MapTree): MapBox[] {
  const kept: MapBox[] = [];
  const seen = new Set<NodeId>();
  for (const box of tree.boxes) {
    if (seen.has(box.nodeId)) continue;
    seen.add(box.nodeId);
    const address = keptAddress(tree, box.nodeId);
    const keptBox = tree.boxes.find(candidate => candidate.address === address);
    if (keptBox) kept.push(keptBox);
  }
  return kept;
}
