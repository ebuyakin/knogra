/**
 * Image Generation
 * Orchestration: resolve the image provider, compose the prompt, call, re-encode,
 * and build the chat image attachment the note editor stores.
 *
 * One call, independent of the chat: no system prompt, no history, no graph. The
 * text is the user's description (the note's own text), and the technical
 * requirements — the style suffix and the legibility sentence for the chosen
 * detail — are appended here, at the moment of the call, never written into the
 * note (docs/ai/chat-image-generation.md §3).
 */

import type { ChatImageAttachment } from '../../core/chat-types';
import type { ImageBackground, ImageDetail } from '../../config/ai-settings';
import { getSetting } from '../../config';
import { isDebug } from '../../config/debug-flags';
import type { ImageFrame, SourceImage } from './image-provider';
import { createImageProvider } from './image-provider';
import { resolveImageProviderConfig } from './image-provider-resolution';
import { reencodeRasterImage, type ReencodedRasterImage } from './raster-reencoder';

/** The chat text size the panel detail is composed against. */
const PANEL_TEXT_PX = 14;

/**
 * How labels are to be set, so the picture reads as part of the panel: the
 * app's UI font is the system sans stack (global.css --font-sans), which an
 * image model knows as Helvetica or Arial. Said in both detail levels.
 */
const LABEL_TYPEFACE = 'Set every label in a plain sans-serif typeface like Helvetica or Arial, regular weight, dark on light or light on dark, never decorative.';

/**
 * Stored long side by detail: 2x of the panel's display width for 'panel';
 * enough to zoom into for 'fine'. Both sit under the note editor's 4096 px
 * upload cap, and a WebP at either size is well under its 1 MB (§6).
 */
const LONG_SIDE_BY_DETAIL: Record<ImageDetail, number> = {
  panel: 1200,
  fine: 2000
};

const REENCODE_QUALITY = 0.85;

/** What the first caption line can carry before it is cut. */
const NAME_MAX_CHARS = 80;

/** Same format as the note editor's and image search's ids; each writer keeps its own copy. */
function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Draw a note image from `text`, or, when the note already has one (`source`),
 * change that image as `text` says. `frame` is the panel's visible area, which
 * the 'panel' shape follows and the 'panel' legibility sentence names.
 *
 * An edit sends the user's words and the image, nothing else: no style suffix,
 * no background or legibility sentence, no shape. The picture already has its
 * look, and restating it invites the model to redraw rather than change; a
 * stylistic change is the user's to ask for. The result keeps the source's
 * proportions and, if the source was retrieved, its credit.
 *
 * Throws with a user-facing sentence when nothing is configured, the vendor
 * refuses, or no image comes back.
 */
export async function generateNoteImage(
  text: string,
  frame: ImageFrame,
  source?: ChatImageAttachment
): Promise<ChatImageAttachment> {
  const description = text.trim();
  if (!description) throw new Error(source ? 'Say what to change in the image.' : 'Describe the picture to generate.');

  const config = resolveImageProviderConfig();
  if (!config) throw new Error('Choose an image provider in Settings before generating images.');

  const shape = getSetting('ai.imageShape');
  const detail = getSetting('ai.imageDetail');
  const provider = createImageProvider(config);
  // A vendor that cannot omit the background gets the next best thing, a dark one.
  const wanted = getSetting('ai.imageBackground');
  const background: ImageBackground = wanted === 'transparent' && !provider.supportsTransparency ? 'dark' : wanted;
  const prompt = source ? description : composePrompt(description, detail, background, frame);
  const sourceImage = source ? await sourceBytes(source) : undefined;

  if (isDebug('d_image')) {
    console.log(`[image-generation] ${config.type} ${config.model}, ${source ? 'edit' : 'draw'}, ${shape}, ${detail}, ${background}, frame ${frame.width}x${frame.height}`);
    console.log('[image-generation] prompt as sent:\n' + prompt);
  }

  const image = await provider.generateImage({ prompt, shape, detail, background, frame, source: sourceImage });
  const keepAlpha = source ? source.mimeType !== 'image/jpeg' : background === 'transparent';
  const encoded = await reencodeForStorage(image.bytes, detail, keepAlpha);

  if (isDebug('d_image')) {
    console.log(`[image-generation] ${image.mimeType} ${Math.round(image.bytes.size / 1024)} KB → ${encoded.mimeType} ${encoded.width}x${encoded.height} ${Math.round(encoded.byteLength / 1024)} KB`);
  }

  return {
    id: generateAttachmentId(),
    type: 'image',
    origin: 'generated',
    mimeType: encoded.mimeType,
    name: description.length > NAME_MAX_CHARS ? `${description.slice(0, NAME_MAX_CHARS)}…` : description,
    width: encoded.width,
    height: encoded.height,
    dataUrl: encoded.dataUrl,
    prompt,
    model: config.model,
    // A changed retrieved image is still that image's work; its credit stays.
    ...(source?.attribution ? { attribution: source.attribution } : {})
  };
}

