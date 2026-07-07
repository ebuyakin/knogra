/**
 * SceneEdgeOps
 * Edge operations within a scene: exclude, edit context, style updates, show hidden edges
 * Extracted from Scene to keep files under 300 lines
 */

import type { Core } from 'cytoscape';
import type { SceneId, NodeId, EdgeId, DesignId, Edge, EdgeType, EdgeTypeId } from '../../core/main-types';

import { graphStore } from '../../storage/graph-store';
import { isEditMode } from '../../storage/app-mode';
import { StyleGenerator } from '../../styles/style-generator';
import { pickCurveParams, pickVisualParams } from '../../styles/edge-visual-resolver';
import { isDebug } from '../../config/debug-flags';
import { getSetting } from '../../config';
import { getDefaultEdgeTypeId } from '../../config/edge-type-settings';

type EdgeBendCommand = 'strengthDown' | 'strengthUp' | 'positionTowardSource' | 'positionTowardTarget' | 'resetOverride';

interface EdgeBendOptions {
  largeStep?: boolean;
}

const EDGE_BEND_DISTANCE_STEP = 25;
const EDGE_BEND_DISTANCE_LARGE_STEP = 200;
const EDGE_BEND_DISTANCE_MIN = -2000;
const EDGE_BEND_DISTANCE_MAX = 2000;
const EDGE_BEND_WEIGHT_STEP = 0.05;
const EDGE_BEND_WEIGHT_LARGE_STEP = 0.2;
const EDGE_BEND_WEIGHT_MIN = 0.02;
const EDGE_BEND_WEIGHT_MAX = 0.98;
const EDGE_BEND_DEFAULT_WEIGHT = 0.5;

/**
 * Context needed to open EdgeEditor for a specific edge
 */
export interface EdgeEditContext {
  edgeId: EdgeId;
  design: { id: DesignId; params: Record<string, unknown> };
  editableStyleParams: Record<string, unknown>;
  /** True when the edge carries a visual-style override (colour/width/opacity/arrow). */
  hasStyleOverride: boolean;
  /** Effective curve/layout params for this edge; empty = default automatic bezier. */
  curveParams: Record<string, unknown>;
  typeId: EdgeTypeId;
  edgeTypes: EdgeType[];
  sourceNode: { id: NodeId; title: string };
  targetNode: { id: NodeId; title: string };
  sceneId: SceneId;
  containerRect: DOMRect;
}

export class SceneEdgeOps {
  #cy: Core;
  /** Provided by Scene — returns current scene ID */
  #getSceneId: () => SceneId | null;
  /** Provided by Scene — returns current theme ID */
  #getThemeId: () => string;

  constructor(
    cy: Core,
    getSceneId: () => SceneId | null,
    getThemeId: () => string
  ) {
    this.#cy = cy;
    this.#getSceneId = getSceneId;
    this.#getThemeId = getThemeId;
  }

  /**
   * Exclude edge from scene (not from database)
   */
  excludeEdge(edgeId: EdgeId): void {
    if (!isEditMode()) {
      console.warn('Cannot exclude edges in View mode');
      return;
    }

    const cyEdge = this.#cy.getElementById(edgeId);
    if (cyEdge.length === 0) {
      console.warn(`Edge ${edgeId} not in scene`);
      return;
    }

    cyEdge.remove();

    if (isDebug('d_scene')) console.log(`Scene: Excluded edge ${edgeId} from scene`);
  }

