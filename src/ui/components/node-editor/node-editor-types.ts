/**
 * Node Editor - shared types
 *
 * Public contract (context + callbacks) consumed by the keyboard handler and the
 * context menu, plus the per-tab value models the shell composes on save.
 */

import type { Node, NodeId, DesignId, SceneId } from '../../../core/main-types';

/**
 * Scene-specific context for the node being edited
 */
export interface NodeEditorContext {
  sceneId: SceneId;
  themeId: string;
  scale: number;
  position: { x: number; y: number };
  viewportPosition: { x: number; y: number };
  containerRect: DOMRect;
}

export type NodeEditorOnSave = (
  nodeId: NodeId,
  contentUpdates: Partial<Node>,
  designUpdates: { id: DesignId; params: Record<string, unknown> },
  scaleUpdate: number
) => void;

export interface NodeEditorEquationRequest {
  title: string;
  currentEquation: string;
  prompt: string;
}

export interface NodeEditorEquationResult {
  type: 'equation';
  latex: string;
}

export interface NodeEditorEquationClarification {
  type: 'clarification';
  message: string;
}

export type NodeEditorOnGenerateEquation = (
  request: NodeEditorEquationRequest
) => Promise<NodeEditorEquationResult | NodeEditorEquationClarification>;

/**
 * Checks whether a candidate title collides with another existing node.
 * Returns the conflicting node's id/title, or null when the title is unique.
 */
export type NodeEditorCheckTitleConflict = (
  title: string
) => { id: NodeId; title: string } | null;

// =============================================================================
// TAB MODEL
// =============================================================================

export const NODE_EDITOR_TAB_IDS = ['content', 'design', 'advanced', 'identity'] as const;
export type NodeEditorTabId = (typeof NODE_EDITOR_TAB_IDS)[number];

/**
 * A tab owns its DOM and reports its own values. `read()` returns `null` when the
 * tab's own validation fails — it has already told the user why, and the shell
 * aborts the save without composing anything.
 */
export interface EditorTab<TValues> {
  element: HTMLElement;
  read(): TValues | null;
}

export interface ContentTabValues {
  tags: string[];
  comment: string;
  equation: string;
}

export interface DefaultNodeLayoutValues {
  fontSize: number;
  minWidth: number;
  aspectRatio: number;
  fixedAspect: boolean;
}

export interface DesignTabValues {
  designId: DesignId;
  scale: number;
  /** Only the keys the user explicitly overrode; absent means "follow the theme". */
  colors: {
    text: string | undefined;
    background: string | undefined;
    backgroundAlt: string | undefined;
  };
  opacities: {
    text: number;
    background: number;
    backgroundAlt: number;
  };
  /** Present only when the selected design is `default-node`. */
  defaultNodeLayout: DefaultNodeLayoutValues | null;
}

export interface AdvancedTabValues {
  /** Node properties excluding `equation` and `comment`, which the Content tab owns. */
  properties: Record<string, unknown>;
  designParams: Record<string, unknown>;
}
