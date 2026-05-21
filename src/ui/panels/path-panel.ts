/**
 * Path Panel
 * Displays navigation history as breadcrumbs
 * 
 * Listens to: cy.on('path:updated')
 */

import type { Core } from 'cytoscape';
import type { SceneId } from '../../core/main-types';
import type { FeatureAPI } from '../../features/feature-api';
import { graphStore } from '../../storage/graph-store';
import { pathStore } from '../../storage/path-store';
import { PathPicker, PathEditor, PathContextMenu } from '../components/path-picker';
import '../../styles/path-panel.css';

export class PathPanel {
  #cy: Core;
  #features: FeatureAPI;
  #container: HTMLElement;
  #visible: boolean = true;
  #windowStart: number = 0;  // First visible item index in virtual window
  #windowEnd: number = 0;    // Last visible item index in virtual window
  #itemWidths: number[] = []; // Cached item widths for window calculation
  #lastFirstSceneId: SceneId | null = null; // Detects full history replacement (loadPath/reset)
  #picker = new PathPicker();
  #editor = new PathEditor();
  #ctxMenu = new PathContextMenu();

  constructor(cy: Core, features: FeatureAPI, container: HTMLElement) {
    this.#cy = cy;
    this.#features = features;
    this.#container = container;

    // Initial render
    this.#render();

    // Listen for path updates
    this.#cy.on('path:updated', () => {
      this.#render();
    });

    // Right-click on panel: small context menu (extensible).
    this.#container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const hasPaths = pathStore.getAllPaths().length > 0;
      this.#ctxMenu.open(e.clientX, e.clientY, [
        {
          label: 'Edit path…',
          disabled: !hasPaths,
          onClick: () => this.#openEditFlow(),
        },
      ]);
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

    // Detect full replacement (loadPath / reset / clear): when the first scene
    // in history changes, the cached window indices no longer correspond to the
    // new path. Reset the window so the greedy fill below picks neighbours of
    // the new currentIndex instead of clinging to stale positions.
    const firstSceneId = history[0] ?? null;
    if (firstSceneId !== this.#lastFirstSceneId) {
      this.#windowStart = currentIndex >= 0 ? currentIndex : 0;
      this.#windowEnd = this.#windowStart;
      this.#lastFirstSceneId = firstSceneId;
    }

    // First pass: measure all items to get widths (render hidden)
    this.#measureItemWidths(history);

    // Calculate visible window based on current index and available width
    this.#calculateVisibleWindow(history, currentIndex);

    // Build breadcrumb HTML for visible items only
    const visibleHistory = history.slice(this.#windowStart, this.#windowEnd + 1);
    const breadcrumbs = visibleHistory.map((sceneId, visibleIndex) => {
      const actualIndex = this.#windowStart + visibleIndex;
      const scene = graphStore.scenes.find(s => s.id === sceneId);
      const node = scene 
        ? graphStore.nodes.find(n => n.id === scene.centralNodeId)
        : null;
      const label = node?.title || scene?.title || 'Unknown';
      const isCurrent = actualIndex === currentIndex;

      return `
        <div class="path-item ${isCurrent ? 'current' : ''}" data-index="${actualIndex}" data-scene-id="${sceneId}">
          <span class="path-item-label" title="${label}">${label}</span>
        </div>
      `;
    }).join('<span class="path-chevron">›</span>');

    const content = breadcrumbs;

    // Check for anchor scene
    const anchorSceneId = this.#getAnchorSceneId();
    const hasAnchor = anchorSceneId !== null;

    // Build icons (all 16x16 with consistent sizing)
    const homeIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 7.5l6-5.5 6 5.5M4 6.5v7h3v-4h2v4h3v-7"/></svg>`;
    const saveIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 2h10v12H3zM5 2v4h6V2M8 9v3M6 11h4"/></svg>`;
    const loadIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 5h5l1.5 1.5H14v7H2zM2 5V3h4l1 1"/></svg>`;
    const hasPaths = pathStore.paths.length > 0;

    // Left controls (home, save, load)
    const leftControls = `
      <div class="path-controls path-controls-left">
        <button class="path-btn" data-action="home" title="Go to anchor node" ${!hasAnchor ? 'disabled' : ''}>${homeIcon}</button>
        <button class="path-btn" data-action="save" title="Save path" ${history.length === 0 ? 'disabled' : ''}>${saveIcon}</button>
        <button class="path-btn" data-action="load" title="Load path" ${!hasPaths ? 'disabled' : ''}>${loadIcon}</button>
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
        const sceneId = item.getAttribute('data-scene-id') as SceneId;
        if (sceneId) {
          await this.#navigateToScene(sceneId);
        }
      });
    });

    // Home button
    const homeBtn = this.#container.querySelector('[data-action="home"]');
    homeBtn?.addEventListener('click', () => this.#goHome());

    // Save button
    const saveBtn = this.#container.querySelector('[data-action="save"]');
    saveBtn?.addEventListener('click', () => this.#savePath());

    // Load button
    const loadBtn = this.#container.querySelector('[data-action="load"]');
    loadBtn?.addEventListener('click', () => this.#showLoadDialog());

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
   * Save current path with a name prompt
   */
  async #savePath(): Promise<void> {
    const history = this.#features.path.getHistory();
    if (history.length === 0) return;

    const name = prompt('Enter a name for this path:');
    if (!name || name.trim() === '') return;

    await pathStore.createPath(name.trim(), history);
    this.#render(); // Re-render to enable load button
  }

  /**
   * Show dialog to select and load a saved path
   */
  #showLoadDialog(): void {
    if (pathStore.getAllPaths().length === 0) return;
    this.#picker.open('Load Path', async (selectedPath) => {
      // Activate the FIRST scene in the path (where the journey begins),
      // not the last. Pass it as currentSceneId so the breadcrumb highlight
      // matches what is on screen.
      const firstScene = selectedPath.scenes[0];
      if (!firstScene) return;
      this.#features.path.loadPath(selectedPath.scenes, firstScene);
      await this.#features.transition.goToSceneFromPath(firstScene);
    });
  }

  /**
   * Right-click → “Edit path…”: pick which saved path, then open the editor.
   */
  #openEditFlow(): void {
    if (pathStore.getAllPaths().length === 0) return;
    this.#picker.open('Edit Path', (selectedPath) => {
      this.#editor.open(selectedPath, {
        onSave: (updated) => {
          // After save, load the path so the panel reflects the new sequence
          // — same UX as the load icon.
          const first = updated.scenes[0];
          if (!first) {
            this.#render();
            return;
          }
          this.#features.path.loadPath(updated.scenes, first);
          void this.#features.transition.goToSceneFromPath(first);
        },
        onDelete: () => this.#render(),
      });
    });
  }

  /**
   * Navigate to a scene from breadcrumb click
   * This is a non-adjacent jump, uses simplified transition
   */
  async #navigateToScene(sceneId: SceneId): Promise<void> {
    // For now, use the same navigation method
    // Phase 3 will implement simplified fade transition
    await this.#features.transition.goToSceneFromPath(sceneId);
    
    // Update path to this position
    // The path feature will handle updating history via the scene:changed event
    // But wait - navigateToScene doesn't emit scene:changed...
    // We need to manually update the path position
    this.#features.path.loadPath(
      this.#features.path.getHistory(),
      sceneId
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

    // Reset path history to anchor scene
    this.#features.path.reset(anchorSceneId);
    
    // Close current scene, then open anchor scene fresh
    await this.#features.transition.closeScene();
    await this.#features.transition.openScene(anchorSceneId);
  }

  /**
   * Measure widths of all items by rendering them in a hidden container
   */
  #measureItemWidths(history: SceneId[]): void {
    // Create a hidden measuring container
    const measurer = document.createElement('div');
    measurer.style.cssText = 'position: absolute; visibility: hidden; white-space: nowrap;';
    measurer.className = 'path-breadcrumbs';
    document.body.appendChild(measurer);

    this.#itemWidths = history.map((sceneId) => {
      const scene = graphStore.scenes.find(s => s.id === sceneId);
      const node = scene 
        ? graphStore.nodes.find(n => n.id === scene.centralNodeId)
        : null;
      const label = node?.title || scene?.title || 'Unknown';

      // Create item element to measure
      const item = document.createElement('div');
      item.className = 'path-item';
      item.innerHTML = `<span class="path-item-label">${label}</span>`;
      measurer.appendChild(item);
      const width = item.offsetWidth;
      measurer.removeChild(item);
      
      return width;
    });

    document.body.removeChild(measurer);
  }

  /**
   * Calculate which items should be visible in the window
   * Ensures currentIndex is always visible
   */
  #calculateVisibleWindow(history: SceneId[], currentIndex: number): void {
    if (history.length === 0) {
      this.#windowStart = 0;
      this.#windowEnd = 0;
      return;
    }

    // Get container width
    const breadcrumbsContainer = this.#container.querySelector('.path-breadcrumbs');
    const containerWidth = breadcrumbsContainer?.clientWidth || 
      (this.#container.clientWidth - 200); // Estimate if not rendered yet (minus buttons)

    const gap = 8;      // CSS gap between items
    const chevronWidth = 12; // Approximate chevron width

    // Check if current item is within existing window
    if (currentIndex >= this.#windowStart && currentIndex <= this.#windowEnd) {
      // Current item is visible, check if window still fits
      let totalWidth = 0;
      for (let i = this.#windowStart; i <= this.#windowEnd && i < history.length; i++) {
        totalWidth += this.#itemWidths[i] || 0;
        if (i > this.#windowStart) {
          totalWidth += gap + chevronWidth + gap;
        }
      }
      if (totalWidth <= containerWidth) {
        // Window still fits. Try to expand outward into any unused space
        // before returning — covers the loadPath/reset case where the window
        // was just collapsed to [currentIndex, currentIndex].
        this.#expandWindowGreedy(history.length, containerWidth, gap, chevronWidth);
        return;
      }
    }

    // Need to recalculate window to include currentIndex
    // Strategy depends on direction:
    // - If currentIndex > windowEnd: expand/shift right (keep currentIndex at right)
    // - If currentIndex < windowStart: expand/shift left (keep currentIndex at left)

    if (currentIndex > this.#windowEnd || this.#windowEnd === 0) {
      // Going forward: currentIndex should be at right edge, find what fits before it
      this.#windowEnd = currentIndex;
      this.#windowStart = this.#findWindowStartFromEnd(currentIndex, containerWidth, gap, chevronWidth);
    } else if (currentIndex < this.#windowStart) {
      // Going back: currentIndex should be at left edge, find what fits after it
      this.#windowStart = currentIndex;
      this.#windowEnd = this.#findWindowEndFromStart(currentIndex, containerWidth, gap, chevronWidth, history.length);
    }

    // After the sticky-edge logic, greedily expand the window outward to fill
    // any remaining space. Without this, loading a path or resetting history
    // can leave the window at [currentIndex, currentIndex] when currentIndex
    // sits at one end — hiding all the other scenes in the path.
    this.#expandWindowGreedy(history.length, containerWidth, gap, chevronWidth);
  }

  /**
   * Expand the window outward (alternating right then left) while extra items
   * still fit in the available container width.
   */
  #expandWindowGreedy(historyLength: number, containerWidth: number, gap: number, chevronWidth: number): void {
    const itemPlusSep = (idx: number): number =>
      (this.#itemWidths[idx] || 0) + gap + chevronWidth + gap;

    let used = 0;
    for (let i = this.#windowStart; i <= this.#windowEnd && i < historyLength; i++) {
      used += this.#itemWidths[i] || 0;
      if (i > this.#windowStart) used += gap + chevronWidth + gap;
    }

    // Alternate sides so the window stays roughly centred on currentIndex.
    let didExpand = true;
    while (didExpand) {
      didExpand = false;
      if (this.#windowEnd + 1 < historyLength) {
        const w = itemPlusSep(this.#windowEnd + 1);
        if (used + w <= containerWidth) {
          this.#windowEnd++;
          used += w;
          didExpand = true;
        }
      }
      if (this.#windowStart > 0) {
        const w = itemPlusSep(this.#windowStart - 1);
        if (used + w <= containerWidth) {
          this.#windowStart--;
          used += w;
          didExpand = true;
        }
      }
    }
  }

  /**
   * Find the earliest startIndex where items [startIndex...endIndex] fit
   */
  #findWindowStartFromEnd(endIndex: number, containerWidth: number, gap: number, chevronWidth: number): number {
    let totalWidth = this.#itemWidths[endIndex] || 0;
    let startIndex = endIndex;

    for (let i = endIndex - 1; i >= 0; i--) {
      const itemWidth = this.#itemWidths[i] || 0;
      const additionalWidth = itemWidth + gap + chevronWidth + gap;
      
      if (totalWidth + additionalWidth > containerWidth) {
        break;
      }
      
      totalWidth += additionalWidth;
      startIndex = i;
    }

    return startIndex;
  }

  /**
   * Find the latest endIndex where items [startIndex...endIndex] fit
   */
  #findWindowEndFromStart(startIndex: number, containerWidth: number, gap: number, chevronWidth: number, historyLength: number): number {
    let totalWidth = this.#itemWidths[startIndex] || 0;
    let endIndex = startIndex;

    for (let i = startIndex + 1; i < historyLength; i++) {
      const itemWidth = this.#itemWidths[i] || 0;
      const additionalWidth = gap + chevronWidth + gap + itemWidth;
      
      if (totalWidth + additionalWidth > containerWidth) {
        break;
      }
      
      totalWidth += additionalWidth;
      endIndex = i;
    }

    return endIndex;
  }
}
