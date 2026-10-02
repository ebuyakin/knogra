/**
 * Map render
 *
 * Elements and stylesheet for the map's own Cytoscape instance. Element ids
 * are opaque (`box-N`, `line-N`) and never addresses: a box's address changes
 * on every re-focus while its element persists, exactly as a shared node
 * persists through a scene transition. The tables in `MapElementIds` say which
 * element is which address; every element also carries `kind`, box or line,
 * so that anything added later (twin links, §11) can be told apart from what
 * geometry, drag and re-focus act on (docs/map-view.md §7.2). A box is styled with its node's default design (I5)
 * scaled per box; a line is drawn in its edge's direction so arrows stay
 * honest, whichever way it was walked, at a weight for its box: its type's
 * width and arrow scale thinned by the box's scale, set inline because a
 * data-mapped rule cannot multiply a base that differs by type.
 */

import type { Core, ElementDefinition } from 'cytoscape';
import type { Edge, EdgeId, EdgeType, Node, NodeId } from '../../core/main-types';
import { StyleGenerator } from '../../styles/style-generator';
import { resolveDefaultDesign } from './default-design';
import type { MapLayout } from './geometry';
import type { Address, LineKey, MapTree } from './map-tree';

export type MapElementKind = 'box' | 'line';

/** A node's rendered style at scale 1; every box of the node scales it. */
export type BoxBaseStyle = Record<string, number>;

/** Which element draws which box, by address, and which line, by its key (address and edge). */
export interface MapElementIds {
  boxes: Map<Address, string>;
  lines: Map<LineKey, string>;
}

let nextElementNumber = 0;

function allocateElementId(kind: 'box' | 'line'): string {
  nextElementNumber += 1;
  return `${kind}-${nextElementNumber}`;
}

function boxSelector(elementId: string): string {
  return `node[id = "${elementId}"]`;
}

export interface MapRenderInput {
  tree: MapTree;
  layout: MapLayout;
  nodeById: Map<NodeId, Node>;
  edgeById: Map<EdgeId, Edge>;
  edgeTypes: EdgeType[];
  themeId: string;
  lineBases: LineBases;
  /** Exponent on the box's scale for its line's weight (docs/map-view.md §3). */
  lineScalePower: number;
}

/** What an edge type's rule draws a line with at box scale 1: stroke width and arrow scale. */
export interface LineBase {
  width: number;
  arrowScale: number;
}

/** A line's drawn weight, plus how far apart a bundle of parallel lines spreads. */
export interface LineWeight extends LineBase {
  bundleStep: number;
}

/** The base of every edge type's rule, and the theme's for an edge whose type has no rule. */
export interface LineBases {
  base: LineBase;
  byType: Map<string, LineBase>;
}

type StyleRule = { selector: string; style: unknown };

/** Read the bases off the generated rules once per map, so re-weighting a line never compounds. */
export function lineBases(edgeTypes: EdgeType[], themeId: string): LineBases {
  const read = (style: Record<string, unknown>, fallback: LineBase): LineBase => ({
    width: typeof style.width === 'number' ? style.width : fallback.width,
    arrowScale: typeof style['arrow-scale'] === 'number' ? style['arrow-scale'] : fallback.arrowScale,
  });
  const base = read(StyleGenerator.generateEdgeStyle(themeId).style as Record<string, unknown>, { width: 2, arrowScale: 1 });
  const byType = new Map<string, LineBase>();
  for (const edgeType of edgeTypes) {
    byType.set(edgeType.id, read(StyleGenerator.generateEdgeStyleForType(edgeType, themeId) as Record<string, unknown>, base));
  }
  return { base, byType };
}

/**
 * A bundle of parallel lines spreads by this fraction of the line's drawn
 * length, between the floor and Cytoscape's default of 40, so that two lines
 * joining boxes a short way apart do not loop out around them: the
 * renderer's step is a fixed pixel distance, meant for scenes where edges are
 * long.
 */
const BUNDLE_SPREAD = 0.12;
const BUNDLE_STEP_MIN = 2;
const BUNDLE_STEP_MAX = 40;

/** A line's weight at its box's scale, the base thinned by scale to the power, and its bundle's spread from its drawn length. */
export function lineWeight(base: LineBase, scale: number, power: number, drawnLength: number): LineWeight {
  const factor = Math.pow(scale, power);
  const bundleStep = Math.max(BUNDLE_STEP_MIN, Math.min(BUNDLE_STEP_MAX, drawnLength * BUNDLE_SPREAD));
  return { width: base.width * factor, arrowScale: base.arrowScale * factor, bundleStep };
}

export function lineWeightStyle(weight: LineWeight): Record<string, number> {
  return { width: weight.width, 'arrow-scale': weight.arrowScale, 'control-point-step-size': weight.bundleStep };
}

