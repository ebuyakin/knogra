/**
 * Background Image Editor
 * Modal dialog for editing scene background image settings
 */

import type { SceneBackgroundImage, BlendMode } from '../../core/background-types';
import type { BackgroundImage, BackgroundImageId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';
import '../../styles/background-editor.css';

const MAX_BACKGROUND_IMAGE_BYTES = 1 * 1024 * 1024;
const MAX_BACKGROUND_IMAGE_DIMENSION = 2048;
const ALLOWED_BACKGROUND_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_BACKGROUND_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);

export class BackgroundEditor {
  #dialog: HTMLDialogElement | null = null;
  #currentImage: SceneBackgroundImage | null = null;
  #createDefaultConfig: ((imageId: BackgroundImageId) => SceneBackgroundImage | null) | null = null;
  #onSave: ((updates: Partial<SceneBackgroundImage>) => Promise<void>) | null = null;
  #container: HTMLElement;
  #originalAspectRatio: number = 1;

  constructor(container: HTMLElement) {
    this.#container = container;
  }

  /**
   * Show editor dialog
   * @param sceneBackgroundImage - Current background image config (or null to create new)
   * @param createDefaultConfig - Callback to create default config for new images (calculates cover size/position)
   * @param onSave - Callback to save changes
   */
  show(
    sceneBackgroundImage: SceneBackgroundImage | null,
    createDefaultConfig: (imageId: BackgroundImageId) => SceneBackgroundImage | null,
    onSave: (updates: Partial<SceneBackgroundImage>) => Promise<void>
  ): void {
    this.#currentImage = sceneBackgroundImage;
    this.#createDefaultConfig = createDefaultConfig;
    this.#onSave = onSave;
    
    // Calculate original aspect ratio if image exists
    if (sceneBackgroundImage) {
      this.#originalAspectRatio = sceneBackgroundImage.size.width / sceneBackgroundImage.size.height;
    }
    
    this.#renderDialog();
    this.#dialog?.showModal();
    this.#positionDialog();
  }

  #renderDialog(): void {
    // Remove existing dialog if any
    this.#dialog?.remove();

    // Create dialog element
    this.#dialog = document.createElement('dialog');
    this.#dialog.className = 'bg-image-editor-dialog';

    const hasImage = this.#currentImage !== null;

    // Build dialog content with fixed header/footer and scrollable middle
    this.#dialog.innerHTML = `
      <div class="bg-image-editor-container">
        <div class="bg-editor-header">
          <h2>Background Image Settings</h2>
        </div>
        
