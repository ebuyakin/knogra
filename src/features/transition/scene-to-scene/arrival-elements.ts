/**
 * Arriving elements
 *
 * Adding arriving nodes and edges to the instance with their scene styles,
 * invisible, ready to be animated: what every arrival animator does before it
 * moves anything, written once (docs/scene-transitions.md §4.2). A library an
 * arrival animator may use, like cascade.ts; not part of the interface.
 */

import type { Core } from 'cytoscape';
import type { EdgeId, Node, NodeId, Scene } from '../../../core/main-types';
import type { TargetPositions } from '../element-classification-utils';
import type { Position } from './animators';
import type { EndpointsOf } from './cascade';
import { graphStore } from '../../../storage/graph-store';
import { StyleGenerator } from '../../../styles/style-generator';

interface StyleRule {
  selector: string;
  style: Record<string, unknown>;
}

function readStylesheet(cy: Core): StyleRule[] {
  return (cy.style() as unknown as { json(): StyleRule[] }).json();
}

/**
 * The arriving edges whose endpoints are all arriving or already in the
 * instance. The rest belong to folded nodes, which FoldStateHandler adds
 * after the arrival phase; adding their edges now would dangle.
 */
export function presentEdges(cy: Core, edgeIds: EdgeId[], arriving: Set<NodeId>, endpointsOf: EndpointsOf): EdgeId[] {
  return edgeIds.filter(edgeId => {
    const endpoints = endpointsOf(edgeId);
    return endpoints !== null && endpoints.every(nodeId => arriving.has(nodeId) || cy.getElementById(nodeId).length > 0);
  });
}

/**
 * Add every arriving node at the start position chosen for it, invisible, in
 * its scene design and scale, and give it its stylesheet rule. A node already
 * in the instance is a classification bug and is skipped with a warning.
 */
export async function addArrivingNodes(
  cy: Core,
  nodeIds: NodeId[],
  scene: Scene,
  targetPositions: TargetPositions,
  startPositionOf: (nodeId: NodeId, target: Position) => Position
): Promise<void> {
  const added: Array<{ nodeId: NodeId; nodeData: Node; design: { id: string; params: Record<string, unknown> }; scale?: number }> = [];
  for (const nodeId of nodeIds) {
    const sceneNode = scene.nodes[nodeId];
    const nodeData = graphStore.nodes.find(node => node.id === nodeId);
    const target = targetPositions[nodeId];
    if (!sceneNode || !nodeData || !target) {
      console.warn(`[arrival] Node ${nodeId} cannot arrive: ${!sceneNode ? 'not in the target scene' : !nodeData ? 'not in the graph' : 'no target position'}`);
      continue;
    }
    const existing = cy.getElementById(nodeId);
    if (existing.length > 0) {
      console.warn(`[d_fold] arrival: node ${nodeId} already in cy! display=${existing.style('display')}. Skipping add.`);
      continue;
    }

    // A copy: Cytoscape adopts the object it is given as the element's live
    // position and mutates it as the node moves. A start position that is
    // another node's target (grow) would otherwise drag that target along.
    const start = startPositionOf(nodeId, target);
    const element = cy.add({
      group: 'nodes',
      data: { ...nodeData, id: nodeId, design: sceneNode.design, scale: sceneNode.scale },
      position: { x: start.x, y: start.y },
    });
    element.style('opacity', 0);
    added.push({ nodeId, nodeData, design: sceneNode.design, scale: sceneNode.scale });
  }

  if (added.length === 0) return;
  const stylesheet = await StyleGenerator.addNodesToStylesheet(readStylesheet(cy), added, scene.themeId || 'dark');
  cy.style().fromJson(stylesheet).update();
}

/**
 * Add the arriving edges not yet in the instance, invisible, carrying their
 * scene design and curve so each edge owns its style rather than depending on
 * a leftover rule. Returns the ones added; their per-edge rules are the
 * caller's to apply (`applyArrivingEdgeStyles`) before they are shown.
 */
export function addArrivingEdges(cy: Core, edgeIds: EdgeId[], scene: Scene): EdgeId[] {
  const added: EdgeId[] = [];
  for (const edgeId of edgeIds) {
    if (cy.getElementById(edgeId).length > 0) continue;
    const edgeData = graphStore.edges.find(edge => edge.id === edgeId);
    if (!edgeData) {
      console.warn(`[arrival] Edge ${edgeId} not found in graph store`);
      continue;
    }
    const element = cy.add({
      group: 'edges',
      data: { ...edgeData, id: edgeId, source: edgeData.sourceId, target: edgeData.targetId, design: scene.edges[edgeId]?.design, curve: scene.edges[edgeId]?.curve },
    });
    element.style('opacity', 0);
    added.push(edgeId);
  }
  return added;
}

/**
 * Reconcile per-edge rules for arriving edges, as opening a scene does: an
 * edge with a scene-level override needs its rule regenerated after being
 * added; an edge without one must lose any stale rule from a scene visited
 * earlier, or it arrives carrying another scene's bend or style.
 */
export function applyArrivingEdgeStyles(cy: Core, edgeIds: EdgeId[], scene: Scene): void {
  const themeId = scene.themeId || 'dark';
  let stylesheet = readStylesheet(cy);
  let changed = false;
  for (const edgeId of edgeIds) {
    const sceneEdge = scene.edges[edgeId];
    const next: StyleRule[] = StyleGenerator.applyEdgeOverrideToStylesheet(stylesheet, edgeId, sceneEdge, themeId);
    // An update rewrites the rule in place; a removal only changes the length.
    if (StyleGenerator.hasEdgeStyleOverride(sceneEdge) || next.length !== stylesheet.length) changed = true;
    stylesheet = next;
  }
  if (changed) cy.style().fromJson(stylesheet).update();
}
