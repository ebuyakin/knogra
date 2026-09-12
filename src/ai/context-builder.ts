/**
 * Context Builder
 *
 * Reads the graph, the scene, the shelf and the settings, and fills the system
 * prompt's data record; prompts.ts renders it from prompts/system-prompt.md and
 * the files it includes. Every sentence is in those files. This module produces
 * values only: titles, one-line lists, counts, and the flags that decide which
 * sections exist.
 */

import type { NodeId, SceneId, Node, Scene, Edge, EdgeType } from '../core/main-types';
import type { ShelfEntry, ShelfPlacement } from './types';
import { graphStore } from '../storage/graph-store';
import { getPendingElsewhere, getScenePlacements } from './shelf/shelf-store';
import { renderSystemPrompt, type RelationshipTypeLine } from './prompts';
import { getSetting } from '../config';

/** The roster is the only unbounded list in the prompt, so it is the only one capped. */
const MAX_ROSTER_NODES = 200;
const MAX_ROSTER_COMMENT_CHARS = 200;

/** The shelf is unbounded too; this scene's own list is bounded by what fits on screen. */
const MAX_SHELF_ELSEWHERE = 50;

// ============================================================================
// TYPES
// ============================================================================

/** Context about the current scene/situation */
export interface SceneContext {
  /** Current central node ID */
  centralNodeId: NodeId;
  /** Current scene ID */
  sceneId: SceneId;
  /** IDs of nodes visible in the scene */
  visibleNodeIds: NodeId[];
  /** IDs of nodes selected in the current scene */
  selectedNodeIds: NodeId[];
  /** Recent navigation history (node IDs) */
  navigationHistory: NodeId[];
  /** IDs of nodes that have ongoing conversations */
  nodesWithChats: NodeId[];
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * The system prompt for the current scene, or null when the central node is not
 * in the graph — a session still loaded for a node deleted underneath it. Nothing
 * should be sent in that case; the caller refuses rather than degrading.
 */
export function buildSystemPrompt(context: SceneContext): string | null {
  const { centralNodeId, sceneId, visibleNodeIds, selectedNodeIds } = context;

  const centralNode = graphStore.nodes.find(n => n.id === centralNodeId);
  if (!centralNode) return null;

  const scene = graphStore.scenes.find(s => s.id === sceneId);
  const sceneNodeIds = new Set(visibleNodeIds);

  const visibleNodes = visibleNodeIds
    .map(id => graphStore.nodes.find(n => n.id === id))
    .filter((n): n is Node => n !== undefined);
  const selectedNodes = selectedNodeIds
    .map(id => graphStore.nodes.find(n => n.id === id))
    .filter((n): n is Node => n !== undefined);

  const { sceneEdges, hiddenSceneEdges } = splitInSceneEdges(scene, sceneNodeIds);
  const outsideConnections = getOutsideConnections(centralNodeId, sceneNodeIds);

  // The roster is the remainder, so anything already shown in full above is excluded.
  const namedAbove = new Set<NodeId>(sceneNodeIds);
  outsideConnections.forEach(connection => namedAbove.add(connection.neighbour.id));
  const remaining = graphStore.nodes.filter(node => !namedAbove.has(node.id));
  const roster = remaining.slice(0, MAX_ROSTER_NODES);

  const shelfHere = getScenePlacements(centralNodeId);
  const shelfElsewhere = getPendingElsewhere(centralNodeId);
  const shelfElsewhereListed = shelfElsewhere.slice(0, MAX_SHELF_ELSEWHERE);

  return renderSystemPrompt({
    centralTitle: centralNode.title,
    centralTags: centralNode.tags && centralNode.tags.length > 0 ? centralNode.tags.join(', ') : undefined,
    centralComment: stringProperty(centralNode, 'comment'),
    centralEquation: stringProperty(centralNode, 'equation'),
    centralProperties: otherProperties(centralNode) || undefined,
    relationshipTypes: graphStore.edgeTypes.map(relationshipTypeLine),
    sceneDescription: scene?.description || undefined,
    sceneContextStrength: calculateSceneContextStrength(visibleNodes, sceneEdges, centralNodeId),
    sceneNodes: lines(visibleNodes.map(node => formatNodeForPrompt(node, { centralNodeId }))),
    sceneEdges: lines(sceneEdges.map(edge => `- ${formatEdgeArrow(edge)}`)),
    hiddenEdges: lines(hiddenSceneEdges.map(edge => `- ${formatEdgeArrow(edge)}`)),
    selectedNodes: selectedNodes.map(node => formatSelectedNodeDetail(node, centralNodeId)).join('\n\n'),
    outsideConnections: lines(outsideConnections.map(formatOutsideConnection)),
    remainingNodes: lines(roster.map(node => formatNodeForPrompt(node, { maxCommentChars: MAX_ROSTER_COMMENT_CHARS }))),
    omittedNodeCount: remaining.length - roster.length,
    shelf: shelfHere.length > 0 || shelfElsewhere.length > 0,
    sceneShelf: lines(shelfHere.map(formatScenePlacement)),
    otherShelf: lines(shelfElsewhereListed.map(formatPendingEntry)),
    omittedShelfCount: shelfElsewhere.length - shelfElsewhereListed.length,
    language: settingText('ai.responseLanguage'),
    customInstructions: settingText('ai.customInstructions')
  });
}

// ============================================================================
// VALUES
// ============================================================================

function lines(items: string[]): string {
  return items.join('\n');
}

function settingText(key: 'ai.responseLanguage' | 'ai.customInstructions'): string {
  const value = getSetting(key);
  return typeof value === 'string' ? value.trim() : '';
}

function stringProperty(node: Node, key: 'comment' | 'equation'): string | undefined {
  const value = node.properties?.[key];
  return value ? String(value) : undefined;
}

function otherProperties(node: Node): string {
  return Object.entries(node.properties ?? {})
    .filter(([key]) => key !== 'equation' && key !== 'comment')
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

/**
 * The reading sentence uses the same label the edge lines use, so a label the
 * model meets on an edge can always be traced back to a type here.
 */
function relationshipTypeLine(edgeType: EdgeType): RelationshipTypeLine {
  return {
    name: edgeType.name,
    description: edgeType.description?.trim() || undefined,
    forwardLabel: forwardReading(edgeType),
    inverseLabel: edgeType.inverseLabel?.trim() || undefined
  };
}

/**
 * Selected nodes are the subject of the Node quick action, so they are rendered
 * with their full authored content — title, tags, comment, equation, and any
 * other properties — instead of the one-line list form used elsewhere.
 */
function formatSelectedNodeDetail(node: Node, centralNodeId: NodeId): string {
  const detail: string[] = [`- **${node.title}**${node.id === centralNodeId ? ' (central node)' : ''}`];

  if (node.tags && node.tags.length > 0) {
    detail.push(`  - Tags: ${node.tags.join(', ')}`);
  }

  const comment = node.properties?.comment;
  if (typeof comment === 'string' && comment.trim()) {
    detail.push(`  - Comment: ${comment.trim()}`);
  }

  const equation = node.properties?.equation;
  if (equation) {
    detail.push(`  - Equation: ${String(equation)}`);
  }

  const other = otherProperties(node);
  if (other) {
    detail.push(`  - Other properties: ${other}`);
  }

  return detail.join('\n');
}

function formatOutsideConnection({ edge, neighbour }: OutsideConnection): string {
  const details = nodeDetailParts(neighbour).join(' — ');
  return details
    ? `- ${formatEdgeArrow(edge)} (${details})`
    : `- ${formatEdgeArrow(edge)}`;
}

function formatScenePlacement({ entry, placement }: { entry: ShelfEntry; placement: ShelfPlacement }): string {
  const existing = entry.nodeId ? ' (already in the graph)' : '';
  const reason = placement.reason.trim();
  return `- ${entry.title}${existing}${reason ? ` — ${reason}` : ''}`;
}

function formatPendingEntry(entry: ShelfEntry): string {
  const comment = entry.properties.comment?.trim();
  return `- ${entry.title}${comment ? ` — ${comment}` : ''}`;
}

// ============================================================================
// HELPERS
// ============================================================================

/** An edge on the central node whose other end the scene does not contain. */
interface OutsideConnection {
  edge: Edge;
  neighbour: Node;
}

function getOutsideConnections(centralNodeId: NodeId, sceneNodeIds: Set<NodeId>): OutsideConnection[] {
  const connections: OutsideConnection[] = [];

  for (const edge of graphStore.edges) {
    const neighbourId = edge.sourceId === centralNodeId ? edge.targetId
      : edge.targetId === centralNodeId ? edge.sourceId
      : undefined;
    if (!neighbourId || sceneNodeIds.has(neighbourId)) continue;

    const neighbour = graphStore.nodes.find(node => node.id === neighbourId);
    if (neighbour) connections.push({ edge, neighbour });
  }

  return connections;
}

/**
 * Scene edge membership is its own list, so an edge can join two scene nodes and
 * still not be part of the scene. Both halves reach the model: the second says so.
 */
function splitInSceneEdges(
  scene: Scene | undefined,
  sceneNodeIds: Set<NodeId>
): { sceneEdges: Edge[]; hiddenSceneEdges: Edge[] } {
  const bothEndsInScene = graphStore.edges.filter(
    edge => sceneNodeIds.has(edge.sourceId) && sceneNodeIds.has(edge.targetId)
  );
  const includedEdgeIds = new Set(Object.keys(scene?.edges ?? {}));

  return {
    sceneEdges: bothEndsInScene.filter(edge => includedEdgeIds.has(edge.id)),
    hiddenSceneEdges: bothEndsInScene.filter(edge => !includedEdgeIds.has(edge.id))
  };
}

/** Falls back to the type name, then to a neutral verb, so an edge always reads. */
function forwardReading(edgeType: EdgeType | undefined): string {
  return edgeType?.forwardLabel?.trim() || edgeType?.name.trim() || 'relates to';
}

function formatEdgeArrow(edge: Edge): string {
  const edgeType = graphStore.edgeTypes.find(type => type.id === edge.typeId);
  const source = graphStore.nodes.find(node => node.id === edge.sourceId)?.title ?? edge.sourceId;
  const target = graphStore.nodes.find(node => node.id === edge.targetId)?.title ?? edge.targetId;
  const note = edge.title.trim() ? ` — note: ${edge.title.trim()}` : '';

  return `${source} -[${forwardReading(edgeType)}]-> ${target}${note}`;
}

function calculateSceneContextStrength(
  sceneNodes: Node[],
  sceneEdges: Edge[],
  centralNodeId: NodeId
): string {
  const nonCentralNodeCount = sceneNodes.filter(node => node.id !== centralNodeId).length;
  if (nonCentralNodeCount === 0) {
    return 'weak (central node only)';
  }

  if (sceneEdges.length === 0) {
    return nonCentralNodeCount <= 2
      ? 'weak (sparse scene, no scene edges)'
      : 'moderate (nodes present, no scene edges)';
  }

  const centralEdgeCount = sceneEdges.filter(edge =>
    edge.sourceId === centralNodeId || edge.targetId === centralNodeId
  ).length;

  if (nonCentralNodeCount >= 4 && sceneEdges.length >= 3 && centralEdgeCount >= 2) {
    return 'strong (detailed, relationship-rich scene)';
  }

  if (nonCentralNodeCount >= 2 && sceneEdges.length >= 1) {
    return 'moderate (some local scene structure)';
  }

  return 'weak (limited scene structure)';
}

/**
 * One line format for every node list. The central node is skipped because its
 * own section already carries the same content in full.
 */
function formatNodeForPrompt(
  node: Node,
  options: { centralNodeId?: NodeId; maxCommentChars?: number } = {}
): string {
  const isCentral = options.centralNodeId === node.id;
  const marker = isCentral ? ' (central node)' : '';
  const details = isCentral ? [] : nodeDetailParts(node, options.maxCommentChars);

  return details.length > 0
    ? `- ${node.title}${marker} — ${details.join(' — ')}`
    : `- ${node.title}${marker}`;
}

function nodeDetailParts(node: Node, maxCommentChars?: number): string[] {
  const parts: string[] = [];

  if (node.tags && node.tags.length > 0) {
    parts.push(`tags: ${node.tags.join(', ')}`);
  }

  const equation = node.properties?.equation;
  if (equation) {
    parts.push(`equation: ${String(equation)}`);
  }

  const comment = node.properties?.comment;
  if (typeof comment === 'string' && comment.trim()) {
    parts.push(`comment: ${truncateComment(comment.trim(), maxCommentChars)}`);
  }

  return parts;
}

function truncateComment(comment: string, maxChars?: number): string {
  if (!maxChars || comment.length <= maxChars) return comment;
  return `${comment.slice(0, maxChars).trimEnd()}…`;
}
