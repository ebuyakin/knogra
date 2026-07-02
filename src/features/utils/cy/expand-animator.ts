/**
 * Expand Animator
 * Cy-mutating functions for expanding collapsed nodes with animation
 */

import type { Core } from 'cytoscape';
import type { NodeId } from '../../../core/main-types';

import { graphStore } from '../../../storage/graph-store';
import { StyleGenerator } from '../../../styles/style-generator';

import { findDirectChildren, findDirectParents, mapPositionsToNodes, findRelevantEdges } from '../pure/scene-calculations';
import { circularSpreadSafe } from '../pure/position-expansion';
import { placeExpansionFan, type NodeObstacle, type EdgeObstacle, type ViewportRect } from '../pure/donut-placement';
import { getSetting } from '../../../config';
import { isDebug } from '../../../config/debug-flags';

/**
 * Delay utility
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Grow node from parent position
 * Node appears from parent position and grows to target position
 * 
 * @mutates Cytoscape instance
 */
async function growNodeFromParent(
  cy: Core,
  nodeId: NodeId,
  fromPosition: { x: number; y: number },
  toPosition: { x: number; y: number },
  duration: number
): Promise<void> {
  const node = cy.getElementById(nodeId);
  
  if (node.length === 0) {
    console.warn(`Node ${nodeId} not found`);
    return;
  }

  // CRITICAL: Position node slightly offset from parent (1px)
  // If at exact same position, Cytoscape bugs and animates both nodes together!
  node.position({
    x: fromPosition.x + 1,
    y: fromPosition.y + 1
  });

  // Get original size from current style (before we hide it)
  const originalWidth = node.style('width');
  const originalHeight = node.style('height');

  // Set initial style: size 0, opacity 0
  node.style({
    width: 0,
    height: 0,
    opacity: 0
  });

  // Get connected edges and hide them
  const connectedEdges = node.connectedEdges();
  connectedEdges.style({ opacity: 0 });

  // Animate to final state (restore original size)
  node.animate({
    position: toPosition,
    style: {
      width: originalWidth,
      height: originalHeight,
      opacity: 1
    },
    duration,
    easing: 'ease-out'
  });

  // Fade in connected edges
  connectedEdges.animate({
    style: {
      opacity: 1
    },
    duration,
    easing: 'ease-out'
  });

  // Wait for animation to complete
  await delay(duration);
}

/**
 * Expansion mode: which connections to include
 */
export type ExpandMode = 'children' | 'parents' | 'both';

/**
 * Expand connections of a node with grow animation
 * Connected nodes appear from node position and grow outward to calculated positions
 * Only animates newly added nodes (existing nodes stay in place)
 * 
 * @mutates Cytoscape instance
 * @param cy - Cytoscape instance
 * @param nodeId - ID of node to expand
 * @param mode - Which connections to expand: 'children', 'parents', or 'both'
 * @param duration - Animation duration in milliseconds
 */
