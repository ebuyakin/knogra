/**
 * Collapse Animator
 * Cy-mutating functions for cascading node collapse animations
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeConnection, SceneId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';
import { calculateDistances, findMaxDistance, filterNodesByDistance, findLeafNodes, computeUndirectedLayers } from '../utils/pure/scene-calculations';
import { findDescendants, determineNodesToKeep, findPrivateNeighbourhood } from './traversal';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';

/**
 * Delay utility
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Shrink node to parent position
 * Node moves to parent position while shrinking and fading out
 * 
 * @mutates Cytoscape instance
 */
async function shrinkNodeToParent(
  cy: Core,
  nodeId: NodeId,
  parentPosition: { x: number; y: number },
  duration: number,
  removeOnComplete: boolean
): Promise<void> {
  const node = cy.getElementById(nodeId);
  
  if (node.length === 0) {
    console.warn(`Node ${nodeId} not found`);
    return;
  }

  // Get connected edges
  const connectedEdges = node.connectedEdges();

  // Animate node: move to parent, shrink, fade
  node.animate({
    position: parentPosition,
    style: {
      width: 0,
      height: 0,
      opacity: 0
    },
    duration,
    easing: 'ease-in',
    complete: () => {
      // Remove node after animation (if requested)
      if (removeOnComplete) {
        node.remove();
      }
    }
  });

  // Fade out connected edges
  connectedEdges.animate({
    style: {
      opacity: 0
    },
    duration,
    easing: 'ease-in'
  });

  // Wait for animation to complete
  await delay(duration);
}

/**
 * Collapse nodes in cascading layers by distance from root
 * Complete collapse operation including edge handling and node removal
 * 
 * @mutates Cytoscape instance
 * @param cy - Cytoscape instance
 * @param rootNodeId - The root node to collapse (not removed, children are collapsed)
 */
