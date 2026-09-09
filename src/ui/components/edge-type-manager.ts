/**
 * Edge Type Manager
 * Workspace-level editor for the edge type registry.
 *
 * Shaped after the node image preset editor: a draggable modal with the type
 * list on the left and a tabbed detail pane on the right. Meaning holds what a
 * type is — name, description, directional labels; Style holds how it draws.
 * The earlier single table had a column per style knob and no room for a
 * sentence, and a description is a sentence.
 *
 * No prompt preview, unlike the preset editor. There the user authors the
 * prompt directly; here a type's meaning is one ingredient of a prompt composed
 * from many sources, and how it is packed is not the user's concern.
 *
 * Save semantics: field edits are held as drafts and committed on Save; Add
 * Type writes to the store immediately, because a half-committed collection is
 * worse than an immediate one. Deletion is not implemented
 * (docs/edge-types-architecture.md §3).
 *
 * See docs/edge-types-architecture.md §10.2.
 */

import type { EdgeStyleSlotId, EdgeType, EdgeTypeId } from '../../core/main-types';
import { getDefaultEdgeStyleSlotId, getEdgeStyleSlotIds } from '../../config/edge-type-settings';
import { graphStore } from '../../storage/graph-store';
import { edgeStyleToCytoscape, resolveEdgeStyleSlot } from '../../styles/edge-visual-resolver';
import { getTheme } from '../../styles/themes';
import '../../styles/edge-type-manager.css';

interface EdgeTypeManagerOptions {
  onEdgeTypesChanged: () => void;
  /**
   * The current scene's theme. Edge types are workspace-level and themes are
   * per scene, so the manager cannot know this itself; it needs it to seed an
   * override from the thematic slot as it is actually drawn right now.
   */
  resolveThemeId: () => string;
}

type TabId = 'meaning' | 'style';

const TAB_LABELS: { id: TabId; label: string }[] = [
  { id: 'meaning', label: 'Meaning' },
  { id: 'style', label: 'Style' }
];

const MAX_VISIBLE_TYPE_ROWS = 12;

const ARROW_SHAPES = ['triangle', 'diamond', 'circle', 'tee', 'none'];
const CURVE_STYLES = ['bezier', 'straight', 'unbundled-bezier', 'segments', 'round-segments', 'taxi', 'round-taxi', 'haystack'];

/**
 * Read fallbacks for a stored override that lacks a key. The manager always
 * writes every key, so these only matter for a record written by something else.
 */
const OVERRIDE_DEFAULTS = {
  'line-color': '#808080',
  'line-opacity': 1,
  'width': 2,
  'target-arrow-shape': 'triangle',
  'arrow-scale': 1,
  'curve-style': 'bezier'
} as const;

export class EdgeTypeManager {
  #onEdgeTypesChanged: () => void;
  #resolveThemeId: () => string;

  #overlay: HTMLDivElement | null = null;
  #modal: HTMLDivElement | null = null;
  #listSelect: HTMLSelectElement | null = null;
  #pane: HTMLDivElement | null = null;
  #tabButtons = new Map<TabId, HTMLButtonElement>();

  /** Working copies. The store is not written until Save. */
  #drafts = new Map<EdgeTypeId, EdgeType>();
  #dirty = new Set<EdgeTypeId>();
  #selectedId: EdgeTypeId | null = null;
  #activeTab: TabId = 'meaning';

  #isDragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;

  constructor(options: EdgeTypeManagerOptions) {
    this.#onEdgeTypesChanged = options.onEdgeTypesChanged;
    this.#resolveThemeId = options.resolveThemeId;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  show(): void {
    this.#activeTab = 'meaning';
    this.#dirty.clear();
    this.#drafts.clear();
    this.#selectedId = null;
    this.#reload();
    this.#render();
  }

  // ===========================================================================
  // RENDERING
  // ===========================================================================

