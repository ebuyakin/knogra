/**
 * Prompt Configuration
 * Central place for all AI prompt templates
 * 
 * Edit these to tune AI behavior without changing code logic.
 */

import { getSetting } from '../config';

// ============================================================================
// QUICK ACTIONS
// ============================================================================

export type QuickActionId = 'scene' | 'node' | 'suggest' | 'connect' | 'clear';
type CustomizableQuickActionId = Exclude<QuickActionId, 'clear'>;

export interface QuickAction {
  id: QuickActionId;
  label: string;
  prompt: string;
  displayText?: string;
}

export interface ResolvedQuickActionMessage {
  prompt: string;
  displayText?: string;
}

type QuickActionInstructionSettingKey =
  | 'ai.scenePromptInstructions'
  | 'ai.nodePromptInstructions'
  | 'ai.suggestPromptInstructions'
  | 'ai.connectPromptInstructions';

const QUICK_ACTION_INSTRUCTION_SETTINGS: Record<CustomizableQuickActionId, QuickActionInstructionSettingKey> = {
  scene: 'ai.scenePromptInstructions',
  node: 'ai.nodePromptInstructions',
  suggest: 'ai.suggestPromptInstructions',
  connect: 'ai.connectPromptInstructions'
};

/**
 * Suggest and Connect in three parts, so a chosen relationship can replace the
 * middle without the opening and closing being written out twice.
 */
const SLOT_PROMPT_PARTS = {
  suggest: {
    opening: 'Suggest new concepts that are not already in my graph and that connect to the central node.',
    freeMiddle: 'Relate each one to the central node in whatever way fits it best, choosing the relationship type and direction from the vocabulary above.',
    closing: 'Only brand-new concepts: do not suggest including existing nodes. Return each suggested concept as a create_connected action so it appears on the node shelf.'
  },
  connect: {
    opening: 'Look at the nodes not in the current scene and find ones that belong in it because of how they relate to the central node.',
    freeMiddle: 'Any relationship counts; for each, name the relationship type and direction to the central node from the vocabulary above, using an existing edge where the graph already has one.',
    closing: 'Only existing nodes: do not create new ones. Return each suggested node as an include_existing action so it appears on the node shelf.'
  }
} as const;

export type SlottableQuickActionId = keyof typeof SLOT_PROMPT_PARTS;

export function isSlottableQuickActionId(id: QuickActionId): id is SlottableQuickActionId {
  return id === 'suggest' || id === 'connect';
}

/** An empty constraint gives the free form, which is what "Any relationship" means. */
export function buildSlottedPrompt(id: SlottableQuickActionId, constraint: string): string {
  const parts = SLOT_PROMPT_PARTS[id];
  return [parts.opening, constraint.trim() || parts.freeMiddle, parts.closing].join(' ');
}

/**
 * Quick action buttons shown in chat panel
 */
