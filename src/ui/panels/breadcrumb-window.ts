/**
 * Breadcrumb Window
 *
 * Virtual-window arithmetic for the path panel's breadcrumb strip: decides which
 * slice of a scene sequence fits the available width and keeps the current item
 * inside it. Extracted from `path-panel.ts` (architecture §7.2) so the panel is
 * left with rendering and interaction only.
 *
 * Two responsibilities:
 *  1. Measure item widths — cached, and measured lazily on demand (§18.2). Only
 *     items the window arithmetic actually probes are ever put in the DOM, and
 *     each distinct (scene, label) pair is measured once for the lifetime of the
 *     panel. The previous implementation measured every item in the sequence on
 *     every render, which is ~N forced layouts per keypress.
 *  2. Track the window as `[start, end]` inclusive indices, sliding it only when
 *     the current item would otherwise fall outside (§8.5).
 *
 * The caller owns all markup decisions: it supplies the item HTML to measure and
 * the cache key to store the result under. That keeps presentation changes (e.g.
 * numbered items in path mode) out of this module.
 */

/** Horizontal cost of the separator drawn between two adjacent items. */
export interface BreadcrumbSpacing {
  /** CSS gap between an item and the chevron beside it. */
  gap: number;
  /** Rendered width of the chevron glyph. */
  chevronWidth: number;
}

export const DEFAULT_BREADCRUMB_SPACING: BreadcrumbSpacing = {
  gap: 8,
  chevronWidth: 12,
};

export interface BreadcrumbWindowInput {
  /** Number of items in the sequence. */
  count: number;
  /** Index of the item that must remain visible. `-1` when the sequence is empty. */
  currentIndex: number;
  /** Available width, in CSS pixels, of the breadcrumb strip. */
  containerWidth: number;
  /**
   * Identity of the sequence itself. When this changes the sequence has been
   * replaced wholesale (path loaded, history reset) and cached window indices no
   * longer refer to the same items, so the window is re-seeded on `currentIndex`.
   */
  sequenceKey: string | null;
  /**
   * Stable key for the item at `index`. Must incorporate everything that affects
   * rendered width — scene id *and* label — so a rename produces a new key and
   * therefore a fresh measurement without explicit invalidation.
   */
  cacheKeyOf: (index: number) => string;
  /** Inner HTML of the item at `index`, used only when its width is not cached. */
  itemHtmlOf: (index: number) => string;
  spacing?: BreadcrumbSpacing;
}

export class BreadcrumbWindow {
  #widthCache: Map<string, number> = new Map();
  #start: number = 0;
  #end: number = 0;
  #sequenceKey: string | null = null;

  /** First visible index (inclusive). */
  get start(): number {
    return this.#start;
  }

  /** Last visible index (inclusive). */
  get end(): number {
    return this.#end;
  }

  /**
   * Drop all cached measurements. Only needed when the *styling* of items
   * changes (theme or font swap); label edits are handled by the cache key.
   */
  invalidateWidths(): void {
    this.#widthCache.clear();
  }

  /**
   * Recompute the window for the current sequence and container width.
   * Read `start` / `end` afterwards to learn which slice to render.
   */
  update(input: BreadcrumbWindowInput): void {
    const spacing = input.spacing ?? DEFAULT_BREADCRUMB_SPACING;

    if (input.count === 0) {
      this.#start = 0;
      this.#end = 0;
      this.#sequenceKey = input.sequenceKey;
      return;
    }

    const currentIndex = Math.max(0, Math.min(input.currentIndex, input.count - 1));

    if (input.sequenceKey !== this.#sequenceKey) {
      this.#start = currentIndex;
      this.#end = currentIndex;
      this.#sequenceKey = input.sequenceKey;
    }

    // Clamp stale indices from a shorter previous sequence before any arithmetic.
    this.#end = Math.min(this.#end, input.count - 1);
    this.#start = Math.min(this.#start, this.#end);

    const measurer = new LazyItemMeasurer(input.cacheKeyOf, input.itemHtmlOf, this.#widthCache);
    try {
      this.#recalculate(input.count, currentIndex, input.containerWidth, spacing, measurer);
    } finally {
      measurer.dispose();
    }
  }

  // ==========================================================================
  // WINDOW ARITHMETIC
  // ==========================================================================

  #recalculate(
    count: number,
    currentIndex: number,
    containerWidth: number,
    spacing: BreadcrumbSpacing,
    measurer: LazyItemMeasurer
  ): void {
    // Current item already inside the window and the window still fits: only
    // try to grow into unused space. Covers the common case of stepping between
    // two already-visible breadcrumbs, where nothing should move.
    if (currentIndex >= this.#start && currentIndex <= this.#end) {
      const used = this.#usedWidth(this.#start, this.#end, spacing, measurer);
      if (used <= containerWidth) {
        this.#expandGreedy(count, containerWidth, spacing, measurer);
        return;
      }
    }

    // Otherwise pin the current item to the edge it left through, so the strip
    // scrolls in the direction the user is travelling.
    if (currentIndex > this.#end || this.#end === 0) {
      this.#end = currentIndex;
      this.#start = this.#findStartFromEnd(currentIndex, containerWidth, spacing, measurer);
    } else if (currentIndex < this.#start) {
      this.#start = currentIndex;
      this.#end = this.#findEndFromStart(currentIndex, count, containerWidth, spacing, measurer);
    }

    this.#expandGreedy(count, containerWidth, spacing, measurer);
  }

