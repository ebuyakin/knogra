/**
 * Node image cache.
 *
 * Designs need an image's SVG synchronously while they render; loading it is
 * asynchronous, and `nodeImages` is deliberately excluded from `GraphStore`'s
 * resident cache. This module closes that gap: `ensure()` loads a record, and
 * `get()` reads it back without awaiting.
 *
 * Bounded, so residency tracks recently visited scenes rather than the graph.
 * See docs/nodes-svg-images.md §5.5.
 */

import type { NodeImageId } from '../core/main-types';
import type { NodeImageColourMode, NodeImageSizeClass } from '../core/node-image-types';
import { graphStore } from './graph-store';

/**
 * Upper bound on retained image source, in bytes.
 *
 * **Bytes, not entries.** A count was defensible while the size cap was 150 KB,
 * where 200 images could not exceed ~30 MB. At a 1 MB cap (D30) the same count
 * admits 200 MB, and the point of a cache is a ceiling on memory rather than on
 * records.
 *
 * 20 MB is hundreds of ordinary icons, or a couple of dozen elaborate diagrams.
 * Measured in UTF-16 code units, which is how the strings are actually held.
 */
const MAX_CACHED_BYTES = 20 * 1024 * 1024;

export interface CachedNodeImage {
  /** Sanitized SVG source. Carries colour tokens when `colourMode` is thematic. */
  svg: string;
  aspectRatio: number;
  sizeClass: NodeImageSizeClass;
  colourMode?: NodeImageColourMode;
}

class NodeImageCache {
  // Insertion order is the LRU order: reads re-insert, eviction takes the head.
  #entries = new Map<NodeImageId, CachedNodeImage>();

  /** Running total of `svg.length` across `#entries`, so eviction needs no scan. */
  #bytes = 0;

  /**
   * Load an image into the cache if it is not already there.
   * Accepts `undefined` so callers can await unconditionally.
   */
  async ensure(imageId: NodeImageId | undefined): Promise<void> {
    if (!imageId || this.#entries.has(imageId)) return;

    const image = await graphStore.getNodeImage(imageId);
    if (!image) return;

    this.#entries.set(imageId, {
      svg: image.svg,
      aspectRatio: image.aspectRatio,
      sizeClass: image.sizeClass,
      colourMode: image.colourMode
    });
    this.#bytes += image.svg.length;

    this.#evictToBudget(imageId);
  }

  /** Read a loaded image. Returns undefined when `ensure()` has not run or found nothing. */
  get(imageId: NodeImageId | undefined): CachedNodeImage | undefined {
    if (!imageId) return undefined;

    const entry = this.#entries.get(imageId);
    if (!entry) return undefined;

    this.#entries.delete(imageId);
    this.#entries.set(imageId, entry);
    return entry;
  }

  /** Drop an image after it has been replaced or deleted, so the next render reloads it. */
  invalidate(imageId: NodeImageId): void {
    const entry = this.#entries.get(imageId);
    if (!entry) return;

    this.#entries.delete(imageId);
    this.#bytes -= entry.svg.length;
  }

  /**
   * Evicts oldest-first until the total is back under budget.
   *
   * The image just loaded is exempt, because it is the one about to be drawn:
   * a single image larger than the whole budget would otherwise be evicted
   * immediately and reloaded on the next frame, forever.
   */
  #evictToBudget(keepId: NodeImageId): void {
    for (const [id, entry] of this.#entries) {
      if (this.#bytes <= MAX_CACHED_BYTES) return;
      if (id === keepId) continue;

      this.#entries.delete(id);
      this.#bytes -= entry.svg.length;
    }
  }
}

export const nodeImageCache = new NodeImageCache();