  /**
   * Get all context needed to open EdgeEditor for an edge
   * Returns null if edge not found in current scene
   */
  getEdgeEditContext(edgeId: EdgeId): EdgeEditContext | null {
    const cyEdge = this.#cy.getElementById(edgeId);
    if (cyEdge.length === 0) {
      return null;
    }

    const design = cyEdge.data('design') || { id: 'default', params: {} };
    const curveData = cyEdge.data('curve') as Record<string, unknown> | undefined;
    const typeId = cyEdge.data('typeId') || getDefaultEdgeTypeId();
    const edgeType = graphStore.edgeTypes.find(type => type.id === typeId);
    const themeId = this.#getThemeId();
    const thematicStyle = edgeType
      ? StyleGenerator.generateEdgeStyleForType(edgeType, themeId)
      : StyleGenerator.generateEdgeStyle(themeId).style;
    const designVisual = pickVisualParams(design.params);
    const editableStyleParams = {
      ...pickVisualParams(thematicStyle),
      ...designVisual
    };
    // Curve is individual: prefer the dedicated `curve` field, fall back to any
    // legacy curve keys embedded in design.params (old workspaces), else empty.
    const curveParams = (curveData && Object.keys(curveData).length > 0)
      ? { ...curveData }
      : pickCurveParams(design.params);
    const hasStyleOverride = design.id === 'custom' || Object.keys(designVisual).length > 0;

    const sourceNode = cyEdge.source();
    const targetNode = cyEdge.target();

    const sourceInfo = {
      id: sourceNode.id() as NodeId,
      title: sourceNode.data('title') ?? sourceNode.id()
    };

    const targetInfo = {
      id: targetNode.id() as NodeId,
      title: targetNode.data('title') ?? targetNode.id()
    };

    const sceneId = this.#getSceneId() ?? ('unknown' as SceneId);

    const container = this.#cy.container();
    const containerRect = container
      ? container.getBoundingClientRect()
      : new DOMRect(0, 0, window.innerWidth, window.innerHeight);

    return {
      edgeId,
      design,
      editableStyleParams,
      hasStyleOverride,
      curveParams,
      typeId,
      edgeTypes: graphStore.edgeTypes,
      sourceNode: sourceInfo,
      targetNode: targetInfo,
      sceneId,
      containerRect
    };
  }

  /**
   * Update edge's scene-specific VISUAL style override (colour/width/opacity/arrow).
   * Curve/layout is handled independently by `updateEdgeCurve`. Pass null to clear.
   */
  async updateEdgeStyle(
    edgeId: EdgeId,
    visualParams: Record<string, unknown> | null
  ): Promise<void> {
    if (!isEditMode()) {
      console.warn('Cannot update edge style in View mode');
      return;
    }

    const cyEdge = this.#cy.getElementById(edgeId);
    if (cyEdge.length === 0) {
      console.warn(`Edge ${edgeId} not in scene`);
      return;
    }

    if (isDebug('d_edgeStyle')) console.log(`[d_edgeStyle] updateEdgeStyle ${edgeId} visualParams=`, visualParams);

    if (visualParams === null) {
      cyEdge.data('design', { id: 'default' as DesignId, params: {} });
    } else {
      // Guard: only visual keys belong in design; drop any stray curve keys.
      cyEdge.data('design', { id: 'custom' as DesignId, params: pickVisualParams(visualParams) });
    }

    this.#applyEdgeOverrideRule(edgeId);
    if (isDebug('d_edgeStyle')) console.log(`[d_edgeStyle] updateEdgeStyle ${edgeId} → design=`, cyEdge.data('design'));
    if (isDebug('d_scene')) console.log(`Scene: Updated edge ${edgeId} visual style`);
  }

  /**
   * Update edge's scene-specific CURVE/layout override. Pass null (or an empty
   * bag) to reset to the default automatic bezier.
   */
  async updateEdgeCurve(
    edgeId: EdgeId,
    curveParams: Record<string, unknown> | null
  ): Promise<void> {
    if (!isEditMode()) {
      console.warn('Cannot update edge curve in View mode');
      return;
    }

    const cyEdge = this.#cy.getElementById(edgeId);
    if (cyEdge.length === 0) {
      console.warn(`Edge ${edgeId} not in scene`);
      return;
    }

    if (isDebug('d_edgeStyle')) console.log(`[d_edgeStyle] updateEdgeCurve ${edgeId} curveParams=`, curveParams);

    const curve = curveParams ? pickCurveParams(curveParams) : {};
    if (Object.keys(curve).length === 0) {
      cyEdge.removeData('curve');
    } else {
      cyEdge.data('curve', curve);
    }

    // Strip any legacy curve keys lingering in design.params so they cannot
    // fight the dedicated field (relevant for old workspaces being edited).
    const design = cyEdge.data('design');
    if (design?.params && Object.keys(pickCurveParams(design.params)).length > 0) {
      cyEdge.data('design', { id: design.id, params: pickVisualParams(design.params) });
    }

    this.#applyEdgeOverrideRule(edgeId);
    if (isDebug('d_edgeStyle')) console.log(`[d_edgeStyle] updateEdgeCurve ${edgeId} → curve=`, cyEdge.data('curve'), 'design=', cyEdge.data('design'));
    if (isDebug('d_scene')) console.log(`Scene: Updated edge ${edgeId} curve`);
  }

