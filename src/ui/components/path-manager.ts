/**
 * Path Manager
 *
 * Single surface for everything a user does *to* paths — load, save, edit,
 * delete, generate — reached from the path panel's Path button.
 *
 * Public API for the component; the parts live in `path-manager/`. Its role
 * matches `node-manager` (managing a collection) rather than `node-editor`
 * (editing one entity), hence the name.
 *
 * Replaces `path-picker.ts`, which offered a bare picker and required the caller
 * to decide what a pick meant. Consolidating here let the panel drop from four
 * buttons to two, and made path creation reachable when no paths exist yet — the
 * old right-click entry was disabled in exactly that case.
 *
 * All persistence goes through the Path feature (architecture §3.8): UI →
 * Features → Storage, never UI → Storage.
 */

import type { Path } from '../../core/main-types';
import type { FeatureAPI } from '../../features/feature-api';
import { graphStore } from '../../storage/graph-store';
import { attachDismiss, buildOverlay } from './path-manager/path-modal-shell';
import { renderPathList } from './path-manager/path-list';
import { PathSequenceEditor } from './path-manager/path-sequence-editor';
import '../../styles/path-manager.css';

export class PathManager {
  #features: FeatureAPI;
  #editor: PathSequenceEditor;
  #overlay: HTMLDivElement | null = null;
  #body: HTMLDivElement | null = null;
  #footer: HTMLDivElement | null = null;
  #detachDismiss: (() => void) | null = null;
  /** Invoked after any change the panel needs to reflect. */
  #onChanged: (() => void) | null = null;

  constructor(features: FeatureAPI) {
    this.#features = features;
    this.#editor = new PathSequenceEditor(features);
  }

  open(onChanged?: () => void): void {
    if (this.#overlay) return;
    this.#onChanged = onChanged ?? null;

    const { overlay, modal, body, footer } = buildOverlay('Paths');
    this.#overlay = overlay;
    this.#body = body;
    this.#footer = footer;
    modal.classList.add('path-editor-modal');

    this.#renderList();

    this.#detachDismiss = attachDismiss(overlay, () => this.close());
    document.body.appendChild(overlay);
  }

  close(): void {
    this.#detachDismiss?.();
    this.#detachDismiss = null;
    this.#overlay?.remove();
    this.#overlay = null;
    this.#body = null;
    this.#footer = null;
    this.#onChanged = null;
  }

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  #renderList(): void {
    if (!this.#body || !this.#footer) return;

    renderPathList(
      this.#body,
      this.#footer,
      {
        paths: this.#features.path.listSaved(),
        workspaceSceneCount: graphStore.scenes.length,
        pathMode: this.#features.path.isPathMode(),
        activePathId: this.#features.path.getActivePathId(),
      },
      {
        onWalk: (path) => void this.#walk(path),
        onEdit: (path) => this.#edit(path),
        onSaveCurrent: () => void this.#saveCurrent(),
        onGenerateFullPath: () => void this.#generateFullPath(),
        onExitPathMode: () => this.#exitPathMode(),
        onClose: () => this.close(),
      }
    );
  }

  // ==========================================================================
  // WORKFLOWS
  // ==========================================================================

  /** Enter path mode on a saved path and open its first scene. */
  async #walk(path: Path): Promise<void> {
    const sceneId = this.#features.path.enterPathMode(path, 0);
    if (!sceneId) return;

    this.close();
    this.#notifyChanged();
    await this.#features.transition.goToSceneFromPath(sceneId);
  }

  /**
   * Leave path mode. The manager stays open and re-renders: the user may well
   * want to pick a different path next, and closing would hide the fact that the
   * mode changed.
   */
  #exitPathMode(): void {
    this.#features.path.exitPathMode();
    this.#renderList();
    this.#notifyChanged();
  }

  #edit(path: Path): void {
    this.#editor.open(path, {
      onSave: () => {
        // Stay in the manager: editing is bookkeeping, not a decision to walk.
        this.#renderList();
        this.#notifyChanged();
      },
      onDelete: () => {
        this.#renderList();
        this.#notifyChanged();
      },
    });
  }

  async #saveCurrent(): Promise<void> {
    const scenes = this.#features.path.getHistory();
    if (scenes.length === 0) return;

    const name = prompt('Name for this path:');
    if (!name || name.trim() === '') return;

    await this.#features.path.saveHistoryAs(name.trim());
    this.#renderList();
    this.#notifyChanged();
  }

  /**
   * Generate a path covering every scene, then hand it to the editor so the
   * author can name it and review the order before committing. Generation is
   * cheap and deterministic, so previewing costs nothing and the sequence is
   * long enough to be worth a look.
   */
  async #generateFullPath(): Promise<void> {
    const scenes = this.#features.path.generateFullPath();
    if (scenes.length === 0) {
      alert('No scenes to include — the workspace has no scenes yet.');
      return;
    }

    const defaultName = `Full path — ${new Date().toLocaleDateString()}`;
    const pathId = await this.#features.path.saveGeneratedPath(defaultName, scenes);

    const created = this.#features.path.getSaved(pathId);
    if (!created) {
      this.#renderList();
      return;
    }

    this.#renderList();
    this.#notifyChanged();
    this.#edit(created);
  }

  #notifyChanged(): void {
    this.#onChanged?.();
  }
}
