/**
 * Gemini Image Adapter
 * Implementation of ImageProvider for Google's image models (the Nano Banana
 * family) through `generateContent` with image output.
 *
 * `generateContent` is labelled legacy by Google but stays supported, and it is
 * what the chat adapter already uses; the image models are reachable through it
 * (docs/ai/vendor-capabilities.md §2.2). The reply carries the picture as an
 * `inlineData` part, base64 PNG.
 */

import { FinishReason, GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse, ImageConfig, Part } from '@google/genai';
import type { GeneratedImage, ImageProvider, ImageRequest, SourceImage } from './image-provider';
import { base64FromBlob, blobFromBase64, nearestAspectRatio, targetAspect } from './adapter-helpers';
import { ProviderTimeoutError, createTimeoutSignal } from '../providers/request-timeout';

/** The ratios the installed SDK documents for `imageConfig.aspectRatio`. */
const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'] as const;

export class GeminiImageAdapter implements ImageProvider {
  readonly name = 'gemini';
  /** generateContent has no background parameter; the reply is an opaque PNG. */
  readonly supportsTransparency = false;

  #client: GoogleGenAI;
  #model: string;

  constructor(apiKey: string, model: string) {
    this.#client = new GoogleGenAI({ apiKey });
    this.#model = model;
  }

  async generateImage(request: ImageRequest): Promise<GeneratedImage> {
    // An edit carries the image as a part before the instruction and names no
    // aspect, so the result keeps the source's proportions.
    const contents = request.source
      ? [{ role: 'user', parts: [await imagePart(request.source), { text: request.prompt }] }]
      : request.prompt;
    const imageConfig: ImageConfig = { imageSize: request.detail === 'fine' ? '2K' : '1K' };
    if (!request.source) {
      imageConfig.aspectRatio = nearestAspectRatio(targetAspect(request.shape, request.frame), ASPECT_RATIOS);
    }

    const { signal, done } = createTimeoutSignal();
    let response: GenerateContentResponse;
    try {
      response = await this.#client.models.generateContent({
        model: this.#model,
        contents,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig,
          abortSignal: signal
        }
      });
    } catch (error) {
      if (signal.aborted) throw new ProviderTimeoutError('Gemini');
      throw error;
    } finally {
      done();
    }

    const image = findImagePart(response.candidates?.[0]?.content?.parts ?? []);
    if (!image) throw new Error(noImageMessage(response));

    return {
      bytes: blobFromBase64(image.data, image.mimeType),
      mimeType: image.mimeType
    };
  }
}

async function imagePart(source: SourceImage): Promise<Part> {
  return { inlineData: { mimeType: source.mimeType, data: await base64FromBlob(source.bytes) } };
}

function findImagePart(parts: Part[]): { data: string; mimeType: string } | null {
  for (const part of parts) {
    const data = part.inlineData?.data;
    const mimeType = part.inlineData?.mimeType;
    if (data && mimeType?.startsWith('image/')) return { data, mimeType };
  }
  return null;
}

/** A reply without a picture usually says why; surface that rather than a bare failure. */
function noImageMessage(response: GenerateContentResponse): string {
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) return `Gemini declined this prompt (${blockReason}).`;

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== FinishReason.STOP) return `Gemini stopped without an image (${finishReason}).`;

  const text = response.text?.trim();
  if (text) return `Gemini answered with text instead of an image: ${text.slice(0, 200)}`;

  return 'Gemini returned no image.';
}
