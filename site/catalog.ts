/**
 * Graph catalog loader for the landing page.
 *
 * Fetches catalog.json from the knogra-graphs GitHub repo, renders graph cards.
 * "Open" button flow:
 *   - No existing workspace data → go straight to /app/ (sessionStorage URL).
 *   - Existing workspace detected → show a confirmation modal first, offering
 *     a Download option (saves the chosen graph without navigating) and a
 *     Proceed option (navigates to /app/ where the normal import dialog appears
 *     over the loaded workspace with the "export first" checkbox).
 */

const CATALOG_URL = 'https://raw.githubusercontent.com/ebuyakin/knogra-graphs/main/catalog.json';
const FILES_BASE = 'https://raw.githubusercontent.com/ebuyakin/knogra-graphs/main/';
const PENDING_IMPORT_KEY = 'knogra.pendingImport';
const GRAPH_DB_NAME = 'knogra-graph';

interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
  nodeCount: number;
  badge?: string;
  file: string;
}

/**
 * Returns true if the user has more than a bare seed workspace.
 * Uses raw IndexedDB API to avoid importing app modules into the landing page.
 * Heuristic: more than 1 node OR more than 1 scene = meaningful data.
 */
async function hasMeaningfulData(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = indexedDB.open(GRAPH_DB_NAME);
    req.onerror = () => resolve(false);
    req.onupgradeneeded = () => {
      // DB is being created for the first time — no data.
      req.transaction?.abort();
      resolve(false);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('nodes') || !db.objectStoreNames.contains('scenes')) {
        db.close();
        resolve(false);
        return;
      }
      const tx = db.transaction(['nodes', 'scenes'], 'readonly');
      let nodes = 0, scenes = 0, done = 0;
      const finish = (): void => {
        done++;
        if (done === 2) { db.close(); resolve(nodes > 1 || scenes > 1); }
      };
      const nr = tx.objectStore('nodes').count();
      const sr = tx.objectStore('scenes').count();
      nr.onsuccess = () => { nodes = nr.result; finish(); };
      sr.onsuccess = () => { scenes = sr.result; finish(); };
      nr.onerror = finish;
      sr.onerror = finish;
    };
  });
}

async function downloadGraph(url: string, title: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.knogra';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    alert('Failed to download the graph. Please try again.');
  }
}

function showOpenModal(entry: CatalogEntry, graphUrl: string): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 1000;
    display: flex; align-items: center; justify-content: center;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #161b22; border: 1px solid #30363d; border-radius: 12px;
    padding: 28px; max-width: 440px; width: 90%; color: #e6edf3;
    font-size: 14px; box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  `;
  modal.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:17px;font-weight:600;">Open "${entry.title}"?</h3>
    <p style="margin:0 0 24px;color:#8b949e;line-height:1.7;">
      You have an active workspace that will be replaced by
      <strong style="color:#c9d1d9;">"${entry.title}"</strong>.
      You can <strong style="color:#c9d1d9;">download</strong> it as a file to keep a
      copy for later, or <strong style="color:#c9d1d9;">proceed</strong> to open it in
      the app — where you'll have the option to export your current workspace first.
    </p>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <button id="om-download" style="padding:7px 16px;border-radius:6px;
        border:1px solid #30363d;background:none;color:#c9d1d9;
        cursor:pointer;font-size:13px;">Download</button>
      <div style="display:flex;gap:8px;">
        <button id="om-cancel" style="padding:7px 16px;border-radius:6px;
          border:1px solid #30363d;background:none;color:#c9d1d9;
          cursor:pointer;font-size:13px;">Cancel</button>
        <button id="om-proceed" style="padding:7px 18px;border-radius:6px;
          border:none;background:#238636;color:#fff;
          cursor:pointer;font-size:13px;font-weight:600;">Proceed →</button>
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (): void => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  modal.querySelector('#om-cancel')!.addEventListener('click', close);
  modal.querySelector('#om-download')!.addEventListener('click', async () => {
    await downloadGraph(graphUrl, entry.title);
    close();
  });
  modal.querySelector('#om-proceed')!.addEventListener('click', () => {
    sessionStorage.setItem(PENDING_IMPORT_KEY, graphUrl);
    window.location.href = '/app/';
  });
}

async function loadCatalog(): Promise<void> {
  const grid = document.getElementById('library-grid');
  if (!grid) return;

  try {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entries: CatalogEntry[] = await res.json();
    renderCards(grid, entries);
  } catch {
    grid.innerHTML = '<p class="library-status">Could not load graph library.</p>';
  }
}

function openEntry(entry: CatalogEntry, graphUrl: string): void {
  hasMeaningfulData().then((hasData) => {
    if (hasData) {
      showOpenModal(entry, graphUrl);
    } else {
      sessionStorage.setItem(PENDING_IMPORT_KEY, graphUrl);
      window.location.href = '/app/';
    }
  });
}

function wireTutorialButton(entries: CatalogEntry[]): void {
  const btn = document.getElementById('hero-tutorial-btn') as HTMLButtonElement | null;
  if (!btn) return;
  const entry = entries.find(
    (e) => e.id === 'tutorial' || e.title.toLowerCase().includes('tutorial')
  );
  if (!entry) return;
  const graphUrl = `${FILES_BASE}${entry.file}`;
  btn.addEventListener('click', () => openEntry(entry, graphUrl));
}

function renderCards(grid: HTMLElement, entries: CatalogEntry[]): void {
  grid.innerHTML = '';
  for (const entry of entries) {
    const card = document.createElement('div');
    card.className = 'graph-card';
    const graphUrl = `${FILES_BASE}${entry.file}`;
    card.innerHTML = `
      <div class="graph-card-top">
        <span class="graph-card-title">${entry.title}</span>
        ${entry.badge ? `<span class="graph-card-badge">${entry.badge}</span>` : ''}
      </div>
      <p class="graph-card-desc">${entry.description}</p>
      <div class="graph-card-bottom">
        <span class="graph-card-meta">${entry.nodeCount} nodes · ${entry.tags.join(', ')}</span>
        <button class="graph-card-btn">Open</button>
      </div>
    `;
    const cardBtn = card.querySelector('.graph-card-btn') as HTMLButtonElement;
    cardBtn.addEventListener('click', () => openEntry(entry, graphUrl));
    grid.appendChild(card);
  }
  wireTutorialButton(entries);
}

document.addEventListener('DOMContentLoaded', loadCatalog);