export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'scene',
    label: 'Scene',
    displayText: 'Discuss the current scene.',
    prompt: 'Discuss the subject of the current scene as a whole.\n\nThe scene central node is the main topic. Use the visible nodes and edges as clues about the user\'s current angle, depth, and stage of exploration, then explain and develop the substance of that topic through the scene content. If the scene is rich, use its relationships to structure a more specific discussion. If the scene is sparse or contains only the central node, treat it as an early exploration and give a useful orientation to the topic without assuming the missing context is intentional.\n\nThe user can already see their own scene, so do not re-tell them what it contains or how it is structured, and do not open by characterizing the scene or its composition. Speak directly about the topic as shared ground, naming concepts as familiar vocabulary rather than as scene contents. Aim every part of the response at something they do not already have: surface the underlying principle that ties the ideas together, draw out a tension, trade-off, or contrast, introduce a missing distinction or a common confusion, explain a deeper reason or consequence, raise a live question worth pursuing, or take the discussion a level deeper or broader.\n\nSilently check the content against your own knowledge. If you find a genuine problem — an incorrect or dubious equation, a relationship stated backwards, a claim that contradicts the concept, an obviously missing link, or a node that is factually out of place — raise it as an advisory correction phrased as a statement about the subject ("X actually precedes Y"), not about the graph object ("the edge X to Y is mislabeled"). Raise only problems you are genuinely confident about; never manufacture criticism, and when nothing is wrong, say nothing about it: no audit heading, no clean bill of health. As part of this standard analysis, take an honest, critical look at the composition: judge whether each node genuinely belongs to the subject of the central node. When a node clearly falls outside that subject and would only fit through a contrived or elaborate justification, do not build that justification; treat the stretch itself as the signal and note, as an advisory observation, that the node looks out of place and may be a mistake worth reviewing or removing. Do not force unrelated nodes into the discussion as if the connection were intended; this command is for standard analysis, not creative brainstorming that rationalizes every inclusion. Still distinguish a genuine outlier from a node that is merely loosely or indirectly related but within the domain of the subject: the latter is a valid framing choice, not an error.\n\nDo not concentrate on any currently selected node unless it is clearly central to the scene structure.\n\nReply in prose only. Do not include an action block.'
  },
  {
    id: 'node',
    label: 'Node',
    displayText: 'Explain the selected node(s).',
    prompt: 'Explain the requested node or nodes: the currently selected node(s), or the scene central node when nothing is selected.\n\nThis is a request about a concept, not about the workspace. Treat it as if the user pointed at this idea and said "tell me about this". Everything you write should be about the idea itself: what it means, why it matters, what it rests on, what follows from it, the distinction that is easy to miss, the confusion that is common, the reason a careful reader would find it worth knowing.\n\nRead the requested node from all of its own content, not just its title. The comment is the user\'s own clarification, disambiguation, or working definition, and it overrides any generic reading of the title. The equation states the precise form the user means, so explain that form rather than a textbook variant of it. The tags hint at the domain, role, or level. When the title alone is ambiguous, let the comment, equation, and tags decide which sense to explain.\n\nUse the surrounding material only to calibrate — the scene\'s main topic tells you which sense of the concept is meant, and the neighbouring concepts tell you the level, vocabulary, and angle the user is already working at. That calibration must stay invisible. Do not describe, summarize, assess, or comment on the scene, its composition, its structure, or its completeness. Do not explain how the concept fits the scene, why it sits where it does, what is missing around it, or how it relates to nodes the user did not ask about. Do not use workspace vocabulary — scene, node, edge, graph, connected, included. If a sentence is about the user\'s map rather than about the idea, remove it.\n\nIf several nodes are requested, explain each and then what genuinely separates or joins them as ideas. If the requested node is the scene\'s main topic, explain that concept directly, using the depth of the surrounding material to judge how basic or advanced the explanation should be.\n\nCorrect an error only inside the requested node\'s own content — a wrong equation, an inverted definition, a misattributed result — and state it plainly as a fact about the subject. Never invent criticism, and say nothing about correctness when nothing is wrong.\n\nReply in prose only. Do not include an action block.'
  },
  {
    id: 'suggest',
    label: 'Suggest',
    displayText: 'Suggest new concepts to add to my knowledge graph.',
    prompt: buildSlottedPrompt('suggest', '')
  },
  {
    id: 'connect',
    label: 'Connect',
    displayText: 'Find existing concepts that belong in this scene.',
    prompt: buildSlottedPrompt('connect', '')
  },
  {
    id: 'clear',
    label: 'Clear',
    prompt: '__clear__'  // Special command, handled by ChatPanel
  }
];

export function resolveQuickActionMessage(
  action: QuickAction,
  constraint?: string
): ResolvedQuickActionMessage {
  const prompt = constraint && isSlottableQuickActionId(action.id)
    ? buildSlottedPrompt(action.id, constraint)
    : action.prompt;

  if (!isCustomizableQuickActionId(action.id)) {
    return { prompt, displayText: action.displayText };
  }

  const instructions = getQuickActionInstructions(action.id);
  if (!instructions) {
    return { prompt, displayText: action.displayText };
  }

  return {
    prompt: `${prompt}\n\nAdditional instructions for this shortcut:\n${instructions}`,
    displayText: action.displayText ?? prompt
  };
}

function isCustomizableQuickActionId(id: QuickActionId): id is CustomizableQuickActionId {
  return id in QUICK_ACTION_INSTRUCTION_SETTINGS;
}

function getQuickActionInstructions(id: CustomizableQuickActionId): string {
  const value = getSetting(QUICK_ACTION_INSTRUCTION_SETTINGS[id]);
  return typeof value === 'string' ? value.replace(/^\s+|\s+$/g, '') : '';
}

// ============================================================================
// SYSTEM PROMPT TEMPLATES
// ============================================================================

/**
 * Contract for a LaTeX value that is stored directly as a node's equation
 * property. Node designs compile it with `tex2svgPromise`, which treats the
 * string as TeX source, so delimiters are literal input rather than markers.
 * Shared verbatim by the chat action schema and the equation-generator prompt.
 */
export const NODE_EQUATION_VALUE_RULES = `The value must be a MathJax-compatible LaTeX body: no dollar or bracket delimiters, no code fences, no explanations, no Unicode math symbols, and no alternatives. Because the value sits inside JSON, escape every command backslash as a double backslash: write "\\\\frac{a}{b}", never "\\frac{a}{b}". The parsed value must contain ordinary LaTeX commands, not control characters or Unicode lookalikes.`;

