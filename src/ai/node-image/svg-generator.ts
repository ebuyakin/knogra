/**
 * Node Image SVG Generator
 *
 * One call: a user description plus a selected preset in, raw SVG out. There is
 * no ideation stage — deciding what a concept should *look* like belongs in the
 * per-node chat, which already knows the graph (D12).
 *
 * Independent of chat sessions and chat persistence, and shares no prompt text
 * with them (D18). Receives a resolved preset and palette as parameters: it
 * never reads the registry and never resolves a theme, which is what keeps
 * `ai/` free of any import from `styles/`.
 *
 * The SVG returned here is **untrusted**. It has not been sanitized — the
 * caller passes it through `svg-sanitizer.ts` before anything stores or renders
 * it, exactly as it would a paste or an upload.
 *
 * See docs/node-image-templates.md §5.
 */

import type { ProviderType } from '../../core/main-types';
import type { NodeImagePalette, NodeImagePreset } from '../../core/node-image-types';
import { getSetting } from '../../config';
import { createProvider } from '../providers/provider';
import type { NodeImageCorrection } from './prompt/prompt-composer';
import { composeNodeImagePrompt } from './prompt/prompt-composer';

export interface NodeImageGenerationRequest {
  preset: NodeImagePreset;
  palette: NodeImagePalette;
  /** The sanitizer's cap, resolved by the caller and stated in the prompt. */
  maxBytes: number;
  description: string;
  /** The node's existing image, offered to the model as something to revise. */
  startingPoint?: string;
  /** Another node's image, offered as the drawing style to match. */
  styleReference?: string;
  /**
   * Turns already exchanged, oldest first. Empty on a first request.
   *
   * Held by the caller rather than here: the generator is stateless, so a
   * conversation that is abandoned leaves nothing behind to clear.
   */
  corrections: NodeImageCorrection[];
}

export interface NodeImageSvgResult {
  type: 'svg';
  /** Raw model output. Not sanitized. */
  svg: string;
}

/**
 * Not an instruction to the model: the contract has no clarification arm, so
 * every request returns a drawing and a vague description is fixed by a revision
 * turn rather than by a question. This survives for the empty-description guard
 * below, and as defensive parsing if a model volunteers one anyway.
 */
export interface NodeImageClarificationResult {
  type: 'clarification';
  message: string;
}

export type NodeImageGenerationResult = NodeImageSvgResult | NodeImageClarificationResult;

const EMPTY_DESCRIPTION = 'Describe the image you want to generate.';

export async function generateNodeImageSvg(
  request: NodeImageGenerationRequest
): Promise<NodeImageGenerationResult> {
  const description = request.description.trim();
  if (!description) {
    return { type: 'clarification', message: EMPTY_DESCRIPTION };
  }

  const providerConfig = resolveImageProviderConfig();
  if (!providerConfig) {
    throw new Error('Add an AI provider API key in Settings before generating images.');
  }

  const prompt = composeNodeImagePrompt({ ...request, description });
  const provider = createProvider(providerConfig);
  const response = await provider.sendMessage(prompt.messages, prompt.system);

  const result = parseGenerationResult(response.rawContent ?? response.content);
  if (result.type !== 'svg') return result;

  return {
    type: 'svg',
    svg: request.preset.technical.backdrop === 'transparent'
      ? stripFullBleedRect(result.svg)
      : result.svg
  };
}

// ============================================================================
// PARSING
// ============================================================================

function resolveImageProviderConfig(): { type: ProviderType; apiKey: string; model?: string } | null {
  const selectedProvider = getSetting('ai.provider') as ProviderType;
  const geminiKey = getSetting('ai.geminiApiKey') as string;
  const openrouterKey = getSetting('ai.openrouterApiKey') as string;

  if (selectedProvider === 'openrouter' && openrouterKey) {
    return {
      type: 'openrouter',
      apiKey: openrouterKey,
      model: getSetting('ai.openrouterModel') as string
    };
  }

  if (selectedProvider === 'gemini' && geminiKey) {
    return {
      type: 'gemini',
      apiKey: geminiKey,
      model: getSetting('ai.geminiModel') as string
    };
  }

  if (openrouterKey) {
    return {
      type: 'openrouter',
      apiKey: openrouterKey,
      model: getSetting('ai.openrouterModel') as string
    };
  }

  if (geminiKey) {
    return {
      type: 'gemini',
      apiKey: geminiKey,
      model: getSetting('ai.geminiModel') as string
    };
  }

  return null;
}

