/**
 * SceneBackground Feature
 * Manages background images for scenes
 */

import type { Core } from 'cytoscape';
import type { BackgroundImage, BackgroundImageId, SceneId } from '../core/main-types';
import type { SceneBackgroundImage } from '../core/background-types';
import type { BackgroundRenderer } from '../background/background-renderer';
import { graphStore } from '../storage/graph-store';
import { isEditMode } from '../storage/app-mode';
import { getTheme } from '../styles/themes';
import { isDebug } from '../config/debug-flags';

const MAX_BACKGROUND_IMAGE_BYTES = 1 * 1024 * 1024;
const MAX_BACKGROUND_IMAGE_DIMENSION = 2048;
const ALLOWED_BACKGROUND_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_BACKGROUND_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);

export class SceneBackground {
  #cy: Core;
  #backgroundRenderer: BackgroundRenderer;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;
    this.#backgroundRenderer = backgroundRenderer;

    // Subscribe to zoom/pan events and update background
    this.#cy.on('zoom pan', () => {
      const zoom = this.#cy.zoom();
      const pan = this.#cy.pan();
      this.#backgroundRenderer.redraw(zoom, pan);
    });
  }

  /**
   * Get the list of available background images from the library
   */
  getLibrary(): BackgroundImage[] {
    return graphStore.backgroundImages;
  }

  /**
   * Upload a new image to the background library
   */
  async uploadImage(file: File): Promise<BackgroundImageId> {
    const validationError = this.#validateUploadFile(file);
    if (validationError) {
      throw new Error(validationError);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        const dataUri = e.target?.result as string;
        
        // Create Image to get dimensions
        const img = new Image();
        img.onload = async () => {
          const dimensionError = this.#validateImageDimensions(img.width, img.height);
          if (dimensionError) {
            reject(new Error(dimensionError));
            return;
          }

          const newImage: BackgroundImage = {
            id: `bg${Date.now()}` as BackgroundImageId,
            name: file.name,
            dataUri,
            width: img.width,
            height: img.height,
            createdAt: new Date()
          };

          const imageId = await graphStore.createBackgroundImage(newImage);
          resolve(imageId);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUri;
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  #validateUploadFile(file: File): string | null {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (file.type) {
      if (!ALLOWED_BACKGROUND_IMAGE_MIME_TYPES.has(file.type)) {
        return 'Only PNG, JPEG, and WebP images are allowed.';
      }
    } else if (!ALLOWED_BACKGROUND_IMAGE_EXTENSIONS.has(extension)) {
      return 'Only PNG, JPEG, and WebP images are allowed.';
    }

    if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
      return 'Background images must be 1 MB or smaller.';
    }

    return null;
  }

  #validateImageDimensions(width: number, height: number): string | null {
    if (width > MAX_BACKGROUND_IMAGE_DIMENSION || height > MAX_BACKGROUND_IMAGE_DIMENSION) {
      return 'Background images must be at most 2048 x 2048 pixels.';
    }

    return null;
  }

  /**
   * Create a SceneBackgroundImage config for a given image ID
   * Calculates cover size based on current viewport extent
   * Uses theme defaults for image settings
   */
  createConfig(imageId: BackgroundImageId): SceneBackgroundImage | null {
    const image = graphStore.backgroundImages.find(img => img.id === imageId);
    if (!image) {
      console.warn(`Image ${imageId} not found in library`);
      return null;
    }

    const { size, position } = this.#calculateCoverSize(image.width, image.height);

    // Get theme defaults for background images
    const sceneId = this.#cy.scratch('currentSceneId') as SceneId | undefined;
    const scene = sceneId ? graphStore.scenes.find(s => s.id === sceneId) : null;
    const themeId = scene?.themeId ?? 'default';
    const theme = getTheme(themeId);
    const defaults = theme.imageDefaults ?? {};

    return {
      id: `scene-bg-${Date.now()}`,
      imageId,
      position,
      size,
      zIndex: 0,
      appearance: {
        opacity: defaults.opacity ?? 0.7,
        blendMode: defaults.blendMode ?? 'source-over',
        brightness: defaults.brightness ?? 0.5,
        contrast: defaults.contrast ?? 1.0,
        saturation: defaults.saturation ?? 0.8,
        hue: defaults.hue ?? 0,
        blur: defaults.blur ?? 0,
        borderFade: defaults.borderFade ?? 0.1,
        selectiveColor: defaults.selectiveColor
      }
    };
  }

  /**
   * Update background image for the current scene
   */
  async updateForScene(sceneId: SceneId, config: Partial<SceneBackgroundImage>): Promise<void> {
    const scene = graphStore.scenes.find(s => s.id === sceneId);
    if (!scene) {
      console.error(`Scene ${sceneId} not found`);
      return;
    }

    // Check if this is a removal (empty object)
    const isRemoval = Object.keys(config).length === 0;
    const shouldPersist = isEditMode();

    if (isRemoval) {
      if (shouldPersist) {
        scene.backgroundImages = [];
      }
      this.#backgroundRenderer.clear();
      if (isDebug('d_background')) console.log('SceneBackground: Removed background image');
    } else {
      const backgroundImage = config as SceneBackgroundImage;
      if (shouldPersist) {
        scene.backgroundImages = [backgroundImage];
      }
      
      await this.#backgroundRenderer.render([backgroundImage]);
      const zoom = this.#cy.zoom();
      const pan = this.#cy.pan();
      this.#backgroundRenderer.redraw(zoom, pan);
      this.#backgroundRenderer.getMainCanvas().style.opacity = '1';
      
      if (isDebug('d_background')) console.log('SceneBackground: Updated background image');
    }

    if (shouldPersist) {
      await graphStore.updateScene(scene);
    }
  }

  /**
   * Load background images for a scene
   */
  async loadForScene(sceneId: SceneId): Promise<void> {
    const scene = graphStore.scenes.find(s => s.id === sceneId);
    if (!scene) {
      console.error(`Scene ${sceneId} not found`);
      return;
    }

    if (scene.backgroundImages && scene.backgroundImages.length > 0) {
      await this.#backgroundRenderer.render(scene.backgroundImages);
      const zoom = this.#cy.zoom();
      const pan = this.#cy.pan();
      this.#backgroundRenderer.redraw(zoom, pan);
    } else {
      this.#backgroundRenderer.clear();
    }
  }

  /**
   * Clear the background
   */
  clear(): void {
    this.#backgroundRenderer.clear();
  }

  /**
   * Resize the background canvas.
   * Resizing a canvas clears its bitmap, so redraw at the current viewport.
   * Zoom is unchanged and only pan shifts, so the image stays the same size
   * and locked to the graph — the net transform is a pure translation.
   */
  resize(width: number, height: number): void {
    this.#backgroundRenderer.resize(width, height);
    this.#backgroundRenderer.redraw(this.#cy.zoom(), this.#cy.pan());
  }

  /**
   * Fit viewport so the background image covers the entire viewport
   * Uses "cover" logic: image fills viewport, possibly cropping edges if aspect ratios differ
   * @param duration - Animation duration in ms (default 300)
   * @returns true if fit was performed, false if no background image
   */
  fitToBackground(duration: number = 300): boolean {
    const sceneId = this.#cy.scratch('currentSceneId') as SceneId;
    const scene = graphStore.scenes.find(s => s.id === sceneId);
    
    if (!scene?.backgroundImages?.length) {
      return false;
    }

    const bg = scene.backgroundImages[0];
    const { position, size } = bg;

    const container = this.#cy.container();
    if (!container) {
      return false;
    }

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Calculate zoom using "cover" logic (image fills viewport)
    // Use the LARGER zoom factor so image covers the entire viewport
    const zoomX = containerWidth / size.width;
    const zoomY = containerHeight / size.height;
    const targetZoom = Math.max(zoomX, zoomY);
    
    // Calculate pan to center the image
    const centerX = position.x + size.width / 2;
    const centerY = position.y + size.height / 2;
    const targetPan = {
      x: containerWidth / 2 - centerX * targetZoom,
      y: containerHeight / 2 - centerY * targetZoom
    };

    // Animate to target viewport
    this.#cy.animate({
      zoom: targetZoom,
      pan: targetPan
    }, {
      duration,
      easing: 'ease-out'
    });

    return true;
  }
  /**
   * Calculate size and position for an image to cover the current viewport
   */
  #calculateCoverSize(
    imageWidth: number,
    imageHeight: number
  ): { size: { width: number; height: number }; position: { x: number; y: number } } {
    const extent = this.#cy.extent();
    const extentWidth = extent.w;
    const extentHeight = extent.h;
    const extentCenterX = (extent.x1 + extent.x2) / 2;
    const extentCenterY = (extent.y1 + extent.y2) / 2;

    const imageAspect = imageWidth / imageHeight;
    const extentAspect = extentWidth / extentHeight;

    let coverWidth: number;
    let coverHeight: number;

    if (imageAspect > extentAspect) {
      // Image is wider than extent - fit to height
      coverHeight = extentHeight;
      coverWidth = coverHeight * imageAspect;
    } else {
      // Image is taller than extent - fit to width
      coverWidth = extentWidth;
      coverHeight = coverWidth / imageAspect;
    }

    const position = {
      x: extentCenterX - coverWidth / 2,
      y: extentCenterY - coverHeight / 2
    };

    return { size: { width: coverWidth, height: coverHeight }, position };
  }
}
