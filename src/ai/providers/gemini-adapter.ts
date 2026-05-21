/**
 * Gemini Adapter
 * Implementation of AIProvider for Google Gemini API
 */

import { GoogleGenAI } from '@google/genai';
import type { AIProvider } from './provider';
import type { AIResponse, ProviderMessage, ProposedAction } from '../types';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';
import type { ThinkingLevel } from '../../config/ai-settings';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MODEL = 'gemini-3-flash-preview';

// ============================================================================
// GEMINI ADAPTER
// ============================================================================

export class GeminiAdapter implements AIProvider {
  readonly name = 'gemini';
  
  #client: GoogleGenAI;
  #model: string;

  constructor(apiKey: string, model?: string) {
    this.#client = new GoogleGenAI({ apiKey });
    this.#model = model ?? DEFAULT_MODEL;
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
    const response = await this.#client.models.generateContent({
      model: this.#model,
      contents,
      config
    });

    // Extract text content
    const textContent = response.text ?? '';

    // Parse actions from response
    const actions = this.#parseActions(textContent);

    return {
      content: this.#extractConversationalContent(textContent),
      actions
    };
  }

  /**
   * Parse proposed actions from AI response
   * Looks for JSON block with actions array
   */
  #parseActions(content: string): ProposedAction[] {
    try {
      // Look for JSON block in response (```json ... ``` or raw JSON array)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        content.match(/\[[\s\S]*"type"\s*:\s*"[^"]+_[^"]+"[\s\S]*\]/);
      
      if (!jsonMatch) {
        return [];
      }

      const jsonStr = jsonMatch[1] ?? jsonMatch[0];

      if (isDebug('d_chat')) console.log('[GeminiAdapter] Raw JSON block:', jsonStr);

      // Sanitize common LLM JSON issues before parsing
      const sanitized = this.#sanitizeJson(jsonStr);

      const parsed = JSON.parse(sanitized);

      // Validate it's an array of actions
      if (!Array.isArray(parsed)) {
        return [];
      }

      // Filter to valid action types
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
      console.warn('[GeminiAdapter] Failed to parse actions:', error);
      return [];
    }
  }

  /**
   * Sanitize LLM-generated JSON for common issues
   * - Escape lone backslashes (LaTeX: \nabla, \partial, \frac, etc.)
   * - Preserve already-escaped backslashes (\\mu stays \\mu)
   * - Remove trailing commas before ] or }
   */
  #sanitizeJson(json: string): string {
    // Step 1: Protect already-escaped backslashes
    const placeholder = '\x00ESC\x00';
    let result = json.split('\\\\').join(placeholder);

    // Step 2: Escape lone backslashes not followed by valid JSON escape chars
    result = result.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

    // Step 3: Restore already-escaped backslashes
    result = result.split(placeholder).join('\\\\');

    // Step 4: Remove trailing commas
    return result.replace(/,\s*([}\]])/g, '$1');
  }

  /**
   * Extract conversational content (remove JSON blocks)
   */
  #extractConversationalContent(content: string): string {
    // Remove JSON code blocks
    return content
      .replace(/```json\s*[\s\S]*?\s*```/g, '')
      .trim();
  }
}