/** The weight of each named line from the layout: its child's rendered scale under its edge type's base. Lines without an element are skipped. */
export function lineWeights(
  { tree, layout, edgeById, lineBases: bases, lineScalePower }: Pick<MapRenderInput, 'tree' | 'layout' | 'edgeById' | 'lineBases' | 'lineScalePower'>,
  ids: MapElementIds,
  keys: LineKey[]
): Array<{ elementId: string; weight: LineWeight }> {
  const lineByKey = new Map(tree.lines.map(line => [line.key, line]));
  const weights: Array<{ elementId: string; weight: LineWeight }> = [];
  for (const key of keys) {
    const elementId = ids.lines.get(key);
    const line = lineByKey.get(key);
    const edge = line ? edgeById.get(line.edgeId) : undefined;
    if (!elementId || !line || !edge) continue;
    const base = bases.byType.get(edge.typeId) ?? bases.base;
    const child = layout.positions.get(line.address);
    const parent = layout.positions.get(line.parentAddress);
    const drawnLength = child && parent ? Math.hypot(child.x - parent.x, child.y - parent.y) : BUNDLE_STEP_MAX / BUNDLE_SPREAD;
    weights.push({ elementId, weight: lineWeight(base, layout.scales.get(line.address) ?? 1, lineScalePower, drawnLength) });
  }
  return weights;
}

/** Parallel edges between two boxes are drawn as a bundle of curves; a lone line under bezier is straight, so the common case is unchanged. */
const BUNDLE_RULE: StyleRule = { selector: 'edge', style: { 'curve-style': 'bezier' } };

/** Set lines' weights inline; the type rule keeps everything else. */
export function restyleLines(cy: Core, lines: Array<{ elementId: string; weight: LineWeight }>): void {
  if (lines.length === 0) return;
  cy.startBatch();
  for (const { elementId, weight } of lines) cy.getElementById(elementId).style(lineWeightStyle(weight));
  cy.endBatch();
}

/** Replace the instance's contents with a whole map: fresh ids, fresh stylesheet. Base styles come from the caller, which laid the map out with their sizes. */
export function renderMap(cy: Core, input: MapRenderInput, baseStyles: Map<NodeId, BoxBaseStyle>): MapElementIds {
  const ids: MapElementIds = { boxes: new Map(), lines: new Map() };
  const boxAddresses = input.tree.boxes.map(box => box.address);
  const lineKeys = input.tree.lines.map(line => line.key);
  for (const address of boxAddresses) ids.boxes.set(address, allocateElementId('box'));
  for (const key of lineKeys) ids.lines.set(key, allocateElementId('line'));

  const stylesheet: StyleRule[] = [
    StyleGenerator.generateEdgeStyle(input.themeId),
    ...StyleGenerator.generateEdgeTypeStyles(input.edgeTypes, input.themeId),
    BUNDLE_RULE,
    ...boxRules(input, ids, boxAddresses, baseStyles),
    ...StyleGenerator.buildCentralAndSelectedRules(input.themeId),
  ];

  cy.elements().remove();
  cy.style().fromJson(stylesheet).update();
  cy.add(buildElements(input, ids, boxAddresses, lineKeys));
  restyleLines(cy, lineWeights(input, ids, lineKeys));
  return ids;
}

/** Add boxes and lines to a shown map, allocating their ids into `ids` and their rules into the stylesheet. */
export function addElements(
  cy: Core,
  input: MapRenderInput,
  ids: MapElementIds,
  boxAddresses: Address[],
  lineKeys: LineKey[],
  baseStyles: Map<NodeId, BoxBaseStyle>
): void {
  for (const address of boxAddresses) ids.boxes.set(address, allocateElementId('box'));
  for (const key of lineKeys) ids.lines.set(key, allocateElementId('line'));

  const rules = boxRules(input, ids, boxAddresses, baseStyles);
  if (rules.length > 0) {
    const stylesheet = readStylesheet(cy);
    // Before the central and selected rules, which must stay last (last match wins).
    const tail = stylesheet.findIndex(rule => rule.selector === 'node[?centralNode]');
    stylesheet.splice(tail < 0 ? stylesheet.length : tail, 0, ...rules);
    cy.style().fromJson(stylesheet).update();
  }
  cy.add(buildElements(input, ids, boxAddresses, lineKeys));
  restyleLines(cy, lineWeights(input, ids, lineKeys));
}

/** Remove elements and the per-box rules that named them; lines go with their boxes. */
export function removeElements(cy: Core, elementIds: string[]): void {
  if (elementIds.length === 0) return;
  let collection = cy.collection();
  for (const elementId of elementIds) collection = collection.union(cy.getElementById(elementId));
  cy.remove(collection);

  const selectors = new Set(elementIds.map(boxSelector));
  const stylesheet = readStylesheet(cy).filter(rule => !selectors.has(rule.selector));
  cy.style().fromJson(stylesheet).update();
}

