/**
 * Node Image Prompt Composition
 *
 * Two messages, split along one line: the **system contract** is what the app
 * enforces and is true of every request Knogra will ever make, while the
 * **brief** is user-authored, varies per image, and nothing enforces it.
 *
 * This module owns the brief's assembly and the correction transcript. The
 * sections it assembles live one per module beside it — picture, drawing,
 * colour, size — because a knob belongs to exactly one section, and its
 * expansion, its builder and its heading change together.
 *
 * Shares nothing with chat. `ai/prompts.ts` and the chat action schema are not
 * touched by this feature — see docs/nodes-svg-images.md §13 (D18).
 *
 * The brief runs request → starting point → the picture → how it is drawn →
 * colour → size and complexity → extra instructions → style reference. Sections
 * are grouped by the question they answer, not by which half of the preset
 * record they came from: the record is shaped for editing, the prompt for a
 * model.
 *
 * See docs/node-image-generation.md §3–§6.
 */

import type { NodeImagePalette, NodeImagePreset } from '../../../core/node-image-types';
import type { ProviderMessage } from '../../types';
import { composeColourRules } from './colour-rules';
import { composeDrawingRules } from './drawing-rules';
import { stated } from './rule-primitives';
import { composeAspectRule, composeTechniqueRules } from './technique-rules';
import { NODE_IMAGE_SYSTEM_CONTRACT } from './system-contract';

export interface NodeImagePromptRequest {
  preset: NodeImagePreset;
  /** Resolved by the caller — see `styles/node-image-palette.ts`. */
  palette: NodeImagePalette;
  /** The sanitizer's cap, so the prompt cannot state a limit the app does not enforce. */
  maxBytes: number;
  /** What the user asked for. Carries the subject too — there is no separate title. */
  description: string;
  /**
   * The image already attached to this node, if any, with colour tokens already
   * resolved to hex — sending tokens would teach the model to answer in them.
   *
   * Sent on the first turn only: once the model has produced something, its own
   * output is what corrections work against.
   */
  startingPoint?: string;
  /**
   * Another node's image, offered as an example of the drawing style to match.
   * Colour tokens already resolved, and first turn only, as above.
   */
  styleReference?: string;
  /** Turns already exchanged, oldest first. Empty on a first request. */
  corrections: NodeImageCorrection[];
}

/**
 * One completed exchange: an image, and what the user asked to change about it.
 *
 * A correction is **plain text and nothing else**. It cannot reach a preset, so
 * it can never restate the drawing language — the contract says the original
 * specification stays in force, and this shape is what makes that true rather
 * than merely promised.
 */
export interface NodeImageCorrection {
  /** The sanitized SVG this correction is about. */
  svg: string;
  /** What the user asked to change. */
  text: string;
}

export interface NodeImagePrompt {
  system: string;
  /** The brief, then one assistant/user pair per correction. */
  messages: ProviderMessage[];
}

/**
 * Assembles a preset, a palette, and a request into the transcript sent.
 *
 * Pure: everything it needs arrives as a parameter, so composed output can be
 * read from the console with no provider, no theme lookup, and no storage.
 */
export function composeNodeImagePrompt(request: NodeImagePromptRequest): NodeImagePrompt {
  return {
    system: NODE_IMAGE_SYSTEM_CONTRACT,
    messages: [
      { role: 'user', content: composeBrief(request) },
      ...composeCorrectionTurns(request.corrections)
    ]
  };
}

/**
 * The user message: the request, then the drawing language to answer it in.
 *
 * Everything preset-derived lives here rather than in the contract. The line is
 * enforced-versus-unenforced: the sanitizer rejects a violation of the contract,
 * while nothing checks whether the drawing is actually isometric (D26).
 *
 * **The knob sentences carry no headings and no lead-ins.** Each expansion is
 * already a complete instruction, and a heading above a group of them only
 * invited a second sentence explaining what the group was for.
 *
 * The two attachments carry no heading either — each is introduced by a sentence
 * saying what to do with the SVG that follows, which a heading could not do.
 * `## Extra instructions` keeps one, being free prose with no such sentence.
 */
