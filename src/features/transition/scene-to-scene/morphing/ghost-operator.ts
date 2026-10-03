/**
 * GhostOperator
 *
 * Layer 3 operator that manages temporary "ghost" elements for crossfading.
 * Spawns clones of nodes/edges with "Old" styles while real elements assume "New" styles.
 */

import type { Core } from 'cytoscape';
import type { Scene } from '../../../../core/main-types';
import { graphStore } from '../../../../storage/graph-store';
import { StyleGenerator } from '../../../../styles/style-generator';
import { resolveSceneEdgeVisualState } from '../../../../styles/edge-visual-resolver';
import type { TransitionAnalysis } from './transition-analysis-operator';

export class GhostOperator {
  #cy: Core;
  #ghostIds: Set<string> = new Set();
  #ghostMap: Map<string, string> = new Map(); // originalId → ghostId
  #ghostStyles: Map<string, any> = new Map(); // ghostId → visual style object
  
  constructor(cy: Core) {
    this.#cy = cy;
  }

  /**
   * Create all necessary ghost elements for the detected changes.
   * Returns a collection of ghost elements references.
   */
  async createGhosts(
    analysis: TransitionAnalysis,
    currentScene: Scene // Used to get Old Designs
  ): Promise<void> {
    const themeId = currentScene.themeId || 'dark';

    // 1. Create Node Ghosts
    for (const change of analysis.nodes.crossfade) {
      const originalNode = this.#cy.getElementById(change.nodeId);
      if (originalNode.length === 0) continue;

      const ghostId = `ghost_node_${change.nodeId}_${Date.now()}`;
      const position = originalNode.position();
      const nodeData = graphStore.nodes.find(n => n.id === change.nodeId);
      
      if (!nodeData) continue;

      // Calculate OLD style
      const oldStyle = await StyleGenerator.generateNodeStyle(
        nodeData, 
        change.oldDesign, 
        themeId
      );

      // Apply Old Scale
      if (change.oldScale !== 1.0) {
        oldStyle.width *= change.oldScale;
        oldStyle.height *= change.oldScale;
      }

      // Add Ghost Node — visual style will be applied via stylesheet rule,
      // only transient properties (opacity, z-index) set as bypasses.
      const ghostData: Record<string, unknown> = { 
        id: ghostId, 
        originalId: change.nodeId
      };
      // Copy centralNode flag so ghost shows blue border during crossfade
      if (originalNode.data('centralNode')) {
        ghostData.centralNode = originalNode.data('centralNode');
      }
      this.#cy.add({
        group: 'nodes',
        classes: 'ghost transition-ghost',
        data: ghostData,
        position: { ...position }
      });
      
      const ghost = this.#cy.getElementById(ghostId);
      // Inherit selection state so ghost gets the same border style (e.g. central+selected)
      if (originalNode.selected()) {
        ghost.select();
      }
      ghost.style({
        'opacity': 0, // Hidden until stylesheet rule is applied
        'z-index': 0,
        'z-index-compare': 'manual'
      });
      
      this.#ghostIds.add(ghostId);
      this.#ghostMap.set(change.nodeId, ghostId);
      this.#ghostStyles.set(ghostId, oldStyle);
    }

    // 2. Create Edge Ghosts
    for (const change of analysis.edges.crossfade) {
      const realEdge = this.#cy.getElementById(change.edgeId);
      if (realEdge.length === 0) continue;

      const sourceId = realEdge.source().id();
      const targetId = realEdge.target().id();

      // Attach ghost edge to ghost nodes (if they exist) so endpoints
      // align with the old-design dimensions. Fallback to real nodes
      // for endpoints that aren't crossfading.
      const ghostSourceId = this.#ghostMap.get(sourceId) || sourceId;
      const ghostTargetId = this.#ghostMap.get(targetId) || targetId;
      
      const ghostId = `ghost_edge_${change.edgeId}_${Date.now()}`;
      const edgeData = graphStore.edges.find(edge => edge.id === change.edgeId);
      if (!edgeData) continue;
      
      const oldStyle = resolveSceneEdgeVisualState({
        edge: edgeData,
        scene: currentScene,
        edgeTypes: graphStore.edgeTypes,
        themeId
      }).style;
      
      // Add Ghost Edge — visual style via stylesheet, only opacity as bypass
      this.#cy.add({
        group: 'edges',
        classes: 'ghost transition-ghost',
        data: {
          id: ghostId,
          source: ghostSourceId,
          target: ghostTargetId,
          originalId: change.edgeId
        }
      });

      const ghost = this.#cy.getElementById(ghostId);
      ghost.style({
        'opacity': 0, // Hidden until stylesheet rule is applied
        'z-index': 0,
        'z-index-compare': 'manual'
      });

      this.#ghostIds.add(ghostId);
      this.#ghostMap.set(change.edgeId, ghostId);
      this.#ghostStyles.set(ghostId, oldStyle);
    }
  }
  
  /**
   * Remove all ghost elements
   */
  cleanup(): void {
    if (this.#ghostIds.size === 0) return;
    
    this.#cy.startBatch();
    for (const id of this.#ghostIds) {
      const el = this.#cy.getElementById(id);
      if (el.length > 0) {
        el.remove();
      }
    }
    this.#cy.endBatch();
    this.#ghostIds.clear();
    this.#ghostMap.clear();
    this.#ghostStyles.clear();
  }
  
  /**
   * Get stylesheet rules for all ghosts.
   * Visual properties are applied via the stylesheet (not bypasses)
   * to survive cy.style().fromJson().update() calls.
   */
  getStylesheetRules(): Array<{ selector: string; style: any }> {
    const rules: Array<{ selector: string; style: any }> = [];
    for (const [ghostId, style] of this.#ghostStyles) {
      const isEdge = ghostId.startsWith('ghost_edge_');
      const prefix = isEdge ? 'edge' : 'node';
      rules.push({
        selector: `${prefix}[id = "${ghostId}"]`,
        style
      });
    }
    return rules;
  }

  /**
   * Make all ghosts visible. Called after stylesheet rules are applied.
   */
  revealGhosts(): void {
    for (const id of this.#ghostIds) {
      const el = this.#cy.getElementById(id);
      if (el.length > 0) {
        const opacity = this.#ghostStyles.get(id)?.opacity;
        el.style('opacity', typeof opacity === 'number' ? opacity : 1);
      }
    }
  }

  /**
   * Get ghost corresponding to a specific real element
   */
  getGhostFor(originalId: string): any {
    const ghostId = this.#ghostMap.get(originalId);
    if (ghostId) {
      return this.#cy.getElementById(ghostId);
    }
    return this.#cy.collection();
  }
}
