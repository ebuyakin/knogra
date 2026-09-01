/**
 * Provider resolution
 *
 * Which provider answers a request, and with which key. Chat, equation
 * generation and node-image generation all ask the same question, and each used
 * to answer it with its own copy of the same if-chain.
 */

import type { ProviderType } from '../../core/main-types';
import { getSetting } from '../../config';
import type { ProviderDescriptor } from '../../config/ai-providers';
import { PROVIDER_REGISTRY, findProviderDescriptor } from '../../config/ai-providers';
import type { ProviderConfig } from './provider';

/**
 * The selected provider if it has a key, otherwise the first provider in
 * registry order that does. `null` when no key is configured anywhere.
 */
export function resolveProviderConfig(): ProviderConfig | null {
  const selected = findProviderDescriptor(getSetting('ai.provider') as ProviderType);
  const candidates = selected
    ? [selected, ...PROVIDER_REGISTRY.filter(provider => provider !== selected)]
    : PROVIDER_REGISTRY;

  for (const provider of candidates) {
    const apiKey = getSetting(provider.apiKeySettingKey) as string;
    if (!apiKey) continue;

    return {
      type: provider.type,
      apiKey,
      model: modelFor(provider)
    };
  }

  return null;
}

/** The selected provider's model, for messages that name it. Empty if unset. */
export function getSelectedProviderModel(): string {
  const selected = findProviderDescriptor(getSetting('ai.provider') as ProviderType);
  return selected ? modelFor(selected) : '';
}

/** A blanked-out model field falls back to the factory default rather than being sent empty. */
function modelFor(provider: ProviderDescriptor): string {
  return (getSetting(provider.modelSettingKey) as string).trim() || provider.defaultModel;
}
