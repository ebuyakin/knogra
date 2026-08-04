/**
 * FoldStateHandler
 *
 * Applies persisted fold state to Cytoscape after a scene transition completes.
 * Used by both open-scene and scene-to-scene paths — owned by Transition (Layer 0).
 *
 * Responsibilities:
 * - Add hidden (folded) nodes/edges to cy (they were excluded from animation)
 * - Apply styles to newly added hidden nodes
 * - Set display:none on hidden nodes and their edges
 * - Add .fold-root class to fold root nodes
 * - Write fold state to cy.scratch for GraphSaver and FoldManager
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene } from '../../core/main-types';

import { graphStore } from '../../storage/graph-store';
import { isDebug } from '../../config/debug-flags';
import { StyleGenerator } from '../../styles/style-generator';

export class FoldStateHandler {
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  /**
   * Apply fold state after scene transition: ensure hidden nodes exist in cy,
   * hide them, add fold-root indicators, write to cy.scratch.
   */
  async apply(scene: Scene, themeId: string): Promise<void> {
    if (isDebug('d_fold')) console.log(`[d_fold] FoldStateHandler.apply called — scene: ${scene.id}, foldedNodes:`, JSON.stringify(scene.foldedNodes ?? null));

    // Clear fold-root class from all nodes (previous scene's state)
    this.#cy.nodes('.fold-root').removeClass('fold-root');

    // Remove stowaway hidden nodes from previous scene.
    // During scene-to-scene morph, hidden→hidden nodes survive in cy at old positions.
    // Removing them here ensures apply() re-adds from DB with correct target positions.
    const hiddenNodes = this.#cy.nodes().filter(n => n.style('display') === 'none');
    if (hiddenNodes.length > 0) {
      if (isDebug('d_fold')) console.log(`[d_fold] FoldStateHandler.apply: removing ${hiddenNodes.length} stowaway hidden nodes:`, hiddenNodes.map(n => n.id()));
      hiddenNodes.connectedEdges().remove();
      hiddenNodes.remove();
    }

    if (!scene.foldedNodes || Object.keys(scene.foldedNodes).length === 0) {
      if (isDebug('d_fold')) console.log(`[d_fold] FoldStateHandler.apply: no foldedNodes in scene ${scene.id}`);
      // Use empty object rather than undefined: cytoscape's scratch(key, undefined)
      // semantics are ambiguous (may be treated as a getter). Empty object is unambiguous
      // and reads back as falsy-via-Object.keys-empty without surprises.
      this.#cy.scratch('foldedNodes', {});
      return;
    }

    // Collect all hidden node IDs
    const allHiddenIds = new Set<NodeId>();
    for (const entries of Object.values(scene.foldedNodes)) {
      for (const entry of entries) {
        const id = typeof entry === 'string' ? entry as NodeId : entry.id;
        allHiddenIds.add(id);
      }
    }
    if (isDebug('d_fold')) console.log(`[d_fold] FoldStateHandler.apply (${scene.id}): ${allHiddenIds.size} hidden node IDs:`, [...allHiddenIds]);

    // Add hidden nodes to cy if not already present (animated path excludes them)
    const nodesToStyle: { nodeId: NodeId; nodeData: any; design: any; scale?: number }[] = [];
    for (const nodeId of allHiddenIds) {
      const alreadyInCy = this.#cy.getElementById(nodeId as string).length > 0;
      if (alreadyInCy) {
        if (isDebug('d_fold')) console.log(`[d_fold]   ${nodeId}: already in cy, skipping add`);
        continue;
      }

      const sceneNodeData = scene.nodes[nodeId];
      if (!sceneNodeData) continue;
      const nodeData = graphStore.nodes.find(n => n.id === nodeId);
      if (!nodeData) continue;

      this.#cy.add({
        group: 'nodes',
        data: {
          ...nodeData,
          id: nodeId,
          design: sceneNodeData.design,
          scale: sceneNodeData.scale,
          ...(nodeId === scene.centralNodeId ? { centralNode: 1 } : {})
        },
        // Clone: cy mutates the position object on every drag/animation/unfold.
        // Passing a raw graphStore ref aliases the in-memory scene cache.
        position: { x: sceneNodeData.position.x, y: sceneNodeData.position.y }
      });
      if (isDebug('d_fold')) console.log(`[d_fold]   ${nodeId}: added to cy as hidden`);
      nodesToStyle.push({ nodeId, nodeData, design: sceneNodeData.design, scale: sceneNodeData.scale });
    }

    // Apply styles to newly added hidden nodes
    if (nodesToStyle.length > 0) {
      const stylesheet = (this.#cy.style() as any).json();
      const updated = await StyleGenerator.addNodesToStylesheet(stylesheet, nodesToStyle, themeId);
      this.#cy.style().fromJson(updated).update();
    }

    // Add edges for hidden nodes (both endpoints must exist in cy).
    // Carry the scene's design/curve in element data — GraphSaver extracts
    // these on the next sync, so bare graph data would wipe the scene's
    // persisted edge override (mirrors arrival-animator's edge add).
    const addedEdgeIds: EdgeId[] = [];
    for (const _nodeId of allHiddenIds) {
      const sceneEdgeIds = Object.keys(scene.edges) as EdgeId[];
      for (const edgeId of sceneEdgeIds) {
        if (this.#cy.getElementById(edgeId as string).length > 0) continue;
        const edgeData = graphStore.edges.find(e => e.id === edgeId);
        if (!edgeData) continue;
        const srcExists = this.#cy.getElementById(edgeData.sourceId as string).length > 0;
        const tgtExists = this.#cy.getElementById(edgeData.targetId as string).length > 0;
        if (srcExists && tgtExists) {
          this.#cy.add({
            group: 'edges',
            data: {
              ...edgeData,
              id: edgeId,
              source: edgeData.sourceId,
              target: edgeData.targetId,
              design: scene.edges[edgeId]?.design,
              curve: scene.edges[edgeId]?.curve
            }
          });
          addedEdgeIds.push(edgeId);
        }
      }
    }

    // Reconcile per-edge stylesheet rules for the re-added edges: write this
    // scene's override or remove a stale rule left by a previously visited
    // scene — otherwise a folded edge unfolds wearing another scene's style.
    if (addedEdgeIds.length > 0) {
      let stylesheet = (this.#cy.style() as any).json();
      for (const edgeId of addedEdgeIds) {
        stylesheet = StyleGenerator.applyEdgeOverrideToStylesheet(stylesheet, edgeId, scene.edges[edgeId], themeId);
      }
      this.#cy.style().fromJson(stylesheet).update();
    }

    // Hide folded nodes + their edges, add fold-root indicators
    for (const [rootId, entries] of Object.entries(scene.foldedNodes)) {
      this.#cy.getElementById(rootId).addClass('fold-root');
      for (const entry of entries) {
        const nodeId = typeof entry === 'string' ? entry : entry.id;
        const node = this.#cy.getElementById(nodeId as string);
        if (node.length > 0) {
          node.style('display', 'none');
          node.connectedEdges().forEach((edge: any) => {
            edge.style('display', 'none');
          });
        }
      }
    }

    // Write to cy.scratch for graphSaver and FoldManager
    this.#cy.scratch('foldedNodes', scene.foldedNodes);

    if (isDebug('d_transition')) {
      const totalHidden = Object.values(scene.foldedNodes).reduce((sum, entries) => sum + entries.length, 0);
      console.log(`[FoldStateHandler] Applied fold state: ${Object.keys(scene.foldedNodes).length} roots, ${totalHidden} hidden`);
    }
  }
}
