/**
 * Equation Compact Node Design
 * Two-section layout: title bar + equation (MathJax)
 * Same as equation-node but without the bottom metadata section.
 * Supports color overrides, visual effects, gradients, and per-area colors.
 */

import type { Node } from '../../core/main-types';
import type { ColorTheme, CytoscapeNodeStyle } from '../../core/style-types'
import type { ColorOverrides, VisualEffects, GradientConfig, AreaColors } from '../../core/design-types'
import { getShadowPadding, buildShadowFilter } from './shadow-utils'

export interface EquationCompactNodeParams {
  topHeight?: number;           // Height of title section (default: 30)
  horizontalPadding?: number;   // Horizontal padding (default: 40)
  paddingAbove?: number;        // Padding above equation (default: 25)
  paddingBelow?: number;        // Padding below equation (default: 35, larger to counterweight title)
  borderRadius?: number;        // Corner radius (default: 6)
  titleFontSize?: number;       // Title font size (default: 11)
  equationScale?: number;        // Equation size multiplier (default: 1)
  minWidth?: number;            // Minimum node width (default: 100)
  colorOverrides?: ColorOverrides;
  effects?: VisualEffects;
  gradient?: GradientConfig;
  areaColors?: AreaColors;      // Per-section color overrides (top, middle)
}

// =============================================================================
// HELPERS (color, gradient, effects — same pattern as equation-node)
// =============================================================================

function resolveColor(override: string | undefined, themeColor: string): string {
  return override ?? themeColor;
}

