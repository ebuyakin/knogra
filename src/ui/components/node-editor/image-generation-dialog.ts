/**
 * Node Editor - image generation dialog
 *
 * Nested prompt dialog for AI-generated SVG pictograms, following
 * `equation-dialog.ts`: an overlay anchored to the Cytoscape container rect and
 * hosted inside the editor modal, so it dims only the editor.
 *
 * It resolves everything the AI layer is not allowed to look up itself — the
 * preset from the registry, the palette from the scene's theme, the display
 * width from the size class — and hands the generator plain values.
 *
 * It carries its own size control because the display width is stated in the
 * prompt and so has to be chosen before generating; Accept writes it back to
 * the Image tab.
 *
 * **Writes nothing to storage.** Accept sets the tab's draft, so an accepted
 * image is still lost if the editor is then cancelled — which is exactly what
 * keeps Cancel safe. See docs/node-image-templates.md §6.
 */

import type { NodeImageColourMode, NodeImageSizeClass, NodeImageStyleReference } from '../../../core/node-image-types';
import { getSetting } from '../../../config';
import type { NodeImageCorrection } from '../../../ai/node-image/prompt/prompt-composer';
import { composeNodeImagePrompt } from '../../../ai/node-image/prompt/prompt-composer';
import { sanitizeSvg } from '../../../ai/node-image/svg-sanitizer';
import { checkGeneratedViewBox } from '../../../ai/node-image/viewbox-check';
import {
  getDefaultNodeImagePreset,
  listNodeImagePresets
} from '../../../storage/node-image-presets';
import { resolveNodeImagePalette } from '../../../styles/node-image-palette';
import { resolveImageColours, tokeniseImageColours } from '../../../styles/node-image-tokens';
import { graphStore } from '../../../storage/graph-store';
import { createTextarea, el, text } from './editor-fields';
import { NodeImagePresetEditor } from '../node-image-preset-editor';
import type { NodeEditorImageRequest, NodeEditorOnGenerateImage } from './node-editor-types';

export interface AcceptedGeneratedImage {
  /** Already sanitized — the same bytes that were previewed. */
  svg: string;
  aspectRatio: number;
  sizeClass: NodeImageSizeClass;
  /** The description that produced it, persisted as the seed for a redraw. */
  prompt: string;
  /** Copied from the preset, because render-time treatment depends on it. */
  colourMode: NodeImageColourMode;
}

export interface ImageGenerationDialogOptions {
  /** Element the overlay is appended to — the editor modal. */
  host: HTMLElement;
  containerRect: DOMRect | null;
  /**
   * Bounds of the editor dialog underneath. The overlay dialog takes them
   * exactly, so it covers the editor rather than stacking a third visible
   * frame on top of it.
   */
  getEditorRect: () => DOMRect | null;
  /** Node title: seeds the description box, and labels the preview image. */
  title: string;
  themeId: string;
  /** Seeded from the Image tab; Accept hands the final choice back. */
  sizeClass: NodeImageSizeClass;
  /** The image already on the node, colour tokens resolved, or undefined if none. */
  startingPointSvg?: string;
  /** Other scene nodes carrying an image; empty hides the picker entirely. */
  styleReferences: NodeImageStyleReference[];
  generate: NodeEditorOnGenerateImage;
  onAccepted: (image: AcceptedGeneratedImage) => void;
}

const SIZE_CLASSES: NodeImageSizeClass[] = ['small', 'medium', 'large'];
const GENERATE_LABEL = 'Generate with AI (Ctrl+Enter)';
// No shortcut hint: once Accept is on screen the row is at its widest, and the
// hint is the one thing in it that a tooltip can carry instead.
const REDRAW_LABEL = 'Redraw';
const NO_PRESETS = 'No presets available. Create one in the preset editor.';
const PREVIEW_HINT = 'The generated image appears here.';
/** Shown instead when the node already has an image, which the request revises rather than replaces. */
const PREVIEW_HINT_REVISING = 'The image already on this node will be revised. The result appears here.';
const CORRECTION_PLACEHOLDER = 'What should change? Anything you do not mention stays as it is.';
const CORRECTION_REQUIRED = 'Say what should change, or Accept the image as it is.';
const PRESET_CHANGED = 'Preset changed — the conversation was discarded. Generate again to start over.';

/** Marks a message already sent. Read-only, and visually settled. */
const SENT_CLASS = 'node-editor-image-dialog-sent';

