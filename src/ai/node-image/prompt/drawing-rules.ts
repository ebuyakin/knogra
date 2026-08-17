/**
 * The Drawing Section
 *
 * What the picture is: the kind of image, what it is built out of, and how much
 * of it there is.
 *
 * The expansions live beside the builder that reads them because they change
 * together: adding a descriptor value is one entry here and one in
 * `config/node-image-preset-definitions.ts`, and never a change to composition
 * logic — these maps are data, not branches.
 *
 * Grouped by the question the knob answers rather than by which half of the
 * preset record it came from. The mechanics of the drawing compose in
 * `technique-rules.ts`, and everything deciding how colour is applied composes
 * in `colour-rules.ts`.
 *
 * See docs/node-image-presets.md §3.1 and docs/node-image-generation.md §5.2.
 */

import type {
  NodeImageDetailLevel,
  NodeImageForm,
  NodeImagePreset,
  NodeImagePresetTechnical,
  NodeImageType
} from '../../../core/node-image-types';
import type { Specified } from './rule-primitives';
import { rule, stated } from './rule-primitives';

export const NODE_IMAGE_TYPE_RULES: Record<Specified<NodeImageType>, string> = {
  icon: 'A bold pictogram: a single subject reduced to its most recognisable outline, with no incidental detail.',
  symbol: 'A single abstract mark in the manner of a logo or glyph: balanced, self-contained, and carrying its meaning by convention rather than by resemblance.',
  schematic: 'A technical schematic: the subject\'s own parts and how they are arranged within it, drawn for clarity rather than likeness, with consistent line weights and no shading or texture.',
  'flow-diagram': 'A flow diagram: labelled nodes connected by directed arrows, showing sequence, causation or dependency. The arrows carry the meaning, so the shapes they join stay plain.',
  plot: 'A graph or chart: axes and one or more curves or data series, conveying the shape of a relationship rather than exact values.',
  map: 'A simplified map or spatial layout: regions, routes, or relative positions, keeping only the boundaries that carry meaning.',
  figure: 'A whole human or animal figure, drawn in full and in proportion, with a clear pose that reads at a glance.',
  portrait: 'A portrait: one head, or head and shoulders, cropped close so the face fills most of the frame.'
};

/**
 * What the drawing is built out of, said in SVG rather than in adjectives.
 *
 * Naming the elements is the point. "Interesting curvature" is not something a
 * model can act on; `<path>` with cubic Bézier segments is. Left unstated, the
 * safe answer wins every time — `<circle>` is far easier to get right than four
 * control points that have to land well — which is why images came back made of
 * rectangles.
 */
export const NODE_IMAGE_FORM_RULES: Record<Specified<NodeImageForm>, string> = {
  geometric: 'Build the drawing from rect, circle, ellipse, line and polygon elements: straight edges, exact arcs and regular proportions, as though drawn with compass and ruler.',
  mixed: 'Build the drawing from whichever elements the subject calls for, using exact primitives for what is regular and path curves for what is not.',
  organic: 'Build the drawing from path elements using cubic Bézier segments (C and S commands), with varied curvature — lines that swell, taper and change direction smoothly. Use rect, circle and line only where the subject genuinely is rectangular or circular.'
};

/**
 * The element budget, stated as a **ceiling**.
 *
 * It used to be a range — "roughly 26 to 70 elements" — which reads as a target
 * and was answered with decorative filler: dozens of small circles added to
 * reach the number. A ceiling asks for the same restraint without inviting the
 * padding.
 *
 * A count beats bytes as a busy-ness control: one `path` can be 4 KB, and the
 * byte cap is a workspace-bloat guard rather than a complexity one (D30). The
 * steps are geometric because the useful range spans two orders of magnitude.
 *
 * These are a steer, not a guarantee — models count badly. Nothing validates the
 * result against the budget, and nothing should: rejecting a good image for
 * carrying twenty-seven shapes instead of twenty-five would be absurd.
 */
export const NODE_IMAGE_DETAIL_LEVEL_RULES: Record<Specified<NodeImageDetailLevel>, string> = {
  'very-simple': 'Use at most 8 elements. Every one must earn its place.',
  simple: 'Use at most 25 elements.',
  moderate: 'Use at most 70 elements.',
  detailed: 'Use at most 200 elements.',
  'very-detailed': 'Use at most 500 elements.',
  elaborate: 'Use at most 2000 elements. This is a full, intricate diagram, so do not simplify the subject to stay well below that.'
};

/**
 * Appended to whichever budget fires.
 *
 * Two holes to close, in this order. A count is gameable by one monstrous path
 * carrying the whole picture, so a path counts per shape. And a count taken
 * literally punishes the better drawing, since forty circles and twelve
 * elaborately curved paths score forty and twelve — so the second sentence says
 * that curve complexity is free.
 */
const ELEMENT_DEFINITION = 'An element is one distinct shape, however it is written: a path that draws three shapes counts three, so do not pack the picture into one path. How many curve segments a shape is made of does not count against this at all — one richly curved path is one element, and fewer, better shapes are always preferred to more, simpler ones. Never add decoration to reach the number.';

/**
 * The `## Drawing` section.
 *
 * Exported as lines so the preset editor can show the author exactly what a
 * selection sends. That preview must never be a second set of sentences written
 * for display: the whole point of predefining descriptors is that one word
 * expands into a specification, so the editor renders the specification itself.
 */
export function composeDrawingRules(preset: NodeImagePreset): string[] {
  return stated([
    rule(NODE_IMAGE_TYPE_RULES, preset.content.imageType),
    rule(NODE_IMAGE_FORM_RULES, preset.content.form),
    composeDetailRule(preset.technical)
  ]);
}

/**
 * The definition of an element rides with the budget rather than sitting in the
 * contract: it is meaningless without a number to qualify, and it disappears
 * with it when the budget is unspecified.
 */
export function composeDetailRule(technical: NodeImagePresetTechnical): string | undefined {
  const budget = rule(NODE_IMAGE_DETAIL_LEVEL_RULES, technical.detailLevel);
  return budget && `${budget} ${ELEMENT_DEFINITION}`;
}
