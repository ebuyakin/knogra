/**
 * Node Image Colour Tokens
 *
 * Turns the literal colours a model returned into theme-relative tokens, and
 * back again at render time. This is what lets one drawing read correctly in
 * every theme without being regenerated (D32) — substitution is not
 * regeneration, so D4 still holds.
 *
 * **A text pass, not an SVG pass.** The contract requires every colour to be
 * six-digit hex, which makes `#rrggbb` unambiguous in the document text — so
 * neither direction needs to parse SVG, and a colour is found wherever it sits:
 * on a shape, in an inline `style`, or inside a `<style>` block. The one thing
 * that must not be rewritten is a same-document reference such as
 * `url(#abcdef)`, which is what `REFERENCE_PREFIX` guards.
 *
 * Tokenising happens when the user **accepts** an image, never during
 * generation: the correction conversation replays the previous SVG back to the
 * model, and a transcript full of `var(...)` would teach it to answer in tokens.
 *
 * See docs/node-image-generation.md §7.3–§7.4.
 */

import type { NodeImageColourMode, NodeImagePalette } from '../core/node-image-types';

/**
 * An image's SVG ready to display, export, or hand back to a model.
 *
 * The one place the "thematic images carry tokens, everything else carries
 * hex" rule is applied — the node design, the editor preview, the file export
 * and the style-reference picker all go through it, so the rule cannot drift
 * between them.
 *
 * The palette is the caller's to resolve: the render path holds a theme object
 * already, while the editor holds only an id.
 */
export function resolveImageColours(
  image: { svg: string; colourMode?: NodeImageColourMode },
  palette: NodeImagePalette
): string {
  return image.colourMode === 'thematic' ? applyImagePalette(image.svg, palette) : image.svg;
}

/** Colours are six-digit hex by contract, which is what makes a text pass safe. */
const HEX_COLOUR = /#[0-9a-fA-F]{6}\b/g;

