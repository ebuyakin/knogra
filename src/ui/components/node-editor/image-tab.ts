/**
 * Node Editor - Image tab
 *
 * Attaches an SVG pictogram to a node: paste source, upload a file, choose a
 * size class, save it back out, or remove it.
 *
 * Nothing is written to storage here. The tab reports the record it *wants*
 * persisted and the ids it wants dropped; the shell hands both to the save
 * callback. Cancel therefore leaves nothing behind, and no half-attached image
 * can survive a dismissed dialog.
 *
 * The design is never touched. An image is node-level content; whether it is
 * shown is a scene-level design choice, so the same node can carry one image
 * and display it in one scene and not another (§1.3). Attaching, replacing or
 * removing a picture is not a request to restyle the node in this scene.
 *
 * See docs/nodes-svg-images.md §8.
 */

import type { Node, NodeImageId } from '../../../core/main-types';
import type { NodeImage, NodeImageColourMode, NodeImageSizeClass, NodeImageStyleReference } from '../../../core/node-image-types';
import { graphStore } from '../../../storage/graph-store';
import { sanitizeSvg } from '../../../ai/node-image/svg-sanitizer';
import { resolveNodeImagePalette } from '../../../styles/node-image-palette';
import { hasColourTokens, listImageColours, resolveImageColours } from '../../../styles/node-image-tokens';
import { MAX_RECOLOURABLE_COLOURS, showImageRecolourDialog } from './image-recolour-dialog';
import { el, text } from './editor-fields';
import { showImageGenerationDialog } from './image-generation-dialog';
import type { EditorTab, ImageTabValues, NodeEditorOnGenerateImage } from './node-editor-types';

export interface ImageTabDeps {
  node: Node;
  /** Live title text from the shell — an unsaved edit must reach the generator. */
  getTitle: () => string;
  /** Graph viewport bounds, so nested modals centre where every other modal does. */
  getContainerRect: () => DOMRect | null;
  /** Element the generation overlay attaches to — the editor modal. */
  getOverlayHost: () => HTMLElement | null;
  /** Editor frame bounds, so the generation overlay can cover it exactly. */
  getEditorRect: () => DOMRect | null;
  /** Scene theme, resolved into the palette the generated image may draw with. */
  themeId: string;
  /** Other scene nodes carrying an image, offered in the generation dialog. */
  styleReferences: NodeImageStyleReference[];
  /** Absent when no AI capability is wired: the Generate button is then omitted. */
  generateImage: NodeEditorOnGenerateImage | null;
}

const SIZE_CLASSES: NodeImageSizeClass[] = ['small', 'medium', 'large'];

