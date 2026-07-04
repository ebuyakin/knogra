import Dexie from 'dexie';

import {
  GRAPH_DB_NAME,
  GRAPH_DB_VERSION,
  GRAPH_DB_SCHEMA,
  CHAT_DB_NAME,
  CHAT_DB_VERSION,
  CHAT_DB_SCHEMA,
  PATH_DB_NAME,
  PATH_DB_VERSION,
  PATH_DB_SCHEMA,
  SHELF_KEY,
} from '../../config/storage-config';

export interface ImportWorkspaceOptions {
  exportFirst: boolean;
}

export interface NewWorkspaceOptions {
  exportFirst: boolean;
  keepSettings: boolean;
}

export async function hasMeaningfulWorkspaceData(): Promise<boolean> {
  const graphDb = new Dexie(GRAPH_DB_NAME);
  graphDb.version(GRAPH_DB_VERSION).stores(GRAPH_DB_SCHEMA);

  const chatDb = new Dexie(CHAT_DB_NAME);
  chatDb.version(CHAT_DB_VERSION).stores(CHAT_DB_SCHEMA);

  const pathDb = new Dexie(PATH_DB_NAME);
  pathDb.version(PATH_DB_VERSION).stores(PATH_DB_SCHEMA);

  const [nodes, scenes, edgeCount, imageCount, conversationCount, pathCount] = await Promise.all([
    graphDb.table('nodes').toArray(),
    graphDb.table('scenes').toArray(),
    graphDb.table('edges').count(),
    graphDb.table('backgroundImages').count(),
    chatDb.table('conversations').count(),
    pathDb.table('paths').count(),
  ]);

  const shelfData = localStorage.getItem(SHELF_KEY);
  const hasShelfItems = !!(shelfData && shelfData !== '{}' && shelfData !== '[]');

  if (edgeCount > 0 || imageCount > 0 || conversationCount > 0 || pathCount > 0 || hasShelfItems) {
    return true;
  }

  if (nodes.length === 0 && scenes.length === 0) {
    return false;
  }

  if (nodes.length !== 1 || scenes.length !== 1) {
    return true;
  }

  const seedNode = nodes[0] as { title?: string; tags?: unknown[]; properties?: Record<string, unknown>; isAnchor?: boolean };
  const seedScene = scenes[0] as {
    title?: string;
    nodes?: Record<string, unknown>;
    edges?: Record<string, unknown>;
    backgroundImages?: unknown[];
  };

  const nodeKeys = seedScene.nodes ? Object.keys(seedScene.nodes) : [];
  const edgeKeys = seedScene.edges ? Object.keys(seedScene.edges) : [];
  const bgImages = Array.isArray(seedScene.backgroundImages) ? seedScene.backgroundImages : [];
  const hasOnlySeedNode =
    seedNode.title === 'New Idea' &&
    (seedNode.tags?.length ?? 0) === 0 &&
    Object.keys(seedNode.properties ?? {}).length === 0 &&
    seedNode.isAnchor === true &&
    seedScene.title === 'Anchor scene' &&
    nodeKeys.length === 1 &&
    edgeKeys.length === 0 &&
    bgImages.length === 0;

  return !hasOnlySeedNode;
}

