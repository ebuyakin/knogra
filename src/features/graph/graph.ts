/**
 * Graph Feature
 * Handles graph structure operations: adding/removing nodes and edges
 */

import type { Core, SingularElementReturnValue } from 'cytoscape';
import type { Node as NodeData, Edge as EdgeData, NodeId, EdgeId, SceneId, Scene, DesignId, DesignParameterId, NodeInfo } from '../../core/main-types';
import type { AnchorLinkResult } from './anchor-traversal';
import type { GraphStatistics } from './statistics';
import { graphStore } from '../../storage/graph-store';
import { isEditMode } from '../../storage/app-mode';
import { eventBus } from '../../events/event-bus';
import { cascadeNodeDeletion } from '../../storage/node-deletion';
import { StyleGenerator } from '../../styles/style-generator';
import { circularSpreadSafe } from '../utils/pure/position-expansion';
import { getSetting } from '../../config';
import { getDefaultEdgeTypeId } from '../../config/edge-type-settings';
import { AppStateManager } from '../../storage/app-state';
import { isDebug } from '../../config/debug-flags';
import { getAnchorDistances, getLinkToAnchor } from './anchor-traversal';
import { buildGraphStatistics } from './statistics';

export type { GraphStatistics, GraphStatisticBucket } from './statistics';

export class Graph {
  #cy: Core;
  /**
   * True while the user is walking a saved path. A path is immutable, so it
   * cannot repair itself if a scene it contains is deleted mid-walk; blocking
   * deletion removes the cause instead of adding machinery to recover from it
   * (paths-architecture §14.6).
   *
   * Set from `pathModeChanged` rather than read from the Path feature — features
   * must not import each other (architecture §4.2).
   */
  #pathModeActive: boolean = false;

  constructor(cy: Core) {
    this.#cy = cy;

    eventBus.on('pathModeChanged', ({ active }) => {
      this.#pathModeActive = active;
    });
  }

  /**
   * Deletion is blocked while a path is being walked. Silent: path mode is
   * visible at a glance, and the delete menu items are disabled, so an alert
   * would be noise. Contrast the anchor/central-node guards below, which do
   * alert because those conditions are not otherwise apparent.
   */
  #deletionBlockedByPathMode(operation: string): boolean {
    if (!this.#pathModeActive) return false;
    console.warn(`[Graph] ${operation} blocked — exit path mode first`);
    return true;
  }

  getAnchorDistances(): Map<NodeId, number> {
    return getAnchorDistances(graphStore.nodes, graphStore.edges);
  }

  getLinkToAnchor(nodeId: NodeId): AnchorLinkResult {
    return getLinkToAnchor(nodeId, graphStore.nodes, graphStore.edges);
  }