  #render(): void {
    this.#overlay = document.createElement('div');
    this.#overlay.className = 'etm-overlay';
    this.#overlay.addEventListener('click', (event) => {
      if (event.target === this.#overlay) this.#close();
    });

    this.#modal = document.createElement('div');
    this.#modal.className = 'etm-modal';
    this.#positionModal();

    const header = this.#createHeader();
    this.#setupDrag(header);

    this.#modal.appendChild(header);
    this.#modal.appendChild(this.#createBody());
    this.#modal.appendChild(this.#createFooter());
    this.#overlay.appendChild(this.#modal);
    document.body.appendChild(this.#overlay);

    document.addEventListener('keydown', this.#handleKeydown, true);
  }

  /** Centred on the graph area, not the window: the chat panel takes the right edge. */
  #positionModal(): void {
    if (!this.#modal) return;
    const chatWidth = document.getElementById('chat')?.offsetWidth ?? 350;
    const centerX = (window.innerWidth - chatWidth) / 2;
    const centerY = window.innerHeight / 2;
    this.#modal.style.position = 'fixed';
    this.#modal.style.left = `${centerX}px`;
    this.#modal.style.top = `${centerY}px`;
    this.#modal.style.transform = 'translate(-50%, -50%)';
  }

  #createHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'etm-header';
    header.innerHTML = `
      <h2>Edge Types</h2>
      <button class="etm-close-btn" title="Close (Escape)">×</button>
    `;
    header.querySelector('.etm-close-btn')?.addEventListener('click', () => this.#close());
    return header;
  }

  #createBody(): HTMLDivElement {
    const body = document.createElement('div');
    body.className = 'etm-body';
    body.appendChild(this.#createList());
    body.appendChild(this.#createDetails());
    return body;
  }

  /** A sized `<select>` — an inline list box — as in the preset editor and theme picker. */
  #createList(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'etm-list';

    this.#listSelect = document.createElement('select');
    this.#listSelect.size = MAX_VISIBLE_TYPE_ROWS;
    this.#listSelect.addEventListener('change', () => {
      this.#selectedId = (this.#listSelect?.value as EdgeTypeId | undefined) ?? null;
      this.#renderPane();
    });
    container.appendChild(this.#listSelect);

    this.#refreshList();
    return container;
  }

  #createDetails(): HTMLDivElement {
    const details = document.createElement('div');
    details.className = 'etm-details';

    const tabs = document.createElement('div');
    tabs.className = 'etm-tabs';
    this.#tabButtons.clear();
    TAB_LABELS.forEach(({ id, label }) => {
      const button = document.createElement('button');
      button.className = 'etm-tab';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.#activeTab = id;
        this.#renderPane();
      });
      this.#tabButtons.set(id, button);
      tabs.appendChild(button);
    });

    this.#pane = document.createElement('div');
    this.#pane.className = 'etm-pane';

    details.append(tabs, this.#pane);
    this.#renderPane();
    return details;
  }

  #renderPane(): void {
    if (!this.#pane) return;

    this.#tabButtons.forEach((button, id) => {
      button.classList.toggle('active', id === this.#activeTab);
    });

    const edgeType = this.#selected();
    if (!edgeType) {
      const empty = document.createElement('p');
      empty.className = 'etm-empty';
      empty.textContent = 'No edge types. Add one.';
      this.#pane.replaceChildren(empty);
      return;
    }

    const rows = this.#activeTab === 'meaning'
      ? this.#meaningRows(edgeType)
      : this.#styleRows(edgeType);
    this.#pane.replaceChildren(...rows);
    this.#pane.scrollTop = 0;
  }

  // ===========================================================================
  // MEANING TAB
  // ===========================================================================

  /**
   * What the type is. The description and labels are what the assistant will
   * read once edge types reach the prompt, so the placeholders show the shape
   * that reads well as a sentence: "A is part of B", "B has part A".
   */
  #meaningRows(edgeType: EdgeType): HTMLElement[] {
    const name = this.#textInput(edgeType.name, 'e.g. Part of', (value) => {
      edgeType.name = value;
      this.#markDirty(edgeType.id);
      this.#refreshList();
    });

    const description = document.createElement('textarea');
    description.className = 'etm-description';
    description.rows = 5;
    description.value = edgeType.description ?? '';
    description.placeholder = 'What this relationship means, e.g. Whole/part or entity/attribute relationship.';
    description.addEventListener('input', () => {
      edgeType.description = description.value;
      this.#markDirty(edgeType.id);
    });

    const forwardLabel = this.#textInput(edgeType.forwardLabel ?? '', 'e.g. is part of', (value) => {
      edgeType.forwardLabel = value;
      this.#markDirty(edgeType.id);
    });

    const inverseLabel = this.#textInput(edgeType.inverseLabel ?? '', 'e.g. has part', (value) => {
      edgeType.inverseLabel = value;
      this.#markDirty(edgeType.id);
    });

    return [
      this.#row('Name', name),
      this.#row('Description', description, 'etm-row--top'),
      this.#row('Forward label', forwardLabel),
      this.#row('Inverse label', inverseLabel),
      this.#note('Forward reads from the edge’s source to its target: "Source is part of Target". Inverse reads the other way: "Target has part Source".')
    ];
  }

  // ===========================================================================
  // STYLE TAB
  // ===========================================================================

  /** How the type draws: the thematic slot, and an optional manual override of it. */
  #styleRows(edgeType: EdgeType): HTMLElement[] {
    const slot = document.createElement('select');
    getEdgeStyleSlotIds().forEach((slotId) => {
      const option = document.createElement('option');
      option.value = slotId;
      option.textContent = this.#formatSlotLabel(slotId);
      option.selected = slotId === edgeType.thematicStyleSlotId;
      slot.appendChild(option);
    });
    slot.addEventListener('change', () => {
      edgeType.thematicStyleSlotId = slot.value as EdgeStyleSlotId;
      this.#markDirty(edgeType.id);
    });

    const override = document.createElement('input');
    override.type = 'checkbox';
    override.checked = edgeType.styleOverride !== undefined;
    override.addEventListener('change', () => {
      edgeType.styleOverride = override.checked ? this.#overrideFromSlot(edgeType) : undefined;
      this.#markDirty(edgeType.id);
      this.#renderPane();
    });

    const rows = [
      this.#row('Thematic style', slot, 'etm-row--narrow'),
      this.#row('Override', override)
    ];

    const styles = edgeType.styleOverride;
    if (!styles) return rows;

    const patch = (changes: Record<string, unknown>): void => {
      Object.assign(styles, changes);
      this.#markDirty(edgeType.id);
    };

    const color = document.createElement('input');
    color.type = 'color';
    color.value = this.#styleString(styles, 'line-color', OVERRIDE_DEFAULTS['line-color']);
    // One colour drives line and arrow, as the table did: a separately coloured
    // arrowhead is not a distinction the type style offers.
    color.addEventListener('input', () => patch({ 'line-color': color.value, 'target-arrow-color': color.value }));

    rows.push(
      this.#row('Color', color),
      this.#row('Opacity', this.#numberInput(this.#styleNumber(styles, 'line-opacity', OVERRIDE_DEFAULTS['line-opacity']), 0, 1, 0.05, v => patch({ 'line-opacity': v })), 'etm-row--narrow'),
      this.#row('Width', this.#numberInput(this.#styleNumber(styles, 'width', OVERRIDE_DEFAULTS.width), 0.5, 10, 0.5, v => patch({ 'width': v })), 'etm-row--narrow'),
      this.#row('Arrow', this.#optionSelect(ARROW_SHAPES, this.#styleString(styles, 'target-arrow-shape', OVERRIDE_DEFAULTS['target-arrow-shape']), v => patch({ 'target-arrow-shape': v })), 'etm-row--narrow'),
      this.#row('Arrow size', this.#numberInput(this.#styleNumber(styles, 'arrow-scale', OVERRIDE_DEFAULTS['arrow-scale']), 0.5, 3, 0.1, v => patch({ 'arrow-scale': v })), 'etm-row--narrow'),
      this.#row('Curve', this.#optionSelect(CURVE_STYLES, this.#styleString(styles, 'curve-style', OVERRIDE_DEFAULTS['curve-style']), v => patch({ 'curve-style': v })), 'etm-row--narrow')
    );

    return rows;
  }

  /**
   * A full override seeded from the type's thematic slot as the current scene's
   * theme draws it, so editing starts from what is on the canvas and untouched
   * knobs keep their thematic values. Resolved through the same function the
   * stylesheet uses, so the seed cannot drift from the rendering.
   *
   * The override is all-or-nothing, so every key is written; the cost is that
   * the untouched values are now pinned to this theme's slot rather than
   * following a later theme change. A sparse, per-knob override would fix
   * that and is a different design.
   */
  #overrideFromSlot(edgeType: EdgeType): Record<string, unknown> {
    const theme = getTheme(this.#resolveThemeId());
    const slot = edgeStyleToCytoscape(resolveEdgeStyleSlot(theme, edgeType.thematicStyleSlotId));
    return {
      'line-color': slot['line-color'],
      'target-arrow-color': slot['target-arrow-color'],
      'line-opacity': slot['line-opacity'],
      'width': slot['width'],
      'target-arrow-shape': slot['target-arrow-shape'],
      'arrow-scale': slot['arrow-scale'],
      'curve-style': slot['curve-style']
    };
  }

  // ===========================================================================
  // CONTROLS
  // ===========================================================================

  #textInput(value: string, placeholder: string, onInput: (value: string) => void): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  #numberInput(value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('change', () => {
      const next = Number(input.value);
      if (Number.isFinite(next)) onChange(next);
    });
    return input;
  }

  #optionSelect(options: string[], value: string, onChange: (value: string) => void): HTMLSelectElement {
    const select = document.createElement('select');
    options.forEach((option) => {
      const element = document.createElement('option');
      element.value = option;
      element.textContent = this.#formatOptionLabel(option);
      element.selected = option === value;
      select.appendChild(element);
    });
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  #row(label: string, control: HTMLElement, modifier?: string): HTMLElement {
    const row = document.createElement('div');
    row.className = modifier ? `etm-row ${modifier}` : 'etm-row';

    const caption = document.createElement('label');
    caption.textContent = label;

    row.append(caption, control);
    return row;
  }

  #note(text: string): HTMLElement {
    const note = document.createElement('p');
    note.className = 'etm-note';
    note.textContent = text;
    return note;
  }

  #actionButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'etm-btn';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * One action row, one button style. Add Type holds the left edge and writes
   * to the store immediately; Cancel and Save hold the right and discard or
   * commit the pending field edits.
   */
  #createFooter(): HTMLDivElement {
    const footer = document.createElement('div');
    footer.className = 'etm-footer';

    const status = document.createElement('span');
    status.className = 'etm-status';

    footer.append(
      this.#actionButton('Add type', () => void this.#addEdgeType()),
      status,
      this.#actionButton('Cancel', () => this.#close()),
      this.#actionButton('Save', () => void this.#save())
    );
    return footer;
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  async #addEdgeType(): Promise<void> {
    const now = new Date();
    const edgeType: EdgeType = {
      id: this.#createUniqueEdgeTypeId('edge-type'),
      name: 'New type',
      thematicStyleSlotId: getDefaultEdgeStyleSlotId(),
      createdAt: now,
      updatedAt: now
    };

    await graphStore.createEdgeType(edgeType);
    this.#onEdgeTypesChanged();

    this.#reload();
    this.#selectedId = edgeType.id;
    this.#activeTab = 'meaning';
    this.#refreshList();
    this.#renderPane();
  }

  async #save(): Promise<void> {
    const unnamed = [...this.#dirty].find(id => !this.#drafts.get(id)?.name.trim());
    if (unnamed) {
      this.#selectedId = unnamed;
      this.#activeTab = 'meaning';
      this.#refreshList();
      this.#renderPane();
      this.#setStatus('Edge type name cannot be empty.');
      return;
    }

    for (const id of this.#dirty) {
      const draft = this.#drafts.get(id);
      if (!draft) continue;

      await graphStore.updateEdgeType({
        ...draft,
        name: draft.name.trim(),
        description: this.#trimmedOrAbsent(draft.description),
        forwardLabel: this.#trimmedOrAbsent(draft.forwardLabel),
        inverseLabel: this.#trimmedOrAbsent(draft.inverseLabel),
        updatedAt: new Date()
      });
    }

    this.#dirty.clear();
    this.#onEdgeTypesChanged();
    this.#close();
  }

  #close(): void {
    this.#cleanup();
  }

  // ===========================================================================
  // STATE
  // ===========================================================================

  /**
   * Pulls the store into drafts, keeping any uncommitted edits. Add Type writes
   * to the store immediately, so this runs while field edits may be pending.
   */
  #reload(): void {
    const stored = graphStore.edgeTypes;
    const next = new Map<EdgeTypeId, EdgeType>();

    stored.forEach((edgeType) => {
      const draft = this.#drafts.get(edgeType.id);
      next.set(edgeType.id, this.#dirty.has(edgeType.id) && draft ? draft : clone(edgeType));
    });

    this.#drafts = next;
    if (!this.#selectedId || !this.#drafts.has(this.#selectedId)) {
      this.#selectedId = stored[0]?.id ?? null;
    }
  }

  #refreshList(): void {
    if (!this.#listSelect) return;

    this.#listSelect.replaceChildren(
      ...[...this.#drafts.values()].map((edgeType) => {
        const option = document.createElement('option');
        option.value = edgeType.id;
        option.textContent = `${edgeType.name || 'Unnamed'} (${this.#countEdgesForType(edgeType.id)})`;
        option.selected = edgeType.id === this.#selectedId;
        return option;
      })
    );

    this.#setStatus(this.#dirty.size ? 'Unsaved changes' : '');
  }

  #selected(): EdgeType | null {
    return this.#selectedId ? this.#drafts.get(this.#selectedId) ?? null : null;
  }

  #markDirty(id: EdgeTypeId): void {
    this.#dirty.add(id);
    this.#setStatus('Unsaved changes');
  }

  #setStatus(message: string): void {
    const status = this.#modal?.querySelector<HTMLElement>('.etm-status');
    if (!status) return;
    status.textContent = message;
    status.title = message;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  #createUniqueEdgeTypeId(prefix: string): EdgeTypeId {
    const usedIds = new Set(graphStore.edgeTypes.map(edgeType => edgeType.id));
    let index = graphStore.edgeTypes.length + 1;
    let id = `${prefix}-${index}` as EdgeTypeId;
    while (usedIds.has(id)) {
      index += 1;
      id = `${prefix}-${index}` as EdgeTypeId;
    }
    return id;
  }

  #countEdgesForType(edgeTypeId: EdgeTypeId): number {
    return graphStore.edges.filter(edge => edge.typeId === edgeTypeId).length;
  }

  /** Blank saves as absent, so nothing downstream distinguishes "" from missing. */
  #trimmedOrAbsent(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  #styleString(styles: Record<string, unknown>, key: string, fallback: string): string {
    const value = styles[key];
    return typeof value === 'string' ? value : fallback;
  }

  #styleNumber(styles: Record<string, unknown>, key: string, fallback: number): number {
    const value = styles[key];
    return typeof value === 'number' ? value : fallback;
  }

  #formatSlotLabel(slotId: EdgeStyleSlotId): string {
    return `Thematic style ${slotId.replace('edge-style-', '')}`;
  }

  #formatOptionLabel(option: string): string {
    return option
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  /** Capture phase and stopped here, so Escape closes this modal only. */
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

function clone(edgeType: EdgeType): EdgeType {
  return {
    ...edgeType,
    styleOverride: edgeType.styleOverride ? { ...edgeType.styleOverride } : undefined
  };
}
