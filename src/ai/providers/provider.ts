/**
 * AI Provider Interface
 * Vendor-agnostic abstraction for AI services
 */

import type { AIResponse, ProviderMessage } from '../types';
import { GeminiAdapter } from './gemini-adapter';
import { OpenRouterAdapter } from './openrouter-adapter';

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * AI Provider interface
 * Implementations: GeminiAdapter, (future: OpenAIAdapter, ClaudeAdapter)
 */
export interface AIProvider {
  /** Provider name for logging/debugging */
  readonly name: string;

  /**
   * Send messages to the AI and get a response
   * @param messages - Conversation history
   * @param systemPrompt - System instructions (situational context)
   * @returns AI response with content and proposed actions
   */
  sendMessage(
    messages: ProviderMessage[],
    systemPrompt: string
  ): Promise<AIResponse>;
}

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

import type { ProviderType } from '../../core/main-types';

/** Configuration for creating a provider */
export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  model?: string;  // Optional: override default model
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an AI provider instance
 * @param config - Provider configuration
 * @returns Configured AI provider
 */
export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.type) {
    case 'gemini':
      return new GeminiAdapter(config.apiKey, config.model);

    case 'openrouter':
      return new OpenRouterAdapter(config.apiKey, config.model);

    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}