/** Rewrite the rules of the given boxes at new scales; positions are untouched. */
export function restyleBoxes(cy: Core, boxes: Array<{ elementId: string; baseStyle: BoxBaseStyle; scale: number }>): void {
  if (boxes.length === 0) return;
  const stylesheet = readStylesheet(cy);
  for (const { elementId, baseStyle, scale } of boxes) {
    const rule = { selector: boxSelector(elementId), style: scaledStyle(baseStyle, scale) };
    const index = stylesheet.findIndex(existing => existing.selector === rule.selector);
    if (index >= 0) stylesheet[index] = rule;
    else stylesheet.unshift(rule);
  }
  cy.style().fromJson(stylesheet).update();
  // Drop any inline size so the regenerated rule takes effect.
  for (const { elementId } of boxes) cy.getElementById(elementId).removeStyle('width height');
}

/** What a box element says about itself; rewritten for survivors on re-focus. */
export function updateBoxData(cy: Core, elementId: string, data: { address: Address; depth: number; centralNode: boolean }): void {
  cy.getElementById(elementId).data(data);
}

/** What a line element says about itself; rewritten for reused lines on re-focus. */
export function updateLineData(cy: Core, elementId: string, data: { address: Address }): void {
  cy.getElementById(elementId).data(data);
}

export function scaledSize(baseStyle: BoxBaseStyle, scale: number): { width: number; height: number } {
  return { width: baseStyle.width * scale, height: baseStyle.height * scale };
}

function scaledStyle(baseStyle: BoxBaseStyle, scale: number): Record<string, unknown> {
  return { ...baseStyle, ...scaledSize(baseStyle, scale) };
}

function readStylesheet(cy: Core): StyleRule[] {
  return (cy.style() as unknown as { json(): StyleRule[] }).json();
}

/** One style per node, generated once; twins share it. Called before layout, which needs the sizes. */
export async function ensureBaseStyles(
  { tree, nodeById, themeId }: Pick<MapRenderInput, 'tree' | 'nodeById' | 'themeId'>,
  baseStyles: Map<NodeId, BoxBaseStyle>
): Promise<void> {
  for (const box of tree.boxes) {
    if (baseStyles.has(box.nodeId)) continue;
    const node = nodeById.get(box.nodeId);
    if (!node) continue;
    const style = (await StyleGenerator.generateNodeStyle(node, resolveDefaultDesign(node), themeId)) as BoxBaseStyle;
    baseStyles.set(box.nodeId, style);
  }
}

function boxRules({ tree, layout }: MapRenderInput, ids: MapElementIds, addresses: Address[], baseStyles: Map<NodeId, BoxBaseStyle>): StyleRule[] {
  const boxByAddress = new Map(tree.boxes.map(box => [box.address, box]));
  const rules: StyleRule[] = [];
  for (const address of addresses) {
    const box = boxByAddress.get(address);
    const elementId = ids.boxes.get(address);
    const baseStyle = box ? baseStyles.get(box.nodeId) : undefined;
    if (!box || !elementId || !baseStyle) continue;
    rules.push({ selector: boxSelector(elementId), style: scaledStyle(baseStyle, layout.scales.get(address) ?? 1) });
  }
  return rules;
}

function buildElements(
  { tree, layout, nodeById, edgeById }: MapRenderInput,
  ids: MapElementIds,
  boxAddresses: Address[],
  lineKeys: LineKey[]
): ElementDefinition[] {
  const boxByAddress = new Map(tree.boxes.map(box => [box.address, box]));
  const lineByKey = new Map(tree.lines.map(line => [line.key, line]));
  const elements: ElementDefinition[] = [];

  for (const address of boxAddresses) {
    const box = boxByAddress.get(address);
    const node = box ? nodeById.get(box.nodeId) : undefined;
    const position = layout.positions.get(address);
    const elementId = ids.boxes.get(address);
    if (!box || !node || !position || !elementId) continue;
    elements.push({
      group: 'nodes',
      data: {
        id: elementId,
        kind: 'box' satisfies MapElementKind,
        address,
        nodeId: box.nodeId,
        depth: box.depth,
        title: node.title,
        centralNode: box.depth === 0,
      },
      // A copy: Cytoscape keeps the object it is given as the element's live
      // position, and the layout is the feature's data, not the instance's.
      position: { x: position.x, y: position.y },
    });
  }

  for (const key of lineKeys) {
    const line = lineByKey.get(key);
    const edge = line ? edgeById.get(line.edgeId) : undefined;
    const elementId = ids.lines.get(key);
    const childId = line ? ids.boxes.get(line.address) : undefined;
    const parentId = line ? ids.boxes.get(line.parentAddress) : undefined;
    if (!line || !edge || !elementId || !childId || !parentId) continue;
    elements.push({
      group: 'edges',
      data: {
        id: elementId,
        kind: 'line' satisfies MapElementKind,
        edgeId: line.edgeId,
        typeId: edge.typeId,
        address: line.address,
        source: line.reversed ? childId : parentId,
        target: line.reversed ? parentId : childId,
      },
    });
  }

  return elements;
}
