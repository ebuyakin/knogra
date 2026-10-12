/**
 * Note attachment zone
 *
 * The Image panel inside a note editor: the preview of the note's single
 * image, the toolbar of sources that can supply one (upload from disk, search
 * online, generate with an image model), and the strip a search or a
 * generation opens. Owns the attachment while the editor is open and hands it
 * back through `getAttachments()` on save.
 *
 * Enforces one image per note: adding from any source replaces the current one.
 * Extracted from chat-note-editor.ts on 2026-10-04; Generate added the same day
 * (docs/ai/chat-image-generation.md §2).
 */

import type { ChatImageAttachment, NoteImageMimeType } from '../../../core/chat-types';
import { searchImages, toRetrievedAttachment } from '../../../ai/image-search/image-search';
import type { ImageCandidate } from '../../../ai/image-search/image-source';
import { imageGenerationGap } from '../../../ai/image-generation/image-provider-resolution';
import { draftInstruction } from '../../../ai/image-generation/draft-instruction';
import { chatSession } from '../../../ai/chat-session';
import { getSetting } from '../../../config';
import { attachGenerateMenu, type GenerateMenuItem } from './generate-menu';
import { openImageSettingsDialog } from './image-settings-dialog';
import { measureFrame } from './note-image-generation';

const MAX_NOTE_IMAGE_BYTES = 1 * 1024 * 1024;
const MAX_NOTE_IMAGE_DIMENSION = 4096;
const ALLOWED_NOTE_IMAGE_MIME_TYPES = new Set<NoteImageMimeType>(['image/png', 'image/jpeg', 'image/webp']);
const NOTE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** Read + validate a file into a ChatImageAttachment. Rejects with a user message on failure. */
function readImageAttachment(file: File): Promise<ChatImageAttachment> {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_NOTE_IMAGE_MIME_TYPES.has(file.type as NoteImageMimeType)) {
      reject(new Error('Only PNG, JPEG, and WebP images are allowed.'));
      return;
    }
    if (file.size > MAX_NOTE_IMAGE_BYTES) {
      reject(new Error('Images must be 1 MB or smaller.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image.'));
      img.onload = () => {
        if (img.width > MAX_NOTE_IMAGE_DIMENSION || img.height > MAX_NOTE_IMAGE_DIMENSION) {
          reject(new Error(`Images must be at most ${MAX_NOTE_IMAGE_DIMENSION}px on each side.`));
          return;
        }
        resolve({
          id: generateAttachmentId(),
          type: 'image',
          origin: 'note',
          mimeType: file.type as NoteImageMimeType,
          name: file.name,
          dataUrl,
          width: img.width,
          height: img.height,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/** Controls a single-image attachment zone inside a note editor. */
export interface AttachmentZone {
  getAttachments(): ChatImageAttachment[];
  /** True while the file picker, a search, a draft or the settings dialog has the user (blur-save must be suppressed). */
  isBusy(): boolean;
}

/**
 * Build the attachment toolbar + preview strip inside an editor element.
 * Enforces a single image per note (adding replaces the existing one).
 *
 * `onRun` is Run: the editor saves the note at once and the picture is
 * generated for the saved note (note-image-generation.ts), so the editor does
 * not stay open looking unfinished through a long wait.
 */
export function createAttachmentZone(
  editorEl: HTMLElement,
  initial: ChatImageAttachment[],
  textarea: HTMLTextAreaElement,
  defaultQuery: string,
  onRun: (text: string) => void
): AttachmentZone {
  let attachment: ChatImageAttachment | null = initial[0] ?? null;
  let picking = false;
  let searching = false;
  let drafting = false;
  let configuring = false;
  let shownUrls = new Set<string>();

  const zone = document.createElement('div');
  zone.className = 'note-attach-zone';

  const preview = document.createElement('div');
  preview.className = 'note-attach-preview';

  const strip = document.createElement('div');
  strip.className = 'note-attach-strip';
  strip.style.display = 'none';

  const toolbar = document.createElement('div');
  toolbar.className = 'note-attach-toolbar';

  const panel = document.createElement('div');
  panel.className = 'note-attach-panel';

  const panelTitle = document.createElement('div');
  panelTitle.className = 'note-attach-panel-title';
  panelTitle.textContent = 'Image';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'note-attach-btn';
  addBtn.textContent = 'Upload';

  const findBtn = document.createElement('button');
  findBtn.type = 'button';
  findBtn.className = 'note-attach-btn';
  findBtn.textContent = 'Search online';

  const generateBtn = document.createElement('button');
  generateBtn.type = 'button';
  generateBtn.className = 'note-attach-btn';
  generateBtn.textContent = 'Generate ▾';

  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'note-attach-btn';
  moreBtn.textContent = 'Show more';
  moreBtn.style.display = 'none';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'note-attach-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.display = 'none';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = NOTE_IMAGE_ACCEPT;
  fileInput.style.display = 'none';

  const errorEl = document.createElement('div');
  errorEl.className = 'note-attach-error';

  const render = (): void => {
    preview.innerHTML = '';
    if (attachment) {
      const img = document.createElement('img');
      img.className = 'note-image';
      img.src = attachment.dataUrl ?? attachment.sourceUrl ?? '';
      img.alt = attachment.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'note-attach-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove image';
      removeBtn.addEventListener('mousedown', (e) => e.preventDefault());
      removeBtn.addEventListener('click', () => {
        attachment = null;
        render();
      });

      const frame = document.createElement('div');
      frame.className = 'note-attach-frame';
      frame.append(img, removeBtn);
      preview.appendChild(frame);
    }
    addBtn.textContent = attachment ? 'Replace from disk' : 'Upload';
    findBtn.textContent = attachment ? 'Search online again' : 'Search online';
  };

  // ---- The strip: search results, or a generation's status --------------

  const showStrip = (controls: { more: boolean; cancel: boolean }): void => {
    strip.style.display = '';
    preview.style.display = 'none';
    addBtn.style.display = 'none';
    findBtn.style.display = 'none';
    generateBtn.style.display = 'none';
    moreBtn.style.display = controls.more ? '' : 'none';
    cancelBtn.style.display = controls.cancel ? '' : 'none';
  };
  const hideStrip = (): void => {
    strip.style.display = 'none';
    preview.style.display = '';
    addBtn.style.display = '';
    findBtn.style.display = '';
    generateBtn.style.display = '';
    moreBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
  };

  const setStripStatus = (text: string): void => {
    strip.innerHTML = '';
    const status = document.createElement('div');
    status.className = 'note-attach-strip-status';
    status.textContent = text;
    strip.appendChild(status);
  };

  const renderResults = (candidates: ImageCandidate[]): void => {
    strip.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'note-attach-strip-grid';
    for (const candidate of candidates) {
      if (candidate.sourceUrl) shownUrls.add(candidate.sourceUrl);
      const thumb = document.createElement('img');
      thumb.className = 'note-attach-thumb';
      thumb.src = candidate.sourceUrl;
      thumb.alt = candidate.title;
      thumb.title = candidate.title;
      thumb.addEventListener('mousedown', (e) => e.preventDefault());
      thumb.addEventListener('click', () => { void pickCandidate(candidate); });
      grid.appendChild(thumb);
    }
    strip.appendChild(grid);
  };

  /**
   * Turn a picked candidate into the note's image. Downloads and stores bytes
   * when the offline setting is on; otherwise keeps a link-only attachment.
   */
  const pickCandidate = async (candidate: ImageCandidate): Promise<void> => {
    setStripStatus('Adding image…');
    const store = getSetting('ai.storeRetrievedImages');
    attachment = await toRetrievedAttachment(candidate, { store });
    shownUrls = new Set();
    hideStrip();
    render();
  };

  const runSearch = async (): Promise<void> => {
    const query = textarea.value.trim() || defaultQuery;
    if (!query) {
      errorEl.textContent = 'Type a description to search for an image.';
      return;
    }
    errorEl.textContent = '';
    searching = true;
    showStrip({ more: true, cancel: true });
    setStripStatus(`Searching for "${query}"…`);
    try {
      const results = await searchImages(query, { exclude: shownUrls });
      if (results.length === 0) {
        setStripStatus('No images found.');
      } else {
        renderResults(results);
      }
    } catch (err) {
      setStripStatus(`Search failed: ${(err as Error).message}`);
    } finally {
      searching = false;
    }
  };

  // ---- Generation ---------------------------------------------------------

  /** Hands the text to the editor, which saves the note and generates for it. */
  const run = (): void => {
    const text = textarea.value.trim() || defaultQuery;
    if (!text) {
      errorEl.textContent = 'Type a description of the picture to generate.';
      return;
    }
    errorEl.textContent = '';
    onRun(text);
  };

  /**
   * Draft: the chat model writes the picture description into the textarea,
   * with the chat's context, composed for the current image settings. The
   * frame is the editor's own box, as it will be at Run.
   */
  const draft = async (): Promise<void> => {
    errorEl.textContent = '';
    drafting = true;
    showStrip({ more: false, cancel: false });
    setStripStatus('Drafting…');
    try {
      textarea.value = await chatSession.draftAside(draftInstruction(textarea.value, measureFrame(editorEl)));
      // The editor sizes the textarea on input; tell it the text changed.
      textarea.dispatchEvent(new Event('input'));
      hideStrip();
      // The draft is usually longer than what was there; bring the text and
      // the control row to the bottom of the panel. The control row, not the
      // editor: an image under it may be taller than the panel.
      panel.scrollIntoView({ block: 'end', behavior: 'smooth' });
    } catch (err) {
      setStripStatus(`Draft failed: ${(err as Error).message}`);
      cancelBtn.style.display = '';
    } finally {
      drafting = false;
      if (editorEl.isConnected) textarea.focus();
    }
  };

  /** Built at open time, in order of use: the gates read the settings as they are now. */
  const generateMenuItems = (): GenerateMenuItem[] => {
    const gap = imageGenerationGap();
    const chatReady = chatSession.hasApiKey();
    return [
      {
        // With an image present the text is an instruction and the image is the
        // starting point; the row says so, since nothing else in the UI does.
        label: attachment ? 'Run on this image' : 'Run',
        enabled: gap === null,
        title: gap ?? (attachment ? 'Changes the image as the text says; remove the image to draw a new one.' : undefined),
        action: run
      },
      {
        label: 'Draft',
        enabled: gap === null && chatReady,
        title: gap ?? (chatReady ? undefined : 'Add an AI provider API key in Settings to draft with the chat model.'),
        action: () => { void draft(); }
      },
      { label: 'Configure…', enabled: true, action: openConfigure }
    ];
  };

  // The dialog takes focus from the textarea; hold the editor open until it
  // closes, then give the focus back so Enter and blur save normally. Save and
  // Run generates straight away with the saved settings.
  const openConfigure = (): void => {
    configuring = true;
    openImageSettingsDialog({
      onClose: () => {
        configuring = false;
        if (editorEl.isConnected) textarea.focus();
      },
      onSaveAndRun: run
    });
  };

  // Opening the native file dialog blurs the textarea. Guard against the
  // editor's blur-save timer closing the editor while the picker is open.
  const beginPick = (): void => {
    picking = true;
    const onWindowFocus = (): void => {
      window.removeEventListener('focus', onWindowFocus);
      // Let the `change` event fire first, then release the guard and
      // restore focus so Enter/blur save the note normally.
      setTimeout(() => {
        picking = false;
        if (editorEl.isConnected) textarea.focus();
      }, 100);
    };
    window.addEventListener('focus', onWindowFocus);
    fileInput.click();
  };

  addBtn.addEventListener('mousedown', (e) => e.preventDefault());
  addBtn.addEventListener('click', beginPick);
  findBtn.addEventListener('mousedown', (e) => e.preventDefault());
  findBtn.addEventListener('click', () => {
    shownUrls = new Set();
    void runSearch();
  });
  generateBtn.addEventListener('mousedown', (e) => e.preventDefault());
  attachGenerateMenu(generateBtn, generateMenuItems);
  moreBtn.addEventListener('mousedown', (e) => e.preventDefault());
  moreBtn.addEventListener('click', () => { void runSearch(); });
  cancelBtn.addEventListener('mousedown', (e) => e.preventDefault());
  cancelBtn.addEventListener('click', () => hideStrip());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    errorEl.textContent = '';
    try {
      attachment = await readImageAttachment(file);
      hideStrip();
      render();
    } catch (err) {
      errorEl.textContent = (err as Error).message;
    }
  });

  toolbar.append(addBtn, findBtn, generateBtn, moreBtn, cancelBtn);
  // The strip (search results, a draft's or search's status) lives inside the
  // Image group, under its toolbar; the image itself comes after the group.
  panel.append(panelTitle, toolbar, strip, errorEl);
  zone.append(panel, preview, fileInput);
  editorEl.appendChild(zone);
  render();

  return {
    getAttachments: () => (attachment ? [attachment] : []),
    isBusy: () => picking || searching || drafting || configuring,
  };
}
