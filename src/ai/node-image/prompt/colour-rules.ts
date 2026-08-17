/**
 * The Colour Section
 *
 * Everything that decides how colour is applied: which colours, what sits behind
 * the subject, and whether colour may be graded or seen through.
 *
 * Backdrop belongs here rather than with the drawing mechanics because all three
 * of its values are colour decisions — no colour behind, the surface colour, or
 * the surface and drawing colours swapped.
 *
 * The palette arrives resolved: `styles/node-image-palette.ts` reads the theme
 * and the **caller** passes the result in, so nothing here imports `styles/`.
 *
 * See docs/node-image-generation.md §7.
 */

import type {
  NodeImageBackdrop,
  NodeImagePalette,
  NodeImagePreset,
  NodeImagePresetColour
} from '../../../core/node-image-types';
import type { PermissionRule, Specified } from './rule-primitives';
import { permission, rule, stated } from './rule-primitives';

export const NODE_IMAGE_BACKDROP_RULES: Record<Specified<NodeImageBackdrop>, string> = {
  transparent: 'Draw no background. The node\'s own surface shows through behind the subject.',
  'theme-surface': 'Fill the whole viewBox with the stated surface colour, then draw on top of it.',
  // "Your strongest drawing colour" rather than "the first listed colour": in
  // fixed mode there is no list to be first in.
  'contrast-fill': 'Fill the whole viewBox with your strongest drawing colour and draw the subject in the surface colour, reversing the usual contrast.'
};

/**
 * A direction, not a permission: "gradients are allowed" and saying nothing at
 * all are the same instruction to a model, so the stated arm asks for them.
 */
export const NODE_IMAGE_GRADIENT_RULES: PermissionRule = {
  permitted: 'Use linear or radial gradients for the larger areas, built only from the colours already in use and defined inside this document.',
  forbidden: 'Use flat colour only. No gradients.'
};

/**
 * A direction too, and the forbidden arm is the one the system contract used to
 * state unconditionally.
 *
 * The surface behind the image is itself translucent, so a partly transparent
 * mark composites onto a colour that cannot be predicted — which is why the
 * forbidden arm is worth having, not why it should be compulsory.
 */
export const NODE_IMAGE_TRANSPARENCY_RULES: PermissionRule = {
  permitted: 'Use partial transparency where it serves the drawing: overlapping shapes, softened edges, and layered washes.',
  forbidden: 'Draw at full opacity. Never set opacity, fill-opacity, or stroke-opacity.'
};

/**
 * Appended only when the backdrop is transparent and the enclosure is none.
 *
 * Backdrop, enclosure and this rule all describe the same region: backdrop
 * paints it, enclosure draws its boundary, and this forbids anything being
 * there. Stating it unconditionally would contradict the other two, which is
 * why it is the one conditional in an otherwise fixed boilerplate.
 */
export const NODE_IMAGE_NO_FRAME_RULE = 'Draw no frame, border, or padding rectangle. The subject reaches the outer margin of the viewBox on at least one axis.';

/**
 * The two colour modes differ only in what is said about the colours themselves.
 * The surfaces hold either way — a fixed-colour image still has to be visible on
 * the node it sits in.
 *
 * Takes the whole preset because the no-frame rule is decided by the backdrop
 * and the enclosure together, and those sit in different halves of the record.
 *
 * Exported as lines, like the other two sections, so the preset editor's preview
 * renders the prompt's own words rather than a description of them.
 */
export function composeColourRules(palette: NodeImagePalette, preset: NodeImagePreset): string[] {
  const { colour, technical } = preset;

  const rules = stated([
    colour.colourMode === 'thematic' ? composePaletteRule(palette) : composeColourCountRule(colour),
    rule(NODE_IMAGE_BACKDROP_RULES, technical.backdrop),
    permission(NODE_IMAGE_GRADIENT_RULES, technical.gradientsAllowed),
    permission(NODE_IMAGE_TRANSPARENCY_RULES, technical.transparencyAllowed)
  ]);

  if (isUnframed(preset)) {
    rules.push(NODE_IMAGE_NO_FRAME_RULE);
  }

  return rules;
}

/**
 * The no-frame rule holds only when nothing else claims the region behind the
 * subject — otherwise it contradicts the backdrop or the enclosure.
 */
function isUnframed(preset: NodeImagePreset): boolean {
  return preset.technical.backdrop === 'transparent' && preset.content.enclosure === 'none';
}

/**
 * The colours are named but **not assigned jobs** (D40). An earlier draft gave
 * them roles — primary for the subject, accent for the one important thing —
 * which is a taxonomy a hand-picked palette does not have, and which fights the
 * preset's render mode.
 *
 * The list itself states the count, so no separate number is needed here.
 */
function composePaletteRule(palette: NodeImagePalette): string {
  return `Draw using these colours only — ${palette.ink.join(', ')}. Use them however the drawing needs; none is reserved for a particular purpose. Do not introduce colours of your own, and do not fall back on black or white unless they appear in that list.`;
}

/**
 * Fixed mode names no colours, so the count is the only thing left to say — and
 * counting distinct colours is something a model can actually do, which is what
 * earns this its place beside a rejected byte budget (D36).
 */
function composeColourCountRule(colour: NodeImagePresetColour): string | undefined {
  if (colour.paletteSize === 'unspecified') return undefined;

  return colour.paletteSize === 1
    ? 'Draw the whole image in a single colour.'
    : `Use exactly ${NUMBER_WORDS[colour.paletteSize]} distinct colours. Choose them to suit the subject.`;
}

const NUMBER_WORDS: Record<2 | 3 | 4, string> = { 2: 'two', 3: 'three', 4: 'four' };
