/**
 * Node Editor - shared types
 *
 * Public contract (context + callbacks) consumed by the keyboard handler and the
 * context menu, plus the per-tab value models the shell composes on save.
 */

import type { Node, NodeId, DesignId, SceneId, NodeImageId } from '../../../core/main-types';
import type {
  NodeImage,
  NodeImagePalette,
  NodeImagePreset,
  NodeImageStyleReference
} from '../../../core/node-image-types';
import type { NodeImageCorrection } from '../../../ai/node-image/prompt/prompt-composer';

/**
 * Scene-specific context for the node being edited
 */
export interface NodeEditorContext {
  sceneId: SceneId;
  themeId: string;
  scale: number;
  position: { x: number; y: number };
  viewportPosition: { x: number; y: number };
  /** Other nodes in this scene carrying an image, offered as style references. */
  styleReferences: NodeImageStyleReference[];
  containerRect: DOMRect;
}

export type NodeEditorOnSave = (
  nodeId: NodeId,
  contentUpdates: Partial<Node>,
  designUpdates: { id: DesignId; params: Record<string, unknown> },
  scaleUpdate: number,
  imageUpdates: ImageTabValues
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
 * A generation request, fully resolved by the dialog: the preset comes from the
 * registry, the palette from the scene's theme, and the cap from settings. The
 * AI layer receives values, never lookups.
 *
 * No display size. An SVG has none, and how wide it is drawn is a scene-level
 * decision taken after generation — see `ai/node-image/prompt/technique-rules.ts`.
 *
 * No `title`. The node's title is seeded into the description box instead, where
 * the user can edit or replace it — an image is often not described by the name
 * of the node that carries it, and a separately-appended title sentence took
 * that choice away.
 */
export interface NodeEditorImageRequest {
  preset: NodeImagePreset;
  palette: NodeImagePalette;
  /** The sanitizer's cap, so the prompt cannot state a limit the app does not enforce. */
  maxBytes: number;
  description: string;
  /**
   * The image already on the node, with colour tokens resolved. Present
   * whenever the tab holds one, so generating over an existing image revises it
   * rather than replacing it outright.
   */
  startingPoint?: string;
  /** Another scene node's image, chosen in the dialog as the style to match. */
  styleReference?: string;
  /**
   * The revision conversation so far, oldest first, empty on a first request.
   * Owned by the dialog and discarded with it — nothing about a correction is
   * ever persisted.
   */
  corrections: NodeImageCorrection[];
}

export interface NodeEditorImageResult {
  type: 'svg';
  /** Raw model output. Untrusted until the caller sanitizes it. */
  svg: string;
}

export interface NodeEditorImageClarification {
  type: 'clarification';
  message: string;
}

export type NodeEditorOnGenerateImage = (
  request: NodeEditorImageRequest
) => Promise<NodeEditorImageResult | NodeEditorImageClarification>;

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

export const NODE_EDITOR_TAB_IDS = ['content', 'design', 'image', 'advanced', 'identity'] as const;
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

/**
 * Layout knobs, keyed by the design param each one writes. The set is whatever
 * the selected design declares (`getDesignLayoutControls`), so this is a map
 * rather than a fixed shape.
 */
export type NodeLayoutValues = Record<string, number | boolean>;

export interface DesignTabValues {
  designId: DesignId;
  scale: number;
  /** Only the keys the user explicitly overrode; absent means "follow the theme". */
  colors: {
    text: string | undefined;
    background: string | undefined;
    backgroundAlt: string | undefined;
  };
  /** Only the keys the user explicitly overrode; absent means "follow the theme". */
  opacities: {
    text: number | undefined;
    background: number | undefined;
    backgroundAlt: number | undefined;
  };
  /** Empty when the selected design declares no layout controls. */
  layout: NodeLayoutValues;
}

export interface AdvancedTabValues {
  /**
   * Node properties excluding `equation` and `comment`, which the Content tab
   * owns and `#composeProperties` restores. System properties
   * (`config/node-properties.ts`) are never displayed but *are* present here:
   * the Advanced tab carries them through unchanged, since no other tab would.
   */
  properties: Record<string, unknown>;
  designParams: Record<string, unknown>;
}

/**
 * The node's image after editing, as an intent rather than a stored fact:
 * nothing reaches `nodeImages` until the editor is saved, so Cancel can never
 * leave a record behind. `imageId` on the node is derived from `image`.
 */
export interface ImageTabValues {
  /**
   * False when this edit left the image alone, in which case the other fields
   * mean nothing and the node's existing `imageId` stands. The tab loads the
   * current record asynchronously, so "no image in hand" and "no image wanted"
   * are genuinely different states and must not be conflated.
   */
  changed: boolean;
  /** The record to persist, or null when the node should end up with no image. */
  image: NodeImage | null;
  /** Records superseded during this edit, to delete on save. */
  removedImageIds: NodeImageId[];
}
