/**
 * Path Panel
 *
 * Breadcrumb strip over the active scene sequence. Renders whichever mode the
 * Path feature is in (paths-architecture §14): plain labels for history, numbered
 * items plus an exit control for a loaded path.
 *
 * Listens to: cy.on('path:updated') — emitted for movement *and* for mode
 * changes, so one subscription covers both; there is no need to also listen to
 * `pathModeChanged`, which exists for modules that are not re-rendered anyway.
 */

import type { Core } from 'cytoscape';
import type { SceneId } from '../../core/main-types';
import type { FeatureAPI } from '../../features/feature-api';
import { graphStore } from '../../storage/graph-store';
import { PathManager } from '../components/path-manager';
import { PathJumpList } from '../components/path-manager/path-jump-list';
import { BreadcrumbWindow } from './breadcrumb-window';
import '../../styles/path-panel.css';

export class PathPanel {
  #cy: Core;
  #features: FeatureAPI;
  #container: HTMLElement;
  #visible: boolean = true;
  #window = new BreadcrumbWindow();
  #manager: PathManager;
  #jumpList = new PathJumpList();

  constructor(cy: Core, features: FeatureAPI, container: HTMLElement) {
    this.#cy = cy;
    this.#features = features;
    this.#container = container;
    this.#manager = new PathManager(features);

    // Initial render
    this.#render();

    // Listen for path updates
    this.#cy.on('path:updated', () => {
      this.#render();
    });
  }

  /**
   * Toggle panel visibility
   */
  toggle(): void {
    this.#visible = !this.#visible;
    this.#render();
  }

  /**
   * Show panel
   */
  show(): void {
    this.#visible = true;
    this.#render();
  }

  /**
   * Hide panel
   */
  hide(): void {
    this.#visible = false;
    this.#render();
  }

  /**
   * Get visibility state
   */
  isVisible(): boolean {
    return this.#visible;
  }

  /**
   * Render the panel
   * Uses virtual window - only renders items that fit in the container
   */
  #render(): void {
    const history = this.#features.path.getHistory();
    const currentIndex = this.#features.path.getCurrentIndex();

    // Path mode numbers the breadcrumbs (1., 2., …) so position within a fixed
    // sequence is always legible; numbers are meaningless for a history that
    // rewrites itself, so history mode omits them (paths-architecture §14.2).
    const pathMode = this.#features.path.isPathMode();

    this.#window.update({
      count: history.length,
      currentIndex,
      containerWidth: this.#breadcrumbsWidth(),
      // Identity of the sequence: a wholesale replacement (path loaded, history
      // reset) changes the first scene, and cached indices must not survive it.
      sequenceKey: history[0] ?? null,
      // Label and ordinal are both part of the key: a rename or a switch between
      // numbered and plain items changes rendered width, and must re-measure.
      cacheKeyOf: (index) =>
        `${pathMode ? index + 1 : ''}\u0000${history[index]}\u0000${this.#sceneLabel(history[index])}`,
      itemHtmlOf: (index) =>
        this.#itemInnerHtml(this.#sceneLabel(history[index]), pathMode ? index + 1 : null),
    });

    const windowStart = this.#window.start;

    // Build breadcrumb HTML for visible items only
    const visibleHistory = history.slice(windowStart, this.#window.end + 1);
    const breadcrumbs = visibleHistory.map((sceneId, visibleIndex) => {
      const actualIndex = windowStart + visibleIndex;
      const isCurrent = actualIndex === currentIndex;
      const ordinal = pathMode ? actualIndex + 1 : null;

      return `
        <div class="path-item ${isCurrent ? 'current' : ''}" data-index="${actualIndex}" data-scene-id="${sceneId}">
          ${this.#itemInnerHtml(this.#sceneLabel(sceneId), ordinal)}
        </div>
      `;
    }).join('<span class="path-chevron">›</span>');

    const content = breadcrumbs;

    // Check for anchor scene
    const anchorSceneId = this.#getAnchorSceneId();
    const hasAnchor = anchorSceneId !== null;

    // Build icons (all 16x16 with consistent sizing)
    const homeIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 7.5l6-5.5 6 5.5M4 6.5v7h3v-4h2v4h3v-7"/></svg>`;
    // Ordered-list glyph: a path is scenes in numbered order, and in path mode the
    // breadcrumbs are numbered too, so the icon mirrors the feature's own
    // signature. Markers are squares, not circles, and there is no connecting
    // line — circles joined by lines are nodes and edges in this app, so that
    // shape would read as a graph fragment rather than a sequence.
    const pathIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M6.5 3.5h7M6.5 8h7M6.5 12.5h7"/><rect x="2.2" y="2.7" width="1.7" height="1.7" rx="0.3" fill="currentColor" stroke="none"/><rect x="2.2" y="7.2" width="1.7" height="1.7" rx="0.3" fill="currentColor" stroke="none"/><rect x="2.2" y="11.7" width="1.7" height="1.7" rx="0.3" fill="currentColor" stroke="none"/></svg>`;

    // Left controls are a fixed pair — Home + Path — in both modes. The button
    // count must not change with mode: adding a control would shift the
    // breadcrumbs sideways, and a strip that moves under the cursor is worse than
    // one extra click to leave path mode (exit lives in the manager).
    // The Path button tints its icon while a path is loaded — one of the two
    // persistent mode signals, alongside the numbered breadcrumbs (§14.2).
    const pathName = this.#features.path.getActivePathName();
    const pathTitle = pathMode
      ? `Paths — walking "${pathName ?? 'path'}"`
      : 'Paths — save, load, edit, generate';

    const leftControls = `
      <div class="path-controls path-controls-left">
        <button class="path-btn" data-action="home" title="Go to anchor node" ${!hasAnchor ? 'disabled' : ''}>${homeIcon}</button>
        <button class="path-btn ${pathMode ? 'active' : ''}" data-action="paths" title="${pathTitle}">${pathIcon}</button>
      </div>
    `;

    // Right controls (first, back, forward, last)
    const canGoBack = this.#features.path.canGoBack();
    const canGoForward = this.#features.path.canGoForward();
    const rightControls = `
      <div class="path-controls path-controls-right">
        <button class="path-btn" data-action="first" title="Go to first" ${!canGoBack ? 'disabled' : ''}>«</button>
        <button class="path-btn" data-action="back" title="Back ([)" ${!canGoBack ? 'disabled' : ''}>‹</button>
        <button class="path-btn" data-action="forward" title="Forward (])" ${!canGoForward ? 'disabled' : ''}>›</button>
        <button class="path-btn" data-action="last" title="Go to last" ${!canGoForward ? 'disabled' : ''}>»</button>
      </div>
    `;

    this.#container.innerHTML = `
      <div class="path-panel ${this.#visible ? '' : 'hidden'}">
        ${leftControls}
        <div class="path-breadcrumbs">${content}</div>
        ${rightControls}
      </div>
    `;

    // Attach event listeners
    this.#attachListeners();
  }

  /**
   * Attach click listeners to breadcrumbs and controls
   */
  #attachListeners(): void {
    // Breadcrumb clicks
    const items = this.#container.querySelectorAll('.path-item:not(.current)');
    items.forEach(item => {
      item.addEventListener('click', async () => {
        const index = Number(item.getAttribute('data-index'));
        if (Number.isInteger(index)) {
          await this.#navigateToIndex(index);
        }
      });
    });

    // The current breadcrumb opens the jump list. Only a handful of items fit on
    // screen, so stepping to a distant position is impractical in a long path;
    // this is the "where can I go" counterpart to "where am I". Uses the current
    // item because it needs no extra chrome — the panel's button pair stays fixed.
    const currentItem = this.#container.querySelector('.path-item.current');
    currentItem?.addEventListener('click', () => this.#openJumpList());

    // Home button
    const homeBtn = this.#container.querySelector('[data-action="home"]');
    homeBtn?.addEventListener('click', () => this.#goHome());

    // Path manager — save, load, edit, generate, exit path mode
    const pathsBtn = this.#container.querySelector('[data-action="paths"]');
    pathsBtn?.addEventListener('click', () => this.#manager.open(() => this.#render()));

    // Back button
    const backBtn = this.#container.querySelector('[data-action="back"]');
    backBtn?.addEventListener('click', async () => {
      const sceneId = this.#features.path.back();
      if (sceneId) {
        await this.#features.transition.goToSceneFromPath(sceneId);
      }
    });

    // Forward button
    const forwardBtn = this.#container.querySelector('[data-action="forward"]');
    forwardBtn?.addEventListener('click', async () => {
      const sceneId = this.#features.path.forward();
      if (sceneId) {
        await this.#features.transition.goToSceneFromPath(sceneId);
      }
    });

    // First button
    const firstBtn = this.#container.querySelector('[data-action="first"]');
    firstBtn?.addEventListener('click', async () => {
      const sceneId = this.#features.path.goToFirst();
      if (sceneId) {
        await this.#features.transition.goToSceneFromPath(sceneId);
      }
    });

    // Last button
    const lastBtn = this.#container.querySelector('[data-action="last"]');
    lastBtn?.addEventListener('click', async () => {
      const sceneId = this.#features.path.goToLast();
      if (sceneId) {
        await this.#features.transition.goToSceneFromPath(sceneId);
      }
    });
  }

  /**
   * Navigate to an absolute position in the sequence (breadcrumb click).
   *
   * Moves the position first, then transitions: `goToSceneFromPath` does not emit
   * `scene:changed`, so the sequence would otherwise not know the cursor moved.
   * `goToIndex` is unambiguous where a scene id would not be — a sequence may
   * legitimately visit the same scene twice (§12).
   */
  async #navigateToIndex(index: number): Promise<void> {
    const sceneId = this.#features.path.goToIndex(index);
    if (!sceneId) return;
    await this.#features.transition.goToSceneFromPath(sceneId);
  }

  /**
   * Full sequence as a filterable list, for reaching a position too far away to
   * step to. Works in both modes — `goToIndex` is mode-agnostic, and a 200-entry
   * history has the same problem as a long path.
   */
  #openJumpList(): void {
    const sequence = this.#features.path.getHistory();
    if (sequence.length < 2) return;

    this.#jumpList.open(
      sequence,
      this.#features.path.getCurrentIndex(),
      (index) => void this.#navigateToIndex(index)
    );
  }

  /**
   * Get the scene ID for the anchor node (if exists and has a scene)
   */
  #getAnchorSceneId(): SceneId | null {
    const anchorNode = graphStore.nodes.find(n => n.isAnchor);
    if (!anchorNode) return null;

    const anchorScene = graphStore.scenes.find(s => s.centralNodeId === anchorNode.id);
    return anchorScene?.id || null;
  }

  /**
   * Navigate to anchor node's scene via close → open
   */
  async #goHome(): Promise<void> {
    const anchorSceneId = this.#getAnchorSceneId();
    if (!anchorSceneId) return;

    // Home restarts navigation from the anchor, which is incompatible with
    // walking a fixed sequence — so it doubles as the deliberate way out of path
    // mode, and asks first (paths-architecture §15.4).
    if (this.#features.path.isPathMode()) {
      if (!confirm('Exit path mode and return to the anchor scene?')) return;
      this.#features.path.exitPathMode();
    }

    // Reset path history to anchor scene
    this.#features.path.reset(anchorSceneId);
    
    // Close current scene, then open anchor scene fresh
    await this.#features.transition.closeScene();
    await this.#features.transition.openScene(anchorSceneId);
  }

  /**
   * Display label for a scene — the central node's title, falling back to the
   * scene title. Also the width-cache key input, so it must be stable.
   */
  #sceneLabel(sceneId: SceneId): string {
    const scene = graphStore.scenes.find(s => s.id === sceneId);
    const node = scene
      ? graphStore.nodes.find(n => n.id === scene.centralNodeId)
      : null;
    return node?.title || scene?.title || 'Unknown';
  }

  /**
   * Inner markup of one breadcrumb. Shared by the live render and the offscreen
   * measurement pass so the two can never disagree on width.
   *
   * @param ordinal 1-based position, shown in path mode only; null to omit.
   */
  #itemInnerHtml(label: string, ordinal: number | null): string {
    const number = ordinal === null
      ? ''
      : `<span class="path-item-num">${ordinal}.</span>`;
    return `${number}<span class="path-item-label" title="${label}">${label}</span>`;
  }

  /**
   * Available width of the breadcrumb strip. Before the first render the strip
   * does not exist yet, so fall back to the panel width less the button groups.
   */
  #breadcrumbsWidth(): number {
    const strip = this.#container.querySelector('.path-breadcrumbs');
    return strip?.clientWidth || (this.#container.clientWidth - 200);
  }

}