/** The stored bytes, or the linked ones for a retrieved image kept as a link; `fetch` reads data URLs too. */
async function sourceBytes(source: ChatImageAttachment): Promise<SourceImage> {
  const url = source.dataUrl ?? source.sourceUrl;
  if (!url) throw new Error('The note\'s image has no bytes to edit.');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not read the note\'s image.');
  const bytes = await response.blob();
  return { bytes, mimeType: bytes.type || source.mimeType };
}

// ============================================================================
// PROMPT
// ============================================================================

/**
 * The description first, the style suffix, then the sentences the settings
 * decide: the background and how the picture will be read. The style comes from
 * the user's setting; the rest is composed here because it depends on the
 * settings and on the frame measured at the call.
 */
function composePrompt(description: string, detail: ImageDetail, background: ImageBackground, frame: ImageFrame): string {
  const style = getSetting('ai.imageOmitStyle') ? '' : getSetting('ai.imageStyle').trim();
  return [description, style, backgroundSentence(background), legibilitySentence(detail, frame)]
    .filter(part => part.length > 0)
    .join('\n\n');
}

/** The panel's own colour, so a dark picture sits in it with the least visible edge. */
const PANEL_BACKGROUND_HEX = '#0d1117';

function backgroundSentence(background: ImageBackground): string {
  switch (background) {
    case 'none':
      return '';
    case 'light':
      return 'Plain, uniform, pale off-white background with no texture or gradient.';
    case 'dark':
      return `Plain, uniform, very dark background close to ${PANEL_BACKGROUND_HEX}, with light lines and light labels for contrast.`;
    case 'transparent':
      return 'Fully transparent background with nothing drawn behind the subject; use light lines and light labels, as the picture will sit on a dark surface.';
  }
}

/**
 * Models set "labels" large by default and treat a floor as a target, so the
 * size is stated as a small fraction with the drawing declared the main thing.
 */
function legibilitySentence(detail: ImageDetail, frame: ImageFrame): string {
  if (detail === 'fine') {
    return `The picture will be viewed enlarged in an image viewer, so it may carry fine detail and many labelled parts; keep every label legible at full size but small, the drawing is the main thing. ${LABEL_TYPEFACE}`;
  }
  return `The picture will be viewed at about ${frame.width} by ${frame.height} screen pixels beside ${PANEL_TEXT_PX} px text, without zooming. Few labelled parts; the drawing is the main thing and the labels are small, about one eightieth of the image height, like fine caption text. Thick lines, generous spacing. ${LABEL_TYPEFACE}`;
}

// ============================================================================
// BYTES
// ============================================================================

/**
 * WebP at the detail's long side. A browser that cannot encode WebP hands back
 * PNG, which at these sizes can approach a megabyte; JPEG is the fallback every
 * browser produces, so the stored image is always lossy and small — except for
 * a transparent picture, whose alpha JPEG would flatten to black, so it keeps
 * the PNG.
 */
async function reencodeForStorage(bytes: Blob, detail: ImageDetail, keepAlpha: boolean): Promise<ReencodedRasterImage> {
  const maxLongSide = LONG_SIDE_BY_DETAIL[detail];
  const webp = await reencodeRasterImage(bytes, { maxLongSide, mimeType: 'image/webp', quality: REENCODE_QUALITY });
  if (webp.mimeType === 'image/webp' || keepAlpha) return webp;
  return reencodeRasterImage(bytes, { maxLongSide, mimeType: 'image/jpeg', quality: REENCODE_QUALITY });
}
