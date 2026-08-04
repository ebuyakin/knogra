/**
 * Tester Node Design
 * Same as equation-node but displays nodeId in the bottom section instead of type
 * Useful for debugging and experimentation
 */

import type { Node } from '../../core/main-types';
import type { ColorTheme, CytoscapeNodeStyle } from '../../core/style-types'
import type { ColorOverrides, VisualEffects, GradientConfig, AreaColors } from '../../core/design-types'
import { getShadowPadding, buildShadowFilter } from './shadow-utils'

export interface TesterNodeParams {
  topHeight?: number;           // Height of title section (default: 30)
  bottomHeight?: number;        // Height of metadata section (default: 30)
  horizontalPadding?: number;   // Horizontal padding (default: 40)
  verticalPadding?: number;     // Vertical padding around equation (default: 20)
  borderRadius?: number;        // Corner radius (default: 6)
  titleFontSize?: number;       // Title font size (default: 11)
  idFontSize?: number;          // Node ID font size (default: 9)
  minWidth?: number;            // Minimum node width (default: 100)
  colorOverrides?: ColorOverrides;
  effects?: VisualEffects;
  gradient?: GradientConfig;
  areaColors?: AreaColors;      // Per-section color overrides
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
  bgAltColor: string,
  idSuffix: string
): { def: string; fill: string } {
  if (gradient.type === 'solid') {
    return { def: '', fill: bgColor };
  }

  const id = `grad-${idSuffix}`;
  
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

/**
 * Render equation using MathJax
 * Returns equation SVG content and dimensions
 */
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
    // Fallback for missing MathJax or no equation
    const width = Math.max(equation.length * 8, 20);
    const height = 16;
    return {
      svgContent: equation ? `<text text-anchor="middle" fill="${textColor}" font-size="14">${equation}</text>` : '',
      width,
      height,
      scale: 1,
      vbMinX: 0,
      vbMinY: 0,
      vbWidth: width,
      vbHeight: height,
    };
  }

  try {
    const mathNode = await window.MathJax.tex2svgPromise(equation, { display: true });
    const mathSvg = mathNode.querySelector('svg');
    
    if (!mathSvg) {
      throw new Error('No SVG element in MathJax output');
    }
    
    // Get dimensions from viewBox
    const viewBox = mathSvg.getAttribute('viewBox');
    if (!viewBox) {
      throw new Error('No viewBox on MathJax SVG');
    }
    
    const [vbMinX, vbMinY, vbWidth, vbHeight] = viewBox.split(' ').map(Number);
    
    // MathJax viewBox is in arbitrary units, convert to pixels
    // The width/height attributes give us the actual size in ex units
    const widthAttr = mathSvg.getAttribute('width');
    const heightAttr = mathSvg.getAttribute('height');
    
    // Parse ex units (1ex ≈ 8px)
    const exToPx = 8;
    const width = parseFloat(widthAttr || '10') * exToPx;
    const height = parseFloat(heightAttr || '2') * exToPx;
    
    // Calculate scale: viewBox size → actual pixel size
    const scale = width / vbWidth;
    
    // Style equation text
    mathSvg.querySelectorAll('g').forEach((g: SVGElement) => 
      g.setAttribute('fill', textColor)
    );
    
    return {
      svgContent: mathSvg.innerHTML,
      width,
      height,
      scale,
      vbMinX,
      vbMinY,
      vbWidth,
      vbHeight,
    };
  } catch (error) {
    console.error('MathJax rendering error:', error);
    return {
      svgContent: `<text text-anchor="middle" fill="${textColor}" font-size="14">Error</text>`,
      width: 100,
      height: 20,
      scale: 1,
      vbMinX: 0,
      vbMinY: 0,
      vbWidth: 100,
      vbHeight: 20,
    };
  }
}

/**
 * Build the composite SVG for the node
 */