function buildGradientDef(
  gradient: GradientConfig,
  bgColor: string,
  bgAltColor: string,
  idSuffix: string
): { def: string; fill: string } {
  if (gradient.type === 'solid') {
    return { def: '', fill: bgColor };
  }

  const id = `grad-${idSuffix}-${Date.now()}`;
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

  const id = `fx-${Date.now()}`;
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

// =============================================================================
// MATHJAX RENDERING
// =============================================================================

async function renderMathJaxEquation(
  equation: string,
  textColor: string
): Promise<{
  svgContent: string;
  width: number;
  height: number;
  scale: number;
  vbMinX: number;
  vbMinY: number;
  vbWidth: number;
  vbHeight: number;
}> {
  if (!window.MathJax?.tex2svgPromise || !equation) {
    const width = Math.max(equation.length * 8, 20);
    const height = 16;
    return {
      svgContent: equation ? `<text text-anchor="middle" fill="${textColor}" font-size="14">${equation}</text>` : '',
      width, height, scale: 1, vbMinX: 0, vbMinY: 0, vbWidth: width, vbHeight: height,
    };
  }

  try {
    const mathNode = await window.MathJax.tex2svgPromise(equation, { display: true });
    const mathSvg = mathNode.querySelector('svg');
    if (!mathSvg) throw new Error('No SVG element in MathJax output');

    const viewBox = mathSvg.getAttribute('viewBox');
    if (!viewBox) throw new Error('No viewBox on MathJax SVG');

    const [vbMinX, vbMinY, vbWidth, vbHeight] = viewBox.split(' ').map(Number);
    const widthAttr = mathSvg.getAttribute('width');
    const heightAttr = mathSvg.getAttribute('height');
    const exToPx = 8;
    const width = parseFloat(widthAttr || '10') * exToPx;
    const height = parseFloat(heightAttr || '2') * exToPx;
    const scale = width / vbWidth;

    mathSvg.querySelectorAll('g').forEach((g: SVGElement) =>
      g.setAttribute('fill', textColor)
    );

    return { svgContent: mathSvg.innerHTML, width, height, scale, vbMinX, vbMinY, vbWidth, vbHeight };
  } catch (error) {
    console.error('MathJax rendering error:', error);
    return {
      svgContent: `<text text-anchor="middle" fill="${textColor}" font-size="14">Error</text>`,
      width: 100, height: 20, scale: 1, vbMinX: 0, vbMinY: 0, vbWidth: 100, vbHeight: 20,
    };
  }
}

function resolvePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
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
// SVG RENDERING
// =============================================================================

function renderSVG(
  titleText: string,
  equationData: {
    svgContent: string;
    width: number;
    height: number;
    scale: number;
    vbMinX: number;
    vbMinY: number;
    vbWidth: number;
    vbHeight: number;
  },
  params: EquationCompactNodeParams,
  theme: ColorTheme
): { svg: string; width: number; height: number } {
  const topHeight = params.topHeight ?? 30;
  const horizontalPadding = params.horizontalPadding ?? 40;
  const paddingAbove = params.paddingAbove ?? 25;
  const paddingBelow = params.paddingBelow ?? 35;
  const borderRadius = params.borderRadius ?? 6;
  const titleFontSize = params.titleFontSize ?? 11;
  const minWidth = params.minWidth ?? 100;

  // Shadow
  const shadow = theme.node.shadow;
  const shadowPadding = getShadowPadding(shadow);
  const { def: shadowDef, id: shadowId } = buildShadowFilter(shadow);

  // Colors
  const bgColor = resolveColor(params.colorOverrides?.background, theme.node.background.color);
  const bgAltColor = resolveColor(params.colorOverrides?.backgroundAlt, theme.node.backgroundAlt.color);
  const textColor = resolveColor(params.colorOverrides?.text, theme.node.text.color);

  // Area-specific colors
  const topColor = params.areaColors?.top ?? bgAltColor;
  const middleColor = params.areaColors?.middle ?? bgColor;

  // Gradient for equation section
  const gradient = params.gradient ?? theme.node.background.gradient ?? { type: 'solid' as const };
  const { def: gradientDef, fill: middleFill } = buildGradientDef(gradient, middleColor, bgAltColor, 'middle');

  // Effects
  const themeBg = theme.node.background as { brightness: number; saturation: number; hue: number; opacity: number };
  const { def: filterDef, filter } = buildEffectsFilter(themeBg, params.effects);
  const bgOpacity = params.effects?.backgroundOpacity ?? themeBg.opacity;
  const bgAltOpacity = params.effects?.backgroundAltOpacity ?? (theme.node.backgroundAlt as { opacity: number }).opacity;
  const textOpacity = params.effects?.textOpacity ?? (theme.node.text as { opacity: number }).opacity;

  // Calculate dimensions — title may span multiple lines (user-entered \n).
  const titleLines = titleText.split('\n');
  const titleLineHeight = titleFontSize * 1.4;
  const longestTitleChars = Math.max(...titleLines.map(l => l.length));
  const titleWidth = longestTitleChars * titleFontSize * 0.55;
  // Grow the title bar height to fit additional lines beyond the first.
  const effectiveTopHeight = topHeight + (titleLines.length - 1) * titleLineHeight;
  const contentWidth = Math.max(
    titleWidth + horizontalPadding * 2,
    equationData.width + horizontalPadding * 2,
    minWidth
  );
  const middleHeight = equationData.height + paddingAbove + paddingBelow;
  const contentHeight = effectiveTopHeight + middleHeight;

  const svgWidth = contentWidth + shadowPadding;
  const svgHeight = contentHeight + shadowPadding;

  // Equation position (centered vertically within paddingAbove/paddingBelow)
  const equationX = contentWidth / 2 - (equationData.vbMinX + equationData.vbWidth / 2) * equationData.scale;
  const equationCenterY = effectiveTopHeight + paddingAbove + equationData.height / 2;
  const equationY = equationCenterY - (equationData.vbMinY + equationData.vbHeight / 2) * equationData.scale;

  // Paths
  const r = borderRadius;
  const w = contentWidth;
  const h = contentHeight;

  // Top section: rounded top corners, square bottom
  const topPath = `M 0,${r} Q 0,0 ${r},0 L ${w - r},0 Q ${w},0 ${w},${r} L ${w},${effectiveTopHeight} L 0,${effectiveTopHeight} Z`;

  // Middle section: square top, rounded bottom corners
  const middlePath = `M 0,${effectiveTopHeight} L ${w},${effectiveTopHeight} L ${w},${h - r} Q ${w},${h} ${w - r},${h} L ${r},${h} Q 0,${h} 0,${h - r} Z`;

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
          <!-- Top Section: Title -->
          <path d="${topPath}" fill="${topColor}" opacity="${bgAltOpacity}"/>
          <!-- Bottom Section: Equation -->
          <path d="${middlePath}" fill="${middleFill}" opacity="${bgOpacity}"/>
        </g>
      </g>

      <!-- Text elements -->
      <g opacity="${textOpacity}">
        <text
          x="8"
          y="${titleLineHeight * 0.75 + (topHeight - titleLineHeight) / 2}"
          fill="${textColor}"
          font-size="${titleFontSize}"
          font-weight="normal"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        >${titleLines.map((line, i) => `<tspan x="8" dy="${i === 0 ? 0 : titleLineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>

        <g transform="translate(${equationX}, ${equationY}) scale(${equationData.scale})">
          ${equationData.svgContent}
        </g>
      </g>
    </svg>
  `;

  return { svg, width: svgWidth, height: svgHeight };
}

// =============================================================================
// PUBLIC API
// =============================================================================

export async function getEquationCompactNodeStyle(
  node: Node,
  params: EquationCompactNodeParams,
  theme: ColorTheme
): Promise<CytoscapeNodeStyle> {
  const equation = node.properties?.equation as string || '';
  const titleText = node.title;
  const textColor = resolveColor(params.colorOverrides?.text, theme.node.text.color);

  const equationData = await renderMathJaxEquation(equation, textColor);
  const equationScale = resolvePositiveNumber(params.equationScale, 1);
  const scaledEquationData = {
    ...equationData,
    width: equationData.width * equationScale,
    height: equationData.height * equationScale,
    scale: equationData.scale * equationScale,
  };
  const { svg, width, height } = renderSVG(titleText, scaledEquationData, params, theme);
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
