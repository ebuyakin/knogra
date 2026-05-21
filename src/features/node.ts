/**
 * Node Feature
 * Handles node-level operations (content: title, tags, properties)
 * Does NOT handle scene-level properties (design, scale, position)
 */

import type { Core } from 'cytoscape';
import type { Node as NodeData, NodeId } from '../core/main-types';
import { isEditMode } from '../storage/app-mode';

export class Node {
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  /**
   * Get complete node data
   */
  getData(nodeId: NodeId): NodeData | null {
    const cyNode = this.#cy.getElementById(nodeId);
    if (cyNode.length === 0) {
      return null;
    }
    
    return cyNode.data() as NodeData;
  }

  /**
   * Update node content (title, tags, properties)
   * Does NOT handle design or scale — those are scene-level properties
   */
  async update(nodeId: NodeId, updates: Partial<NodeData>): Promise<void> {
    if (!isEditMode()) {
      console.warn('Cannot update node content in View mode');
      return;
    }

    const cyNode = this.#cy.getElementById(nodeId);
    if (cyNode.length === 0) {
      console.warn(`Node ${nodeId} not found`);
      return;
    }

    // Update node data in cy
    cyNode.data({
      ...updates,
      updatedAt: new Date()
    });
  }
}
