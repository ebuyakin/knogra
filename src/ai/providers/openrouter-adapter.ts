/**
 * OpenRouter Adapter
 * Implementation of AIProvider for OpenRouter API (OpenAI-compatible)
 * 
 * OpenRouter provides access to many models (GPT-4o, Claude, Gemini, Llama, etc.)
 * through a single OpenAI-compatible endpoint. Users bring their own API key.
 * 
 * Endpoint: https://openrouter.ai/api/v1/chat/completions
 * Model list: https://openrouter.ai/api/v1/models (public, no auth)
 */

import type { AIProvider } from './provider';
import type { AIResponse, ProviderMessage, ProposedAction } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';

/** Curated fallback list if model fetch fails */
const FALLBACK_MODELS: OpenRouterModel[] = [
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick' },
  { id: 'mistralai/mistral-medium-3', name: 'Mistral Medium 3' },
];

// ============================================================================
// TYPES
// ============================================================================

export interface OpenRouterModel {
  id: string;
  name: string;
}

// ============================================================================
// MODEL LIST CACHE
// ============================================================================

let cachedModels: OpenRouterModel[] | null = null;

/**
 * Fetch available models from OpenRouter API.
 * Cached in memory for the session. Returns fallback list on failure.
 */
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  if (cachedModels) return cachedModels;

  try {
    const res = await fetch(MODELS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const models: OpenRouterModel[] = (data.data ?? [])
      .filter((m: { id: string }) => m.id && !m.id.includes(':free'))
      .map((m: { id: string; name?: string }) => ({
        id: m.id,
        name: m.name ?? m.id
      }))
      .sort((a: OpenRouterModel, b: OpenRouterModel) => a.name.localeCompare(b.name));

    cachedModels = models;
    return models;
  } catch (error) {
    console.warn('[OpenRouter] Failed to fetch models, using fallback:', error);
    return FALLBACK_MODELS;
  }
}

// ============================================================================
// OPENROUTER ADAPTER
// ============================================================================

export class OpenRouterAdapter implements AIProvider {
  readonly name = 'openrouter';

  #apiKey: string;
  #model: string;

  constructor(apiKey: string, model?: string) {
    this.#apiKey = apiKey;
    this.#model = model ?? DEFAULT_MODEL;
  }

  /**
   * Send messages to OpenRouter and get a response.
   * Uses OpenAI-compatible chat completions format.
   */
  async sendMessage(
    messages: ProviderMessage[],
    systemPrompt: string
  ): Promise<AIResponse> {
    // Build messages array with system prompt first
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(msg => ({ role: msg.role, content: msg.content }))
    ];

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.#apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Knogra'
      },
      body: JSON.stringify({
        model: this.#model,
        messages: apiMessages
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content ?? '';

    const actions = this.#parseActions(textContent);

    return {
      content: this.#extractConversationalContent(textContent),
      actions
    };
  }

  /**
   * Parse proposed actions from AI response.
   * Looks for JSON block with actions array.
   */
  #parseActions(content: string): ProposedAction[] {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        content.match(/\[[\s\S]*"type"\s*:\s*"[^"]+_[^"]+"[\s\S]*\]/);

      if (!jsonMatch) return [];

      const jsonStr = jsonMatch[1] ?? jsonMatch[0];
      const sanitized = this.#sanitizeJson(jsonStr);
      const parsed = JSON.parse(sanitized);

      if (!Array.isArray(parsed)) return [];

      const validTypes = [
        'include_existing',
        'create_connected',
        'connect_nodes',
        'update_property',
        'add_tag'
      ];

      return parsed.filter(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          'type' in item &&
          validTypes.includes((item as { type: string }).type)
      ) as ProposedAction[];
    } catch (error) {
      console.warn('[OpenRouter] Failed to parse actions:', error);
      return [];
    }
  }

  /**
   * Sanitize LLM-generated JSON for common issues.
   * - Escape lone backslashes (LaTeX)
   * - Preserve already-escaped backslashes
   * - Remove trailing commas before ] or }
   */
  #sanitizeJson(json: string): string {
    const placeholder = '\x00ESC\x00';
    let result = json.split('\\\\').join(placeholder);
    result = result.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    result = result.split(placeholder).join('\\\\');
    return result.replace(/,\s*([}\]])/g, '$1');
  }

  /** Extract conversational content (remove JSON blocks) */
  #extractConversationalContent(content: string): string {
    return content
      .replace(/```json\s*[\s\S]*?\s*```/g, '')
      .trim();
  }
}