  /** Rebuild (or drop) the per-edge stylesheet rule from the edge's current design + curve. */
  #applyEdgeOverrideRule(edgeId: EdgeId): void {
    const cyEdge = this.#cy.getElementById(edgeId);
    if (cyEdge.length === 0) return;

    const sceneEdge = {
      design: cyEdge.data('design'),
      curve: cyEdge.data('curve') as Record<string, unknown> | undefined
    };
    const hasOverride = StyleGenerator.hasEdgeStyleOverride(sceneEdge);
    const stylesheet = (this.#cy.style() as any).json();
    const updatedStylesheet = StyleGenerator.applyEdgeOverrideToStylesheet(
      stylesheet,
      edgeId,
      sceneEdge,
      this.#getThemeId()
    );
    this.#cy.style().fromJson(updatedStylesheet).update();

    if (isDebug('d_edgeStyle')) {
      console.log(
        `[d_edgeStyle] applyEdgeOverrideRule ${edgeId}: ${hasOverride ? 'rule written' : 'rule removed'} ` +
        `computed curve-style=${cyEdge.style('curve-style')} line-color=${cyEdge.style('line-color')}`
      );
    }
  }

  async adjustEdgeBend(
    edgeId: EdgeId,
    command: EdgeBendCommand,
    options: EdgeBendOptions = {}
  ): Promise<boolean> {
    if (command === 'resetOverride') {
      return this.resetEdgeCurveOverride(edgeId);
    }

    const curveParams = this.#buildBentCurveParams(edgeId, command, options.largeStep === true);
    if (!curveParams) return false;

    await this.updateEdgeCurve(edgeId, curveParams);
    return true;
  }

  /** Reset an edge's curve/layout override back to the default automatic bezier. */
  async resetEdgeCurveOverride(edgeId: EdgeId): Promise<boolean> {
    if (!isEditMode()) return false;

    const cyEdge = this.#cy.getElementById(edgeId);
    if (cyEdge.length === 0) return false;

    await this.updateEdgeCurve(edgeId, null);
    return true;
  }