export async function collapseNodesCascading(
  cy: Core,
  rootNodeId: NodeId
): Promise<void> {
  const cyNode = cy.getElementById(rootNodeId);
  if (cyNode.length === 0) {
    return;
  }

  // Get all nodes currently in scene
  const nodesInScene = new Set<NodeId>(cy.nodes().map(n => n.id() as NodeId));
  
  // Get edges from cy (need them for distance calculations and traversal)
  const edgesForDistance = cy.edges().map(e => ({
    sourceId: e.source().id() as NodeId,
    targetId: e.target().id() as NodeId
  }));

  // Find all descendants of this node
  // Cast to any to work around type incompatibility (findDescendants only needs sourceId/targetId)
  const descendants = findDescendants(rootNodeId, edgesForDistance as any, nodesInScene);
  
  if (descendants.size === 0) {
    // console.log(`Node ${rootNodeId} has no descendants to collapse`);
    return;
  }

  // Get central node (protected from removal) BEFORE determining what to remove
  const currentSceneId = cy.scratch('currentSceneId') as SceneId | undefined;
  const currentScene = currentSceneId ? graphStore.scenes.find(s => s.id === currentSceneId) : null;
  const centralNodeId = currentScene?.centralNodeId;
  
  // Remove central node from descendants - it's protected and stays
  if (centralNodeId && descendants.has(centralNodeId)) {
    descendants.delete(centralNodeId);
    if (isDebug('d_transition')) console.log(`[collapseNodesCascading] Protected central node ${centralNodeId} (removed from descendants)`);
  }
  
  if (descendants.size === 0) {
    if (isDebug('d_transition')) console.log('[collapseNodesCascading] No descendants to collapse after protecting central node');
    return;
  }

  // Get settings
  const collapseRemoveAll = getSetting('fold.collapseRemoveAll');
  const duration = getSetting('fold.collapseDuration');
  const delayBetweenLayers = getSetting('fold.collapseDelayBetweenLayers');

  // Determine which descendants to remove based on setting
  let nodesToRemove: NodeId[];
  
  if (collapseRemoveAll) {
    // Aggressive: remove all descendants
    nodesToRemove = Array.from(descendants);
    // console.log(`[collapseNodesCascading] Aggressive mode: removing all ${nodesToRemove.length} descendants`);
    
    // Find external edges (edges connecting descendants to nodes outside the collapsing tree)
    const descendantsSet = new Set(nodesToRemove);
    const collapsingTree = new Set([rootNodeId, ...nodesToRemove]); // root + all descendants
    
    const externalEdges = cy.edges().filter(edge => {
      const source = edge.source().id() as NodeId;
      const target = edge.target().id() as NodeId;
      
      // Edge must involve at least one descendant
      const involvesDescendant = descendantsSet.has(source) || descendantsSet.has(target);
      
      // External = at least one endpoint is outside the collapsing tree (not root, not descendant)
      const isExternal = !collapsingTree.has(source) || !collapsingTree.has(target);
      
      return involvesDescendant && isExternal;
    });
    
    // Fade out and remove external edges
    if (externalEdges.length > 0) {
      // console.log(`[collapseNodesCascading] Fading out ${externalEdges.length} external edges`);
      externalEdges.animate({
        style: { opacity: 0 },
        duration: duration / 2,
        easing: 'ease-in'
      });
      
      // Wait for fade-out
      await delay(duration / 2);
      
      // Remove external edges from cy (makes descendants become leaves)
      cy.remove(externalEdges);
      
      // Pause before collapse
      const edgeFadeDelay = getSetting('fold.collapseEdgeFadeDelay');
      await delay(edgeFadeDelay);
    }
  } else {
    // Safe: keep nodes with external connections
    // excludeSet = root + descendants (central already removed from descendants)
    const edgesInScene: EdgeConnection[] = cy.edges().map(edge => ({
      source: edge.source().id() as NodeId,
      target: edge.target().id() as NodeId
    }));
    
    const excludeSet = new Set([rootNodeId, ...descendants]);
    const nodesToKeep = determineNodesToKeep(descendants, excludeSet, edgesInScene);
    nodesToRemove = Array.from(descendants).filter(id => !nodesToKeep.has(id));
    if (isDebug('d_transition')) {
      console.log(`[collapseNodesCascading] Safe mode: descendants=${descendants.size}, keeping=${nodesToKeep.size}, removing=${nodesToRemove.length}`);
      console.log(`[collapseNodesCascading] descendants:`, [...descendants]);
      console.log(`[collapseNodesCascading] excludeSet:`, [...excludeSet]);
      console.log(`[collapseNodesCascading] nodesToKeep:`, [...nodesToKeep]);
      console.log(`[collapseNodesCascading] edgesInScene:`, edgesInScene);
    }
  }

  if (nodesToRemove.length === 0) {
    // console.log('No descendants to remove');
    return;
  }

  // Calculate distances ONCE at the start (pure function)
  const allDistances = calculateDistances(rootNodeId, nodesToRemove, edgesForDistance);
  
  let remainingNodes = new Set(nodesToRemove);
  const allAnimatedNodes: NodeId[] = []; // Collect all nodes to remove at the end

  // Helper to get parent position
  const getParentPosition = (childId: NodeId): { x: number; y: number } => {
    const child = cy.getElementById(childId);
    const incomingEdges = child.incomers('edge');
    
    if (incomingEdges.length > 0) {
      const parent = incomingEdges[0].source();
      return parent.position();
    }
    
    // Fallback: shrink to the node being collapsed
    return cyNode.position();
  };

  // Collapse layer by layer
  while (remainingNodes.size > 0) {
    // Find maximum distance among REMAINING nodes (pure)
    const maxDistance = findMaxDistance(remainingNodes, allDistances);
    
    // Find all remaining nodes at max distance (pure)
    const nodesAtMaxDistance = filterNodesByDistance(remainingNodes, allDistances, maxDistance);
    
    // Filter to only leaves (pure)
    const leaves = findLeafNodes(nodesAtMaxDistance, edgesForDistance, remainingNodes);

    if (leaves.length === 0) {
      console.warn('No leaves found, removing remaining nodes');
      break;
    }

    // Shrink all leaves in parallel (don't remove yet)
    await Promise.all(
      leaves.map(nodeId => {
        const parentPos = getParentPosition(nodeId);
        return shrinkNodeToParent(cy, nodeId, parentPos, duration, false); // false = don't remove
      })
    );

    // Collect nodes for batch removal at the end
    allAnimatedNodes.push(...leaves);

    // Remove leaves from remaining set
    leaves.forEach(nodeId => remainingNodes.delete(nodeId));

    // Delay before next layer (if there are more nodes)
    if (remainingNodes.size > 0) {
      await delay(delayBetweenLayers);
    }
  }

  // DEBUG: Log state before removal
  if (isDebug('d_transition')) {
    console.log('[collapseNodesCascading] nodesToRemove was:', nodesToRemove);
    console.log('[collapseNodesCascading] allAnimatedNodes:', allAnimatedNodes);
    console.log('[collapseNodesCascading] remainingNodes after loop:', [...remainingNodes]);
    console.log('[collapseNodesCascading] nodes in cy before remove:', cy.nodes().map(n => n.id()));
  }
  
  // Batch remove ALL nodes at once (after all animations complete)
  const selector = allAnimatedNodes.map(id => `#${id}`).join(', ');
  if (isDebug('d_transition')) console.log('[collapseNodesCascading] remove selector:', selector || '(empty)');
  
  if (selector) {
    cy.remove(cy.collection(selector));
  }
  if (isDebug('d_transition')) console.log('[collapseNodesCascading] nodes in cy after remove:', cy.nodes().map(n => n.id()));
}

