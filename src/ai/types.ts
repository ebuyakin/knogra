/**
 * AI Module Types
 * Types for chat, conversations, and AI-proposed actions
 */

import type { EdgeTypeId, NodeId } from '../core/main-types';

// ============================================================================
// RELATIONSHIP SLOT
// ============================================================================

/** Direction relative to the central node, independent of any action's own wording. */
export type SlotDirection = 'central -> other' | 'other -> central';

/**
 * A user-chosen constraint on the relationship a Suggest or Connect request may
 * propose. Either axis can be left free.
 */
export interface RelationshipSlot {
  edgeTypeId?: EdgeTypeId;
  direction?: SlotDirection;
  /** The menu item's own text, shown in the chat timeline so two requests are distinguishable. */
  label: string;
  /**
   * The sentence spliced into the request. Built alongside the menu item the user
   * clicks, so what was picked and what the model is told are one string.
   */
  constraint: string;
}

// ============================================================================
// PROPOSED ACTIONS
// ============================================================================

/**
 * Which end of the edge the proposed node takes. Written by the model, so a value
 * outside the union is possible; `src/ai/edge-type-resolution.ts` is where that is
 * handled, not here.
 */
export type CreateConnectedDirection = 'new -> central' | 'central -> new';
export type IncludeExistingDirection = 'existing -> central' | 'central -> existing';

/** Include existing graph node in current scene */
export interface IncludeExistingAction {
  type: 'include_existing';
  title: string;  // Exact title from Knowledge Graph — resolved to nodeId at shelf level
  /** A relationship type name from the workspace vocabulary, or its forward label. */
  edgeType?: string;
  direction?: IncludeExistingDirection;
  reason: string;
}

/** Create new node as connection to central node */
export interface CreateConnectedAction {
  type: 'create_connected';
  title: string;
  /** A relationship type name from the workspace vocabulary, or its forward label. */
  edgeType?: string;
  direction?: CreateConnectedDirection;
  properties?: Record<string, string>;  // Can include equation, derivation, etc.
  reason: string;
}

/** Action types that can appear on the node shelf */
export type ShelfAction = CreateConnectedAction | IncludeExistingAction;

/**
 * The intent to put one shelf entry in one scene. Everything here varies by scene:
 * the same concept can be proposed in two scenes on different relationships and for
 * different reasons.
 */
export interface ShelfPlacement {
  centralNodeId: NodeId;
  /** A relationship type name or forward label, as the model wrote it. Resolved at use. */
  edgeType?: string;
  /**
   * As the model wrote it. The two action wordings ('new -> central', 'existing ->
   * central') resolve identically, so this survives an entry changing mode.
   */
  direction?: string;
  /** Why this concept belongs in this scene. Shown on the shelf, never stored on the node. */
  reason: string;
  /** Display order within a scene's shelf. */
  addedAt: number;
}

/**
 * A concept on the shelf, unique by title across the workspace. Holds only what is
 * true of the concept everywhere; per-scene intent lives in `placements`.
 */
export interface ShelfEntry {
  id: string;
  title: string;
  /** Includes `comment` and `equation`. Empty for an entry backed by a graph node. */
  properties: Record<string, string>;
  /**
   * Set once the concept exists in the graph. Create-versus-include is derived from
   * this rather than stored, so an entry can change mode without being rewritten.
   */
  nodeId?: NodeId;
  placements: ShelfPlacement[];
}

/** One shelf entry as the current scene renders it. */
export interface ShelfItem {
  entryId: string;
  title: string;
  /** The concept already exists in the graph: accepting includes rather than creates. */
  isExisting: boolean;
  /** The placement's justification for this scene. */
  reason: string;
  edgeType?: string;
  direction?: string;
  design: { id: string; params: Record<string, unknown> };
  themeId: string;
  /** Of the node when one backs the entry, of the entry otherwise. */
  properties: Record<string, string>;
}

/** Connect two nodes in scene */
export interface ConnectNodesAction {
  type: 'connect_nodes';
  sourceId: NodeId;
  targetId: NodeId;
  reason: string;
}

/** Update property on a node (including equations) */
export interface UpdatePropertyAction {
  type: 'update_property';
  nodeId: NodeId;
  propertyKey: string;  // 'equation', 'derivation', 'example', etc.
  propertyValue: string;
  reason: string;
}

/** Add tag to node */
export interface AddTagAction {
  type: 'add_tag';
  nodeId: NodeId;
  tag: string;
  reason: string;
}

/** Union of all proposed action types */
export type ProposedAction =
  | IncludeExistingAction
  | CreateConnectedAction
  | ConnectNodesAction
  | UpdatePropertyAction
  | AddTagAction;

// ============================================================================
// PROVIDER TYPES
// ============================================================================

/** Response from AI provider */
export interface AIResponse {
  content: string;
  rawContent?: string;
  actions: ProposedAction[];
}

/** Message format for provider API calls */
export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ============================================================================
// SUGGESTION PANEL
// ============================================================================

/** Organized suggestions by section */
export interface SuggestionPanel {
  includeExisting: IncludeExistingAction[];
  createConnected: CreateConnectedAction[];
  connectNodes: ConnectNodesAction[];
}