export function showImportWorkspaceDialog(hasExistingData: boolean): Promise<ImportWorkspaceOptions | null> {
  return new Promise(resolve => {
    const cyContainer = document.getElementById('cy');
    const rect = cyContainer?.getBoundingClientRect();

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2000;
      display: flex; align-items: center; justify-content: center;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: relative;
      left: ${rect ? (rect.left + rect.width / 2 - window.innerWidth / 2) : 0}px;
      top: ${rect ? (rect.top + rect.height / 2 - window.innerHeight / 2) : 0}px;
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      padding: 24px; max-width: 420px; color: #e6edf3; font-size: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    dialog.innerHTML = `
      <h3 style="margin:0 0 12px; font-size:16px; font-weight:600;">Import Workspace</h3>
      <p style="margin:0 0 16px; color:#8b949e; line-height:1.5;">
        This will replace your current workspace with the imported one.
        ${hasExistingData ? 'Your current data will be lost unless you export it first.' : 'Continue?'}
      </p>
      ${hasExistingData ? `
      <label style="display:flex; align-items:center; gap:8px; margin-bottom:20px; cursor:pointer;">
        <input type="checkbox" id="iw-export" checked style="accent-color:#58a6ff;">
        Export workspace to a file first (recommended)
      </label>` : ''}
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="iw-cancel" style="padding:6px 16px; border-radius:6px; border:1px solid #30363d;
          background:none; color:#c9d1d9; cursor:pointer; font-size:13px;">Cancel</button>
        <button id="iw-ok" style="padding:6px 16px; border-radius:6px; border:none;
          background:#58a6ff; color:#fff; cursor:pointer; font-size:13px; font-weight:600;">Import</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cleanup = (): void => { overlay.remove(); };

    dialog.querySelector('#iw-cancel')?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    dialog.querySelector('#iw-ok')?.addEventListener('click', () => {
      const exportFirst = hasExistingData
        ? (dialog.querySelector('#iw-export') as HTMLInputElement).checked
        : false;
      cleanup();
      resolve({ exportFirst });
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
  });
}

/**
 * Ask whether to scale the imported graph to fit the current screen. Shown only
 * when the graph was authored on a meaningfully different screen size. Resolves
 * `true` if the user accepts the rescale, `false` to keep the authored zoom.
 */
export function showScaleToFitDialog(): Promise<boolean> {
  return new Promise(resolve => {
    const cyContainer = document.getElementById('cy');
    const rect = cyContainer?.getBoundingClientRect();

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2000;
      display: flex; align-items: center; justify-content: center;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: relative;
      left: ${rect ? (rect.left + rect.width / 2 - window.innerWidth / 2) : 0}px;
      top: ${rect ? (rect.top + rect.height / 2 - window.innerHeight / 2) : 0}px;
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      padding: 24px; max-width: 420px; color: #e6edf3; font-size: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    dialog.innerHTML = `
      <h3 style="margin:0 0 12px; font-size:16px; font-weight:600;">Scale to your screen?</h3>
      <p style="margin:0 0 20px; color:#8b949e; line-height:1.5;">
        This graph was designed for a different screen size. Scaling it to fit
        keeps every scene framed the way the author intended. You can always
        adjust later with <strong style="color:#c9d1d9; white-space:nowrap;">Shift+0</strong>,
        or use the <strong style="color:#c9d1d9;">Zoom</strong> item in the
        right-click menu for more detailed, flexible scaling.
      </p>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="sf-keep" style="padding:6px 16px; border-radius:6px; border:1px solid #30363d;
          background:none; color:#c9d1d9; cursor:pointer; font-size:13px;">Keep original</button>
        <button id="sf-ok" style="padding:6px 16px; border-radius:6px; border:none;
          background:#58a6ff; color:#fff; cursor:pointer; font-size:13px; font-weight:600;">Scale to fit</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cleanup = (): void => { overlay.remove(); };

    dialog.querySelector('#sf-keep')?.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    dialog.querySelector('#sf-ok')?.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });
  });
}

/**
 * Show a non-blocking error dialog listing validation issues,
 * with a Copy button so the user can paste and analyze the full list.
 * Returns true if the user chooses to proceed, false to cancel.
 * In 'export' mode there is no cancel — the dialog is informational only.
 */