/**
 * Exclude the "private neighbourhood" of a node with the same layered shrink
 * animation as descendant collapse, but traversing edges undirected. Removes
 * every node that is held in the scene only through the collapsing node (in any
 * direction), keeping nodes still anchored to the central node. The collapsing
 * node itself and the central node are never removed.
 *
 * @mutates Cytoscape instance
 * @param cy - Cytoscape instance
 * @param rootNodeId - The selected node whose private branches are excluded
 */
export async function excludeNeighboursCascading(
  cy: Core,
  rootNodeId: NodeId
): Promise<void> {
  const rootCyNode = cy.getElementById(rootNodeId);
  if (rootCyNode.length === 0) return;

  const nodesInScene = new Set<NodeId>(cy.nodes().map(n => n.id() as NodeId));
  const edgeConnections: EdgeConnection[] = cy.edges().map(edge => ({
    source: edge.source().id() as NodeId,
    target: edge.target().id() as NodeId
  }));

  const currentSceneId = cy.scratch('currentSceneId') as SceneId | undefined;
  const currentScene = currentSceneId ? graphStore.scenes.find(s => s.id === currentSceneId) : null;
  const centralNodeId = currentScene?.centralNodeId;
  if (!centralNodeId) {
    if (isDebug('d_transition')) console.log('[excludeNeighboursCascading] No central node found, aborting');
    return;
  }

  const nodesToRemove = findPrivateNeighbourhood(rootNodeId, centralNodeId, edgeConnections, nodesInScene);
  if (isDebug('d_transition')) {
    console.log(`[excludeNeighboursCascading] root=${rootNodeId}, central=${centralNodeId}, removing ${nodesToRemove.size}`, [...nodesToRemove]);
  }
  if (nodesToRemove.size === 0) return;

  // Undirected layers from the root: farthest nodes collapse first, each
  // shrinking toward its predecessor (the neighbour one step closer to root).
  const edgesForDistance = cy.edges().map(edge => ({
    sourceId: edge.source().id() as NodeId,
    targetId: edge.target().id() as NodeId
  }));
  const { distances, predecessors } = computeUndirectedLayers(rootNodeId, nodesToRemove, edgesForDistance);

  const duration = getSetting('fold.collapseDuration');
  const delayBetweenLayers = getSetting('fold.collapseDelayBetweenLayers');

  const shrinkTargetPosition = (nodeId: NodeId): { x: number; y: number } => {
    const predecessorId = predecessors.get(nodeId);
    const target = predecessorId ? cy.getElementById(predecessorId) : rootCyNode;
    if (target.length > 0) return target.position();
    return rootCyNode.position();
  };

  const remaining = new Set(nodesToRemove);
  const allAnimatedNodes: NodeId[] = [];

  while (remaining.size > 0) {
    const maxDistance = findMaxDistance(remaining, distances);
    let layer = filterNodesByDistance(remaining, distances, maxDistance);
    if (layer.length === 0) layer = [...remaining]; // safety: never loop forever

    await Promise.all(
      layer.map(nodeId => shrinkNodeToParent(cy, nodeId, shrinkTargetPosition(nodeId), duration, false))
    );

    allAnimatedNodes.push(...layer);
    layer.forEach(nodeId => remaining.delete(nodeId));

    if (remaining.size > 0) {
      await delay(delayBetweenLayers);
    }
  }

  const selector = allAnimatedNodes.map(id => `#${id}`).join(', ');
  if (selector) {
    cy.remove(cy.collection(selector));
  }
}
