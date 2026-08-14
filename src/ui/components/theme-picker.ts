/**
 * Theme Picker
 * Modal for choosing a scene's theme.
 *
 * This is a picker, not an editor. The left column lists every available theme;
 * the right column is a read-only inspector of the selected theme's *resolved*
 * parameters (post-merge with DEFAULT_THEME), grouped into Canvas / Node / Edges
 * tabs so the choice can be made on evidence rather than on the name alone.
 * Theme authoring happens in the palette files, not here.
 *
 * Returns the chosen theme and scope via Promise (picker pattern).
 */

import { getAvailableThemes, getTheme } from '../../styles/themes';
import { resolveEdgeStyleSlot } from '../../styles/edge-visual-resolver';
import { getEdgeStyleSlotIds } from '../../config/edge-type-settings';
import { buildThemePreview, canvasVignetteShadow } from './theme-preview';
import type { ColorTheme, EdgeStyle, GradientConfig, VignetteConfig } from '../../core/style-types';
import '../../styles/theme-picker.css';

// =============================================================================
// TYPES
// =============================================================================

export interface ThemePickerResult {
  themeId: string;
  /** 'current' applies to the active scene only; 'all' applies workspace-wide. */
  scope: 'current' | 'all';
}

type TabId = 'preview' | 'canvas' | 'node' | 'effects' | 'edges';

/** One label/value line in the inspector. `color` adds a swatch beside the value. */
interface DetailRow {
  label: string;
  value: string;
  color?: string;
}