export async function expandNodeConnections(
  cy: Core,
  nodeId: NodeId,
  mode: ExpandMode = 'children',
  duration: number = 600
): Promise<void> {
  const cyNode = cy.getElementById(nodeId);
  if (cyNode.length === 0) {
    console.warn(`Node ${nodeId} not found`);
    return;
  }

  const rootPosition = cyNode.position();
  
  // Determine design based on settings
  const inheritDesign = getSetting('node.inheritDesignForConnected');
  const nodeDesign = inheritDesign
    ? (cyNode.data('design') || { id: getSetting('node.defaultDesign'), params: {} })
    : { id: getSetting('node.defaultDesign'), params: {} };
  const nodeScale = cyNode.data('scale') || 1.0;
  
  // Calculate minRadius: parent half-size + child half-size + margin
  const parentBBox = cyNode.boundingBox();
  const parentSize = Math.max(parentBBox.w, parentBBox.h);
  const parentHalfSize = parentSize / 2;
  
  // Child size: same as parent if inheriting, otherwise default 120
  const childBaseSize = inheritDesign ? parentSize : 120;
  const childHalfSize = (childBaseSize * nodeScale) / 2;
  
  // Gap between the parent's edge and a child's edge. A full child-radius of
  // breathing room keeps the fan from crowding the parent in open space.
  const margin = childHalfSize;
  const minRadius = parentHalfSize + childHalfSize + margin;
  
  // Child size for donut placement algorithm
  const childSize = childBaseSize * nodeScale;
  
  // Build node obstacles with actual bounding boxes.
  // EXCLUDE the expanding node itself - we grow away from it, it shouldn't block placement.
  const nodeObstacles: NodeObstacle[] = [];
  cy.nodes().forEach(n => {
    if (n.id() !== nodeId) {
      const bbox = n.boundingBox();
      nodeObstacles.push({
        pos: n.position(),
        size: Math.max(bbox.w, bbox.h)
      });
    }
  });

  // Build edge obstacles as straight source→target segments so the fan avoids
  // crossing existing connections, not just existing nodes.
  const edgeObstacles: EdgeObstacle[] = [];
  cy.edges().forEach(e => {
    const src = e.source();
    const tgt = e.target();
    if (src.length > 0 && tgt.length > 0) {
      edgeObstacles.push({
        a: src.position(),
        b: tgt.position(),
        incidentToParent: src.id() === nodeId || tgt.id() === nodeId
      });
    }
  });
  
  // Get connected nodes based on mode (pure functions)
  // Parents are placed first angularly, then children
  let allParentIds: NodeId[] = [];
  let allChildIds: NodeId[] = [];
  
  if (mode === 'parents' || mode === 'both') {
    allParentIds = findDirectParents(nodeId, graphStore.edges);
  }
  if (mode === 'children' || mode === 'both') {
    allChildIds = findDirectChildren(nodeId, graphStore.edges);
  }
  
  // Combine: parents first, then children (for angular grouping)
  const allConnectedIds = [...allParentIds, ...allChildIds];
  
  // Filter to only nodes NOT already in the scene
  const connectedIds = allConnectedIds.filter(id => cy.getElementById(id).length === 0);
  
  if (connectedIds.length === 0) {
    if (isDebug('d_transition')) console.log(`[expandNodeConnections] No new ${mode} to expand (all already visible)`);
    return;
  }
  
  if (isDebug('d_transition')) console.log(`[expandNodeConnections] Adding ${connectedIds.length} new nodes (mode: ${mode}, ${allConnectedIds.length - connectedIds.length} already visible)`);
  
  // Calculate positions with collision avoidance
  let childPositions;
  const useDonutPlacement = true; // test/debug flag
  
  if (useDonutPlacement) {
    // Reference centre for the outward axis: the scene's central node, so the
    // fan grows away from the scene's anchor. Fall back to the screen centre.
    const pan = cy.pan();
    const zoom = cy.zoom();
    const container = cy.container();

    const screenCenter = container
      ? {
          x: (container.clientWidth / 2 - pan.x) / zoom,
          y: (container.clientHeight / 2 - pan.y) / zoom
        }
      : { x: 0, y: 0 };

    const centralNode = cy.nodes('[?centralNode]');
    const referenceCenter = centralNode.length > 0 ? centralNode[0].position() : screenCenter;

    // Visible viewport in model coordinates. The camera is fixed during
    // expansion, so we plan inside this frame and only overshoot when forced.
    const viewport: ViewportRect | null = container
      ? {
          x1: (0 - pan.x) / zoom,
          y1: (0 - pan.y) / zoom,
          x2: (container.clientWidth - pan.x) / zoom,
          y2: (container.clientHeight - pan.y) / zoom
        }
      : null;

    if (isDebug('d_transition')) {
      console.log(`[expandNodeConnections] referenceCenter: x=${referenceCenter.x.toFixed(0)}, y=${referenceCenter.y.toFixed(0)}`);
      console.log(`[expandNodeConnections] nodePos: ${rootPosition.x}, ${rootPosition.y}, minRadius: ${minRadius}, childSize: ${childSize}`);
    }

    childPositions = placeExpansionFan({
      parentPos: rootPosition,
      childCount: connectedIds.length,
      childSize,
      nodeObstacles,
      edgeObstacles,
      minRadius,
      maxRadius: 2000,
      referenceCenter,
      viewport
    });
  } else {
    // Original circular spread algorithm (uses just positions)
    const existingPositions = nodeObstacles.map(o => o.pos);
    childPositions = circularSpreadSafe(
      rootPosition,
      connectedIds.length,
      existingPositions,
      minRadius
    );
  }
  
  // Map positions to node IDs (pure function)
  const positionsMap = mapPositionsToNodes(connectedIds, childPositions);
  
  // Track which nodes are newly added
  const newNodeIds: NodeId[] = [];
  
  // Add all connected nodes to cytoscape (if not already there)
  // CRITICAL: Position slightly offset from central node (+1px) to avoid Cytoscape animation bug
  connectedIds.forEach((connId, index) => {
    if (cy.getElementById(connId).length === 0) {
      const nodeData = graphStore.nodes.find(n => n.id === connId);
      if (nodeData) {
        cy.add({
          group: 'nodes',
          data: {
            ...nodeData,
            design: nodeDesign,  // Inherit central node's design
            scale: nodeScale     // Inherit central node's scale
          },
          position: {
            x: rootPosition.x + 1 + index * 0.1,  // Slight offset per node
            y: rootPosition.y + 1 + index * 0.1
          }
        });
        newNodeIds.push(connId);
      } else {
        console.warn(`Node data not found for ${connId}`);
      }
    }
  });
  
  // Apply styles to newly added nodes
  if (newNodeIds.length > 0) {
    const currentSceneId = cy.scratch('currentSceneId') as string;
    const currentScene = currentSceneId ? await graphStore.readScene(currentSceneId) : null;
    const themeId = currentScene?.themeId || 'dark';
    
    const stylesheet = (cy.style() as any).json();
    const nodesToStyle = newNodeIds.map(nId => {
      const nodeData = graphStore.nodes.find(n => n.id === nId);
      return {
        nodeId: nId,
        nodeData: nodeData!,
        design: nodeDesign,
        scale: nodeScale
      };
    });
    
    const updatedStylesheet = await StyleGenerator.addNodesToStylesheet(
      stylesheet,
      nodesToStyle,
      themeId
    );
    cy.style().fromJson(updatedStylesheet).update();
  }
  
  // Add edges connecting to the central node (both directions based on mode)
  const relevantEdges = graphStore.edges.filter(edge => 
    edge.sourceId === nodeId || edge.targetId === nodeId
  );
  
  relevantEdges.forEach(edge => {
    const sourceExists = cy.getElementById(edge.sourceId).length > 0;
    const targetExists = cy.getElementById(edge.targetId).length > 0;
    
    if (sourceExists && targetExists && cy.getElementById(edge.id).length === 0) {
      cy.add({
        group: 'edges',
        data: {
          ...edge,
          id: edge.id,
          source: edge.sourceId,
          target: edge.targetId
        }
      });
    }
  });
  
  // Animate growth - ONLY newly added nodes
  if (newNodeIds.length > 0) {
    await Promise.all(
      newNodeIds.map(nId => {
        const targetPos = positionsMap.get(nId)!;
        return growNodeFromParent(
          cy,
          nId,
          rootPosition,  // fromPosition (central node position)
          targetPos,
          duration
        );
      })
    );
  }
  
  // After animation completes, add extra edges with fade-in
  const showAllEdges = getSetting('fold.expandShowAllEdges');
  
  if (showAllEdges && newNodeIds.length > 0) {
    // Pause before adding extra edges
    const edgeFadeDelay = getSetting('fold.expandEdgeFadeDelay');
    await delay(edgeFadeDelay);
    
    const nodesInScene = new Set(cy.nodes().map(n => n.id() as NodeId));
    const edgesInScene = new Set(cy.edges().map(e => e.id()));
    
    const extraEdges = findRelevantEdges(
      newNodeIds,
      nodesInScene,
      graphStore.edges,
      edgesInScene
    );
    
    // Add extra edges (excluding ones already added)
    const alreadyAddedEdgeIds = new Set(relevantEdges.map(e => e.id));
    const edgesToFadeIn = extraEdges.filter(e => !alreadyAddedEdgeIds.has(e.id));
    
    edgesToFadeIn.forEach(edge => {
      // Add edge with opacity 0
      cy.add({
        group: 'edges',
        data: {
            ...edge,
          id: edge.id,
          source: edge.sourceId,
          target: edge.targetId
        }
      });
      
      // Set initial opacity to 0
      cy.getElementById(edge.id).style('opacity', 0);
    });
    
    // Fade in extra edges
    if (edgesToFadeIn.length > 0) {
      const edgeCollection = cy.collection(edgesToFadeIn.map(e => `#${e.id}`).join(', '));
      edgeCollection.animate({
        style: { opacity: 1 },
        duration: duration, 
        easing: 'ease-out'
      });
    }
  }
}
