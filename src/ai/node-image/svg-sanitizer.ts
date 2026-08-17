/**
 * Trust boundary for node images.
 *
 * SVG is executable content: it can carry `<script>`, `on*` handlers,
 * `<foreignObject>` with arbitrary HTML, and references to remote documents.
 * Every entry point is untrusted — uploads and pastes obviously, and model
 * output no less so, since it is remote content shaped by a user-supplied
 * prompt. Nothing is stored in `nodeImages` without passing through here, and
 * nothing is re-checked at render time.
 *
 * See docs/nodes-svg-images.md §7.
 */

import { getSetting } from '../../config';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

/** Elements removed wherever they appear, with their subtrees. */
const FORBIDDEN_ELEMENTS = new Set(['script', 'foreignobject']);

export type SvgRejectionReason =
  | 'empty'
  | 'too-large'
  | 'entity-declaration'
  | 'not-xml'
  | 'not-svg'
  | 'no-viewbox'
  | 'embedded-image';

export interface SvgSanitizedResult {
  type: 'sanitized';
  /** Serialized SVG source, safe to store and to render as a data URI. */
  svg: string;
  /** viewBox width / height. */
  aspectRatio: number;
  byteLength: number;
}

export interface SvgRejectedResult {
  type: 'rejected';
  reason: SvgRejectionReason;
  /** User-facing explanation; the caller still holds the raw source. */
  message: string;
}

export type SvgSanitizeResult = SvgSanitizedResult | SvgRejectedResult;

/**
 * Validate and clean untrusted SVG source.
 *
 * Rejects source that does not parse as XML, is not rooted in `<svg>`, carries
 * no usable `viewBox`, embeds another image, or exceeds `node.imageMaxKB`.
 * Strips scripting, embedded HTML, and every reference that leaves the
 * document. Also drops the root `width`/`height`, so a stored image is
 * dimension-neutral and sized by its size class alone (§5.2).
 */
export function sanitizeSvg(source: string): SvgSanitizeResult {
  const trimmed = source.trim();
  if (!trimmed) {
    return rejected('empty', 'No SVG source was provided.');
  }

  const maxBytes = getSetting('node.imageMaxKB') * 1024;

  // Checked before parsing as well as after: sanitizing only removes content,
  // so oversized input is oversized material, and a huge payload should not be
  // expanded into a DOM just to be measured.
  const sourceBytes = byteLength(trimmed);
  if (sourceBytes > maxBytes) {
    return rejected('too-large', sizeMessage(sourceBytes, maxBytes));
  }

  // Entity declarations are checked on the text, because DOMParser expands them
  // during the parse that would otherwise be our first look at the content.
  if (/<!ENTITY/i.test(trimmed)) {
    return rejected('entity-declaration', 'The SVG declares XML entities, which are not allowed.');
  }

  const parsed = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    return rejected('not-xml', 'The SVG source is not well-formed XML.');
  }

  const root = parsed.documentElement;
  if (localName(root) !== 'svg') {
    return rejected('not-svg', `The source is rooted in <${localName(root)}> rather than <svg>.`);
  }

  const aspectRatio = readViewBoxAspectRatio(root);
  if (aspectRatio === null) {
    return rejected('no-viewbox', 'The SVG has no usable viewBox, so its proportions cannot be determined.');
  }

  const rejection = sanitizeElement(root);
  if (rejection) {
    return rejected(rejection, 'The SVG embeds another image. Node images must be self-contained vector drawings.');
  }

  // A pasted fragment may omit the namespace; without it the data URI renders
  // as nothing.
  if (root.namespaceURI !== SVG_NAMESPACE) {
    root.setAttribute('xmlns', SVG_NAMESPACE);
  }
  root.removeAttribute('width');
  root.removeAttribute('height');

  const svg = new XMLSerializer().serializeToString(root);
  const sanitizedBytes = byteLength(svg);
  if (sanitizedBytes > maxBytes) {
    return rejected('too-large', sizeMessage(sanitizedBytes, maxBytes));
  }

  return { type: 'sanitized', svg, aspectRatio, byteLength: sanitizedBytes };
}

/**
 * Clean one element in place and recurse into its children. Returns a rejection
 * reason when the subtree holds something that cannot be cleaned away, in which
 * case the caller discards the whole document.
 */
function sanitizeElement(element: Element): SvgRejectionReason | null {
  // Raster is excluded outright, and an <image> that is not raster is a nested
  // document this pass has not inspected. Either way it does not belong.
  if (localName(element) === 'image') return 'embedded-image';

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith('on') || (isHrefName(name) && !isSameDocumentReference(attribute.value))) {
      element.removeAttributeNode(attribute);
    }
  }

  for (const child of Array.from(element.children)) {
    const name = localName(child);
    if (FORBIDDEN_ELEMENTS.has(name)) {
      child.remove();
      continue;
    }
    // A <use> whose target has just been stripped points at nothing, so the
    // element goes with it rather than rendering as a hole.
    if (name === 'use' && !isSameDocumentReference(readHref(child))) {
      child.remove();
      continue;
    }
    const rejection = sanitizeElement(child);
    if (rejection) return rejection;
  }

  return null;
}

/** viewBox width / height, or null when the attribute is missing or unusable. */
function readViewBoxAspectRatio(root: Element): number | null {
  const viewBox = root.getAttribute('viewBox');
  if (!viewBox) return null;

  const values = viewBox.trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || values.some(value => !Number.isFinite(value))) return null;

  const [, , width, height] = values;
  if (width <= 0 || height <= 0) return null;

  return width / height;
}

function readHref(element: Element): string | null {
  return element.getAttribute('href')
    ?? element.getAttributeNS(XLINK_NAMESPACE, 'href')
    ?? element.getAttribute('xlink:href');
}

/** Only same-document fragment references survive; everything else leaves the document. */
function isSameDocumentReference(value: string | null): boolean {
  return value !== null && value.trim().startsWith('#');
}

function isHrefName(lowercaseName: string): boolean {
  return lowercaseName === 'href' || lowercaseName === 'xlink:href';
}

function localName(element: Element): string {
  return element.localName.toLowerCase();
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function sizeMessage(actualBytes: number, maxBytes: number): string {
  return `The SVG is ${formatKilobytes(actualBytes)} KB, above the ${formatKilobytes(maxBytes)} KB limit for node images.`;
}

function formatKilobytes(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

function rejected(reason: SvgRejectionReason, message: string): SvgRejectedResult {
  return { type: 'rejected', reason, message };
}
