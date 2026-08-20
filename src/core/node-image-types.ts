/**
 * Node Image Types
 * Data shapes for the SVG pictograms attached to nodes, and for the presets
 * that constrain how they are generated.
 * Part of the Knogra type system — see main-types.ts for full index.
 *
 * This file owns:
 *   - The stored image record (NodeImage, NodeImageSizeClass, NodeImageOrigin)
 *   - The generation vocabulary (NodeImageType,
 *     NodeImageDepth, NodeImageEnclosure, NodeImageRenderMode,
 *     NodeImageStrokeWeight, NodeImagePaletteSize, NodeImageAspect,
 *     NodeImageDetailLevel, NodeImageBackdrop)
 *   - The preset record (NodeImagePreset, NodeImagePresetId, and its two halves)
 *
 * Does NOT own:
 *   - NodeImageId (→ main-types.ts, with the other primitive ids)
 *   - Node/edge styling (→ style-types.ts)
 *
 * `NodeImagePresetId` lives here rather than under main-types.ts's PRIMITIVE IDS
 * because a preset is never referenced from persisted graph data — the same
 * reason MessageId lives in chat-types.ts. See docs/nodes-svg-images.md §13 (D14).
 *
 * See docs/nodes-svg-images.md §4 and docs/node-image-presets.md §2.
 */

import type { NodeId, NodeImageId } from './main-types';

// =============================================================================
// THE STORED IMAGE RECORD
// =============================================================================

/** Base render width of a node image, resolved to pixels through settings. */
export type NodeImageSizeClass = 'small' | 'medium' | 'large';

/** How a node image entered the workspace. */
export type NodeImageOrigin = 'generated' | 'uploaded' | 'pasted';

/**
 * An SVG pictogram attached to a node.
 *
 * Held in its own `nodeImages` table rather than on the node: `GraphStore`
 * keeps every node resident for the whole session, and an SVG payload is orders
 * of magnitude larger than any other node field.
 * See `docs/nodes-svg-images.md` §4.3.
 */
export interface NodeImage {
  id: NodeImageId;
  /**
   * The node this image belongs to. An image is owned by exactly one node and
   * is deleted with it, which is why orphans cannot occur and the deletion
   * cascade is a single query. Widening to several images per node changes only
   * the UI, not this shape.
   */
  ownerNodeId: NodeId;
  /** Sanitized SVG source. The only representation stored; never raster. */
  svg: string;
  /** viewBox aspect ratio (width / height), extracted once at ingest. */
  aspectRatio: number;
  /** Base render width class, resolved to pixels at render time. */
  sizeClass: NodeImageSizeClass;
  /** How this image came to exist — provenance display, and future filtering. */
  origin: NodeImageOrigin;
  /**
   * Whether the colours follow the scene's theme or are frozen as drawn.
   *
   * Optional because records written before the field existed have none, and
   * absent reads as `fixed` — which is correct: they hold literal hex and no
   * tokens, so there is nothing to substitute and no migration to run.
   */
  colourMode?: NodeImageColourMode;
  /**
   * The description the user wrote to generate it. Present for generated images
   * only, and the seed for regeneration.
   *
   * No reference to the preset that produced it: a preset is a mutable
   * localStorage record, so a persisted pointer into it would either dangle or
   * force presets into the graph database. See `docs/nodes-svg-images.md` §13
   * (D14).
   */
  prompt?: string;
  createdAt: Date;
}

// =============================================================================
// GENERATION VOCABULARY — CONTENT DESCRIPTORS
// The "what is drawn" half of a preset. Every value expands to a written
// paragraph at prompt composition time, which is the whole point of predefining
// them.
//
// Every descriptor carries `'unspecified'`, which emits **no prompt line at
// all** (D31). It is the only real lever on over-specification — moving text
// between messages removes no constraint, leaving a knob unset does — and it is
// what lets a descriptor be isolated while its expansion is being judged. The
// cost is real and deliberate: an unspecified descriptor is a degree of freedom
// the model resolves differently on every image, which is why presets meant for
// coherence across a graph should be fully specified.
// =============================================================================

/** Left to the model. Emits no prompt line. */
export type NodeImageUnspecified = 'unspecified';

/**
 * A permission a preset may decline to express.
 *
 * Both remaining permissions were `boolean` and could not: `false` says
 * *forbidden*, which is an instruction, and there was no third value for *say
 * nothing*. A tri-state is the smallest shape that carries all three.
 */
