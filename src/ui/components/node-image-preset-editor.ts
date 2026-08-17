/**
 * Node Image Preset Editor
 * Modal for authoring the presets that constrain image generation.
 *
 * Follows the theme picker's shape — draggable modal, record list on the left,
 * tabbed detail pane on the right — but this one edits rather than inspects.
 * Content and Rendering mirror the two halves of the record and the two blocks
 * of the composed prompt; Direction holds the one free-prose field, which
 * belongs to neither half.
 *
 * Content and Rendering each end in a preview of the exact lines their controls
 * send to the model, rendered from the composer rather than restated here — a
 * descriptor's value is one word, and the specification it expands to is the
 * only reason predefining it is worth anything.
 *
 * Every control is built from the option lists in
 * `config/node-image-preset-definitions.ts`, so adding a vocabulary value needs
 * no change here.
 *
 * Save semantics follow `edge-type-manager.ts`: field edits are held as drafts
 * and committed on Save, while structural actions — add, duplicate, delete,
 * restore starters, make default — take effect immediately, because a
 * half-committed collection is worse than an immediate one.
 *
 * See docs/node-image-presets.md §5.
 */

import type { ThemeId } from '../../core/main-types';
import type {
  NodeImagePreset,
  NodeImagePresetColour,
  NodeImagePresetContent,
  NodeImagePresetId,
  NodeImagePresetTechnical
} from '../../core/node-image-types';
import {
  NODE_IMAGE_ASPECTS,
  NODE_IMAGE_BACKDROPS,
  NODE_IMAGE_COLOUR_MODES,
  NODE_IMAGE_DEPTHS,
  NODE_IMAGE_FORMS,
  NODE_IMAGE_GRADIENT_USES,
  NODE_IMAGE_TRANSPARENCY_USES,
  NODE_IMAGE_PERMISSIONS,
  NODE_IMAGE_DETAIL_LEVELS,
  NODE_IMAGE_ENCLOSURES,
  NODE_IMAGE_PALETTE_SIZES,
  NODE_IMAGE_PRESET_DEFAULTS,
  NODE_IMAGE_RENDER_MODES,
  NODE_IMAGE_STROKE_WEIGHTS,
  NODE_IMAGE_TYPES,
  type NodeImageOption
} from '../../config/node-image-preset-definitions';
import {
  createNodeImagePreset,
  deleteNodeImagePreset,
  getDefaultNodeImagePreset,
  listNodeImagePresets,
  restoreStarterNodeImagePresets,
  setDefaultNodeImagePreset,
  updateNodeImagePreset
} from '../../storage/node-image-presets';
import { composeColourRules } from '../../ai/node-image/prompt/colour-rules';
import { composeDrawingRules } from '../../ai/node-image/prompt/drawing-rules';
import { composeAspectRule, composeTechniqueRules } from '../../ai/node-image/prompt/technique-rules';
import { resolveNodeImagePalette } from '../../styles/node-image-palette';
import '../../styles/node-image-preset-editor.css';

type TabId = 'drawing' | 'technique' | 'colour' | 'instructions';

const TAB_LABELS: { id: TabId; label: string }[] = [
  { id: 'drawing', label: 'Drawing' },
  { id: 'technique', label: 'Technique' },
  { id: 'colour', label: 'Colour' },
  { id: 'instructions', label: 'Extra instructions' }
];

const MAX_VISIBLE_PRESET_ROWS = 12;

export class NodeImagePresetEditor {
  #overlay: HTMLDivElement | null = null;
  #modal: HTMLDivElement | null = null;
  #listSelect: HTMLSelectElement | null = null;
  #pane: HTMLDivElement | null = null;
  #preview: HTMLDivElement | null = null;
  #tabButtons = new Map<TabId, HTMLButtonElement>();
  #resolve: (() => void) | null = null;