function parseGenerationResult(content: string): NodeImageGenerationResult {
  const jsonText = extractJsonObject(content.trim());

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as { type?: unknown; svg?: unknown; message?: unknown };
      if (parsed.type === 'svg' && typeof parsed.svg === 'string' && containsSvgElement(parsed.svg)) {
        return { type: 'svg', svg: parsed.svg.trim() };
      }
      if (parsed.type === 'clarification' && typeof parsed.message === 'string' && parsed.message.trim()) {
        return { type: 'clarification', message: parsed.message.trim() };
      }
    } catch {
      // Fall through: a malformed object is a capability failure, not a result.
    }
  }

  // Some models return the markup with no JSON wrapper at all. That is still a
  // usable answer, so take it rather than failing the request.
  const bare = extractSvgElement(content);
  if (bare) return { type: 'svg', svg: bare };

  throw new Error(capabilityMessage());
}

/**
 * Names the model, because this failure is almost always the model rather than
 * the request: weaker models answer an SVG prompt with prose or with markup
 * wrapped in commentary, and no amount of rewording fixes it.
 */
function capabilityMessage(): string {
  const provider = getSetting('ai.provider');
  const model = provider === 'openrouter'
    ? getSetting('ai.openrouterModel')
    : getSetting('ai.geminiModel');

  return `${model || 'The selected model'} did not return an SVG. Some models cannot draw SVG reliably — try a stronger model in Settings.`;
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

function containsSvgElement(text: string): boolean {
  return /<svg\b/i.test(text) && /<\/svg\s*>/i.test(text);
}

function extractSvgElement(text: string): string | null {
  const match = text.match(/<svg\b[\s\S]*<\/svg\s*>/i);
  return match ? match[0].trim() : null;
}

// ============================================================================
// BACKDROP STRIP
// ============================================================================

/**
 * Removes a leading full-bleed `<rect>` when the preset asked for a transparent
 * backdrop. Models emit one regardless of instruction.
 *
 * Done here rather than in the sanitizer, which stays a pure security boundary,
 * and only for generated images — a paste or an upload is user material and is
 * never altered.
 *
 * **Deliberately string-based, not DOM-based.** `DOMParser` expands entity
 * declarations during the parse, so parsing here would defeat the billion-laughs
 * check that the sanitizer performs on raw text downstream. The regex touches
 * only a rect that is the very first element in the document, which is the only
 * position a background rect can occupy.
 */
function stripFullBleedRect(svg: string): string {
  const match = svg.match(/^(\s*<svg\b[^>]*>\s*)(<rect\b[^>]*?(?:\/>|>\s*<\/rect\s*>))/i);
  if (!match) return svg;

  const [, opening, rect] = match;
  if (!coversViewBox(rect, svg)) return svg;

  return opening + svg.slice(match[0].length);
}

function coversViewBox(rect: string, svg: string): boolean {
  const origin = readNumber(rect, 'x') ?? 0;
  const originY = readNumber(rect, 'y') ?? 0;
  if (origin > 0 || originY > 0) return false;

  const width = readLength(rect, 'width');
  const height = readLength(rect, 'height');
  if (width === null || height === null) return false;

  const [, , boxWidth, boxHeight] = readViewBox(svg) ?? [0, 0, 100, 100];
  return width >= boxWidth && height >= boxHeight;
}

/** A percentage length is resolved against the viewBox, so 100% counts as full coverage. */
function readLength(element: string, attribute: string): number | null {
  const raw = readAttribute(element, attribute);
  if (raw === null) return null;
  if (raw.trim().endsWith('%')) {
    const percent = Number.parseFloat(raw);
    return Number.isFinite(percent) && percent >= 100 ? Number.POSITIVE_INFINITY : null;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

function readNumber(element: string, attribute: string): number | null {
  const raw = readAttribute(element, attribute);
  if (raw === null) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

function readAttribute(element: string, attribute: string): string | null {
  const match = element.match(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : null;
}

function readViewBox(svg: string): [number, number, number, number] | null {
  const raw = readAttribute(svg.slice(0, svg.indexOf('>') + 1), 'viewBox');
  if (!raw) return null;

  const parts = raw.trim().split(/[\s,]+/).map(Number.parseFloat);
  return parts.length === 4 && parts.every(Number.isFinite)
    ? [parts[0], parts[1], parts[2], parts[3]]
    : null;
}