function composeBrief(request: NodeImagePromptRequest): string {
  const { preset } = request;
  const knobs = [
    ...composeDrawingRules(preset),
    ...composeTechniqueRules(preset),
    ...composeColourRules(request.palette, preset)
  ];

  const sections = [
    `${REQUEST_LEAD_IN} ${request.description.trim()}`,
    composeStartingPoint(request),
    knobs.length ? knobs.join('\n\n') : undefined
  ];

  const direction = preset.extraInstructions.trim();
  if (direction) {
    sections.push(`## Extra instructions\n${direction}`);
  }

  sections.push(
    composeStyleReference(request),
    `${composeAspectRule(preset.technical.aspect)} Keep the entire SVG text under ${formatByteCap(request.maxBytes)}.`,
    CLOSING_RULE
  );
  return stated(sections).join('\n\n');
}

/** KB below a megabyte, MB above it — "1024 KB" reads as a mistake. */
function formatByteCap(maxBytes: number): string {
  const kb = Math.max(1, Math.round(maxBytes / 1024));
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * The image already on the node, offered as something to revise rather than as
 * something the model produced.
 *
 * Stated honestly, because it may not be the model's work at all: an uploaded or
 * pasted image can break every rule the contract sets, and presenting it as a
 * previous answer would read as licence to break them again.
 *
 * Dropped once the conversation has a turn in it. The brief is recomposed on
 * every request, so leaving it in would re-send the whole image alongside a
 * correction history that has already superseded it.
 */
function composeStartingPoint(request: NodeImagePromptRequest): string | undefined {
  if (!request.startingPoint || request.corrections.length > 0) return undefined;

  return [
    'Here is the image you need to modify and improve according to the description above. It may have been drawn by hand rather than generated, so it will not necessarily follow the rules you have been given. Keep whatever the description does not ask you to change, bring the rest into line with the instructions, and return the complete SVG.',
    request.startingPoint
  ].join('\n\n');
}

/**
 * Another node's image, as an example of how to draw rather than what to draw.
 *
 * The subject is disowned explicitly: handed a picture, a model's first instinct
 * is to draw that picture.
 *
 * **After every knob line**, so the specification is stated first and the example
 * arrives as something to match within it rather than as a competing
 * instruction. It also keeps a large attachment from separating the request from
 * the rules that qualify it.
 *
 * Dropped after the first turn for the same reason as the starting point.
 */
function composeStyleReference(request: NodeImagePromptRequest): string | undefined {
  if (!request.styleReference || request.corrections.length > 0) return undefined;

  return [
    'Here is the image you should use as a style reference. Make your drawing similar to it in style and technique — line weight, the balance of filled shapes against outlines, how colour is used, and how much detail it carries — while following every instruction above. Its subject is irrelevant and must not appear in your drawing.',
    request.styleReference
  ].join('\n\n');
}

/**
 * The conversation after the brief: each correction preceded by the image it
 * corrects, which is what makes the contract's "the image you returned
 * immediately before it" resolve to something.
 *
 * **Only the newest image is sent in full.** One SVG can run to the byte cap, so
 * a transcript carrying every one of them would grow by a megabyte a turn to
 * re-send drawings the user has already rejected.
 *
 * The assistant turns are rebuilt as the JSON object the contract asks for
 * rather than replayed verbatim, so the transcript shows the model its own
 * output in the shape it was told to produce — including when the real reply
 * arrived unwrapped and the generator recovered it.
 */
function composeCorrectionTurns(corrections: NodeImageCorrection[]): ProviderMessage[] {
  return corrections.flatMap((correction, index): ProviderMessage[] => [
    {
      role: 'assistant',
      content: index === corrections.length - 1
        ? JSON.stringify({ type: 'svg', svg: correction.svg })
        : SUPERSEDED_IMAGE
    },
    { role: 'user', content: correction.text.trim() }
  ]);
}

/** Stands in for an image that a later correction has already replaced. */
const SUPERSEDED_IMAGE = '[An image was returned here. It has been superseded by a later correction and is omitted.]';

/**
 * Joined to the description with a colon, on one line: the verb governs the
 * description, so the two are one sentence.
 */
const REQUEST_LEAD_IN = 'Draw the SVG image as described here:';

/**
 * The one thing deliberately restated across the two messages. Recency is worth
 * a sentence; restating the whole contract is not.
 */
const CLOSING_RULE = 'Return the JSON object described in the system message, and nothing else.';
