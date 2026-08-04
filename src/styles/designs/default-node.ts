/**
 * Default Node Design
 * 16:9 aspect ratio rectangle with auto-wrapping title text.
 * Node size is driven by text content: the algorithm chooses the number
 * of lines that brings the overall shape closest to the target aspect ratio.
 */

import type { Node } from '../../core/main-types';
import type { ColorTheme, CytoscapeNodeStyle } from '../../core/style-types';
import type { ColorOverrides, VisualEffects, GradientConfig } from '../../core/design-types';
import { getShadowPadding, buildShadowFilter } from './shadow-utils';

// =============================================================================
// PARAMS
// =============================================================================

export interface DefaultNodeParams {
  fontSize?: number;        // Default 14
  minWidth?: number;        // Minimum node width before padding (default 100)
  aspectRatio?: number;     // Target aspect ratio, width/height (default 16/9 ≈ 1.78)
  fixedAspect?: boolean;    // true = exact aspect ratio with adjusted padding; false = fixed padding (default)
  hPadding?: number;        // Horizontal padding each side (default 18)
  vPadding?: number;        // Vertical padding each side (default 18)
  colorOverrides?: ColorOverrides;
  effects?: VisualEffects;
  gradient?: GradientConfig;
}

// =============================================================================
// LAYOUT CONSTANTS
// =============================================================================

const DEFAULT_ASPECT = 16 / 9;
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_MIN_WIDTH = 100;
const LINE_HEIGHT_FACTOR = 1.4;
const CHAR_WIDTH_FACTOR = 0.6;   // Average char width / fontSize for sans-serif
const H_PADDING = 18;            // Horizontal padding each side (default; overridable via params.hPadding)
const V_PADDING = 18;            // Vertical padding each side (default; overridable via params.vPadding)
const BORDER_RADIUS = 8;

// Minor words that should never sit alone on a wrapped line: they are glued to
// the word that follows them (typographic "non-breaking" convention), so titles
// like "Laws of Nature" wrap as "Laws / of Nature" rather than "Laws / of /
// Nature". Any word of 3 characters or fewer counts as minor — this also keeps
// symbols and abbreviations (e.g. "&", "AI") from stranding. A few longer
// function words that read poorly when stranded are included explicitly.
const MINOR_WORD_MAX_LENGTH = 3;
const LONG_FUNCTION_WORDS = new Set([
  'with', 'from', 'into', 'over', 'than', 'that'
]);

function isMinorWord(word: string): boolean {
  return word.length <= MINOR_WORD_MAX_LENGTH || LONG_FUNCTION_WORDS.has(word.toLowerCase());
}

// =============================================================================
// HELPERS (color, gradient, effects — same pattern as other designs)
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

  const id = 'grad-0';
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

  const id = 'fx-0';
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

function buildVignetteGradients(
  vignette: { strength?: number; spread?: number; color?: string; colorOpacity?: number } | undefined,
  idPrefix: string
): { defs: string; overlayIds: string[] } {
  if (!vignette?.strength || vignette.strength === 0) {
    return { defs: '', overlayIds: [] };
  }
  const strength = vignette.strength;
  const spread = vignette.spread ?? 30;
  const color = vignette.color ?? '#000000';
  const colorOpacity = vignette.colorOpacity ?? 1;
  const edgeOpacity = strength * colorOpacity;

  const ids = ['top', 'bottom', 'left', 'right'].map(d => `${idPrefix}-${d}`);
  const defs = `
    <linearGradient id="${ids[0]}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${edgeOpacity}"/>
      <stop offset="${spread}%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${ids[1]}" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${edgeOpacity}"/>
      <stop offset="${spread}%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${ids[2]}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${edgeOpacity}"/>
      <stop offset="${spread}%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${ids[3]}" x1="100%" y1="0%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${edgeOpacity}"/>
      <stop offset="${spread}%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>`;
  return { defs, overlayIds: ids };
}

// =============================================================================
// TEXT LAYOUT
// =============================================================================

/**
 * Compute optimal line count that brings the content area closest to TARGET_ASPECT.
 * n = sqrt(textPixelWidth / (lineHeight × targetAspect)), rounded to nearest, min 1.
 */
function computeOptimalLineCount(textLength: number, fontSize: number, targetAspect: number): number {
  const charWidth = fontSize * CHAR_WIDTH_FACTOR;
  const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
  const textPixelWidth = textLength * charWidth;

  const rawN = Math.sqrt(textPixelWidth / (lineHeight * targetAspect));
  return Math.max(1, Math.round(rawN));
}

/**
 * Group words so that short "minor" words stay attached to the following word.
 * Consecutive minor words chain onto the same following word
 * (e.g. "out of the box" → ["out", "of the box"]). Trailing minor words with
 * no following word attach to the previous group instead of dangling.
 */
