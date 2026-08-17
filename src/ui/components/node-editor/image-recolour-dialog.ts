/**
 * Node Editor — image recolour dialog
 *
 * Assigns each colour in a fixed-colour image to a palette slot, so an image
 * drawn elsewhere can follow the theme.
 *
 * **Manual, because the choice cannot be inferred.** Snapping to the nearest
 * palette colour — what `tokeniseImageColours` does for generated images — is
 * exactly wrong here: a black glyph brought into a dark theme must become light,
 * and the nearest palette colour to black is the darkest one available. Only the
 * author knows which colour is the ink and which is the ground.
 *
 * **Writes nothing to storage.** Apply hands the rewritten SVG back to the Image
 * tab's draft, so cancelling the editor still undoes it.
 */

import type { NodeImagePalette } from '../../../core/node-image-types';
import { resolveNodeImagePalette } from '../../../styles/node-image-palette';
import type { ImageColourGroup, ImageColourSlot, ImagePaletteSlot } from '../../../styles/node-image-tokens';
import {
  applyColourMapping,
  applyImagePalette,
  isFixedColour,
  listImageColours,
  NODE_IMAGE_FIXED_COLOURS
} from '../../../styles/node-image-tokens';
import { el, text } from './editor-fields';

export interface ImageRecolourDialogOptions {
  /** Element the overlay is appended to — the editor modal. */
  host: HTMLElement;
  containerRect: DOMRect | null;
  /** Bounds of the editor dialog underneath, so this covers it exactly. */
  getEditorRect: () => DOMRect | null;
  /** The image's SVG, colours still literal. */
  svg: string;
  themeId: string;
  /** Node title, for the preview's alt text. */
  title: string;
  onApplied: (svg: string) => void;
}

/**
 * Above this the mapping stops being a decision and becomes a chore, and the
 * palette has nowhere to put the surplus: four inks plus a surface.
 */
export const MAX_RECOLOURABLE_COLOURS = 5;

/**
 * Palette slots first, then the theme-independent colours, then the escape
 * hatch. Order is the reading order of the decision: follow the theme, ignore
 * it, or leave it alone.
 */
const SLOT_LABELS: { value: ImageColourSlot; label: string }[] = [
  { value: 'ink-1', label: 'Ink 1' },
  { value: 'ink-2', label: 'Ink 2' },
  { value: 'ink-3', label: 'Ink 3' },
  { value: 'ink-4', label: 'Ink 4' },
  { value: 'surface', label: 'Surface' },
  { value: 'black', label: 'Black (fixed)' },
  { value: 'white', label: 'White (fixed)' },
  { value: 'red', label: 'Red (fixed)' },
  { value: 'green', label: 'Green (fixed)' },
  { value: 'blue', label: 'Blue (fixed)' },
  { value: 'yellow', label: 'Yellow (fixed)' },
  { value: 'unchanged', label: 'Leave unchanged' }
];

