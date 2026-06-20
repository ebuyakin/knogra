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
import { isDebug } from '../../config/debug-flags';
import { getSetting } from '../../config';
import { getDefaultEdgeTypeId } from '../../config/edge-type-settings';

type EdgeBendCommand = 'strengthDown' | 'strengthUp' | 'positionTowardSource' | 'positionTowardTarget' | 'resetOverride';

interface EdgeBendOptions {
  largeStep?: boolean;
}

const EDGE_BEND_DISTANCE_STEP = 25;
const EDGE_BEND_DISTANCE_LARGE_STEP = 100;
const EDGE_BEND_DISTANCE_MIN = -1200;
const EDGE_BEND_DISTANCE_MAX = 1200;
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
  hasStyleOverride: boolean;
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
    const typeId = cyEdge.data('typeId') || getDefaultEdgeTypeId();
    const edgeType = graphStore.edgeTypes.find(type => type.id === typeId);
    const themeId = this.#getThemeId();
    const thematicStyle = edgeType
      ? StyleGenerator.generateEdgeStyleForType(edgeType, themeId)
      : StyleGenerator.generateEdgeStyle(themeId).style;
    const editableStyleParams = {
      ...thematicStyle,
      ...(design.params ?? {})
    };
    const hasStyleOverride = StyleGenerator.hasEdgeStyleOverride(design);

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
      typeId,
      edgeTypes: graphStore.edgeTypes,
      sourceNode: sourceInfo,
      targetNode: targetInfo,
      sceneId,
      containerRect
    };
  }

  /**
   * Update edge's scene-specific style (design params)
   */
  async updateEdgeStyle(
    edgeId: EdgeId,
    params: Record<string, unknown> | null
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

    // === DIAGNOSTIC: Before state ===
    if (isDebug('d_edgeStyle')) {
      const bypassesBefore = Object.keys((cyEdge as any)[0]?._private?.style || {}).filter(
        k => (cyEdge as any)[0]._private.style[k]?.bypass
      );
      const computedBefore = {
        'curve-style': cyEdge.style('curve-style'),
        'line-color': cyEdge.style('line-color'),
        'width': cyEdge.style('width'),
        'opacity': cyEdge.style('opacity')
      };
      console.log(`[DIAG updateEdgeStyle] ${edgeId} BEFORE: bypasses=[${bypassesBefore}] computed=`, computedBefore);
      console.log(`[DIAG updateEdgeStyle] ${edgeId} params=`, params);
    }

    if (params === null) {
      cyEdge.data('design', { id: 'default' as DesignId, params: {} });
      const stylesheet = (this.#cy.style() as any).json();
      const updatedStylesheet = StyleGenerator.removeEdgeFromStylesheet(stylesheet, edgeId);
      this.#cy.style().fromJson(updatedStylesheet).update();
      if (isDebug('d_scene')) console.log(`Scene: Cleared edge ${edgeId} style override`);
      return;
    }

    const design = { id: 'custom' as DesignId, params };
    cyEdge.data('design', design);

    const themeId = this.#getThemeId();
    const edgeStyle = StyleGenerator.generateEdgeStyleForId(edgeId, design, themeId);
    if (isDebug('d_edgeStyle')) console.log(`[DIAG updateEdgeStyle] ${edgeId} generatedStyle=`, edgeStyle);

    const stylesheet = (this.#cy.style() as any).json();
    const selectorTarget = `edge[id = "${edgeId}"]`;

    const updatedStylesheet = StyleGenerator.updateEdgeInStylesheet(
      stylesheet,
      edgeId,
      edgeStyle
    );
    if (isDebug('d_edgeStyle')) {
      const hadRule = stylesheet.some((r: any) => r.selector === selectorTarget);
      const hasRule = updatedStylesheet.some((r: any) => r.selector === selectorTarget);
      console.log(`[DIAG updateEdgeStyle] ${edgeId} hadRule=${hadRule} hasRule=${hasRule} totalRules=${updatedStylesheet.length}`);
    }

    this.#cy.style().fromJson(updatedStylesheet).update();

    // === DIAGNOSTIC: After state ===
    if (isDebug('d_edgeStyle')) {
      const bypassesAfter = Object.keys((cyEdge as any)[0]?._private?.style || {}).filter(
        k => (cyEdge as any)[0]._private.style[k]?.bypass
      );
      const computedAfter = {
        'curve-style': cyEdge.style('curve-style'),
        'line-color': cyEdge.style('line-color'),
        'width': cyEdge.style('width'),
        'opacity': cyEdge.style('opacity')
      };
      console.log(`[DIAG updateEdgeStyle] ${edgeId} AFTER: bypasses=[${bypassesAfter}] computed=`, computedAfter);
      console.log(`[DIAG updateEdgeStyle] ${edgeId} params['curve-style']=${params['curve-style']} computed=${cyEdge.style('curve-style')} MATCH=${String(params['curve-style']) === cyEdge.style('curve-style')}`);
    }

    if (isDebug('d_scene')) console.log(`Scene: Updated edge ${edgeId} style (custom params)`);
  }

  async adjustEdgeBend(
    edgeId: EdgeId,
    command: EdgeBendCommand,
    options: EdgeBendOptions = {}
  ): Promise<boolean> {
    if (command === 'resetOverride') {
      return this.resetEdgeStyleOverride(edgeId);
    }

    const params = this.#buildBentEdgeParams(edgeId, command, options.largeStep === true);
    if (!params) return false;

    await this.updateEdgeStyle(edgeId, params);
    return true;
  }

  async resetEdgeStyleOverride(edgeId: EdgeId): Promise<boolean> {
    if (!isEditMode()) return false;

    const cyEdge = this.#cy.getElementById(edgeId);
    if (cyEdge.length === 0) return false;

    await this.updateEdgeStyle(edgeId, null);
    return true;
  }

  #buildBentEdgeParams(
    edgeId: EdgeId,
    command: Exclude<EdgeBendCommand, 'resetOverride'>,
    largeStep: boolean
  ): Record<string, unknown> | null {
    if (!isEditMode()) return null;

    const context = this.getEdgeEditContext(edgeId);
    if (!context) return null;

    const params = { ...context.editableStyleParams };
    const distanceStep = largeStep ? EDGE_BEND_DISTANCE_LARGE_STEP : EDGE_BEND_DISTANCE_STEP;
    const weightStep = largeStep ? EDGE_BEND_WEIGHT_LARGE_STEP : EDGE_BEND_WEIGHT_STEP;
    const curveStyle = typeof params['curve-style'] === 'string'
      ? params['curve-style']
      : getSetting('edge.defaultCurveStyle');
    if (curveStyle !== 'bezier' && curveStyle !== 'unbundled-bezier') return null;

    const distanceFallback = curveStyle === 'unbundled-bezier'
      ? getSetting('edge.bezierControlDistances')
      : [0];
    const weightFallback = [EDGE_BEND_DEFAULT_WEIGHT];
    const distances = this.#readNumericArrayParam(params['control-point-distances'], distanceFallback);
    const weights = this.#readNumericArrayParam(params['control-point-weights'], weightFallback);
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

    params['curve-style'] = 'unbundled-bezier';
    params['control-point-distances'] = nextDistances;
    params['control-point-weights'] = nextWeights;

    return params;
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
