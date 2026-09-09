/**
 * Context Builder
 * Builds situational system prompt from graph/scene state
 * Uses templates from config/prompts.ts
 */

import type { NodeId, SceneId, Node, Scene, Edge, EdgeType } from '../core/main-types';
import { graphStore } from '../storage/graph-store';
import { SYSTEM_PROMPT } from './prompts';
import { getSetting } from '../config';

/** The roster is the only unbounded list in the prompt, so it is the only one capped. */
const MAX_ROSTER_NODES = 200;
const MAX_ROSTER_COMMENT_CHARS = 200;

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
 * Build system prompt from scene context
 */
export function buildSystemPrompt(context: SceneContext): string {
  const { centralNodeId, sceneId, visibleNodeIds, selectedNodeIds } = context;

  const centralNode = graphStore.nodes.find(n => n.id === centralNodeId);
  if (!centralNode) {
    return SYSTEM_PROMPT.fallback;
  }

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

  const sections: string[] = [
    SYSTEM_PROMPT.role,
    SYSTEM_PROMPT.workspaceIntro,
    renderCentralNodeSection(centralNode),
    renderRelationshipTypesSection(),
    renderVisibleSceneSection(visibleNodes, centralNodeId, scene, sceneEdges, hiddenSceneEdges)
  ];

  if (selectedNodes.length > 0) {
    sections.push(renderSelectedNodesSection(selectedNodes, centralNodeId));
  }

  if (outsideConnections.length > 0) {
    sections.push(renderConnectedConceptsSection(outsideConnections));
  }

  sections.push(renderRestOfGraphSection(namedAbove));

  sections.push(SYSTEM_PROMPT.responseIntro);
  sections.push(SYSTEM_PROMPT.prose);
  sections.push(SYSTEM_PROMPT.actionSchema);
  sections.push(SYSTEM_PROMPT.equations);

  const lang = (getSetting('ai.responseLanguage') as string) ?? '';
  if (lang.trim()) {
    sections.push(`### Language\nAlways respond in ${lang.trim()}. Use ${lang.trim()} for node titles and concept names in your suggestions.`);
  }

  const custom = (getSetting('ai.customInstructions') as string) ?? '';
  if (custom.trim()) {
    sections.push(`### Custom Instructions\n${custom.trim()}`);
  }

  return sections.filter(section => section.length > 0).join('\n\n');
}

// ============================================================================
// SECTION RENDERERS
// ============================================================================

function renderCentralNodeSection(node: Node): string {
  const data: Record<string, string> = {
    title: node.title
  };

  if (node.tags && node.tags.length > 0) {
    data.tags = node.tags.join(', ');
  }

  if (node.properties) {
    if (node.properties.equation) {
      data.equation = String(node.properties.equation);
    }

    if (node.properties.comment) {
      data.comment = String(node.properties.comment);
    }

    const otherProps = Object.entries(node.properties)
      .filter(([key]) => key !== 'equation' && key !== 'comment')
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');

    if (otherProps) {
      data.properties = otherProps;
    }
  }

  return renderTemplate(SYSTEM_PROMPT.centralNodeTemplate, data);
}

function renderSelectedNodesSection(selectedNodes: Node[], centralNodeId: NodeId): string {
  return renderTemplate(SYSTEM_PROMPT.selectedNodesTemplate, {
    selectedNodes: selectedNodes
      .map(n => formatSelectedNodeDetail(n, centralNodeId))
      .join('\n\n')
  });
}

/**
 * Selected nodes are the subject of the Node quick action, so they are rendered
 * with their full authored content — title, tags, comment, equation, and any
 * other properties — instead of the one-line list form used elsewhere.
 */
function formatSelectedNodeDetail(node: Node, centralNodeId: NodeId): string {
  const lines: string[] = [`- **${node.title}**${node.id === centralNodeId ? ' (central node)' : ''}`];

  if (node.tags && node.tags.length > 0) {
    lines.push(`  - Tags: ${node.tags.join(', ')}`);
  }

  const comment = node.properties?.comment;
  if (typeof comment === 'string' && comment.trim()) {
    lines.push(`  - Comment: ${comment.trim()}`);
  }

  const equation = node.properties?.equation;
  if (equation) {
    lines.push(`  - Equation: ${String(equation)}`);
  }

  const otherProperties = Object.entries(node.properties ?? {})
    .filter(([key]) => key !== 'equation' && key !== 'comment')
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');

  if (otherProperties) {
    lines.push(`  - Other properties: ${otherProperties}`);
  }

  return lines.join('\n');
}

