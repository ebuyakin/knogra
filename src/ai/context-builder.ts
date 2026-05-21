/**
 * Context Builder
 * Builds situational system prompt from graph/scene state
 * Uses templates from config/prompts.ts
 */

import type { NodeId, SceneId, Node, Scene } from '../core/main-types';
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
  const { centralNodeId, sceneId, visibleNodeIds, navigationHistory, nodesWithChats } = context;

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

  // Build the prompt from sections
  const sections: string[] = [];

  // Role
  sections.push(SYSTEM_PROMPT.role);

  // Current situation
  sections.push(renderCurrentConceptSection(centralNode, scene));

  // Connected concepts
  if (parents.length > 0 || children.length > 0) {
    sections.push(renderConnectedConceptsSection(parents, children));
  }

  // Visible scene
  if (visibleNodes.length > 1) {
    sections.push(renderVisibleSceneSection(visibleNodes, centralNodeId));
  }

  // Full knowledge graph (for dedup and include_existing)
  sections.push(renderKnowledgeGraphSection(visibleNodeIds));

  // Learning journey
  if (navigationHistory.length > 1 || nodesWithChats.length > 0) {
    sections.push(renderLearningJourneySection(navigationHistory, nodesWithChats));
  }

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

function renderCurrentConceptSection(node: Node, scene: Scene | undefined): string {
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

  if (scene?.description) {
    data.sceneDescription = scene.description;
  }

  return renderTemplate(SYSTEM_PROMPT.currentConceptTemplate, data);
}

function renderConnectedConceptsSection(parents: Node[], children: Node[]): string {
  const data: Record<string, string> = {};

  if (parents.length > 0) {
    data.parents = parents.map(n => `- ${n.title}`).join('\n');
  }

  if (children.length > 0) {
    data.children = children.map(n => `- ${n.title}`).join('\n');
  }

  return renderTemplate(SYSTEM_PROMPT.connectedConceptsTemplate, data);
}

function renderVisibleSceneSection(visibleNodes: Node[], centralNodeId: NodeId): string {
  const nodeList = visibleNodes
    .filter(n => n.id !== centralNodeId)
    .map(n => {
      const tags = n.tags?.length ? ` [${n.tags.join(', ')}]` : '';
      return `- ${n.title}${tags}`;
    })
    .join('\n');

  return renderTemplate(SYSTEM_PROMPT.visibleSceneTemplate, { visibleNodes: nodeList });
}

function renderLearningJourneySection(
  navigationHistory: NodeId[],
  nodesWithChats: NodeId[]
): string {
  const data: Record<string, string> = {};

  if (navigationHistory.length > 1) {
    const recentHistory = navigationHistory.slice(-5);
    data.recentPath = recentHistory
      .map(id => graphStore.nodes.find(n => n.id === id)?.title ?? id)
      .join(' → ');
  }

  if (nodesWithChats.length > 0) {
    data.nodesWithChats = nodesWithChats
      .slice(0, 10)
      .map(id => graphStore.nodes.find(n => n.id === id)?.title ?? id)
      .join(', ');
  }

  return renderTemplate(SYSTEM_PROMPT.learningJourneyTemplate, data);
}

function renderKnowledgeGraphSection(visibleNodeIds: NodeId[]): string {
  const visibleSet = new Set(visibleNodeIds);
  const allNodes = graphStore.nodes;

  const formatNode = (n: Node): string => {
    const eq = n.properties?.equation;
    return eq ? `- ${n.title} (${eq})` : `- ${n.title}`;
  };

  const inScene = allNodes.filter(n => visibleSet.has(n.id)).map(formatNode);
  const notInScene = allNodes.filter(n => !visibleSet.has(n.id)).map(formatNode);

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
