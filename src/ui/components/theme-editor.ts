/**
 * Theme Editor
 * Modal picker for selecting scene themes
 * Returns selected themeId via Promise (picker pattern)
 */

import type { EdgeStyle } from '../../core/style-types';
import { getAvailableThemes, getTheme, isBuiltInTheme } from '../../styles/themes';
import '../../styles/theme-editor.css';

// =============================================================================
// THEME EDITOR (Picker Pattern)
// =============================================================================

export class ThemeEditor {
  #overlay: HTMLDivElement | null = null;
  #modal: HTMLDivElement | null = null;
  #resolve: ((themeId: string | null) => void) | null = null;
  #selectedThemeId: string = 'dark';
  #originalThemeId: string = 'dark';
  #isDragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Show the theme editor
   * @param currentThemeId - The current theme ID for the scene
   * @param containerRect - Graph viewport bounds for centering
   * @returns Selected themeId or null if cancelled/unchanged
   */
  show(currentThemeId: string, containerRect: DOMRect): Promise<string | null> {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      
      this.#originalThemeId = currentThemeId;
      this.#selectedThemeId = currentThemeId;
      
      this.#render(containerRect);
    });
  }

  // ===========================================================================
  // RENDERING
  // ===========================================================================

  #render(containerRect: DOMRect): void {
    // Create full-screen overlay with CSS centering
    this.#overlay = document.createElement('div');
    this.#overlay.className = 'theme-editor-overlay';
    
    this.#overlay.addEventListener('click', (e) => {
      if (e.target === this.#overlay) {
        this.#cancel();
      }
    });

    // Create modal
    this.#modal = document.createElement('div');
    this.#modal.className = 'theme-editor-modal';
    
    // Position modal at center of graph viewport
    const centerX = containerRect.left + containerRect.width / 2;
    const centerY = containerRect.top + containerRect.height / 2;
    this.#modal.style.position = 'fixed';
    this.#modal.style.left = `${centerX}px`;
    this.#modal.style.top = `${centerY}px`;
    this.#modal.style.transform = 'translate(-50%, -50%)';

    // Header
    const header = this.#createHeader();
    this.#setupDrag(header);
    
    // Body
    const body = this.#createBody();
    
    // Footer
    const footer = this.#createFooter();

    // Assemble
    this.#modal.appendChild(header);
    this.#modal.appendChild(body);
    this.#modal.appendChild(footer);
    this.#overlay.appendChild(this.#modal);
    document.body.appendChild(this.#overlay);

    // Keyboard handler
    document.addEventListener('keydown', this.#handleKeydown);
  }

  #createHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'theme-editor-header';
    header.innerHTML = `
      <h2>Scene Theme</h2>
      <button class="theme-editor-close-btn" title="Close (Escape)">×</button>
    `;
    header.querySelector('.theme-editor-close-btn')?.addEventListener('click', () => this.#cancel());
    return header;
  }

  #createBody(): HTMLDivElement {
    const body = document.createElement('div');
    body.className = 'theme-editor-body';

    // Theme selector
    const selector = this.#createThemeSelector();
    body.appendChild(selector);

    // Color preview
    const preview = this.#createColorPreview();
    body.appendChild(preview);

    return body;
  }

  #createThemeSelector(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'theme-selector';

    const label = document.createElement('label');
    label.textContent = 'Select Theme';
    container.appendChild(label);

    const select = document.createElement('select');
    select.id = 'theme-select';

    const themes = getAvailableThemes();
    themes.forEach(theme => {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = theme.name;
      if (theme.id === this.#selectedThemeId) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener('change', () => {
      this.#selectedThemeId = select.value;
      this.#updateColorPreview();
    });

    container.appendChild(select);
    return container;
  }

  #createColorPreview(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'color-preview-container';
    this.#renderColorPreview(container);
    return container;
  }

  #renderColorPreview(container: HTMLDivElement): void {
    const theme = getTheme(this.#selectedThemeId);
    const isBuiltIn = isBuiltInTheme(this.#selectedThemeId);

    container.innerHTML = '';

    // Canvas section
    container.appendChild(this.#createColorSection('Canvas', [
      { label: 'Background', value: theme.canvas.background.color }
    ], isBuiltIn));

    // Node section
    container.appendChild(this.#createColorSection('Node', [
      { label: 'Background', value: theme.node.background.color },
      { label: 'Background Alt', value: theme.node.backgroundAlt.color },
      { label: 'Text', value: theme.node.text.color },
      { label: 'Border', value: theme.node.border.color },
      { label: 'Accent', value: theme.node.accent.color }
    ], isBuiltIn));

    // Edge section
    const edgeSection = this.#createColorSection('Edge', [
      { label: 'Line', value: theme.edge.line.color },
      { label: 'Arrow', value: theme.edge.arrow.color }
    ], isBuiltIn);
    edgeSection.appendChild(this.#createEdgeStyleSlotsPreview(theme.edgeStyleSlots ?? {
      'edge-style-1': theme.edge,
      'edge-style-2': theme.edge,
      'edge-style-3': theme.edge
    }));
    container.appendChild(edgeSection);
  }

  #createEdgeStyleSlotsPreview(edgeStyleSlots: Record<string, EdgeStyle>): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'edge-style-slots-preview';

    const title = document.createElement('div');
    title.className = 'edge-style-slots-title';
    title.textContent = 'Thematic Edge Styles';
    container.appendChild(title);

    const slotIds = ['edge-style-1', 'edge-style-2', 'edge-style-3'];
    slotIds.forEach((slotId, index) => {
      const edgeStyle = edgeStyleSlots[slotId];
      if (!edgeStyle) return;

      const row = document.createElement('div');
      row.className = 'edge-style-slot-row';

      const label = document.createElement('span');
      label.className = 'edge-style-slot-label';
      label.textContent = `Style ${index + 1}`;

      const sample = document.createElement('span');
      sample.className = 'edge-style-slot-sample';
      sample.style.setProperty('--edge-style-color', edgeStyle.line.color);
      sample.style.setProperty('--edge-style-width', `${edgeStyle.width ?? 2}px`);
      sample.classList.toggle('edge-style-slot-sample-straight', (edgeStyle.curveStyle ?? 'bezier') === 'straight');
      sample.classList.add(`edge-style-slot-arrow-${edgeStyle.arrowShape ?? 'triangle'}`);

      const meta = document.createElement('span');
      meta.className = 'edge-style-slot-meta';
      meta.textContent = `${edgeStyle.line.color} / ${edgeStyle.width ?? 2}px / ${edgeStyle.arrowShape ?? 'triangle'} / ${edgeStyle.arrowScale ?? 1}x / ${edgeStyle.curveStyle ?? 'bezier'}`;

      row.appendChild(label);
      row.appendChild(sample);
      row.appendChild(meta);
      container.appendChild(row);
    });

    return container;
  }

  #createColorSection(
    title: string, 
    colors: Array<{ label: string; value: string }>,
    readOnly: boolean
  ): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'color-section';

    const titleEl = document.createElement('div');
    titleEl.className = 'color-section-title';
    titleEl.textContent = title;
    section.appendChild(titleEl);

    colors.forEach(({ label, value }) => {
      const row = document.createElement('div');
      row.className = 'color-row';

      const labelEl = document.createElement('label');
      labelEl.textContent = label;
      row.appendChild(labelEl);

      const wrapper = document.createElement('div');
      wrapper.className = 'color-input-wrapper';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'color-input';
      colorInput.value = value;
      colorInput.disabled = readOnly;

      const hexInput = document.createElement('input');
      hexInput.type = 'text';
      hexInput.className = 'color-hex';
      hexInput.value = value;
      hexInput.disabled = readOnly;

      // Sync inputs
      colorInput.addEventListener('input', () => {
        hexInput.value = colorInput.value;
      });

      hexInput.addEventListener('change', () => {
        if (/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
          colorInput.value = hexInput.value;
        }
      });

      wrapper.appendChild(colorInput);
      wrapper.appendChild(hexInput);
      row.appendChild(wrapper);
      section.appendChild(row);
    });

    return section;
  }

  #updateColorPreview(): void {
    const container = document.getElementById('color-preview-container');
    if (container) {
      this.#renderColorPreview(container as HTMLDivElement);
    }
  }

  #createFooter(): HTMLDivElement {
    const footer = document.createElement('div');
    footer.className = 'theme-editor-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'theme-editor-btn theme-editor-btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.#cancel());

    const applyBtn = document.createElement('button');
    applyBtn.className = 'theme-editor-btn theme-editor-btn-primary';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => this.#apply());

    footer.appendChild(cancelBtn);
    footer.appendChild(applyBtn);
    return footer;
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  #apply(): void {
    // Only return themeId if it changed
    const result = this.#selectedThemeId !== this.#originalThemeId 
      ? this.#selectedThemeId 
      : null;
    
    this.#cleanup();
    this.#resolve?.(result);
    this.#resolve = null;
  }

  #cancel(): void {
    this.#cleanup();
    this.#resolve?.(null);
    this.#resolve = null;
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  #handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.#cancel();
    }
  };

  #setupDrag(handle: HTMLElement): void {
    handle.addEventListener('mousedown', (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('button')) return;
      if (!this.#modal) return;

      this.#isDragging = true;
      const rect = this.#modal.getBoundingClientRect();
      this.#dragOffsetX = event.clientX - rect.left;
      this.#dragOffsetY = event.clientY - rect.top;
      this.#modal.style.transform = '';
      document.body.style.cursor = 'move';
      event.preventDefault();
    });

    document.addEventListener('mousemove', this.#handleMouseMove);
    document.addEventListener('mouseup', this.#handleMouseUp);
  }

  #handleMouseMove = (event: MouseEvent): void => {
    if (!this.#isDragging || !this.#modal) return;
    this.#modal.style.left = `${event.clientX - this.#dragOffsetX}px`;
    this.#modal.style.top = `${event.clientY - this.#dragOffsetY}px`;
  };

  #handleMouseUp = (): void => {
    this.#isDragging = false;
    document.body.style.cursor = '';
  };

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  #cleanup(): void {
    document.removeEventListener('keydown', this.#handleKeydown);
    document.removeEventListener('mousemove', this.#handleMouseMove);
    document.removeEventListener('mouseup', this.#handleMouseUp);
    this.#isDragging = false;
    document.body.style.cursor = '';
    
    if (this.#overlay) {
      this.#overlay.remove();
      this.#overlay = null;
    }
    this.#modal = null;
  }
}
