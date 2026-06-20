import type { BackgroundImage, Edge, EdgeType, Node, NodeId, Scene } from '../../core/main-types';
import { getAnchorTraversal } from './anchor-traversal';

export interface GraphStatisticBucket {
  label: string;
  count: number;
}

export interface GraphStatistics {
  totals: {
    nodes: number;
    edges: number;
    edgeTypes: number;
    scenes: number;
    backgroundImages: number;
  };
  connectivity: {
    isolatedNodes: number;
    disconnectedFromAnchor: number;
    connectedComponents: number;
    largestComponentSize: number;
    maxAnchorDistance: number | null;
  };
  distributions: {
    nodesByAnchorDistance: GraphStatisticBucket[];
    nodesByConnectionCount: GraphStatisticBucket[];
    nodesBySceneCount: GraphStatisticBucket[];
    edgesByType: GraphStatisticBucket[];
  };
  sceneCoverage: {
    nodesNotInAnyScene: number;
    nodesWithoutOwnScene: number;
    totalSceneNodeInclusions: number;
    totalSceneEdgeInclusions: number;
  };
  averages: {
    edgesPerNode: number;
    averageDegree: number;
    nodesPerScene: number;
    edgesPerScene: number;
    scenesPerNode: number;
  };
}

interface GraphStatisticsInput {
  nodes: Node[];
  edges: Edge[];
  edgeTypes: EdgeType[];
  scenes: Scene[];
  backgroundImages: BackgroundImage[];
}

export function buildGraphStatistics(input: GraphStatisticsInput): GraphStatistics {
  const nodeIds = new Set(input.nodes.map(node => node.id));
  const validEdges = input.edges.filter(edge => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));
  const degreeByNode = buildDegreeByNode(input.nodes, validEdges);
  const sceneCountByNode = buildSceneCountByNode(input.nodes, input.scenes);
  const anchorTraversal = getAnchorTraversal(input.nodes, validEdges);
  const anchorDistances = anchorTraversal?.distances ?? new Map<NodeId, number>();
  const disconnectedFromAnchor = input.nodes.filter(node => !anchorDistances.has(node.id)).length;
  const componentSizes = getConnectedComponentSizes(input.nodes, validEdges);
  const totalSceneNodeInclusions = input.scenes.reduce((sum, scene) => sum + Object.keys(scene.nodes).length, 0);
  const totalSceneEdgeInclusions = input.scenes.reduce((sum, scene) => sum + Object.keys(scene.edges).length, 0);
  const nodeHasOwnScene = new Set(input.scenes.map(scene => scene.centralNodeId));

  return {
    totals: {
      nodes: input.nodes.length,
      edges: input.edges.length,
      edgeTypes: input.edgeTypes.length,
      scenes: input.scenes.length,
      backgroundImages: input.backgroundImages.length
    },
    connectivity: {
      isolatedNodes: input.nodes.filter(node => (degreeByNode.get(node.id) ?? 0) === 0).length,
      disconnectedFromAnchor,
      connectedComponents: componentSizes.length,
      largestComponentSize: componentSizes[0] ?? 0,
      maxAnchorDistance: anchorDistances.size > 0 ? Math.max(...anchorDistances.values()) : null
    },
    distributions: {
      nodesByAnchorDistance: buildAnchorDistanceBuckets(input.nodes, anchorDistances),
      nodesByConnectionCount: buildNumericBuckets(input.nodes.map(node => degreeByNode.get(node.id) ?? 0)),
      nodesBySceneCount: buildNumericBuckets(input.nodes.map(node => sceneCountByNode.get(node.id) ?? 0)),
      edgesByType: buildEdgeTypeBuckets(input.edgeTypes, input.edges)
    },
    sceneCoverage: {
      nodesNotInAnyScene: input.nodes.filter(node => (sceneCountByNode.get(node.id) ?? 0) === 0).length,
      nodesWithoutOwnScene: input.nodes.filter(node => !nodeHasOwnScene.has(node.id)).length,
      totalSceneNodeInclusions,
      totalSceneEdgeInclusions
    },
    averages: {
      edgesPerNode: divide(input.edges.length, input.nodes.length),
      averageDegree: divide(validEdges.length * 2, input.nodes.length),
      nodesPerScene: divide(totalSceneNodeInclusions, input.scenes.length),
      edgesPerScene: divide(totalSceneEdgeInclusions, input.scenes.length),
      scenesPerNode: divide(totalSceneNodeInclusions, input.nodes.length)
    }
  };
}

function buildDegreeByNode(nodes: Node[], edges: Edge[]): Map<NodeId, number> {
  const degrees = new Map<NodeId, number>(nodes.map(node => [node.id, 0]));
  for (const edge of edges) {
    degrees.set(edge.sourceId, (degrees.get(edge.sourceId) ?? 0) + 1);
    degrees.set(edge.targetId, (degrees.get(edge.targetId) ?? 0) + 1);
  }
  return degrees;
}

function buildSceneCountByNode(nodes: Node[], scenes: Scene[]): Map<NodeId, number> {
  const counts = new Map<NodeId, number>(nodes.map(node => [node.id, 0]));
  for (const scene of scenes) {
    for (const nodeId of Object.keys(scene.nodes) as NodeId[]) {
      counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
    }
  }
  return counts;
}

function getConnectedComponentSizes(nodes: Node[], edges: Edge[]): number[] {
  const adjacency = new Map<NodeId, NodeId[]>(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    adjacency.get(edge.sourceId)?.push(edge.targetId);
    adjacency.get(edge.targetId)?.push(edge.sourceId);
  }

  const visited = new Set<NodeId>();
  const sizes: number[] = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const queue: NodeId[] = [node.id];
    visited.add(node.id);
    let size = 0;

    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index];
      size += 1;
      for (const neighborId of adjacency.get(currentId) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    sizes.push(size);
  }

  return sizes.sort((left, right) => right - left);
}

function buildAnchorDistanceBuckets(nodes: Node[], distances: Map<NodeId, number>): GraphStatisticBucket[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const label = distances.has(node.id) ? String(distances.get(node.id)) : 'Disconnected';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => bucketSortValue(left) - bucketSortValue(right))
    .map(([label, count]) => ({ label, count }));
}

function buildNumericBuckets(values: number[]): GraphStatisticBucket[] {
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([value, count]) => ({ label: String(value), count }));
}

function buildEdgeTypeBuckets(edgeTypes: EdgeType[], edges: Edge[]): GraphStatisticBucket[] {
  const typeNames = new Map(edgeTypes.map(type => [type.id, type.name]));
  const counts = new Map<string, number>();
  for (const edge of edges) {
    const label = typeNames.get(edge.typeId) ?? edge.typeId;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => ({ label, count }));
}

function bucketSortValue(label: string): number {
  if (label === 'Disconnected') return Number.MAX_SAFE_INTEGER;
  return Number(label);
}

function divide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}