/**
 * Shared provider response handling
 *
 * Vendors differ in how a request is sent, not in how the reply is read: every
 * adapter is given the same prompt contract, so every adapter gets back the same
 * fenced JSON block. Keeping the parsing here means the action vocabulary has
 * one definition rather than one per adapter.
 */

import type { ProposedAction } from '../types';
import { escapeInvalidUnicodeEscapes, normalizeActionEquation } from '../latex-sanitizer';
import { isDebug } from '../../config/debug-flags';

/** Action types the shelf can render. Anything else in the block is dropped. */
const VALID_ACTION_TYPES = [
  'include_existing',
  'create_connected',
  'connect_nodes',
  'update_property',
  'add_tag'
];

/**
 * Parse proposed actions from a model reply.
 *
 * `providerName` only labels the diagnostics, so a malformed reply can be traced
 * back to the vendor that produced it.
 */
export function parseProposedActions(content: string, providerName: string): ProposedAction[] {
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                      content.match(/\[[\s\S]*"type"\s*:\s*"[^"]+_[^"]+"[\s\S]*\]/);

    if (!jsonMatch) return [];

    const jsonStr = jsonMatch[1] ?? jsonMatch[0];

    if (isDebug('d_chat')) console.log(`[${providerName}] Raw JSON block:`, jsonStr);

    const parsed = JSON.parse(sanitizeLlmJson(jsonStr));

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        'type' in item &&
        VALID_ACTION_TYPES.includes((item as { type: string }).type)
    ).map(normalizeActionEquation) as ProposedAction[];
  } catch (error) {
    console.warn(`[${providerName}] Failed to parse actions:`, error);
    return [];
  }
}

/**
 * Repair the JSON faults models reliably produce when a value contains LaTeX.
 *
 * - Escape lone backslashes (`\nabla`, `\partial`, `\frac`)
 * - Leave already-escaped backslashes alone
 * - Escape invalid `\u` sequences (`\upsilon`, `\underline`) that abort the parse
 * - Drop trailing commas before `]` or `}`
 */
export function sanitizeLlmJson(json: string): string {
  const placeholder = '\x00ESC\x00';
  let result = json.split('\\\\').join(placeholder);
  result = result.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
  result = escapeInvalidUnicodeEscapes(result);
  result = result.split(placeholder).join('\\\\');
  return result.replace(/,\s*([}\]])/g, '$1');
}

/** The prose half of a reply: everything outside the JSON block. */
export function extractConversationalContent(content: string): string {
  return content
    .replace(/```json\s*[\s\S]*?\s*```/g, '')
    .trim();
}
