/**
 * FoldManager
 * Non-destructive hide/show of node subtrees within a scene.
 * Fold hides entire subtree; unfold reveals one level at a time.
 *
 * Uses Cytoscape's `display` style property — folded nodes remain in the graph
 * with their positions preserved, just not rendered.
 *
 * ## Source of Truth
 * **`cy.scratch('foldedNodes')` is the authoritative runtime source of truth.**
 * `#foldState` is a transient working copy: rebuilt from scratch at the start of
 * each `fold()`/`unfold()` operation and written back via `#syncToScratch()` before
 * any cy mutation that fires style events (class changes, display changes).
 *
 * `isFolded()` reads scratch directly — no caching, no invalidation. This avoids
 * an entire class of race conditions where re-entrant `style`/`add`/`remove`
 * events trigger `isFolded` mid-mutation and either see stale state or overwrite
 * in-flight changes.
 *
 * Persisted: `Scene.foldedNodes` in IndexedDB (via graphSaver reading scratch).
 *
 * ## Data Contract
 * cy.scratch('foldedNodes'): Record<NodeId, FoldedNodeEntry[]>
 * where FoldedNodeEntry = { id: NodeId, offset: { dx, dy } }
 * Offsets are relative to fold root's position at fold time.
 *
 * ## Sync Discipline
 * Mutating methods sync to scratch BEFORE any cy class/display change that fires
 * style events. The style event then sees up-to-date scratch when handlers
 * (e.g. FoldBadgeManager.updateAll → isFolded) run synchronously.
 *
 * ## Writers
 * - FoldManager (this class): user fold/unfold actions
 * - OpenCloseOrchestrator.applyFoldState(): scene load
 *
 * ## Readers
 * - graphSaver.#extractSceneFromCy(): reads scratch for persistence
 * - FoldManager.loadFoldState(): rebuilds runtime Map from scratch (Phase 4)
 * - element-classification-utils: reads Scene.foldedNodes from DB (Phase 4)
 */

import type { Core, EdgeSingular } from 'cytoscape';
import type { NodeId, SceneId, EdgeConnection, FoldedNodeEntry } from '../../core/main-types';

import { graphStore } from '../../storage/graph-store';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';
import { recordAction } from '../../utils/diagnostics/action-buffer';
import { findDescendants, determineNodesToKeep } from './traversal';
import { calculateDistances, findMaxDistance, filterNodesByDistance, findLeafNodes } from '../utils/pure/scene-calculations';