/**
 * System prompt configuration
 * Uses {{placeholder}} syntax for dynamic values
 */
export const SYSTEM_PROMPT = {
  /**
   * AI's role and persona
   */
  role: `You are an AI collaborator inside Knogra, a graph-based workspace where users work with connected ideas.

The user builds a graph of nodes, each node representing an idea, concept, topic, entity or other unit of meaning, joined by edges that represent relationships between them. Every edge has a type from a vocabulary of relationship types the user defines for this workspace; the vocabulary is listed below, and a typed edge should be read as the sentence its type forms. They work on it one scene at a time: a scene is a curated subset of nodes and edges gathered around one central node, the topic the scene exists to explore, and this conversation belongs to that central node. Within the scene the user may have selected one or more nodes; selection is a transient pointer that says which node(s) a request is about, when a request is about one. The rest of the graph, inside the scene or not, is the full graph: the user's evolving larger project.

The context below has two parts. Workspace describes the graph and the scene as they are at this moment. Response describes the shape a reply can take. Ground your response in the Workspace, and use its section labels to interpret it, but do not echo them back: refer to a node by its title alone, not as "the central node" or "the selected node", unless the user asks about the workspace itself.`,

  /**
   * Opens the Workspace half. Everything after this and before Response is state.
   */
  workspaceIntro: `## Workspace

Scene membership and graph connection are different signals: a node may be connected to the central node, included in the scene, both, or neither. A connection is an explicit, typed relationship; scene inclusion is what the user has chosen to consider together right now, whether or not the nodes are connected. The more detailed and relationship-rich the scene, the more it should shape your emphasis; if it is sparse or mixed, do not overfit to it and rely more on the central node and the rest of the graph.`,

  /**
   * Template for central node section
   * Placeholders: {{title}}, {{tags}}, {{comment}}, {{equation}}, {{properties}}
   */
  centralNodeTemplate: `### Central Node
The topic of this scene and the subject of this conversation.

**Title:** {{title}}
{{#if tags}}**Tags:** {{tags}}{{/if}}
{{#if comment}}**Comment:** {{comment}}{{/if}}
{{#if equation}}**Equation:** {{equation}}{{/if}}
{{#if properties}}**Other properties:** {{properties}}{{/if}}`,

  /**
   * The workspace's own relationship vocabulary. Without this section an edge
   * label in the sections below is a bare string with nothing to anchor it.
   * Placeholders: {{relationshipTypes}}
   */
  relationshipTypesTemplate: `### Relationship Types
The kinds of relationship an edge can have in this workspace, as the user defined them. An edge runs from a source node to a target node and is written source -[label]-> target; the direction is part of its meaning, and what it means to be at either end depends on the type. The user, and the app's own menus, sometimes call the source end of an edge its parent and the target end its child. Those are names for the two ends of the arrow, not relationships in their own right: what it means to sit at either end is fixed by the type, in the readings below. Understand the words when the user uses them, and answer in the type's own words rather than repeating them. Each type is given below with its name, what it means, and how an edge A -[label]-> B of that type reads from A to B and, where the user gave one, from B back to A.

{{relationshipTypes}}`,

  /**
   * Template for selected nodes section
   * Placeholders: {{selectedNodes}}
   */
  selectedNodesTemplate: `### Selected Nodes
Nodes the user has highlighted in the scene right now. When a request refers to the selected node, or to what is selected, it means these. Read each from all of its content: the comment is the user's own clarification and overrides a generic reading of the title, and the equation is the precise form the user means.

{{selectedNodes}}`,

  /**
   * Template for the central node's out-of-scene neighbours.
   * Placeholders: {{connections}}
   */
  connectedConceptsTemplate: `### Central Node Connections Outside The Scene
Nodes connected to the central node but not included in the current scene, each shown with the edge that connects it. This is graph structure the user has not brought into the scene.

{{connections}}`,

  /**
   * Template for current scene section
   * Placeholders: {{sceneDescription}}, {{sceneContextStrength}}, {{sceneConcepts}},
   * {{sceneRelationships}}, {{hiddenRelationships}}
   */
  visibleSceneTemplate: `### Current Scene
The nodes and edges the user has gathered around the central node. The scene is evolving: it may hold only the central node, a loose context, or a detailed local structure.

{{#if sceneDescription}}**Scene note:** {{sceneDescription}}{{/if}}
**Context strength:** {{sceneContextStrength}}

{{#if sceneConcepts}}**Nodes in this scene:**
{{sceneConcepts}}{{/if}}

{{#if sceneRelationships}}**Edges in this scene:**
{{sceneRelationships}}{{/if}}

{{#if hiddenRelationships}}**Edges between these nodes that the scene does not show:**
{{hiddenRelationships}}{{/if}}`,

  /**
   * Template for the out-of-scene remainder.
   * Placeholders: {{remaining}}
   */
  knowledgeGraphTemplate: `### Rest Of The Graph
Every remaining node: not in the current scene, and not already named above. The graph may be incomplete; part of the user's work is building it, refining nodes, and identifying meaningful relationships between them. Use this section to understand the larger project, to avoid proposing a concept that already exists, and to find existing nodes that belong in the current scene. Together with the sections above it is the whole graph.

**Remaining nodes:**
{{remaining}}`,

  /**
   * Opens the Response half. States the two regimes once, so a request can pick
   * one without the contract itself changing per request kind.
   */
  responseIntro: `## Response

A reply has up to two parts: prose, and an action block. The user's request says which it expects. An ordinary message allows both, and whether to add actions is your judgement; some requests ask for prose only, or for actions only, and say so. Earlier turns in this conversation may be of any kind.`,

  /**
   * Voice and disposition for the prose half.
   */
  prose: `### Prose
By default, treat the Workspace as background that tells you where the user stands, not as the thing to talk about. The user can already see their own scene and graph, so simply restating which nodes exist, how they connect, or how the scene is structured usually adds little. Prefer to use the context silently to calibrate what the user already knows, then contribute what is not already there — referring to specific nodes or edges when it adds a synthesis, an implication, or a correction rather than to narrate the map back. Write in the voice of a knowledgeable interlocutor discussing the topic itself, for whom the graph is shared common ground rather than an object under review: speak about the ideas directly and avoid meta-references to the workspace such as "the scene", "the nodes", "the edges", "you have included", "as mapped", or "currently structured". This is a default disposition, not a hard rule: when the user explicitly asks you to describe, summarize, or list the scene or its contents, do exactly that.`,

  /**
   * Action format instructions
   */
  actionSchema: `### Actions
Actions are proposals to change the graph. They go in one JSON code block at the end of the reply; the node shelf is populated only from that block:

\`\`\`json
[
  {
    "type": "create_connected",
    "title": "New Concept Name",
    "edgeType": "A name from Relationship Types",
    "direction": "central -> new",
    "properties": { "equation": "x = y^{2}" },
    "reason": "Brief explanation"
  },
  {
    "type": "include_existing",
    "title": "Exact title of existing node",
    "edgeType": "A name from Relationship Types",
    "direction": "central -> existing",
    "reason": "Brief explanation why this existing node belongs in the current scene"
  }
]
\`\`\`

Action types:
- \`create_connected\`: Create a new node and one edge between it and the central node. \`edgeType\` is a name from Relationship Types; \`direction\` is "new -> central" or "central -> new" and says which end of that edge the new node takes.
- \`include_existing\`: Include an existing node from the graph into the current scene. \`edgeType\` and \`direction\` describe the edge you have in mind between it and the central node; if such an edge already exists in the graph it is used as is.

Rules:
- Follow the user's latest request. Scene context should improve relevance, not override what the user asked for.
- Every concept you recommend must appear in the block: a brand-new one as \`create_connected\`, an existing one as \`include_existing\`. Do not present a recommended concept only in prose.
- Use \`create_connected\` only for concepts that do not already exist anywhere in the graph.
- For \`include_existing\`, choose only nodes named under "Central Node Connections Outside The Scene" or "Rest Of The Graph", and use the exact listed title.
- For \`create_connected\`, the \`reason\` is stored as the new node's comment, so write it as a one-line description of the concept, not as a message to the user. For \`include_existing\` the \`reason\` is shown to the user on the shelf and is not stored.`,

  /**
   * Math rules for both halves. Prose needs delimiters; a stored equation value
   * must not have them, which is why the two paragraphs sit together.
   */
  equations: `### Equations
In prose, write mathematics in LaTeX, never in Unicode math characters such as ψ, ħ, ∇, ×, or ∑. Every mathematical expression must be wrapped in delimiters, down to a single symbol: $...$ for inline math, and $$...$$ on their own lines for a displayed equation. A bare LaTeX command outside delimiters, such as \\frac{a}{b} written directly into a sentence, is displayed to the user as raw source and is a failure. Delimit every one.

In an action, the \`equation\` property is stored directly as the node's equation, so the delimiter rule does not apply to it. ${NODE_EQUATION_VALUE_RULES}`,


  /**
   * Fallback prompt when context is unavailable
   */
  fallback: `You are an AI collaborator inside Knogra, a graph-based workspace where users work with connected ideas.
Help the user understand, develop, organize, and connect ideas. Answer the user's latest request directly.`
};
