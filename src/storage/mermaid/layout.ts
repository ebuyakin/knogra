import type { NodeId, Scene } from '../../core/main-types';
import type { ParsedMermaidEdge, ParsedMermaidNode } from './flowchart';

type MermaidSceneLayout = 'radial' | 'top-down' | 'left-right';

interface Position {
  x: number;
  y: number;
}

interface EstimatedNodeFootprint {
  width: number;
  height: number;
}

interface OrderedMermaidLayer {
  layer: number;
  nodes: ParsedMermaidNode[];
  groupKeys: Array<number | null>;
}

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

const SECTOR_RING_SPACING = 220;
const SECTOR_SIBLING_GAP = 40;
const DEFAULT_NODE_ASPECT = 16 / 9;
const DEFAULT_NODE_FONT_SIZE = 14;
const DEFAULT_NODE_MIN_WIDTH = 100;
const DEFAULT_NODE_LINE_HEIGHT_FACTOR = 1.4;
const DEFAULT_NODE_CHAR_WIDTH_FACTOR = 0.6;
const DEFAULT_NODE_HORIZONTAL_PADDING = 28;
const DEFAULT_NODE_VERTICAL_PADDING = 18;
const DEFAULT_NODE_SHADOW_PADDING_ESTIMATE = 0;

export function layoutMermaidSceneNodes(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  centralMermaidId: string,
  layout: MermaidSceneLayout,
  idByMermaidId: Map<string, NodeId>
): Scene['nodes'] {
  if (layout === 'top-down' || layout === 'left-right') {
    return layoutMermaidSceneNodesFlow(nodes, edges, centralMermaidId, layout, idByMermaidId);
  }

  return layoutMermaidSceneNodesRadial(nodes, edges, centralMermaidId, idByMermaidId);
}

