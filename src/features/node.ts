/**
 * Node Feature
 * Handles node-level operations (content: title, tags, properties, image)
 * Does NOT handle scene-level properties (design, scale, position)
 *
 * Content edits flow through Cytoscape and are persisted by GraphSaver. Image
 * records are the exception: their bytes never enter Cytoscape, so they are
 * written to storage directly. See `applyImageChange`.
 */

import type { Core } from 'cytoscape';
import type { Node as NodeData, NodeId, NodeImageId } from '../core/main-types';
import type { NodeImage, NodeImageStyleReference } from '../core/node-image-types';
import { isEditMode } from '../storage/app-mode';
import { graphStore } from '../storage/graph-store';
import { nodeImageCache } from '../storage/node-image-cache';

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
   * Which of `nodeIds` carry an image, with the titles to label them by.
   *
   * Takes the ids rather than finding them: which nodes are in a scene is the
   * scene's question, and which of them have images is this one's.
   */
  listImageNodes(nodeIds: Iterable<NodeId>, excludeNodeId?: NodeId): NodeImageStyleReference[] {
    const references: NodeImageStyleReference[] = [];

    for (const nodeId of nodeIds) {
      if (nodeId === excludeNodeId) continue;

      const node = this.getData(nodeId);
      const imageId = node?.properties?.imageId as NodeImageId | undefined;
      if (imageId) references.push({ imageId, title: node?.title || 'Untitled' });
    }

    return references;
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

  /**
   * Persist a node's image change: store the accepted record and drop the ones
   * it superseded.
   *
   * A named non-Cytoscape write (architecture.md §4.2) — image bytes never pass
   * through Cytoscape, so GraphSaver has nothing to autosave. The node's
   * `imageId` travels separately, through `update()` with the rest of its
   * properties. See docs/nodes-svg-images.md §8.
   */
  async applyImageChange(image: NodeImage | null, removedImageIds: NodeImageId[]): Promise<void> {
    if (!isEditMode()) {
      console.warn('Cannot update node images in View mode');
      return;
    }

    for (const imageId of removedImageIds) {
      await graphStore.deleteNodeImage(imageId);
      nodeImageCache.invalidate(imageId);
    }

    if (image) {
      await graphStore.createNodeImage(image);
      // A regenerated image can reuse an id the cache already holds.
      nodeImageCache.invalidate(image.id);
    }
  }
}
