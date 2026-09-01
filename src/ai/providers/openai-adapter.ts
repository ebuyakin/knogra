/**
 * OpenAI Adapter
 * Implementation of AIProvider for the OpenAI Responses API.
 *
 * Endpoint: https://api.openai.com/v1/responses
 *
 * Responses rather than Chat Completions because it is where OpenAI ships current
 * capability: the hosted web search tool and the reasoning controls are not
 * offered on Chat Completions at all.
 */

import type { AIProvider } from './provider';
import type { AIResponse, ProviderMessage } from '../types';
import { getSetting } from '../../config';
import type { ReasoningEffort } from '../../config/ai-settings';
import { extractConversationalContent, parseProposedActions } from './response-parsing';
import { ProviderTimeoutError, fetchWithTimeout } from './request-timeout';

const API_URL = 'https://api.openai.com/v1/responses';

interface ResponseContentBlock {
  type?: string;
  text?: string;
  refusal?: string;
}

interface ResponseOutputItem {
  type?: string;
  content?: ResponseContentBlock[];
}

export class OpenAIAdapter implements AIProvider {
  readonly name = 'openai';

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
    const reasoningEffort = getSetting('ai.openaiReasoningEffort') as ReasoningEffort;
    const webSearchEnabled = getSetting('ai.webSearchEnabled');

    const body: Record<string, unknown> = {
      model: this.#model,
      instructions: systemPrompt,
      input: messages.map(msg => ({ role: msg.role, content: msg.content })),
      reasoning: { effort: reasoningEffort },
      // Defaults to true, which would leave graph content on OpenAI's servers.
      store: false
    };

    if (webSearchEnabled) {
      body.tools = [{ type: 'web_search' }];
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }, 'OpenAI');
    } catch (error) {
      if (error instanceof ProviderTimeoutError) throw error;

      // OpenAI omits CORS headers on its auth failures, so the browser blocks the
      // body and a bad key arrives here as an unreadable network error.
      throw new Error(
        'Could not reach OpenAI. This usually means the API key is invalid — check it in Settings.'
      );
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    if (data.status === 'incomplete') {
      throw new Error(incompleteMessage(data.incomplete_details?.reason));
    }

    const refusal = findRefusal(data.output ?? []);
    if (refusal) throw new Error(`OpenAI declined the request: ${refusal}`);

    const textContent = collectOutputText(data.output ?? []);

    return {
      content: extractConversationalContent(textContent),
      rawContent: textContent,
      actions: parseProposedActions(textContent, this.name)
    };
  }
}

/**
 * `output` mixes reasoning and tool-call items in with the assistant message and
 * its order is not guaranteed, so every `output_text` block is gathered rather
 * than a fixed position read. The SDK's `output_text` shortcut is not in the raw
 * JSON.
 */
function collectOutputText(output: ResponseOutputItem[]): string {
  return output
    .filter(item => item.type === 'message')
    .flatMap(item => item.content ?? [])
    .filter(block => block.type === 'output_text')
    .map(block => block.text ?? '')
    .join('');
}

function findRefusal(output: ResponseOutputItem[]): string | null {
  for (const item of output) {
    for (const block of item.content ?? []) {
      if (block.type === 'refusal' && block.refusal) return block.refusal;
    }
  }
  return null;
}

function incompleteMessage(reason: unknown): string {
  if (reason === 'max_output_tokens') {
    return 'The reply was cut off at the model\'s output limit. Ask for a shorter answer, or split the request.';
  }
  if (reason === 'content_filter') {
    return 'OpenAI stopped the reply because it was flagged by the content filter.';
  }
  return 'OpenAI returned an incomplete reply.';
}