interface DetailGroup {
  title: string;
  rows: DetailRow[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Upper bound on theme-list rows before the list scrolls. The available set is
 * 16 built-ins plus Custom, so nothing scrolls today; the cap only bites if the
 * set ever grows.
 */
const MAX_VISIBLE_THEME_ROWS = 20;

/**
 * Vignette fields are optional throughout the theme types. These are the same
 * fallbacks the renderers apply, so the inspector reports what actually paints
 * rather than "undefined".
 */
const VIGNETTE_FALLBACK = {
  strength: 0,
  spread: 50,
  blur: 200,
  color: '#000000',
  colorOpacity: 1
};

// =============================================================================
// ROW BUILDERS — theme data in, display rows out
// =============================================================================

function textRow(label: string, value: string | number): DetailRow {
  return { label, value: String(value) };
}

function numberRow(label: string, value: number | undefined, fallback: number): DetailRow {
  return { label, value: String(value ?? fallback) };
}

function colorRow(label: string, value: string): DetailRow {
  return { label, value, color: value };
}

function describeGradient(gradient: GradientConfig | undefined): string {
  if (!gradient || gradient.type === 'solid') return 'solid';
  if (gradient.type === 'linear') return `linear ${gradient.angle ?? 180}°`;
  return 'radial';
}

function vignetteRows(vignette: VignetteConfig | undefined): DetailRow[] {
  const config = vignette ?? {};
  return [
    numberRow('Strength', config.strength, VIGNETTE_FALLBACK.strength),
    numberRow('Spread', config.spread, VIGNETTE_FALLBACK.spread),
    numberRow('Blur', config.blur, VIGNETTE_FALLBACK.blur),
    colorRow('Color', config.color ?? VIGNETTE_FALLBACK.color),
    numberRow('Color Opacity', config.colorOpacity, VIGNETTE_FALLBACK.colorOpacity)
  ];
}

function buildCanvasGroups(theme: ColorTheme): DetailGroup[] {
  const background = theme.canvas.background;
  const image = theme.imageDefaults ?? {};

  return [
    {
      title: 'Background',
      rows: [
        colorRow('Color', background.color),
        numberRow('Opacity', background.opacity, 1),
        numberRow('Brightness', background.brightness, 1),
        numberRow('Saturation', background.saturation, 1),
        numberRow('Hue', background.hue, 0),
        textRow('Gradient', describeGradient(background.gradient))
      ]
    },
    { title: 'Vignette', rows: vignetteRows(background.vignette) },
    {
      title: 'Background Images',
      rows: [
        numberRow('Opacity', image.opacity, 1),
        numberRow('Brightness', image.brightness, 1),
        numberRow('Contrast', image.contrast, 1),
        numberRow('Saturation', image.saturation, 1)
      ]
    }
  ];
}

function buildNodeGroups(theme: ColorTheme): DetailGroup[] {
  const node = theme.node;

  return [
    {
      title: 'Background',
      rows: [
        colorRow('Color', node.background.color),
        numberRow('Opacity', node.background.opacity, 1),
        numberRow('Brightness', node.background.brightness, 1),
        numberRow('Saturation', node.background.saturation, 1),
        numberRow('Hue', node.background.hue, 0),
        textRow('Gradient', describeGradient(node.background.gradient))
      ]
    },
    {
      title: 'Background Alt',
      rows: [
        colorRow('Color', node.backgroundAlt.color),
        numberRow('Opacity', node.backgroundAlt.opacity, 1)
      ]
    },
    {
      title: 'Text',
      rows: [
        colorRow('Primary', node.text.color),
        numberRow('Primary Opacity', node.text.opacity, 1),
        colorRow('Secondary', node.textSecondary.color),
        numberRow('Secondary Opacity', node.textSecondary.opacity, 1)
      ]
    },
    {
      title: 'Accent',
      rows: [
        colorRow('Color', node.accent.color),
        numberRow('Opacity', node.accent.opacity, 1)
      ]
    }
  ];
}

/** Everything the theme draws around the node fill rather than inside it. */
function buildNodeEffectGroups(theme: ColorTheme): DetailGroup[] {
  const node = theme.node;

  return [
    {
      title: 'Borders',
      rows: [
        colorRow('Normal', node.border.color),
        numberRow('Normal Width', node.border.width, 0),
        colorRow('Central', node.borderCentral.color),
        numberRow('Central Width', node.borderCentral.width, 0),
        colorRow('Selected', node.borderSelected.color),
        numberRow('Selected Width', node.borderSelected.width, 0),
        colorRow('Central + Selected', node.borderCentralSelected.color),
        numberRow('Central + Selected Width', node.borderCentralSelected.width, 0)
      ]
    },
    {
      title: 'Shadow',
      rows: [
        textRow('Offset X', node.shadow.offsetX),
        textRow('Offset Y', node.shadow.offsetY),
        textRow('Blur', node.shadow.blur),
        textRow('Opacity', node.shadow.opacity),
        colorRow('Color', node.shadow.color)
      ]
    },
    { title: 'Vignette', rows: vignetteRows(node.background.vignette) }
  ];
}

function edgeStyleRows(style: EdgeStyle): DetailRow[] {
  return [
    colorRow('Line', style.line.color),
    numberRow('Line Opacity', style.line.opacity, 1),
    colorRow('Arrow', style.arrow.color),
    textRow('Arrow Shape', style.arrowShape ?? 'triangle'),
    numberRow('Width', style.width, 2),
    textRow('Curve Style', style.curveStyle ?? 'bezier')
  ];
}

function buildEdgeGroups(theme: ColorTheme): DetailGroup[] {
  const edge = theme.edge;

  const base: DetailGroup = {
    title: 'Base',
    rows: [
      colorRow('Line', edge.line.color),
      numberRow('Line Opacity', edge.line.opacity, 1),
      colorRow('Line Secondary', edge.lineSecondary.color),
      colorRow('Arrow', edge.arrow.color),
      colorRow('Label', edge.label.color),
      numberRow('Width', edge.width, 2)
    ]
  };

  // The three preconfigured styles an edge type can point at. Resolved rather
  // than read raw, so a theme that omits a slot shows the synthesised fallback.
  const slots = getEdgeStyleSlotIds().map((slotId, index) => ({
    title: `Style ${index + 1}`,
    rows: edgeStyleRows(resolveEdgeStyleSlot(theme, slotId))
  }));

  return [base, ...slots];
}

const TAB_LABELS: { id: TabId; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'node', label: 'Node' },
  { id: 'effects', label: 'Effects' },
  { id: 'edges', label: 'Edges' }
];

const GROUP_BUILDERS: Record<Exclude<TabId, 'preview'>, (theme: ColorTheme) => DetailGroup[]> = {
  canvas: buildCanvasGroups,
  node: buildNodeGroups,
  effects: buildNodeEffectGroups,
  edges: buildEdgeGroups
};

// =============================================================================
// ROW RENDERING
// =============================================================================

function renderRow(detail: DetailRow): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'detail-row';

  const label = document.createElement('span');
  label.className = 'detail-label';
  label.textContent = detail.label;
  row.appendChild(label);

  const value = document.createElement('span');
  value.className = 'detail-value';

  if (detail.color) {
    const swatch = document.createElement('span');
    swatch.className = 'detail-swatch';
    swatch.style.background = detail.color;
    value.appendChild(swatch);
  }

  const text = document.createElement('span');
  text.className = 'detail-text';
  text.textContent = detail.value;
  value.appendChild(text);

  row.appendChild(value);
  return row;
}

