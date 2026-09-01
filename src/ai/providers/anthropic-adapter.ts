/**
 * Anthropic Adapter
 * Implementation of AIProvider for the Claude Messages API.
 *
 * Endpoint: https://api.anthropic.com/v1/messages
 *
 * Uses the native Messages API rather than Anthropic's OpenAI-compatible
 * endpoint, which Anthropic documents as a testing surface rather than a
 * production one.
 */

import type { AIProvider } from './provider';
import type { AIResponse, ProviderMessage } from '../types';
import { getSetting } from '../../config';
import type { ClaudeEffort } from '../../config/ai-settings';
import { extractConversationalContent, parseProposedActions } from './response-parsing';
import { fetchWithTimeout } from './request-timeout';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}

export class AnthropicAdapter implements AIProvider {
  readonly name = 'anthropic';

  #apiKey: string;
  #model: string;

  constructor(apiKey: string, model: string) {
    this.#apiKey = apiKey;
    this.#model = model;
  }

  async sendMessage(
    messages: ProviderMessage[],
    systemPrompt: string
  ): Promise<AIResponse> {
    const effort = getSetting('ai.anthropicEffort') as ClaudeEffort;
    const maxTokens = getSetting('ai.anthropicMaxTokens');

    // Claude takes one system prompt as a top-level field and accepts no system
    // role in the conversation, so any such message is folded into it.
    const system = [systemPrompt, ...messages.filter(msg => msg.role === 'system').map(msg => msg.content)]
      .join('\n\n');

    const conversation = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({ role: msg.role, content: msg.content }));

    const response = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.#apiKey,
        'anthropic-version': API_VERSION,
        // Without this the CORS preflight is refused outright.
        'anthropic-dangerous-direct-browser-access': 'true',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: maxTokens,
        system,
        messages: conversation,
        output_config: { effort }
      })
    }, 'Anthropic');

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    // A truncated reply loses its JSON action block silently, so it is an error.
    if (data.stop_reason === 'max_tokens') {
      throw new Error(
        `The reply was cut off at the ${maxTokens}-token limit. Raise Max Output Tokens in Settings, ask for a shorter answer, or split the request.`
      );
    }

    const textContent: string = (data.content ?? [])
      .filter((block: AnthropicContentBlock) => block.type === 'text')
      .map((block: AnthropicContentBlock) => block.text ?? '')
      .join('');

    return {
      content: extractConversationalContent(textContent),
      rawContent: textContent,
      actions: parseProposedActions(textContent, this.name)
    };
  }
}
