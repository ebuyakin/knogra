/**
 * Edge Feature
 * Handles edge data operations
 */

import type { Core } from 'cytoscape';
import type { Edge as EdgeData, EdgeId } from '../core/main-types';
import { isEditMode } from '../storage/app-mode';

export class Edge {
  #cy: Core;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  /**
   * Get complete edge data (including design)
   */
  getData(edgeId: EdgeId): EdgeData | null {
    const cyEdge = this.#cy.getElementById(edgeId);
    if (cyEdge.length === 0) {
      return null;
    }
    
    return cyEdge.data() as EdgeData;
  }

  /**
   * Update edge data
   * Handles content updates
   */
  async update(edgeId: EdgeId, updates: Partial<EdgeData>): Promise<void> {
    if (!isEditMode()) {
      console.warn('Cannot update edge content in View mode');
      return;
    }

    const cyEdge = this.#cy.getElementById(edgeId);
    if (cyEdge.length === 0) {
      console.warn(`Edge ${edgeId} not found`);
      return;
    }

    // Update edge data in cy
    cyEdge.data({
      ...updates,
      updatedAt: new Date()
    });
    
    // Note: Edge styles are currently scene-wide, not per-edge
    // If design changes are needed in future, implement per-edge styling
  }
}
