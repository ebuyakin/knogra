import type { Edge, EdgeId, EdgeType, EdgeTypeId, Node, NodeId, Scene, SceneId } from '../../core/main-types';
import type { ChatMessage, Conversation } from '../../core/chat-types';
import { getSetting } from '../../config';
import { getDefaultEdgeTypeId } from '../../config/edge-type-settings';
import type { ParsedMermaidGraph } from './flowchart';
import { layoutMermaidSceneNodes } from './layout';
import { computeFanScenePositions, toFanSceneNodes } from './layout/fan';
import type { Position } from './layout/shared';
import { normalizeEdgeTypeName, type MermaidImportSelection } from './import-dialog';
import { buildEdgeSceneFlags, normalizeMermaidEdgeLabel } from './edge-mapping';
import { getMermaidSceneSlice, getMermaidFanSceneSlice, computeAnchorParentMap } from './scene-slice';

export interface ImportedGraphData {
  nodes: Node[];
  edges: Edge[];
  edgeTypes: EdgeType[];
  scenes: Scene[];
  sceneId: SceneId;
  conversations: Conversation[];
}

interface ImportedEdgeRecord {
  sourceMermaidId: string;
  targetMermaidId: string;
  edge: Edge;
}

export function createImportedGraph(parsed: ParsedMermaidGraph, selection: MermaidImportSelection): ImportedGraphData {
  const now = new Date();
  const prefix = `mermaid-${Date.now().toString(36)}`;
  const idByMermaidId = new Map<string, NodeId>();
  const edgeTypeImportPlan = createEdgeTypeImportPlan(selection);

  // Degree over the raw graph (both endpoints of every edge), used for the
  // layout-independent branch/leaf tagging. Degree 1 → leaf, ≥2 → branch.
  const degreeByMermaidId = new Map<string, number>();
  if (selection.layoutParams.tagLeavesAndBranches) {
    for (const edge of parsed.edges) {
      degreeByMermaidId.set(edge.sourceMermaidId, (degreeByMermaidId.get(edge.sourceMermaidId) ?? 0) + 1);
      degreeByMermaidId.set(edge.targetMermaidId, (degreeByMermaidId.get(edge.targetMermaidId) ?? 0) + 1);
    }
  }

  const nodes = parsed.nodes.map((node, index): Node => {
    const id = `n-${prefix}-${index + 1}` as NodeId;
    const equation = selection.importEquations ? parsed.equationsByMermaidId.get(node.mermaidId)?.trim() : '';
    const comment = selection.importComments ? parsed.commentsByMermaidId.get(node.mermaidId)?.trim() : '';
    const tags = selection.importTags ? parsed.tagsByMermaidId.get(node.mermaidId) ?? [] : [];
    const nodeTags = [...tags];
    if (selection.layoutParams.tagLeavesAndBranches) {
      const degree = degreeByMermaidId.get(node.mermaidId) ?? 0;
      const degreeTag = degree === 1 ? 'leaf' : degree >= 2 ? 'branch' : null;
      if (degreeTag && !nodeTags.includes(degreeTag)) nodeTags.push(degreeTag);
    }
    idByMermaidId.set(node.mermaidId, id);
    return {
      id,
      title: node.title,
      tags: nodeTags,
      properties: {
        ...(equation ? { equation } : {}),
        ...(comment ? { comment } : {}),
      },
      createdAt: now,
      updatedAt: now,
      attachments: [],
      aiArtifacts: [],
      isAnchor: node.mermaidId === selection.anchorMermaidId,
    };
  });

  const edgeRecords = parsed.edges.map((edge, index): ImportedEdgeRecord => {
    const sourceId = idByMermaidId.get(edge.sourceMermaidId);
    const targetId = idByMermaidId.get(edge.targetMermaidId);
    if (!sourceId || !targetId) {
      throw new Error(`Edge ${edge.sourceMermaidId} → ${edge.targetMermaidId} references an unknown node.`);
    }
    const importedEdge: Edge = {
      id: `e-${prefix}-${index + 1}` as EdgeId,
      title: edge.title,
      sourceId,
      targetId,
      typeId: edgeTypeImportPlan.typeIdBySourceLabelKey.get(normalizeMermaidEdgeLabel(edge.title)) ?? getDefaultEdgeTypeId(),
      tags: [],
      properties: {},
      createdAt: now,
      updatedAt: now,
    };
    return {
      sourceMermaidId: edge.sourceMermaidId,
      targetMermaidId: edge.targetMermaidId,
      edge: importedEdge,
    };
  });

  const edges = edgeRecords.map(record => record.edge);

  // Per-edge scene-composition flags (directional inclusion + cross-links),
  // resolved from the per-label mappings. The anchor-rooted directed BFS over
  // these flags doubles as the fan parent tree and as the reachable set that
  // gates which nodes receive a generated scene on import (see
  // `docs/mermaid-fan-layout.md` §9).
  const edgeSceneFlags = buildEdgeSceneFlags(parsed.edges, selection.edgeLabelMappings);
  const anchorParentMap = computeAnchorParentMap(parsed, selection.anchorMermaidId, edgeSceneFlags);
  const reachableFromAnchor = new Set<string>([selection.anchorMermaidId, ...anchorParentMap.keys()]);

  const defaultDesignId = getSetting('node.defaultDesign');
  const equationDesignId = getSetting('node.equationDesign');

  // Fan layout only. `fanParentByMermaidId` is set once the anchor scene exists;
  // `resolveFanScenePositions` memoizes each scene's layout and recurses up to
  // the anchor, so every scene preserves its local neighbourhood from its
  // immediate parent scene (continuity chains at every level, not just depth 1).
  let fanParentByMermaidId: Map<string, string> | undefined;
  const fanScenePositions = new Map<string, Map<string, Position>>();
  const resolveFanScenePositions = (central: string): Map<string, Position> => {
    const cached = fanScenePositions.get(central);
    if (cached) return cached;
    const parentId = fanParentByMermaidId!.get(central);
    const parentPositions = parentId ? resolveFanScenePositions(parentId) : new Map<string, Position>();
    // Lay out only the nodes this scene actually shows (its sub-depth slice), so
    // the memoized positions that feed deeper scenes match what was displayed —
    // keeping the inherit-vs-fresh-fan decision consistent down the chain.
    const sliceNodeIds = getMermaidFanSceneSlice(parsed, central, fanParentByMermaidId!, selection.subSceneDepth, edgeSceneFlags, generatedSecondLevelThreshold).nodeIds;
    const sliceNodes = parsed.nodes.filter(node => sliceNodeIds.has(node.mermaidId));
    const positions = computeFanScenePositions(sliceNodes, central, {
      parentScenePositionsByMermaidId: parentPositions,
      parentByMermaidId: fanParentByMermaidId!,
    }, selection.layoutParams.fanNested);
    fanScenePositions.set(central, positions);
    return positions;
  };

  // Radial knobs for every non-fan-nested scene. Fan reuses radial at its top
  // level, so under fan mode that uses fan's *own* copy (`fanTop`), independent
  // of the standalone Radial layout's knobs.
  const radialParams = selection.layout === 'fan'
    ? selection.layoutParams.fanTop
    : selection.layoutParams.radial;

  // Second-level node budget for generated sub-scenes. Only meaningful at 2
  // levels; the anchor scene (explicit depth + all-levels) is never budgeted.
  const generatedSecondLevelThreshold = selection.subSceneDepth === 2
    ? selection.layoutParams.secondLevelThreshold
    : 0;

  const buildScene = (
    centralMermaidId: string,
    depth: number,
    allLevels: boolean,
    sceneId: SceneId,
    title: string,
    layoutMode: MermaidImportSelection['layout'],
    secondLevelThreshold: number
  ): Scene | null => {
    const sceneCentralNodeId = idByMermaidId.get(centralMermaidId);
    if (!sceneCentralNodeId) return null;

    const useFan = layoutMode === 'fan' && fanParentByMermaidId !== undefined;
    const slice = useFan
      ? getMermaidFanSceneSlice(parsed, centralMermaidId, fanParentByMermaidId!, depth, edgeSceneFlags, secondLevelThreshold)
      : getMermaidSceneSlice(parsed, centralMermaidId, depth, allLevels, edgeSceneFlags, secondLevelThreshold);
    if (slice.overLimit) return null;

    const sceneNodes = parsed.nodes.filter(node => slice.nodeIds.has(node.mermaidId));
    const sceneEdges = edgeRecords.filter((_record, index) => slice.edgeIndexes.has(index));
    const sceneMermaidEdges = parsed.edges.filter((_edge, index) => slice.edgeIndexes.has(index));
    const sceneNodeRecords = useFan
      ? toFanSceneNodes(sceneNodes, idByMermaidId, resolveFanScenePositions(centralMermaidId))
      : layoutMermaidSceneNodes(sceneNodes, sceneMermaidEdges, centralMermaidId, layoutMode, idByMermaidId, radialParams);

    for (const node of sceneNodes) {
      const nodeId = idByMermaidId.get(node.mermaidId);
      if (!nodeId) continue;

      const sceneNode = sceneNodeRecords[nodeId];
      if (!sceneNode) continue;

      const hasImportedEquation = selection.importEquations && Boolean(parsed.equationsByMermaidId.get(node.mermaidId)?.trim());
      sceneNode.design = {
        id: hasImportedEquation ? equationDesignId : defaultDesignId,
        params: hasImportedEquation && selection.layoutParams.equationScale !== 1
          ? { equationScale: selection.layoutParams.equationScale }
          : {},
      };
    }

    return {
      id: sceneId,
      title,
      description: `Imported from a Mermaid flowchart. Central: ${centralMermaidId}. Depth: ${depth}. Layout: ${layoutMode}.`,
      centralNodeId: sceneCentralNodeId,
      nodes: sceneNodeRecords,
      edges: Object.fromEntries(sceneEdges.map(record => [
        record.edge.id,
        { design: { id: 'default', params: {} } },
      ])),
      backgroundImages: [],
      themeId: 'dark',
      viewport: computeSceneFitViewport(sceneNodeRecords),
      foldedNodes: {},
      createdAt: now,
      updatedAt: now,
    };
  };

  const anchorSceneId = `scene-${prefix}` as SceneId;
  const anchorScene = buildScene(
    selection.anchorMermaidId,
    selection.depth,
    selection.allLevels,
    anchorSceneId,
    'Mermaid import',
    selection.layout === 'fan' ? 'radial' : selection.layout,
    0
  );
  if (!anchorScene) throw new Error('Could not choose a central node.');

  const scenes: Scene[] = [anchorScene];
  const titleByMermaidId = new Map(parsed.nodes.map(node => [node.mermaidId, node.title]));
  if (selection.layout === 'fan') {
    fanParentByMermaidId = anchorParentMap;
    fanScenePositions.set(selection.anchorMermaidId, extractScenePositions(anchorScene, idByMermaidId));
  }
  for (const centralMermaidId of selectSceneCentralIds(parsed, selection)) {
    if (centralMermaidId === selection.anchorMermaidId) continue;
    if (!reachableFromAnchor.has(centralMermaidId)) continue;
    const scene = buildScene(
      centralMermaidId,
      selection.subSceneDepth,
      false,
      `${anchorSceneId}-${centralMermaidId}` as SceneId,
      titleByMermaidId.get(centralMermaidId) ?? 'Mermaid scene',
      selection.layout,
      generatedSecondLevelThreshold
    );
    if (scene) scenes.push(scene);
  }

  const conversations: Conversation[] = [];
  if (selection.importNotes) {
    parsed.nodes.forEach((node, index) => {
      const nodeId = idByMermaidId.get(node.mermaidId);
      if (!nodeId) return;

      const noteText = parsed.notesByMermaidId.get(node.mermaidId)?.trim();
      const tutorialText = parsed.tutorialByMermaidId.get(node.mermaidId)?.trim();

      const messages: ChatMessage[] = [];
      let part = 0;
      for (const content of [noteText, tutorialText]) {
        if (!content) continue;
        messages.push({
          id: `msg-${Date.now().toString(36)}-${index}-${part++}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant',
          content,
          timestamp: now,
          source: 'tutorial',
        });
      }
      if (messages.length === 0) return;

      conversations.push({
        nodeId,
        messages,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  return { nodes, edges, edgeTypes: edgeTypeImportPlan.edgeTypes, scenes, sceneId: anchorSceneId, conversations };
}

function extractScenePositions(
  scene: Scene,
  idByMermaidId: Map<string, NodeId>
): Map<string, Position> {
  const mermaidIdByNodeId = new Map<NodeId, string>();
  for (const [mermaidId, nodeId] of idByMermaidId) {
    mermaidIdByNodeId.set(nodeId, mermaidId);
  }
  const positions = new Map<string, Position>();
  for (const [nodeId, record] of Object.entries(scene.nodes)) {
    const mermaidId = mermaidIdByNodeId.get(nodeId as NodeId);
    if (mermaidId) positions.set(mermaidId, record.position);
  }
  return positions;
}

function selectSceneCentralIds(parsed: ParsedMermaidGraph, selection: MermaidImportSelection): string[] {
  if (selection.sceneGeneration === 'anchor') return [];
  if (selection.sceneGeneration === 'all') return parsed.nodes.map(node => node.mermaidId);

  const degree = new Map<string, number>(parsed.nodes.map(node => [node.mermaidId, 0]));
  for (const edge of parsed.edges) {
    degree.set(edge.sourceMermaidId, (degree.get(edge.sourceMermaidId) ?? 0) + 1);
    degree.set(edge.targetMermaidId, (degree.get(edge.targetMermaidId) ?? 0) + 1);
  }
  return parsed.nodes.filter(node => (degree.get(node.mermaidId) ?? 0) >= 2).map(node => node.mermaidId);
}

function createEdgeTypeImportPlan(selection: MermaidImportSelection): {
  edgeTypes: EdgeType[];
  typeIdBySourceLabelKey: Map<string, EdgeTypeId>;
} {
  const now = new Date();
  const edgeTypes: EdgeType[] = [];
  const typeIdByNormalizedTypeName = new Map<string, EdgeTypeId>();
  const typeIdBySourceLabelKey = new Map<string, EdgeTypeId>();

  for (const mapping of selection.edgeLabelMappings) {
    const normalizedTypeName = normalizeEdgeTypeName(mapping.edgeTypeName) || 'related';
    const typeName = mapping.edgeTypeName.trim().replace(/\s+/g, ' ') || 'related';
    let typeId = typeIdByNormalizedTypeName.get(normalizedTypeName);

    if (!typeId) {
      typeId = normalizedTypeName === 'related'
        ? getDefaultEdgeTypeId()
        : createEdgeTypeId(typeName, typeIdByNormalizedTypeName);
      typeIdByNormalizedTypeName.set(normalizedTypeName, typeId);
      edgeTypes.push({
        id: typeId,
        name: typeName,
        thematicStyleSlotId: mapping.thematicStyleSlotId,
        createdAt: now,
        updatedAt: now,
      });
    }

    typeIdBySourceLabelKey.set(mapping.sourceLabelKey, typeId);
  }

  if (!typeIdByNormalizedTypeName.has('related')) {
    edgeTypes.unshift({
      id: getDefaultEdgeTypeId(),
      name: 'related',
      thematicStyleSlotId: 'edge-style-1',
      createdAt: now,
      updatedAt: now,
    });
  }

  return { edgeTypes, typeIdBySourceLabelKey };
}

function createEdgeTypeId(typeName: string, usedTypeNames: Map<string, EdgeTypeId>): EdgeTypeId {
  const base = typeName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'edge-type';
  let candidate = base;
  let suffix = 2;
  const usedIds = new Set(usedTypeNames.values());
  while (usedIds.has(candidate as EdgeTypeId)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate as EdgeTypeId;
}

/** Approximate half-extent (graph units) of a node, used to keep node bodies
 *  clear of the viewport edge when fitting. Nodes are laid out by centre. */
const NODE_FIT_MARGIN = 80;
/** Cap zoom-in so small scenes fill the screen without ballooning node sizes. */
const FIT_MAX_ZOOM = 1.5;

function getCyContainerSize(): { w: number; h: number } {
  const element = document.getElementById('cy');
  return {
    w: element?.clientWidth ?? window.innerWidth,
    h: element?.clientHeight ?? window.innerHeight,
  };
}

/**
 * Compute a fit-to-content viewport purely from the laid-out node positions and
 * the current container size — no Cytoscape instance required. Mirrors what
 * `cy.fit(padding)` does: focal point at the content centre, zoom sized so the
 * padded content fits the container. Zoom-in is capped by FIT_MAX_ZOOM.
 */
function computeSceneFitViewport(records: Scene['nodes']): Scene['viewport'] {
  const { w, h } = getCyContainerSize();
  const padding = getSetting('transition.openFitPadding');
  const entries = Object.values(records);

  if (entries.length === 0) {
    return { zoom: 1, pan: { x: w / 2, y: h / 2 }, focalPoint: { x: 0, y: 0 } };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const { position, scale } of entries) {
    const margin = NODE_FIT_MARGIN * (scale || 1);
    minX = Math.min(minX, position.x - margin);
    maxX = Math.max(maxX, position.x + margin);
    minY = Math.min(minY, position.y - margin);
    maxY = Math.max(maxY, position.y + margin);
  }

  const focalPoint = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const bboxW = Math.max(maxX - minX, 1);
  const bboxH = Math.max(maxY - minY, 1);
  const availW = Math.max(w - 2 * padding, 1);
  const availH = Math.max(h - 2 * padding, 1);
  const zoom = Math.min(availW / bboxW, availH / bboxH, FIT_MAX_ZOOM);
  const safeZoom = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  const pan = { x: w / 2 - focalPoint.x * safeZoom, y: h / 2 - focalPoint.y * safeZoom };

  return { zoom: safeZoom, pan, focalPoint };
}
