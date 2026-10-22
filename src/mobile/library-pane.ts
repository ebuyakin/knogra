/**
 * Library pane (docs/mobile-viewer.md §8)
 *
 * The site's index as a list, one row per graph, the graph on the phone marked.
 * A tap on another row installs that graph in place of it, by the same path as
 * the link from the site (install.ts), and reloads to the map. No confirmation:
 * nothing on the phone is lost that cannot be fetched again; a running quiz
 * ends with the reload.
 *
 * The index is fetched each time the pane is shown: it is small, and the
 * library changes without the viewer knowing. Without a connection the pane
 * says so and names the graph on the phone, which stays usable.
 */

import { installFromUrl, installedGraphUrl, LIBRARY_INDEX_URL } from './install';

/** One entry of the index (§12): the fields the viewer reads. The site may add others; these three it keeps. */
interface LibraryEntry {
  file: string;
  title: string;
  nodeCount: number;
}

function isLibraryEntry(value: unknown): value is LibraryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.file === 'string' && typeof entry.title === 'string' && typeof entry.nodeCount === 'number';
}

async function fetchIndex(): Promise<LibraryEntry[]> {
  // The index changes when the library does; the HTTP cache must not answer with yesterday's.
  const response = await fetch(LIBRARY_INDEX_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error('The index is not a list');
  return data.filter(isLibraryEntry);
}

export class LibraryPane {
  #list: HTMLElement;
  #message: HTMLElement;
  /** The title of the graph on the phone, named when the index cannot be fetched; null when the phone has none. */
  #installedTitle: string | null;
  #installing = false;

  constructor(root: HTMLElement, installedTitle: string | null) {
    const list = root.querySelector<HTMLElement>('[data-role="list"]');
    const message = root.querySelector<HTMLElement>('[data-role="message"]');
    if (!list || !message) throw new Error('Library pane: list or message not found');
    this.#list = list;
    this.#message = message;
    this.#installedTitle = installedTitle;
  }

  /** Fetch the index and draw the list; called when the pane is shown. */
  async refresh(): Promise<void> {
    if (this.#installing) return;
    this.#say('Loading the library…');
    let entries: LibraryEntry[];
    try {
      entries = await fetchIndex();
    } catch (err) {
      console.error('[viewer] Could not fetch the library index', err);
      const onPhone = this.#installedTitle ? ` On this phone: ${this.#installedTitle}.` : '';
      this.#say(`The library needs a connection.${onPhone}`);
      return;
    }
    this.#say(entries.length === 0 ? 'The library is empty.' : '');
    this.#list.replaceChildren(...entries.map(entry => this.#row(entry)));
  }

  #row(entry: LibraryEntry): HTMLLIElement {
    const installed = entry.file === installedGraphUrl();
    const item = document.createElement('li');
    item.classList.toggle('installed', installed);
    const button = document.createElement('button');
    button.type = 'button';
    const title = document.createElement('span');
    title.textContent = entry.title;
    const count = document.createElement('span');
    count.className = 'library-count';
    count.textContent = installed ? 'on this phone' : `${entry.nodeCount} nodes`;
    button.append(title, count);
    if (!installed) button.addEventListener('click', () => void this.#install(entry));
    item.append(button);
    return item;
  }

  async #install(entry: LibraryEntry): Promise<void> {
    if (this.#installing) return;
    this.#installing = true;
    for (const button of this.#list.querySelectorAll('button')) button.disabled = true;
    this.#say(`Installing ${entry.title}…`);
    try {
      await installFromUrl(entry.file);
    } catch (err) {
      console.error('[viewer] Install failed', err);
      this.#say(`Could not install ${entry.title}. Check the connection and tap again.`);
      for (const button of this.#list.querySelectorAll('button')) button.disabled = false;
      this.#installing = false;
      return;
    }
    // The stores read IndexedDB when first imported (install.ts): the reload is how the graph reaches the map.
    window.location.reload();
  }

  #say(text: string): void {
    this.#message.textContent = text;
    this.#message.hidden = text === '';
  }
}
