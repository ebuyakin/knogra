/**
 * Circle Node Design
 * Simple circle with centered label
 * Supports color overrides, visual effects, and gradients
 */

import type { Node } from '../../core/main-types';
import type { ColorTheme, CytoscapeNodeStyle } from '../../core/style-types';
import type { ColorOverrides, VisualEffects, GradientConfig } from '../../core/design-types';
import { getShadowPadding, buildShadowFilter } from './shadow-utils';

export interface CircleNodeParams {
  size?: number;  // Radius in pixels (default: 40)
  fontSize?: number;     // Preferred title font size (default: 18)
  minFontSize?: number;  // Smallest auto-fit title font size (default: 6)
  colorOverrides?: ColorOverrides;
  effects?: VisualEffects;
  gradient?: GradientConfig;
}

const DEFAULT_RADIUS = 60;
const MAX_FONT_SIZE = 18;
const MIN_FONT_SIZE = 6;
const LINE_HEIGHT_FACTOR = 1.25;
const CHAR_WIDTH_FACTOR = 0.6;
const TEXT_WIDTH_FACTOR = 0.62;
const TEXT_HEIGHT_FACTOR = 0.62;

interface TextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

/**
 * Resolve color: use override if provided, otherwise theme color
 */
function resolveColor(override: string | undefined, themeColor: string): string {
  return override ?? themeColor;
}

/**
 * Build SVG gradient definition
 * Uses gradient.stops if provided, otherwise defaults to bgColor → bgAltColor
 */
function buildGradientDef(
  gradient: GradientConfig,
  bgColor: string,
  bgAltColor: string
): { def: string; fill: string } {
  if (gradient.type === 'solid') {
    return { def: '', fill: bgColor };
  }

  const id = 'grad-0';
  
  // Use custom stops or default to 2-stop gradient
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
      def: `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
        ${stopsXml}
      </linearGradient>`,
      fill: `url(#${id})`
    };
  }

  // radial
  return {
    def: `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">
      ${stopsXml}
    </radialGradient>`,
    fill: `url(#${id})`
  };
}

/**
 * Build SVG filter for visual effects (brightness, saturation, hue)
 * Theme provides defaults, effects override
 */
function buildEffectsFilter(
  themeBg: { brightness: number; saturation: number; hue: number },
  effects?: VisualEffects
): { def: string; filter: string } {
  const brightness = effects?.brightness ?? themeBg.brightness;
  const saturation = effects?.saturation ?? themeBg.saturation;
  const hue = effects?.hue ?? themeBg.hue;
  
  const hasEffects = brightness !== 1 || saturation !== 1 || hue !== 0;
  
  if (!hasEffects) {
    return { def: '', filter: '' };
  }

  const id = 'fx-0';
  const filters: string[] = [];
  
  if (hue !== 0) {
    filters.push(`<feColorMatrix type="hueRotate" values="${hue}"/>`);
  }
  if (saturation !== 1) {
    filters.push(`<feColorMatrix type="saturate" values="${saturation}"/>`);
  }
  if (brightness !== 1) {
    filters.push(`<feComponentTransfer>
      <feFuncR type="linear" slope="${brightness}"/>
      <feFuncG type="linear" slope="${brightness}"/>
      <feFuncB type="linear" slope="${brightness}"/>
    </feComponentTransfer>`);
  }

  if (filters.length === 0) {
    return { def: '', filter: '' };
  }

  return {
    def: `<filter id="${id}">${filters.join('')}</filter>`,
    filter: `filter="url(#${id})"`
  };
}

function computeTextLayout(
  title: string,
  radius: number,
  preferredFontSize: number,
  minimumFontSize: number
): TextLayout {
  const maxFontSize = Math.min(preferredFontSize, radius / 2);
  const minFontSize = Math.min(minimumFontSize, maxFontSize);
  const maxTextWidth = radius * 2 * TEXT_WIDTH_FACTOR;
  const maxTextHeight = radius * 2 * TEXT_HEIGHT_FACTOR;

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
    const maxLines = Math.max(1, Math.floor(maxTextHeight / lineHeight));
    const lines = wrapText(title, maxTextWidth, fontSize);
    if (lines.length <= maxLines) {
      return { lines, fontSize, lineHeight };
    }
  }

  const fontSize = MIN_FONT_SIZE;
  const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
  const maxLines = Math.max(1, Math.floor(maxTextHeight / lineHeight));
  const lines = clampLines(wrapText(title, maxTextWidth, fontSize), maxLines, maxTextWidth, fontSize);
  return { lines, fontSize, lineHeight };
}

function resolvePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function wrapText(text: string, maxWidthPx: number, fontSize: number): string[] {
  const charWidth = fontSize * CHAR_WIDTH_FACTOR;
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidthPx / charWidth));
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    wrapWords(paragraph, maxCharsPerLine, lines);
  }

  return lines.length > 0 ? lines : [''];
}

