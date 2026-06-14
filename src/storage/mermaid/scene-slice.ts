import type { ParsedMermaidGraph } from './flowchart';

export const MERMAID_SCENE_LIMITS = {
  maxNodes: 100,
  maxEdges: 500,
} as const;

export interface MermaidSceneSlice {
  nodeIds: Set<string>;
  edgeIndexes: Set<number>;
  nodeCount: number;
  edgeCount: number;
  overNodeLimit: boolean;
  overEdgeLimit: boolean;
  overLimit: boolean;
}

export function getMermaidSceneSlice(
  parsed: ParsedMermaidGraph,
  anchorMermaidId: string,
  depth: number,
  allLevels: boolean
): MermaidSceneSlice {
  if (!parsed.nodes.some(node => node.mermaidId === anchorMermaidId)) {
    throw new Error('Could not choose a central node.');
  }

  const maxDepth = allLevels ? Number.POSITIVE_INFINITY : Math.max(0, Math.trunc(depth));
  const adjacency = new Map(parsed.nodes.map(node => [node.mermaidId, [] as string[]]));
  for (const edge of parsed.edges) {
    adjacency.get(edge.sourceMermaidId)?.push(edge.targetMermaidId);
    adjacency.get(edge.targetMermaidId)?.push(edge.sourceMermaidId);
  }

  const nodeIds = new Set<string>([anchorMermaidId]);
  const distances = new Map<string, number>([[anchorMermaidId, 0]]);
  const queue = [anchorMermaidId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const currentDepth = distances.get(current) ?? 0;
    if (currentDepth >= maxDepth) continue;

    for (const next of adjacency.get(current) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, currentDepth + 1);
      nodeIds.add(next);
      queue.push(next);
    }
  }

  const edgeIndexes = new Set<number>();
  parsed.edges.forEach((edge, index) => {
    if (nodeIds.has(edge.sourceMermaidId) && nodeIds.has(edge.targetMermaidId)) {
      edgeIndexes.add(index);
    }
  });

  const nodeCount = nodeIds.size;
  const edgeCount = edgeIndexes.size;
  const overNodeLimit = nodeCount > MERMAID_SCENE_LIMITS.maxNodes;
  const overEdgeLimit = edgeCount > MERMAID_SCENE_LIMITS.maxEdges;

  return {
    nodeIds,
    edgeIndexes,
    nodeCount,
    edgeCount,
    overNodeLimit,
    overEdgeLimit,
    overLimit: overNodeLimit || overEdgeLimit,
  };
}