/**
 * BackgroundRenderer
 * Coordinates background canvases and manages transitions.
 * Owns the image cache (shared across canvases).
 */

import type { SceneBackgroundImage, ImageVisualAppearance } from '../core/background-types';
import type { BackgroundImage, BackgroundImageId } from '../core/main-types';
import { graphStore } from '../storage/graph-store';
import { BackgroundCanvas } from './background-canvas';
import { processSelectiveColor } from './selective-color-processor';
import { isDebug } from '../config/debug-flags';

export type ImageSource = HTMLImageElement | HTMLCanvasElement;

export class BackgroundRenderer {
  #container: HTMLElement;
  #imageCache: Map<BackgroundImageId, HTMLImageElement> = new Map();
  #processedCache: Map<string, HTMLCanvasElement> = new Map();
  #mainCanvas: BackgroundCanvas;
  #transitionCanvas: BackgroundCanvas | null = null;

  constructor(container: HTMLElement) {
    this.#container = container;
    this.#mainCanvas = new BackgroundCanvas(container, 0);
  }

  // ==========================================================================
  // NORMAL OPERATIONS
  // ==========================================================================

  /**
   * Render background images to main canvas
   */
  async render(backgroundImages: SceneBackgroundImage[]): Promise<void> {
    // No backgrounds? Clear and return
    if (!backgroundImages || backgroundImages.length === 0) {
      this.clear();
      return;
    }

    // Load all images into cache, filter out any that are missing (deleted)
    const loadResults = await Promise.all(
      backgroundImages.map(async bi => {
        const img = await this.#loadImage(bi.imageId);
        return img ? bi : null;
      })
    );
    const validImages = loadResults.filter((bi): bi is SceneBackgroundImage => bi !== null);

    // Build sources map (applies selective color processing if needed)
    const sources = this.#buildSourcesMap(validImages);

    // Store images in canvas
    this.#mainCanvas.setImages(validImages, sources);

    if (isDebug('d_background')) console.log(`BackgroundRenderer: Loaded ${validImages.length} image(s)`);
  }

  /**
   * Redraw all background images with given zoom/pan
   */
  redraw(zoom: number, pan: { x: number; y: number }): void {
    this.#mainCanvas.redraw(zoom, pan);
    
    // Also redraw transition canvas if active
    if (this.#transitionCanvas) {
      this.#transitionCanvas.redraw(zoom, pan);
    }
  }

  /**
   * Clear all background images
   */
  clear(): void {
    this.#mainCanvas.clear();
    
    // Also cancel any active transition
    if (this.#transitionCanvas) {
      this.cancelTransition();
    }
  }

  /**
   * Resize canvas to match container
   */
  resize(width: number, height: number): void {
    this.#mainCanvas.resize(width, height);
    
    // Also resize transition canvas if active
    if (this.#transitionCanvas) {
      this.#transitionCanvas.resize(width, height);
    }
  }

  /**
   * Get the main canvas element (for opacity animation)
   */
  getMainCanvas(): HTMLCanvasElement {
    return this.#mainCanvas.getElement();
  }

  /**
   * Clean up and remove canvas
   */
  destroy(): void {
    this.#mainCanvas.destroy();
    if (this.#transitionCanvas) {
      this.#transitionCanvas.destroy();
      this.#transitionCanvas = null;
    }
    this.#imageCache.clear();
    this.#processedCache.clear();
  }

  // ==========================================================================
  // TRANSITION OPERATIONS
  // ==========================================================================

  /**
   * Prepare transition canvas for crossfade.
   * Creates a new canvas on top of main, initially invisible.
   * Returns the canvas element for opacity animation.
   */
  prepareTransition(): HTMLCanvasElement {
    // Clean up any existing transition canvas
    if (this.#transitionCanvas) {
      this.#transitionCanvas.destroy();
    }

    // Create transition canvas with same z-index (DOM order = visual order)
    this.#transitionCanvas = new BackgroundCanvas(this.#container, 0);
    
    // Start invisible
    const element = this.#transitionCanvas.getElement();
    element.style.opacity = '0';
    
    // Match main canvas size
    const mainElement = this.#mainCanvas.getElement();
    this.#transitionCanvas.resize(mainElement.width, mainElement.height);

    return element;
  }

