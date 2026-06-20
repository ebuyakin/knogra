/**
 * GraphSaver - Auto-persistence layer
 * Listens to Cytoscape events and automatically saves state to database
 * 
 * Usage:
 *   import { graphSaver } from './storage/graph-saver';
 *   graphSaver.init(cy);  // Call once after Cytoscape is created
 */

import type { Core } from 'cytoscape';
import type { Scene, Node, Edge, NodeId, EdgeId, SceneId } from '../core/main-types';
import { graphStore } from './graph-store';
import { getDefaultEdgeTypeId } from '../config/edge-type-settings';
import { isDebug } from '../config/debug-flags';
import { recordSaverEvent } from '../utils/diagnostics/recorder';

export type GraphSaverSuspension = string;

class GraphSaver {
  #cy: Core | null = null;
  #saveTimeout: ReturnType<typeof setTimeout> | null = null;
  #isEnabled: boolean = true;
  #suspensions: Set<GraphSaverSuspension> = new Set();
  #nextSuspensionId: number = 0;

  /**
   * Initialize GraphSaver with Cytoscape instance
   * Must be called before any other methods
   */
  init(cy: Core): void {
    if (this.#cy) {
      console.warn('GraphSaver: Already initialized');
      return;
    }
    this.#cy = cy;
    this.#setupListeners();
    if (isDebug('d_saver')) console.log('GraphSaver: Initialized');
  }