        <div class="bg-editor-fixed-top">
          ${this.#renderImageSection(hasImage)}
          ${this.#renderPositionSection(hasImage)}
        </div>
        
        <div class="bg-editor-scrollable">
          ${this.#renderAppearanceSection(hasImage)}
          ${this.#renderColorFiltersSection(hasImage)}
          ${this.#renderSelectiveColorSection(hasImage)}
        </div>
        
        <div class="bg-editor-footer">
          <div class="bg-image-editor-actions">
            ${hasImage ? '<button class="remove-btn">Remove from scene</button>' : ''}
            <button class="cancel-btn">Cancel</button>
            <button class="save-btn">Save</button>
          </div>
        </div>
      </div>
    `;

    // Add to document
    document.body.appendChild(this.#dialog);

    // Wire up event handlers
    this.#attachEventHandlers();
    
    // Make draggable
    this.#makeDraggable();
  }

  #renderImageSection(hasImage: boolean): string {
    const currentImageId = this.#currentImage?.imageId || '';
    const libraryImages = graphStore.backgroundImages;

    // Build set of image IDs used in any scene
    const usedImageIds = new Set<string>();
    for (const scene of graphStore.scenes) {
      if (scene.backgroundImages) {
        for (const bg of scene.backgroundImages) {
          usedImageIds.add(bg.imageId);
        }
      }
    }

    // Build thumbnail grid
    const thumbnails = libraryImages.map(img => {
      const isSelected = img.id === currentImageId;
      const isUsed = usedImageIds.has(img.id);
      const deleteBtn = isUsed ? '' : '<span class="bg-thumb-delete" title="Delete from library">×</span>';
      return `
        <div class="bg-image-thumb ${isSelected ? 'selected' : ''}" data-image-id="${img.id}" title="${this.#escapeHtml(img.name)}">
          <img src="${img.dataUri}" alt="${this.#escapeHtml(img.name)}" />
          ${deleteBtn}
        </div>
      `;
    }).join('');

    return `
      <div class="bg-image-section">
        <span class="bg-image-section-title">Image Library</span>
        <div class="bg-image-library">
          ${thumbnails}
          <div class="bg-image-thumb add-new" title="Upload new image">
            <span>+</span>
          </div>
        </div>
        <input 
          type="file" 
          id="bg-image-upload" 
          accept="image/png,image/jpeg,image/webp"
          style="display: none;"
        />
        ${hasImage
          ? `<div class="bg-image-selected">Selected: ${this.#escapeHtml(libraryImages.find(img => img.id === currentImageId)?.name || 'None')}. Allowed: PNG, JPEG, and WebP; max 1 MB; max 2048 x 2048 px.</div>`
          : '<div class="bg-image-selected">No image selected. Allowed: PNG, JPEG, and WebP; max 1 MB; max 2048 x 2048 px.</div>'}
      </div>
    `;
  }

  #renderPositionSection(hasImage: boolean): string {
    if (!hasImage) return '';

    const pos = this.#currentImage!.position;
    const size = this.#currentImage!.size;
    
    // Calculate scale (use width as reference)
    const scale = size.width;

    return `
      <div class="bg-image-section">
        <span class="bg-image-section-title">Position & Size</span>
        <div class="bg-image-input-group">
          <label>X:</label>
          <input type="number" id="bg-pos-x" value="${pos.x}" step="10" />
        </div>
        <div class="bg-image-input-group">
          <label>Y:</label>
          <input type="number" id="bg-pos-y" value="${pos.y}" step="10" />
        </div>
        <div class="bg-image-input-group">
          <label>Scale:</label>
          <input type="number" id="bg-scale" value="${scale}" step="10" min="10" />
        </div>
        <div class="bg-image-input-group">
          <label>Aspect Ratio:</label>
          <input type="number" id="bg-aspect" value="${this.#originalAspectRatio.toFixed(2)}" step="0.01" min="0.1" />
        </div>
      </div>
    `;
  }

  #renderAppearanceSection(hasImage: boolean): string {
    if (!hasImage) return '';

    const appearance = this.#currentImage!.appearance;
    const opacity = appearance.opacity ?? 1;
    const zIndex = this.#currentImage!.zIndex;
    const blendMode = appearance.blendMode || 'source-over';
    const borderFade = appearance.borderFade ?? 0;

    return `
      <div class="bg-image-section" data-section="appearance">
        <div class="bg-section-header">
          <span class="bg-section-toggle">▼</span>
          <span class="bg-section-title">Appearance</span>
        </div>
        <div class="bg-section-content">
          <div class="bg-image-input-group">
            <label>Opacity:</label>
            <input type="range" id="bg-opacity" min="0" max="100" value="${opacity * 100}" />
            <span class="bg-value" id="bg-opacity-value">${Math.round(opacity * 100)}%</span>
          </div>
          <div class="bg-image-input-group">
            <label>Z-Index:</label>
            <input type="number" id="bg-zindex" value="${zIndex}" step="1" />
          </div>
          <div class="bg-image-input-group">
            <label>Blend Mode:</label>
            <select id="bg-blend-mode">
              ${this.#renderBlendModeOptions(blendMode)}
            </select>
          </div>
          <div class="bg-image-input-group">
            <label>Border Fade:</label>
            <input type="range" id="bg-border-fade" min="0" max="50" value="${borderFade * 100}" />
            <span class="bg-value" id="bg-border-fade-value">${Math.round(borderFade * 100)}%</span>
          </div>
        </div>
      </div>
    `;
  }

  #renderColorFiltersSection(hasImage: boolean): string {
    if (!hasImage) return '';

    const appearance = this.#currentImage!.appearance;

    return `
      <div class="bg-image-section" data-section="color-filters">
        <div class="bg-section-header">
          <span class="bg-section-toggle">▼</span>
          <span class="bg-section-title">Color Filters</span>
        </div>
        <div class="bg-section-content">
          <div class="bg-image-input-group">
            <label>Brightness:</label>
            <input type="range" id="bg-brightness" min="0" max="200" value="${(appearance.brightness ?? 1) * 100}" />
            <span class="bg-value" id="bg-brightness-value">${Math.round((appearance.brightness ?? 1) * 100)}%</span>
          </div>
          <div class="bg-image-input-group">
            <label>Contrast:</label>
            <input type="range" id="bg-contrast" min="0" max="200" value="${(appearance.contrast ?? 1) * 100}" />
            <span class="bg-value" id="bg-contrast-value">${Math.round((appearance.contrast ?? 1) * 100)}%</span>
          </div>
          <div class="bg-image-input-group">
            <label>Saturation:</label>
            <input type="range" id="bg-saturation" min="0" max="200" value="${(appearance.saturation ?? 1) * 100}" />
            <span class="bg-value" id="bg-saturation-value">${Math.round((appearance.saturation ?? 1) * 100)}%</span>
          </div>
          <div class="bg-image-input-group">
            <label>Blur:</label>
            <input type="range" id="bg-blur" min="0" max="10" value="${appearance.blur ?? 0}" step="0.5" />
            <span class="bg-value" id="bg-blur-value">${appearance.blur ?? 0}px</span>
          </div>
          <div class="bg-image-input-group">
            <label>Hue:</label>
            <input type="range" id="bg-hue" min="0" max="360" value="${appearance.hue ?? 0}" />
            <span class="bg-value" id="bg-hue-value">${appearance.hue ?? 0}°</span>
          </div>
        </div>
      </div>
    `;
  }

  #renderSelectiveColorSection(hasImage: boolean): string {
    if (!hasImage) return '';

    const selective = this.#currentImage!.appearance?.selectiveColor ?? {};
    const colors = ['red', 'yellow', 'green', 'blue'] as const;

    const colorSections = colors.map(color => {
      const colorData = selective[color] ?? {};
      const hue = colorData.hue ?? 0;
      const sat = colorData.saturation ?? 1;
      const light = colorData.lightness ?? 1;

      return `
        <div class="bg-selective-color-group" data-color="${color}">
          <span class="bg-color-label">${color.charAt(0).toUpperCase() + color.slice(1)}</span>
          <div class="bg-image-input-group">
            <label>Hue:</label>
            <input type="range" id="bg-sc-${color}-hue" min="-30" max="30" value="${hue}" />
            <span class="bg-value" id="bg-sc-${color}-hue-value">${hue > 0 ? '+' : ''}${hue}°</span>
          </div>
          <div class="bg-image-input-group">
            <label>Saturation:</label>
            <input type="range" id="bg-sc-${color}-sat" min="0" max="200" value="${sat * 100}" />
            <span class="bg-value" id="bg-sc-${color}-sat-value">${Math.round(sat * 100)}%</span>
          </div>
          <div class="bg-image-input-group">
            <label>Lightness:</label>
            <input type="range" id="bg-sc-${color}-light" min="0" max="200" value="${light * 100}" />
            <span class="bg-value" id="bg-sc-${color}-light-value">${Math.round(light * 100)}%</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="bg-image-section bg-selective-color-section collapsed" data-section="selective-color">
        <div class="bg-section-header">
          <span class="bg-section-toggle">▼</span>
          <span class="bg-section-title">Selective Color</span>
        </div>
        <div class="bg-section-content">
          <p class="bg-section-hint">Adjust specific color ranges independently</p>
          <div class="bg-selective-color-list">
            ${colorSections}
          </div>
        </div>
      </div>
    `;
  }

  #renderBlendModeOptions(currentMode: BlendMode): string {
    const modes: BlendMode[] = [
      'source-over', 'multiply', 'screen', 'overlay', 
      'darken', 'lighten', 'color-dodge', 'color-burn',
      'hard-light', 'soft-light', 'difference', 'exclusion'
    ];

    return modes.map(mode => 
      `<option value="${mode}" ${mode === currentMode ? 'selected' : ''}>${mode}</option>`
    ).join('');
  }

  #attachEventHandlers(): void {
    if (!this.#dialog) return;

    // Collapsible section headers
    const sectionHeaders = this.#dialog.querySelectorAll('.bg-section-header');
    sectionHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.bg-image-section');
        section?.classList.toggle('collapsed');
      });
    });

    // Upload button (the + thumbnail)
    const addNewBtn = this.#dialog.querySelector('.bg-image-thumb.add-new');
    const fileInput = this.#dialog.querySelector('#bg-image-upload') as HTMLInputElement;
    
    addNewBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => this.#handleImageUpload(e));

    // Delete buttons on thumbnails
    const deleteButtons = this.#dialog.querySelectorAll('.bg-thumb-delete');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger image selection
        const thumb = btn.closest('.bg-image-thumb');
        const imageId = thumb?.getAttribute('data-image-id') as BackgroundImageId;
        if (imageId) {
          this.#handleImageDelete(imageId);
        }
      });
    });

    // Image thumbnail selection
    const thumbs = this.#dialog.querySelectorAll('.bg-image-thumb:not(.add-new)');
    thumbs.forEach(thumb => {
      thumb.addEventListener('click', () => {
        const imageId = thumb.getAttribute('data-image-id') as BackgroundImageId;
        this.#handleImageSelect(imageId);
      });
    });

    // Range slider live updates
    this.#attachRangeUpdates();

    // Save button
    const saveBtn = this.#dialog.querySelector('.save-btn');
    saveBtn?.addEventListener('click', () => this.#handleSave());

    // Remove button
    const removeBtn = this.#dialog.querySelector('.remove-btn');
    removeBtn?.addEventListener('click', () => this.#handleRemove());

    // Cancel button
    const cancelBtn = this.#dialog.querySelector('.cancel-btn');
    cancelBtn?.addEventListener('click', () => this.#close());

    // Click outside / ESC to cancel
    this.#dialog.addEventListener('click', (e) => {
      if (e.target === this.#dialog) this.#close();
    });

    this.#dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.#close();
    });
  }

  #attachRangeUpdates(): void {
    if (!this.#dialog) return;

    const ranges = [
      { id: 'bg-opacity', valueId: 'bg-opacity-value', format: (v: number) => `${Math.round(v)}%` },
      { id: 'bg-brightness', valueId: 'bg-brightness-value', format: (v: number) => `${Math.round(v)}%` },
      { id: 'bg-contrast', valueId: 'bg-contrast-value', format: (v: number) => `${Math.round(v)}%` },
      { id: 'bg-saturation', valueId: 'bg-saturation-value', format: (v: number) => `${Math.round(v)}%` },
      { id: 'bg-blur', valueId: 'bg-blur-value', format: (v: number) => `${v}px` },
      { id: 'bg-hue', valueId: 'bg-hue-value', format: (v: number) => `${Math.round(v)}°` },
      { id: 'bg-border-fade', valueId: 'bg-border-fade-value', format: (v: number) => `${Math.round(v)}%` }
    ];

    ranges.forEach(({ id, valueId, format }) => {
      const input = this.#dialog?.querySelector(`#${id}`) as HTMLInputElement;
      const valueSpan = this.#dialog?.querySelector(`#${valueId}`);
      
      input?.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        if (valueSpan) valueSpan.textContent = format(value);
      });
    });

    // Selective color range sliders
    const colors = ['red', 'yellow', 'green', 'blue'];
    const scRanges = colors.flatMap(color => [
      { id: `bg-sc-${color}-hue`, valueId: `bg-sc-${color}-hue-value`, format: (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}°` },
      { id: `bg-sc-${color}-sat`, valueId: `bg-sc-${color}-sat-value`, format: (v: number) => `${Math.round(v)}%` },
      { id: `bg-sc-${color}-light`, valueId: `bg-sc-${color}-light-value`, format: (v: number) => `${Math.round(v)}%` }
    ]);

    scRanges.forEach(({ id, valueId, format }) => {
      const input = this.#dialog?.querySelector(`#${id}`) as HTMLInputElement;
      const valueSpan = this.#dialog?.querySelector(`#${valueId}`);
      
      input?.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        if (valueSpan) valueSpan.textContent = format(value);
      });
    });
  }

