/**
 * Panes (docs/mobile-viewer.md §8)
 *
 * Four panes side by side, library, quiz, map, notes, the map the home.
 * The strip element holds all four at four times the width and slides by a
 * quarter per pane; this class owns which pane is shown and moves the strip,
 * by a button or by the swipe (gestures.ts), which drags the strip with the
 * finger and then settles it.
 */

export type PaneName = 'library' | 'quiz' | 'map' | 'notes';

const ORDER: PaneName[] = ['library', 'quiz', 'map', 'notes'];
const PANE_SHARE = 100 / ORDER.length;

export type PaneListener = (pane: PaneName) => void;

export class Panes {
  #strip: HTMLElement;
  #index = ORDER.indexOf('map');
  #listeners = new Set<PaneListener>();
  /** Panes that cannot be shown for now: the notes during a quiz (§10.2). A swipe or button toward one does nothing. */
  #locked = new Set<PaneName>();

  constructor(strip: HTMLElement) {
    this.#strip = strip;
    this.#settle();
  }

  current(): PaneName {
    return ORDER[this.#index];
  }

  /** The width of one pane on screen: the strip holds them all, so its width over their number. */
  paneWidth(): number {
    return this.#strip.clientWidth / ORDER.length;
  }

  /** Called when a pane becomes the shown one, after the slide starts. */
  subscribe(listener: PaneListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  goTo(pane: PaneName): void {
    this.#show(ORDER.indexOf(pane));
  }

  setLocked(pane: PaneName, locked: boolean): void {
    if (locked) this.#locked.add(pane);
    else this.#locked.delete(pane);
    if (locked && this.current() === pane) this.goTo('map');
  }

  isLocked(pane: PaneName): boolean {
    return this.#locked.has(pane);
  }

  /** One pane left (`-1`) or right (`1`); nothing past the ends. */
  step(delta: -1 | 1): void {
    this.#show(this.#index + delta);
  }

  /** Follow the finger: the strip offset by `dx` pixels from its resting place, no transition. */
  drag(dx: number): void {
    const atEnd = (dx > 0 && this.#index === 0) || (dx < 0 && this.#index === ORDER.length - 1) || this.#nextIsLocked(dx);
    // Past an end the strip resists: a third of the finger's travel.
    const offset = atEnd ? dx / 3 : dx;
    this.#strip.classList.add('dragging');
    this.#strip.style.transform = `translateX(calc(${-this.#index * PANE_SHARE}% + ${offset}px))`;
  }

  /** The finger lifted after `dx` pixels on a pane `width` wide: flip if far enough, else settle back. */
  release(dx: number, width: number): void {
    this.#strip.classList.remove('dragging');
    if (Math.abs(dx) > width / 4) this.step(dx < 0 ? 1 : -1);
    else this.#settle();
  }

  /** Whether the pane a drag of `dx` leads toward is locked. */
  #nextIsLocked(dx: number): boolean {
    const next = ORDER[this.#index + (dx < 0 ? 1 : -1)];
    return next !== undefined && this.#locked.has(next);
  }

  #show(index: number): void {
    const clamped = Math.max(0, Math.min(ORDER.length - 1, index));
    if (this.#locked.has(ORDER[clamped])) {
      this.#settle();
      return;
    }
    const changed = clamped !== this.#index;
    this.#index = clamped;
    this.#settle();
    if (changed) for (const listener of this.#listeners) listener(this.current());
  }

  #settle(): void {
    this.#strip.style.transform = `translateX(${-this.#index * PANE_SHARE}%)`;
  }
}
