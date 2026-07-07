/**
 * Scene Elements Builder
 * Converts scene data to Cytoscape elements
 * NO DEPENDENCIES TO BE INTRODUCED IN THIS FILE (BESIDES TYPES)
 */

import type { Scene, Node, Edge } from '../../core/main-types';

/**
 * Build Cytoscape elements from scene data
 */
export function buildElements(
  scene: Scene,
  allNodes: Node[],
  allEdges: Edge[]
): any[] {
  const elements: any[] = [];

  // Build nodes
  for (const [nodeId, sceneNode] of Object.entries(scene.nodes)) {
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) {
      console.warn(`Node ${nodeId} in scene but not in database`);
      continue;
    }

    elements.push({
      group: 'nodes',
      data: {
        ...node,
        label: node.title,
        scale: sceneNode.scale,
        design: sceneNode.design
      },
      // Clone: Cytoscape mutates the position object in place on every drag and
      // animation; passing the raw graphStore ref aliases the in-memory cache.
      position: { x: sceneNode.position.x, y: sceneNode.position.y },
      classes: sceneNode.design?.id || ''
    });
  }

  // Build edges
  for (const [edgeId, sceneEdge] of Object.entries(scene.edges)) {
    const edge = allEdges.find(e => e.id === edgeId);
    if (!edge) {
      console.warn(`Edge ${edgeId} in scene but not in database`);
      continue;
    }

    elements.push({
      group: 'edges',
      data: {
        ...edge,
        source: edge.sourceId,
        target: edge.targetId,
        design: sceneEdge.design,
        curve: sceneEdge.curve
      },
      classes: sceneEdge.design?.id || ''
    });
  }

  return elements;
}