function layoutMermaidSceneNodesRadial(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  centralMermaidId: string,
  idByMermaidId: Map<string, NodeId>
): Scene['nodes'] {
  const positions = computeRadialSectorPositions(nodes, edges, centralMermaidId);
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
 * Intentionally parallel to `src/features/autolayout/layout.ts`. The two are
 * independent copies: this one estimates footprints from title text (nodes do
 * not exist yet at import time), while the feature reads real rendered
 * footprints of live nodes.
 */
function computeRadialSectorPositions(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  centralMermaidId: string
): Map<string, Position> {
  const positions = new Map<string, Position>();
  if (nodes.length === 0) return positions;
  const nodeById = new Map(nodes.map(node => [node.mermaidId, node]));
  if (!nodeById.has(centralMermaidId)) return positions;

  const root = buildSectorForest(nodes, edges, centralMermaidId, nodeById);
  computeSectorLeafWeights(root);
  assignSectorAngles(root, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI);
  const ringRadii = computeSectorRingRadii(root);
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

function computeSectorRingRadii(root: SectorTreeNode): number[] {
  const nodesByDepth: SectorTreeNode[][] = [];
  const walk = (node: SectorTreeNode): void => {
    (nodesByDepth[node.depth] ??= []).push(node);
    node.children.forEach(walk);
  };
  walk(root);

  const radii: number[] = [0];
  for (let depth = 1; depth < nodesByDepth.length; depth++) {
    let required = radii[depth - 1] + SECTOR_RING_SPACING;
    for (const node of nodesByDepth[depth]) {
      const angularWidth = node.angleEnd - node.angleStart;
      if (angularWidth <= 1e-6) continue;
      const arcNeeded = 2 * node.footprintRadius + SECTOR_SIBLING_GAP;
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

function layoutMermaidSceneNodesFlow(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  centralMermaidId: string,
  layout: 'top-down' | 'left-right',
  idByMermaidId: Map<string, NodeId>
): Scene['nodes'] {
  const distances = computeUndirectedDistances(nodes, edges, centralMermaidId);
  const reachable = new Set(distances.keys());
  const fallbackDistance = (Math.max(0, ...distances.values()) || 1) + 1;
  const layers = new Map<number, ParsedMermaidNode[]>();

  for (const node of nodes) {
    const layer = reachable.has(node.mermaidId) ? distances.get(node.mermaidId)! : fallbackDistance;
    const existing = layers.get(layer) ?? [];
    existing.push(node);
    layers.set(layer, existing);
  }

  const sceneNodes: Scene['nodes'] = {};
  for (const { layer, nodes: layerNodes, groupKeys } of orderMermaidLayersByCrossLayerNeighbors(layers, edges)) {
    const positions = positionsForFlowLayer(layer, groupKeys, layout);
    layerNodes.forEach((node, index) => {
      const nodeId = idByMermaidId.get(node.mermaidId);
      if (!nodeId) return;
      sceneNodes[nodeId] = {
        position: positions[index],
        scale: 1.0,
        design: { id: 'default-node', params: {} },
      };
    });
  }

  return sceneNodes;
}

function orderMermaidLayersByCrossLayerNeighbors(
  layers: Map<number, ParsedMermaidNode[]>,
  edges: ParsedMermaidEdge[]
): OrderedMermaidLayer[] {
  const layerByMermaidId = new Map<string, number>();
  for (const [layer, layerNodes] of layers) {
    for (const node of layerNodes) {
      layerByMermaidId.set(node.mermaidId, layer);
    }
  }

  const neighborIdsByNodeId = new Map<string, string[]>();
  for (const edge of [...edges].sort((left, right) => left.order - right.order)) {
    addMermaidNeighbor(neighborIdsByNodeId, edge.sourceMermaidId, edge.targetMermaidId);
    addMermaidNeighbor(neighborIdsByNodeId, edge.targetMermaidId, edge.sourceMermaidId);
  }

  const orderedPositionByMermaidId = new Map<string, { layer: number; index: number }>();

  return [...layers.entries()]
    .sort(([leftLayer], [rightLayer]) => leftLayer - rightLayer)
    .map(([layer, layerNodes]) => {
      const baseSortKeys = new Map<string, number | null>();
      for (const node of layerNodes) {
        baseSortKeys.set(
          node.mermaidId,
          getCrossLayerNeighborSortKey(node.mermaidId, layer, neighborIdsByNodeId, orderedPositionByMermaidId)
        );
      }

      const orderedNodes = [...layerNodes].sort((left, right) => {
        const leftSortKey = getSameLayerAdjustedSortKey(left.mermaidId, layer, baseSortKeys, neighborIdsByNodeId, layerByMermaidId);
        const rightSortKey = getSameLayerAdjustedSortKey(right.mermaidId, layer, baseSortKeys, neighborIdsByNodeId, layerByMermaidId);
        const neighborComparison = compareOptionalRank(leftSortKey, rightSortKey);
        return neighborComparison || left.order - right.order;
      });

      const groupKeys = orderedNodes.map(node => (
        getSameLayerAdjustedSortKey(node.mermaidId, layer, baseSortKeys, neighborIdsByNodeId, layerByMermaidId)
      ));

      orderedNodes.forEach((node, index) => {
        orderedPositionByMermaidId.set(node.mermaidId, { layer, index });
      });

      return { layer, nodes: orderedNodes, groupKeys };
    });
}

function addMermaidNeighbor(neighborIdsByNodeId: Map<string, string[]>, mermaidId: string, neighborId: string): void {
  const neighborIds = neighborIdsByNodeId.get(mermaidId) ?? [];
  if (!neighborIds.includes(neighborId)) neighborIds.push(neighborId);
  neighborIdsByNodeId.set(mermaidId, neighborIds);
}

function getCrossLayerNeighborSortKey(
  mermaidId: string,
  layer: number,
  neighborIdsByNodeId: Map<string, string[]>,
  orderedPositionByMermaidId: Map<string, { layer: number; index: number }>
): number | null {
  let nearestNeighborLayer: number | null = null;
  const neighborIndexes: number[] = [];

  for (const neighborId of neighborIdsByNodeId.get(mermaidId) ?? []) {
    const neighborPosition = orderedPositionByMermaidId.get(neighborId);
    if (!neighborPosition || neighborPosition.layer >= layer) continue;

    if (nearestNeighborLayer === null || neighborPosition.layer > nearestNeighborLayer) {
      nearestNeighborLayer = neighborPosition.layer;
      neighborIndexes.length = 0;
    }

    if (neighborPosition.layer === nearestNeighborLayer) {
      neighborIndexes.push(neighborPosition.index);
    }
  }

  if (neighborIndexes.length === 0) return null;
  return neighborIndexes.reduce((sum, index) => sum + index, 0) / neighborIndexes.length;
}

function getSameLayerAdjustedSortKey(
  mermaidId: string,
  layer: number,
  baseSortKeys: Map<string, number | null>,
  neighborIdsByNodeId: Map<string, string[]>,
  layerByMermaidId: Map<string, number>
): number | null {
  const baseSortKey = baseSortKeys.get(mermaidId) ?? null;
  if (baseSortKey === null) return null;

  let earliestNeighborKey: number | null = null;
  let latestNeighborKey: number | null = null;

  for (const neighborId of neighborIdsByNodeId.get(mermaidId) ?? []) {
    if (layerByMermaidId.get(neighborId) !== layer) continue;
    const neighborSortKey = baseSortKeys.get(neighborId) ?? null;
    if (neighborSortKey === null || neighborSortKey === baseSortKey) continue;

    earliestNeighborKey = earliestNeighborKey === null ? neighborSortKey : Math.min(earliestNeighborKey, neighborSortKey);
    latestNeighborKey = latestNeighborKey === null ? neighborSortKey : Math.max(latestNeighborKey, neighborSortKey);
  }

  if (earliestNeighborKey !== null && earliestNeighborKey < baseSortKey) {
    return (earliestNeighborKey + baseSortKey) / 2 + 0.1;
  }
  if (latestNeighborKey !== null && latestNeighborKey > baseSortKey) {
    return (baseSortKey + latestNeighborKey) / 2 - 0.1;
  }

  return baseSortKey;
}

function compareOptionalRank(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function computeUndirectedDistances(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  centralMermaidId: string
): Map<string, number> {
  const adjacency = new Map(nodes.map(node => [node.mermaidId, [] as string[]]));
  for (const edge of edges) {
    adjacency.get(edge.sourceMermaidId)?.push(edge.targetMermaidId);
    adjacency.get(edge.targetMermaidId)?.push(edge.sourceMermaidId);
  }

  const distances = new Map<string, number>([[centralMermaidId, 0]]);
  const queue = [centralMermaidId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const nextDistance = (distances.get(current) ?? 0) + 1;
    for (const next of adjacency.get(current) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, nextDistance);
      queue.push(next);
    }
  }

  return distances;
}

function estimateDefaultNodeFootprint(node: ParsedMermaidNode): EstimatedNodeFootprint {
  const title = node.title.trim() || node.mermaidId;
  const charWidth = DEFAULT_NODE_FONT_SIZE * DEFAULT_NODE_CHAR_WIDTH_FACTOR;
  const lineHeight = DEFAULT_NODE_FONT_SIZE * DEFAULT_NODE_LINE_HEIGHT_FACTOR;
  const textPixelWidth = title.length * charWidth;
  const optimalLineCount = Math.max(1, Math.round(Math.sqrt(textPixelWidth / (lineHeight * DEFAULT_NODE_ASPECT))));
  const candidateLineCounts = [optimalLineCount - 1, optimalLineCount, optimalLineCount + 1].filter(count => count >= 1);
  let bestLines: string[] = [title];
  let bestAspectDiff = Infinity;

  for (const lineCount of candidateLineCounts) {
    const targetLineWidth = textPixelWidth / lineCount;
    const lines = wordWrapTitle(title, targetLineWidth, DEFAULT_NODE_FONT_SIZE);
    const longestLine = Math.max(...lines.map(line => line.length));
    const contentWidth = Math.max(longestLine * charWidth, DEFAULT_NODE_MIN_WIDTH - DEFAULT_NODE_HORIZONTAL_PADDING * 2);
    const contentHeight = lines.length * lineHeight;
    const totalWidth = contentWidth + DEFAULT_NODE_HORIZONTAL_PADDING * 2;
    const totalHeight = contentHeight + DEFAULT_NODE_VERTICAL_PADDING * 2;
    const aspectDiff = Math.abs(totalWidth / totalHeight - DEFAULT_NODE_ASPECT);

    if (aspectDiff < bestAspectDiff) {
      bestAspectDiff = aspectDiff;
      bestLines = lines;
    }
  }

  const longestLine = Math.max(...bestLines.map(line => line.length));
  const contentWidth = Math.max(longestLine * charWidth, DEFAULT_NODE_MIN_WIDTH - DEFAULT_NODE_HORIZONTAL_PADDING * 2);
  const contentHeight = bestLines.length * lineHeight;

  return {
    width: contentWidth + DEFAULT_NODE_HORIZONTAL_PADDING * 2 + DEFAULT_NODE_SHADOW_PADDING_ESTIMATE,
    height: contentHeight + DEFAULT_NODE_VERTICAL_PADDING * 2 + DEFAULT_NODE_SHADOW_PADDING_ESTIMATE,
  };
}

function wordWrapTitle(title: string, targetWidthPx: number, fontSize: number): string[] {
  if (title.includes('\n')) return title.split('\n');

  const charWidth = fontSize * DEFAULT_NODE_CHAR_WIDTH_FACTOR;
  const maxCharsPerLine = Math.max(1, Math.floor(targetWidthPx / charWidth));
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length <= maxCharsPerLine || current === '') {
      current = test;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [title];
}

function positionsForFlowLayer(layer: number, groupKeys: Array<number | null>, layout: 'top-down' | 'left-right'): Position[] {
  const primary = layer * 300;
  const secondaryPositions = positionsForFlowLayerSecondaryAxis(groupKeys);
  return secondaryPositions.map((secondary): Position => {
    return layout === 'top-down'
      ? { x: secondary, y: primary }
      : { x: primary, y: secondary };
  });
}

function positionsForFlowLayerSecondaryAxis(groupKeys: Array<number | null>): number[] {
  const nodeSpacing = 100;
  const groupSpacing = 150;
  if (groupKeys.length === 0) return [];

  const positions = [0];
  for (let index = 1; index < groupKeys.length; index++) {
    const spacing = isSameFlowGroup(groupKeys[index - 1], groupKeys[index]) ? nodeSpacing : groupSpacing;
    positions.push(positions[index - 1] + spacing);
  }

  const center = (positions[0] + positions[positions.length - 1]) / 2;
  return positions.map(position => Math.round(position - center));
}

function isSameFlowGroup(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < 0.000001;
}