/**
 * Node Image Presets
 * The vocabulary every preset field draws from, and the presets a workspace
 * begins with.
 *
 * Shaped after `edge-type-settings.ts`: one config module holding a domain's
 * closed value sets and its starter records together.
 *
 * The starters are **seeds, not built-ins**. The registry copies them into its
 * collection with fresh ids on first read, after which they are ordinary user
 * records — no shadowing, no merge, no reset-to-original. Editing one is a
 * normal edit; deleting one is a normal delete.
 *
 * The prose each value expands to at prompt composition time lives in
 * `ai/node-image/prompt-composer.ts`, not here — this file is what a value *is*,
 * that one is what the model is told about it. Adding a value is one entry here
 * plus one there.
 *
 * See docs/node-image-templates.md §2.1, §2.2, §2.3, §3.3.
 */

import type {
  NodeImageAspect,
  NodeImageBackdrop,
  NodeImageColourMode,
  NodeImageDepth,
  NodeImageDetailLevel,
  NodeImageEnclosure,
  NodeImageForm,
  NodeImagePaletteSize,
  NodeImagePermission,
  NodeImagePreset,
  NodeImagePresetColour,
  NodeImagePresetContent,
  NodeImagePresetDraft,
  NodeImagePresetId,
  NodeImagePresetTechnical,
  NodeImageRenderMode,
  NodeImageStrokeWeight,
  NodeImageType
} from '../core/node-image-types';

/** One selectable value and the label shown for it. */
export interface NodeImageOption<T> {
  value: T;
  label: string;
}

/**
 * Every descriptor list opens with this.
 *
 * It emits no prompt line, so it is not a value the model ever sees — it is the
 * absence of an instruction. Listed first because it is the field default, and
 * because a list whose first entry is a real value invites accepting it without
 * a decision.
 */
const UNSPECIFIED_LABEL = 'Unspecified';

/** `string | number` rather than `string`: palette size is a numeric union. */
function unspecified<T extends string | number>(): NodeImageOption<T> {
  return { value: 'unspecified' as T, label: UNSPECIFIED_LABEL };
}

/**
 * The three readings of a permission.
 *
 * Shared by all four permission fields, which were `boolean` until a boolean
 * turned out to have no way of saying "no opinion": `false` is an instruction
 * (*forbidden*), not silence.
 */
export const NODE_IMAGE_PERMISSIONS: NodeImageOption<NodeImagePermission>[] = [
  unspecified(),
  { value: 'allowed', label: 'Permitted' },
  { value: 'forbidden', label: 'Not permitted' }
];

// ============================================================================
// VOCABULARY — CONTENT DESCRIPTORS
// What is drawn. Two consumers: the preset registry validates stored values
// against these lists when it normalises a record, and the preset editor builds
// its controls from them.
// ============================================================================

export const NODE_IMAGE_TYPES: NodeImageOption<NodeImageType>[] = [
  unspecified(),
  { value: 'icon', label: 'Icon' },
  { value: 'symbol', label: 'Symbol' },
  { value: 'schematic', label: 'Schematic' },
  { value: 'flow-diagram', label: 'Flow diagram' },
  { value: 'plot', label: 'Plot' },
  { value: 'map', label: 'Map' },
  { value: 'figure', label: 'Figure' },
  { value: 'portrait', label: 'Portrait' }
];

/** The axis `geometric` used to smuggle into the style list, under its own name. */
export const NODE_IMAGE_FORMS: NodeImageOption<NodeImageForm>[] = [
  unspecified(),
  { value: 'geometric', label: 'Geometric' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'organic', label: 'Organic' }
];

export const NODE_IMAGE_DEPTHS: NodeImageOption<NodeImageDepth>[] = [
  unspecified(),
  { value: '2d', label: '2D — flat' },
  { value: '3d', label: '3D — with volume' }
];

export const NODE_IMAGE_ENCLOSURES: NodeImageOption<NodeImageEnclosure>[] = [
  unspecified(),
  { value: 'none', label: 'None' },
  { value: 'circle', label: 'Circle' },
  { value: 'rounded-square', label: 'Rounded square' }
];

// ============================================================================
// VOCABULARY — TECHNICAL SPECS
// How it is rendered.
// ============================================================================

export const NODE_IMAGE_RENDER_MODES: NodeImageOption<NodeImageRenderMode>[] = [
  unspecified(),
  { value: 'line-art', label: 'Line art' },
  { value: 'filled', label: 'Filled' },
  { value: 'mixed', label: 'Mixed' }
];

