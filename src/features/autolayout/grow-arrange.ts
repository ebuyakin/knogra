/**
 * Auto-layout: Grow & Arrange helpers
 *
 * Stateless neighbourhood computation and the entrant seed/grow-in animation
 * for `AutoLayout.growAndArrange`. Kept as feature-local functions (not a
 * public class) so the autolayout feature exposes a single public class while
 * this membership-growing logic stays self-contained.
 *
 * Boundaries: imports only downstream (`storage`, `styles`, `config`, `core`)
 * and the feature-local `layout` types. No sibling-feature imports.
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Node, Edge } from '../../core/main-types';
import type { Position } from './algorithms/types';
import { graphStore } from '../../storage/graph-store';
import { StyleGenerator } from '../../styles/style-generator';
import { getSetting } from '../../config';

export type GrowDirection = 'both' | 'children' | 'parents';

/** A design assignment for an entrant node. */
interface EntrantDesign {
  id: string;
  params: Record<string, unknown>;
}

/** The rendered size of an entrant, captured before it is shrunk for the grow-in. */
interface EntrantVisual {
  width: string | number;
  height: string | number;
}

/** Result of seeding entrants into the scene ahead of the arrangement. */
export interface EntrantSeed {
  /** Real rendered footprints (for the radial layout), by node id. */
  footprints: Map<NodeId, { width: number; height: number }>;
  /** Full rendered sizes to grow back to during the animation, by node id. */
  visuals: Map<NodeId, EntrantVisual>;
  /** Generative edge ids added for the entrants (faded in during the grow). */
  edgeIds: EdgeId[];
}

/** The degree-≤N undirected/directed ball around a central node. */
export interface NeighbourhoodBall {
  /** Entrant node ids (excludes the central node), in BFS discovery order. */
  entrantIds: NodeId[];
  /** The generative edge (to the BFS predecessor) for each entrant. */
  generativeEdges: Map<NodeId, Edge>;
}

/**
 * Breadth-first ball of radius `degree` around `centralId` over the full graph.
 * Each discovered node records the edge through which it was first reached (its
 * generative edge). Traversal direction is controlled by `direction`:
 * `both` (undirected), `children` (source→target), or `parents` (target→source).
 */
export function computeNeighbourhoodBall(
  centralId: NodeId,
  degree: number,
  edges: Edge[],
  direction: GrowDirection
): NeighbourhoodBall {
  const adjacency = buildAdjacency(edges, direction);

  const entrantIds: NodeId[] = [];
  const generativeEdges = new Map<NodeId, Edge>();
  const depthById = new Map<NodeId, number>([[centralId, 0]]);
  const queue: NodeId[] = [centralId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depthById.get(current)!;
    if (currentDepth >= degree) continue;

    for (const { neighbour, edge } of adjacency.get(current) ?? []) {
      if (depthById.has(neighbour)) continue;
      depthById.set(neighbour, currentDepth + 1);
      generativeEdges.set(neighbour, edge);
      entrantIds.push(neighbour);
      queue.push(neighbour);
    }
  }

  return { entrantIds, generativeEdges };
}

/**
 * Build a directed/undirected adjacency list carrying the connecting edge, so
 * BFS can report the generative edge for each discovered node.
 */
function buildAdjacency(
  edges: Edge[],
  direction: GrowDirection
): Map<NodeId, { neighbour: NodeId; edge: Edge }[]> {
  const adjacency = new Map<NodeId, { neighbour: NodeId; edge: Edge }[]>();
  const link = (from: NodeId, to: NodeId, edge: Edge): void => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push({ neighbour: to, edge });
  };

  for (const edge of edges) {
    if (edge.sourceId === edge.targetId) continue;
    if (direction === 'both' || direction === 'children') link(edge.sourceId, edge.targetId, edge);
    if (direction === 'both' || direction === 'parents') link(edge.targetId, edge.sourceId, edge);
  }
  return adjacency;
}

/**
 * Design for an entrant node: the configured equation design when the node
 * carries an equation, otherwise the configured basic design. Inlined (reads
 * only `config`) to avoid a cross-cutting dependency on the AI shelf selector,
 * while using the same two settings for consistency.
 */
function pickEntrantDesign(node: Node): EntrantDesign {
  const properties = node.properties as Record<string, unknown> | undefined;
  const id = properties?.equation
    ? getSetting('node.shelfDesignWithEquation')
    : getSetting('node.shelfDesignBasic');
  return { id, params: {} };
}

