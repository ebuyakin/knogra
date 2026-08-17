/**
 * Image Node Design
 * An SVG pictogram alone in the node box.
 *
 * Also holds the renderer shared with `image-caption-node`, which is the same
 * drawing with a title bar above the image.
 *
 * The image is nested as SVG inside the node's own SVG — the technique
 * `equation-compact-node` already uses for MathJax output, with less work,
 * because the source needs no typesetting pass.
 * See docs/nodes-svg-images.md §5.1, §5.2.
 */

import type { Node, NodeImageId } from '../../core/main-types';
import type { NodeImageSizeClass } from '../../core/node-image-types';
import type { ColorTheme, CytoscapeNodeStyle } from '../../core/style-types'
import type { ColorOverrides, VisualEffects, GradientConfig, AreaColors } from '../../core/design-types'
import { getSetting } from '../../config';
import { getShadowPadding, buildShadowFilter } from './shadow-utils'
import { nodeImageCache, type CachedNodeImage } from '../../storage/node-image-cache'
import { nodeImagePaletteFromTheme } from '../node-image-palette'
import { resolveImageColours } from '../node-image-tokens'
import { getDefaultNodeStyle } from './default-node'

export interface ImageNodeParams {
  hPadding?: number;            // Horizontal padding each side (default: 14)
  vPadding?: number;            // Vertical padding each side (default: 14)
  borderRadius?: number;        // Corner radius (default: 6)
  minWidth?: number;            // Minimum node width (default: 60)
  imageScale?: number;          // Reserved: image size multiplier, no control exposes it yet (default: 1)
  aspectRatio?: number;         // Node aspect ratio, width/height — used only when fixedAspect
  fixedAspect?: boolean;        // true = hold aspectRatio; false = follow the image (default)
  topHeight?: number;           // Title bar height, caption variant only (derived from font size)
  titleFontSize?: number;       // Title font size, caption variant only (default: 11)
  colorOverrides?: ColorOverrides;
  effects?: VisualEffects;
  gradient?: GradientConfig;
  areaColors?: AreaColors;      // Per-section color overrides (top, middle)
}

// =============================================================================
// LAYOUT CONSTANTS
//
// Exported because the Design tab's layout controls are declared against them
// in `design-registry.ts`: a control whose default is copied by hand drifts
// from the design it configures.
// =============================================================================

export const IMAGE_DEFAULT_H_PADDING = 14;
export const IMAGE_DEFAULT_V_PADDING = 14;
export const IMAGE_DEFAULT_ASPECT = 1;
export const IMAGE_DEFAULT_TITLE_FONT_SIZE = 11;

const DEFAULT_MIN_WIDTH = 60;
const TITLE_LINE_HEIGHT_FACTOR = 1.4;
/** Title bar height for the default font size; scales with it from there. */
const TITLE_BAR_MIN_HEIGHT = 30;
const TITLE_BAR_HEIGHT_FACTOR = 2.2;
/** A fixed aspect ratio is honoured only down to this much image. */
const MIN_IMAGE_EXTENT = 12;

// =============================================================================
// HELPERS (color, gradient, effects — same pattern as equation-compact-node)
// =============================================================================

function resolveColor(override: string | undefined, themeColor: string): string {
  return override ?? themeColor;
}

function buildGradientDef(
  gradient: GradientConfig,
  bgColor: string,
  bgAltColor: string
): { def: string; fill: string } {
  if (gradient.type === 'solid') {
    return { def: '', fill: bgColor };
  }

  // Prefixed so the definition cannot collide with an id inside the embedded image.
  const id = 'ni-grad';
  const stops = gradient.stops ?? [
    { offset: 0, color: bgColor },
    { offset: 1, color: bgAltColor }
  ];
  const stopsXml = stops.map(s => {
    const opacity = s.opacity !== undefined ? ` stop-opacity="${s.opacity}"` : '';
    return `<stop offset="${s.offset * 100}%" stop-color="${s.color}"${opacity}/>`;
  }).join('\n        ');

  if (gradient.type === 'linear') {
    const angle = gradient.angle ?? 180;
    const rad = (angle - 90) * Math.PI / 180;
    const x1 = 50 - Math.cos(rad) * 50;
    const y1 = 50 - Math.sin(rad) * 50;
    const x2 = 50 + Math.cos(rad) * 50;
    const y2 = 50 + Math.sin(rad) * 50;
    return {
      def: `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">\n        ${stopsXml}\n      </linearGradient>`,
      fill: `url(#${id})`
    };
  }

  return {
    def: `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">\n      ${stopsXml}\n    </radialGradient>`,
    fill: `url(#${id})`
  };
}