/** The width is stated to the model in viewBox units, not as an adjective. */
export const NODE_IMAGE_STROKE_WEIGHTS: NodeImageOption<NodeImageStrokeWeight>[] = [
  unspecified(),
  { value: 'thin', label: 'Thin (1 unit)' },
  { value: 'medium', label: 'Medium (2 units)' },
  { value: 'heavy', label: 'Heavy (3.5 units)' }
];

/**
 * Gradients read as a **direction**, not a permission.
 *
 * "Permitted" and *unspecified* were the same instruction: a model told nothing
 * may use a gradient, and a model told it is allowed to may use a gradient.
 * Only "use them" says something the silence does not. Same three values as a
 * permission, so no type changes — the labels and the sentence differ.
 */
export const NODE_IMAGE_GRADIENT_USES: NodeImageOption<NodeImagePermission>[] = [
  unspecified(),
  { value: 'allowed', label: 'Use gradients' },
  { value: 'forbidden', label: 'Flat colour only' }
];

/**
 * A direction for the same reason gradients are one.
 *
 * The forbidden arm used to be an unconditional rule in the system contract. It
 * is a rendering choice rather than something the app enforces, so it belongs
 * where an author can switch it off.
 */
export const NODE_IMAGE_TRANSPARENCY_USES: NodeImageOption<NodeImagePermission>[] = [
  unspecified(),
  { value: 'allowed', label: 'Use transparency' },
  { value: 'forbidden', label: 'Full opacity only' }
];

// ============================================================================
// VOCABULARY — COLOUR
// ============================================================================

/**
 * The one list with no *unspecified* entry: an image cannot be rendered until
 * the app knows whether to substitute its colours.
 */
export const NODE_IMAGE_COLOUR_MODES: NodeImageOption<NodeImageColourMode>[] = [
  { value: 'thematic', label: 'Follow the theme' },
  { value: 'fixed', label: 'Fixed in the image' }
];

/** Counts a colour list in thematic mode and a bare number in fixed mode (D39). */
export const NODE_IMAGE_PALETTE_SIZES: NodeImageOption<NodeImagePaletteSize>[] = [
  unspecified(),
  { value: 1, label: '1 colour' },
  { value: 2, label: '2 colours' },
  { value: 3, label: '3 colours' },
  { value: 4, label: '4 colours' }
];

/**
 * Orientation is part of the value, not a second control: `square` has no
 * orientation, so a separate knob would be dead for one of seven values.
 *
 * The one descriptor with **no unspecified and no free** (D31's exception).
 * Every image needs a viewBox, so leaving it open only moved the choice to the
 * model, and the two open values said the same thing to it. A concrete list
 * also bounds the node: the extremes are 3:1, and width feeds Cytoscape
 * directly.
 */
export const NODE_IMAGE_ASPECTS: NodeImageOption<NodeImageAspect>[] = [
  { value: 'square', label: 'Square' },
  { value: 'landscape-4-3', label: 'Landscape 4:3' },
  { value: 'portrait-3-4', label: 'Portrait 3:4' },
  { value: 'landscape-16-9', label: 'Landscape 16:9' },
  { value: 'portrait-9-16', label: 'Portrait 9:16' },
  { value: 'strip-3-1', label: 'Strip 3:1' },
  { value: 'column-1-3', label: 'Column 1:3' }
];

/**
 * An element budget, so the labels describe detail rather than size — the
 * generation dialog's own Small/Medium/Large control sits a few pixels away and
 * means the rendered width.
 */
export const NODE_IMAGE_DETAIL_LEVELS: NodeImageOption<NodeImageDetailLevel>[] = [
  unspecified(),
  { value: 'very-simple', label: 'Very simple' },
  { value: 'simple', label: 'Simple' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'very-detailed', label: 'Very detailed' },
  { value: 'elaborate', label: 'Elaborate' }
];

/** "None" rather than "Transparent": the Transparency knob is a different axis. */
export const NODE_IMAGE_BACKDROPS: NodeImageOption<NodeImageBackdrop>[] = [
  unspecified(),
  { value: 'transparent', label: 'None' },
  { value: 'theme-surface', label: 'Surface colour' },
  { value: 'contrast-fill', label: 'Reversed contrast' }
];

// ============================================================================
// FIELD DEFAULTS
// ============================================================================

/**
 * The value every preset field falls back to.
 *
 * Used twice: the registry fills a missing or invalid field with it when
 * normalising a stored record, and the starters below are written as
 * differences from it rather than as full literals.
 *
 * Everything defaults to **unspecified**, which is what makes a new preset a
 * blank brief rather than an opinionated one. It also means a stored record
 * written before a descriptor existed acquires silence rather than a guess, and
 * that a boolean left over from the pre-tri-state shape normalises to "no
 * opinion" instead of to *forbidden*.
 */