/**
 * The workspace's relationship vocabulary. The reading sentence uses the same
 * label the edge lines use, so a label the model meets on an edge can always be
 * traced back to a type here.
 */
function renderRelationshipTypesSection(): string {
  return renderTemplate(SYSTEM_PROMPT.relationshipTypesTemplate, {
    relationshipTypes: graphStore.edgeTypes.map(formatRelationshipType).join('\n')
  });
}

function formatRelationshipType(edgeType: EdgeType): string {
  const parts = [`- ${edgeType.name}:`];

  const description = edgeType.description?.trim();
  if (description) parts.push(description);

  const forward = forwardReading(edgeType);
  const inverse = edgeType.inverseLabel?.trim();
  parts.push(inverse
    ? `Reads "A ${forward} B"; from the other end, "B ${inverse} A".`
    : `Reads "A ${forward} B".`);

  return parts.join(' ');
}

function renderConnectedConceptsSection(connections: OutsideConnection[]): string {
  const lines = connections.map(({ edge, neighbour }) => {
    const details = nodeDetailParts(neighbour).join(' — ');
    return details
      ? `- ${formatEdgeArrow(edge)} (${details})`
      : `- ${formatEdgeArrow(edge)}`;
  });

  return renderTemplate(SYSTEM_PROMPT.connectedConceptsTemplate, {
    connections: lines.join('\n')
  });
}

function renderVisibleSceneSection(
  visibleNodes: Node[],
  centralNodeId: NodeId,
  scene: Scene | undefined,
  sceneEdges: Edge[],
  hiddenSceneEdges: Edge[]
): string {
  const data: Record<string, string> = {
    sceneContextStrength: calculateSceneContextStrength(visibleNodes, sceneEdges, centralNodeId)
  };

  if (scene?.description) {
    data.sceneDescription = scene.description;
  }

  if (visibleNodes.length > 0) {
    data.sceneConcepts = visibleNodes
      .map(n => formatNodeForPrompt(n, { centralNodeId }))
      .join('\n');
  }

  if (sceneEdges.length > 0) {
    data.sceneRelationships = sceneEdges.map(edge => `- ${formatEdgeArrow(edge)}`).join('\n');
  }

  if (hiddenSceneEdges.length > 0) {
    data.hiddenRelationships = hiddenSceneEdges.map(edge => `- ${formatEdgeArrow(edge)}`).join('\n');
  }

  return renderTemplate(SYSTEM_PROMPT.visibleSceneTemplate, data);
}

/** Empty when every node is already named above, in which case the section is dropped. */
function renderRestOfGraphSection(namedAbove: Set<NodeId>): string {
  const remaining = graphStore.nodes.filter(node => !namedAbove.has(node.id));
  if (remaining.length === 0) return '';

  const lines = remaining
    .slice(0, MAX_ROSTER_NODES)
    .map(node => formatNodeForPrompt(node, { maxCommentChars: MAX_ROSTER_COMMENT_CHARS }));

  const omitted = remaining.length - lines.length;
  if (omitted > 0) {
    lines.push(`- ...and ${omitted} further nodes not listed here.`);
  }

  return renderTemplate(SYSTEM_PROMPT.knowledgeGraphTemplate, { remaining: lines.join('\n') });
}

// ============================================================================
// TEMPLATE ENGINE
// ============================================================================

/**
 * Simple template renderer
 * Supports: {{key}}, {{#if key}}...{{/if}}
 */
function renderTemplate(template: string, data: Record<string, string>): string {
  let result = template;

  // Handle conditionals: {{#if key}}content{{/if}}
  result = result.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, content) => {
      return data[key] ? content : '';
    }
  );

  // Handle simple placeholders: {{key}}
  result = result.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => data[key] ?? ''
  );

  // Clean up multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
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
