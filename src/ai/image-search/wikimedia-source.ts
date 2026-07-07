/**
 * Wikimedia Image Source
 * Keyless, CORS-direct retrieval from Wikipedia / Wikimedia Commons.
 *
 * Two strategies, merged:
 *  - Entity/portrait  → the matching Wikipedia article's lead image (pageimages).
 *  - Concept/diagram  → Commons File-namespace search.
 * The article lead is placed first (it fixes Commons' imperfect top ranking for
 * named subjects); Commons search fills the remaining slots.
 */

import type { ImageAttribution, NoteImageMimeType } from '../../core/chat-types';
import type { ImageCandidate, ImageSource } from './image-source';
import { isDebug } from '../../config/debug-flags';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const THUMB_WIDTH = 512;
const MAX_SEARCH_PAGES = 5;

// ============================================================================
// RESPONSE SHAPES (minimal — only the fields we read)
// ============================================================================

interface WikiImageInfo {
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  url?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
}

interface WikiPage {
  title?: string;
  pageimage?: string;
  index?: number;
  imageinfo?: WikiImageInfo[];
}

interface WikiResponse {
  query?: { pages?: Record<string, WikiPage> };
}

// ============================================================================
// HELPERS
// ============================================================================

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function mimeFromUrl(url: string): NoteImageMimeType {
  const u = url.toLowerCase();
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  if (u.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

async function fetchJson(url: string): Promise<WikiResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
  return res.json() as Promise<WikiResponse>;
}

/** Pages come keyed by pageid; sort by the `index` field for true rank order. */
function pagesInIndexOrder(resp: WikiResponse): WikiPage[] {
  const pages = resp.query?.pages ? Object.values(resp.query.pages) : [];
  return pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

function toCandidate(page: WikiPage): ImageCandidate | null {
  const info = page.imageinfo?.[0];
  if (!info?.thumburl) return null;

  const meta = info.extmetadata ?? {};
  const attribution: ImageAttribution = {
    sourceName: 'Wikimedia Commons',
    sourcePageUrl: info.descriptionurl,
    author: meta.Artist?.value ? stripHtml(meta.Artist.value) : undefined,
    license: meta.LicenseShortName?.value,
    licenseUrl: meta.LicenseUrl?.value,
    attributionRequired: meta.AttributionRequired?.value === 'true',
  };

  return {
    sourceUrl: info.thumburl,
    fullUrl: info.url,
    title: (page.title ?? '').replace(/^File:/, ''),
    mimeType: mimeFromUrl(info.thumburl),
    width: info.thumbwidth,
    height: info.thumbheight,
    attribution,
  };
}

// ============================================================================
// STRATEGIES
// ============================================================================

/** Entity strategy: the lead image of the matching Wikipedia article. */
async function fetchArticleLeadImage(query: string): Promise<ImageCandidate | null> {
  const url = `${WIKIPEDIA_API}?action=query&titles=${encodeURIComponent(query)}` +
    `&prop=pageimages&piprop=name&redirects=1&format=json&origin=*`;
  const resp = await fetchJson(url);
  const fileName = pagesInIndexOrder(resp)[0]?.pageimage;
  if (!fileName) return null;
  return fetchFileCandidate(`File:${fileName}`);
}

/** Fetch imageinfo (url + license) for a specific File: title. */
async function fetchFileCandidate(fileTitle: string): Promise<ImageCandidate | null> {
  const url = `${WIKIPEDIA_API}?action=query&titles=${encodeURIComponent(fileTitle)}` +
    `&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize&iiurlwidth=${THUMB_WIDTH}&format=json&origin=*`;
  const resp = await fetchJson(url);
  const page = pagesInIndexOrder(resp)[0];
  return page ? toCandidate(page) : null;
}

/** Concept strategy: Commons File-namespace search. */
async function fetchCommonsSearch(query: string, limit: number, offset: number): Promise<ImageCandidate[]> {
  const offsetParam = offset > 0 ? `&gsroffset=${offset}` : '';
  const url = `${COMMONS_API}?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}` +
    `&gsrnamespace=6&gsrlimit=${limit}${offsetParam}&prop=imageinfo` +
    `&iiprop=url%7Cextmetadata%7Csize&iiurlwidth=${THUMB_WIDTH}&format=json&origin=*`;
  const resp = await fetchJson(url);
  return pagesInIndexOrder(resp)
    .map(toCandidate)
    .filter((c): c is ImageCandidate => c !== null);
}

// ============================================================================
// SOURCE
// ============================================================================

export const wikimediaSource: ImageSource = {
  id: 'wikimedia',
  name: 'Wikimedia Commons',

  async search(query, opts): Promise<ImageCandidate[]> {
    const limit = opts?.limit ?? 3;
    const exclude = opts?.exclude ?? new Set<string>();

    const seen = new Set<string>();
    const merged: ImageCandidate[] = [];
    const consider = (candidate: ImageCandidate | null): void => {
      if (!candidate) return;
      if (exclude.has(candidate.sourceUrl) || seen.has(candidate.sourceUrl)) return;
      seen.add(candidate.sourceUrl);
      merged.push(candidate);
    };

    // Article lead first (best for entities), unless it is already in the chat.
    consider(await fetchArticleLeadImage(query).catch(() => null));

    // Commons search, paginating until we have `limit` non-excluded results
    // or run out (capped to avoid runaway on heavily-excluded queries).
    const pageSize = Math.max(limit, 10);
    for (let page = 0; page < MAX_SEARCH_PAGES && merged.length < limit; page++) {
      const batch = await fetchCommonsSearch(query, pageSize, page * pageSize).catch(() => []);
      for (const candidate of batch) {
        consider(candidate);
        if (merged.length >= limit) break;
      }
      if (batch.length < pageSize) break; // no more results available
    }

    const result = merged.slice(0, limit);
    if (isDebug('d_image')) {
      console.log(`[wikimedia] "${query}" excl ${exclude.size} → ${result.length} candidates`);
    }
    return result;
  },
};
