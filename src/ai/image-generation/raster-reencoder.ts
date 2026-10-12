/**
 * reencodeRasterImage — scales a raster image down and re-encodes it in the
 * browser, returning a data URL ready to store.
 *
 * Image models return a 1K PNG of one to two megabytes; the chat panel shows a
 * few hundred CSS pixels of it. Re-encoding to WebP at a bounded long side
 * takes that to one or two hundred kilobytes before it reaches IndexedDB and
 * the workspace file (docs/ai/chat-image-generation.md §6).
 *
 * Pure over its input: no app imports, no DOM left behind. Applies no size
 * caps of its own — those are the caller's rules about what it stores.
 */

export type RasterMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface RasterReencodeOptions {
  /** Longest side of the result, in pixels. A smaller source keeps its size; nothing is enlarged. */
  maxLongSide: number;
  /**
   * Requested encoding. A browser that cannot encode it falls back to PNG
   * silently, so the result's `mimeType` is read from what was produced.
   */
  mimeType: RasterMimeType;
  /** 0 to 1; lossy formats only, ignored for PNG. */
  quality: number;
}

export interface ReencodedRasterImage {
  dataUrl: string;
  /** What the browser actually encoded, which may differ from the request. */
  mimeType: RasterMimeType;
  width: number;
  height: number;
  byteLength: number;
}

export async function reencodeRasterImage(
  source: Blob,
  options: RasterReencodeOptions
): Promise<ReencodedRasterImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, options.maxLongSide);
    const encoded = await drawToBlob(bitmap, width, height, options);
    const dataUrl = await blobToDataUrl(encoded);
    return {
      dataUrl,
      mimeType: isRasterMimeType(encoded.type) ? encoded.type : 'image/png',
      width,
      height,
      byteLength: encoded.size
    };
  } finally {
    bitmap.close();
  }
}

/** The source's dimensions scaled so the longer side is at most `maxLongSide`; never scaled up. */
function fitWithin(width: number, height: number, maxLongSide: number): { width: number; height: number } {
  const longSide = Math.max(width, height);
  if (longSide <= maxLongSide) return { width, height };
  const factor = maxLongSide / longSide;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor))
  };
}

function drawToBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  options: RasterReencodeOptions
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return Promise.reject(new Error('Could not get a 2D canvas context to re-encode the image.'));
  }
  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('The browser could not encode the image.'))),
      options.mimeType,
      options.quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the encoded image.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function isRasterMimeType(type: string): type is RasterMimeType {
  return type === 'image/png' || type === 'image/jpeg' || type === 'image/webp';
}