export function createImageTab(deps: ImageTabDeps): EditorTab<ImageTabValues> {
  const element = el('div', 'node-editor-panel node-editor-image-panel');

  const originalImageId = deps.node.properties?.imageId as NodeImageId | undefined;

  // The record the node should end up with, and the ids this edit superseded.
  let draft: NodeImage | null = null;
  let removedImageIds: NodeImageId[] = [];
  // Set as soon as the user acts, so the async load of the existing record
  // cannot overwrite an image they attached while it was still in flight.
  let touched = false;

  // Colour count behind the Recolour button, and the SVG it was counted from.
  let countedSvg: string | null = null;
  let colourCount = 0;

  // --------------------------------- preview --------------------------------
  const preview = el('div', 'node-editor-image-preview');

  const error = text('div', '');
  error.className = 'node-editor-image-error';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.svg,image/svg+xml';
  fileInput.style.display = 'none';

  // ---------------------------------- size ----------------------------------
  // Built here rather than through `createSelect`, which pairs the control with
  // a caption: in this column the three option names say it, and a label would
  // make the one control narrower than the buttons beneath it.
  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'node-editor-select';
  sizeSelect.title = 'Image size';
  for (const sizeClass of SIZE_CLASSES) {
    const option = document.createElement('option');
    option.value = sizeClass;
    option.textContent = sizeClass[0].toUpperCase() + sizeClass.slice(1);
    option.selected = sizeClass === 'medium';
    sizeSelect.appendChild(option);
  }
  sizeSelect.addEventListener('change', () => {
    if (!draft) return;
    touched = true;
    draft = { ...draft, sizeClass: sizeSelect.value as NodeImageSizeClass };
  });

  // --------------------------------- actions --------------------------------
  // Generation opens an overlay rather than living here: it is a transaction
  // with busy, preview, accept and redraw states, none of which a tab whose
  // contract is `read()` has anywhere to put. See docs/node-image-templates.md §6.
  const generateButton = deps.generateImage
    ? button('Generate', () => openGenerationDialog())
    : null;
  const uploadButton = button('Upload .svg', () => fileInput.click());
  const saveAsButton = button('Save as .svg', () => downloadDraft());
  const recolourButton = button('Recolour', () => openRecolourDialog());
  const removeButton = button('Remove', () => {
    touched = true;
    supersedeDraft(null);
    render();
  });

  // ------------------------------- composition ------------------------------
  // Two stacked panels. The stage pairs the preview with a column holding every
  // control; the source box sits below it. The control column is what gives the
  // stage its height — the preview stretches to match it — so the panel fits the
  // body without scrolling and stays right when a control is added.
  const controls = el('div', 'node-editor-image-controls');
  controls.appendChild(sizeSelect);
  if (generateButton) controls.appendChild(generateButton);
  controls.append(
    uploadButton,
    saveAsButton,
    recolourButton,
    removeButton
  );

  const stage = el('div', 'node-editor-image-stage');
  stage.append(preview, controls);

  element.append(
    stage,
    error,
    fileInput
  );

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    // Reset first: picking the same file twice must fire `change` both times.
    fileInput.value = '';
    if (!file) return;
    void file.text().then((content) => accept(content, 'uploaded'));
  });

  // Load the existing record for preview. The tab is built synchronously, so
  // this arrives late and defers to anything the user has already done.
  if (originalImageId) {
    void graphStore.getNodeImage(originalImageId).then((image) => {
      if (touched || !image) return;
      draft = image;
      sizeSelect.value = image.sizeClass;
      render();
    });
  }

  render();

  // ---------------------------------------------------------------------------

  function render(): void {
    preview.replaceChildren();
    if (draft) {
      // Rendered as an image source, never injected as markup: an <img> data URI
      // does not execute script, `innerHTML` would. See §7.
      const img = document.createElement('img');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(displaySvg(draft));
      img.alt = deps.getTitle();
      img.className = 'node-editor-image-preview-img';
      preview.appendChild(img);
      preview.appendChild(colourBadge(draft));
    } else {
      preview.appendChild(text('div', 'No image attached'));
    }

    // Disabled rather than hidden: the control column must not reflow when an
    // image is attached or removed.
    sizeSelect.disabled = !draft;
    saveAsButton.disabled = !draft;
    removeButton.disabled = !draft;
    applyRecolourState();
  }

  /**
   * Which colour treatment the stored record carries. Not derivable from the
   * picture, and not visible anywhere else: a thematic image and a fixed one
   * look identical in the theme they were made in.
   */
  function colourBadge(image: NodeImage): HTMLElement {
    const thematic = image.colourMode === 'thematic';
    const badge = text('div', thematic ? 'Theme colours' : 'Fixed colours');
    badge.className = 'node-editor-image-colour-badge';
    badge.title = thematic
      ? 'Colours follow the theme of whichever scene this node appears in.'
      : 'Colours are fixed in the image and do not change with the theme.';
    return badge;
  }

  /**
   * A thematic image is stored as tokens, which are meaningless outside Knogra.
   * The preview and the exported file both need the colours of the scene this
   * editor was opened from.
   */
  function displaySvg(image: NodeImage): string {
    return resolveImageColours(image, resolveNodeImagePalette(deps.themeId, 'unspecified'));
  }

  /**
   * Point the draft at a new record, retiring whatever it pointed at before.
   * A superseded id is remembered rather than deleted, because the edit is not
   * committed until the shell saves.
   */
  function supersedeDraft(next: NodeImage | null): void {
    if (draft && draft.id !== next?.id) removedImageIds.push(draft.id);
    draft = next;
  }

  function accept(rawSvg: string, origin: NodeImage['origin']): boolean {
    const result = sanitizeSvg(rawSvg);
    if (result.type === 'rejected') {
      error.textContent = result.message;
      return false;
    }

    // Uploads and pastes are never recoloured: we did not choose their colours,
    // so we have no basis for mapping them onto a palette.
    attach(result.svg, result.aspectRatio, origin, 'fixed');
    return true;
  }

  /**
   * Take ownership of already-sanitized source. Every entry point converges
   * here, so the record is built in exactly one place.
   */
  function attach(
    svg: string,
    aspectRatio: number,
    origin: NodeImage['origin'],
    colourMode: NodeImageColourMode,
    prompt?: string
  ): void {
    error.textContent = '';
    touched = true;
    supersedeDraft({
      id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      ownerNodeId: deps.node.id,
      svg,
      aspectRatio,
      sizeClass: sizeSelect.value as NodeImageSizeClass,
      origin,
      colourMode,
      prompt,
      createdAt: new Date()
    });
    render();
  }

  /**
   * Recolouring needs a slot per colour, and the palette has five. An image
   * carrying more says so in the tooltip rather than opening a dialog that
   * cannot express it.
   *
   * Counted on the displayed SVG, so a thematic image is measured by the palette
   * colours it actually uses rather than by its tokens — which is also what the
   * dialog will show.
   *
   * Memoised on that SVG: `render()` runs on every change to the tab, and
   * counting colours means scanning the whole document.
   */
  function applyRecolourState(): void {
    if (!draft) {
      recolourButton.disabled = true;
      recolourButton.title = 'Attach an image first.';
      return;
    }

    const resolved = displaySvg(draft);
    if (resolved !== countedSvg) {
      countedSvg = resolved;
      // One more than can be used: enough to know the image has too many.
      colourCount = listImageColours(resolved, MAX_RECOLOURABLE_COLOURS).length;
    }

    recolourButton.disabled = colourCount === 0 || colourCount > MAX_RECOLOURABLE_COLOURS;
    recolourButton.title = colourCount > MAX_RECOLOURABLE_COLOURS
      ? `This image uses more than ${MAX_RECOLOURABLE_COLOURS} colours, which is more than the palette can express.`
      : 'Map this image\'s colours onto the theme palette.';
  }

  /**
   * Recolouring rewrites the draft in place: same record, same id, same origin
   * — only its colours and `colourMode` change, so it is an edit rather than a
   * new attachment and must not supersede anything.
   */
  function openRecolourDialog(): void {
    const host = deps.getOverlayHost();
    const current = draft;
    if (!host || !current) return;

    showImageRecolourDialog({
      host,
      containerRect: deps.getContainerRect(),
      getEditorRect: deps.getEditorRect,
      svg: current.svg,
      themeId: deps.themeId,
      title: deps.getTitle(),
      onApplied: (svg) => {
        touched = true;
        // Read back rather than assumed: every colour may have been mapped to a
        // fixed one, which leaves no token for the render path to substitute.
        draft = { ...current, svg, colourMode: hasColourTokens(svg) ? 'thematic' : 'fixed' };
        render();
      }
    });
  }

  /**
   * The dialog sanitizes and previews, so what arrives here is what was shown.
   * It writes nothing itself: this sets the tab's draft, and the draft still
   * needs the editor to be saved.
   */
  function openGenerationDialog(): void {
    const host = deps.getOverlayHost();
    if (!host || !deps.generateImage) return;

    showImageGenerationDialog({
      host,
      containerRect: deps.getContainerRect(),
      getEditorRect: deps.getEditorRect,
      title: deps.getTitle(),
      themeId: deps.themeId,
      sizeClass: sizeSelect.value as NodeImageSizeClass,
      startingPointSvg: draft ? displaySvg(draft) : undefined,
      styleReferences: deps.styleReferences,
      generate: deps.generateImage,
      onAccepted: (image) => {
        // Before `attach`, which reads the select for the record's size class.
        sizeSelect.value = image.sizeClass;
        attach(image.svg, image.aspectRatio, 'generated', image.colourMode, image.prompt);
      }
    });
  }

  function downloadDraft(): void {
    if (!draft) return;
    const blob = new Blob([displaySvg(draft)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    Object.assign(link, { href: url, download: `${fileBaseName(deps.getTitle())}.svg` });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return {
    element,
    read(): ImageTabValues | null {
      return { changed: touched, image: draft, removedImageIds: [...removedImageIds] };
    }
  };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = text('button', label) as HTMLButtonElement;
  element.type = 'button';
  element.className = 'node-editor-btn node-editor-btn-neutral';
  element.addEventListener('click', onClick);
  return element;
}

function fileBaseName(title: string): string {
  const cleaned = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return cleaned || 'node-image';
}