  #buildBentCurveParams(
    edgeId: EdgeId,
    command: Exclude<EdgeBendCommand, 'resetOverride'>,
    largeStep: boolean
  ): Record<string, unknown> | null {
    if (!isEditMode()) return null;

    const context = this.getEdgeEditContext(edgeId);
    if (!context) return null;

    const curve = { ...context.curveParams };
    const distanceStep = largeStep ? EDGE_BEND_DISTANCE_LARGE_STEP : EDGE_BEND_DISTANCE_STEP;
    const weightStep = largeStep ? EDGE_BEND_WEIGHT_LARGE_STEP : EDGE_BEND_WEIGHT_STEP;
    const curveStyle = typeof curve['curve-style'] === 'string'
      ? curve['curve-style']
      : getSetting('edge.defaultCurveStyle');
    if (curveStyle !== 'bezier' && curveStyle !== 'unbundled-bezier') return null;

    const distanceFallback = curveStyle === 'unbundled-bezier'
      ? getSetting('edge.bezierControlDistances')
      : [0];
    const weightFallback = [EDGE_BEND_DEFAULT_WEIGHT];
    const distances = this.#readNumericArrayParam(curve['control-point-distances'], distanceFallback);
    const weights = this.#readNumericArrayParam(curve['control-point-weights'], weightFallback);
    const nextDistances = distances.length > 0 ? [...distances] : [0];
    const nextWeights = weights.length > 0 ? [...weights] : [EDGE_BEND_DEFAULT_WEIGHT];
    const pointCount = Math.max(nextDistances.length, nextWeights.length, 1);
    while (nextDistances.length < pointCount) nextDistances.push(0);
    while (nextWeights.length < pointCount) nextWeights.push(EDGE_BEND_DEFAULT_WEIGHT);

    switch (command) {
      case 'strengthDown':
        nextDistances[0] = this.#clamp(nextDistances[0] - distanceStep, EDGE_BEND_DISTANCE_MIN, EDGE_BEND_DISTANCE_MAX);
        break;
      case 'strengthUp':
        nextDistances[0] = this.#clamp(nextDistances[0] + distanceStep, EDGE_BEND_DISTANCE_MIN, EDGE_BEND_DISTANCE_MAX);
        break;
      case 'positionTowardSource':
        nextWeights[0] = this.#clamp(nextWeights[0] - weightStep, EDGE_BEND_WEIGHT_MIN, EDGE_BEND_WEIGHT_MAX);
        break;
      case 'positionTowardTarget':
        nextWeights[0] = this.#clamp(nextWeights[0] + weightStep, EDGE_BEND_WEIGHT_MIN, EDGE_BEND_WEIGHT_MAX);
        break;
    }

    curve['curve-style'] = 'unbundled-bezier';
    curve['control-point-distances'] = nextDistances;
    curve['control-point-weights'] = nextWeights;

    return curve;
  }

  #readNumericArrayParam(value: unknown, fallback: number[]): number[] {
    const source = Array.isArray(value) ? value : fallback;
    return source
      .map(item => (typeof item === 'number' ? item : parseFloat(String(item))))
      .filter(item => !Number.isNaN(item));
  }

  #clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * Include into the current scene every graph edge incident to `nodeId`
   * whose other endpoint is already in cy. Edges are pulled from
   * `graphStore.edges` (the database) — including ones that were never
   * part of the scene before. Parallel edges (duplicates) are all included,
   * which is useful for surfacing inconsistencies.
   *
   * This is conceptually an "include" operation (analogous to including a
   * node into a scene), not a fold/expand. The scene's edge record is
   * updated on the next debounced save via the standard graph-saver pipeline
   * (cy is the source of truth between saves).
   *
   * Folded nodes are naturally excluded because they are not in cy.
   *
   * Returns the number of edges added.
   */
  includeAllIncidentEdges(nodeId: NodeId): number {
    if (!isEditMode()) {
      console.warn('Cannot include edges in View mode');
      return 0;
    }

    const cyNode = this.#cy.getElementById(nodeId);
    if (cyNode.length === 0) {
      console.warn(`Node ${nodeId} not in scene`);
      return 0;
    }

    const addedCount = this.#includeMatchingSceneEdges(edge =>
      edge.sourceId === nodeId || edge.targetId === nodeId
    );

    if (addedCount === 0) {
      if (isDebug('d_scene')) console.log(`No new incident edges to include for node ${nodeId}`);
      return 0;
    }

    if (isDebug('d_scene')) console.log(`Scene: Included ${addedCount} incident edges for node ${nodeId}`);
    return addedCount;
  }

  /**
   * Include into the current scene every graph edge whose endpoints are both
   * already represented by nodes in cy.
   *
   * Returns the number of edges added.
   */
  includeAllSceneEdges(): number {
    if (!isEditMode()) {
      console.warn('Cannot include edges in View mode');
      return 0;
    }

    const addedCount = this.#includeMatchingSceneEdges(() => true);

    if (addedCount === 0) {
      if (isDebug('d_scene')) console.log('No new scene edges to include');
      return 0;
    }

    if (isDebug('d_scene')) console.log(`Scene: Included ${addedCount} scene edges`);
    return addedCount;
  }

  #includeMatchingSceneEdges(matchesEdge: (edge: Edge) => boolean): number {
    const nodesInCy = new Set<NodeId>(
      this.#cy.nodes().map(n => n.id() as NodeId)
    );
    const edgesInCy = new Set<EdgeId>(
      this.#cy.edges().map(e => e.id() as EdgeId)
    );

    const toAdd = graphStore.edges.filter(edge =>
      matchesEdge(edge) &&
      nodesInCy.has(edge.sourceId) &&
      nodesInCy.has(edge.targetId) &&
      !edgesInCy.has(edge.id)
    );

    if (toAdd.length === 0) {
      return 0;
    }

    for (const edge of toAdd) {
      this.#cy.add({
        group: 'edges',
        data: {
          ...edge,
          source: edge.sourceId,
          target: edge.targetId,
          design: { id: 'default', params: {} }
        }
      });
    }

    return toAdd.length;
  }
}
