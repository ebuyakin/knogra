/**
 * AI Module Types
 * Types for chat, conversations, and AI-proposed actions
 */

import type { NodeId } from '../core/main-types';

// ============================================================================
// PROPOSED ACTIONS
// ============================================================================

/** Include existing graph node in current scene */
export interface IncludeExistingAction {
  type: 'include_existing';
  title: string;  // Exact title from Knowledge Graph — resolved to nodeId at shelf level
  reason: string;
}

/** Create new node as connection to central node */
export interface CreateConnectedAction {
  type: 'create_connected';
  title: string;
  connectionType: 'child' | 'parent';
  properties?: Record<string, string>;  // Can include equation, derivation, etc.
  reason: string;
}

/** Action types that can appear on the node shelf */
export type ShelfAction = CreateConnectedAction | IncludeExistingAction;

/** Enriched shelf item ready for rendering */
export interface ShelfItem {
  action: ShelfAction;
  design: { id: string; params: Record<string, unknown> };
  themeId: string;
  /** Node properties for rendering (pre-populated for both action types) */
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
