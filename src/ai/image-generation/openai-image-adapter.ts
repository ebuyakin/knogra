/**
 * OpenAI Image Adapter
 * Implementation of ImageProvider for the OpenAI Images API.
 *
 * Endpoints: https://api.openai.com/v1/images/generations to draw,
 * https://api.openai.com/v1/images/edits to change an existing image.
 *
 * The Images API takes the prompt as written and returns base64 bytes in one
 * call; the Responses API's image_generation tool would put a text model in
 * front of it to rewrite the prompt, which is Draft's job here, not the
 * vendor's (docs/ai/chat-image-generation.md §3; vendor-capabilities §2.1).
 * The size is an exact width and height, both multiples of 16, so the shape
 * follows the panel precisely rather than snapping to a list. An edit sends
 * no size: the result keeps the source's proportions.
 */

import type { ImageDetail } from '../../config/ai-settings';
import type { GeneratedImage, ImageProvider, ImageRequest, SourceImage } from './image-provider';
import { blobFromBase64, targetAspect } from './adapter-helpers';
import { ProviderTimeoutError, fetchWithTimeout } from '../providers/request-timeout';

const GENERATIONS_URL = 'https://api.openai.com/v1/images/generations';
const EDITS_URL = 'https://api.openai.com/v1/images/edits';

/** Long side of the requested image by detail: about 1K for the panel, 1.5K for the viewer. */
const LONG_SIDE_BY_DETAIL: Record<ImageDetail, number> = {
  panel: 1024,
  fine: 1536
};

const QUALITY_BY_DETAIL: Record<ImageDetail, string> = {
  panel: 'medium',
  fine: 'high'
};

/** The vendor's constraints on a custom size: multiples of 16, within a pixel budget. */
const SIZE_STEP = 16;
const MIN_PIXELS = 655_360;
const MAX_PIXELS = 8_294_400;

const OUTPUT_COMPRESSION = 80;

interface ImagesResponse {
  data?: { b64_json?: string }[];
  error?: { code?: string; message?: string };
}

export class OpenAIImageAdapter implements ImageProvider {
  readonly name = 'openai';
  /** `background: 'transparent'` with webp or png output, on gpt-image-2 and later. */
  readonly supportsTransparency = true;

  #apiKey: string;
  #model: string;

  constructor(apiKey: string, model: string) {
    this.#apiKey = apiKey;
    this.#model = model;
  }

  async generateImage(request: ImageRequest): Promise<GeneratedImage> {
    const init = request.source
      ? this.#editInit(request, request.source)
      : this.#generationInit(request);

    let response: Response;
    try {
      response = await fetchWithTimeout(request.source ? EDITS_URL : GENERATIONS_URL, init, 'OpenAI');
    } catch (error) {
      if (error instanceof ProviderTimeoutError) throw error;

      // OpenAI omits CORS headers on its auth failures, so the browser blocks the
      // body and a bad key arrives here as an unreadable network error.
      throw new Error(
        'Could not reach OpenAI. This usually means the API key is invalid — check it in Settings.'
      );
    }

    const data = await response.json() as ImagesResponse;

    if (!response.ok) {
      throw new Error(errorMessage(response.status, data.error));
    }

    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no image.');

    return { bytes: blobFromBase64(b64, 'image/webp'), mimeType: 'image/webp' };
  }

  /** Generations: a JSON body with an exact size from the shape. */
  #generationInit(request: ImageRequest): RequestInit {
    const { width, height } = sizeFor(targetAspect(request.shape, request.frame), LONG_SIDE_BY_DETAIL[request.detail]);

    const body: Record<string, unknown> = {
      model: this.#model,
      prompt: request.prompt,
      n: 1,
      size: `${width}x${height}`,
      quality: QUALITY_BY_DETAIL[request.detail],
      output_format: 'webp',
      output_compression: OUTPUT_COMPRESSION
    };
    if (request.background === 'transparent') {
      body.background = 'transparent';
    }

    return {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.#apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    };
  }

  /**
   * Edits: multipart, the image as a file part. No size, so the result keeps
   * the source's proportions; no Content-Type header, so the browser writes
   * the multipart boundary itself.
   */
  #editInit(request: ImageRequest, source: SourceImage): RequestInit {
    const form = new FormData();
    form.append('model', this.#model);
    form.append('prompt', request.prompt);
    form.append('n', '1');
    form.append('quality', QUALITY_BY_DETAIL[request.detail]);
    form.append('output_format', 'webp');
    form.append('output_compression', String(OUTPUT_COMPRESSION));
    form.append('image', source.bytes, `source.${extensionOf(source.mimeType)}`);

    return {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.#apiKey}` },
      body: form
    };
  }
}

function extensionOf(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

/**
 * A width and height with the given aspect and long side, rounded to the
 * vendor's step, then grown or shrunk uniformly if the pixel count falls
 * outside the budget. Aspect is clamped to the vendor's 1:3 to 3:1.
 */
function sizeFor(aspect: number, longSide: number): { width: number; height: number } {
  const clamped = Math.min(3, Math.max(1 / 3, aspect));
  let width = clamped >= 1 ? longSide : longSide * clamped;
  let height = clamped >= 1 ? longSide / clamped : longSide;

  const pixels = width * height;
  if (pixels < MIN_PIXELS || pixels > MAX_PIXELS) {
    const factor = Math.sqrt(Math.min(MAX_PIXELS, Math.max(MIN_PIXELS, pixels)) / pixels);
    width *= factor;
    height *= factor;
  }

  return { width: roundToStep(width), height: roundToStep(height) };
}

function roundToStep(value: number): number {
  return Math.max(SIZE_STEP, Math.round(value / SIZE_STEP) * SIZE_STEP);
}

function errorMessage(status: number, error: ImagesResponse['error']): string {
  if (error?.code === 'moderation_blocked') {
    return 'The image model declined this prompt.';
  }
  if (error?.message) return `OpenAI API error ${status}: ${error.message}`;
  return `OpenAI API error ${status}.`;
}