/**
 * Add the entrant nodes and their generative edges to the scene, parked at the
 * origin. Nodes are added at full style and measured (so the layout gets real
 * footprints), then shrunk to `size 0 / opacity 0` ready for the grow-in;
 * generative edges are added at `opacity 0`.
 *
 * @mutates the Cytoscape instance.
 */
export async function seedEntrants(
  cy: Core,
  entrantIds: NodeId[],
  generativeEdges: Map<NodeId, Edge>,
  origin: Position,
  themeId: string
): Promise<EntrantSeed> {
  const nodesToStyle: {
    nodeId: NodeId;
    nodeData: Node;
    design: EntrantDesign;
    scale: number;
  }[] = [];

  entrantIds.forEach((nodeId, index) => {
    const nodeData = graphStore.nodes.find(candidate => candidate.id === nodeId);
    if (!nodeData) return;
    const design = pickEntrantDesign(nodeData);
    cy.add({
      group: 'nodes',
      data: { ...nodeData, design, scale: 1.0 },
      position: { x: origin.x + 1 + index * 0.1, y: origin.y + 1 + index * 0.1 },
    });
    nodesToStyle.push({ nodeId, nodeData, design, scale: 1.0 });
  });

  if (nodesToStyle.length > 0) {
    const stylesheet = (cy.style() as unknown as { json: () => unknown[] }).json();
    const updated = await StyleGenerator.addNodesToStylesheet(stylesheet, nodesToStyle, themeId);
    cy.style().fromJson(updated).update();
  }

  // Measure at full size, capture the size to grow back to, then shrink to seed.
  const footprints = new Map<NodeId, { width: number; height: number }>();
  const visuals = new Map<NodeId, EntrantVisual>();
  for (const { nodeId } of nodesToStyle) {
    const node = cy.getElementById(nodeId);
    if (node.length === 0) continue;
    const box = node.boundingBox();
    footprints.set(nodeId, { width: box.w, height: box.h });
    visuals.set(nodeId, { width: node.style('width'), height: node.style('height') });
    node.style({ width: 0, height: 0, opacity: 0 });
  }

  // Add generative edges (endpoints now present), hidden until the grow-in.
  const edgeIds: EdgeId[] = [];
  for (const nodeId of entrantIds) {
    const edge = generativeEdges.get(nodeId);
    if (!edge) continue;
    if (cy.getElementById(edge.id).length > 0) continue;
    if (cy.getElementById(edge.sourceId).length === 0 || cy.getElementById(edge.targetId).length === 0) continue;
    cy.add({
      group: 'edges',
      data: { ...edge, id: edge.id, source: edge.sourceId, target: edge.targetId },
    });
    cy.getElementById(edge.id).style('opacity', 0);
    edgeIds.push(edge.id as EdgeId);
  }

  return { footprints, visuals, edgeIds };
}

/**
 * Grow the seeded entrants from the origin to their arranged targets while
 * fading/growing them and their generative edges in — run concurrently with the
 * existing nodes' motion so the whole scene settles as one gesture.
 *
 * @mutates the Cytoscape instance.
 */
export async function growEntrants(
  cy: Core,
  targets: Map<NodeId, Position>,
  origin: Position,
  seed: EntrantSeed,
  duration: number
): Promise<void> {
  const animations: Promise<void>[] = [];

  for (const [nodeId, target] of targets) {
    const node = cy.getElementById(nodeId);
    if (node.length === 0) continue;
    const visual = seed.visuals.get(nodeId);
    node.position({ x: origin.x + 1, y: origin.y + 1 });
    node.style({ width: 0, height: 0, opacity: 0 });
    animations.push(
      new Promise<void>(resolve => {
        node.animate(
          {
            position: target,
            style: { width: visual?.width, height: visual?.height, opacity: 1 },
          },
          { duration, easing: 'ease-out', complete: () => resolve() }
        );
      })
    );
  }

  if (seed.edgeIds.length > 0) {
    let edges = cy.collection();
    for (const id of seed.edgeIds) edges = edges.union(cy.getElementById(id));
    animations.push(
      new Promise<void>(resolve => {
        edges.animate({ style: { opacity: 1 } }, { duration, easing: 'ease-out', complete: () => resolve() });
      })
    );
  }

  await Promise.all(animations);
}

/** Read the current scene's theme id from Cytoscape scratch, defaulting to dark. */
export async function readCurrentThemeId(cy: Core): Promise<string> {
  const currentSceneId = cy.scratch('currentSceneId') as string | undefined;
  const currentScene = currentSceneId ? await graphStore.readScene(currentSceneId) : null;
  return currentScene?.themeId || 'dark';
}
