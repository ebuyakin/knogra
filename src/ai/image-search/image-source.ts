/**
 * Image Source
 * Vendor-agnostic contract for retrieving real (non-generated) images,
 * plus a small registry. First implementation: Wikimedia.
 *
 * Retrieval is deterministic and provider-independent: no LLM is required.
 */

import type { ImageAttribution, NoteImageMimeType } from '../../core/chat-types';

/** A single image result from a source, before download/persistence. */
export interface ImageCandidate {
  /** Directly embeddable image URL, already a reasonable display size. */
  sourceUrl: string;
  /** Full-resolution original URL (for the lightbox). */
  fullUrl?: string;
  title: string;
  mimeType: NoteImageMimeType;
  width?: number;
  height?: number;
  attribution: ImageAttribution;
}

/** Options for a search request. */
export interface ImageSearchOptions {
  limit?: number;
  /** sourceUrls to skip — images already present in the chat. */
  exclude?: Set<string>;
}

/** A retrievable image source (Wikimedia now; future Openverse/museums). */
export interface ImageSource {
  readonly id: string;
  readonly name: string;
  search(query: string, opts?: ImageSearchOptions): Promise<ImageCandidate[]>;
}

const registry = new Map<string, ImageSource>();

/** Register an image source implementation. */
export function registerImageSource(source: ImageSource): void {
  registry.set(source.id, source);
}

/** All registered image sources, in registration order. */
export function getImageSources(): ImageSource[] {
  return [...registry.values()];
}
