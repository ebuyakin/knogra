/**
 * Image Provider Interface
 * Vendor-agnostic contract for drawing a note image from a prompt, and the
 * factory that picks the adapter.
 *
 * A sibling of `providers/provider.ts`, not an extension of it: `sendMessage`
 * is a text contract and an image call is a different one, so each vendor that
 * can draw gets a second, narrow adapter here (docs/ai/chat-image-generation.md
 * §4.1). Which vendors those are is stated once, on the registry descriptor
 * (`imageGeneration`), and resolved in `image-provider-resolution.ts`. What the
 * adapters share is in `adapter-helpers.ts`.
 */

import type { ProviderType } from '../../core/main-types';
import type { ImageBackground, ImageDetail, ImageShape } from '../../config/ai-settings';
import { GeminiImageAdapter } from './gemini-image-adapter';
import { OpenAIImageAdapter } from './openai-image-adapter';

// ============================================================================
// REQUEST AND RESULT
// ============================================================================

/** The chat panel's visible area in CSS pixels, measured when the user runs. */
export interface ImageFrame {
  width: number;
  height: number;
}

/** An existing image to change rather than draw afresh. */
export interface SourceImage {
  bytes: Blob;
  mimeType: string;
}

export interface ImageRequest {
  /** Drawing: the description with the style and technical sentences appended. Editing: the user's instruction, nothing else. */
  prompt: string;
  shape: ImageShape;
  detail: ImageDetail;
  /** Already reconciled with the provider: 'transparent' only reaches an adapter that supports it. */
  background: ImageBackground;
  /** What `shape: 'panel'` follows; adapters snap it to what their vendor accepts. */
  frame: ImageFrame;
  /** When present the request is an edit: the vendor changes this image as the prompt says, keeping its proportions. */
  source?: SourceImage;
}

export interface GeneratedImage {
  bytes: Blob;
  mimeType: string;
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * One implementation per vendor that can draw. Owns the request shape and the
 * reading of the vendor's reply; the orchestration in `image-generation.ts`
 * owns the prompt and what happens to the bytes.
 */
export interface ImageProvider {
  /** Provider name for logging/debugging */
  readonly name: string;
  /** Whether the vendor can leave the background out; otherwise 'transparent' is asked for as 'dark'. */
  readonly supportsTransparency: boolean;
  generateImage(request: ImageRequest): Promise<GeneratedImage>;
}

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

export interface ImageProviderConfig {
  type: ProviderType;
  apiKey: string;
  /** Always resolved: `image-provider-resolution.ts` falls back to the factory default. */
  model: string;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createImageProvider(config: ImageProviderConfig): ImageProvider {
  switch (config.type) {
    case 'gemini':
      return new GeminiImageAdapter(config.apiKey, config.model);

    case 'openai':
      return new OpenAIImageAdapter(config.apiKey, config.model);

    default:
      throw new Error(`No image adapter for provider: ${config.type}`);
  }
}
