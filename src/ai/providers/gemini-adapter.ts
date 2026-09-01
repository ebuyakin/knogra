/**
 * Gemini Adapter
 * Implementation of AIProvider for Google Gemini API
 */

import { GoogleGenAI } from '@google/genai';
import type { AIProvider } from './provider';
import type { AIResponse, ProviderMessage } from '../types';
import { getSetting } from '../../config';
import { extractConversationalContent, parseProposedActions } from './response-parsing';
import { ProviderTimeoutError, createTimeoutSignal } from './request-timeout';
import type { ThinkingLevel } from '../../config/ai-settings';

// ============================================================================
// CONSTANTS
// ============================================================================

// ============================================================================
// GEMINI ADAPTER
// ============================================================================

export class GeminiAdapter implements AIProvider {
  readonly name = 'gemini';
  
  #client: GoogleGenAI;
  #model: string;

  constructor(apiKey: string, model: string) {
    this.#client = new GoogleGenAI({ apiKey });
    this.#model = model;
  }

  /**
   * Send messages to Gemini and get a response
   */
  async sendMessage(
    messages: ProviderMessage[],
    systemPrompt: string
  ): Promise<AIResponse> {
    // Get settings
    const webSearchEnabled = getSetting('ai.webSearchEnabled');
    const thinkingLevel = getSetting('ai.thinkingLevel') as ThinkingLevel;

    // Build contents array from messages
    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }]
    }));

    // Build tools array
    const tools: Record<string, unknown>[] = [];
    if (webSearchEnabled) {
      tools.push({ googleSearch: {} });
    }

    // Build config
    const config: Record<string, unknown> = {
      systemInstruction: systemPrompt,
      thinkingConfig: {
        thinkingLevel: thinkingLevel
      }
    };

    if (tools.length > 0) {
      config.tools = tools;
    }

    // Make API call
    const { signal, done } = createTimeoutSignal();
    let response;
    try {
      response = await this.#client.models.generateContent({
        model: this.#model,
        contents,
        config: { ...config, abortSignal: signal }
      });
    } catch (error) {
      if (signal.aborted) throw new ProviderTimeoutError('Gemini');
      throw error;
    } finally {
      done();
    }

    // Extract text content
    const textContent = response.text ?? '';

    return {
      content: extractConversationalContent(textContent),
      rawContent: textContent,
      actions: parseProposedActions(textContent, this.name)
    };
  }
}
