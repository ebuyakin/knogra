/**
 * Path List
 *
 * The path manager's main surface: saved paths with per-row actions, plus the
 * controls that create new ones (save current history, or generate).
 *
 * Rendering only — every action is delegated upward so the facade owns the
 * workflows and this module stays a view.
 */

import type { Path, PathId } from '../../../core/main-types';
import { escapeHtml, renderEmpty } from './path-modal-shell';

export interface PathListActions {
  onWalk: (path: Path) => void;
  onEdit: (path: Path) => void;
  onSaveCurrent: () => void;
  onGenerateFullPath: () => void;
  onExitPathMode: () => void;
  onClose: () => void;
}

export interface PathListContext {
  paths: Path[];
  /** Live workspace scene count, for detecting stale generated snapshots. */
  workspaceSceneCount: number;
  /**
   * True in path mode. Suppresses "save current trail" (the sequence already is
   * a saved path) and surfaces the exit control.
   */
  pathMode: boolean;
  /** Path being walked, marked in place rather than listed separately. */
  activePathId: PathId | null;
}

export function renderPathList(
  body: HTMLDivElement,
  footer: HTMLDivElement,
  context: PathListContext,
  actions: PathListActions
): void {
  body.innerHTML = '';

  if (context.paths.length === 0) {
    renderEmpty(body, 'No saved paths yet — walk the graph and save the trail, or generate a full path.');
  } else {
    for (const path of context.paths) {
      const isWalking = path.id === context.activePathId;
      body.appendChild(buildRow(path, context.workspaceSceneCount, isWalking, actions));
    }
  }

  renderFooter(footer, context, actions);
}

/**
 * One row per saved path — including the one being walked, which is *marked*
 * rather than duplicated. Walking is a property of the path, so it belongs on the
 * path's own row; stopping is a command to the app, so it lives in the footer.
 */
function buildRow(
  path: Path,
  workspaceSceneCount: number,
  isWalking: boolean,
  actions: PathListActions
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = isWalking ? 'path-list-row walking' : 'path-list-row';

  const staleness = describeStaleness(path, workspaceSceneCount);
  const badge = isWalking ? `<span class="path-list-badge">Walking</span> · ` : '';
  const sceneWord = path.scenes.length === 1 ? 'scene' : 'scenes';

  // Both row actions are withheld while this path is being walked.
  //
  // "Walk" would have to mean "restart from the beginning", which is not what the
  // label says. "Edit" is worse than merely confusing: the cursor holds its own
  // copy of the sequence, so reordering underneath it would leave the breadcrumbs
  // and the stored path disagreeing. Immutability while walking is the design
  // (§14.2) — exit first, then edit.
  const actionButtons = isWalking
    ? `<button class="path-editor-btn" data-action="edit" disabled title="Exit path mode to edit this path">Edit</button>`
    : `<button class="path-editor-btn" data-action="edit">Edit</button>
       <button class="path-editor-btn path-editor-btn-primary" data-action="walk">Walk</button>`;

  row.innerHTML = `
    <div class="path-list-info">
      <span class="path-list-name">${escapeHtml(path.name)}</span>
      <span class="path-list-meta">
        ${badge}${path.scenes.length} ${sceneWord}${staleness}
      </span>
    </div>
    <div class="path-list-actions">
      ${actionButtons}
    </div>
  `;

  row.querySelector('[data-action="walk"]')?.addEventListener('click', () => actions.onWalk(path));
  row.querySelector('[data-action="edit"]')?.addEventListener('click', () => actions.onEdit(path));

  return row;
}

/**
 * Flag a generated path that no longer covers the workspace.
 *
 * A generated full path is a snapshot: scenes added afterwards are not in it, so
 * it can quietly stop being "full" — the failure that matters most when the path
 * is being used to audit coverage (paths-architecture §15.3). Deleted scenes need
 * no equivalent warning, since the deletion cascades already prune saved paths.
 */
function describeStaleness(path: Path, workspaceSceneCount: number): string {
  if (path.generatedSceneCount === undefined) return '';
  if (workspaceSceneCount === path.generatedSceneCount) return '';

  const difference = workspaceSceneCount - path.generatedSceneCount;
  if (difference <= 0) return '';

  const scenes = difference === 1 ? 'scene' : 'scenes';
  return ` · <span class="path-list-stale">${difference} new ${scenes} since generated — regenerate</span>`;
}

function renderFooter(
  footer: HTMLDivElement,
  context: PathListContext,
  actions: PathListActions
): void {
  // Actions left, Close alone on the right. Exit joins the left group rather than
  // sitting beside Close: Close is the safe dismissal, and pairing it with a
  // state-changing control invites mis-clicks between very different outcomes.
  //
  // Exit is a transport control — it acts on app state, not on any path record —
  // so it belongs here, the way a player's Stop sits in the transport bar rather
  // than on the playing track's row.
  const exitButton = context.pathMode
    ? `<button class="path-editor-btn" data-action="exit-path">Exit path mode</button>`
    : '';

  footer.innerHTML = `
    <div class="path-list-footer-left">
      <button class="path-editor-btn" data-action="save-current" ${context.pathMode ? 'disabled' : ''}>
        Save current trail…
      </button>
      <button class="path-editor-btn" data-action="generate">Generate ▾</button>
      ${exitButton}
    </div>
    <button class="path-editor-btn" data-action="close">Close</button>
  `;

  footer.querySelector('[data-action="save-current"]')?.addEventListener('click', () => actions.onSaveCurrent());
  footer.querySelector('[data-action="exit-path"]')?.addEventListener('click', () => actions.onExitPathMode());
  footer.querySelector('[data-action="close"]')?.addEventListener('click', () => actions.onClose());

  const generateBtn = footer.querySelector('[data-action="generate"]') as HTMLButtonElement | null;
  generateBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    openGenerateMenu(generateBtn, actions);
  });
}

/**
 * Single-entry menu today. It exists as a menu because the generator is an
 * extension point — Euler tours, subtree scoping, and depth limits are all
 * candidates, and they belong beside `Full path` rather than as more buttons.
 */
function openGenerateMenu(anchor: HTMLButtonElement, actions: PathListActions): void {
  const existing = document.querySelector('.path-generate-menu');
  if (existing) {
    existing.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'path-ctx-menu path-generate-menu';

  const item = document.createElement('div');
  item.className = 'path-ctx-menu-item';
  item.textContent = 'Full path (every scene)';
  item.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.remove();
    actions.onGenerateFullPath();
  });
  menu.appendChild(item);

  document.body.appendChild(menu);

  // Anchor above the button: the manager's footer sits near the bottom of the
  // overlay, so a downward menu would fall outside it.
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.top - menuRect.height - 4}px`;

  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  }, 0);
}
