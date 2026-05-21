/**
 * Settings Modal
 * VS Code-style settings dialog with tree navigation and search
 */

import { SETTING_CATEGORIES, getAllSettings, type SettingCategory, type SettingDefinition } from '../../config/setting-definitions';
import { getSetting, setSetting, resetSetting, FACTORY_DEFAULTS, type SettingKey } from '../../config';
import { getTheme } from '../../styles/themes';
import type { ColorTheme } from '../../core/style-types';
import '../../styles/settings-modal.css';

// ============================================================================
// CUSTOM THEME PLACEHOLDER RESOLUTION
// ============================================================================

/** Map from customTheme setting key suffix to a path into ColorTheme */
const CUSTOM_THEME_PATHS: Record<string, (t: ColorTheme) => unknown> = {
  canvasColor:                   t => t.canvas.background.color,
  canvasVignetteStrength:        t => t.canvas.background.vignette?.strength ?? 0,
  canvasVignetteSpread:          t => t.canvas.background.vignette?.spread ?? 50,
  canvasVignetteBlur:            t => t.canvas.background.vignette?.blur ?? 200,
  canvasVignetteColor:           t => t.canvas.background.vignette?.color ?? '#000000',
  canvasVignetteColorOpacity:    t => t.canvas.background.vignette?.colorOpacity ?? 1,
  nodeBackground:                t => t.node.background.color,
  nodeOpacity:                   t => t.node.background.opacity ?? 1,
  nodeTextColor:                 t => t.node.text.color,
  nodeBorderColor:               t => t.node.border.color,
  nodeBorderWidth:               t => t.node.border.width ?? 0,
  centralBorderColor:            t => t.node.borderCentral.color,
  selectedBorderColor:           t => t.node.borderSelected.color,
  centralSelectedBorderColor:    t => t.node.borderCentralSelected.color,
  shadowOffsetX:                 t => t.node.shadow.offsetX,
  shadowOffsetY:                 t => t.node.shadow.offsetY,
  shadowBlur:                    t => t.node.shadow.blur,
  shadowOpacity:                 t => t.node.shadow.opacity,
  shadowColor:                   t => t.node.shadow.color,
  nodeVignetteStrength:          t => t.node.background.vignette?.strength ?? 0,
  nodeVignetteSpread:            t => t.node.background.vignette?.spread ?? 50,
  nodeVignetteBlur:              t => t.node.background.vignette?.blur ?? 200,
  nodeVignetteColor:             t => t.node.background.vignette?.color ?? '#000000',
  edgeColor:                     t => t.edge.line.color,
  edgeArrowColor:                t => t.edge.arrow.color,
};

/** Get the base theme's value for a customTheme setting key */
function getCustomThemePlaceholder(settingKey: string): string | undefined {
  if (!settingKey.startsWith('customTheme.')) return undefined;
  const suffix = settingKey.slice('customTheme.'.length);
  if (suffix === 'baseTheme') return undefined;
  const resolver = CUSTOM_THEME_PATHS[suffix];
  if (!resolver) return undefined;
  const baseId = getSetting('customTheme.baseTheme' as SettingKey) as string;
  const base = getTheme(baseId);
  return String(resolver(base));
}

// ============================================================================
// SETTINGS MODAL
// ============================================================================

export class SettingsModal {
  #overlay: HTMLDivElement | null = null;
  #modal: HTMLDivElement | null = null;
  #treeContainer: HTMLDivElement | null = null;
  #contentContainer: HTMLDivElement | null = null;
  #searchInput: HTMLInputElement | null = null;
  #scrollObserver: IntersectionObserver | null = null;
  #pendingChanges: Map<SettingKey, unknown> = new Map();
  #isOpen: boolean = false;