  /** Deduplicated, sorted union of all tags across every node in the graph. */
  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const node of graphStore.nodes) {
      for (const tag of node.tags ?? []) {
        const trimmed = tag.trim();
        if (trimmed) tags.add(trimmed);
      }
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }

  getGraphStatistics(): GraphStatistics {
    return buildGraphStatistics({
      nodes: graphStore.nodes,
      edges: graphStore.edges,
      edgeTypes: graphStore.edgeTypes,
      scenes: graphStore.scenes,
      backgroundImages: graphStore.backgroundImages
    });
  }

  /**
   * Find an existing node whose title matches the given one under meaningful
   * (not technical) comparison: case-insensitive and whitespace-insensitive.
   * Used to warn about duplicate titles before committing an edit.
   *
   * @param excludeId - node to skip (the one being edited)
   * @returns the first conflicting node, or null if the title is unique
   */
  findNodeByTitle(title: string, excludeId?: NodeId): NodeData | null {
    const normalized = normalizeTitle(title);
    if (!normalized) return null;
    return graphStore.nodes.find(
      n => n.id !== excludeId && normalizeTitle(n.title) === normalized
    ) ?? null;
  }

  /**
   * Add a free node at specified position
   * Design selection follows settings:
   * - If design specified explicitly → use it
   * - If inheritDesignFromSelected is true and a node is selected → inherit
   * - Otherwise → use defaultDesign from settings
   * Scale follows same inheritance logic as design
   */
  async addFreeNode(
    position: { x: number; y: number },
    title?: string,
    design?: { id: DesignId; params: Record<DesignParameterId, unknown> },
    properties?: Record<string, unknown>,
    scale?: number
  ): Promise<NodeId> {
    if (!isEditMode()) {
      throw new Error('Cannot add nodes in View mode');
    }

    // Generate nodeId with separators: n-XXXX-XXX-XXX-XXX
    const timestamp = Date.now().toString();
    const formattedTimestamp = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 7)}-${timestamp.slice(7, 10)}-${timestamp.slice(10)}`;
    const nodeId = `n-${formattedTimestamp}` as NodeId;
    
    // Generate title if not provided: Node X (where X = total nodes + 1)
    const nodeTitle = title ?? `Node ${graphStore.nodes.length + 1}`;

    const node: NodeData = {
      id: nodeId,
      title: nodeTitle,
      tags: [],
      properties: properties ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
      attachments: [],
      aiArtifacts: []
    };

    // Determine design and scale based on settings
    let nodeDesign = design;
    let nodeScale = scale ?? 1.0;
    
    if (!nodeDesign) {
      const inheritFromSelected = getSetting('node.inheritDesignFromSelected');
      const defaultDesignId = getSetting('node.defaultDesign');
      
      if (inheritFromSelected) {
        const activeNodeId = this.#cy.scratch('activeNodeId');
        if (activeNodeId) {
          const activeNode = this.#cy.getElementById(activeNodeId);
          if (activeNode.length > 0) {
            nodeDesign = activeNode.data('design');
            // Only inherit scale if not explicitly provided
            if (scale === undefined) {
              nodeScale = activeNode.data('scale') ?? 1.0;
            }
          }
        }
      }
      
      // Fallback to default design from settings
      if (!nodeDesign) {
        nodeDesign = { id: defaultDesignId as DesignId, params: {} };
      }
    }

    // Add to Cytoscape
    this.#cy.add({
      group: 'nodes',
      data: {
        ...node,
        design: nodeDesign,
        scale: nodeScale
      },
      position
    });

    // Apply style via stylesheet - use current scene's theme
    const currentSceneId = this.#cy.scratch('currentSceneId') as SceneId;
    const currentScene = currentSceneId ? await graphStore.readScene(currentSceneId) : null;
    const themeId = currentScene?.themeId || 'dark';
    
    const stylesheet = (this.#cy.style() as any).json();
    const updatedStylesheet = await StyleGenerator.addNodesToStylesheet(
      stylesheet,
      [{ nodeId, nodeData: node, design: nodeDesign, scale: nodeScale }],
      themeId
    );
    this.#cy.style().fromJson(updatedStylesheet).update();

    return nodeId;
  }

  /**
   * Connection direction for adding connected nodes
   */
  
  /**
   * Add a connected node (child or parent) to an existing node
   * @param nodeId - The existing node to connect to
   * @param direction - 'child' creates edge nodeId→newNode, 'parent' creates edge newNode→nodeId
   * @param title - Optional title for the new node (defaults to "${existingTitle} ${direction}")
   * @param properties - Optional properties for the new node
   * @param design - Optional explicit design (e.g., from AI shelf). If provided, skips settings logic.
   */
  async addConnectedNode(
    nodeId: NodeId,
    direction: 'child' | 'parent',
    title?: string,
    properties?: Record<string, unknown>,
    design?: { id: DesignId; params: Record<string, unknown> }
  ): Promise<NodeId> {
    if (!isEditMode()) {
      throw new Error('Cannot add connected nodes in View mode');
    }

    const existingNode = this.#cy.getElementById(nodeId);
    if (existingNode.length === 0) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // Get existing node data
    const nodePos = existingNode.position();

    // Determine design and scale: explicit > inherit from parent > default
    let nodeDesign = design;
    let nodeScale = 1.0;
    
    const inheritDesign = getSetting('node.inheritDesignForConnected');
    if (!nodeDesign && inheritDesign) {
      nodeDesign = existingNode.data('design') || { id: getSetting('node.defaultDesign') as DesignId, params: {} };
      nodeScale = existingNode.data('scale') ?? 1.0;
    } else if (!nodeDesign) {
      nodeDesign = { id: getSetting('node.defaultDesign') as DesignId, params: {} };
    }

    // Calculate minRadius: parent half-size + child half-size + margin
    const nodeBBox = existingNode.boundingBox();
    const parentHalfSize = Math.max(nodeBBox.w, nodeBBox.h) / 2;
    
    // Child size: same as parent if inheriting, otherwise default 120
    const childBaseSize = inheritDesign ? Math.max(nodeBBox.w, nodeBBox.h) : 120;
    const childHalfSize = (childBaseSize * nodeScale) / 2;
    
    const margin = 20;
    const minRadius = parentHalfSize + childHalfSize + margin;

    // Get existing node positions for collision avoidance
    const existingPositions = this.#cy.nodes().map(n => n.position());

    // Calculate new node position using collision avoidance
    const newPositions = circularSpreadSafe(
      nodePos,
      1,  // Just 1 node
      existingPositions,
      minRadius
    );

    // circularSpreadSafe returns [] when the ring around the node is full (no
    // free sector / radius too large). Without a fallback the position would be
    // undefined and Cytoscape would drop the node at (0,0), stacking every
    // subsequent node on top of the central node. Instead, stack on the most
    // recent connected node with a small diagonal shift so it stays visible.
    const newPos = newPositions[0] ?? this.#stackedFallbackPosition(nodeId, direction);

    // Create new node with determined design and scale (title will be auto-generated if not provided)
    const newNodeId = await this.addFreeNode(newPos, title, nodeDesign, properties, nodeScale);

    // Create edge based on direction
    if (direction === 'child') {
      // Edge: existing → new (existing is parent)
      this.addEdge(nodeId, newNodeId, '');
    } else {
      // Edge: new → existing (new is parent)
      this.addEdge(newNodeId, nodeId, '');
    }

    return newNodeId;
  }

  /**
   * Fallback placement when the ring around a node is full: stack the new node
   * onto the most recently created connected node (children for 'child',
   * parents for 'parent') with a small diagonal shift. Node ids are
   * timestamp-based and fixed-format, so the lexicographically largest id is the
   * newest — making each stacked node the anchor for the next, forming a short
   * diagonal staircase instead of an exact overlap.
   */
  #stackedFallbackPosition(nodeId: NodeId, direction: 'child' | 'parent'): { x: number; y: number } {
    const STACK_SHIFT = 24;
    const node = this.#cy.getElementById(nodeId);
    const connected = direction === 'child' ? node.outgoers('node') : node.incomers('node');

    let anchor: SingularElementReturnValue = node;
    let newestId = '';
    connected.forEach(candidate => {
      const id = candidate.id();
      if (id > newestId) {
        newestId = id;
        anchor = candidate;
      }
    });

    const base = anchor.position();
    return { x: base.x + STACK_SHIFT, y: base.y + STACK_SHIFT };
  }

  /**
   * Add an edge between two nodes
   */
  addEdge(
    sourceId: NodeId,
    targetId: NodeId,
    title: string = ''
  ): EdgeId {
    if (!isEditMode()) {
      throw new Error('Cannot add edges in View mode');
    }

    const edgeId = `e${Date.now()}` as EdgeId;

    const rememberedEdgeTypeId = AppStateManager.getLastEdgeTypeId();
    const edgeTypeId = rememberedEdgeTypeId && graphStore.edgeTypes.some(type => type.id === rememberedEdgeTypeId)
      ? rememberedEdgeTypeId
      : getDefaultEdgeTypeId();
    const edge: EdgeData = {
      id: edgeId,
      title,
      sourceId,
      targetId,
      typeId: edgeTypeId,
      tags: [],
      properties: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add to Cytoscape
    this.#cy.add({
      group: 'edges',
      data: {
        ...edge,
        source: sourceId,
        target: targetId,
        design: { id: 'default', params: {} }
      }
    });

    if (isDebug('d_store')) console.log(`[addEdge] Added edge ${edgeId}: ${sourceId} -> ${targetId}`);

    return edgeId;
  }

  /**
   * Delete a node from the graph (database)
   * Also removes from current scene and deletes connected edges
   * Protected: anchor node (always), central node of current scene
   */
  async deleteNode(nodeId: NodeId): Promise<void> {
    if (!isEditMode()) {
      console.warn('Cannot delete nodes in View mode');
      return;
    }

    if (this.#deletionBlockedByPathMode('deleteNode')) return;

    // Check if node is the anchor (always protected)
    const node = graphStore.nodes.find(n => n.id === nodeId);
    if (node?.isAnchor) {
      alert('Cannot delete the anchor node. Set a different node as anchor first.');
      return;
    }

    // Check if node is central node of current scene
    const currentSceneId = this.#cy.scratch('currentSceneId') as SceneId | undefined;
    const currentScene = currentSceneId ? graphStore.scenes.find(s => s.id === currentSceneId) : null;
    if (currentScene?.centralNodeId === nodeId) {
      alert('Cannot delete the central node of the current scene. Navigate to a different scene first.');
      return;
    }

    if (!confirm('Delete this node from the graph?')) {
      return;
    }

    const cyNode = this.#cy.getElementById(nodeId);
    if (cyNode.length === 0) {
      console.warn(`Node ${nodeId} not found`);
      return;
    }

    // Cascade delete: clean up related data in all stores
    const deletionResult = await cascadeNodeDeletion(nodeId);

    // Mark all graph edges incident to this node for deletion
    const edgesToDelete = this.#cy.scratch('edgesToDelete') || [];
    this.#cy.scratch('edgesToDelete', [...edgesToDelete, ...deletionResult.incidentEdgeIds]);

    // Mark node for deletion from database
    const nodesToDelete = this.#cy.scratch('nodesToDelete') || [];
    this.#cy.scratch('nodesToDelete', [...nodesToDelete, nodeId]);

    // Remove from Cytoscape (triggers GraphSaver which will delete from DB)
    cyNode.remove();
  }

  /**
   * Delete a node from the graph database (NOT from current scene)
   * Used by Node Manager for bulk deletion of nodes not visible in current scene.
   * 
   * IMPORTANT: This method REFUSES to delete nodes that are in the current Cytoscape scene.
   * For those, use deleteNode() which properly handles Cytoscape state.
   * 
   * @param nodeId - The node to delete
   * @returns Object with success status and optional error message
   */
  async deleteNodeFromGraph(nodeId: NodeId): Promise<{ success: boolean; error?: string }> {
    if (!isEditMode()) {
      return { success: false, error: 'Cannot delete nodes in View mode' };
    }

    if (this.#pathModeActive) {
      return { success: false, error: 'Cannot delete while walking a path — exit path mode first' };
    }

    // Check if node is the anchor (always protected)
    const node = graphStore.nodes.find(n => n.id === nodeId);
    if (!node) {
      return { success: false, error: 'Node not found in database' };
    }
    
    if (node.isAnchor) {
      return { success: false, error: 'Cannot delete anchor node' };
    }

    // CRITICAL: Refuse to delete nodes in current Cytoscape scene
    const cyNode = this.#cy.getElementById(nodeId);
    if (cyNode.length > 0) {
      return { success: false, error: 'Node is in current scene — use context menu to delete' };
    }

    // Cascade delete: clean up scenes, paths, chat, shelf
    const deletionResult = await cascadeNodeDeletion(nodeId);

    // Delete incident edges from graphStore
    for (const edgeId of deletionResult.incidentEdgeIds) {
      await graphStore.deleteEdge(edgeId);
    }

    // Delete the node from graphStore
    await graphStore.deleteNode(nodeId);

    if (isDebug('d_store')) console.log(`[Graph.deleteNodeFromGraph] Deleted node ${nodeId} and ${deletionResult.incidentEdgeIds.length} edges`);
    return { success: true };
  }

  /**
   * Delete an edge from the graph (database)
   */
  deleteEdge(edgeId: EdgeId): void {
    if (!isEditMode()) {
      console.warn('Cannot delete edges in View mode');
      return;
    }

    if (this.#deletionBlockedByPathMode('deleteEdge')) return;

    // Mark for deletion from database
    const toDelete = this.#cy.scratch('edgesToDelete') || [];
    this.#cy.scratch('edgesToDelete', [...toDelete, edgeId]);

    const cyEdge = this.#cy.getElementById(edgeId);
    if (cyEdge.length === 0) {
      console.warn(`Edge ${edgeId} not found`);
      return;
    }

    // Remove from Cytoscape (triggers GraphSaver which will delete from DB)
    cyEdge.remove();
  }

  /**
   * Get all node titles in the graph
   * Used for deduplication when adding suggestions
   */
  getAllNodeTitles(): string[] {
    return this.#cy.nodes().map(node => node.data('title') as string).filter(Boolean);
  }

  /**
   * Get extended information for all nodes in the graph
   * Used by Node Manager UI for comprehensive node listing
   */
  getAllNodesInfo(): NodeInfo[] {
    const nodes = graphStore.nodes;
    const edges = graphStore.edges;
    const scenes = graphStore.scenes;
    const anchorDistances = this.getAnchorDistances();
    
    // Pre-compute scene membership for efficiency
    const nodeSceneCount = new Map<NodeId, number>();
    const nodeHasOwnScene = new Set<NodeId>();
    
    for (const scene of scenes) {
      // Count scene membership
      for (const nodeId of Object.keys(scene.nodes)) {
        nodeSceneCount.set(nodeId as NodeId, (nodeSceneCount.get(nodeId as NodeId) ?? 0) + 1);
      }
      // Track nodes with their own scene
      nodeHasOwnScene.add(scene.centralNodeId);
    }
    
    // Pre-compute connection counts
    const nodeConnectionCount = new Map<NodeId, number>();
    for (const edge of edges) {
      nodeConnectionCount.set(edge.sourceId, (nodeConnectionCount.get(edge.sourceId) ?? 0) + 1);
      nodeConnectionCount.set(edge.targetId, (nodeConnectionCount.get(edge.targetId) ?? 0) + 1);
    }
    
    // Get nodes currently in Cytoscape
    const nodesInCy = new Set<NodeId>(
      this.#cy.nodes().map(n => n.id() as NodeId)
    );
    
    // Build NodeInfo array
    return nodes.map(node => ({
      node,
      sceneCount: nodeSceneCount.get(node.id) ?? 0,
      connectionCount: nodeConnectionCount.get(node.id) ?? 0,
      hasOwnScene: nodeHasOwnScene.has(node.id),
      isInCurrentScene: nodesInCy.has(node.id),
      anchorDistance: anchorDistances.get(node.id) ?? null
    }));
  }

  /**
   * Find the scene where a given node is the central node.
   * Returns null if no such scene exists.
   */
  findSceneByCentralNode(nodeId: NodeId): Scene | null {
    return graphStore.scenes.find(s => s.centralNodeId === nodeId) ?? null;
  }
}

/**
 * Normalize a node title for meaningful (non-technical) comparison:
 * case-insensitive and whitespace-insensitive. Internal runs of whitespace
 * collapse to a single space and surrounding whitespace is trimmed.
 */
function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}