export function showValidationErrorDialog(errors: string[], mode: 'import' | 'export' = 'import'): Promise<boolean> {
  const isExport = mode === 'export';
  const title = 'Integrity errors detected';
  const subtitle = isExport
    ? `${errors.length} issue${errors.length !== 1 ? 's' : ''} found in the current workspace. You can still export it as a backup, but fix these before sharing.`
    : `${errors.length} issue${errors.length !== 1 ? 's' : ''} found in the workspace file. You can still import it, but some scenes may not render correctly.`;

  const proceedLabel = isExport ? 'Export anyway' : 'Import anyway';

  return new Promise(resolve => {
    const cyContainer = document.getElementById('cy');
    const rect = cyContainer?.getBoundingClientRect();

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2000;
      display: flex; align-items: center; justify-content: center;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: relative;
      left: ${rect ? (rect.left + rect.width / 2 - window.innerWidth / 2) : 0}px;
      top: ${rect ? (rect.top + rect.height / 2 - window.innerHeight / 2) : 0}px;
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      padding: 24px; width: 480px; max-width: 90vw; color: #e6edf3; font-size: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    const errorText = errors.join('\n');
    const errorListHtml = errors
      .map(e => `<li style="margin-bottom:4px; color:#f85149;">${e}</li>`)
      .join('');

    const actionButtons = `<button id="ve-cancel" style="padding:6px 16px; border-radius:6px; border:1px solid #30363d;
            background:none; color:#c9d1d9; cursor:pointer; font-size:13px;">Cancel</button>
          <button id="ve-proceed" style="padding:6px 16px; border-radius:6px; border:none;
            background:#9e6a03; color:#fff; cursor:pointer; font-size:13px; font-weight:600;">${proceedLabel}</button>`;

    dialog.innerHTML = `
      <h3 style="margin:0 0 8px; font-size:16px; font-weight:600; color:#f85149;">
        ${title}
      </h3>
      <p style="margin:0 0 12px; color:#8b949e; line-height:1.5;">${subtitle}</p>
      <ul style="
        margin:0 0 16px; padding:12px 12px 12px 28px;
        background:#0d1117; border:1px solid #30363d; border-radius:6px;
        max-height:240px; overflow-y:auto; list-style:disc; font-size:12px;
        font-family:monospace; line-height:1.6;
      ">${errorListHtml}</ul>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <button id="ve-copy" style="padding:6px 16px; border-radius:6px; border:1px solid #30363d;
          background:none; color:#8b949e; cursor:pointer; font-size:13px;">Copy errors</button>
        <div style="display:flex; gap:8px;">${actionButtons}</div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cleanup = (): void => { overlay.remove(); };

    dialog.querySelector('#ve-copy')?.addEventListener('click', () => {
      const btn = dialog.querySelector('#ve-copy') as HTMLButtonElement;

      const tryExecCommand = (): boolean => {
        const ta = document.createElement('textarea');
        ta.value = errorText;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      };

      const succeed = (): void => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy errors'; }, 2000);
      };

      if (navigator.clipboard) {
        navigator.clipboard.writeText(errorText).then(succeed).catch(() => {
          if (tryExecCommand()) succeed();
        });
      } else {
        if (tryExecCommand()) succeed();
      }
    });

    dialog.querySelector('#ve-cancel')?.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    dialog.querySelector('#ve-proceed')?.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    dialog.querySelector('#ve-ok')?.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { cleanup(); resolve(false); }
    });
  });
}
export function showNewWorkspaceDialog(): Promise<NewWorkspaceOptions | null> {
  return new Promise(resolve => {
    const cyContainer = document.getElementById('cy');
    const rect = cyContainer?.getBoundingClientRect();

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2000;
      display: flex; align-items: center; justify-content: center;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: relative;
      left: ${rect ? (rect.left + rect.width / 2 - window.innerWidth / 2) : 0}px;
      top: ${rect ? (rect.top + rect.height / 2 - window.innerHeight / 2) : 0}px;
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      padding: 24px; max-width: 420px; color: #e6edf3; font-size: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    dialog.innerHTML = `
      <h3 style="margin:0 0 12px; font-size:16px; font-weight:600;">New Workspace</h3>
      <p style="margin:0 0 16px; color:#8b949e; line-height:1.5;">
        This will permanently erase all graph data: nodes, edges, scenes, images,
        chat history, paths, and AI suggestions. This cannot be undone.
      </p>
      <label style="display:flex; align-items:center; gap:8px; margin-bottom:10px; cursor:pointer;">
        <input type="checkbox" id="nw-export" checked style="accent-color:#58a6ff;">
        Export workspace to a file first (recommended)
      </label>
      <label style="display:flex; align-items:center; gap:8px; margin-bottom:20px; cursor:pointer;">
        <input type="checkbox" id="nw-settings" checked style="accent-color:#58a6ff;">
        Preserve settings and custom themes
      </label>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="nw-cancel" style="padding:6px 16px; border-radius:6px; border:1px solid #30363d;
          background:none; color:#c9d1d9; cursor:pointer; font-size:13px;">Cancel</button>
        <button id="nw-ok" style="padding:6px 16px; border-radius:6px; border:none;
          background:#da3633; color:#fff; cursor:pointer; font-size:13px; font-weight:600;">Create New</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cleanup = (): void => { overlay.remove(); };

    dialog.querySelector('#nw-cancel')?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    dialog.querySelector('#nw-ok')?.addEventListener('click', () => {
      const exportFirst = (dialog.querySelector('#nw-export') as HTMLInputElement).checked;
      const keepSettings = (dialog.querySelector('#nw-settings') as HTMLInputElement).checked;
      cleanup();
      resolve({ exportFirst, keepSettings });
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
  });
}