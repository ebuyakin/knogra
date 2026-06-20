/**
 * TransitionAnalysisOperator
 *
 * Layer 3 operator that analyzes changes between scenes
 * to determine animation strategies. Categorizes elements into
 * "Simple Move/Tween" vs "Crossfade/Morph".
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene } from '../../../../core/main-types';
import { graphStore } from '../../../../storage/graph-store';
import { isDebug } from '../../../../config/debug-flags';
import { resolveSceneEdgeVisualState } from '../../../../styles/edge-visual-resolver';

export interface NodeChange {
  nodeId: NodeId;
  oldDesign: any;
  newDesign: any;
  oldScale: number;
  newScale: number;
}

export interface EdgeChange {
  edgeId: EdgeId;
  oldParams: any;
  newParams: any;
  structuralChange: boolean; // True if curve-style or connection anchors change
}

export interface TransitionAnalysis {
  nodes: {
    moveOnly: NodeId[];
    crossfade: NodeChange[];
  };
  edges: {
    tween: EdgeId[];
    crossfade: EdgeChange[];
  };
}

export class TransitionAnalysisOperator {
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  /**
   * Optimize transition strategy by categorizing elements
   */
  analyze(
    sharedNodeIds: NodeId[],
    currentScene: Scene,
    targetScene: Scene
  ): TransitionAnalysis {
    const analysis: TransitionAnalysis = {
      nodes: { moveOnly: [], crossfade: [] },
      edges: { tween: [], crossfade: [] }
    };

    const currentThemeId = currentScene.themeId || 'dark';
    const targetThemeId = targetScene.themeId || 'dark';
    const themeChanged = currentThemeId !== targetThemeId;

    // 1. Analyze Nodes
    for (const nodeId of sharedNodeIds) {
      const cyNode = this.#cy.getElementById(nodeId);
      if (cyNode.length === 0) continue;

      const oldDesign = cyNode.data('design'); // Current state in Cy
      const targetNodeData = targetScene.nodes[nodeId];
      if (!targetNodeData) continue;

      const newDesign = targetNodeData.design;
      const oldScale = cyNode.data('scale') || 1.0;
      const newScale = targetNodeData.scale || 1.0;

      const designChanged = JSON.stringify(oldDesign) !== JSON.stringify(newDesign);
      
      if (isDebug('d_analyzer')) {
        console.log(`[d_analyzer] node ${nodeId}: scale ${oldScale}→${newScale}, designChanged=${designChanged}`);
        if (designChanged) {
          console.log(`[d_analyzer]   old: ${JSON.stringify(oldDesign)}`);
          console.log(`[d_analyzer]   new: ${JSON.stringify(newDesign)}`);
        }
      }

      // If theme changed or design changed, we must Crossfade
      // (Theme change implies colors/fonts change which might not tween nicely if structural)
      // Actually, simple theme color changes can tween, but safely we crossfade for now to avoid artifacts
      if (themeChanged || designChanged) {
        if (isDebug('d_analyzer')) console.log(`[d_analyzer] node ${nodeId}: → CROSSFADE (${themeChanged ? 'theme' : 'design'})`);
        analysis.nodes.crossfade.push({
          nodeId,
          oldDesign,
          newDesign,
          oldScale,
          newScale
        });
      } else {
        if (isDebug('d_analyzer')) console.log(`[d_analyzer] node ${nodeId}: → MOVE_ONLY (scale ${oldScale === newScale ? 'same' : 'differs'})`);
        analysis.nodes.moveOnly.push(nodeId);
      }
    }

    // 2. Analyze Edges
    const sharedEdgeIds = this.#findSharedEdges(sharedNodeIds, targetScene);
    if (isDebug('d_analyzer')) console.log(`[d_analyzer] sharedEdgeIds=[${sharedEdgeIds}]`);
    
    for (const edgeId of sharedEdgeIds) {
      const cyEdge = this.#cy.getElementById(edgeId);
      if (cyEdge.length === 0) continue;

      // Ensure we have data for this edge
      const edgeData = graphStore.edges.find(e => e.id === edgeId);
      if (!edgeData) continue;

      // Extract designs (handling overrides and defaults)
      const oldOverride = currentScene.edges?.[edgeId]?.design;
      const newOverride = targetScene.edges?.[edgeId]?.design;

      if (isDebug('d_analyzer')) {
        console.log(`[d_analyzer] ${edgeId}: oldOverride=`, oldOverride, 'newOverride=', newOverride);
        console.log(`[d_analyzer] ${edgeId}: cyData.design=`, cyEdge.data('design'), 'computedColor=', cyEdge.style('line-color'), 'computedCurve=', cyEdge.style('curve-style'));
      }

      const oldThemeId = currentScene.themeId || 'dark';
      const newThemeId = targetScene.themeId || 'dark';
      const oldResolved = resolveSceneEdgeVisualState({
        edge: edgeData,
        scene: currentScene,
        edgeTypes: graphStore.edgeTypes,
        themeId: oldThemeId
      }).style;
      const newResolved = resolveSceneEdgeVisualState({
        edge: edgeData,
        scene: targetScene,
        edgeTypes: graphStore.edgeTypes,
        themeId: newThemeId
      }).style;

      // Structural properties that require ghost-based crossfade (can't be tweened)
      const structuralProps: string[] = [
        'curve-style', 'control-point-distances', 'control-point-weights',
        'segment-distances', 'segment-weights', 'edge-distances',
        'taxi-direction', 'taxi-turn'
      ];

      // Check if any visual property differs
      const diffDetected = JSON.stringify(oldResolved) !== JSON.stringify(newResolved);

      // Check if any structural property differs in the resolved styles
      const structuralChange = diffDetected && structuralProps.some(prop => {
        const oldVal = JSON.stringify(oldResolved[prop] ?? null);
        const newVal = JSON.stringify(newResolved[prop] ?? null);
        return oldVal !== newVal;
      });

      if (isDebug('d_analyzer')) {
        console.log(`[d_analyzer] ${edgeId}: resolved old curve=${oldResolved['curve-style']} new curve=${newResolved['curve-style']} diff=${diffDetected} structural=${structuralChange}`);
      }

      // Check if either endpoint is a crossfading node (changing size/shape)
      // If so, we MUST use ghost-based crossfade regardless of edge diff
      const crossfadeNodeIds = new Set(analysis.nodes.crossfade.map(c => c.nodeId));
      const sourceId = cyEdge.source().id() as NodeId;
      const targetId = cyEdge.target().id() as NodeId;
      const endpointCrossfading = crossfadeNodeIds.has(sourceId) || crossfadeNodeIds.has(targetId);

      if (endpointCrossfading || structuralChange) {
        // Ghost-based crossfade: endpoint changing shape OR structural edge change
        if (isDebug('d_analyzer')) console.log(`[d_analyzer] ${edgeId}: → CROSSFADE (${structuralChange ? 'structural' : endpointCrossfading ? 'endpoint crossfading' : 'diff'})`);
        analysis.edges.crossfade.push({
          edgeId,
          oldParams: oldOverride,
          newParams: newOverride,
          structuralChange
        });
      } else if (diffDetected) {
        // Non-structural diff, stable endpoints → tween
        if (isDebug('d_analyzer')) console.log(`[d_analyzer] ${edgeId}: → TWEEN (non-structural diff, stable endpoints)`);
        analysis.edges.tween.push(edgeId);
      } else {
        if (isDebug('d_analyzer')) console.log(`[d_analyzer] ${edgeId}: → TWEEN (no diff)`);
        analysis.edges.tween.push(edgeId);
      }
    }

    return analysis;
  }

  #findSharedEdges(sharedNodeIds: NodeId[], _targetScene: Scene): EdgeId[] {
    // Find edges where both source/target are in sharedNodeIds
    // AND the edge exists in the target scene (some edges might disappear if excluded?)
    // Actually, edges are global in data, but validity depends on nodes presence.
    // If both nodes are shared, the edge is shared.
    
    const nodeSet = new Set(sharedNodeIds);
    const sharedEdges: EdgeId[] = [];
    
    // We can iterate Cytoscape edges since they represent the Current Scene state
    const cyEdges = this.#cy.edges();
    for (let i = 0; i < cyEdges.length; i++) {
        const edge = cyEdges[i];
        if (nodeSet.has(edge.source().id()) && nodeSet.has(edge.target().id())) {
            sharedEdges.push(edge.id());
        }
    }
    return sharedEdges;
  }
}
