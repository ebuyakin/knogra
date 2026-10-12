/**
 * AI Provider Registry
 *
 * The one place that knows which providers exist. Lives in `config` rather than
 * `ai` because it is settings metadata, and because `ai` already imports
 * `config` — a registry in `ai` that `config` had to read would close a cycle.
 *
 * Holds no default model: those belong to `AI_DEFAULTS` in `ai-settings.ts`,
 * and a second copy here would be a second source of truth.
 *
 * Adding a provider: one entry here, two fields on `AISettings`, one adapter,
 * one case in `createProvider()`. Nothing else enumerates providers.
 */

import type { ProviderType } from '../core/main-types';
import type { SettingKey } from './index';
import { AI_DEFAULTS } from './ai-settings';

export interface ProviderDescriptor {
  readonly type: ProviderType;
  /** Shown in the provider dropdown. */
  readonly label: string;
  readonly apiKeySettingKey: SettingKey;
  readonly modelSettingKey: SettingKey;
  readonly apiKeyLabel: string;
  readonly apiKeyDescription: string;
  readonly modelLabel: string;
  /** Referenced, never retyped: `AI_DEFAULTS` is the only place a model name is written. */
  readonly defaultModel: string;
  /**
   * Present when the vendor has an image generation endpoint the app calls
   * (docs/ai/chat-image-generation.md §4.2). Absent means the provider cannot
   * draw: it is left out of the image provider select and never resolved for it.
   */
  readonly imageGeneration?: ImageGenerationCapability;
}

export interface ImageGenerationCapability {
  readonly modelSettingKey: SettingKey;
  readonly modelLabel: string;
  /** Referenced from `AI_DEFAULTS`, like `defaultModel`. */
  readonly defaultModel: string;
}

/** Order is the fallback preference when the selected provider has no key. */
export const PROVIDER_REGISTRY: readonly ProviderDescriptor[] = [
  {
    type: 'gemini',
    label: 'Gemini',
    apiKeySettingKey: 'ai.geminiApiKey',
    modelSettingKey: 'ai.geminiModel',
    apiKeyLabel: 'Gemini API Key',
    apiKeyDescription: 'Your Google Gemini API key',
    modelLabel: 'Gemini Model',
    defaultModel: AI_DEFAULTS.geminiModel,
    imageGeneration: {
      modelSettingKey: 'ai.geminiImageModel',
      modelLabel: 'Gemini Image Model',
      defaultModel: AI_DEFAULTS.geminiImageModel
    }
  },
  {
    type: 'openai',
    label: 'OpenAI',
    apiKeySettingKey: 'ai.openaiApiKey',
    modelSettingKey: 'ai.openaiModel',
    apiKeyLabel: 'OpenAI API Key',
    apiKeyDescription: 'Your OpenAI API key',
    modelLabel: 'OpenAI Model',
    defaultModel: AI_DEFAULTS.openaiModel,
    imageGeneration: {
      modelSettingKey: 'ai.openaiImageModel',
      modelLabel: 'OpenAI Image Model',
      defaultModel: AI_DEFAULTS.openaiImageModel
    }
  },
  {
    type: 'anthropic',
    label: 'Claude',
    apiKeySettingKey: 'ai.anthropicApiKey',
    modelSettingKey: 'ai.anthropicModel',
    apiKeyLabel: 'Anthropic API Key',
    apiKeyDescription: 'Your Anthropic API key',
    modelLabel: 'Anthropic Model',
    defaultModel: AI_DEFAULTS.anthropicModel
  },
  {
    type: 'openrouter',
    label: 'OpenRouter',
    apiKeySettingKey: 'ai.openrouterApiKey',
    modelSettingKey: 'ai.openrouterModel',
    apiKeyLabel: 'OpenRouter API Key',
    apiKeyDescription: 'Your OpenRouter API key',
    modelLabel: 'OpenRouter Model',
    defaultModel: AI_DEFAULTS.openrouterModel
  }
];

export function findProviderDescriptor(type: ProviderType): ProviderDescriptor | undefined {
  return PROVIDER_REGISTRY.find(provider => provider.type === type);
}

/** The providers that can draw, in registry order. */
export function imageCapableProviders(): ProviderDescriptor[] {
  return PROVIDER_REGISTRY.filter(provider => provider.imageGeneration !== undefined);
}

/**
 * Every API key setting. Used by the workspace export blocklist and the
 * factory-reset keep-list, so neither has to be maintained by hand.
 */
export const PROVIDER_API_KEY_SETTING_KEYS: readonly SettingKey[] =
  PROVIDER_REGISTRY.map(provider => provider.apiKeySettingKey);
