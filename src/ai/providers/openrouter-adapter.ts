/**
 * OpenRouter Adapter
 * Implementation of AIProvider for OpenRouter API (OpenAI-compatible)
 * 
 * OpenRouter provides access to many models (GPT-4o, Claude, Gemini, Llama, etc.)
 * through a single OpenAI-compatible endpoint. Users bring their own API key.
 * 
 * Endpoint: https://openrouter.ai/api/v1/chat/completions
 */

import type { AIProvider } from './provider';
import type { AIResponse, ProviderMessage } from '../types';
import { extractConversationalContent, parseProposedActions } from './response-parsing';
import { fetchWithTimeout } from './request-timeout';

// ============================================================================
// CONSTANTS
// ============================================================================

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ============================================================================
// OPENROUTER ADAPTER
// ============================================================================

export class OpenRouterAdapter implements AIProvider {
  readonly name = 'openrouter';

  #apiKey: string;
  #model: string;

  constructor(apiKey: string, model: string) {
    this.#apiKey = apiKey;
    this.#model = model;
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

    const response = await fetchWithTimeout(API_URL, {
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
    }, 'OpenRouter');

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content ?? '';

    return {
      content: extractConversationalContent(textContent),
      rawContent: textContent,
      actions: parseProposedActions(textContent, this.name)
    };
  }
}
