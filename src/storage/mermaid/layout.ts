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

interface RadialLayerGeometry {
  radius: number;
  maxNodeRadius: number;
}

interface OrderedMermaidLayer {
  layer: number;
  nodes: ParsedMermaidNode[];
  groupKeys: Array<number | null>;
}

const RADIAL_BASE_LAYER_SPACING = 180;
const RADIAL_LAYER_MARGIN = 30;
const RADIAL_CENTER_LAYER_MARGIN = 150;
const RADIAL_SIBLING_MARGIN = -8;
const RADIAL_COLLISION_RADIUS_SCALE = 0.65;
const RADIAL_ELLIPSE_X_SCALE = 1.35;
const RADIAL_ELLIPSE_Y_SCALE = 0.9;
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

  const distances = computeUndirectedDistances(nodes, edges, centralMermaidId);
  const finiteDistances = [...distances.values()].filter(distance => Number.isFinite(distance));
  const disconnectedDistance = (Math.max(0, ...finiteDistances) || 1) + 1;
  const layers = new Map<number, ParsedMermaidNode[]>();

  for (const node of nodes) {
    const distance = distances.get(node.mermaidId) ?? disconnectedDistance;
    const layer = Number.isFinite(distance) ? distance : disconnectedDistance;
    const existing = layers.get(layer) ?? [];
    existing.push(node);
    layers.set(layer, existing);
  }

  const sceneNodes: Scene['nodes'] = {};
  let previousLayerGeometry: RadialLayerGeometry | undefined;
  for (const { layer, nodes: layerNodes } of orderMermaidLayersByCrossLayerNeighbors(layers, edges)) {
    const nodeRadii = layerNodes.map(node => getCollisionRadius(estimateDefaultNodeFootprint(node)));
    const layerRadius = calculateLayerRadius(layer, nodeRadii, previousLayerGeometry);
    const positions = positionsForLayer(layerRadius, nodeRadii);
    previousLayerGeometry = {
      radius: layerRadius,
      maxNodeRadius: Math.max(0, ...nodeRadii),
    };
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

function getCollisionRadius(footprint: EstimatedNodeFootprint): number {
  const diagonalRadius = Math.sqrt((footprint.width / 2) ** 2 + (footprint.height / 2) ** 2);
  return diagonalRadius * RADIAL_COLLISION_RADIUS_SCALE;
}

function calculateLayerRadius(
  layer: number,
  nodeRadii: number[],
  previousLayerGeometry: RadialLayerGeometry | undefined
): number {
  if (layer === 0) return 0;

  const maxNodeRadius = Math.max(0, ...nodeRadii);
  const baseRadius = layer * RADIAL_BASE_LAYER_SPACING;
  const sameLayerRadius = calculateMinimumCrowdingRadius(nodeRadii);
  const previousLayerRadius = previousLayerGeometry
    ? previousLayerGeometry.radius + calculateMinimumLayerGap(previousLayerGeometry, maxNodeRadius)
    : 0;

  return Math.ceil(Math.max(baseRadius, sameLayerRadius, previousLayerRadius));
}

function calculateMinimumLayerGap(previousLayerGeometry: RadialLayerGeometry, maxNodeRadius: number): number {
  const margin = previousLayerGeometry.radius === 0 ? RADIAL_CENTER_LAYER_MARGIN : RADIAL_LAYER_MARGIN;
  const ellipseScale = previousLayerGeometry.radius === 0
    ? Math.min(RADIAL_ELLIPSE_X_SCALE, RADIAL_ELLIPSE_Y_SCALE)
    : 1;
  return (previousLayerGeometry.maxNodeRadius + maxNodeRadius + margin) / ellipseScale;
}

function calculateMinimumCrowdingRadius(nodeRadii: number[]): number {
  if (nodeRadii.length <= 1) return 0;

  let low = Math.max(...nodeRadii) + RADIAL_SIBLING_MARGIN;
  let high = low;
  while (getRequiredAngularSpan(nodeRadii, high) > 2 * Math.PI) {
    high *= 1.5;
  }

  for (let iteration = 0; iteration < 24; iteration++) {
    const middle = (low + high) / 2;
    if (getRequiredAngularSpan(nodeRadii, middle) > 2 * Math.PI) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return Math.ceil(high);
}

function getRequiredAngularSpan(nodeRadii: number[], layerRadius: number): number {
  return nodeRadii.reduce((sum, nodeRadius) => {
    const spanRadius = nodeRadius + RADIAL_SIBLING_MARGIN / 2;
    return sum + 2 * Math.asin(Math.min(1, spanRadius / layerRadius));
  }, 0);
}

function positionsForLayer(layerRadius: number, nodeRadii: number[]): Position[] {
  if (layerRadius === 0) return [{ x: 0, y: 0 }];
  if (nodeRadii.length === 0) return [];

  const xRadius = layerRadius * RADIAL_ELLIPSE_X_SCALE;
  const yRadius = layerRadius * RADIAL_ELLIPSE_Y_SCALE;

  const angularSpans = nodeRadii.map(nodeRadius => (
    2 * Math.asin(Math.min(1, (nodeRadius + RADIAL_SIBLING_MARGIN / 2) / layerRadius))
  ));
  const totalSpan = angularSpans.reduce((sum, span) => sum + span, 0);
  const remainingSpan = Math.max(0, 2 * Math.PI - totalSpan);
  const gap = remainingSpan / nodeRadii.length;
  let angle = -Math.PI / 2 - angularSpans[0] / 2;

  return nodeRadii.map((_nodeRadius, index): Position => {
    angle += (index === 0 ? 0 : angularSpans[index - 1] / 2 + gap) + angularSpans[index] / 2;
    const x = Math.round(Math.cos(angle) * xRadius);
    const y = Math.round(Math.sin(angle) * yRadius);
    return { x, y };
  });
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