function renderSVG(
  titleText: string,
  nodeId: string,
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
  params: TesterNodeParams,
  theme: ColorTheme
): { svg: string; width: number; height: number } {
  // Get dimensions from params with defaults
  const topHeight = params.topHeight ?? 30;
  const bottomHeight = params.bottomHeight ?? 30;
  const horizontalPadding = params.horizontalPadding ?? 40;
  const verticalPadding = params.verticalPadding ?? 20;
  const borderRadius = params.borderRadius ?? 6;
  
  // Get font sizes from params with defaults
  const titleFontSize = params.titleFontSize ?? 11;
  const idFontSize = params.idFontSize ?? 9;
  
  // Get minimum width from params
  const minWidth = params.minWidth ?? 100;
  
  // Get shadow config from theme
  const shadow = theme.node.shadow;
  const shadowPadding = getShadowPadding(shadow);
  const { def: shadowDef, id: shadowId } = buildShadowFilter(shadow);
  
  // Resolve colors
  const bgColor = resolveColor(params.colorOverrides?.background, theme.node.background.color);
  const bgAltColor = resolveColor(params.colorOverrides?.backgroundAlt, theme.node.backgroundAlt.color);
  const textColor = resolveColor(params.colorOverrides?.text, theme.node.text.color);
  
  // Area-specific colors (override bgColor/bgAltColor for specific sections)
  const topColor = params.areaColors?.top ?? bgAltColor;
  const middleColor = params.areaColors?.middle ?? bgColor;
  const bottomColor = params.areaColors?.bottom ?? bgAltColor;
  
  // Build gradient for middle section (theme provides default, params.gradient overrides)
  const gradient = params.gradient ?? theme.node.background.gradient ?? { type: 'solid' as const };
  const { def: gradientDef, fill: middleFill } = buildGradientDef(gradient, middleColor, bgAltColor, 'middle');
  
  // Build effects filter (theme provides defaults, params.effects overrides)
  const themeBg = theme.node.background as { brightness: number; saturation: number; hue: number; opacity: number };
  const { def: filterDef, filter } = buildEffectsFilter(themeBg, params.effects);
  const bgOpacity = params.effects?.backgroundOpacity ?? themeBg.opacity;
  const textOpacity = params.effects?.textOpacity ?? (theme.node.text as { opacity: number }).opacity;
  
  // Calculate text widths
  const titleWidth = titleText.length * titleFontSize * 0.55;
  const idWidth = nodeId.length * idFontSize * 0.55;
  
  // Calculate node dimensions
  const contentWidth = Math.max(
    titleWidth + horizontalPadding * 2,
    equationData.width + horizontalPadding * 2,
    idWidth + horizontalPadding * 2,
    minWidth
  );
  const middleHeight = equationData.height + verticalPadding * 2;
  const contentHeight = topHeight + middleHeight + bottomHeight;
  
  // SVG dimensions (larger to accommodate shadow)
  const svgWidth = contentWidth + shadowPadding;
  const svgHeight = contentHeight + shadowPadding;
  
  // Calculate equation position (centered)
  const equationX = contentWidth / 2 - (equationData.vbMinX + equationData.vbWidth / 2) * equationData.scale;
  const equationY = topHeight + middleHeight / 2 - (equationData.vbMinY + equationData.vbHeight / 2) * equationData.scale;
  
  // Shorthand for path drawing
  const r = borderRadius;
  const w = contentWidth;
  const h = contentHeight;
  
  // Top section path: rounded top corners, square bottom corners
  const topPath = `M 0,${r} Q 0,0 ${r},0 L ${w - r},0 Q ${w},0 ${w},${r} L ${w},${topHeight} L 0,${topHeight} Z`;
  
  // Middle section: simple rectangle, no rounded corners
  const middlePath = `M 0,${topHeight} L ${w},${topHeight} L ${w},${topHeight + middleHeight} L 0,${topHeight + middleHeight} Z`;
  
  // Bottom section path: square top corners, rounded bottom corners
  const bottomY = h - bottomHeight;
  const bottomPath = `M 0,${bottomY} L ${w},${bottomY} L ${w},${h - r} Q ${w},${h} ${w - r},${h} L ${r},${h} Q 0,${h} 0,${h - r} Z`;
  
  const svg = `
    <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${gradientDef}
        ${filterDef}
        ${shadowDef}
      </defs>
      
      <!-- Background group with shadow and effects -->
      <g filter="url(#${shadowId})">
        <g ${filter} opacity="${bgOpacity}">
          <!-- Top Section: Title (rounded top corners only) -->
          <path d="${topPath}" fill="${topColor}"/>
          
          <!-- Middle Section: Equation background (no rounded corners) -->
          <path d="${middlePath}" fill="${middleFill}"/>
          
          <!-- Bottom Section: Node ID (rounded bottom corners only) -->
          <path d="${bottomPath}" fill="${bottomColor}"/>
        </g>
      </g>
      
      <!-- Text elements (separate from background for independent opacity) -->
      <g opacity="${textOpacity}">
        <text 
          x="8" 
          y="${topHeight / 2 + 4}" 
          fill="${textColor}" 
          font-size="${titleFontSize}" 
          font-weight="normal"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        >
          ${titleText}
        </text>
        
        <g transform="translate(${equationX}, ${equationY}) scale(${equationData.scale})">
          ${equationData.svgContent}
        </g>
        
        <text 
          x="${contentWidth/2}" 
          y="${contentHeight - bottomHeight / 2 + 3}" 
          text-anchor="middle" 
          fill="${textColor}" 
          font-size="${idFontSize}"
          font-family="monospace"
          opacity="0.7"
        >
          ${nodeId}
        </text>
      </g>
    </svg>
  `;
  
  return { svg, width: svgWidth, height: svgHeight };
}

/**
 * Get Cytoscape style for tester node
 */
export async function getTesterNodeStyle(
  node: Node,
  params: TesterNodeParams,
  theme: ColorTheme
): Promise<CytoscapeNodeStyle> {
  // Extract data
  const equation = node.properties?.equation as string || '';
  const titleText = node.title;
  const nodeId = node.id;
  
  // Resolve text color for MathJax
  const textColor = resolveColor(params.colorOverrides?.text, theme.node.text.color);
  
  // Render equation with MathJax
  const equationData = await renderMathJaxEquation(equation, textColor);
  
  // Build composite SVG with params
  const { svg, width, height } = renderSVG(titleText, nodeId, equationData, params, theme);
  
  // Encode SVG as data URI
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
