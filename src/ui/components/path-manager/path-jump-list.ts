/**
 * Path Jump List
 *
 * Read-only view of the active sequence for travelling to a distant position.
 *
 * Breadcrumbs answer "where am I", but only a handful fit on screen, so reaching
 * scene 50 of 171 means fifty keypresses. This lists the whole sequence: filter by
 * title, click to travel.
 *
 * Deliberately read-only, which is what lets it open while a path is being walked
 * — the sequence editor cannot, because reordering underneath a live cursor would
 * desynchronise it (paths-architecture §15.1). Jumping only moves the cursor, so
 * it composes with path mode instead of fighting it.
 */

import type { SceneId } from '../../../core/main-types';
import { attachDismiss, buildOverlay, escapeHtml, renderEmpty, sceneLabel } from './path-modal-shell';

export interface PathJumpListEntry {
  index: number;
  sceneId: SceneId;
  label: string;
}

export class PathJumpList {
  #overlay: HTMLDivElement | null = null;
  #listHost: HTMLDivElement | null = null;
  #filterInput: HTMLInputElement | null = null;
  #entries: PathJumpListEntry[] = [];
  #currentIndex: number = -1;
  #onJump: ((index: number) => void) | null = null;
  #detachDismiss: (() => void) | null = null;

  /**
   * @param scenes The active sequence, in order.
   * @param currentIndex Position to mark and scroll to.
   * @param onJump Receives the chosen absolute index.
   */
  open(scenes: SceneId[], currentIndex: number, onJump: (index: number) => void): void {
    if (this.#overlay) return;
    if (scenes.length === 0) return;

    // Labels are resolved once here rather than per keystroke: filtering runs on
    // every input event, and each label costs two linear store scans.
    this.#entries = scenes.map((sceneId, index) => ({
      index,
      sceneId,
      label: sceneLabel(sceneId),
    }));
    this.#currentIndex = currentIndex;
    this.#onJump = onJump;

    const { overlay, modal, body, footer } = buildOverlay(`Go to scene — ${scenes.length} in sequence`);
    this.#overlay = overlay;
    modal.classList.add('path-editor-modal');

    this.#renderFilter(body);

    const list = document.createElement('div');
    list.className = 'path-jump-list';
    body.appendChild(list);
    this.#listHost = list;
    this.#renderRows('');

    footer.innerHTML = `<button class="path-editor-btn" data-action="close">Close</button>`;
    footer.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close());

    this.#detachDismiss = attachDismiss(overlay, () => this.close());
    document.body.appendChild(overlay);

    this.#filterInput?.focus();
    this.#scrollCurrentIntoView();
  }

  close(): void {
    this.#detachDismiss?.();
    this.#detachDismiss = null;
    this.#overlay?.remove();
    this.#overlay = null;
    this.#listHost = null;
    this.#filterInput = null;
    this.#entries = [];
    this.#onJump = null;
  }

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  #renderFilter(body: HTMLDivElement): void {
    const row = document.createElement('div');
    row.className = 'path-jump-filter-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'path-editor-name-input';
    input.placeholder = 'Filter by title, or type a position number…';
    input.addEventListener('input', () => this.#renderRows(input.value));

    // Enter travels to the only remaining match — the fast path when the filter
    // has already narrowed to one.
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const matches = this.#match(input.value);
      if (matches.length !== 1) return;
      event.preventDefault();
      this.#jump(matches[0].index);
    });

    row.appendChild(input);
    this.#filterInput = input;
    body.appendChild(row);
  }

  #renderRows(filter: string): void {
    const host = this.#listHost;
    if (!host) return;

    host.innerHTML = '';
    const matches = this.#match(filter);

    if (matches.length === 0) {
      renderEmpty(host, 'No scenes match');
      return;
    }

    for (const entry of matches) {
      host.appendChild(this.#buildRow(entry));
    }
  }

  #buildRow(entry: PathJumpListEntry): HTMLDivElement {
    const isCurrent = entry.index === this.#currentIndex;

    const row = document.createElement('div');
    row.className = isCurrent ? 'path-jump-row current' : 'path-jump-row';
    if (isCurrent) row.dataset.current = 'true';

    row.innerHTML = `
      <span class="path-jump-num">${entry.index + 1}</span>
      <span class="path-jump-title" title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</span>
      ${isCurrent ? '<span class="path-jump-here">here</span>' : ''}
    `;

    // The current row is inert: jumping to where you already are would run a
    // pointless transition.
    if (!isCurrent) {
      row.addEventListener('click', () => this.#jump(entry.index));
    }

    return row;
  }

  // ==========================================================================
  // BEHAVIOUR
  // ==========================================================================

  /**
   * Case-insensitive substring match on the title, or an exact match on the
   * 1-based position when the filter is a number — "50" should find scene 50
   * rather than every title containing "50".
   */
  #match(filter: string): PathJumpListEntry[] {
    const trimmed = filter.trim();
    if (trimmed === '') return this.#entries;

    const asPosition = Number(trimmed);
    if (Number.isInteger(asPosition) && asPosition > 0) {
      const exact = this.#entries.filter(entry => entry.index + 1 === asPosition);
      if (exact.length > 0) return exact;
    }

    const needle = trimmed.toLowerCase();
    return this.#entries.filter(entry => entry.label.toLowerCase().includes(needle));
  }

  #jump(index: number): void {
    const onJump = this.#onJump;
    this.close();
    onJump?.(index);
  }

  /**
   * Bring the current row into view. Without this the list opens at the top,
   * which is useless at position 137 of 171.
   */
  #scrollCurrentIntoView(): void {
    const current = this.#listHost?.querySelector('[data-current="true"]');
    current?.scrollIntoView({ block: 'center' });
  }
}
