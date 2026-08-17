/**
 * The Technique Section
 *
 * The mechanics of the drawing: the canvas it is drawn on, how wide the marks
 * are, whether the subject has volume, whether words are allowed, whether shapes
 * are outlined or filled, and what is drawn around them.
 *
 * Grouped by the question the knob answers rather than by which half of the
 * preset record it came from — the record is shaped for editing, the prompt for
 * a model. `imageType`, `form` and `detailLevel` answer a different question and
 * compose in `drawing-rules.ts`; everything that decides how colour is applied
 * composes in `colour-rules.ts`.
 *
 * See docs/node-image-presets.md §3.2 and docs/node-image-generation.md §5.3.
 */

import type {
  NodeImageAspect,
  NodeImageDepth,
  NodeImageEnclosure,
  NodeImagePreset,
  NodeImageRenderMode,
  NodeImageStrokeWeight
} from '../../../core/node-image-types';
import type { PermissionRule, Specified } from './rule-primitives';
import { permission, rule, stated } from './rule-primitives';

/**
 * The viewBox per ratio, and the **single source** of the 100-unit grid: every
 * absolute number in the prompt — stroke widths above all — is a proportion of
 * it, so the convention has to be written down exactly once.
 */
export const NODE_IMAGE_ASPECT_VIEWBOXES: Record<NodeImageAspect, string> = {
  square: '0 0 100 100',
  'landscape-4-3': '0 0 100 75',
  'portrait-3-4': '0 0 75 100',
  'landscape-16-9': '0 0 100 56.25',
  'portrait-9-16': '0 0 56.25 100',
  'strip-3-1': '0 0 100 33.3',
  'column-1-3': '0 0 33.3 100'
};

/**
 * Stroke width in viewBox units, which is what fixing the viewBox scale buys:
 * the model receives a number rather than an adjective, and numbers are followed.
 *
 * Kept as data because the margin rule needs the width, not the sentence.
 */
export const NODE_IMAGE_STROKE_WIDTHS: Record<Specified<NodeImageStrokeWeight>, number> = {
  thin: 1,
  medium: 2,
  heavy: 3.5
};

export const NODE_IMAGE_STROKE_WEIGHT_RULES: Record<Specified<NodeImageStrokeWeight>, string> = {
  thin: `Draw strokes ${NODE_IMAGE_STROKE_WIDTHS.thin} unit wide: fine and precise.`,
  medium: `Draw strokes ${NODE_IMAGE_STROKE_WIDTHS.medium} units wide.`,
  heavy: `Draw strokes ${NODE_IMAGE_STROKE_WIDTHS.heavy} units wide: bold, and legible when the image is reduced.`
};

export const NODE_IMAGE_DEPTH_RULES: Record<Specified<NodeImageDepth>, string> = {
  '2d': 'Draw flat, in two dimensions: no perspective, no foreshortening, and no shading that implies volume.',
  '3d': 'Give the subject volume: draw it as a solid object in three dimensions, with the depth cues that requires.'
};

/**
 * Only the generic families may be named. The SVG is a data URI nested inside
 * the node's own SVG, where no specific font is guaranteed to resolve.
 */
export const NODE_IMAGE_TEXT_RULES: PermissionRule = {
  permitted: 'Short text is allowed where it carries meaning — an axis label, a unit, one or two words. Set it in sans-serif, serif, or monospace only; never name a specific font.',
  forbidden: 'Include no text, letters, digits, or labels of any kind.'
};

export const NODE_IMAGE_RENDER_MODE_RULES: Record<Specified<NodeImageRenderMode>, string> = {
  'line-art': 'Draw with strokes only. Shapes are outlined, and fills are none.',
  filled: 'Draw with solid filled shapes and no visible outlines.',
  mixed: 'Combine filled shapes and outlines, using fill for mass and stroke for edges and detail.'
};

export const NODE_IMAGE_ENCLOSURE_RULES: Record<Specified<NodeImageEnclosure>, string> = {
  none: 'Draw no enclosing shape around the subject.',
  circle: 'Enclose the subject in a circle that meets the edges of the viewBox.',
  'rounded-square': 'Enclose the subject in a rounded square that meets the edges of the viewBox.'
};

/**
 * The `## Technique` knob lines.
 *
 * `composeAspectRule` is deliberately absent: the viewBox is stated once at the
 * end of the brief, beside the byte cap, because both are numbers the app
 * enforces rather than drawing language.
 *
 * Exported as lines so the preset editor can show the author exactly what a
 * selection sends. That preview must never be a second set of sentences written
 * for display: the whole point of predefining descriptors is that one word
 * expands into a specification, so the editor renders the specification itself.
 */
export function composeTechniqueRules(preset: NodeImagePreset): string[] {
  const { content, technical } = preset;

  return stated([
    ...composeStrokeRules(technical.strokeWeight),
    rule(NODE_IMAGE_DEPTH_RULES, content.depth),
    permission(NODE_IMAGE_TEXT_RULES, content.textAllowed),
    rule(NODE_IMAGE_RENDER_MODE_RULES, technical.renderMode),
    rule(NODE_IMAGE_ENCLOSURE_RULES, content.enclosure)
  ]);
}

/**
 * The viewBox line. Always emitted: aspect has no unspecified value, because
 * every image needs a viewBox and leaving it open only moved the choice to the
 * model.
 */
export function composeAspectRule(aspect: NodeImageAspect): string {
  return `Use exactly the viewBox as follows: "${NODE_IMAGE_ASPECT_VIEWBOXES[aspect]}".`;
}

/**
 * Stroke width and the margin it implies.
 *
 * Exported as a pair so the editor's preview cannot show one without the other.
 */
export function composeStrokeRules(strokeWeight: NodeImageStrokeWeight): string[] {
  return stated([
    rule(NODE_IMAGE_STROKE_WEIGHT_RULES, strokeWeight),
    composeMarginRule(strokeWeight)
  ]);
}

/**
 * Keeps strokes inside the viewBox.
 *
 * Round caps on a shape that reaches the edge put half a stroke outside the
 * viewBox, and the outer edge of the drawing is clipped. The margin has to be
 * computed from the stroke width or it is either useless or wasteful.
 *
 * It belongs to `strokeWeight` and obeys it: with no weight set there is no
 * width to compute a margin from, so it emits nothing like every other
 * unspecified descriptor.
 */
function composeMarginRule(strokeWeight: NodeImageStrokeWeight): string | undefined {
  if (strokeWeight === 'unspecified') return undefined;

  const margin = NODE_IMAGE_STROKE_WIDTHS[strokeWeight] / 2 + 1;
  return `Keep every mark, including the outer half of every stroke, at least ${margin} units inside each edge of the viewBox. Reaching that margin is what "filling the frame" means; never reach the edge itself.`;
}
