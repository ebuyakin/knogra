/**
 * Image Search
 * Orchestration: search a registered source, download bytes, and build chat
 * image attachments. No LLM involved; works with no API key configured.
 */

import type { ChatImageAttachment } from '../../core/chat-types';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';
import { getImageSources, registerImageSource } from './image-source';
import type { ImageCandidate } from './image-source';
import { wikimediaSource } from './wikimedia-source';

registerImageSource(wikimediaSource);

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** Search options for image retrieval. */
export interface RetrieveOptions {
  limit?: number;
  /** sourceUrls to skip — images already present in the chat. */
  exclude?: Set<string>;
}

/** Search the first registered image source. */
export async function searchImages(query: string, opts?: RetrieveOptions): Promise<ImageCandidate[]> {
  const source = getImageSources()[0];
  if (!source) return [];
  const limit = opts?.limit ?? getSetting('ai.imageResultCount');
  const candidates = await source.search(query, { limit, exclude: opts?.exclude });
  if (isDebug('d_image')) {
    console.log(`[image-search] ${candidates.length} candidates for "${query}"`);
  }
  return candidates;
}

/** Fetch image bytes and encode as a base64 data URL. Returns null on failure. */
async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Build a chat attachment from a search candidate.
 * When `store` is true the (server-downscaled) bytes are downloaded and kept so
 * the image works offline; otherwise only the source link is kept and the image
 * is fetched on each display. The source URL is always retained, so a store
 * failure degrades gracefully to link-only.
 */
export async function toRetrievedAttachment(
  candidate: ImageCandidate,
  opts: { store: boolean }
): Promise<ChatImageAttachment> {
  const dataUrl = opts.store ? (await fetchAsDataUrl(candidate.sourceUrl)) ?? undefined : undefined;
  return {
    id: generateAttachmentId(),
    type: 'image',
    origin: 'retrieved',
    mimeType: candidate.mimeType,
    name: candidate.title,
    width: candidate.width ?? 0,
    height: candidate.height ?? 0,
    dataUrl,
    sourceUrl: candidate.sourceUrl,
    fullUrl: candidate.fullUrl,
    attribution: candidate.attribution,
  };
}

/**
 * Download and persist bytes for a link-only retrieved attachment (lazy
 * localise). Returns the updated attachment with `dataUrl` filled, or null if
 * the bytes could not be fetched (leaving it link-only).
 */
export async function localiseAttachment(
  attachment: ChatImageAttachment
): Promise<ChatImageAttachment | null> {
  if (!attachment.sourceUrl) return null;
  const dataUrl = await fetchAsDataUrl(attachment.sourceUrl);
  if (!dataUrl) return null;
  return { ...attachment, dataUrl };
}
