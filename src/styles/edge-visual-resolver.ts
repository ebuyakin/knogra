/**
 * Pure edge visual-state resolver.
 *
 * This module owns the declarative edge style cascade. It does not read
 * GraphStore, touch Cytoscape, or mutate runtime state.
 */

import type { Edge, EdgeStyleSlotId, EdgeType, EdgeTypeVisibilityMode, Scene } from '../core/main-types';
import type { ColorTheme, EdgeStyle } from '../core/style-types';
import { getTheme } from './themes';

type EdgeDesign = { id: string; params: Record<string, unknown> } | null | undefined;

/** A scene edge's authored overrides: visual style (`design`) + curve/layout (`curve`). */
export interface EdgeOverrideInput {
  design?: EdgeDesign;
  curve?: Record<string, unknown>;
}

/**
 * Cytoscape style keys that describe an edge's curve/layout (its path), as
 * opposed to its visual style (colour/width/arrow). This is the single source
 * of truth for the visual-vs-curve partition; every module that splits, strips,
 * or merges edge overrides imports from here.
 */
export const CURVE_STYLE_KEYS: readonly string[] = [
  'curve-style',
  'control-point-distances',
  'control-point-weights',
  'segment-distances',
  'segment-weights',
  'segment-radii',
  'edge-distances',
  'taxi-direction',
  'taxi-turn',
  'taxi-radius'
];

const CURVE_KEY_SET = new Set<string>(CURVE_STYLE_KEYS);

/** Keep only curve/layout keys from a raw params bag. */
export function pickCurveParams(params: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!params) return {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(params)) {
    if (CURVE_KEY_SET.has(key)) out[key] = params[key];
  }
  return out;
}

/** Keep only visual-style keys from a raw params bag. */
export function pickVisualParams(params: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!params) return {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(params)) {
    if (!CURVE_KEY_SET.has(key)) out[key] = params[key];
  }
  return out;
}

/**
 * Resolve the effective curve override for an edge. Prefers the dedicated
 * `curve` field; falls back to curve keys embedded in a legacy `design.params`
 * so old workspaces render correctly without migration. Empty when neither
 * exists, letting the theme/type default (automatic bezier) apply.
 */
function resolveCurveParams(
  curve: Record<string, unknown> | null | undefined,
  legacyParams: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (curve && Object.keys(curve).length > 0) return curve;
  return pickCurveParams(legacyParams);
}

export interface ResolvedEdgeVisualState {
  style: Record<string, unknown>;
  opacity: number;
  events: 'yes' | 'no';
  visibilityMode: EdgeTypeVisibilityMode;
}

export function resolveBaseEdgeStyle(themeId: string = 'dark'): Record<string, unknown> {
  return edgeStyleToCytoscape(getTheme(themeId).edge);
}

export function resolveEdgeTypeStyle(edgeType: EdgeType | undefined, themeId: string = 'dark'): Record<string, unknown> {
  if (!edgeType) return resolveBaseEdgeStyle(themeId);

  const theme = getTheme(themeId);
  const thematicStyle = getEdgeStyleSlot(theme, edgeType.thematicStyleSlotId);
  return withEdgeUnderlayColor({
    ...edgeStyleToCytoscape(thematicStyle),
    ...(edgeType.styleOverride ?? {})
  });
}

/**
 * Build the sparse per-edge override style for the `edge[id = "…"]` stylesheet
 * rule. Emits only the keys the edge actually overrides (visual + curve), so
 * unspecified properties fall through to the edge-type/base rules. This is what
 * lets a curve-only edge keep its edge-type colour, and lets theme changes reach
 * edges that were only bent.
 */
export function resolveEdgeDesignStyle(
  design: EdgeDesign,
  curve?: Record<string, unknown>
): Record<string, unknown> {
  const visual = pickVisualParams(design?.params);
  const curveOverride = resolveCurveParams(curve, design?.params);
  return withEdgeUnderlayColor({ ...visual, ...curveOverride });
}

export function resolveSceneEdgeVisualState(args: {
  edge: Edge;
  scene: Scene;
  edgeTypes: EdgeType[];
  themeId?: string;
}): ResolvedEdgeVisualState {
  const themeId = args.themeId ?? args.scene.themeId ?? 'dark';
  const edgeType = args.edgeTypes.find(type => type.id === args.edge.typeId);
  const sceneEdge = args.scene.edges[args.edge.id];
  const designParams = sceneEdge?.design?.params;
  const curveOverride = resolveCurveParams(sceneEdge?.curve, designParams);
  const visibilityMode = args.scene.edgeTypeVisibility?.[args.edge.typeId] ?? 'show';
  const baseStyle = withEdgeUnderlayColor({
    ...resolveEdgeTypeStyle(edgeType, themeId),
    ...pickVisualParams(designParams),
    ...curveOverride
  });
  const baseOpacity = typeof baseStyle.opacity === 'number' ? baseStyle.opacity : 1;
  const visibilityStyle = resolveEdgeTypeVisibilityStyle(visibilityMode);
  const visibilityOpacity = typeof visibilityStyle.opacity === 'number' ? visibilityStyle.opacity : 1;
  const opacity = baseOpacity * visibilityOpacity;
  const events = (visibilityStyle.events as 'yes' | 'no' | undefined) ?? 'yes';
  const style = { ...baseStyle, opacity, events };

  return {
    style,
    opacity,
    events,
    visibilityMode
  };
}

export function resolveEdgeTypeVisibilityStyle(mode: EdgeTypeVisibilityMode): Record<string, unknown> {
  if (mode === 'hide') return { opacity: 0, events: 'no' };
  if (mode === 'dim') return { opacity: 0.3};
  return { opacity: 1, events: 'yes' };
}

export function edgeStyleToCytoscape(edgeStyle: EdgeStyle): Record<string, unknown> {
  const lineColor = edgeStyle.line.color;
  const arrowColor = edgeStyle.arrow.color || lineColor;

  return {
    'width': edgeStyle.width ?? 2,
    'line-color': lineColor,
    'underlay-color': lineColor,
    'line-opacity': edgeStyle.line.opacity ?? 1.0,
    'target-arrow-color': arrowColor,
    'target-arrow-shape': edgeStyle.arrowShape ?? 'triangle',
    'arrow-scale': edgeStyle.arrowScale ?? 1.0,
    'curve-style': edgeStyle.curveStyle ?? 'bezier'
  };
}

function withEdgeUnderlayColor(style: Record<string, unknown>): Record<string, unknown> {
  const lineColor = style['line-color'];
  if (typeof lineColor !== 'string') return style;
  return { ...style, 'underlay-color': lineColor };
}

function getEdgeStyleSlot(theme: ColorTheme, slotId: EdgeStyleSlotId): EdgeStyle {
  const explicitSlot = theme.edgeStyleSlots?.[slotId];
  if (explicitSlot) return explicitSlot;

  const base = theme.edge;
  if (slotId === 'edge-style-2') {
    return {
      ...base,
      line: { ...base.line, color: theme.node.accent.color },
      arrow: { ...base.arrow, color: theme.node.accent.color },
      width: 2,
      arrowShape: 'diamond',
      arrowScale: 1,
      curveStyle: 'bezier'
    };
  }

  if (slotId === 'edge-style-3') {
    return {
      ...base,
      line: { ...base.lineSecondary, opacity: base.lineSecondary.opacity ?? 0.75 },
      arrow: { ...base.arrow, color: base.lineSecondary.color, opacity: base.lineSecondary.opacity ?? 0.75 },
      width: 2,
      arrowShape: 'circle',
      arrowScale: 1,
      curveStyle: 'bezier'
    };
  }

  return base;
}