function buildEffectsFilter(
  themeBg: { brightness: number; saturation: number; hue: number },
  effects?: VisualEffects
): { def: string; filter: string } {
  const brightness = effects?.brightness ?? themeBg.brightness;
  const saturation = effects?.saturation ?? themeBg.saturation;
  const hue = effects?.hue ?? themeBg.hue;

  if (brightness === 1 && saturation === 1 && hue === 0) {
    return { def: '', filter: '' };
  }

  const id = 'ni-fx';
  const filters: string[] = [];
  if (hue !== 0) filters.push(`<feColorMatrix type="hueRotate" values="${hue}"/>`);
  if (saturation !== 1) filters.push(`<feColorMatrix type="saturate" values="${saturation}"/>`);
  if (brightness !== 1) {
    filters.push(`<feComponentTransfer>
      <feFuncR type="linear" slope="${brightness}"/>
      <feFuncG type="linear" slope="${brightness}"/>
      <feFuncB type="linear" slope="${brightness}"/>
    </feComponentTransfer>`);
  }
  if (filters.length === 0) return { def: '', filter: '' };

  return {
    def: `<filter id="${id}">${filters.join('')}</filter>`,
    filter: `filter="url(#${id})"`
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// =============================================================================
// SIZING
// =============================================================================

/**
 * Base render width for a size class, in pixels.
 *
 * A display concern only: generation is told nothing about it, because an SVG
 * has no size and the same image can be shown at several. See
 * `ai/node-image/prompt/technique-rules.ts`.
 */
function resolveNodeImageWidth(sizeClass: NodeImageSizeClass): number {
  switch (sizeClass) {
    case 'small': return getSetting('node.imageSizeSmall');
    case 'large': return getSetting('node.imageSizeLarge');
    default: return getSetting('node.imageSizeMedium');
  }
}

function resolvePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

interface ImageBox {
  contentHeight: number;
  imageWidth: number;
  imageHeight: number;
}

/** Free aspect: the node is as tall as the image plus its vertical padding. */
function fitToImage(
  nominalImageWidth: number,
  imageAspect: number,
  topHeight: number,
  vPadding: number
): ImageBox {
  const imageHeight = nominalImageWidth / imageAspect;
  return {
    contentHeight: topHeight + imageHeight + vPadding * 2,
    imageWidth: nominalImageWidth,
    imageHeight
  };
}

/**
 * Fixed aspect: the node holds the requested width/height ratio and the image
 * is contained in what the title bar and padding leave.
 *
 * Contained, never upscaled past the size class: the class is the author's
 * stated size for the image, and a node shape that happens to leave more room
 * is not a request for a bigger picture. A ratio so extreme that nothing is
 * left is honoured only down to `MIN_IMAGE_EXTENT`, which keeps the node
 * visible rather than emitting a zero-height viewport.
 */
function fitToAspect(
  aspectRatio: number | undefined,
  contentWidth: number,
  topHeight: number,
  padding: { h: number; v: number },
  image: { nominalImageWidth: number; imageAspect: number }
): ImageBox {
  const targetAspect = resolvePositiveNumber(aspectRatio, IMAGE_DEFAULT_ASPECT);
  const contentHeight = Math.max(
    contentWidth / targetAspect,
    topHeight + padding.v * 2 + MIN_IMAGE_EXTENT
  );

  const regionWidth = contentWidth - padding.h * 2;
  const regionHeight = contentHeight - topHeight - padding.v * 2;
  const imageWidth = Math.min(
    image.nominalImageWidth,
    regionWidth,
    regionHeight * image.imageAspect
  );

  return { contentHeight, imageWidth, imageHeight: imageWidth / image.imageAspect };
}

// =============================================================================
// SVG RENDERING
// =============================================================================

function renderSVG(
  titleText: string,
  image: CachedNodeImage,
  params: ImageNodeParams,
  theme: ColorTheme,
  showTitle: boolean
): { svg: string; width: number; height: number } {
  const hPadding = params.hPadding ?? IMAGE_DEFAULT_H_PADDING;
  const vPadding = params.vPadding ?? IMAGE_DEFAULT_V_PADDING;
  const borderRadius = params.borderRadius ?? 6;
  const minWidth = params.minWidth ?? DEFAULT_MIN_WIDTH;
  const titleFontSize = params.titleFontSize ?? IMAGE_DEFAULT_TITLE_FONT_SIZE;
  // Derived, so raising the font size widens the bar that holds it rather than
  // pushing the text out of a bar frozen at the default size.
  const topHeight = params.topHeight ?? Math.max(
    TITLE_BAR_MIN_HEIGHT,
    titleFontSize * TITLE_BAR_HEIGHT_FACTOR
  );

  // Shadow
  const shadow = theme.node.shadow;
  const shadowPadding = getShadowPadding(shadow);
  const { def: shadowDef, id: shadowId } = buildShadowFilter(shadow);

  // Colors
  const bgColor = resolveColor(params.colorOverrides?.background, theme.node.background.color);
  const bgAltColor = resolveColor(params.colorOverrides?.backgroundAlt, theme.node.backgroundAlt.color);
  const textColor = resolveColor(params.colorOverrides?.text, theme.node.text.color);

  const topColor = params.areaColors?.top ?? bgAltColor;
  const bodyColor = params.areaColors?.middle ?? bgColor;

  const gradient = params.gradient ?? theme.node.background.gradient ?? { type: 'solid' as const };
  const { def: gradientDef, fill: bodyFill } = buildGradientDef(gradient, bodyColor, bgAltColor);

  // Effects
  const themeBg = theme.node.background as { brightness: number; saturation: number; hue: number; opacity: number };
  const { def: filterDef, filter } = buildEffectsFilter(themeBg, params.effects);
  const bgOpacity = params.effects?.backgroundOpacity ?? themeBg.opacity;
  const bgAltOpacity = params.effects?.backgroundAltOpacity ?? (theme.node.backgroundAlt as { opacity: number }).opacity;
  // The image is the node's content, so it follows content opacity exactly as
  // the rendered equation does in `equation-compact-node`. This is what makes
  // quiz mode hide it (§5.4).
  const contentOpacity = params.effects?.textOpacity ?? (theme.node.text as { opacity: number }).opacity;

  // The width the size class promises, before the node's own scale applies.
  const imageScale = resolvePositiveNumber(params.imageScale, 1);
  const nominalImageWidth = resolveNodeImageWidth(image.sizeClass) * imageScale;

  // Title bar — grows to fit user-entered newlines, as in equation-compact-node.
  const titleLines = showTitle ? titleText.split('\n') : [];
  const titleLineHeight = titleFontSize * TITLE_LINE_HEIGHT_FACTOR;
  const effectiveTopHeight = showTitle ? topHeight + (titleLines.length - 1) * titleLineHeight : 0;
  const titleWidth = showTitle
    ? Math.max(...titleLines.map(line => line.length)) * titleFontSize * 0.55
    : 0;

  // Width is authoritative in both modes; only the height rule differs.
  const contentWidth = Math.max(
    nominalImageWidth + hPadding * 2,
    titleWidth + hPadding * 2,
    minWidth
  );

  const { contentHeight, imageWidth, imageHeight } = params.fixedAspect
    ? fitToAspect(params.aspectRatio, contentWidth, effectiveTopHeight, { h: hPadding, v: vPadding }, {
        nominalImageWidth,
        imageAspect: image.aspectRatio
      })
    : fitToImage(nominalImageWidth, image.aspectRatio, effectiveTopHeight, vPadding);

  const svgWidth = contentWidth + shadowPadding;
  const svgHeight = contentHeight + shadowPadding;

  // Centred in the region below the title bar. With a free aspect that region
  // is exactly the image plus its vertical padding, so this reduces to the
  // padded position and the two modes need no separate placement rule.
  const imageX = (contentWidth - imageWidth) / 2;
  const imageY = effectiveTopHeight + (contentHeight - effectiveTopHeight - imageHeight) / 2;

  // Paths
  const r = borderRadius;
  const w = contentWidth;
  const h = contentHeight;

  const roundedRectPath = `M 0,${r} Q 0,0 ${r},0 L ${w - r},0 Q ${w},0 ${w},${r} L ${w},${h - r} Q ${w},${h} ${w - r},${h} L ${r},${h} Q 0,${h} 0,${h - r} Z`;
  const topPath = `M 0,${r} Q 0,0 ${r},0 L ${w - r},0 Q ${w},0 ${w},${r} L ${w},${effectiveTopHeight} L 0,${effectiveTopHeight} Z`;
  const bodyPath = `M 0,${effectiveTopHeight} L ${w},${effectiveTopHeight} L ${w},${h - r} Q ${w},${h} ${w - r},${h} L ${r},${h} Q 0,${h} 0,${h - r} Z`;

  const backgroundXml = showTitle
    ? `<path d="${topPath}" fill="${topColor}" opacity="${bgAltOpacity}"/>
          <path d="${bodyPath}" fill="${bodyFill}" opacity="${bgOpacity}"/>`
    : `<path d="${roundedRectPath}" fill="${bodyFill}" opacity="${bgOpacity}"/>`;

  const titleXml = showTitle
    ? `<text
          x="${hPadding}"
          y="${titleLineHeight * 0.75 + (topHeight - titleLineHeight) / 2}"
          fill="${textColor}"
          font-size="${titleFontSize}"
          font-weight="normal"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        >${titleLines.map((line, i) => `<tspan x="${hPadding}" dy="${i === 0 ? 0 : titleLineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>`
    : '';

  // The stored image carries a viewBox and no width/height (stripped at ingest),
  // so it fills this wrapper viewport exactly and needs no string surgery.
  const svg = `
    <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${gradientDef}
        ${filterDef}
        ${shadowDef}
      </defs>

      <!-- Background with shadow and effects -->
      <g filter="url(#${shadowId})">
        <g ${filter}>
          ${backgroundXml}
        </g>
      </g>

      <!-- Content -->
      <g opacity="${contentOpacity}">
        ${titleXml}
        <svg x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}">
          ${resolveImageColours(image, nodeImagePaletteFromTheme(theme, 'unspecified'))}
        </svg>
      </g>
    </svg>
  `;

  return { svg, width: svgWidth, height: svgHeight };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Shared entry point for both image designs.
 *
 * Falls back to the default text card when the node has no image or its record
 * cannot be resolved: a node must never disappear because an image is missing.
 */
export async function renderImageNodeStyle(
  node: Node,
  params: ImageNodeParams,
  theme: ColorTheme,
  showTitle: boolean
): Promise<CytoscapeNodeStyle> {
  const imageId = node.properties?.imageId as NodeImageId | undefined;
  await nodeImageCache.ensure(imageId);

  const image = nodeImageCache.get(imageId);
  if (!image) {
    return getDefaultNodeStyle(node, {
      colorOverrides: params.colorOverrides,
      effects: params.effects,
      gradient: params.gradient
    }, theme);
  }

  const { svg, width, height } = renderSVG(node.title, image, params, theme, showTitle);
  const encodedSVG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  return {
    'background-image': encodedSVG,
    'background-opacity': 0,
    'width': width,
    'height': height,
    'shape': 'round-rectangle',
    'background-fit': 'contain',
    'background-clip': 'none',
    'border-width': theme.node.border.width ?? 0,
    'border-color': (theme.node.border.width ?? 0) > 0 ? theme.node.border.color : 'transparent',
  };
}

export async function getImageNodeStyle(
  node: Node,
  params: ImageNodeParams,
  theme: ColorTheme
): Promise<CytoscapeNodeStyle> {
  return renderImageNodeStyle(node, params, theme, false);
}