export type NodeImagePermission = NodeImageUnspecified | 'allowed' | 'forbidden';

/**
 * What kind of drawing this is.
 *
 * `silhouette` is gone: it named a *rendering* — solid fill, no interior detail
 * — which `renderMode: filled` already says, and it contradicted
 * `renderMode: line-art` outright. `figure` and `portrait` are here despite
 * naming a subject, because each carries framing conventions a preset can
 * usefully fix for a whole graph: a portrait is a head-and-shoulders crop, a
 * figure is a whole body with the proportions that implies.
 */
export type NodeImageType =
  | NodeImageUnspecified
  | 'icon'
  | 'schematic'
  | 'plot'
  | 'flow-diagram'
  | 'symbol'
  | 'figure'
  | 'portrait'
  | 'map';

/**
 * What the drawing is built out of — primitives, or freeform curves.
 *
 * Stated to the model in SVG terms rather than as a mood, because that is what
 * it acts on: `<path>` with cubic Bézier segments is a thing it can either do
 * or not do, where "interesting curvature" is not.
 */
export type NodeImageForm = NodeImageUnspecified | 'geometric' | 'mixed' | 'organic';

/**
 * Whether the subject is drawn flat or with volume.
 *
 * Replaces the five-value `viewpoint` knob, which spent four of its values on
 * projections needed once in a blue moon while burying the one distinction that
 * changes every image.
 */
export type NodeImageDepth = NodeImageUnspecified | '2d' | '3d';

/** The shape drawn around the subject, if any. */
export type NodeImageEnclosure = NodeImageUnspecified | 'none' | 'circle' | 'rounded-square';

// =============================================================================
// GENERATION VOCABULARY — TECHNICAL SPECS
// The "how it is rendered" half of a preset.
// =============================================================================

/** Whether shapes are drawn as outlines, as solids, or as a combination. */
export type NodeImageRenderMode = NodeImageUnspecified | 'line-art' | 'filled' | 'mixed';

/**
 * Stroke width, stated to the model as an absolute number of viewBox units.
 *
 * Not relative to anything: the coordinate system is fixed at 100 units on its
 * longest side, so "2 units" is the same width in every image, which is what
 * makes a set of pictograms look like a set.
 */
export type NodeImageStrokeWeight = NodeImageUnspecified | 'thin' | 'medium' | 'heavy';

/**
 * How many of the theme's image colours a generated image may use.
 *
 * Applies in **both** colour modes (D39): in `thematic` it selects the first
 * *n* of the theme's four, in `fixed` it states a count and names nothing.
 * *unspecified* emits no count in either — in `thematic` the whole palette is
 * still sent, since it is a constraint the tokeniser enforces regardless.
 */
export type NodeImagePaletteSize = NodeImageUnspecified | 1 | 2 | 3 | 4;

/**
 * Whether an image follows the theme it is displayed in, or keeps the colours
 * it was drawn with.
 *
 * The one descriptor with no *unspecified* member: the app has to decide whether
 * to substitute colours before it can render the image at all, so silence is not
 * available to it.
 */
export type NodeImageColourMode = 'thematic' | 'fixed';

/**
 * The shape of the viewBox, and so of the node that renders it.
 *
 * The second descriptor with **no open value** — no *unspecified*, no *free*.
 * Every image needs a viewBox, so an open value delegated the choice to the
 * model rather than withholding one, which is the behaviour the knob exists to
 * prevent. It also bounds the node: a generated image cannot be more extreme
 * than 3:1.
 *
 * Orientation is folded into the value rather than split into a second control:
 * `square` has no orientation, so a separate knob would be dead for one of the
 * values and would admit *square portrait*, which means nothing.
 *
 * Ratios stop at 3:1. Width feeds Cytoscape directly — it sets hit area, edge
 * endpoints and arrange spacing — so past about three to one a node stops
 * behaving like a node in the layout.
 */
export type NodeImageAspect =
  | 'square'
  | 'landscape-4-3'
  | 'portrait-3-4'
  | 'landscape-16-9'
  | 'portrait-9-16'
  | 'strip-3-1'
  | 'column-1-3';