function groupMinorWords(words: string[]): string[] {
  const groups: string[] = [];
  let pending = '';

  for (const word of words) {
    if (isMinorWord(word)) {
      pending = pending ? `${pending} ${word}` : word;
    } else {
      groups.push(pending ? `${pending} ${word}` : word);
      pending = '';
    }
  }

  if (pending) {
    if (groups.length > 0) {
      groups[groups.length - 1] = `${groups[groups.length - 1]} ${pending}`;
    } else {
      groups.push(pending);
    }
  }

  return groups;
}

/**
 * Word-wrap text to fit within a target width (in pixels).
 * Minor words are glued to the following word so they never wrap alone.
 * Returns array of lines.
 */
function wordWrap(text: string, targetWidthPx: number, fontSize: number): string[] {
  const charWidth = fontSize * CHAR_WIDTH_FACTOR;
  const maxCharsPerLine = Math.max(1, Math.floor(targetWidthPx / charWidth));
  const groups = groupMinorWords(text.split(/\s+/));
  const lines: string[] = [];
  let current = '';

  for (const group of groups) {
    const test = current ? `${current} ${group}` : group;
    if (test.length <= maxCharsPerLine || current === '') {
      // Accept the group (also accept if it's the first group on the line, even if too long)
      current = test;
    } else {
      lines.push(current);
      current = group;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Compute text layout: optimal line count, word-wrap, and content dimensions.
 *
 * If the title contains explicit line breaks (\n), the user has taken control:
 * lines are honored verbatim, the aspect-ratio target is ignored, and no
 * word-wrap is applied. Empty lines are preserved as blank visual lines.
 *
 * Otherwise, tries the optimal n and n±1 and picks whichever aspect is
 * closest to the target.
 */
function computeTextLayout(
  title: string,
  fontSize: number,
  minWidth: number,
  targetAspect: number,
  hPadding: number,
  vPadding: number
): { lines: string[]; contentWidth: number; contentHeight: number } {
  const charWidth = fontSize * CHAR_WIDTH_FACTOR;
  const lineHeight = fontSize * LINE_HEIGHT_FACTOR;

  // User-controlled multi-line: honor explicit \n verbatim.
  if (title.includes('\n')) {
    const lines = title.split('\n');
    const longestLine = Math.max(...lines.map(l => l.length));
    const contentWidth = Math.max(longestLine * charWidth, minWidth - hPadding * 2);
    const contentHeight = lines.length * lineHeight;
    return { lines, contentWidth, contentHeight };
  }

  const textPixelWidth = title.length * charWidth;

  const optimalN = computeOptimalLineCount(title.length, fontSize, targetAspect);

  // Try n-1, n, n+1 and pick best aspect match
  const candidates = [optimalN - 1, optimalN, optimalN + 1].filter(n => n >= 1);
  let bestLines: string[] = [title];
  let bestAspectDiff = Infinity;

  for (const n of candidates) {
    const targetLineWidth = textPixelWidth / n;
    const lines = wordWrap(title, targetLineWidth, fontSize);

    // Actual content dimensions
    const longestLine = Math.max(...lines.map(l => l.length));
    const cw = Math.max(longestLine * charWidth, minWidth - hPadding * 2);
    const ch = lines.length * lineHeight;
    const totalW = cw + hPadding * 2;
    const totalH = ch + vPadding * 2;
    const aspect = totalW / totalH;
    const diff = Math.abs(aspect - targetAspect);

    if (diff < bestAspectDiff) {
      bestAspectDiff = diff;
      bestLines = lines;
    }
  }

  const longestLine = Math.max(...bestLines.map(l => l.length));
  const contentWidth = Math.max(longestLine * charWidth, minWidth - hPadding * 2);
  const contentHeight = bestLines.length * lineHeight;

  return { lines: bestLines, contentWidth, contentHeight };
}

// =============================================================================
// SVG RENDERING
// =============================================================================

function renderSVG(
  nodeData: Node,
  params: DefaultNodeParams,
  theme: ColorTheme
): { svg: string; width: number; height: number } {
  const fontSize = params.fontSize ?? DEFAULT_FONT_SIZE;
  const minWidth = params.minWidth ?? DEFAULT_MIN_WIDTH;
  const targetAspect = params.aspectRatio ?? DEFAULT_ASPECT;
  const fixedAspect = params.fixedAspect ?? false;
  const hPadding = params.hPadding ?? H_PADDING;
  const vPadding = params.vPadding ?? V_PADDING;
  const lineHeight = fontSize * LINE_HEIGHT_FACTOR;

  // Compute text layout
  const { lines, contentWidth, contentHeight } = computeTextLayout(
    nodeData.title, fontSize, minWidth, targetAspect, hPadding, vPadding
  );

  // Final rect dimensions
  let rectWidth = Math.max(contentWidth + hPadding * 2, minWidth);
  let rectHeight = contentHeight + vPadding * 2;

  // Fixed aspect mode: enforce exact aspect ratio by expanding the smaller dimension
  if (fixedAspect) {
    const currentAspect = rectWidth / rectHeight;
    if (currentAspect < targetAspect) {
      // Too narrow — widen
      rectWidth = rectHeight * targetAspect;
    } else {
      // Too tall — heighten
      rectHeight = rectWidth / targetAspect;
    }
    // Enforce minimum width after aspect correction
    if (rectWidth < minWidth) {
      rectWidth = minWidth;
      rectHeight = rectWidth / targetAspect;
    }
  }

  // Shadow
  const shadow = theme.node.shadow;
  const shadowPadding = getShadowPadding(shadow);
  const { def: shadowDef, id: shadowId } = buildShadowFilter(shadow);
  const svgWidth = rectWidth + shadowPadding;
  const svgHeight = rectHeight + shadowPadding;

  // Colors
  const bgColor = resolveColor(params.colorOverrides?.background, theme.node.background.color);
  const bgAltColor = resolveColor(params.colorOverrides?.backgroundAlt, theme.node.backgroundAlt.color);
  const textColor = resolveColor(params.colorOverrides?.text, theme.node.text.color);

  // Gradient
  const gradient = params.gradient ?? theme.node.background.gradient ?? { type: 'solid' as const };
  const { def: gradientDef, fill } = buildGradientDef(gradient, bgColor, bgAltColor);

  // Effects
  const themeBg = theme.node.background as { brightness: number; saturation: number; hue: number; opacity: number };
  const { def: filterDef, filter } = buildEffectsFilter(themeBg, params.effects);
  const bgOpacity = params.effects?.backgroundOpacity ?? themeBg.opacity;
  const textOpacity = params.effects?.textOpacity ?? (theme.node.text as { opacity: number }).opacity;

  // Vignette
  const vignette = (theme.node.background as { vignette?: { strength?: number; spread?: number; color?: string; colorOpacity?: number } }).vignette;
  const vignettePrefix = 'vignette-0';
  const { defs: vignetteDefs, overlayIds } = buildVignetteGradients(vignette, vignettePrefix);
  const vignetteOverlays = overlayIds.length > 0
    ? overlayIds.map(id => `<rect x="0" y="0" width="${rectWidth}" height="${rectHeight}" fill="url(#${id})"/>`).join('\n          ')
    : '';

  // Clip path for vignette
  const clipId = 'clip-0';

  // Build text tspans (centered vertically and horizontally)
  const textBlockHeight = lines.length * lineHeight;
  const textStartY = (rectHeight - textBlockHeight) / 2 + lineHeight * 0.75; // 0.75 baseline offset
  const centerX = rectWidth / 2;
  const tspans = lines.map((line, i) =>
    `<tspan x="${centerX}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('\n        ');

  const svg = `
    <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${gradientDef}
        ${filterDef}
        ${shadowDef}
        ${vignetteDefs}
        <clipPath id="${clipId}">
          <rect x="0" y="0" width="${rectWidth}" height="${rectHeight}" rx="${BORDER_RADIUS}"/>
        </clipPath>
      </defs>
      <g filter="url(#${shadowId})">
        <g ${filter} opacity="${bgOpacity}">
          <rect
            x="0" y="0"
            width="${rectWidth}" height="${rectHeight}"
            fill="${fill}"
            rx="${BORDER_RADIUS}"
          />
          ${vignetteOverlays ? `<g clip-path="url(#${clipId})">${vignetteOverlays}</g>` : ''}
        </g>
      </g>
      <text
        x="${centerX}" y="${textStartY}"
        text-anchor="middle"
        fill="${textColor}"
        opacity="${textOpacity}"
        font-size="${fontSize}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      >
        ${tspans}
      </text>
    </svg>
  `;

  return {
    svg: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    width: svgWidth,
    height: svgHeight
  };
}

/** Escape XML special characters in text content */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// =============================================================================
// PUBLIC API
// =============================================================================

export function getDefaultNodeStyle(
  node: Node,
  params: DefaultNodeParams,
  theme: ColorTheme
): CytoscapeNodeStyle {
  const { svg, width, height } = renderSVG(node, params, theme);

  return {
    'background-image': svg,
    'background-opacity': 0,
    'width': width,
    'height': height,
    'shape': 'roundrectangle',
    'background-fit': 'contain',
    'background-clip': 'none',
    'border-width': theme.node.border.width ?? 0,
    'border-color': (theme.node.border.width ?? 0) > 0 ? theme.node.border.color : 'transparent',
  };
}
