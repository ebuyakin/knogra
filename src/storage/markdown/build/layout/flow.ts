import type { NodeId, Scene } from '../../../../core/main-types';
import type { ParsedMermaidEdge, ParsedMermaidNode } from '../../document/diagram';
import type { Position } from './shared';

interface OrderedMermaidLayer {
  layer: number;
  nodes: ParsedMermaidNode[];
  groupKeys: Array<number | null>;
}

export function layoutMermaidSceneNodesFlow(
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
