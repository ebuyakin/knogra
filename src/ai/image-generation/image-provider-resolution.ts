/**
 * Image provider resolution
 *
 * Which provider draws a note image, and with which key and model. Unlike
 * `providers/provider-resolution.ts` there is no fallback chain: the image
 * provider is chosen explicitly in Settings, and an image costs real money per
 * call, so the user should know which vendor is drawing
 * (docs/ai/chat-image-generation.md §4.3).
 */

import { getSetting } from '../../config';
import { findProviderDescriptor, imageCapableProviders } from '../../config/ai-providers';
import type { ImageProviderConfig } from './image-provider';

/**
 * The configured image provider, or null when the feature is off ('none'),
 * the chosen provider cannot draw, or its key is missing.
 */
export function resolveImageProviderConfig(): ImageProviderConfig | null {
  const choice = getSetting('ai.imageProvider');
  if (choice === 'none') return null;

  const descriptor = findProviderDescriptor(choice);
  const capability = descriptor?.imageGeneration;
  if (!descriptor || !capability) return null;

  const apiKey = getSetting(descriptor.apiKeySettingKey) as string;
  if (!apiKey) return null;

  const model = (getSetting(capability.modelSettingKey) as string).trim() || capability.defaultModel;
  return { type: descriptor.type, apiKey, model };
}

export function isImageGenerationConfigured(): boolean {
  return resolveImageProviderConfig() !== null;
}

/**
 * Why Generate is unavailable, as one sentence for a disabled control's title.
 * Null when it is available.
 */
export function imageGenerationGap(): string | null {
  const choice = getSetting('ai.imageProvider');
  if (choice === 'none') {
    const names = imageCapableProviders().map(provider => provider.label).join(' or ');
    return `Choose an image provider (${names}) in Settings to generate images.`;
  }

  const descriptor = findProviderDescriptor(choice);
  if (!descriptor?.imageGeneration) {
    return `${descriptor?.label ?? choice} cannot generate images. Choose another image provider in Settings.`;
  }

  const apiKey = getSetting(descriptor.apiKeySettingKey) as string;
  if (!apiKey) return `Add your ${descriptor.label} API key in Settings to generate images.`;

  return null;
}