  /**
   * Open the settings modal
   */
  open(): void {
    if (this.#isOpen) return;
    this.#isOpen = true;
    this.#pendingChanges.clear();
    this.#render();
  }

  /**
   * Close the settings modal
   */
  close(): void {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#applyChanges();
    this.#cleanup();
  }

  /**
   * Check if modal is open
   */
  isOpen(): boolean {
    return this.#isOpen;
  }

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  #render(): void {
    // Create overlay
    this.#overlay = document.createElement('div');
    this.#overlay.className = 'settings-overlay';
    this.#overlay.addEventListener('click', (e) => {
      if (e.target === this.#overlay) {
        this.close();
      }
    });

    // Create modal
    this.#modal = document.createElement('div');
    this.#modal.className = 'settings-modal';

    // Header (draggable)
    const header = document.createElement('div');
    header.className = 'settings-header';
    header.innerHTML = `
      <h2>Settings</h2>
      <button class="settings-close-btn" title="Close (Escape)">×</button>
    `;
    header.querySelector('.settings-close-btn')?.addEventListener('click', () => this.close());
    this.#setupDrag(header);

    // Search bar
    const searchBar = document.createElement('div');
    searchBar.className = 'settings-search';
    this.#searchInput = document.createElement('input');
    this.#searchInput.type = 'text';
    this.#searchInput.placeholder = 'Search settings...';
    this.#searchInput.className = 'settings-search-input';
    this.#searchInput.addEventListener('input', () => this.#handleSearch());
    searchBar.appendChild(this.#searchInput);

    // Body (tree + content)
    const body = document.createElement('div');
    body.className = 'settings-body';

    // Tree panel
    this.#treeContainer = document.createElement('div');
    this.#treeContainer.className = 'settings-tree';
    this.#renderTree(SETTING_CATEGORIES, this.#treeContainer, 0);

    // Content panel
    this.#contentContainer = document.createElement('div');
    this.#contentContainer.className = 'settings-content';
    this.#renderAllSettings();

    body.appendChild(this.#treeContainer);
    body.appendChild(this.#contentContainer);

    // Footer with buttons
    const footer = document.createElement('div');
    footer.className = 'settings-footer';
    footer.innerHTML = `
      <button class="settings-btn settings-btn-secondary" data-action="restore" style="margin-right: auto;">Restore factory defaults</button>
      <button class="settings-btn settings-btn-secondary" data-action="cancel">Cancel</button>
      <button class="settings-btn settings-btn-primary" data-action="apply">Apply</button>
    `;
    footer.querySelector('[data-action="restore"]')?.addEventListener('click', () => {
      this.#restoreFactoryDefaults();
    });
    footer.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      this.#pendingChanges.clear();
      this.#closeWithoutApply();
    });
    footer.querySelector('[data-action="apply"]')?.addEventListener('click', () => {
      this.close();
    });

    // Assemble modal
    this.#modal.appendChild(header);
    this.#modal.appendChild(searchBar);
    this.#modal.appendChild(body);
    this.#modal.appendChild(footer);
    this.#overlay.appendChild(this.#modal);

    // Add to DOM
    document.body.appendChild(this.#overlay);

    // Position modal in center of left area (graph + suggestions)
    this.#positionModal();

    // Focus search input
    this.#searchInput.focus();

    // Keyboard handler
    document.addEventListener('keydown', this.#handleKeydown);

    // Scroll spy: highlight nav item when section scrolls into view
    this.#setupScrollSpy();
  }

  #setupScrollSpy(): void {
    if (!this.#contentContainer || !this.#treeContainer) return;

    this.#scrollObserver = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        let topSection: Element | null = null;
        let topY = Infinity;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.boundingClientRect.top < topY) {
            topY = entry.boundingClientRect.top;
            topSection = entry.target;
          }
        }
        if (!topSection) return;

        const categoryId = topSection.id.replace('settings-section-', '');
        this.#treeContainer?.querySelectorAll('.settings-tree-item').forEach(el => {
          el.classList.toggle('active', (el as HTMLElement).dataset.categoryId === categoryId);
        });
      },
      {
        root: this.#contentContainer,
        rootMargin: '0px 0px -70% 0px', // Trigger when section enters top 30%
        threshold: 0
      }
    );

    this.#contentContainer.querySelectorAll('.settings-section').forEach(section => {
      this.#scrollObserver!.observe(section);
    });
  }

  #positionModal(): void {
    if (!this.#modal) return;
    
    // Get the left area (everything except chat panel)
    const chatPanel = document.getElementById('chat');
    const chatWidth = chatPanel?.offsetWidth || 350;
    const viewportWidth = window.innerWidth;
    const leftAreaWidth = viewportWidth - chatWidth;
    
    const modalWidth = this.#modal.offsetWidth;
    const modalHeight = this.#modal.offsetHeight;
    
    const left = (leftAreaWidth - modalWidth) / 2;
    const top = (window.innerHeight - modalHeight) / 2;
    
    this.#modal.style.left = `${Math.max(20, left)}px`;
    this.#modal.style.top = `${Math.max(20, top)}px`;
  }

  #setupDrag(header: HTMLElement): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = this.#modal!.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging || !this.#modal) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      this.#modal.style.left = `${startLeft + dx}px`;
      this.#modal.style.top = `${startTop + dy}px`;
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  #renderTree(categories: SettingCategory[], container: HTMLElement, depth: number): void {
    for (const category of categories) {
      const hasChildren = category.children && category.children.length > 0;
      
      // Wrapper for item + children
      const wrapper = document.createElement('div');
      wrapper.className = 'settings-tree-node';
      
      const item = document.createElement('div');
      item.className = 'settings-tree-item';
      item.dataset.categoryId = category.id;
      item.style.paddingLeft = `${12 + depth * 16}px`;

      const icon = category.icon || '•';
      const toggleIcon = hasChildren ? '▾' : '';

      item.innerHTML = `
        ${hasChildren ? `<span class="settings-tree-toggle">${toggleIcon}</span>` : '<span style="width:12px"></span>'}
        <span class="settings-tree-icon">${icon}</span>
        <span class="settings-tree-label">${category.label}</span>
      `;

      item.addEventListener('click', () => {
        // Toggle collapse if has children
        if (hasChildren) {
          wrapper.classList.toggle('collapsed');
        }
        
        // Scroll to section
        this.#scrollToCategory(category.id);
        
        // Update active state
        this.#treeContainer?.querySelectorAll('.settings-tree-item').forEach(el => {
          el.classList.remove('active');
        });
        item.classList.add('active');
      });

      wrapper.appendChild(item);

      // Children container
      if (hasChildren) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'settings-tree-children';
        this.#renderTree(category.children!, childrenContainer, depth + 1);
        wrapper.appendChild(childrenContainer);
      }
      
      container.appendChild(wrapper);
    }
  }

  #renderAllSettings(): void {
    if (!this.#contentContainer) return;
    this.#contentContainer.innerHTML = '';
    this.#renderCategorySettings(SETTING_CATEGORIES, this.#contentContainer);
  }

  #renderCategorySettings(categories: SettingCategory[], container: HTMLElement): void {
    for (const category of categories) {
      // Category header
      const section = document.createElement('div');
      section.className = 'settings-section';
      section.id = `settings-section-${category.id}`;

      const header = document.createElement('h3');
      header.className = 'settings-section-header';
      header.textContent = category.label;
      section.appendChild(header);

      // Category description (if present)
      if (category.description) {
        const desc = document.createElement('div');
        desc.className = 'settings-section-description';
        desc.textContent = category.description;
        section.appendChild(desc);
      }

      // Settings in this category
      if (category.settings) {
        for (const setting of category.settings) {
          const settingEl = this.#renderSetting(setting);
          section.appendChild(settingEl);
        }
      }

      container.appendChild(section);

      // Recurse into children
      if (category.children) {
        this.#renderCategorySettings(category.children, container);
      }
    }
  }

  #renderSetting(setting: SettingDefinition): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'settings-item';
    wrapper.dataset.settingKey = setting.key;

    const labelRow = document.createElement('div');
    labelRow.className = 'settings-item-label-row';

    const label = document.createElement('label');
    label.className = 'settings-item-label';
    label.textContent = setting.label;

    const resetBtn = document.createElement('button');
    resetBtn.className = 'settings-reset-btn';
    resetBtn.textContent = '↺';
    resetBtn.title = 'Reset to default';
    resetBtn.addEventListener('click', () => {
      resetSetting(setting.key);
      this.#pendingChanges.delete(setting.key);
      this.#updateInputValue(wrapper, setting);
    });

    labelRow.appendChild(label);
    labelRow.appendChild(resetBtn);

    const description = document.createElement('div');
    description.className = 'settings-item-description';
    description.textContent = setting.description;

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'settings-item-input';
    this.#renderInput(inputWrapper, setting);

    wrapper.appendChild(labelRow);
    wrapper.appendChild(description);
    wrapper.appendChild(inputWrapper);

    return wrapper;
  }

  #renderInput(container: HTMLElement, setting: SettingDefinition): void {
    const currentValue = this.#getDisplayValue(setting.key);

    switch (setting.type) {
      case 'number': {
        const isCustomTheme = setting.key.startsWith('customTheme.');
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'settings-input-number';
        // Custom theme: empty string = inherit, show empty input
        input.value = (isCustomTheme && currentValue === '') ? '' : String(currentValue);
        if (setting.min !== undefined) input.min = String(setting.min);
        if (setting.max !== undefined) input.max = String(setting.max);
        if (setting.step !== undefined) input.step = String(setting.step);

        // Placeholder from base theme for custom theme settings
        const numPlaceholder = getCustomThemePlaceholder(setting.key);
        if (numPlaceholder) input.placeholder = numPlaceholder;

        // Range slider when min/max are defined
        if (setting.min !== undefined && setting.max !== undefined) {
          const range = document.createElement('input');
          range.type = 'range';
          range.className = 'settings-input-range';
          range.min = String(setting.min);
          range.max = String(setting.max);
          range.step = String(setting.step ?? 1);
          // When empty (inherit), position slider at base theme value
          range.value = (isCustomTheme && currentValue === '') ? (numPlaceholder ?? String(setting.min)) : String(currentValue);
          range.addEventListener('input', () => {
            input.value = range.value;
            this.#pendingChanges.set(setting.key, isCustomTheme ? range.value : Number(range.value));
          });
          input.addEventListener('change', () => {
            if (isCustomTheme && input.value === '') {
              this.#pendingChanges.set(setting.key, '');
            } else {
              range.value = input.value;
              this.#pendingChanges.set(setting.key, isCustomTheme ? input.value : Number(input.value));
            }
          });
          container.appendChild(range);
        } else {
          input.addEventListener('change', () => {
            if (isCustomTheme && input.value === '') {
              this.#pendingChanges.set(setting.key, '');
            } else {
              this.#pendingChanges.set(setting.key, Number(input.value));
            }
          });
        }
        container.appendChild(input);
        break;
      }

      case 'boolean': {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'settings-input-checkbox';
        input.checked = Boolean(currentValue);
        input.addEventListener('change', () => {
          this.#pendingChanges.set(setting.key, input.checked);
        });
        container.appendChild(input);
        break;
      }

      case 'select': {
        const select = document.createElement('select');
        select.className = 'settings-input-select';
        for (const opt of setting.options || []) {
          const option = document.createElement('option');
          option.value = String(opt.value);
          option.textContent = opt.label;
          if (opt.value === currentValue) option.selected = true;
          select.appendChild(option);
        }
        select.addEventListener('change', () => {
          this.#pendingChanges.set(setting.key, select.value);
        });
        container.appendChild(select);
        break;
      }

      case 'string': {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'settings-input-text';
        input.value = String(currentValue);

        // Placeholder from base theme for custom theme settings
        const strPlaceholder = getCustomThemePlaceholder(setting.key);
        if (strPlaceholder) input.placeholder = strPlaceholder;

        input.addEventListener('change', () => {
          this.#pendingChanges.set(setting.key, input.value);
        });
        container.appendChild(input);
        break;
      }

      case 'textarea': {
        const textarea = document.createElement('textarea');
        textarea.className = 'settings-input-textarea';
        textarea.value = String(currentValue);
        textarea.rows = 5;
        textarea.placeholder = 'e.g. Respond in a Socratic style, or: Assume I have a PhD in physics';
        textarea.addEventListener('change', () => {
          this.#pendingChanges.set(setting.key, textarea.value);
        });
        container.appendChild(textarea);
        break;
      }

      case 'stageTiming': {
        // Special handling for [duration, delay] tuple
        const tuple = currentValue as [number, number];
        
        const durationInput = document.createElement('input');
        durationInput.type = 'number';
        durationInput.className = 'settings-input-number settings-input-small';
        durationInput.value = String(tuple[0]);
        durationInput.min = '0';
        durationInput.max = '5000';
        durationInput.step = '50';
        durationInput.title = 'Duration (ms)';

        const hideDelay = setting.hideDelay === true;

        const delayInput = document.createElement('input');
        delayInput.type = 'number';
        delayInput.className = 'settings-input-number settings-input-small';
        delayInput.value = String(tuple[1]);
        delayInput.min = '0';
        delayInput.max = '5000';
        delayInput.step = '50';
        delayInput.title = 'Delay after (ms)';

        const updateTuple = () => {
          this.#pendingChanges.set(setting.key, [
            Number(durationInput.value),
            Number(delayInput.value)
          ]);
        };

        durationInput.addEventListener('change', updateTuple);
        delayInput.addEventListener('change', updateTuple);

        const label1 = document.createElement('span');
        label1.className = 'settings-input-label';
        label1.textContent = 'Duration:';

        container.appendChild(label1);
        container.appendChild(durationInput);

        if (!hideDelay) {
          const label2 = document.createElement('span');
          label2.className = 'settings-input-label';
          label2.textContent = 'Delay:';

          container.appendChild(label2);
          container.appendChild(delayInput);
        }
        break;
      }

      case 'numberArray': {
        const arr = currentValue as number[];
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'settings-input-text';
        input.value = arr.join(', ');
        input.title = 'Comma-separated numbers';
        input.addEventListener('change', () => {
          const parsed = input.value
            .split(',')
            .map(s => parseFloat(s.trim()))
            .filter(n => !isNaN(n));
          if (parsed.length > 0) {
            this.#pendingChanges.set(setting.key, parsed);
          }
        });
        container.appendChild(input);
        break;
      }
    }
  }

  #updateInputValue(wrapper: HTMLElement, setting: SettingDefinition): void {
    const inputWrapper = wrapper.querySelector('.settings-item-input');
    if (inputWrapper) {
      inputWrapper.innerHTML = '';
      this.#renderInput(inputWrapper as HTMLElement, setting);
    }
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  #handleSearch(): void {
    const query = this.#searchInput?.value.toLowerCase().trim() || '';
    
    if (!query) {
      // Show all
      this.#contentContainer?.querySelectorAll('.settings-item').forEach(el => {
        (el as HTMLElement).style.display = '';
      });
      this.#contentContainer?.querySelectorAll('.settings-section').forEach(el => {
        (el as HTMLElement).style.display = '';
      });
      return;
    }

    const allSettings = getAllSettings();
    const matchingKeys = new Set<string>();

    for (const setting of allSettings) {
      const matches = 
        setting.label.toLowerCase().includes(query) ||
        setting.description.toLowerCase().includes(query) ||
        setting.key.toLowerCase().includes(query);
      
      if (matches) {
        matchingKeys.add(setting.key);
      }
    }

    // Hide/show settings
    this.#contentContainer?.querySelectorAll('.settings-item').forEach(el => {
      const key = (el as HTMLElement).dataset.settingKey;
      (el as HTMLElement).style.display = matchingKeys.has(key || '') ? '' : 'none';
    });

    // Hide empty sections
    this.#contentContainer?.querySelectorAll('.settings-section').forEach(section => {
      const visibleItems = section.querySelectorAll('.settings-item:not([style*="display: none"])');
      (section as HTMLElement).style.display = visibleItems.length > 0 ? '' : 'none';
    });
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  #scrollToCategory(categoryId: string): void {
    const section = this.#contentContainer?.querySelector(`#settings-section-${categoryId}`);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ==========================================================================
  // KEYBOARD
  // ==========================================================================

  #handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  };

  // ==========================================================================
  // APPLY & CLEANUP
  // ==========================================================================

  /**
   * Display value for an input: prefer staged pending change, fall back to
   * persisted value. Used by #renderInput so re-renders after staging (e.g.
   * factory restore, search) reflect uncommitted changes.
   */
  #getDisplayValue(key: SettingKey): unknown {
    if (this.#pendingChanges.has(key)) return this.#pendingChanges.get(key);
    return getSetting(key);
  }

  /**
   * Stage every factory default into #pendingChanges, then re-render all
   * inputs. API keys are preserved (matches workspace export behavior —
   * API keys are never exported and are user-private).
   * User must still click Apply to commit; Cancel discards staged defaults.
   */
  #restoreFactoryDefaults(): void {
    const confirmed = confirm(
      'Restore all settings to factory defaults?\n\n' +
      'API keys are preserved. All other settings (themes, transitions, ' +
      'fold behavior, etc.) will be reset.\n\n' +
      'You can still review the staged changes and click Cancel before they are saved.'
    );
    if (!confirmed) return;

    // Keys preserved across factory reset. Kept in sync with SENSITIVE_KEYS in
    // src/storage/workspace/transfer.ts — if you add a new API key there, add
    // it here too.
    const PRESERVED_KEYS = new Set<SettingKey>([
      'ai.geminiApiKey',
      'ai.openrouterApiKey',
    ]);

    for (const [domain, settings] of Object.entries(FACTORY_DEFAULTS)) {
      for (const [name, defaultValue] of Object.entries(settings)) {
        const key = `${domain}.${name}` as SettingKey;
        if (PRESERVED_KEYS.has(key)) continue;
        this.#pendingChanges.set(key, defaultValue);
      }
    }

    this.#renderAllSettings();
  }

  #applyChanges(): void {
    for (const [key, value] of this.#pendingChanges) {
      setSetting(key, value);
    }
    this.#pendingChanges.clear();
  }

  #closeWithoutApply(): void {
    this.#isOpen = false;
    this.#pendingChanges.clear();
    this.#cleanup();
  }

  #cleanup(): void {
    document.removeEventListener('keydown', this.#handleKeydown);
    this.#scrollObserver?.disconnect();
    this.#scrollObserver = null;
    this.#overlay?.remove();
    this.#overlay = null;
    this.#modal = null;
    this.#treeContainer = null;
    this.#contentContainer = null;
    this.#searchInput = null;
  }
}