function renderColumn(rows: DetailRow[]): HTMLDivElement {
  const column = document.createElement('div');
  column.className = 'detail-column';
  rows.forEach(row => column.appendChild(renderRow(row)));
  return column;
}

function splitEvenly(rows: DetailRow[]): [DetailRow[], DetailRow[]] {
  const half = Math.ceil(rows.length / 2);
  return [rows.slice(0, half), rows.slice(half)];
}

function renderGroup(group: DetailGroup): HTMLDivElement {
  const section = document.createElement('div');
  section.className = 'detail-group';

  const title = document.createElement('div');
  title.className = 'detail-group-title';
  title.textContent = group.title;
  section.appendChild(title);

  // Colours left, numbers right: the two read differently and pair up row for
  // row (border colour beside border width). A group with no colours splits its
  // rows evenly instead, so neither column is left empty.
  const colors = group.rows.filter(row => row.color !== undefined);
  const values = group.rows.filter(row => row.color === undefined);
  const [left, right] = colors.length > 0 ? [colors, values] : splitEvenly(values);

  const body = document.createElement('div');
  body.className = 'detail-group-body';
  body.appendChild(renderColumn(left));
  body.appendChild(renderColumn(right));
  section.appendChild(body);

  return section;
}

// =============================================================================
// THEME PICKER
// =============================================================================

export class ThemePicker {
  #overlay: HTMLDivElement | null = null;
  #modal: HTMLDivElement | null = null;
  #previewHost: HTMLDivElement | null = null;
  #pane: HTMLDivElement | null = null;
  #tabButtons = new Map<TabId, HTMLButtonElement>();
  #resolve: ((result: ThemePickerResult | null) => void) | null = null;
  #selectedThemeId: string = 'dark';
  #originalThemeId: string = 'dark';
  #activeTab: TabId = 'preview';
  /** Guards against a slow preview landing after a newer selection. */
  #previewToken = 0;
  #isDragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Show the theme picker
   * @param currentThemeId - The current theme ID for the scene
   * @param containerRect - Graph viewport bounds for centering
   * @returns The chosen theme and scope, or null if cancelled/unchanged
   */
  show(currentThemeId: string, containerRect: DOMRect): Promise<ThemePickerResult | null> {
    return new Promise((resolve) => {
      this.#resolve = resolve;

      this.#originalThemeId = currentThemeId;
      this.#selectedThemeId = currentThemeId;
      this.#activeTab = 'preview';

      this.#render(containerRect);
    });
  }

  // ===========================================================================
  // RENDERING
  // ===========================================================================

  #render(containerRect: DOMRect): void {
    // Create full-screen overlay with CSS centering
    this.#overlay = document.createElement('div');
    this.#overlay.className = 'theme-picker-overlay';