function wrapWords(text: string, maxCharsPerLine: number, lines: string[]): void {
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const chunks = splitLongWord(word, maxCharsPerLine);
    for (const chunk of chunks) {
      const test = current ? `${current} ${chunk}` : chunk;
      if (test.length <= maxCharsPerLine || current === '') {
        current = test;
      } else {
        lines.push(current);
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
}

function splitLongWord(word: string, maxCharsPerLine: number): string[] {
  if (word.length <= maxCharsPerLine) return [word];
  const chunks: string[] = [];
  for (let start = 0; start < word.length; start += maxCharsPerLine) {
    chunks.push(word.slice(start, start + maxCharsPerLine));
  }
  return chunks;
}

function clampLines(lines: string[], maxLines: number, maxWidthPx: number, fontSize: number): string[] {
  if (lines.length <= maxLines) return lines;
  const clamped = lines.slice(0, maxLines);
  const charWidth = fontSize * CHAR_WIDTH_FACTOR;
  const maxCharsPerLine = Math.max(3, Math.floor(maxWidthPx / charWidth));
  const lastLine = clamped[maxLines - 1] ?? '';
  clamped[maxLines - 1] = `${lastLine.slice(0, Math.max(0, maxCharsPerLine - 3))}...`;
  return clamped;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Render circle SVG with drop shadow
 */
function renderSVG(
  nodeData: Node,
  params: CircleNodeParams,
  theme: ColorTheme
): { svg: string; width: number; height: number } {
  const radius = params.size || DEFAULT_RADIUS;
  
  // Get shadow config from theme
  const shadow = theme.node.shadow;
  const shadowPadding = getShadowPadding(shadow);
  const { def: shadowDef, id: shadowId } = buildShadowFilter(shadow);
  
  // SVG dimensions (larger to accommodate shadow)
  const svgWidth = radius * 2 + shadowPadding;
  const svgHeight = radius * 2 + shadowPadding;
  
  // Circle center (offset to leave room for shadow on right/bottom)
  const cx = radius;
  const cy = radius;
  
  // Resolve colors
  const bgColor = resolveColor(params.colorOverrides?.background, theme.node.background.color);
  const bgAltColor = resolveColor(params.colorOverrides?.backgroundAlt, theme.node.backgroundAlt.color);
  const textColor = resolveColor(params.colorOverrides?.text, theme.node.text.color);
  
  // Build gradient (theme provides default, params.gradient overrides)
  const gradient = params.gradient ?? theme.node.background.gradient ?? { type: 'solid' as const };
  const { def: gradientDef, fill } = buildGradientDef(gradient, bgColor, bgAltColor);
  
  // Build effects filter (theme provides defaults, params.effects overrides)
  const themeBg = theme.node.background as { brightness: number; saturation: number; hue: number; opacity: number };
  const { def: filterDef, filter } = buildEffectsFilter(themeBg, params.effects);
  const bgOpacity = params.effects?.backgroundOpacity ?? themeBg.opacity;
  const textOpacity = params.effects?.textOpacity ?? (theme.node.text as { opacity: number }).opacity;
  
  const preferredFontSize = resolvePositiveNumber(params.fontSize, MAX_FONT_SIZE);
  const minimumFontSize = resolvePositiveNumber(params.minFontSize, MIN_FONT_SIZE);
  const textLayout = computeTextLayout(nodeData.title, radius, preferredFontSize, minimumFontSize);
  const textBlockHeight = textLayout.lines.length * textLayout.lineHeight;
  const textStartY = cy - textBlockHeight / 2 + textLayout.lineHeight * 0.75;
  const tspans = textLayout.lines.map((line, index) =>
    `<tspan x="${cx}" dy="${index === 0 ? 0 : textLayout.lineHeight}">${escapeXml(line)}</tspan>`
  ).join('\n        ');
  
  const svg = `
    <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${gradientDef}
        ${filterDef}
        ${shadowDef}
      </defs>
      <g filter="url(#${shadowId})">
        <g ${filter} opacity="${bgOpacity}">
          <circle 
            cx="${cx}" 
            cy="${cy}" 
            r="${radius}" 
            fill="${fill}"
          />
        </g>
      </g>
      <text 
        x="${cx}" 
        y="${textStartY}" 
        text-anchor="middle" 
        fill="${textColor}" 
        opacity="${textOpacity}"
        font-size="${textLayout.fontSize}"
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

/**
 * Get Cytoscape style for circle node
 */
export function getCircleNodeStyle(
  node: Node,
  params: CircleNodeParams,
  theme: ColorTheme
): CytoscapeNodeStyle {
  const { svg, width, height } = renderSVG(node, params, theme);
  
  return {
    'background-image': svg,
    'background-opacity': 0,
    'width': width,
    'height': height,
    'shape': 'ellipse',
    'background-fit': 'contain',
    'background-clip': 'none',
    'border-width': theme.node.border.width ?? 0,
    'border-color': (theme.node.border.width ?? 0) > 0 ? theme.node.border.color : 'transparent',
  };
}