/** A hex string in one of these positions is a reference, not a colour. */
const REFERENCE_PREFIX = /(?:url\(|href\s*=\s*["']?)$/i;

/** How far back to look for that prefix — longer than `xlink:href = "`. */
const PREFIX_WINDOW = 20;

const TOKEN_PATTERN = /var\(--knogra-image-(?:ink-([1-9]\d*)|surface),\s*(#[0-9a-fA-F]{6})\)/g;

export interface TokenisedImage {
  svg: string;
  /**
   * The largest distance any colour had to travel to reach its token, in OKLab
   * units. Near zero means the model used the palette it was given; a large
   * value means it ignored it and the image has been visibly altered.
   */
  maxShift: number;
}

/**
 * Rewrites every colour as the nearest palette entry, expressed as a token.
 *
 * **Unconditional**: every colour is snapped, not just the ones close to a
 * palette entry. A half-retinted image is worse than a slightly altered one,
 * and the model was told which colours to use — `maxShift` is how the caller
 * finds out that it did not listen.
 *
 * The surface is a snap target alongside the inks, so a `theme-surface` or
 * `contrast-fill` backdrop retints with everything else, and a mark drawn close
 * to the surface stays close to it in every theme rather than becoming visible
 * in one and not another.
 */
export function tokeniseImageColours(svg: string, palette: NodeImagePalette): TokenisedImage {
  const targets = buildTargets(palette);
  let maxShift = 0;

  const tokenised = svg.replace(HEX_COLOUR, (hex, offset: number) => {
    if (isReference(svg, offset)) return hex;

    const { target, distance } = findNearest(hex, targets);
    maxShift = Math.max(maxShift, distance);
    return `var(${target.token}, ${target.color})`;
  });

  return { svg: tokenised, maxShift };
}

/**
 * Resolves tokens against a palette, leaving anything else untouched.
 *
 * The fallback inside each token is used when the palette is shorter than the
 * token's index, which cannot happen for a built-in theme but keeps a truncated
 * or hand-edited palette rendering something sensible rather than nothing.
 *
 * **Palette size plays no part here.** An image carries tokens only for the
 * colours it actually used, and nothing at render time knows which preset
 * produced it (D14), so the full palette is always the substitution source.
 */
export function applyImagePalette(svg: string, palette: NodeImagePalette): string {
  return svg.replace(TOKEN_PATTERN, (_token, inkIndex: string | undefined, fallback: string) => {
    if (inkIndex === undefined) return palette.surface || fallback;
    return palette.ink[Number(inkIndex) - 1] ?? fallback;
  });
}

/** True when the hex at `offset` names a fragment rather than a colour. */
function isReference(svg: string, offset: number): boolean {
  return REFERENCE_PREFIX.test(svg.slice(Math.max(0, offset - PREFIX_WINDOW), offset));
}

// =============================================================================
// MANUAL RECOLOURING
// The other way to make an image thematic: the author states which palette slot
// each of its colours becomes.
//
// Deliberately **not** proximity-based like `tokeniseImageColours`. Snapping to
// the nearest palette entry preserves appearance, which is right for a drawing
// that was already asked to use the palette and drifted. An image brought in
// from elsewhere needs the opposite: a black glyph on a dark theme must become
// light, and the nearest palette colour to black is the darkest one there is.
// Proximity would make it invisible. Only the author knows which colour is the
// ink and which is the ground, so the author is asked.
// =============================================================================

/**
 * A colour that does not follow the theme.
 *
 * A small closed set rather than a picker: the job is "pin this to something
 * universal", which a handful of named colours answers, and a picker would
 * invite choosing a colour that fails against half the themes.
 */
export type ImageFixedColour = 'black' | 'white' | 'red' | 'green' | 'blue' | 'yellow';

/**
 * Tempered rather than pure sRGB primaries, which read as garish beside any
 * hand-picked palette. Black and white are exact, because those two are asked
 * for by name and anything else would be wrong.
 */
export const NODE_IMAGE_FIXED_COLOURS: Record<ImageFixedColour, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#d62828',
  green: '#2a9d3f',
  blue: '#1d6ff2',
  yellow: '#f2c53d'
};

/** A palette slot, resolved fresh in whatever theme the image is drawn in. */
export type ImagePaletteSlot = 'ink-1' | 'ink-2' | 'ink-3' | 'ink-4' | 'surface';

/**
 * What a source colour becomes.
 *
 * The three arms are the three answers: follow the theme, ignore the theme, or
 * keep what is already there. A fixed colour and `unchanged` both produce
 * literal hex — they differ only in whether the literal is chosen or inherited.
 *
 * Tokens and literals coexist in one document with no special handling, so an
 * image may follow the theme in part and ignore it in part.
 */
export type ImageColourSlot = ImagePaletteSlot | ImageFixedColour | 'unchanged';

/** True when the document still holds at least one theme-relative colour. */
export function hasColourTokens(svg: string): boolean {
  TOKEN_PATTERN.lastIndex = 0;
  return TOKEN_PATTERN.test(svg);
}

/**
 * One visually distinct colour in an image, and every literal that expresses it.
 *
 * Grouping is the point. A drawing tool emits `#000000`, `#010101` and `#0a0a0a`
 * for what the eye reads as one black, and gradients contribute a value per
 * stop, so an image an author would call two-colour routinely carries nine
 * literals. Listing those literals would make a four-colour limit reject images
 * that plainly qualify.
 */
export interface ImageColourGroup {
  /** The most-used literal in the group, and the swatch shown for it. */
  hex: string;
  /** Every literal folded into this group, `hex` included. */
  members: string[];
  /** How many times the group's members appear in the document. */
  count: number;
}

/**
 * Below this OKLab distance two colours are treated as the same colour.
 *
 * Tuned to swallow export noise and nothing else: a mid grey and a dark grey
 * stay apart, because an author who drew with both means both.
 */
const SAME_COLOUR_DISTANCE = 0.05;

/**
 * The distinct colours in an image, most used first.
 *
 * The order is what makes the common case a straight top-to-bottom fill: the
 * dominant colour is row one, and the palette is itself ordered by dominance.
 *
 * `maxGroups` bounds the clustering, which compares each colour against every
 * group found so far and is therefore quadratic in the number of distinct
 * colours. A traced or gradient-heavy SVG carries thousands, and a caller only
 * ever needs to know that there are too many — so it may ask for one more than
 * it can use and stop there. The result is longer than `maxGroups` exactly when
 * the image exceeded it.
 */
export function listImageColours(svg: string, maxGroups = Number.POSITIVE_INFINITY): ImageColourGroup[] {
  const counts = new Map<string, number>();

  for (const match of svg.matchAll(HEX_COLOUR)) {
    if (isReference(svg, match.index)) continue;
    const hex = match[0].toLowerCase();
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }

  const byUsage = [...counts.entries()].sort((first, second) => second[1] - first[1]);
  const groups: (ImageColourGroup & { lab: Oklab })[] = [];

  // Most-used first, so a group is always named by its dominant literal.
  for (const [hex, count] of byUsage) {
    const lab = toOklab(hex);
    const existing = groups.find(group => oklabDistance(group.lab, lab) < SAME_COLOUR_DISTANCE);

    if (existing) {
      existing.members.push(hex);
      existing.count += count;
      continue;
    }

    groups.push({ hex, members: [hex], count, lab });
    if (groups.length > maxGroups) break;
  }

  return groups.map(({ hex, members, count }) => ({ hex, members, count }));
}

/**
 * Rewrites each listed colour as whatever its slot names: a token for a palette
 * slot, a literal for a fixed colour.
 *
 * The fallback written into each token is the palette colour the slot resolves
 * to **now**, not the image's original colour: the token's whole purpose is that
 * the original is being abandoned, and a fallback showing it would resurrect the
 * problem the recolour was performed to fix.
 *
 * A group with no entry in the mapping, or one assigned `unchanged`, keeps its
 * literal hex.
 */
export function applyColourMapping(
  svg: string,
  groups: ImageColourGroup[],
  slots: Map<string, ImageColourSlot>,
  palette: NodeImagePalette
): string {
  const replacements = new Map<string, string>();

  for (const group of groups) {
    const slot = slots.get(group.hex);
    if (!slot || slot === 'unchanged') continue;

    const replacement = isFixedColour(slot)
      ? NODE_IMAGE_FIXED_COLOURS[slot]
      : tokenForSlot(slot, palette);

    for (const member of group.members) replacements.set(member, replacement);
  }

  if (replacements.size === 0) return svg;

  return svg.replace(HEX_COLOUR, (hex, offset: number) => {
    if (isReference(svg, offset)) return hex;
    return replacements.get(hex.toLowerCase()) ?? hex;
  });
}

export function isFixedColour(slot: ImageColourSlot): slot is ImageFixedColour {
  return slot in NODE_IMAGE_FIXED_COLOURS;
}

function tokenForSlot(slot: ImagePaletteSlot, palette: NodeImagePalette): string {
  if (slot === 'surface') {
    return `var(--knogra-image-surface, ${palette.surface})`;
  }

  const index = Number(slot.slice('ink-'.length));
  return `var(--knogra-image-ink-${index}, ${palette.ink[index - 1] ?? palette.surface})`;
}

interface ColourTarget {
  token: string;
  color: string;
  lab: Oklab;
}

function buildTargets(palette: NodeImagePalette): ColourTarget[] {
  const inks = palette.ink.map((color, index) => ({
    token: `--knogra-image-ink-${index + 1}`,
    color,
    lab: toOklab(color)
  }));

  return [...inks, { token: '--knogra-image-surface', color: palette.surface, lab: toOklab(palette.surface) }];
}

function findNearest(hex: string, targets: ColourTarget[]): { target: ColourTarget; distance: number } {
  const lab = toOklab(hex);
  let best = targets[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    const distance = oklabDistance(lab, target.lab);
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }

  return { target: best, distance: bestDistance };
}

// =============================================================================
// OKLAB
// Perceptual colour space: equal distances look equally different, which plain
// RGB arithmetic does not deliver — it calls colours close whose numbers are
// close, and those are frequently not the ones that look alike.
// =============================================================================

interface Oklab {
  l: number;
  a: number;
  b: number;
}

function oklabDistance(first: Oklab, second: Oklab): number {
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}

function toOklab(hex: string): Oklab {
  const r = gammaExpand(channel(hex, 1));
  const g = gammaExpand(channel(hex, 3));
  const b = gammaExpand(channel(hex, 5));

  const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    l: 0.2104542553 * long + 0.7936177850 * medium - 0.0040720468 * short,
    a: 1.9779984951 * long - 2.4285922050 * medium + 0.4505937099 * short,
    b: 0.0259040371 * long + 0.7827717662 * medium - 0.8086757660 * short
  };
}

function channel(hex: string, at: number): number {
  return parseInt(hex.slice(at, at + 2), 16) / 255;
}

/** sRGB is stored gamma-encoded; the colour maths needs linear light. */
function gammaExpand(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}