  async #handleImageUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;

    const validationError = this.#validateUploadFile(file);
    if (validationError) {
      alert(validationError);
      input.value = '';
      return;
    }

    // Read file as data URI
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUri = e.target?.result as string;
      
      // Create Image to get dimensions
      const img = new Image();
      img.onload = async () => {
        const dimensionError = this.#validateImageDimensions(img.width, img.height);
        if (dimensionError) {
          alert(dimensionError);
          input.value = '';
          return;
        }

        // Create new BackgroundImage
        const newImage: BackgroundImage = {
          id: `bg${Date.now()}` as BackgroundImageId,
          name: file.name,
          dataUri,
          width: img.width,
          height: img.height,
          createdAt: new Date()
        };

        // Persist to database immediately
        const imageId = await graphStore.createBackgroundImage(newImage);

        // Select the newly uploaded image
        this.#handleImageSelect(imageId);
        input.value = '';
      };
      img.onerror = () => {
        alert('Failed to load image');
        input.value = '';
      };
      img.src = dataUri;
    };
    reader.onerror = () => {
      alert('Failed to read file');
      input.value = '';
    };
    reader.readAsDataURL(file);
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

  async #handleImageDelete(imageId: BackgroundImageId): Promise<void> {
    const image = graphStore.backgroundImages.find(img => img.id === imageId);
    if (!image) return;

    if (!confirm(`Delete "${image.name}" from library?`)) return;

    await graphStore.deleteBackgroundImage(imageId);

    // Re-render dialog to update library
    this.#renderDialog();
    this.#dialog?.showModal();
    this.#positionDialog();
  }

  #handleImageSelect(imageId: BackgroundImageId): void {
    const selectedImage = graphStore.backgroundImages.find(img => img.id === imageId);
    if (!selectedImage) {
      console.warn(`Image ${imageId} not found in library`);
      return;
    }

    // Update or create SceneBackgroundImage
    if (!this.#currentImage) {
      // Create new SceneBackgroundImage using feature callback for proper defaults
      const defaultConfig = this.#createDefaultConfig?.(imageId);
      if (defaultConfig) {
        this.#currentImage = defaultConfig;
        this.#originalAspectRatio = defaultConfig.size.width / defaultConfig.size.height;
      } else {
        // Fallback if callback not provided or returns null
        this.#originalAspectRatio = selectedImage.width / selectedImage.height;
        this.#currentImage = {
          id: `scene-bg-${Date.now()}`,
          imageId,
          position: { x: 0, y: 0 },
          size: { width: selectedImage.width, height: selectedImage.height },
          zIndex: 0,
          appearance: {
            opacity: 1,
            blendMode: 'source-over',
            brightness: 1,
            contrast: 1,
            saturation: 1,
            hue: 0,
            blur: 0,
            borderFade: 0
          }
        };
      }
    } else {
      // Update existing - change image, update aspect ratio
      this.#currentImage.imageId = imageId;
      this.#originalAspectRatio = selectedImage.width / selectedImage.height;
      // Optionally update size to match new image aspect ratio
      const currentScale = this.#currentImage.size.width;
      this.#currentImage.size = {
        width: currentScale,
        height: currentScale / this.#originalAspectRatio
      };
    }

    // Re-render dialog to show updated selection and styling options
    this.#renderDialog();
    this.#dialog?.showModal();
    this.#positionDialog();
  }

  async #handleSave(): Promise<void> {
    if (!this.#dialog || !this.#onSave) return;

    // If no image yet, can't save
    if (!this.#currentImage) {
      alert('Please upload an image first');
      return;
    }

    // Get scale and aspect ratio
    const scale = parseFloat((this.#dialog.querySelector('#bg-scale') as HTMLInputElement)?.value || '100');
    const aspectRatio = parseFloat((this.#dialog.querySelector('#bg-aspect') as HTMLInputElement)?.value || '1');
    
    // Calculate width and height from scale and aspect ratio
    const width = scale;
    const height = scale / aspectRatio;

    // Collect all values
    const updates: Partial<SceneBackgroundImage> = {
      ...this.#currentImage,
      position: {
        x: parseFloat((this.#dialog.querySelector('#bg-pos-x') as HTMLInputElement)?.value || '0'),
        y: parseFloat((this.#dialog.querySelector('#bg-pos-y') as HTMLInputElement)?.value || '0')
      },
      size: {
        width,
        height
      },
      zIndex: parseInt((this.#dialog.querySelector('#bg-zindex') as HTMLInputElement)?.value || '0'),
      appearance: {
        opacity: parseFloat((this.#dialog.querySelector('#bg-opacity') as HTMLInputElement)?.value || '100') / 100,
        blendMode: (this.#dialog.querySelector('#bg-blend-mode') as HTMLSelectElement)?.value as BlendMode,
        brightness: parseFloat((this.#dialog.querySelector('#bg-brightness') as HTMLInputElement)?.value || '100') / 100,
        contrast: parseFloat((this.#dialog.querySelector('#bg-contrast') as HTMLInputElement)?.value || '100') / 100,
        saturation: parseFloat((this.#dialog.querySelector('#bg-saturation') as HTMLInputElement)?.value || '100') / 100,
        blur: parseFloat((this.#dialog.querySelector('#bg-blur') as HTMLInputElement)?.value || '0'),
        hue: parseFloat((this.#dialog.querySelector('#bg-hue') as HTMLInputElement)?.value || '0'),
        borderFade: parseFloat((this.#dialog.querySelector('#bg-border-fade') as HTMLInputElement)?.value || '0') / 100,
        selectiveColor: this.#collectSelectiveColor()
      }
    };

    await this.#onSave(updates);
    this.#close();
  }

  /**
   * Collect selective color values from sliders
   * Returns undefined if all values are at defaults (to keep data clean)
   */
  #collectSelectiveColor(): import('../../core/background-types').SelectiveColorAdjustment | undefined {
    if (!this.#dialog) return undefined;

    const colors = ['red', 'yellow', 'green', 'blue'] as const;
    const result: import('../../core/background-types').SelectiveColorAdjustment = {};
    let hasNonDefaultValues = false;

    for (const color of colors) {
      const hue = parseFloat((this.#dialog.querySelector(`#bg-sc-${color}-hue`) as HTMLInputElement)?.value || '0');
      const sat = parseFloat((this.#dialog.querySelector(`#bg-sc-${color}-sat`) as HTMLInputElement)?.value || '100') / 100;
      const light = parseFloat((this.#dialog.querySelector(`#bg-sc-${color}-light`) as HTMLInputElement)?.value || '100') / 100;

      // Check if any value is non-default
      if (hue !== 0 || sat !== 1 || light !== 1) {
        hasNonDefaultValues = true;
        result[color] = {
          hue: hue !== 0 ? hue : undefined,
          saturation: sat !== 1 ? sat : undefined,
          lightness: light !== 1 ? light : undefined
        };
      }
    }

    return hasNonDefaultValues ? result : undefined;
  }

  async #handleRemove(): Promise<void> {
    if (!confirm('Remove background image from scene?')) return;
    
    // Pass null to indicate removal
    if (this.#onSave) {
      await this.#onSave({} as any); // Special case: empty object means remove
    }
    this.#close();
  }

  #positionDialog(): void {
    if (!this.#dialog) return;

    // Get container bounds
    const containerRect = this.#container.getBoundingClientRect();
    
    // Position dialog in center of container
    const centerX = containerRect.left + containerRect.width / 2;
    const centerY = containerRect.top + containerRect.height / 2;
    
    this.#dialog.style.position = 'fixed';
    this.#dialog.style.left = `${centerX}px`;
    this.#dialog.style.top = `${centerY}px`;
    this.#dialog.style.transform = 'translate(-50%, -50%)';
    this.#dialog.style.margin = '0';
  }

  #close(): void {
    this.#dialog?.close();
    this.#dialog?.remove();
    this.#dialog = null;
    this.#currentImage = null;
    this.#onSave = null;
  }

  #makeDraggable(): void {
    if (!this.#dialog) return;

    const header = this.#dialog.querySelector('h2');
    if (!header) return;

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;

    const onMouseDown = (e: MouseEvent) => {
      // Only drag if clicking on the header
      if (e.target !== header) return;

      isDragging = true;
      initialX = e.clientX - currentX;
      initialY = e.clientY - currentY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !this.#dialog) return;

      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      this.#dialog.style.transform = `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px))`;
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    header.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  #escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