/**
 * How much detail a generated image should carry, as an **element budget**.
 *
 * The steps are geometric because the useful range spans two orders of
 * magnitude. The top tiers are limited by the model's output length rather than
 * by the byte cap: 1 MB is four to seven thousand elements, while eight thousand
 * output tokens is nearer two hundred.
 */
export type NodeImageDetailLevel =
  | NodeImageUnspecified
  | 'very-simple'
  | 'simple'
  | 'moderate'
  | 'detailed'
  | 'very-detailed'
  | 'elaborate';

/**
 * What fills the region behind the subject.
 *
 * Backdrop, `enclosure` and the no-frame rule all describe this same region:
 * backdrop paints it, enclosure draws its boundary, and "no frame" applies only
 * when this is explicitly `transparent` and enclosure explicitly `none`.
 */
export type NodeImageBackdrop = NodeImageUnspecified | 'transparent' | 'theme-surface' | 'contrast-fill';

// =============================================================================
// THE PRESET RECORD
// =============================================================================

export type NodeImagePresetId = string;

/** What is drawn. */
export interface NodeImagePresetContent {
  imageType: NodeImageType;
  form: NodeImageForm;
  depth: NodeImageDepth;
  enclosure: NodeImageEnclosure;
  textAllowed: NodeImagePermission;
}

/** How it is rendered. */
export interface NodeImagePresetTechnical {
  renderMode: NodeImageRenderMode;
  strokeWeight: NodeImageStrokeWeight;
  aspect: NodeImageAspect;
  detailLevel: NodeImageDetailLevel;
  backdrop: NodeImageBackdrop;
  gradientsAllowed: NodeImagePermission;
  transparencyAllowed: NodeImagePermission;
}

/**
 * How colour is chosen, and whether it follows the theme.
 *
 * Its own group rather than part of `technical` because `colourMode` is the one
 * preset value that decides how the image is treated at **render** time, long
 * after generation.
 */
export interface NodeImagePresetColour {
  colourMode: NodeImageColourMode;
  paletteSize: NodeImagePaletteSize;
}

/**
 * A named, user-editable bundle of generation constraints, selected per image.
 *
 * This is what makes a graph's pictograms read as one set rather than a pile of
 * unrelated drawings — the reason generation was chosen over sourced icons.
 * Coherence comes from keeping the `technical` half constant while varying
 * `content`, so `icon` and `plot` can coexist in one graph without it becoming a
 * zoo.
 *
 * Neither the size class nor any colour is a field: size is chosen per image,
 * and the palette is resolved against the scene's theme at request time, which
 * keeps a preset portable across themes.
 * See docs/node-image-presets.md §2.
 */
export interface NodeImagePreset {
  id: NodeImagePresetId;
  name: string;
  content: NodeImagePresetContent;
  technical: NodeImagePresetTechnical;
  colour: NodeImagePresetColour;
  /** Free prose, appended to the composed prompt verbatim. May be empty. */
  extraInstructions: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A preset before the registry assigns it an identity. */
export type NodeImagePresetDraft = Omit<NodeImagePreset, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * A node in the current scene whose image can be offered as a style reference.
 *
 * Title and image id only: the picker labels by node, but what travels into the
 * prompt is the image.
 */
export interface NodeImageStyleReference {
  imageId: NodeImageId;
  title: string;
}

// =============================================================================
// THE RESOLVED PALETTE
// =============================================================================

/**
 * The colours a single generation request may use, resolved from the scene's
 * theme.
 *
 * A record of named roles rather than a bare list, so a sixth role can be added
 * without touching prompt composition. Two rules travel with it:
 *
 * - **Surfaces are context, never drawing colours.** They tell the model what
 *   the image sits on so it can judge contrast; drawing in one makes the mark
 *   invisible.
 * - **`ink` is ordered by dominance**, as the theme author wrote it, and
 *   truncated to the preset's palette size — so shortening the list drops the
 *   least important colour rather than the least contrasty one.
 *
 * Resolved per request rather than stored: a preset stays portable across themes
 * precisely because it carries no colours. See docs/node-image-generation.md §7.1.
 */
export interface NodeImagePalette {
  /** What the image sits on. Composited, not raw — see `resolveNodeImagePalette`. */
  surface: string;
  /** The alternate node surface, for images shown on a differently filled node. */
  surfaceAlt: string;
  /** Permitted drawing colours, most legible first, truncated to palette size. */
  ink: string[];
}