/**
 * Rows given to every message, the first and every correction alike.
 *
 * One number rather than two: the pane is sized to hold exactly two of these
 * plus the rule between them, so a box that differed by a row would make what
 * fitted before a turn settle overflow after it.
 */
const MESSAGE_ROWS = 5;

/**
 * OKLab distance above which a snapped colour has visibly changed.
 *
 * A steer for us, not a threshold anything acts on: it says whether models are
 * respecting the palette we hand them. A guess until there is judged output.
 */
const MAX_EXPECTED_COLOUR_SHIFT = 0.25;

export function showImageGenerationDialog(options: ImageGenerationDialogOptions): void {
  const { host, containerRect, title, themeId, startingPointSvg, generate, onAccepted } = options;

  const overlay = el('div', 'node-editor-image-overlay');
  if (containerRect) {
    overlay.style.left = `${containerRect.left}px`;
    overlay.style.top = `${containerRect.top}px`;
    overlay.style.width = `${containerRect.width}px`;
    overlay.style.height = `${containerRect.height}px`;
  }

  const dialog = el('div', 'node-editor-image-dialog');
  dialog.addEventListener('click', (event) => event.stopPropagation());

  const heading = text('h3', 'Image generator. Describe the image you want:');
  heading.className = 'node-editor-image-dialog-title';

  // Unlabelled: the heading already says what this is. Seeded with the node's
  // title, which is the request until the user makes it something else — the
  // subject is no longer appended separately, so an image need not be a picture
  // of the node's name.
  const description = createTextarea(
    '',
    options.title,
    'Describe the image you want',
    MESSAGE_ROWS,
    { autoGrow: false }
  );

  // ------------------------------ conversation ------------------------------
  // The transcript, and the only part of the dialog that scrolls. The frame is
  // pinned to the editor's, so a growing conversation must not push the preset
  // row, the preview, or the footer around: this pane takes the height the
  // description box establishes on turn one and keeps it for good.
  //
  // Only the user's side is here. The images live in the result pane, one at a
  // time, because the newest is the only one a correction can be about.
  const conversation = el('div', 'node-editor-image-dialog-conversation');
  conversation.appendChild(description.container);

  /** Turns already answered. A turn is committed only once it produced an image. */
  const corrections: NodeImageCorrection[] = [];

  /**
   * The open correction box and the image it is about, or null before the first
   * image exists. Capturing the image here rather than reading the current
   * preview is what keeps a rejected redraw from re-basing the turn.
   */
  let pending: { input: HTMLTextAreaElement; svg: string } | null = null;

  // ------------------------------ preset + size -----------------------------
  // One row of label+control pairs: each is a single choice, and stacking them
  // pushed the preview down for no gain.
  const controlsRow = el('div', 'node-editor-image-dialog-row');
  const presetSelect = document.createElement('select');
  presetSelect.className = 'node-editor-select';

  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'node-editor-select';
  for (const sizeClass of SIZE_CLASSES) {
    const option = document.createElement('option');
    option.value = sizeClass;
    option.textContent = sizeClass[0].toUpperCase() + sizeClass.slice(1);
    option.selected = sizeClass === options.sizeClass;
    sizeSelect.appendChild(option);
  }

  // Omitted rather than shown empty when no sibling carries an image: the row
  // then keeps the two-control shape it had before.
  const referenceSelect = document.createElement('select');
  referenceSelect.className = 'node-editor-select';
  if (options.styleReferences.length > 0) {
    referenceSelect.appendChild(referenceOption('', 'None'));
    for (const reference of options.styleReferences) {
      referenceSelect.appendChild(referenceOption(reference.imageId, reference.title));
    }
  }

  controlsRow.append(pair('Preset', presetSelect), pair('Size', sizeSelect));
  if (options.styleReferences.length > 0) {
    controlsRow.appendChild(pair('Template', referenceSelect));
  }

  // --------------------------------- result ---------------------------------
  const message = text('div', '');
  message.className = 'node-editor-image-dialog-message';

  const result = el('div', 'node-editor-image-dialog-result');

  // -------------------------------- footer ----------------------------------
  // One row, one style, no separators: preset management on the left edge, the
  // per-request actions on the right.
  const footer = el('div', 'node-editor-image-dialog-footer');
  const presetsButton = footerButton('Manage presets', 'Create and edit image presets');
  const promptButton = import.meta.env.DEV
    ? footerButton('Prompt', 'Dev only: the composed request, exactly as sent')
    : null;
  const spacer = el('div', 'node-editor-image-dialog-spacer');
  const cancelBtn = footerButton('Cancel');
  const generateBtn = footerButton(GENERATE_LABEL, 'Ctrl+Enter');
  const acceptBtn = footerButton('Accept');
  acceptBtn.style.display = 'none';

  footer.appendChild(presetsButton);
  if (promptButton) footer.appendChild(promptButton);
  footer.append(spacer, cancelBtn, acceptBtn, generateBtn);

  // The sanitized result currently on offer. Null whenever there is nothing to
  // accept — before the first generation, and after a rejection.
  let accepted: { svg: string; aspectRatio: number } | null = null;

  const close = (): void => overlay.remove();

  const refreshPresets = (keepId?: string): void => {
    const presets = listNodeImagePresets();
    const fallbackId = getDefaultNodeImagePreset()?.id;
    presetSelect.replaceChildren(
      ...presets.map((preset) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        option.selected = preset.id === (keepId ?? fallbackId);
        return option;
      })
    );
    presetSelect.disabled = presets.length === 0;
    if (presets.length === 0) message.textContent = NO_PRESETS;
  };

  const setBusy = (busy: boolean): void => {
    generateBtn.disabled = busy;
    cancelBtn.disabled = busy;
    acceptBtn.disabled = busy;
    presetsButton.disabled = busy;
    if (promptButton) promptButton.disabled = busy;
    description.input.disabled = busy;
    if (pending) pending.input.disabled = busy;
    presetSelect.disabled = busy || presetSelect.options.length === 0;
    sizeSelect.disabled = busy;
    generateBtn.textContent = busy
      ? 'Generating...'
      : pending
        ? REDRAW_LABEL
        : GENERATE_LABEL;
  };

  // --------------------------- conversation turns ---------------------------

  /**
   * Used for the real correction box and for the probe that sizes the pane, so
   * the pane is measured against exactly the field it will later hold.
   */
  const createCorrectionField = (): { container: HTMLDivElement; input: HTMLTextAreaElement } =>
    createTextarea('', '', CORRECTION_PLACEHOLDER, MESSAGE_ROWS, { autoGrow: false });

  /**
   * Opens the box for the next correction, and closes the request above it.
   *
   * The description stays visible but read-only from here on. Editing the
   * original request midway is neither a correction nor a fresh start, and there
   * is no reading of it that the contract can honour.
   */
  const openCorrection = (svg: string): void => {
    description.input.readOnly = true;
    description.container.classList.add(SENT_CLASS);

    const field = createCorrectionField();
    conversation.appendChild(field.container);
    pending = { input: field.input, svg };

    conversation.scrollTop = conversation.scrollHeight;
    field.input.focus();
  };

  /** Settles the open correction once it has been answered. */
  const sealCorrection = (): void => {
    if (!pending) return;
    pending.input.readOnly = true;
    pending.input.closest('.node-editor-field')?.classList.add(SENT_CLASS);
    pending = null;
  };

  /**
   * Back to a single empty request.
   *
   * The preset is the drawing language every turn was answered in, so a
   * conversation cannot survive changing it — the corrections would be replies
   * to a brief that was never sent.
   */
  const resetConversation = (reason: string): void => {
    corrections.length = 0;
    pending = null;
    description.input.readOnly = false;
    description.container.classList.remove(SENT_CLASS);
    conversation.replaceChildren(description.container);
    showHint();
    message.textContent = reason;
  };

  /** The result pane before anything has been drawn, and after a reset. */
  const showHint = (): void => {
    accepted = null;
    acceptBtn.style.display = 'none';
    const hint = text('div', startingPointSvg ? PREVIEW_HINT_REVISING : PREVIEW_HINT);
    hint.className = 'node-editor-image-dialog-hint';
    result.replaceChildren(hint);
  };

  /** Fills the result pane with monospaced text: raw SVG, or a composed prompt. */
  const showSource = (value: string): void => {
    const source = document.createElement('textarea');
    source.className = 'node-editor-textarea node-editor-image-dialog-source';
    source.readOnly = true;
    source.value = value;
    result.replaceChildren(source);
  };

  const showRejection = (reason: string, rawSvg: string): void => {
    accepted = null;
    acceptBtn.style.display = 'none';
    message.textContent = reason;
    // Offered rather than swallowed: the source is the only way to tell a model
    // that produced nothing from one that produced something unusable.
    showSource(rawSvg);
  };

  const showPreview = (svg: string): void => {
    message.textContent = '';
    // An <img> data URI does not execute script; `innerHTML` would. See §7.
    const img = document.createElement('img');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    img.alt = title;
    img.className = 'node-editor-image-dialog-preview';
    result.replaceChildren(img);
    acceptBtn.style.display = '';
  };

  /**
   * Back to whatever is currently on offer.
   *
   * A turn can fail for reasons that say nothing about the image already on
   * screen — no key, no network, a model that answered in prose. Clearing the
   * preview in those cases would throw away a good result and the Accept button
   * with it, for a failure the image had no part in.
   */
  const restoreResult = (): void => {
    if (accepted) showPreview(accepted.svg);
    else showHint();
  };

  /**
   * The fully resolved request, or null when the form is not ready — reporting
   * why on the message line. Shared by Generate and the dev prompt preview, so
   * what is previewed is necessarily what would be sent.
   *
   * The brief is recomposed from the live controls every turn, so a size change
   * mid-conversation applies to the whole transcript rather than to the newest
   * turn only. That is the coherent reading: the image is being drawn once, at
   * one size, and the corrections describe the same drawing.
   */
  const buildRequest = async (turns: NodeImageCorrection[]): Promise<NodeEditorImageRequest | null> => {
    const preset = listNodeImagePresets().find((entry) => entry.id === presetSelect.value);
    if (!preset) {
      message.textContent = NO_PRESETS;
      return null;
    }

    const prompt = description.input.value.trim();
    if (!prompt) {
      message.textContent = 'Describe the image you want to generate.';
      return null;
    }

    return {
      preset,
      palette: resolveNodeImagePalette(themeId, preset.colour.paletteSize),
      maxBytes: getSetting('node.imageMaxKB') * 1024,
      description: prompt,
      startingPoint: startingPointSvg,
      // Loaded per request rather than cached on selection: it is read once, on
      // the first turn, and a cache would only need invalidating.
      styleReference: turns.length === 0 ? await loadStyleReference() : undefined,
      corrections: turns
    };
  };

  /**
   * The selected sibling's SVG, with colour tokens resolved.
   *
   * A thematic image is stored as tokens; handing those to the model would
   * teach it to answer in them.
   */
  const loadStyleReference = async (): Promise<string | undefined> => {
    if (!referenceSelect.value) return undefined;

    const image = await graphStore.getNodeImage(referenceSelect.value);
    if (!image) return undefined;

    return resolveImageColours(image, resolveNodeImagePalette(themeId, 'unspecified'));
  };

  const submit = async (): Promise<void> => {
    const correction = pending?.input.value.trim() ?? '';
    if (pending && !correction) {
      message.textContent = CORRECTION_REQUIRED;
      return;
    }

    // Built but not committed: a turn joins the transcript only once it has
    // produced an image, so a rejection or a provider failure leaves the
    // correction where the user typed it, still editable, still unsent.
    const turns = pending
      ? [...corrections, { svg: pending.svg, text: correction }]
      : corrections;

    const request = await buildRequest(turns);
    if (!request) return;

    message.textContent = '';
    setBusy(true);

    try {
      const generated = await generate(request);

      if (generated.type === 'clarification') {
        restoreResult();
        message.textContent = generated.message;
        return;
      }

      const sanitized = sanitizeSvg(generated.svg);
      if (sanitized.type === 'rejected') {
        showRejection(sanitized.message, generated.svg);
        return;
      }

      const wrongViewBox = checkGeneratedViewBox(sanitized.svg, request.preset.technical.aspect);
      if (wrongViewBox) {
        showRejection(wrongViewBox, generated.svg);
        return;
      }

      corrections.splice(0, corrections.length, ...turns);
      sealCorrection();

      accepted = { svg: sanitized.svg, aspectRatio: sanitized.aspectRatio };
      showPreview(sanitized.svg);
      openCorrection(sanitized.svg);
    } catch (caught) {
      restoreResult();
      message.textContent = caught instanceof Error
        ? caught.message
        : 'Could not generate an image.';
    } finally {
      setBusy(false);
      (pending?.input ?? description.input).focus();
    }
  };

  /** Exactly what would be sent, composed from the live controls rather than described. */
  const showComposedPrompt = async (): Promise<void> => {
    const correction = pending?.input.value.trim();
    const request = await buildRequest(
      correction && pending ? [...corrections, { svg: pending.svg, text: correction }] : corrections
    );
    if (!request) return;

    message.textContent = '';
    const prompt = composeNodeImagePrompt(request);
    const transcript = prompt.messages
      .map((entry) => `--- ${entry.role.toUpperCase()} ---\n${entry.content}`)
      .join('\n\n');
    showSource(`--- SYSTEM ---\n${prompt.system}\n\n${transcript}`);
  };

  cancelBtn.addEventListener('click', close);
  generateBtn.addEventListener('click', () => void submit());
  acceptBtn.addEventListener('click', () => {
    if (!accepted) return;

    // Tokenising happens here rather than at generation: the correction
    // transcript replays the previous SVG to the model, and it must see the
    // colours it actually drew with.
    const colour = listNodeImagePresets().find((entry) => entry.id === presetSelect.value)?.colour;
    const thematic = colour?.colourMode === 'thematic';
    const tokenised = thematic
      ? tokeniseImageColours(accepted.svg, resolveNodeImagePalette(themeId, colour.paletteSize))
      : null;

    if (tokenised && import.meta.env.DEV && tokenised.maxShift > MAX_EXPECTED_COLOUR_SHIFT) {
      console.warn(`[node-image] a colour moved ${tokenised.maxShift.toFixed(3)} to reach the palette — the model may be ignoring it.`);
    }

    onAccepted({
      svg: tokenised?.svg ?? accepted.svg,
      aspectRatio: accepted.aspectRatio,
      sizeClass: sizeSelect.value as NodeImageSizeClass,
      prompt: description.input.value.trim(),
      colourMode: thematic ? 'thematic' : 'fixed'
    });
    close();
  });
  presetsButton.addEventListener('click', () => {
    const selectedId = presetSelect.value;
    void new NodeImagePresetEditor().show(themeId, containerRect ?? undefined).then(() => {
      refreshPresets(selectedId);
    });
  });
  presetSelect.addEventListener('change', () => {
    if (corrections.length === 0 && !pending) return;
    resetConversation(PRESET_CHANGED);
  });
  promptButton?.addEventListener('click', () => void showComposedPrompt());

  overlay.addEventListener('click', close);
  overlay.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      close();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  });

  dialog.append(heading, conversation, controlsRow, message, result, footer);
  overlay.appendChild(dialog);
  host.appendChild(overlay);

  // Laid exactly over the editor frame, measured after both are in the DOM. The
  // editor is draggable, so its rect is read now rather than assumed centred.
  const editorRect = options.getEditorRect();
  if (editorRect) {
    const overlayRect = overlay.getBoundingClientRect();
    dialog.style.position = 'absolute';
    dialog.style.left = `${editorRect.left - overlayRect.left}px`;
    dialog.style.top = `${editorRect.top - overlayRect.top}px`;
    dialog.style.width = `${editorRect.width}px`;
    dialog.style.height = `${editorRect.height}px`;
  }

  // Sized to hold the description box and one correction box at once, so the
  // pane visibly contains a conversation rather than a field. Measured with a
  // real correction field temporarily in place, then pinned: deriving the height
  // from row counts would be a second source of truth for what the browser
  // actually renders, and the separator rule between turns is in the measurement
  // only because a real second field is there to draw it.
  const probe = createCorrectionField();
  conversation.appendChild(probe.container);
  conversation.style.height = `${conversation.getBoundingClientRect().height}px`;
  probe.container.remove();

  refreshPresets();
  showHint();
  description.input.focus();
  description.input.select();
}

function footerButton(label: string, title?: string): HTMLButtonElement {
  const element = text('button', label) as HTMLButtonElement;
  element.type = 'button';
  element.className = 'node-editor-btn node-editor-btn-neutral';
  if (title) element.title = title;
  return element;
}

/** A caption bound to its control, so the pairing is legible at a glance. */
function pair(caption: string, control: HTMLElement): HTMLElement {
  const wrapper = el('div', 'node-editor-image-dialog-pair');
  const label = text('span', caption);
  label.className = 'node-editor-inline-label';
  wrapper.append(label, control);
  return wrapper;
}

function referenceOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}
