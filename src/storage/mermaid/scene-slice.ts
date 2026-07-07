import type { ParsedMermaidGraph } from './flowchart';
import type { EdgeSceneFlags } from './edge-mapping';

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
  allLevels: boolean,
  edgeFlags: EdgeSceneFlags[]
): MermaidSceneSlice {
  if (!parsed.nodes.some(node => node.mermaidId === anchorMermaidId)) {
    throw new Error('Could not choose a central node.');
  }

  const maxDepth = allLevels ? Number.POSITIVE_INFINITY : Math.max(0, Math.trunc(depth));
  const adjacency = buildDirectedAdjacency(parsed, edgeFlags);

  const nodeIds = new Set<string>([anchorMermaidId]);
  const distances = new Map<string, number>([[anchorMermaidId, 0]]);
  const parentByMermaidId = new Map<string, string>();
  const queue = [anchorMermaidId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const currentDepth = distances.get(current) ?? 0;
    if (currentDepth >= maxDepth) continue;

    for (const next of adjacency.get(current) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, currentDepth + 1);
      parentByMermaidId.set(next, current);
      nodeIds.add(next);
      queue.push(next);
    }
  }

  const edgeIndexes = collectSceneEdgeIndexes(parsed, nodeIds, parentByMermaidId, edgeFlags);

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

export function computeAnchorParentMap(
  parsed: ParsedMermaidGraph,
  anchorMermaidId: string,
  edgeFlags: EdgeSceneFlags[]
): Map<string, string> {
  const adjacency = buildDirectedAdjacency(parsed, edgeFlags);

  const parentByMermaidId = new Map<string, string>();
  const visited = new Set<string>([anchorMermaidId]);
  const queue = [anchorMermaidId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      parentByMermaidId.set(next, current);
      queue.push(next);
    }
  }
  return parentByMermaidId;
}

/**
 * Directed scene-composition adjacency. Each edge is walkable forward
 * (source→target) when its `children` flag is set and backward
 * (target→source) when its `parents` flag is set; a fully-disabled edge is
 * absent from the graph traversal entirely.
 */
function buildDirectedAdjacency(
  parsed: ParsedMermaidGraph,
  edgeFlags: EdgeSceneFlags[]
): Map<string, string[]> {
  const adjacency = new Map(parsed.nodes.map(node => [node.mermaidId, [] as string[]]));
  parsed.edges.forEach((edge, index) => {
    const flags = edgeFlags[index];
    if (flags?.children) adjacency.get(edge.sourceMermaidId)?.push(edge.targetMermaidId);
    if (flags?.parents) adjacency.get(edge.targetMermaidId)?.push(edge.sourceMermaidId);
  });
  return adjacency;
}

/**
 * Edges to draw in a composed scene: those with both endpoints present that are
 * either **generative** (connect a node to its scene-parent) or whose label has
 * cross-links enabled. `sceneParent` is the scene's parent map (global fan tree
 * or a per-scene BFS tree).
 */
function collectSceneEdgeIndexes(
  parsed: ParsedMermaidGraph,
  nodeIds: Set<string>,
  sceneParent: Map<string, string>,
  edgeFlags: EdgeSceneFlags[]
): Set<number> {
  const edgeIndexes = new Set<number>();
  parsed.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.sourceMermaidId) || !nodeIds.has(edge.targetMermaidId)) return;
    const generative =
      sceneParent.get(edge.sourceMermaidId) === edge.targetMermaidId ||
      sceneParent.get(edge.targetMermaidId) === edge.sourceMermaidId;
    if (generative || edgeFlags[index]?.crossEdges) edgeIndexes.add(index);
  });
  return edgeIndexes;
}

/**
 * Directional slice for the fan layout: the central node's own subtree plus its
 * single parent, using the anchor tree's parent relationships. `depth` controls
 * how deep the subtree reaches — `1` is children only, `2` adds grandchildren.
 * Sideways/upward branches (siblings, the parent's other neighbours) are pruned
 * — the scene contains exactly the nodes the fan layout positions.
 */
export function getMermaidFanSceneSlice(
  parsed: ParsedMermaidGraph,
  centralMermaidId: string,
  parentByMermaidId: Map<string, string>,
  depth: number,
  edgeFlags: EdgeSceneFlags[]
): MermaidSceneSlice {
  if (!parsed.nodes.some(node => node.mermaidId === centralMermaidId)) {
    throw new Error('Could not choose a central node.');
  }

  const childrenByParent = new Map<string, string[]>();
  for (const [child, parentId] of parentByMermaidId) {
    const list = childrenByParent.get(parentId) ?? [];
    list.push(child);
    childrenByParent.set(parentId, list);
  }

  const nodeIds = new Set<string>([centralMermaidId]);
  const parentId = parentByMermaidId.get(centralMermaidId);
  if (parentId) nodeIds.add(parentId);
  for (const child of childrenByParent.get(centralMermaidId) ?? []) {
    nodeIds.add(child);
    if (depth < 2) continue;
    for (const grandchild of childrenByParent.get(child) ?? []) {
      nodeIds.add(grandchild);
    }
  }

  const edgeIndexes = collectSceneEdgeIndexes(parsed, nodeIds, parentByMermaidId, edgeFlags);

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