  /** Working copies. The registry is not written until Save. */
  #drafts = new Map<NodeImagePresetId, NodeImagePreset>();
  #dirty = new Set<NodeImagePresetId>();
  #selectedId: NodeImagePresetId | null = null;
  #activeTab: TabId = 'drawing';
  /** The scene's theme, so the Colour tab previews the colours actually sent. */
  #themeId: ThemeId = 'default';

  #isDragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Resolves when the modal closes, so the caller can refresh its own preset list.
   *
   * `themeId` is required because the Colour tab's preview shows real hexes: a
   * placeholder palette would be a second set of sentences written for display,
   * which is the one thing the preview must never be.
   *
   * `containerRect` centres the modal on the graph viewport, as the theme
   * picker does. It is optional because the node editor's tabs do not carry
   * one; without it the modal centres on the window, which is where a modal
   * opened from inside another modal belongs anyway.
   */
  show(themeId: ThemeId, containerRect?: DOMRect): Promise<void> {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.#themeId = themeId;
      this.#activeTab = 'drawing';
      this.#dirty.clear();
      this.#reload();
      this.#render(containerRect);
    });
  }

  // ===========================================================================
  // RENDERING
  // ===========================================================================

  #render(containerRect?: DOMRect): void {
    this.#overlay = document.createElement('div');
    this.#overlay.className = 'preset-editor-overlay';
    this.#overlay.addEventListener('click', (event) => {
      if (event.target === this.#overlay) this.#close();
    });

    this.#modal = document.createElement('div');
    this.#modal.className = 'preset-editor-modal';
    const centerX = containerRect ? containerRect.left + containerRect.width / 2 : window.innerWidth / 2;
    const centerY = containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2;
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

    document.addEventListener('keydown', this.#handleKeydown, true);
  }

  #createHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'preset-editor-header';
    header.innerHTML = `
      <h2>Image Presets</h2>
      <button class="preset-editor-close-btn" title="Close (Escape)">×</button>
    `;
    header.querySelector('.preset-editor-close-btn')?.addEventListener('click', () => this.#close());
    return header;
  }

  #createBody(): HTMLDivElement {
    const body = document.createElement('div');
    body.className = 'preset-editor-body';
    body.appendChild(this.#createList());
    body.appendChild(this.#createDetails());
    return body;
  }

  /** A sized `<select>` — an inline list box — for the same reason the theme picker uses one. */
  #createList(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'preset-editor-list';

    this.#listSelect = document.createElement('select');
    this.#listSelect.size = MAX_VISIBLE_PRESET_ROWS;
    this.#listSelect.addEventListener('change', () => {
      this.#selectedId = this.#listSelect?.value ?? null;
      this.#renderPane();
    });
    container.appendChild(this.#listSelect);

    this.#refreshList();
    return container;
  }

  #createDetails(): HTMLDivElement {
    const details = document.createElement('div');
    details.className = 'preset-editor-details';

    const tabs = document.createElement('div');
    tabs.className = 'preset-editor-tabs';
    this.#tabButtons.clear();
    TAB_LABELS.forEach(({ id, label }) => {
      const button = document.createElement('button');
      button.className = 'preset-editor-tab';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.#activeTab = id;
        this.#renderPane();
      });
      this.#tabButtons.set(id, button);
      tabs.appendChild(button);
    });

    this.#pane = document.createElement('div');
    this.#pane.className = 'preset-editor-pane';

    details.append(tabs, this.#pane);
    this.#renderPane();
    return details;
  }

  #renderPane(): void {
    if (!this.#pane) return;

    this.#tabButtons.forEach((button, id) => {
      button.classList.toggle('active', id === this.#activeTab);
    });

    // Rebuilt per tab, and absent on Direction, so the stale node is dropped first.
    this.#preview = null;

    const preset = this.#selected();
    if (!preset) {
      const empty = document.createElement('p');
      empty.className = 'preset-editor-empty';
      empty.textContent = 'No presets. Create one, or restore the starters.';
      this.#pane.replaceChildren(empty);
      return;
    }

    this.#pane.replaceChildren(...this.#sections(preset));
    this.#pane.scrollTop = 0;
  }

  // ===========================================================================
  // FIELD ROWS
  // ===========================================================================

  #sections(preset: NodeImagePreset): HTMLElement[] {
    if (this.#activeTab === 'drawing') return this.#drawingSections(preset);
    if (this.#activeTab === 'technique') return this.#techniqueSections(preset);
    if (this.#activeTab === 'colour') return this.#colourSections(preset);
    return this.#instructionsSections(preset);
  }

  /** What the picture is: the kind of image, what it is built from, and how much of it. */
  #drawingSections(preset: NodeImagePreset): HTMLElement[] {
    const patchContent = (changes: Partial<NodeImagePresetContent>): void => {
      Object.assign(preset.content, changes);
      this.#markDirty(preset.id);
      this.#refreshPreview();
    };
    const patchTechnical = (changes: Partial<NodeImagePresetTechnical>): void => {
      Object.assign(preset.technical, changes);
      this.#markDirty(preset.id);
      this.#refreshPreview();
    };

    return [
      this.#grid([
        this.#nameRow(preset),
        this.#selectRow('Image type', NODE_IMAGE_TYPES, preset.content.imageType, v => patchContent({ imageType: v })),
        this.#selectRow('Form', NODE_IMAGE_FORMS, preset.content.form, v => patchContent({ form: v })),
        this.#selectRow('Detail', NODE_IMAGE_DETAIL_LEVELS, preset.technical.detailLevel, v => patchTechnical({ detailLevel: v }))
      ]),
      this.#previewBlock()
    ];
  }

  /** The mechanics: canvas, mark width, volume, words, outline versus fill, and what encloses it. */
  #techniqueSections(preset: NodeImagePreset): HTMLElement[] {
    const patchContent = (changes: Partial<NodeImagePresetContent>): void => {
      Object.assign(preset.content, changes);
      this.#markDirty(preset.id);
      this.#refreshPreview();
    };
    const patchTechnical = (changes: Partial<NodeImagePresetTechnical>): void => {
      Object.assign(preset.technical, changes);
      this.#markDirty(preset.id);
      this.#refreshPreview();
    };

    return [
      this.#grid([
        this.#selectRow('Aspect', NODE_IMAGE_ASPECTS, preset.technical.aspect, v => patchTechnical({ aspect: v })),
        this.#selectRow('Line weight', NODE_IMAGE_STROKE_WEIGHTS, preset.technical.strokeWeight, v => patchTechnical({ strokeWeight: v })),
        this.#selectRow('Depth', NODE_IMAGE_DEPTHS, preset.content.depth, v => patchContent({ depth: v })),
        this.#selectRow('Text', NODE_IMAGE_PERMISSIONS, preset.content.textAllowed, v => patchContent({ textAllowed: v })),
        this.#selectRow('Line and fill', NODE_IMAGE_RENDER_MODES, preset.technical.renderMode, v => patchTechnical({ renderMode: v })),
        this.#selectRow('Enclosure', NODE_IMAGE_ENCLOSURES, preset.content.enclosure, v => patchContent({ enclosure: v }))
      ]),
      this.#previewBlock()
    ];
  }

  /**
   * Everything deciding how colour is applied.
   *
   * Colours and palette size compose into one line rather than a line each: in
   * thematic mode the size shortens the colour list, in fixed mode it becomes a
   * bare count and no colours are named at all.
   */
  #colourSections(preset: NodeImagePreset): HTMLElement[] {
    const patchColour = (changes: Partial<NodeImagePresetColour>): void => {
      Object.assign(preset.colour, changes);
      this.#markDirty(preset.id);
      this.#refreshPreview();
    };
    const patchTechnical = (changes: Partial<NodeImagePresetTechnical>): void => {
      Object.assign(preset.technical, changes);
      this.#markDirty(preset.id);
      this.#refreshPreview();
    };

    return [
      this.#grid([
        this.#selectRow('Colours', NODE_IMAGE_COLOUR_MODES, preset.colour.colourMode, v => patchColour({ colourMode: v })),
        this.#selectRow('Palette size', NODE_IMAGE_PALETTE_SIZES, preset.colour.paletteSize, v => patchColour({ paletteSize: v })),
        this.#selectRow('Backdrop', NODE_IMAGE_BACKDROPS, preset.technical.backdrop, v => patchTechnical({ backdrop: v })),
        this.#selectRow('Gradients', NODE_IMAGE_GRADIENT_USES, preset.technical.gradientsAllowed, v => patchTechnical({ gradientsAllowed: v })),
        this.#selectRow('Transparency', NODE_IMAGE_TRANSPARENCY_USES, preset.technical.transparencyAllowed, v => patchTechnical({ transparencyAllowed: v }))
      ]),
      this.#previewBlock()
    ];
  }

  /**
   * No preview: the field is appended to the prompt unchanged, so a preview
   * would only echo what was just typed.
   */
  #instructionsSections(preset: NodeImagePreset): HTMLElement[] {
    const note = document.createElement('p');
    note.className = 'preset-editor-note';
    note.textContent = 'Free prose, appended to the prompt verbatim after the rendering rules. Use it for anything the controls cannot express.';

    const textarea = document.createElement('textarea');
    textarea.className = 'preset-editor-direction';
    textarea.value = preset.extraInstructions;
    textarea.placeholder = 'e.g. hand-drawn feel, or: always include a scale bar';
    textarea.addEventListener('input', () => {
      preset.extraInstructions = textarea.value;
      this.#markDirty(preset.id);
    });

    return [note, textarea];
  }

  /** Two columns: the controls are far narrower than the pane, and the slack buys the preview. */
  #grid(rows: HTMLElement[]): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'preset-editor-grid';
    grid.append(...rows);
    return grid;
  }

  // ===========================================================================
  // PROMPT PREVIEW
  // ===========================================================================

  #previewBlock(): HTMLElement {
    const block = document.createElement('div');
    block.className = 'preset-editor-preview';

    const caption = document.createElement('div');
    caption.className = 'preset-editor-preview-caption';
    caption.textContent = 'Sent to the model:';

    this.#preview = document.createElement('div');
    this.#preview.className = 'preset-editor-preview-body';

    block.append(caption, this.#preview);
    this.#refreshPreview();
    return block;
  }

  /**
   * Refreshed in place rather than by re-rendering the pane, which would
   * rebuild every control and take focus off the one just changed.
   */
  #refreshPreview(): void {
    const preset = this.#selected();
    if (!this.#preview || !preset) return;

    const rules = this.#previewRules(preset);

    this.#preview.replaceChildren(
      rules.length ? this.#previewLines(rules) : this.#previewEmptyState()
    );
  }

  /** Each tab maps onto exactly one group of knob lines, so nothing reaches across. */
  #previewRules(preset: NodeImagePreset): string[] {
    if (this.#activeTab === 'drawing') return composeDrawingRules(preset);
    if (this.#activeTab === 'technique') {
      return [...composeTechniqueRules(preset), composeAspectRule(preset.technical.aspect)];
    }
    return composeColourRules(resolveNodeImagePalette(this.#themeId, preset.colour.paletteSize), preset);
  }

  #previewLines(rules: string[]): DocumentFragment {
    const fragment = document.createDocumentFragment();
    fragment.append(...rules.map(rule => this.#previewLine(rule)));
    return fragment;
  }

  /**
   * An unspecified descriptor sends nothing, so a preset with none set produces
   * an empty pane — correct behaviour that reads as a broken one. The line says
   * which of the two it is, and is styled apart from the rules so it is never
   * mistaken for prompt text.
   */
  #previewEmptyState(): HTMLElement {
    const line = document.createElement('p');
    line.className = 'preset-editor-preview-empty';
    line.textContent = 'Nothing — every control on this tab is unspecified, so the model decides.';
    return line;
  }

  /** One sentence per line, verbatim: these are the prompt's words, not a description of them. */
  #previewLine(rule: string): HTMLElement {
    const line = document.createElement('p');
    line.textContent = rule;
    return line;
  }

  /**
   * The preset's own name, taking the first cell of the Content grid so both
   * tabs are the same shape: three rows of paired controls, then two checkboxes.
   */
  #nameRow(preset: NodeImagePreset): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = preset.name;
    input.addEventListener('input', () => {
      preset.name = input.value;
      this.#markDirty(preset.id);
      this.#refreshList();
    });
    return this.#row('Name', input);
  }

  /**
   * Options carry their own values, which may be numbers as well as strings, so
   * the selected option is matched by index rather than by `select.value`.
   */
  #selectRow<T>(
    label: string,
    options: NodeImageOption<T>[],
    value: T,
    onChange: (value: T) => void
  ): HTMLElement {
    const select = document.createElement('select');
    options.forEach((option, index) => {
      const element = document.createElement('option');
      element.value = String(index);
      element.textContent = option.label;
      element.selected = option.value === value;
      select.appendChild(element);
    });
    select.addEventListener('change', () => {
      const option = options[Number(select.value)];
      if (option) onChange(option.value);
    });
    return this.#row(label, select);
  }

  #row(label: string, control: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'preset-editor-row';

    const caption = document.createElement('label');
    caption.textContent = label;

    row.append(caption, control);
    return row;
  }

  #actionButton(label: string, onClick: () => void, title?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'preset-editor-btn';
    button.textContent = label;
    if (title) button.title = title;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Every action sits in one row, in one style — Save is not highlighted, as in
   * the other modals. Structural actions hold the left edge; Cancel and Save
   * hold the right, which is the only cue that the two groups differ: the left
   * group writes to the registry immediately, the right pair discards or
   * commits the pending field edits.
   */
  #createFooter(): HTMLDivElement {
    const footer = document.createElement('div');
    footer.className = 'preset-editor-footer';

    const status = document.createElement('span');
    status.className = 'preset-editor-status';

    footer.append(
      this.#actionButton('New preset', () => this.#addPreset()),
      this.#actionButton('Duplicate', () => this.#duplicatePreset()),
      this.#actionButton('Delete', () => this.#deleteSelected()),
      this.#actionButton('Set default', () => this.#makeDefault()),
      this.#actionButton('Restore', () => this.#restoreStarters(), 'Add fresh copies of the starter presets'),
      status,
      this.#actionButton('Cancel', () => this.#close()),
      this.#actionButton('Save', () => this.#save())
    );
    return footer;
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  #addPreset(): void {
    const created = createNodeImagePreset({
      name: 'New preset',
      content: { ...NODE_IMAGE_PRESET_DEFAULTS.content },
      technical: { ...NODE_IMAGE_PRESET_DEFAULTS.technical },
      colour: { ...NODE_IMAGE_PRESET_DEFAULTS.colour },
      extraInstructions: ''
    });
    this.#reload();
    this.#selectedId = created.id;
    this.#refreshList();
    this.#renderPane();
  }

  /** Duplicates what is on screen, including uncommitted edits. */
  #duplicatePreset(): void {
    const preset = this.#selected();
    if (!preset) return;

    const created = createNodeImagePreset({
      name: `${preset.name} copy`,
      content: { ...preset.content },
      technical: { ...preset.technical },
      colour: { ...preset.colour },
      extraInstructions: preset.extraInstructions
    });
    this.#reload();
    this.#selectedId = created.id;
    this.#refreshList();
    this.#renderPane();
  }

  #deleteSelected(): void {
    if (!this.#selectedId) return;

    const outcome = deleteNodeImagePreset(this.#selectedId);
    if (outcome === 'refused-last') {
      this.#setStatus('The last preset cannot be deleted.');
      return;
    }

    this.#dirty.delete(this.#selectedId);
    this.#selectedId = null;
    this.#reload();
    this.#refreshList();
    this.#renderPane();
  }

  #makeDefault(): void {
    if (!this.#selectedId) return;
    setDefaultNodeImagePreset(this.#selectedId);
    this.#refreshList();
  }

  #restoreStarters(): void {
    restoreStarterNodeImagePresets();
    this.#reload();
    this.#refreshList();
    this.#renderPane();
  }

  #save(): void {
    this.#dirty.forEach((id) => {
      const draft = this.#drafts.get(id);
      if (!draft) return;
      updateNodeImagePreset(id, {
        name: draft.name.trim() || 'Untitled',
        content: draft.content,
        technical: draft.technical,
        colour: draft.colour,
        extraInstructions: draft.extraInstructions
      });
    });
    this.#dirty.clear();
    this.#close();
  }

  #close(): void {
    this.#cleanup();
    this.#resolve?.();
    this.#resolve = null;
  }

  // ===========================================================================
  // STATE
  // ===========================================================================

  /**
   * Pulls the registry into drafts, keeping any uncommitted edits.
   *
   * Structural actions write to the registry immediately, so this runs while
   * field edits may be pending — discarding them here would lose work the user
   * can still see on screen.
   */
  #reload(): void {
    const stored = listNodeImagePresets();
    const next = new Map<NodeImagePresetId, NodeImagePreset>();

    stored.forEach((preset) => {
      const draft = this.#drafts.get(preset.id);
      next.set(preset.id, this.#dirty.has(preset.id) && draft ? draft : clone(preset));
    });

    this.#drafts = next;
    if (!this.#selectedId || !this.#drafts.has(this.#selectedId)) {
      this.#selectedId = stored[0]?.id ?? null;
    }
  }

  #refreshList(): void {
    if (!this.#listSelect) return;

    const defaultId = getDefaultNodeImagePreset()?.id;
    this.#listSelect.replaceChildren(
      ...[...this.#drafts.values()].map((preset) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.id === defaultId ? `${preset.name} (default)` : preset.name;
        option.selected = preset.id === this.#selectedId;
        return option;
      })
    );

    this.#setStatus(this.#dirty.size ? 'Unsaved changes' : '');
  }

  #selected(): NodeImagePreset | null {
    return this.#selectedId ? this.#drafts.get(this.#selectedId) ?? null : null;
  }

  #markDirty(id: NodeImagePresetId): void {
    this.#dirty.add(id);
    this.#setStatus('Unsaved changes');
  }

  /** The footer is crowded, so the status shares its width and truncates. */
  #setStatus(message: string): void {
    const status = this.#modal?.querySelector<HTMLElement>('.preset-editor-status');
    if (!status) return;
    status.textContent = message;
    status.title = message;
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  /**
   * Registered in the capture phase and stopped here, so Escape closes this
   * modal only.
   *
   * The node editor — the one surface that opens this — has its own
   * document-level Escape handler, registered earlier. Bubble-phase listeners
   * on the same node fire in registration order, so without capture the editor
   * would close underneath us.
   */
  #handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    this.#close();
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
    document.removeEventListener('keydown', this.#handleKeydown, true);
    document.removeEventListener('mousemove', this.#handleMouseMove);
    document.removeEventListener('mouseup', this.#handleMouseUp);

    this.#overlay?.remove();
    this.#overlay = null;
    this.#modal = null;
    this.#listSelect = null;
    this.#pane = null;
    this.#tabButtons.clear();
  }
}

function clone(preset: NodeImagePreset): NodeImagePreset {
  return {
    ...preset,
    content: { ...preset.content },
    technical: { ...preset.technical }
  };
}