/** CSS class applied to fold-root nodes for visual indicator */
const FOLD_ROOT_CLASS = 'fold-root';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class FoldManager {
  #cy: Core;
  /**
   * Transient working copy of fold state. Rebuilt from scratch at the start of
   * each fold()/unfold() operation. NEVER read from outside fold()/unfold() —
   * use isFolded() (which reads scratch directly) for queries.
   */
  #foldState: Map<NodeId, Map<NodeId, { dx: number; dy: number }>> = new Map();

  constructor(cy: Core) {
    this.#cy = cy;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Fold a node: hide its entire subtree.
   * Descendants are set to display:none; fold-root gets a visual indicator.
   * Absorbs any existing fold entries of descendants.
   */
  async fold(rootNodeId: NodeId): Promise<void> {
    // Rebuild working copy from authoritative scratch state
    this.loadFoldState();
    const cy = this.#cy;
    const cyNode = cy.getElementById(rootNodeId);
    if (cyNode.length === 0) return;

    // Guard: don't re-fold a node that's already a fold root
    if (this.#foldState.has(rootNodeId)) return;

    // Find all visible nodes in scene
    const nodesInScene = new Set<NodeId>(cy.nodes().map(n => n.id() as NodeId));

    // Build edge list for traversal
    const edgesForTraversal = cy.edges().map(e => ({
      sourceId: e.source().id() as NodeId,
      targetId: e.target().id() as NodeId
    }));

    // Find entire subtree
    const descendants = findDescendants(rootNodeId, edgesForTraversal as any, nodesInScene);
    if (descendants.size === 0) return;

    // Protect central node
    const currentSceneId = cy.scratch('currentSceneId') as SceneId | undefined;
    const currentScene = currentSceneId
      ? graphStore.scenes.find(s => s.id === currentSceneId)
      : null;
    const centralNodeId = currentScene?.centralNodeId;
    if (centralNodeId && descendants.has(centralNodeId)) {
      descendants.delete(centralNodeId);
    }
    if (descendants.size === 0) return;

    // Safe mode: keep nodes with external connections
    const collapseRemoveAll = getSetting('fold.collapseRemoveAll');
    let nodesToHide: NodeId[];

    if (collapseRemoveAll) {
      nodesToHide = Array.from(descendants);
    } else {
      const edgesInScene: EdgeConnection[] = cy.edges().map(edge => ({
        source: edge.source().id() as NodeId,
        target: edge.target().id() as NodeId
      }));
      const excludeSet = new Set([rootNodeId, ...descendants]);
      const nodesToKeep = determineNodesToKeep(descendants, excludeSet, edgesInScene);
      nodesToHide = Array.from(descendants).filter(id => !nodesToKeep.has(id));
    }

    if (nodesToHide.length === 0) return;

    // Absorb existing fold entries of descendants being hidden
    for (const nodeId of nodesToHide) {
      if (this.#foldState.has(nodeId)) {
        // Add this node's folded set to our set (they're all going hidden)
        const childFolded = this.#foldState.get(nodeId)!;
        for (const id of childFolded.keys()) {
          if (!nodesToHide.includes(id)) {
            nodesToHide.push(id);
          }
        }
        this.#foldState.delete(nodeId);
        cy.getElementById(nodeId).removeClass(FOLD_ROOT_CLASS);
      }
    }

    if (isDebug('d_scene')) {
      console.log(`[FoldManager.fold] ${rootNodeId}: hiding ${nodesToHide.length} descendants`);
    }

    // Store fold state with relative offsets
    const rootPos = cyNode.position();
    const foldedEntries = new Map<NodeId, { dx: number; dy: number }>();
    for (const nodeId of nodesToHide) {
      const node = cy.getElementById(nodeId);
      if (node.length > 0) {
        const pos = node.position();
        foldedEntries.set(nodeId, { dx: pos.x - rootPos.x, dy: pos.y - rootPos.y });
      } else {
        foldedEntries.set(nodeId, { dx: 0, dy: 0 });
      }
    }
    this.#foldState.set(rootNodeId, foldedEntries);
    this.#syncToScratch();

    // Save original positions before animation moves nodes
    const savedPositions = new Map<NodeId, { x: number; y: number }>();
    for (const nodeId of nodesToHide) {
      const node = cy.getElementById(nodeId);
      if (node.length > 0) {
        const pos = node.position();
        savedPositions.set(nodeId, { x: pos.x, y: pos.y });
      }
    }

    // Cascading fold animation: layer by layer, outermost leaves first
    if (import.meta.env.DEV) recordAction('fold', { rootNodeId, hiddenCount: nodesToHide.length });
    await this.#animateFold(rootNodeId, nodesToHide, edgesForTraversal);

    // Stop any in-flight animations before restoring positions (rAF vs setTimeout race)
    for (const nodeId of nodesToHide) {
      cy.getElementById(nodeId).stop(false, false);
    }

    // Apply display:none, then restore original positions (for unfold later)
    this.#hideNodes(nodesToHide);
    for (const [nodeId, pos] of savedPositions) {
      cy.getElementById(nodeId).position(pos);
    }

    // Add fold indicator to root
    cyNode.addClass(FOLD_ROOT_CLASS);
  }

  /**
   * Unfold a node: reveal its direct children only.
   * Deeper descendants stay hidden under new fold entries on the revealed children.
   */
  async unfold(rootNodeId: NodeId): Promise<void> {
    // Rebuild working copy from authoritative scratch state
    this.loadFoldState();
    const foldedMap = this.#foldState.get(rootNodeId);
    if (!foldedMap || foldedMap.size === 0) return;

    const cy = this.#cy;
    const cyNode = cy.getElementById(rootNodeId);

    // Build edge list from the database (hidden nodes may not have edges in cy)
    const edgesForTraversal = graphStore.edges;

    // Find direct children of root within the folded set
    const directChildren: NodeId[] = [];
    for (const childId of foldedMap.keys()) {
      const isDirectChild = edgesForTraversal.some(
        e => e.sourceId === rootNodeId && e.targetId === childId
      );
      if (isDirectChild) {
        directChildren.push(childId);
      }
    }

    if (directChildren.length === 0) {
      // No direct children found — clear fold state entirely
      this.#foldState.delete(rootNodeId);
      // Sync scratch BEFORE removeClass so the style event sees fresh state
      this.#syncToScratch();
      cyNode.removeClass(FOLD_ROOT_CLASS);
      return;
    }

    // Split fold state: distribute remaining hidden nodes to revealed children
    const remainingHidden = new Map(foldedMap);
    for (const childId of directChildren) {
      remainingHidden.delete(childId);
    }

    // For each revealed child, find its descendants within the remaining hidden set.
    // First pass: mutate #foldState only — defer cy class changes until after sync
    // so style-event handlers (e.g. FoldBadgeManager) read up-to-date scratch.
    const remainingKeys = new Set(remainingHidden.keys());
    const newFoldRoots: NodeId[] = [];
    for (const childId of directChildren) {
      const childDescendants = this.#findDescendantsInSet(childId, remainingKeys);
      if (childDescendants.size > 0) {
        const childMap = new Map<NodeId, { dx: number; dy: number }>();
        // Recompute offsets relative to the new fold root (the child)
        // Pure arithmetic on stored offsets — no cy reads needed
        const childOffset = foldedMap.get(childId) ?? { dx: 0, dy: 0 };
        for (const descId of childDescendants) {
          const oldOffset = foldedMap.get(descId) ?? { dx: 0, dy: 0 };
          // Convert offset from root-relative to child-relative
          childMap.set(descId, { dx: oldOffset.dx - childOffset.dx, dy: oldOffset.dy - childOffset.dy });
          remainingHidden.delete(descId);
        }
        this.#foldState.set(childId, childMap);
        newFoldRoots.push(childId);
      }
    }

    // Remove root's fold entry, then sync scratch BEFORE any class change
    this.#foldState.delete(rootNodeId);
    this.#syncToScratch();

    // Now apply class changes — style events fire with fresh scratch
    for (const childId of newFoldRoots) {
      cy.getElementById(childId).addClass(FOLD_ROOT_CLASS);
    }
    cyNode.removeClass(FOLD_ROOT_CLASS);

    if (isDebug('d_scene')) {
      console.log(`[FoldManager.unfold] ${rootNodeId}: revealing ${directChildren.length} children`);
    }

    // Animate: grow revealed children from root position to offset-computed positions
    if (import.meta.env.DEV) recordAction('unfold', { rootNodeId, revealedCount: directChildren.length });
    await this.#animateUnfold(rootNodeId, directChildren, foldedMap);

    // Diamond cleanup: a revealed node may have been claimed by another fold root
    // (e.g. A→B, A→C, B→D, B→E, C→D, C→E — after fold(A)/unfold(A) both B and C
    // claim {D,E}; unfolding B leaves C with a stale (+) badge). Strip any
    // fold-set entries whose target is now visible, and clear empty fold roots.
    this.#reconcileFoldState();
  }

  /**
   * Remove all fold-state references to a node that is being removed from the scene.
   * Call this BEFORE cy.remove() so that GraphSaver sees clean scratch when it fires.
   *
   * Handles two cases:
   *  1. The removed node is a fold root → delete its entry entirely.
   *  2. The removed node is a hidden child in someone else's fold set → remove it
   *     from that set (defensive; hidden nodes can't normally be explicitly excluded,
   *     but fold operations like collapseNodeAnimated may reach them).
   */
  cleanupRemovedNode(nodeId: NodeId): void {
    this.loadFoldState();
    let changed = false;

    if (this.#foldState.has(nodeId)) {
      this.#foldState.delete(nodeId);
      changed = true;
    }

    for (const foldedMap of this.#foldState.values()) {
      if (foldedMap.has(nodeId)) {
        foldedMap.delete(nodeId);
        changed = true;
      }
    }

    if (changed) {
      this.#syncToScratch();
      if (isDebug('d_scene')) {
        console.log(`[FoldManager.cleanupRemovedNode] Cleaned fold state for removed node: ${nodeId}`);
      }
    }
  }

  /**
   * Check if a node is a fold-root with hidden descendants.
   * Reads scratch directly — no cache. Safe to call from anywhere, including
   * style-event handlers fired by in-flight fold/unfold operations.
   */
  isFolded(nodeId: NodeId): boolean {
    const state = this.#cy.scratch('foldedNodes') as Record<string, unknown[]> | undefined;
    if (!state) return false;
    const entries = state[nodeId];
    return Array.isArray(entries) && entries.length > 0;
  }

  /** Serializable snapshot of fold state for persistence */
  getFoldState(): Record<NodeId, FoldedNodeEntry[]> {
    const result: Record<NodeId, FoldedNodeEntry[]> = {};
    for (const [rootId, hiddenMap] of this.#foldState) {
      const entries: FoldedNodeEntry[] = [];
      for (const [nodeId, offset] of hiddenMap) {
        entries.push({ id: nodeId, offset });
      }
      result[rootId] = entries;
    }
    return result;
  }

  /**
   * Restore fold state on scene load (reads from cy.scratch).
   * Handles both new format (FoldedNodeEntry[]) and legacy format (NodeId[])
   * for backward compatibility with existing saved scenes.
   */
  loadFoldState(): void {
    this.#foldState.clear();
    const state = this.#cy.scratch('foldedNodes') as Record<string, unknown[]> | undefined;
    if (!state) return;

    for (const [rootId, entries] of Object.entries(state)) {
      const nodeId = rootId as NodeId;
      const map = new Map<NodeId, { dx: number; dy: number }>();
      for (const entry of entries) {
        if (typeof entry === 'string') {
          // Legacy format: plain NodeId string → zero offset
          map.set(entry as NodeId, { dx: 0, dy: 0 });
        } else if (entry && typeof entry === 'object' && 'id' in entry) {
          // New format: FoldedNodeEntry
          const e = entry as FoldedNodeEntry;
          map.set(e.id, e.offset ?? { dx: 0, dy: 0 });
        }
      }
      this.#foldState.set(nodeId, map);
    }

    if (isDebug('d_scene')) {
      const totalHidden = Object.values(state).reduce((sum, ids) => sum + ids.length, 0);
      console.log(`[FoldManager.loadFoldState] Restored ${Object.keys(state).length} fold roots, ${totalHidden} hidden nodes`);
    }
  }

  /** Clear all fold state (e.g. on scene close) */
  clearAll(): void {
    this.#foldState.clear();
    this.#syncToScratch();
  }

  /** Sync runtime fold state to cy.scratch for cross-layer access */
  #syncToScratch(): void {
    this.#cy.scratch('foldedNodes', this.getFoldState());
  }

  /**
   * Reconcile #foldState against actual cy display state.
   * For each fold root, drop folded-set entries whose node is no longer hidden
   * (`display !== 'none'`) or has left the scene. If a root's set becomes empty,
   * remove the entry and strip `.fold-root` class.
   *
   * Required after unfold in diamond-style graphs where multiple fold roots
   * may claim the same hidden node. Revealing that node via one root leaves
   * stale entries (and stale badges) on the others.
   *
   * Reads scratch only via #foldState (which the caller must have loaded);
   * writes scratch BEFORE class changes to keep style-event handlers consistent.
   */
  #reconcileFoldState(): void {
    const cy = this.#cy;
    const rootsToClear: NodeId[] = [];
    let trimmed = false;

    for (const [rootId, foldedMap] of this.#foldState) {
      for (const nodeId of Array.from(foldedMap.keys())) {
        const node = cy.getElementById(nodeId);
        if (node.length === 0 || node.style('display') !== 'none') {
          foldedMap.delete(nodeId);
          trimmed = true;
        }
      }
      if (foldedMap.size === 0) {
        rootsToClear.push(rootId);
      }
    }

    if (!trimmed && rootsToClear.length === 0) return;

    for (const rootId of rootsToClear) {
      this.#foldState.delete(rootId);
    }
    // Sync BEFORE class change so style events see fresh scratch
    this.#syncToScratch();
    for (const rootId of rootsToClear) {
      cy.getElementById(rootId).removeClass(FOLD_ROOT_CLASS);
    }

    if (isDebug('d_scene') && rootsToClear.length > 0) {
      console.log(`[FoldManager.reconcile] Cleared ${rootsToClear.length} stale fold root(s):`, rootsToClear);
    }
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Cascading fold animation: shrink nodes layer by layer toward their parents,
   * starting from the outermost leaves and working inward.
   * Mirrors the collapse-animator pattern.
   */
  async #animateFold(
    rootNodeId: NodeId,
    nodesToHide: NodeId[],
    edges: { sourceId: NodeId; targetId: NodeId }[]
  ): Promise<void> {
    const cy = this.#cy;
    const duration = getSetting('fold.collapseDuration') as number;
    const delayBetweenLayers = getSetting('fold.collapseDelayBetweenLayers') as number;
    const rootNode = cy.getElementById(rootNodeId);

    // Calculate distances from root to each node-to-hide
    const allDistances = calculateDistances(rootNodeId, nodesToHide, edges as any);
    let remainingNodes = new Set(nodesToHide);

    while (remainingNodes.size > 0) {
      const maxDistance = findMaxDistance(remainingNodes, allDistances);
      const nodesAtMax = filterNodesByDistance(remainingNodes, allDistances, maxDistance);
      const leaves = findLeafNodes(nodesAtMax, edges as any, remainingNodes);

      if (leaves.length === 0) break;

      // Animate all leaves shrinking to parent position in parallel
      await Promise.all(
        leaves.map(nodeId => {
          const parentPos = this.#getParentPosition(nodeId, rootNode.position());
          return this.#shrinkNode(nodeId, parentPos, duration);
        })
      );

      // Remove from remaining
      for (const nodeId of leaves) {
        remainingNodes.delete(nodeId);
      }

      if (remainingNodes.size > 0) {
        await delay(delayBetweenLayers);
      }
    }
  }

  /** Animate a node shrinking to a target position (no removal) */
  async #shrinkNode(
    nodeId: NodeId,
    targetPos: { x: number; y: number },
    duration: number
  ): Promise<void> {
    const node = this.#cy.getElementById(nodeId);
    if (node.length === 0) return;

    // Fade out connected edges
    node.connectedEdges().animate({
      style: { opacity: 0 },
      duration,
      easing: 'ease-in'
    });

    // Shrink node to parent position
    node.animate({
      position: targetPos,
      style: { width: 0, height: 0, opacity: 0 },
      duration,
      easing: 'ease-in'
    });

    await delay(duration);
  }

  /** Get parent position for a node (for shrink-to-parent animation) */
  #getParentPosition(childId: NodeId, fallbackPos: { x: number; y: number }): { x: number; y: number } {
    const child = this.#cy.getElementById(childId);
    const incomingEdges = child.incomers('edge');
    if (incomingEdges.length > 0) {
      return incomingEdges[0].source().position();
    }
    return fallbackPos;
  }

  /**
   * Animate unfold: reveal direct children by growing from root position
   * to positions computed from stored offsets (root.position + offset).
   * Edges fade in after nodes arrive.
   */
  async #animateUnfold(
    rootNodeId: NodeId,
    childIds: NodeId[],
    foldedMap: Map<NodeId, { dx: number; dy: number }>
  ): Promise<void> {
    const cy = this.#cy;
    const duration = getSetting('fold.expandDuration') as number;
    const rootPos = cy.getElementById(rootNodeId).position();

    if (isDebug('d_scene')) {
      console.log(`[FoldManager.unfold] rootPos:`, { x: rootPos.x, y: rootPos.y });
    }

    // For each child: compute target from root + offset, move to root, show at size 0
    const targets: { nodeId: NodeId; targetPos: { x: number; y: number } }[] = [];

    for (const childId of childIds) {
      const node = cy.getElementById(childId);
      if (node.length === 0) continue;

      // Compute target position from root's current position + stored offset
      const offset = foldedMap.get(childId) ?? { dx: 0, dy: 0 };
      const targetPos = { x: rootPos.x + offset.dx, y: rootPos.y + offset.dy };
      targets.push({ nodeId: childId, targetPos });

      if (isDebug('d_scene')) {
        const savedPos = node.position();
        console.log(`[FoldManager.unfold] ${childId}: saved cy pos:`, { x: savedPos.x, y: savedPos.y },
          `offset:`, offset, `targetPos:`, targetPos);
      }

      // Move to root position, shrink to zero, hide edges
      node.stop(false, false);
      node.position({ x: rootPos.x + 1, y: rootPos.y + 1 }); // +1px to avoid Cytoscape bug
      node.style({ width: 0, height: 0, opacity: 0, display: 'element' });
      node.connectedEdges().forEach(edge => {
        edge.stop(false, false);
        edge.style('opacity', 0);
      });
    }

    // Before animating, identify edges to restore (both endpoints will be visible)
    const edgesToRestore: any[] = [];
    for (const childId of childIds) {
      const node = cy.getElementById(childId);
      if (node.length === 0) continue;
      node.connectedEdges().forEach(edge => {
        const otherId = edge.source().id() === childId ? edge.target().id() : edge.source().id();
        const otherNode = cy.getElementById(otherId);
        const otherVisible = otherNode.style('display') !== 'none';
        // The child is about to become visible. Other endpoint must also be visible
        // (either already visible, or another child being revealed in this batch).
        const otherIsRevealing = childIds.includes(otherId as NodeId);
        if (otherVisible || otherIsRevealing) {
          edge.style('display', 'element');
          edgesToRestore.push(edge);
        }
      });
    }

    // Animate nodes + edges in parallel
    await Promise.all([
      ...targets.map(({ nodeId, targetPos }) => this.#growNode(nodeId, targetPos, duration)),
      ...edgesToRestore.map(edge => this.#fadeEdgeIn(edge, duration))
    ]);

    // Clear inline styles so stylesheet rules take over
    for (const { nodeId } of targets) {
      const node = cy.getElementById(nodeId);
      node.removeStyle('opacity width height');
    }
    for (const edge of edgesToRestore) {
      edge.removeStyle('opacity');
    }
  }

  /** Animate a node growing from current position to target */
  async #growNode(
    nodeId: NodeId,
    targetPos: { x: number; y: number },
    duration: number
  ): Promise<void> {
    const node = this.#cy.getElementById(nodeId);
    if (node.length === 0) return;

    // Read stylesheet-defined size (what the node should be)
    const stylesheet = (this.#cy.style() as any).json();
    const nodeSelector = `node[id = "${nodeId}"]`;
    const rule = stylesheet.find((r: any) => r.selector === nodeSelector);
    const targetWidth = rule?.style?.width ?? 120;
    const targetHeight = rule?.style?.height ?? 120;

    return new Promise(resolve => {
      node.animate({
        position: targetPos,
        style: { width: targetWidth, height: targetHeight, opacity: 1 },
      }, {
        duration,
        easing: 'ease-out',
        complete: () => {
          node.position(targetPos);
          node.style({ width: targetWidth, height: targetHeight, opacity: 1 });
          resolve();
        }
      });
    });
  }

  /** Fade an edge in and resolve only after Cytoscape completes the animation. */
  #fadeEdgeIn(edge: EdgeSingular, duration: number): Promise<void> {
    return new Promise(resolve => {
      edge.animate({
        style: { opacity: 1 }
      }, {
        duration,
        easing: 'ease-out',
        complete: () => resolve()
      });
    });
  }

  /** Hide nodes and any edges connected to them */
  #hideNodes(nodeIds: NodeId[]): void {
    for (const nodeId of nodeIds) {
      const node = this.#cy.getElementById(nodeId);
      if (node.length > 0) {
        node.style('display', 'none');
        // Clear animation inline styles so stylesheet rules apply on unhide
        node.removeStyle('opacity width height');
        node.connectedEdges().forEach(edge => {
          edge.style('display', 'none');
          edge.removeStyle('opacity');
        });
      }
    }
  }

  /**
   * Find descendants of a node within a specific set of node IDs.
   * BFS traversal using database edges, constrained to candidateSet.
   */
  #findDescendantsInSet(nodeId: NodeId, candidateSet: Set<NodeId>): Set<NodeId> {
    const result = new Set<NodeId>();
    const queue: NodeId[] = [nodeId];
    const visited = new Set<NodeId>([nodeId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of graphStore.edges) {
        if (edge.sourceId === current && candidateSet.has(edge.targetId) && !visited.has(edge.targetId)) {
          result.add(edge.targetId);
          visited.add(edge.targetId);
          queue.push(edge.targetId);
        }
      }
    }
    return result;
  }
}
