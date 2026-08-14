import type { NodeId, Scene } from '../../../../core/main-types';
import type { ParsedMermaidEdge, ParsedMermaidNode } from '../../document/diagram';
import { estimateDefaultNodeFootprint, type EstimatedNodeFootprint, type Position } from './shared';

/** Tunable spacing knobs for the sector-radial Mermaid layout. */
export interface RadialLayoutParams {
  /** Minimum radial distance between successive rings (px). */
  ringSpacing: number;
  /** Minimum arc gap between adjacent siblings on a ring (px). */
  siblingGap: number;
  /** Scales the title-estimated node footprint used when sizing ring radii. The
   *  estimator over-reserves space; values <1 pack rings tighter. Independent of
   *  the fan layout's own footprint scale. */
  footprintScale: number;
}

export const RADIAL_LAYOUT_DEFAULTS: RadialLayoutParams = {
  ringSpacing: 200,
  siblingGap: 40,
  footprintScale: 1,
};

interface SectorTreeNode {
  mermaidId: string;
  depth: number;
  children: SectorTreeNode[];
  leafWeight: number;
  /** Half-diagonal of the node's estimated footprint. */
  footprintRadius: number;
  angleStart: number;
  angleEnd: number;
}

export function layoutMermaidSceneNodesRadial(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  centralMermaidId: string,
  idByMermaidId: Map<string, NodeId>,
  params: RadialLayoutParams
): Scene['nodes'] {
  const positions = computeRadialSectorPositions(nodes, edges, centralMermaidId, params);
  const sceneNodes: Scene['nodes'] = {};
  for (const node of nodes) {
    const nodeId = idByMermaidId.get(node.mermaidId);
    if (!nodeId) continue;
    const position = positions.get(node.mermaidId);
    if (!position) continue;
    sceneNodes[nodeId] = {
      position,
      scale: 1.0,
      design: { id: 'default-node', params: {} },
    };
  }
  return sceneNodes;
}

/**
 * Recursive angular sector allocation over a BFS spanning tree rooted at the
 * central node. Each subtree stays inside its parent's wedge (sized by leaf
 * count), keeping children near their parent and edges short.
 *
 * Intentionally parallel to `src/features/autolayout/algorithms/`. The two are
 * independent copies: this one estimates footprints from title text (nodes do
 * not exist yet at import time), while the feature reads real rendered
 * footprints of live nodes.
 */
function computeRadialSectorPositions(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  centralMermaidId: string,
  params: RadialLayoutParams
): Map<string, Position> {
  const positions = new Map<string, Position>();
  if (nodes.length === 0) return positions;
  const nodeById = new Map(nodes.map(node => [node.mermaidId, node]));
  if (!nodeById.has(centralMermaidId)) return positions;

  const root = buildSectorForest(nodes, edges, centralMermaidId, nodeById);
  computeSectorLeafWeights(root);
  assignSectorAngles(root, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI);
  const ringRadii = computeSectorRingRadii(root, params);
  placeSectorNodes(root, ringRadii, positions);
  return positions;
}

function buildSectorForest(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  centralMermaidId: string,
  nodeById: Map<string, ParsedMermaidNode>
): SectorTreeNode {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.mermaidId, []);
  for (const edge of [...edges].sort((left, right) => left.order - right.order)) {
    if (edge.sourceMermaidId === edge.targetMermaidId) continue;
    if (!adjacency.has(edge.sourceMermaidId) || !adjacency.has(edge.targetMermaidId)) continue;
    adjacency.get(edge.sourceMermaidId)!.push(edge.targetMermaidId);
    adjacency.get(edge.targetMermaidId)!.push(edge.sourceMermaidId);
  }

  const makeTreeNode = (mermaidId: string, depth: number): SectorTreeNode => ({
    mermaidId,
    depth,
    children: [],
    leafWeight: 0,
    footprintRadius: sectorFootprintRadius(estimateDefaultNodeFootprint(nodeById.get(mermaidId)!)),
    angleStart: 0,
    angleEnd: 0,
  });

  const visited = new Set<string>();
  const growSubtree = (subtreeRoot: SectorTreeNode): void => {
    const queue: SectorTreeNode[] = [subtreeRoot];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighborId of adjacency.get(current.mermaidId) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const child = makeTreeNode(neighborId, current.depth + 1);
        current.children.push(child);
        queue.push(child);
      }
    }
  };

  const root = makeTreeNode(centralMermaidId, 0);
  visited.add(centralMermaidId);
  growSubtree(root);

  // Attach any node not reachable from the centre as its own depth-1 subtree.
  for (const node of nodes) {
    if (visited.has(node.mermaidId)) continue;
    visited.add(node.mermaidId);
    const componentRoot = makeTreeNode(node.mermaidId, 1);
    root.children.push(componentRoot);
    growSubtree(componentRoot);
  }

  return root;
}

function sectorFootprintRadius(footprint: EstimatedNodeFootprint): number {
  return Math.sqrt((footprint.width / 2) ** 2 + (footprint.height / 2) ** 2);
}

function computeSectorLeafWeights(node: SectorTreeNode): number {
  if (node.children.length === 0) {
    node.leafWeight = 1;
    return 1;
  }
  let sum = 0;
  for (const child of node.children) sum += computeSectorLeafWeights(child);
  node.leafWeight = sum;
  return sum;
}

function assignSectorAngles(node: SectorTreeNode, start: number, end: number): void {
  node.angleStart = start;
  node.angleEnd = end;
  if (node.children.length === 0) return;
  const totalWeight = node.children.reduce((sum, child) => sum + child.leafWeight, 0) || 1;
  const span = end - start;
  let cursor = start;
  for (const child of node.children) {
    const childSpan = span * (child.leafWeight / totalWeight);
    assignSectorAngles(child, cursor, cursor + childSpan);
    cursor += childSpan;
  }
}

function computeSectorRingRadii(root: SectorTreeNode, params: RadialLayoutParams): number[] {
  const nodesByDepth: SectorTreeNode[][] = [];
  const walk = (node: SectorTreeNode): void => {
    (nodesByDepth[node.depth] ??= []).push(node);
    node.children.forEach(walk);
  };
  walk(root);

  const radii: number[] = [0];
  for (let depth = 1; depth < nodesByDepth.length; depth++) {
    let required = radii[depth - 1] + params.ringSpacing;
    for (const node of nodesByDepth[depth]) {
      const angularWidth = node.angleEnd - node.angleStart;
      if (angularWidth <= 1e-6) continue;
      const arcNeeded = 2 * params.footprintScale * node.footprintRadius + params.siblingGap;
      const radiusForFit = arcNeeded / angularWidth;
      if (radiusForFit > required) required = radiusForFit;
    }
    radii[depth] = Math.ceil(required);
  }
  return radii;
}

function placeSectorNodes(node: SectorTreeNode, ringRadii: number[], out: Map<string, Position>): void {
  const angle = (node.angleStart + node.angleEnd) / 2;
  const radius = ringRadii[node.depth] ?? 0;
  out.set(node.mermaidId, {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
  });
  for (const child of node.children) placeSectorNodes(child, ringRadii, out);
}
