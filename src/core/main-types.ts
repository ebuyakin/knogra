/**
 * Core type definitions for Knogra
 * Part of the Knogra type system.
 *
 * TYPE SYSTEM INDEX
 * =================
 * All type definitions are organized across these files:
 *
 * main-types.ts (this file)
 *   - Primitive IDs (NodeId, EdgeId, SceneId, ThemeId, etc.)
 *   - Data model (Node, Edge, Scene, Path)
 *   - Application state (GraphState)
 *
 * style-types.ts
 *   - Visual primitives (BackgroundStyleProps, TextStyleProps,
 *     BorderStyleProps, ShadowStyleProps, VignetteConfig, GradientConfig)
 *   - Composite styles (NodeStyle, EdgeStyle, ColorTheme)
 *   - Per-node overrides (ColorOverrides, VisualEffects)
 *   - Cytoscape style mapping (CytoscapeNodeStyle)
 *
 * design-types.ts
 *   - Design registry (NodeDesign, DesignConfigSchema, SchemaProperty)
 *   - Design-specific params (AreaColors)
 *
 * background-types.ts
 *   - Background image appearance (ImageVisualAppearance)
 *   - Selective color (SelectiveColorAdjustment, ColorRangeAdjustment)
 *   - Blend modes (BlendMode)
 *   - Opacity masks (GradientMask, MaskStop)
 *   - Scene placement (SceneBackgroundImage)
 *
 * store-types.ts
 *   - Storage interface (GraphStore)
 *
 * chat-types.ts
 *   - Chat persistence types (Conversation, ChatMessage, MessageId, MessageSource)
 *
 * Feature-local types: each module may define its own internal types.
 *   These are not listed here — they are not part of the shared type system.
 *
 * RULES:
 * - Before creating a new type, check this index
 * - Each file header references this index
 * - Visual/style types go in style-types.ts
 * - If unsure, add to this file and refactor later
 */

import type { SceneBackgroundImage } from './background-types';

// =============================================================================
// PRIMITIVE IDS
// =============================================================================

export type NodeId = string;
export type NodePropertyId = string;
export type EdgeId = string;
export type EdgePropertyId = string;
export type SceneId = string;
export type PathId = string;
export type ThemeId = string;
export type DesignId = string;
export type DesignParameterId = string;
export type BackgroundImageId = string;

// =============================================================================
// UI MODE (APP MODE)
// Controls whether the user can edit the graph or only navigate it
// =============================================================================

export type AppMode = 'view' | 'edit';

// =============================================================================
// AI
// =============================================================================

/** Supported AI provider identifiers */
export type ProviderType = 'gemini' | 'openrouter';

// =============================================================================
// DATA MODEL
// =============================================================================

export interface Node {
  id: NodeId;
  title: string;
  tags?: string[];
  properties?: Record<NodePropertyId, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  attachments?: Attachment[];
  aiArtifacts?: AIArtifact[];
  isAnchor?: boolean;  // Marks the root/starting node of the graph
}

export interface Edge {
  id: EdgeId;
  title: string;
  sourceId: NodeId;
  targetId: NodeId;
  tags: string[];
  properties: Record<EdgePropertyId, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** A node hidden by a fold operation, with its offset from the fold root */
export interface FoldedNodeEntry {
  id: NodeId;
  offset: { dx: number; dy: number };  // position relative to fold root at fold time
}

export interface Scene {
  id: SceneId;
  title: string;
  description?: string;
  centralNodeId: NodeId;
  nodes: Record<NodeId, {
    position: {x: number, y: number},
    scale: number,  // Scene-specific node size (1.0 = default)
    design: {id: DesignId, params: Record<DesignParameterId, unknown> }
  }>;
  edges: Record<EdgeId, {
    design: {id: DesignId, params: Record<DesignParameterId, unknown>},
    sourceEndpoint?: string,  // e.g., 'top', 'bottom', 'left', 'right'
    targetEndpoint?: string,
    controlPoints?: {x: number, y: number}[]  // For curved edges
  }>;
  backgroundImages?: SceneBackgroundImage[];  // Background images for memory palace
  themeId: ThemeId;
  viewport: {zoom: number, pan: {x: number, y: number}}
  /** Fold state: fold-root NodeId → array of hidden nodes with relative offsets */
  foldedNodes?: Record<NodeId, FoldedNodeEntry[]>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Saved navigation path
 * An ordered sequence of scenes that can be saved and loaded
 */
export interface Path {
  id: PathId;
  name: string;
  scenes: SceneId[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Simplified edge representation for graph analysis
 * Contains only source and target node IDs
 */
export interface EdgeConnection {
  source: NodeId;
  target: NodeId;
}

/**
 * Extended node information for node management UI
 * Computed from graph data, not stored
 */
export interface NodeInfo {
  node: Node;
  sceneCount: number;        // How many scenes include this node
  connectionCount: number;   // How many edges connect to this node
  hasOwnScene: boolean;      // Does a scene exist with this node as central
  isInCurrentScene: boolean; // Is node currently visible in Cytoscape
}

export interface BackgroundImage {
  id: BackgroundImageId;
  name: string;
  dataUri: string;  // base64 encoded image
  width: number;
  height: number;
  createdAt: Date;
}

// Placeholder types (to be defined later)
interface Attachment { }
interface AIArtifact { }

// =============================================================================
// RUNTIME STATE (APP STATE)
// In-memory graph data; not persisted directly (see storage/graph-store.ts)
// =============================================================================

export interface GraphState {
  nodes: Map<NodeId, Node>;
  edges: Map<EdgeId, Edge>;
  scenes: Map<SceneId, Scene>;
}