    this.#overlay.addEventListener('click', (e) => {
      if (e.target === this.#overlay) {
        this.#cancel();
      }
    });

    // Create modal
    this.#modal = document.createElement('div');
    this.#modal.className = 'theme-picker-modal';

    // Position modal at center of graph viewport
    const centerX = containerRect.left + containerRect.width / 2;
    const centerY = containerRect.top + containerRect.height / 2;
    this.#modal.style.position = 'fixed';
    this.#modal.style.left = `${centerX}px`;
    this.#modal.style.top = `${centerY}px`;
    this.#modal.style.transform = 'translate(-50%, -50%)';

    const header = this.#createHeader();
    this.#setupDrag(header);

    this.#modal.appendChild(header);
    this.#modal.appendChild(this.#createBody());
    this.#modal.appendChild(this.#createFooter());
    this.#overlay.appendChild(this.#modal);
    document.body.appendChild(this.#overlay);

    document.addEventListener('keydown', this.#handleKeydown);
  }

  #createHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'theme-picker-header';
    header.innerHTML = `
      <h2>Scene Theme</h2>
      <button class="theme-picker-close-btn" title="Close (Escape)">×</button>
    `;
    header.querySelector('.theme-picker-close-btn')?.addEventListener('click', () => this.#cancel());
    return header;
  }

  #createBody(): HTMLDivElement {
    const body = document.createElement('div');
    body.className = 'theme-picker-body';
    body.appendChild(this.#createThemeList());
    body.appendChild(this.#createDetails());
    return body;
  }

  /**
   * The list is a sized `<select>` — a list box rendered inside the modal —
   * rather than a popup one. A popup `<select>` is positioned by the browser so
   * the selected option overlays the control, which for a list this long puts
   * half the themes above the modal and off the top of the window; nothing in
   * CSS can move it, because the popup is drawn outside the page layout.
   * Rendering the list inline removes the problem rather than fighting it, and
   * it keeps the browser's arrow-key navigation and type-ahead for free.
   */
  #createThemeList(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'theme-picker-list';

    const label = document.createElement('label');
    label.textContent = 'Theme';
    label.htmlFor = 'theme-picker-select';
    container.appendChild(label);

    const select = document.createElement('select');
    select.id = 'theme-picker-select';

    const themes = getAvailableThemes();
    select.size = Math.min(themes.length, MAX_VISIBLE_THEME_ROWS);

    themes.forEach(theme => {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = theme.name;
      option.selected = theme.id === this.#selectedThemeId;
      select.appendChild(option);
    });

    select.addEventListener('change', () => {
      this.#selectedThemeId = select.value;
      this.#renderPane();
    });

    container.appendChild(select);
    return container;
  }

  #createDetails(): HTMLDivElement {
    const details = document.createElement('div');
    details.className = 'theme-picker-details';

    this.#previewHost = document.createElement('div');
    this.#previewHost.className = 'theme-picker-preview';

    const tabs = document.createElement('div');
    tabs.className = 'theme-picker-tabs';
    this.#tabButtons.clear();

    TAB_LABELS.forEach(({ id, label }) => {
      const button = document.createElement('button');
      button.className = 'theme-picker-tab';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.#activeTab = id;
        this.#renderPane();
      });
      this.#tabButtons.set(id, button);
      tabs.appendChild(button);
    });

    this.#pane = document.createElement('div');
    this.#pane.className = 'theme-picker-pane';

    details.appendChild(tabs);
    details.appendChild(this.#pane);

    this.#renderPane();
    return details;
  }

  #renderPane(): void {
    if (!this.#pane) return;

    this.#tabButtons.forEach((button, id) => {
      button.classList.toggle('active', id === this.#activeTab);
    });

    if (this.#activeTab === 'preview') {
      if (this.#previewHost) this.#pane.replaceChildren(this.#previewHost);
      void this.#renderPreview();
      return;
    }

    const theme = getTheme(this.#selectedThemeId);
    const groups = GROUP_BUILDERS[this.#activeTab](theme);
    this.#pane.replaceChildren(...groups.map(renderGroup));
    this.#pane.scrollTop = 0;
  }

  /**
   * The canvas colour and vignette are painted on the host rather than inside
   * the SVG: the sample keeps its natural size, and the surrounding area shows
   * the canvas the way a scene would.
   */
  async #renderPreview(): Promise<void> {
    const host = this.#previewHost;
    if (!host) return;

    const token = ++this.#previewToken;
    const theme = getTheme(this.#selectedThemeId);
    host.style.background = theme.canvas.background.color;

    const preview = await buildThemePreview(theme);
    if (token !== this.#previewToken || this.#previewHost !== host) return;

    host.style.boxShadow = canvasVignetteShadow(theme, host.clientWidth);
    host.replaceChildren(preview);
  }

  #createFooter(): HTMLDivElement {
    const footer = document.createElement('div');
    footer.className = 'theme-picker-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'theme-picker-btn theme-picker-btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.#cancel());

    const applyBtn = document.createElement('button');
    applyBtn.className = 'theme-picker-btn theme-picker-btn-secondary';
    applyBtn.textContent = 'Apply';
    applyBtn.dataset.tooltip = 'Applies to the current scene only';
    applyBtn.addEventListener('click', () => this.#apply());

    const applyAllBtn = document.createElement('button');
    applyAllBtn.className = 'theme-picker-btn theme-picker-btn-secondary';
    applyAllBtn.textContent = 'Apply to all';
    applyAllBtn.dataset.tooltip = 'Applies to all scenes in the graph';
    applyAllBtn.addEventListener('click', () => this.#applyAll());

    footer.appendChild(cancelBtn);
    footer.appendChild(applyAllBtn);
    footer.appendChild(applyBtn);
    return footer;
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  #apply(): void {
    // Only return a result if the theme changed for the current scene.
    const result: ThemePickerResult | null = this.#selectedThemeId !== this.#originalThemeId
      ? { themeId: this.#selectedThemeId, scope: 'current' }
      : null;

    this.#cleanup();
    this.#resolve?.(result);
    this.#resolve = null;
  }

  #applyAll(): void {
    // Always apply to all scenes, even if it matches the current scene's theme.
    const result: ThemePickerResult = { themeId: this.#selectedThemeId, scope: 'all' };

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
    this.#previewHost = null;
    this.#pane = null;
    this.#tabButtons.clear();
  }
}
