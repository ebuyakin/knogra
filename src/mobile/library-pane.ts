/**
 * Library pane (docs/mobile-viewer.md §8)
 *
 * Two sections. The status: one row naming the graph the phone holds, its
 * source and its size, drawn once, since only a reload changes it. The menu:
 * the site's index as a list, one row per graph, the installed one marked.
 * A tap on another row installs that graph in place of it, by the same path as
 * the link from the site (install.ts), and reloads to the map. No confirmation:
 * nothing on the phone is lost that cannot be fetched again; a running quiz
 * ends with the reload.
 *
 * The index is fetched each time the pane is shown: it is small, and the
 * library changes without the viewer knowing. Without a connection the menu
 * says so; the status row stands regardless.
 *
 * The user's own graphs come in as files: the bar's "Open a file" opens the
 * phone's file picker, which reaches iCloud Drive and the other cloud apps,
 * and the picked file installs by the same path. The phone then holds a graph
 * no row matches, and the status row says "from a file".
 */

import { installFile, installFromUrl, installedGraphUrl, LIBRARY_INDEX_URL } from './install';

/** The graph on the phone, for the status row: the start node's title stands for the graph's (viewer.ts). */
export interface InstalledGraph {
  title: string;
  nodeCount: number;
}

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
  #installing = false;

  /** `installed` is null when the phone holds no graph. */
  constructor(root: HTMLElement, installed: InstalledGraph | null) {
    const list = root.querySelector<HTMLElement>('[data-role="list"]');
    const installedList = root.querySelector<HTMLElement>('[data-role="installed"]');
    const message = root.querySelector<HTMLElement>('[data-role="message"]');
    const fileInput = root.querySelector<HTMLInputElement>('[data-role="file"]');
    const openButton = root.querySelector<HTMLButtonElement>('[data-action="open-file"]');
    if (!list || !installedList || !message || !fileInput || !openButton) throw new Error('Library pane: a list, the message or the file input not found');
    this.#list = list;
    this.#message = message;
    installedList.replaceChildren(statusRow(installed));
    openButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      // Cleared so that picking the same file again, after a failure, fires a change.
      fileInput.value = '';
      if (file) void this.#install(file.name, () => installFile(file, null));
    });
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
      this.#say('The library needs a connection.');
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
    button.className = 'library-row';
    button.append(rowText(entry.title, installed ? '✓ installed' : `${entry.nodeCount} nodes`));
    if (!installed) button.addEventListener('click', () => void this.#install(entry.title, () => installFromUrl(entry.file)));
    item.append(button);
    return item;
  }

  /** Runs one install, named for the messages, and reloads to the map when it succeeds. */
  async #install(name: string, run: () => Promise<void>): Promise<void> {
    if (this.#installing) return;
    this.#installing = true;
    for (const button of this.#list.querySelectorAll('button')) button.disabled = true;
    this.#say(`Installing ${name}…`);
    try {
      await run();
    } catch (err) {
      console.error('[viewer] Install failed', err);
      this.#say(`Could not install ${name}. Check the file or the connection and try again.`);
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

/** The status section's one row: the graph on the phone with its source and size, or the empty phone's instruction. */
function statusRow(installed: InstalledGraph | null): HTMLLIElement {
  const item = document.createElement('li');
  if (!installed) {
    const note = document.createElement('p');
    note.className = 'pane-note library-row';
    note.textContent = 'Nothing yet. Pick a graph below, or open a file.';
    item.append(note);
    return item;
  }
  const row = document.createElement('div');
  row.className = 'library-row';
  const source = installedGraphUrl() === null ? 'from a file' : 'from the library';
  row.append(rowText(installed.title, `${source} · ${installed.nodeCount} nodes`));
  item.append(row);
  return item;
}

/** A row's two parts: the title on the left, the detail small on the right. */
function rowText(title: string, detail: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const titleSpan = document.createElement('span');
  titleSpan.textContent = title;
  const detailSpan = document.createElement('span');
  detailSpan.className = 'library-count';
  detailSpan.textContent = detail;
  fragment.append(titleSpan, detailSpan);
  return fragment;
}
