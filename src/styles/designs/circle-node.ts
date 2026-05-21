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

  const id = `fx-${Date.now()}`;
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

/**
 * Render circle SVG with drop shadow
 */
function renderSVG(
  nodeData: Node,
  params: CircleNodeParams,
  theme: ColorTheme
): { svg: string; width: number; height: number } {
  const radius = params.size || 40;
  
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
  
  // Calculate font size based on text length and circle size
  const text = nodeData.title;
  const diameter = radius * 2;
  const maxWidth = diameter * 0.7;
  let fontSize = Math.min(14, radius / 2);
  const estimatedTextWidth = text.length * fontSize * 0.6;
  if (estimatedTextWidth > maxWidth) {
    fontSize = maxWidth / (text.length * 0.6);
  }
  fontSize = Math.max(8, Math.min(fontSize, 20));
  
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
        y="${cy}" 
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