  /**
   * Setup event listeners for auto-save
   */
  #setupListeners(): void {
    if (!this.#cy) return;
    
    // Save on node drag end
    this.#cy.on('free', 'node', () => {
      this.#scheduleSave();
    });

    // Save on viewport changes (zoom/pan)
    this.#cy.on('viewport', () => {
      this.#scheduleSave();
    });

    // Save on data changes
    this.#cy.on('data', () => {
      this.#scheduleSave();
    });

    // Save on element add/remove
    this.#cy.on('add remove', () => {
      this.#scheduleSave();
    });
  }

  /**
   * Schedule a debounced save (500ms delay)
   */
  #scheduleSave(): void {
    if (!this.#isEnabled || this.isSuspended()) return;

    if (this.#saveTimeout) {
      clearTimeout(this.#saveTimeout);
    }

    const sceneId = (this.#cy?.scratch('currentSceneId') as SceneId | undefined) ?? undefined;
    recordSaverEvent({ kind: 'scheduled', sceneId });

    this.#saveTimeout = setTimeout(() => {
      this.#sync();
    }, 500);
  }

  /**
   * Synchronize Cytoscape state to database
   */
  async #sync(): Promise<void> {
    if (!this.#cy) return;  // Not initialized yet

    const startMs = Date.now();
    const sceneId = this.#cy.scratch('currentSceneId') as SceneId;
    const nodeCount = this.#cy.nodes().length;
    const edgeCount = this.#cy.edges().length;
    recordSaverEvent({ kind: 'syncStart', sceneId, nodeCount, edgeCount });

    try {
      if (!sceneId) {
        console.warn('GraphSaver: No current scene, skipping save');
        recordSaverEvent({ kind: 'syncEnd', sceneId, durMs: Date.now() - startMs, err: 'no-scene' });
        return;
      }

      // Delete marked nodes/edges from database
      await this.#deleteMarkedElements();

      // Save scene (positions, designs, viewport)
      await this.#saveScene(sceneId);

      // Save content (nodes and edges data)
      await this.#saveContent();

      recordSaverEvent({ kind: 'syncEnd', sceneId, nodeCount, edgeCount, durMs: Date.now() - startMs });

      if (isDebug('d_saver')) {
        const nodePositions = this.#cy.nodes().toArray()
          .map(n => `${n.id()}:[${Math.round(n.position().x)},${Math.round(n.position().y)}]`)
          .join(', ');
        const edgeInfo = this.#cy.edges().toArray()
          .map(e => `${e.id()}(${e.source().id()}->${e.target().id()})`)
          .join(', ');
        console.log(`GraphSaver: Saved ${sceneId}. Nodes: {${nodePositions}}. Edges: [${edgeInfo}]`);
      }
    } catch (error) {
      recordSaverEvent({
        kind: 'syncEnd',
        sceneId,
        durMs: Date.now() - startMs,
        err: error instanceof Error ? error.message : String(error),
      });
      console.error('GraphSaver: Sync failed', error);
    }
  }

  /**
   * Extract and save scene state from Cytoscape
   */
  async #saveScene(sceneId: string): Promise<void> {
    const scene = this.#extractSceneFromCy(sceneId);
    if (!scene) return;
    await graphStore.updateScene(scene);
  }

  /**
   * Extract and save all nodes and edges content
   */
  async #saveContent(): Promise<void> {
    if (!this.#cy) return;
    
    // Save all nodes
    const nodes = this.#cy.nodes().toArray();
    for (const cyNode of nodes) {
      const node = this.#extractNodeFromCy(cyNode);
      await graphStore.updateNode(node);
    }

    // Save all edges
    const edges = this.#cy.edges().toArray();
    for (const cyEdge of edges) {
      const edge = this.#extractEdgeFromCy(cyEdge);
      await graphStore.updateEdge(edge);
    }
  }

  /**
   * Extract scene object from Cytoscape state
   */
  #extractSceneFromCy(sceneId: string): Scene | null {
    if (!this.#cy) return null;
    
    // Get existing scene or create new one
    const existingScene = graphStore.scenes.find(s => s.id === sceneId);
    
    const scene: Scene = {
      id: sceneId,
      title: existingScene?.title || 'Untitled Scene',
      centralNodeId: existingScene?.centralNodeId || '',
      themeId: existingScene?.themeId || 'default',
      nodes: {},
      edges: {},
      viewport: {
        zoom: this.#cy.zoom(),
        pan: this.#cy.pan()
      },
      backgroundImages: existingScene?.backgroundImages || [],
      foldedNodes: (this.#cy.scratch('foldedNodes') as Scene['foldedNodes']) || undefined,
      edgeTypeVisibility: existingScene?.edgeTypeVisibility,
      createdAt: existingScene?.createdAt || new Date(),
      updatedAt: new Date()
    };

    // Extract node positions, designs, scales
    this.#cy.nodes().forEach(cyNode => {
      const nodeId = cyNode.id() as NodeId;
      const pos = cyNode.position();
      const design = cyNode.data('design');
      scene.nodes[nodeId] = {
        position: { x: pos.x, y: pos.y },
        scale: cyNode.data('scale') || 1.0,
        design: design ? { ...design } : { id: 'equation-node', params: {} }
      };
    });

    // Extract edge designs
    this.#cy.edges().forEach(cyEdge => {
      const edgeId = cyEdge.id() as EdgeId;
      const design = cyEdge.data('design');
      scene.edges[edgeId] = {
        design: design ? { ...design } : { id: 'default', params: {} },
        controlPoints: cyEdge.data('controlPoints') || undefined
      };
    });

    return scene;
  }

  /**
   * Extract node content from Cytoscape element
   */
  #extractNodeFromCy(cyNode: any): Node {
    const data = cyNode.data();
    
    return {
      id: data.id,
      title: data.title || 'Untitled',
      tags: data.tags || [],
      properties: data.properties || {},
      createdAt: data.createdAt || new Date(),
      updatedAt: new Date(),
      attachments: data.attachments || [],
      aiArtifacts: data.aiArtifacts || [],
      isAnchor: data.isAnchor
    };
  }

  /**
   * Extract edge content from Cytoscape element
   */
  #extractEdgeFromCy(cyEdge: any): Edge {
    const data = cyEdge.data();
    
    return {
      id: data.id,
      title: data.title || '',
      sourceId: data.source,
      targetId: data.target,
      typeId: data.typeId || getDefaultEdgeTypeId(),
      tags: data.tags || [],
      properties: data.properties || {},
      createdAt: data.createdAt || new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Enable auto-save
   */
  enable(): void {
    this.#isEnabled = true;
  }

  /**
   * Disable auto-save (useful during bulk operations)
   */
  disable(): void {
    this.#isEnabled = false;
    if (this.#saveTimeout) {
      clearTimeout(this.#saveTimeout);
      this.#saveTimeout = null;
    }
  }

  /**
   * Suspend debounced auto-save for a scoped operation.
   * Returns a token that must be passed to resume().
   */
  suspend(reason: string): GraphSaverSuspension {
    const token = `${reason}:${Date.now()}:${this.#nextSuspensionId++}`;
    this.#suspensions.add(token);
    if (this.#saveTimeout) {
      clearTimeout(this.#saveTimeout);
      this.#saveTimeout = null;
    }
    recordSaverEvent({ kind: 'suspend', reason, depth: this.#suspensions.size });
    if (isDebug('d_saver')) console.log(`GraphSaver: Suspended (${reason}), depth=${this.#suspensions.size}`);
    return token;
  }

  /** Resume auto-save for a previously suspended scoped operation. */
  resume(token: GraphSaverSuspension): void {
    if (!this.#suspensions.delete(token)) {
      console.warn(`GraphSaver: resume() called with unknown token: ${token}`);
      return;
    }
    recordSaverEvent({ kind: 'resume', reason: token, depth: this.#suspensions.size });
    if (isDebug('d_saver')) console.log(`GraphSaver: Resumed (${token}), depth=${this.#suspensions.size}`);
  }

  /** True when one or more scoped operations are suspending auto-save. */
  isSuspended(): boolean {
    return this.#suspensions.size > 0;
  }

  /**
   * Force immediate save (bypasses debounce)
   */
  async forceSave(): Promise<void> {
    if (this.#saveTimeout) {
      clearTimeout(this.#saveTimeout);
      this.#saveTimeout = null;
    }
    await this.#sync();
  }

  /**
   * Delete elements marked for deletion from database
   */
  async #deleteMarkedElements(): Promise<void> {
    if (!this.#cy) return;
    
    // Delete marked nodes
    const nodesToDelete = this.#cy.scratch('nodesToDelete') || [];
    for (const nodeId of nodesToDelete) {
      await graphStore.deleteNode(nodeId);
      if (isDebug('d_saver')) console.log(`GraphSaver: Deleted node ${nodeId} from database`);
    }
    if (nodesToDelete.length > 0) {
      this.#cy.scratch('nodesToDelete', []); // Clear
    }

    // Delete marked edges
    const edgesToDelete = this.#cy.scratch('edgesToDelete') || [];
    if (edgesToDelete.length > 0) {
      if (isDebug('d_saver')) console.log(`[DEBUG] GraphSaver: About to delete edges:`, edgesToDelete);
    }
    for (const edgeId of edgesToDelete) {
      await graphStore.deleteEdge(edgeId);
      if (isDebug('d_saver')) console.log(`GraphSaver: Deleted edge ${edgeId} from database`);
    }
    if (edgesToDelete.length > 0) {
      this.#cy.scratch('edgesToDelete', []); // Clear
    }
  }
}

// Singleton instance - call graphSaver.init(cy) before use
const graphSaver = new GraphSaver();
export { graphSaver };
