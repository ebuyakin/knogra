/**
 * Theme Preview
 * Static sample of a theme: three nodes in their normal, central and selected
 * states, joined by edges in the theme's default edge style.
 *
 * The nodes are the real thing — `getNodeStyle()` returns a self-contained
 * data-URI SVG with the theme's fill, gradient, vignette, shadow and text
 * already baked in, so the preview cannot drift from what the graph renders.
 * Borders are stroked around the node box, which is where Cytoscape draws them.
 *
 * The returned SVG is transparent: the caller paints the canvas colour behind
 * it, so the colour fills the whole strip rather than just the scaled viewBox.
 */

import { getNodeStyle } from '../../styles/designs/design-registry';
import { resolveEdgeStyleSlot } from '../../styles/edge-visual-resolver';
import { getDefaultEdgeStyleSlotId } from '../../config/edge-type-settings';
import type { Node, NodeId } from '../../core/main-types';
import type { BorderStyleProps, ColorTheme, EdgeStyle } from '../../core/style-types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Node states shown, in order. Titles double as the sample text. */
const PREVIEW_TITLES = ['Node', 'Central', 'Selected'];

/** Horizontal space between node boxes, in viewBox units. */
const NODE_GAP = 44;

/** Margin around the row, in viewBox units. */
const PREVIEW_PADDING = 12;

const ARROW_PATHS: Record<string, string> = {
  triangle: 'M0,0 L6,3 L0,6 z',
  diamond: 'M0,3 L3,0 L6,3 L3,6 z'
};

/** Marker ids must be unique per document, so instances take a serial number. */
let markerSerial = 0;

interface PreviewNode {
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
  border: BorderStyleProps;
}

// =============================================================================
// SVG HELPERS
// =============================================================================

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

function buildArrowMarker(id: string, style: EdgeStyle): SVGMarkerElement {
  const marker = svgElement('marker', {
    id,
    markerWidth: 6,
    markerHeight: 6,
    refX: 6,
    refY: 3,
    orient: 'auto',
    markerUnits: 'strokeWidth'
  });

  const fill = style.arrow.color;
  const fillOpacity = style.arrow.opacity ?? 1;
  const shape = style.arrowShape ?? 'triangle';

  marker.appendChild(
    shape === 'circle'
      ? svgElement('circle', { cx: 3, cy: 3, r: 3, fill, 'fill-opacity': fillOpacity })
      : svgElement('path', { d: ARROW_PATHS[shape] ?? ARROW_PATHS.triangle, fill, 'fill-opacity': fillOpacity })
  );

  return marker;
}

function buildEdgeLine(
  from: PreviewNode,
  to: PreviewNode,
  style: EdgeStyle,
  markerId: string
): SVGLineElement {
  return svgElement('line', {
    x1: from.x + from.width,
    y1: from.y + from.height / 2,
    x2: to.x,
    y2: to.y + to.height / 2,
    stroke: style.line.color,
    'stroke-width': style.width ?? 2,
    'stroke-opacity': style.line.opacity ?? 1,
    'marker-end': `url(#${markerId})`
  });
}

function buildBorderOutline(node: PreviewNode): SVGRectElement | null {
  const width = node.border.width ?? 0;
  if (width <= 0) return null;

  // Inset by half the stroke so the outline sits inside the node box, the same
  // way a Cytoscape border does.
  return svgElement('rect', {
    x: node.x + width / 2,
    y: node.y + width / 2,
    width: Math.max(node.width - width, 0),
    height: Math.max(node.height - width, 0),
    rx: 8,
    fill: 'none',
    stroke: node.border.color,
    'stroke-width': width
  });
}

// =============================================================================
// PUBLIC API
// =============================================================================

function previewNode(title: string): Node {
  return { id: `theme-preview-${title}` as NodeId, title };
}

/** Build a scalable sample of the theme. Sized by its viewBox, not in pixels. */
export async function buildThemePreview(theme: ColorTheme): Promise<SVGSVGElement> {
  const borders: BorderStyleProps[] = [
    theme.node.border,
    theme.node.borderCentral,
    theme.node.borderSelected
  ];

  const styles = await Promise.all(
    PREVIEW_TITLES.map(title =>
      getNodeStyle(previewNode(title), { id: 'default-node', params: {} }, theme)
    )
  );

  const rowHeight = Math.max(...styles.map(style => style.height));
  let cursorX = PREVIEW_PADDING;

  const nodes: PreviewNode[] = styles.map((style, index) => {
    const node: PreviewNode = {
      x: cursorX,
      y: PREVIEW_PADDING + (rowHeight - style.height) / 2,
      width: style.width,
      height: style.height,
      image: style['background-image'],
      border: borders[index]
    };
    cursorX += style.width + NODE_GAP;
    return node;
  });

  const viewWidth = cursorX - NODE_GAP + PREVIEW_PADDING;
  const viewHeight = rowHeight + PREVIEW_PADDING * 2;

  const svg = svgElement('svg', {
    viewBox: `0 0 ${viewWidth} ${viewHeight}`,
    width: viewWidth,
    height: viewHeight,
    preserveAspectRatio: 'xMidYMid meet'
  });

  const edgeStyle = resolveEdgeStyleSlot(theme, getDefaultEdgeStyleSlotId());
  const markerId = `theme-preview-arrow-${markerSerial++}`;

  const defs = svgElement('defs', {});
  defs.appendChild(buildArrowMarker(markerId, edgeStyle));
  svg.appendChild(defs);

  for (let index = 0; index < nodes.length - 1; index++) {
    svg.appendChild(buildEdgeLine(nodes[index], nodes[index + 1], edgeStyle, markerId));
  }

  nodes.forEach(node => {
    svg.appendChild(
      svgElement('image', {
        href: node.image,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      })
    );

    const outline = buildBorderOutline(node);
    if (outline) svg.appendChild(outline);
  });

  return svg;
}

/** Append an alpha byte to a 6-digit hex colour; any other format passes through. */
function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const byte = Math.round(Math.min(Math.max(alpha, 0), 1) * 255);
  return `${color}${byte.toString(16).padStart(2, '0')}`;
}

/**
 * CSS `box-shadow` reproducing the theme's canvas vignette, which the running
 * app draws as an inset shadow on the graph container.
 *
 * Blur and spread are authored for a full-width viewport, so they are scaled by
 * how much narrower the preview is. Unscaled, a 200px blur would swallow a
 * 500px box and every vignetted theme would look identical.
 */
export function canvasVignetteShadow(theme: ColorTheme, previewWidth: number): string {
  const vignette = theme.canvas.background.vignette;
  if (!vignette?.strength) return '';

  const scale = previewWidth > 0 ? previewWidth / window.innerWidth : 1;
  const blur = Math.round((vignette.blur ?? 200) * scale);
  const spread = Math.round((vignette.spread ?? 50) * scale);
  const alpha = vignette.strength * (vignette.colorOpacity ?? 1);

  return `inset 0 0 ${blur}px ${spread}px ${withAlpha(vignette.color ?? '#000000', alpha)}`;
}
