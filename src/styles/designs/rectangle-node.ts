/**
 * Rectangle Node Design
 * Rounded rectangle with 2:1 width:height ratio
 * Supports color overrides, visual effects, and gradients
 */

import type { Node } from '../../core/main-types';
import type { ColorTheme, CytoscapeNodeStyle } from '../../core/style-types';
import type { ColorOverrides, VisualEffects, GradientConfig } from '../../core/design-types';
import { getShadowPadding, buildShadowFilter } from './shadow-utils';

export interface RectangleNodeParams {
  size?: number;  // Width in pixels (height will be half, default: 120)
  borderWidth?: number;  // Border stroke width (default: 0)
  borderColor?: string;  // Border color (default: transparent)
  colorOverrides?: ColorOverrides;
  effects?: VisualEffects;
  gradient?: GradientConfig;
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

  const id = `grad-${Date.now()}`;
  
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
    // Convert angle to x1,y1,x2,y2 (0° = right, 90° = down, 180° = left, 270° = up)
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
 * Opacity is handled separately via SVG opacity attribute
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

  const id = `fx-${Date.now()}`;
  const filters: string[] = [];
  
  // Hue rotation matrix
  if (hue !== 0) {
    filters.push(`<feColorMatrix type="hueRotate" values="${hue}"/>`);
  }
  // Saturation
  if (saturation !== 1) {
    filters.push(`<feColorMatrix type="saturate" values="${saturation}"/>`);
  }
  // Brightness via feComponentTransfer
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

/**
 * Build SVG vignette using 4 linear gradients (one from each edge)
 * Creates smooth edge darkening based on distance from border
 */
function buildVignetteGradients(
  vignette: { strength?: number; spread?: number; color?: string; colorOpacity?: number } | undefined,
  idPrefix: string
): { defs: string; overlayIds: string[] } {
  if (!vignette?.strength || vignette.strength === 0) {
    return { defs: '', overlayIds: [] };
  }

  const strength = vignette.strength;
  const spread = vignette.spread ?? 30;  // % from edge where fade ends
  const color = vignette.color ?? '#000000';
  const colorOpacity = vignette.colorOpacity ?? 1;
  
  // Final edge opacity = strength * colorOpacity
  const edgeOpacity = strength * colorOpacity;
  
  const topId = `${idPrefix}-top`;
  const bottomId = `${idPrefix}-bottom`;
  const leftId = `${idPrefix}-left`;
  const rightId = `${idPrefix}-right`;
  
  const defs = `
    <linearGradient id="${topId}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${edgeOpacity}"/>
      <stop offset="${spread}%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${bottomId}" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${edgeOpacity}"/>
      <stop offset="${spread}%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${leftId}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${edgeOpacity}"/>
      <stop offset="${spread}%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${rightId}" x1="100%" y1="0%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${edgeOpacity}"/>
      <stop offset="${spread}%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
  `;
  
  return { defs, overlayIds: [topId, bottomId, leftId, rightId] };
}

/**
 * Render rectangle SVG with drop shadow
 */
function renderSVG(
  nodeData: Node,
  params: RectangleNodeParams,
  theme: ColorTheme
): { svg: string; width: number; height: number } {
  const baseSize = params.size || 120;
  const rectWidth = baseSize;
  const rectHeight = baseSize / 2;
  
  // Get shadow config from theme
  const shadow = theme.node.shadow;
  const shadowPadding = getShadowPadding(shadow);
  const { def: shadowDef, id: shadowId } = buildShadowFilter(shadow);
  
  // SVG dimensions (larger to accommodate shadow)
  const svgWidth = rectWidth + shadowPadding;
  const svgHeight = rectHeight + shadowPadding;
  
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
  
  // Build vignette gradients (edge darkening via 4 linear gradients)
  const vignette = (theme.node.background as { vignette?: { strength?: number; spread?: number; color?: string; colorOpacity?: number } }).vignette;
  const vignettePrefix = `vignette-${Date.now()}`;
  const { defs: vignetteDefs, overlayIds } = buildVignetteGradients(vignette, vignettePrefix);
  
  // Build vignette overlay rects
  const vignetteOverlays = overlayIds.length > 0 
    ? overlayIds.map(id => `<rect x="0" y="0" width="${rectWidth}" height="${rectHeight}" fill="url(#${id})"/>`).join('\n          ')
    : '';
  
  // Calculate font size based on text length
  const text = nodeData.title;
  const maxWidth = rectWidth * 0.85;
  let fontSize = Math.min(14, rectHeight * 0.6);
  const estimatedTextWidth = text.length * fontSize * 0.6;
  if (estimatedTextWidth > maxWidth) {
    fontSize = maxWidth / (text.length * 0.6);
  }
  fontSize = Math.max(8, Math.min(fontSize, 18));
  
  // Center positions for text
  const centerX = rectWidth / 2;
  const centerY = rectHeight / 2;
  
  // Clip path for vignette overlays
  const clipId = `clip-${Date.now()}`;
  
  const svg = `
    <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${gradientDef}
        ${filterDef}
        ${shadowDef}
        ${vignetteDefs}
        <clipPath id="${clipId}">
          <rect x="0" y="0" width="${rectWidth}" height="${rectHeight}" rx="8"/>
        </clipPath>
      </defs>
      <g filter="url(#${shadowId})">
        <g ${filter} opacity="${bgOpacity}">
          <rect 
            x="0" 
            y="0" 
            width="${rectWidth}" 
            height="${rectHeight}" 
            fill="${fill}" 
            stroke="${params.borderColor ?? 'transparent'}" 
            stroke-width="${params.borderWidth ?? 0}"
            rx="8"
          />
          ${vignetteOverlays ? `<g clip-path="url(#${clipId})">${vignetteOverlays}</g>` : ''}
        </g>
      </g>
      <text 
        x="${centerX}" 
        y="${centerY}" 
        text-anchor="middle" 
        dominant-baseline="middle" 
        fill="${textColor}" 
        opacity="${textOpacity}"
        font-size="${fontSize}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      >
        ${text}
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
 * Get Cytoscape style for rectangle node
 */
export function getRectangleNodeStyle(
  node: Node,
  params: RectangleNodeParams,
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
