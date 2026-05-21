/**
 * BackgroundCanvas
 * Manages a single canvas element for rendering background images.
 * Receives processed image sources from parent.
 */

import type { SceneBackgroundImage, ImageVisualAppearance } from '../core/background-types';
import type { BackgroundImageId } from '../core/main-types';
import { graphToCanvas, scaleSize } from '../utils/coordinate-transform';

export type ImageSource = HTMLImageElement | HTMLCanvasElement;

export class BackgroundCanvas {
  #canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D;
  #images: SceneBackgroundImage[] = [];
  #sources: Map<BackgroundImageId, ImageSource> = new Map();

  constructor(container: HTMLElement, zIndex: number = 0) {
    // Create canvas element
    this.#canvas = document.createElement('canvas');
    this.#canvas.style.position = 'absolute';
    this.#canvas.style.top = '0';
    this.#canvas.style.left = '0';
    this.#canvas.style.pointerEvents = 'none';
    this.#canvas.style.zIndex = String(zIndex);

    // Set canvas size to match container
    this.#canvas.width = container.clientWidth;
    this.#canvas.height = container.clientHeight;

    // Get 2D context
    const ctx = this.#canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context');
    }
    this.#ctx = ctx;

    // Insert canvas as first child (behind cytoscape)
    container.insertBefore(this.#canvas, container.firstChild);
  }

  /**
   * Store images and their sources for rendering
   */
  setImages(
    images: SceneBackgroundImage[],
    sources: Map<BackgroundImageId, ImageSource>
  ): void {
    this.#images = images;
    this.#sources = sources;
  }

  /**
   * Redraw all images at given viewport position
   */
  redraw(
    zoom: number,
    pan: { x: number; y: number }
  ): void {
    // Clear canvas
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

    if (this.#images.length === 0) {
      return;
    }

    // Sort by zIndex
    const sorted = [...this.#images].sort((a, b) => a.zIndex - b.zIndex);

    // Draw each image
    for (const sceneImage of sorted) {
      this.#drawImage(sceneImage, zoom, pan);
    }
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    this.#images = [];
    this.#sources = new Map();
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
  }

  /**
   * Resize canvas to match container
   */
  resize(width: number, height: number): void {
    this.#canvas.width = width;
    this.#canvas.height = height;
  }

  /**
   * Get the canvas DOM element (for opacity animation)
   */
  getElement(): HTMLCanvasElement {
    return this.#canvas;
  }

  /**
   * Remove canvas from DOM
   */
  destroy(): void {
    if (this.#canvas.parentNode) {
      this.#canvas.parentNode.removeChild(this.#canvas);
    }
  }

  /**
   * Draw a single background image
   */
  #drawImage(
    sceneImage: SceneBackgroundImage,
    zoom: number,
    pan: { x: number; y: number }
  ): void {
    const source = this.#sources.get(sceneImage.imageId);
    if (!source) {
      console.warn(`Image source not found: ${sceneImage.imageId}`);
      return;
    }

    // Save context state
    this.#ctx.save();

    // Calculate canvas position from graph coordinates
    const canvasPos = graphToCanvas(sceneImage.position.x, sceneImage.position.y, zoom, pan);

    // Scale image size based on zoom
    const canvasWidth = scaleSize(sceneImage.size.width, zoom);
    const canvasHeight = scaleSize(sceneImage.size.height, zoom);

    const appearance = sceneImage.appearance;

    // Apply opacity
    this.#ctx.globalAlpha = appearance.opacity ?? 1;

    // Apply blend mode
    if (appearance.blendMode) {
      this.#ctx.globalCompositeOperation = appearance.blendMode as GlobalCompositeOperation;
    }

    // Apply color filters
    this.#ctx.filter = this.#buildFilterString(appearance);

    // Draw image (source can be HTMLImageElement or HTMLCanvasElement)
    this.#ctx.drawImage(source, canvasPos.x, canvasPos.y, canvasWidth, canvasHeight);

    // Apply border fade if specified
    const borderFade = appearance.borderFade ?? 0;
    if (borderFade > 0) {
      this.#applyBorderFade(canvasPos.x, canvasPos.y, canvasWidth, canvasHeight, borderFade);
    }

    // Restore context state
    this.#ctx.restore();
  }

  /**
   * Build CSS filter string from appearance settings
   */
  #buildFilterString(appearance: ImageVisualAppearance): string {
    const filters: string[] = [];

    if (appearance.brightness !== undefined && appearance.brightness !== 1) {
      filters.push(`brightness(${appearance.brightness})`);
    }

    if (appearance.contrast !== undefined && appearance.contrast !== 1) {
      filters.push(`contrast(${appearance.contrast})`);
    }

    if (appearance.saturation !== undefined && appearance.saturation !== 1) {
      filters.push(`saturate(${appearance.saturation})`);
    }

    if (appearance.blur !== undefined && appearance.blur > 0) {
      filters.push(`blur(${appearance.blur}px)`);
    }

    if (appearance.hue !== undefined && appearance.hue !== 0) {
      filters.push(`hue-rotate(${appearance.hue}deg)`);
    }

    return filters.length > 0 ? filters.join(' ') : 'none';
  }

  /**
   * Apply border fade effect to image edges
   */
  #applyBorderFade(
    x: number,
    y: number,
    width: number,
    height: number,
    fadeAmount: number
  ): void {
    const fadeW = width * fadeAmount;
    const fadeH = height * fadeAmount;

    this.#ctx.save();
    this.#ctx.globalCompositeOperation = 'destination-in';

    // Vertical gradient
    let grad = this.#ctx.createLinearGradient(x, y, x, y + height);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(fadeH / height, 'rgba(255,255,255,1)');
    grad.addColorStop(1 - fadeH / height, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    this.#ctx.fillStyle = grad;
    this.#ctx.fillRect(x, y, width, height);

    // Horizontal gradient
    grad = this.#ctx.createLinearGradient(x, y, x + width, y);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(fadeW / width, 'rgba(255,255,255,1)');
    grad.addColorStop(1 - fadeW / width, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    this.#ctx.fillStyle = grad;
    this.#ctx.fillRect(x, y, width, height);

    this.#ctx.restore();
  }
}