export function showImageRecolourDialog(options: ImageRecolourDialogOptions): void {
  const { host, containerRect, themeId, onApplied } = options;

  const palette = resolveNodeImagePalette(themeId, 'unspecified');

  // Resolved first, which is what lets one dialog serve both cases. A thematic
  // image holds tokens, and resolving them yields the palette colours it is
  // currently using — so re-assigning those is a slot swap. On a fixed image
  // there are no tokens and this changes nothing.
  const svg = applyImagePalette(options.svg, palette);

  const groups = listImageColours(svg);
  const slots = new Map<string, ImageColourSlot>();

  // A colour already equal to a palette entry keeps it, so opening the dialog on
  // a thematic image shows what it does today rather than a reshuffle. Anything
  // else pairs by position: groups arrive most-used first and the palette is
  // ordered by dominance, so that is the answer more often than not — and every
  // row is a dropdown precisely so it can be overruled.
  groups.forEach((group, index) => {
    slots.set(group.hex, currentSlot(group.hex, palette) ?? positionSlot(index, palette));
  });

  const overlay = el('div', 'node-editor-image-overlay');
  if (containerRect) {
    overlay.style.left = `${containerRect.left}px`;
    overlay.style.top = `${containerRect.top}px`;
    overlay.style.width = `${containerRect.width}px`;
    overlay.style.height = `${containerRect.height}px`;
  }

  const dialog = el('div', 'node-editor-image-dialog');
  dialog.addEventListener('click', (event) => event.stopPropagation());

  const heading = text('h3', 'Recolour. Choose the theme colour for each colour in the image:');
  heading.className = 'node-editor-image-dialog-title';

  const rows = el('div', 'node-editor-recolour-rows');
  for (const group of groups) {
    rows.appendChild(colourRow(group, palette, slots, () => refreshPreview()));
  }

  const preview = el('div', 'node-editor-recolour-preview');

  const cancelBtn = footerButton('Cancel');
  const applyBtn = footerButton('Apply');

  const footer = el('div', 'node-editor-image-dialog-footer');
  footer.append(el('div', 'node-editor-image-dialog-spacer'), cancelBtn, applyBtn);

  const close = (): void => {
    overlay.remove();
  };

  function mapped(): string {
    return applyColourMapping(svg, groups, slots, palette);
  }

  /**
   * Previewed with the palette resolved back to hex rather than as tokens: the
   * tokens only resolve inside a node's own SVG, and this is a bare `<img>`.
   */
  function refreshPreview(): void {
    const resolved = applyImagePalette(mapped(), palette);
    const img = document.createElement('img');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(resolved);
    img.alt = options.title;
    img.className = 'node-editor-recolour-preview-img';
    preview.replaceChildren(img);
  }

  cancelBtn.addEventListener('click', close);
  applyBtn.addEventListener('click', () => {
    onApplied(mapped());
    close();
  });

  overlay.addEventListener('click', close);
  overlay.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') close();
  });

  dialog.append(heading, rows, preview, footer);
  overlay.appendChild(dialog);
  host.appendChild(overlay);

  const editorRect = options.getEditorRect();
  if (editorRect) {
    const overlayRect = overlay.getBoundingClientRect();
    dialog.style.position = 'absolute';
    dialog.style.left = `${editorRect.left - overlayRect.left}px`;
    dialog.style.top = `${editorRect.top - overlayRect.top}px`;
    dialog.style.width = `${editorRect.width}px`;
    dialog.style.height = `${editorRect.height}px`;
  }

  refreshPreview();
  applyBtn.focus();
}

function colourRow(
  group: ImageColourGroup,
  palette: NodeImagePalette,
  slots: Map<string, ImageColourSlot>,
  onChange: () => void
): HTMLElement {
  const row = el('div', 'node-editor-recolour-row');

  const swatch = el('span', 'node-editor-recolour-swatch');
  swatch.style.background = group.hex;
  swatch.title = group.members.length > 1
    ? `${group.hex} (and ${group.members.length - 1} near-identical values)`
    : group.hex;

  const source = text('span', group.hex);
  source.className = 'node-editor-recolour-hex';

  const target = el('span', 'node-editor-recolour-swatch');

  const select = document.createElement('select');
  select.className = 'node-editor-select';
  for (const option of SLOT_LABELS) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = option.value === slots.get(group.hex);
    select.appendChild(element);
  }

  const paintTarget = (): void => {
    const slot = slots.get(group.hex);
    const hex = slot && slot !== 'unchanged' ? slotColour(slot, palette) : group.hex;
    target.style.background = hex;
    target.title = hex;
  };

  select.addEventListener('change', () => {
    slots.set(group.hex, select.value as ImageColourSlot);
    paintTarget();
    onChange();
  });
  paintTarget();

  row.append(swatch, source, text('span', '→'), select, target);
  return row;
}

/** The slot a colour already occupies, so an unchanged mapping is the default. */
function currentSlot(hex: string, palette: NodeImagePalette): ImageColourSlot | undefined {
  const inkIndex = palette.ink.findIndex(ink => ink.toLowerCase() === hex.toLowerCase());
  if (inkIndex >= 0) return `ink-${inkIndex + 1}` as ImageColourSlot;
  return palette.surface.toLowerCase() === hex.toLowerCase() ? 'surface' : undefined;
}

function positionSlot(index: number, palette: NodeImagePalette): ImageColourSlot {
  return index < palette.ink.length ? (`ink-${index + 1}` as ImageColourSlot) : 'unchanged';
}

/** What a slot resolves to right now, for the swatch beside the dropdown. */
function slotColour(slot: Exclude<ImageColourSlot, 'unchanged'>, palette: NodeImagePalette): string {
  if (isFixedColour(slot)) return NODE_IMAGE_FIXED_COLOURS[slot];
  if (slot === 'surface') return palette.surface;
  return palette.ink[Number((slot as ImagePaletteSlot).slice('ink-'.length)) - 1] ?? palette.surface;
}

function footerButton(label: string): HTMLButtonElement {
  const element = text('button', label) as HTMLButtonElement;
  element.type = 'button';
  element.className = 'node-editor-btn node-editor-btn-neutral';
  return element;
}