  /**
   * Load and render images to transition canvas.
   * Call after prepareTransition().
   */
  async renderToTransition(backgroundImages: SceneBackgroundImage[]): Promise<void> {
    if (!this.#transitionCanvas) {
      console.warn('BackgroundRenderer: No transition canvas prepared');
      return;
    }

    // Load all images into cache, filter out any that are missing
    if (backgroundImages && backgroundImages.length > 0) {
      const loadResults = await Promise.all(
        backgroundImages.map(async bi => {
          const img = await this.#loadImage(bi.imageId);
          return img ? bi : null;
        })
      );
      const validImages = loadResults.filter((bi): bi is SceneBackgroundImage => bi !== null);
      
      // Build sources map (applies selective color processing if needed)
      const sources = this.#buildSourcesMap(validImages);
      
      this.#transitionCanvas.setImages(validImages, sources);
    } else {
      this.#transitionCanvas.clear();
    }
  }

  /**
   * Get the transition canvas element (for opacity animation).
   * Returns null if no transition is active.
   */
  getTransitionCanvas(): HTMLCanvasElement | null {
    return this.#transitionCanvas?.getElement() ?? null;
  }

  /**
   * Finalize transition: swap transition canvas to become main.
   * Old main is destroyed. Call after crossfade animation completes.
   */
  commitTransition(): void {
    if (!this.#transitionCanvas) {
      console.warn('BackgroundRenderer: No transition to commit');
      return;
    }

    // Destroy old main canvas
    this.#mainCanvas.destroy();

    // Transition canvas becomes new main
    this.#mainCanvas = this.#transitionCanvas;
    this.#transitionCanvas = null;

    // Ensure opacity is 1
    this.#mainCanvas.getElement().style.opacity = '1';
  }

  /**
   * Cancel transition: destroy transition canvas, keep main.
   * Restores main canvas opacity to 1.
   */
  cancelTransition(): void {
    if (this.#transitionCanvas) {
      this.#transitionCanvas.destroy();
      this.#transitionCanvas = null;
    }

    // Restore main canvas visibility
    this.#mainCanvas.getElement().style.opacity = '1';
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Build a map of image sources, applying selective color processing if needed.
   * Sources are cached for performance.
   */
  #buildSourcesMap(images: SceneBackgroundImage[]): Map<BackgroundImageId, ImageSource> {
    const map = new Map<BackgroundImageId, ImageSource>();
    for (const img of images) {
      const source = this.#getProcessedImage(img.imageId, img.appearance);
      if (source) {
        map.set(img.imageId, source);
      }
    }
    return map;
  }

  /**
   * Get image source for drawing, with selective color applied if needed.
   * Returns cached processed canvas or original image.
   */
  #getProcessedImage(
    imageId: BackgroundImageId,
    appearance: ImageVisualAppearance
  ): ImageSource | null {
    const originalImg = this.#imageCache.get(imageId);
    if (!originalImg) return null;

    // No selective color? Return original
    if (!appearance.selectiveColor) return originalImg;

    // Build cache key
    const cacheKey = `${imageId}:${JSON.stringify(appearance.selectiveColor)}`;

    // Cache hit?
    if (this.#processedCache.has(cacheKey)) {
      return this.#processedCache.get(cacheKey)!;
    }

    // Process and cache
    const processed = processSelectiveColor(originalImg, appearance.selectiveColor);
    this.#processedCache.set(cacheKey, processed);
    if (isDebug('d_background')) console.log(`BackgroundRenderer: Processed selective color for ${imageId}`);
    return processed;
  }

  /**
   * Load image into cache. Returns null if image not found (deleted).
   */
  async #loadImage(imageId: BackgroundImageId): Promise<HTMLImageElement | null> {
    // Return cached if available
    if (this.#imageCache.has(imageId)) {
      return this.#imageCache.get(imageId)!;
    }

    // Find image in store
    const bgImage = graphStore.backgroundImages.find(
      (img: BackgroundImage) => img.id === imageId
    );

    if (!bgImage) {
      console.warn(`Background image ${imageId} not found in store (may have been deleted)`);
      return null;
    }

    // Load image
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load ${imageId}`));
      image.src = bgImage.dataUri;
    });

    // Cache it
    this.#imageCache.set(imageId, img);
    return img;
  }
}
