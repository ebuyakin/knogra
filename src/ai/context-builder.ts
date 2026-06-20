/**
 * Context Builder
 * Builds situational system prompt from graph/scene state
 * Uses templates from config/prompts.ts
 */

import type { NodeId, SceneId, Node, Scene, Edge } from '../core/main-types';
import { graphStore } from '../storage/graph-store';
import { SYSTEM_PROMPT } from './prompts';
import { getSetting } from '../config';

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

  // Get central node
  const centralNode = graphStore.nodes.find(n => n.id === centralNodeId);
  if (!centralNode) {
    return SYSTEM_PROMPT.fallback;
  }

  // Get scene
  const scene = graphStore.scenes.find(s => s.id === sceneId);

  // Get connected nodes (parents and children)
  const { parents, children } = getConnectedNodes(centralNodeId);

  // Get visible nodes details
  const visibleNodes = visibleNodeIds
    .map(id => graphStore.nodes.find(n => n.id === id))
    .filter((n): n is Node => n !== undefined);
  const sceneNodeIds = new Set(visibleNodeIds);
  const sceneEdges = getSceneEdges(scene, sceneNodeIds);
  const selectedNodes = selectedNodeIds
    .map(id => graphStore.nodes.find(n => n.id === id))
    .filter((n): n is Node => n !== undefined);

  // Build the prompt from sections
  const sections: string[] = [];

  // Role
  sections.push(SYSTEM_PROMPT.role);

  // Scene central node
  sections.push(renderCentralNodeSection(centralNode));

  // Runtime selection inside the scene
  if (selectedNodes.length > 0) {
    sections.push(renderSelectedNodesSection(selectedNodes, centralNodeId));
  }

  // Current scene
  sections.push(renderVisibleSceneSection(visibleNodes, centralNodeId, scene, sceneEdges));

  // Directly connected nodes
  if (parents.length > 0 || children.length > 0) {
    sections.push(renderConnectedConceptsSection(parents, children, sceneNodeIds));
  }

  // Full knowledge graph (for dedup and include_existing)
  sections.push(renderKnowledgeGraphSection(visibleNodeIds));

  // Action schema
  sections.push(SYSTEM_PROMPT.actionSchema);

  // Language instruction
  const lang = getSetting('ai.responseLanguage') as string;
  if (lang.trim()) {
    sections.push(`## Language\nAlways respond in ${lang.trim()}. Use ${lang.trim()} for node titles and concept names in your suggestions.`);
  }

  // Custom user instructions
  const custom = getSetting('ai.customInstructions') as string;
  if (custom.trim()) {
    sections.push(`## Custom Instructions\n${custom.trim()}`);
  }

  return sections.join('\n\n');
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

    const otherProps = Object.entries(node.properties)
      .filter(([key]) => key !== 'equation')
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
      .map(n => formatNodeForPrompt(n, { centralNodeId }))
      .join('\n')
  });
}

function renderConnectedConceptsSection(
  parents: Node[],
  children: Node[],
  sceneNodeIds: Set<NodeId>
): string {
  const data: Record<string, string> = {};

  if (parents.length > 0) {
    data.parents = parents.map(n => formatNodeForPrompt(n, { sceneNodeIds })).join('\n');
  }

  if (children.length > 0) {
    data.children = children.map(n => formatNodeForPrompt(n, { sceneNodeIds })).join('\n');
  }

  return renderTemplate(SYSTEM_PROMPT.connectedConceptsTemplate, data);
}

function renderVisibleSceneSection(
  visibleNodes: Node[],
  centralNodeId: NodeId,
  scene: Scene | undefined,
  sceneEdges: Edge[]
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
    data.sceneRelationships = sceneEdges
      .map(formatSceneRelationship)
      .join('\n');
  }

  return renderTemplate(SYSTEM_PROMPT.visibleSceneTemplate, data);
}

function renderKnowledgeGraphSection(visibleNodeIds: NodeId[]): string {
  const visibleSet = new Set(visibleNodeIds);
  const allNodes = graphStore.nodes;

  const inScene = allNodes.filter(n => visibleSet.has(n.id)).map(n => formatNodeForPrompt(n));
  const notInScene = allNodes.filter(n => !visibleSet.has(n.id)).map(n => formatNodeForPrompt(n));

  const data: Record<string, string> = {};
  if (inScene.length > 0) data.inScene = inScene.join('\n');
  if (notInScene.length > 0) data.notInScene = notInScene.slice(0, 200).join('\n');

  return renderTemplate(SYSTEM_PROMPT.knowledgeGraphTemplate, data);
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

/**
 * Get parent and child nodes for a given node
 */
function getConnectedNodes(nodeId: NodeId): { parents: Node[]; children: Node[] } {
  const parents: Node[] = [];
  const children: Node[] = [];
  
  for (const edge of graphStore.edges) {
    if (edge.sourceId === nodeId) {
      // This node is the source, so target is a child
      const child = graphStore.nodes.find(n => n.id === edge.targetId);
      if (child) children.push(child);
    } else if (edge.targetId === nodeId) {
      // This node is the target, so source is a parent
      const parent = graphStore.nodes.find(n => n.id === edge.sourceId);
      if (parent) parents.push(parent);
    }
  }
  
  return { parents, children };
}

function getSceneEdges(scene: Scene | undefined, sceneNodeIds: Set<NodeId>): Edge[] {
  if (!scene) return [];

  return Object.keys(scene.edges)
    .map(edgeId => graphStore.edges.find(edge => edge.id === edgeId))
    .filter((edge): edge is Edge =>
      edge !== undefined &&
      sceneNodeIds.has(edge.sourceId) &&
      sceneNodeIds.has(edge.targetId)
    );
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

function formatNodeForPrompt(
  node: Node,
  options: { centralNodeId?: NodeId; sceneNodeIds?: Set<NodeId> } = {}
): string {
  const details: string[] = [];

  if (options.centralNodeId === node.id) {
    details.push('central node');
  }

  if (options.sceneNodeIds) {
    details.push(options.sceneNodeIds.has(node.id) ? 'in current scene' : 'not in current scene');
  }

  const equation = node.properties?.equation;
  if (equation) {
    details.push(String(equation));
  }

  const suffix = details.length > 0 ? ` (${details.join('; ')})` : '';
  return `- ${node.title}${suffix}`;
}

function formatSceneRelationship(edge: Edge): string {
  const sourceTitle = graphStore.nodes.find(node => node.id === edge.sourceId)?.title ?? edge.sourceId;
  const targetTitle = graphStore.nodes.find(node => node.id === edge.targetId)?.title ?? edge.targetId;
  const title = edge.title.trim();
  return title
    ? `- ${sourceTitle} -> ${targetTitle}: ${title}`
    : `- ${sourceTitle} -> ${targetTitle}`;
}