export const NODE_IMAGE_PRESET_DEFAULTS: {
  content: NodeImagePresetContent;
  technical: NodeImagePresetTechnical;
  colour: NodeImagePresetColour;
} = {
  content: {
    imageType: 'unspecified',
    form: 'unspecified',
    depth: 'unspecified',
    enclosure: 'unspecified',
    textAllowed: 'unspecified'
  },
  technical: {
    renderMode: 'unspecified',
    strokeWeight: 'unspecified',
    aspect: 'square',
    detailLevel: 'unspecified',
    backdrop: 'unspecified',
    gradientsAllowed: 'unspecified',
    transparencyAllowed: 'unspecified'
  },
  colour: {
    // The only field that cannot default to silence, and thematic is the choice
    // that makes a graph's images survive a change of theme.
    colourMode: 'thematic',
    paletteSize: 'unspecified'
  }
};

// ============================================================================
// STARTERS
// ============================================================================

const { content: defaultContent, technical: defaultTechnical, colour: defaultColour } = NODE_IMAGE_PRESET_DEFAULTS;

const STARTER_NODE_IMAGE_PRESETS: NodeImagePresetDraft[] = [
  /**
   * Everything unspecified, and the one selected by default.
   *
   * A baseline to judge against: with no descriptor firing, a bad image is the
   * request's fault or the contract's, not a knob's. Every other starter is a
   * departure from it, and can be compared to it one field at a time.
   */
  {
    name: 'Open',
    content: { ...defaultContent },
    technical: { ...defaultTechnical },
    colour: { ...defaultColour },
    extraInstructions: ''
  },
  {
    name: 'Icon',
    content: {
      ...defaultContent,
      imageType: 'icon',
      depth: '2d',
      enclosure: 'none',
      textAllowed: 'forbidden'
    },
    technical: {
      ...defaultTechnical,
      renderMode: 'mixed',
      strokeWeight: 'medium',
      aspect: 'square',
      detailLevel: 'very-simple',
      backdrop: 'transparent',
      gradientsAllowed: 'forbidden'
    },
    colour: { ...defaultColour, paletteSize: 2 },
    extraInstructions: ''
  },
  {
    name: 'Schematic',
    content: {
      ...defaultContent,
      imageType: 'schematic',
      depth: '2d',
      enclosure: 'none',
      textAllowed: 'allowed'
    },
    technical: {
      ...defaultTechnical,
      renderMode: 'line-art',
      strokeWeight: 'thin',
      aspect: 'landscape-4-3',
      detailLevel: 'detailed',
      backdrop: 'transparent',
      gradientsAllowed: 'forbidden'
    },
    colour: { ...defaultColour, paletteSize: 2 },
    extraInstructions: ''
  },
  {
    name: 'Plot',
    content: {
      ...defaultContent,
      imageType: 'plot',
      form: 'geometric',
      depth: '2d',
      enclosure: 'none',
      textAllowed: 'allowed'
    },
    technical: {
      ...defaultTechnical,
      renderMode: 'line-art',
      strokeWeight: 'thin',
      aspect: 'landscape-4-3',
      detailLevel: 'moderate',
      backdrop: 'transparent',
      gradientsAllowed: 'forbidden'
    },
    colour: { ...defaultColour, paletteSize: 3 },
    extraInstructions: ''
  },
  {
    name: 'Emblem',
    content: {
      ...defaultContent,
      imageType: 'symbol',
      form: 'geometric',
      depth: '2d',
      enclosure: 'circle',
      textAllowed: 'forbidden'
    },
    technical: {
      ...defaultTechnical,
      renderMode: 'filled',
      strokeWeight: 'heavy',
      aspect: 'square',
      detailLevel: 'very-simple',
      backdrop: 'contrast-fill',
      gradientsAllowed: 'forbidden'
    },
    colour: { ...defaultColour, paletteSize: 2 },
    extraInstructions: ''
  }
];

/** Id shape shared with node images and chat records — see docs/nodes-svg-images.md §13 (D10). */
export function createNodeImagePresetId(): NodeImagePresetId {
  return `preset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Fresh copies of the starter presets.
 *
 * New ids every call, so restoring starters into a collection that already
 * holds edited copies adds rather than collides.
 */
export function createStarterNodeImagePresets(now: Date = new Date()): NodeImagePreset[] {
  return STARTER_NODE_IMAGE_PRESETS.map(preset => ({
    ...preset,
    id: createNodeImagePresetId(),
    createdAt: now,
    updatedAt: now
  }));
}