  /** Width of items [from..to] including the separators between them. */
  #usedWidth(
    from: number,
    to: number,
    spacing: BreadcrumbSpacing,
    measurer: LazyItemMeasurer
  ): number {
    let total = 0;
    for (let i = from; i <= to; i++) {
      total += measurer.widthAt(i);
      if (i > from) total += separatorWidth(spacing);
    }
    return total;
  }

  /**
   * Grow the window outward — right first, then left — while further items fit.
   * Keeps the strip full after a re-seed, which would otherwise leave a single
   * item on screen with the rest of the sequence hidden.
   */
  #expandGreedy(
    count: number,
    containerWidth: number,
    spacing: BreadcrumbSpacing,
    measurer: LazyItemMeasurer
  ): void {
    let used = this.#usedWidth(this.#start, this.#end, spacing, measurer);

    let grew = true;
    while (grew) {
      grew = false;

      if (this.#end + 1 < count) {
        const width = measurer.widthAt(this.#end + 1) + separatorWidth(spacing);
        if (used + width <= containerWidth) {
          this.#end++;
          used += width;
          grew = true;
        }
      }

      if (this.#start > 0) {
        const width = measurer.widthAt(this.#start - 1) + separatorWidth(spacing);
        if (used + width <= containerWidth) {
          this.#start--;
          used += width;
          grew = true;
        }
      }
    }
  }

  /** Earliest start index such that [start..endIndex] still fits. */
  #findStartFromEnd(
    endIndex: number,
    containerWidth: number,
    spacing: BreadcrumbSpacing,
    measurer: LazyItemMeasurer
  ): number {
    let total = measurer.widthAt(endIndex);
    let start = endIndex;

    for (let i = endIndex - 1; i >= 0; i--) {
      const width = measurer.widthAt(i) + separatorWidth(spacing);
      if (total + width > containerWidth) break;
      total += width;
      start = i;
    }

    return start;
  }

  /** Latest end index such that [startIndex..end] still fits. */
  #findEndFromStart(
    startIndex: number,
    count: number,
    containerWidth: number,
    spacing: BreadcrumbSpacing,
    measurer: LazyItemMeasurer
  ): number {
    let total = measurer.widthAt(startIndex);
    let end = startIndex;

    for (let i = startIndex + 1; i < count; i++) {
      const width = measurer.widthAt(i) + separatorWidth(spacing);
      if (total + width > containerWidth) break;
      total += width;
      end = i;
    }

    return end;
  }
}

function separatorWidth(spacing: BreadcrumbSpacing): number {
  return spacing.gap + spacing.chevronWidth + spacing.gap;
}

/**
 * Measures item widths on demand, reusing one offscreen host for the whole pass
 * and consulting a caller-owned cache first. The host is only created if at
 * least one measurement is actually needed, so a fully cached render touches the
 * DOM not at all.
 */
class LazyItemMeasurer {
  #cacheKeyOf: (index: number) => string;
  #itemHtmlOf: (index: number) => string;
  #cache: Map<string, number>;
  #host: HTMLElement | null = null;

  constructor(
    cacheKeyOf: (index: number) => string,
    itemHtmlOf: (index: number) => string,
    cache: Map<string, number>
  ) {
    this.#cacheKeyOf = cacheKeyOf;
    this.#itemHtmlOf = itemHtmlOf;
    this.#cache = cache;
  }

  widthAt(index: number): number {
    const key = this.#cacheKeyOf(index);
    const cached = this.#cache.get(key);
    if (cached !== undefined) return cached;

    const width = this.#measure(index);
    this.#cache.set(key, width);
    return width;
  }

  dispose(): void {
    this.#host?.remove();
    this.#host = null;
  }

  #measure(index: number): number {
    const host = this.#ensureHost();
    const item = document.createElement('div');
    item.className = 'path-item';
    item.innerHTML = this.#itemHtmlOf(index);
    host.appendChild(item);
    const width = item.offsetWidth;
    host.removeChild(item);
    return width;
  }

  #ensureHost(): HTMLElement {
    if (this.#host) return this.#host;
    const host = document.createElement('div');
    host.className = 'path-breadcrumbs';
    host.style.cssText = 'position: absolute; visibility: hidden; white-space: nowrap;';
    document.body.appendChild(host);
    this.#host = host;
    return host;
  }
}
