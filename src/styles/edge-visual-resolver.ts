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

export function resolveEdgeDesignStyle(design: EdgeDesign, themeId: string = 'dark'): Record<string, unknown> {
  const defaultStyle = resolveBaseEdgeStyle(themeId);
  if (!design?.params) return defaultStyle;

  return withEdgeUnderlayColor({
    ...defaultStyle,
    ...design.params
  });
}

export function resolveSceneEdgeVisualState(args: {
  edge: Edge;
  scene: Scene;
  edgeTypes: EdgeType[];
  themeId?: string;
}): ResolvedEdgeVisualState {
  const themeId = args.themeId ?? args.scene.themeId ?? 'dark';
  const edgeType = args.edgeTypes.find(type => type.id === args.edge.typeId);
  const edgeDesign = args.scene.edges[args.edge.id]?.design;
  const visibilityMode = args.scene.edgeTypeVisibility?.[args.edge.typeId] ?? 'show';
  const baseStyle = withEdgeUnderlayColor({
    ...resolveEdgeTypeStyle(edgeType, themeId),
    ...(edgeDesign?.params ?? {})
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