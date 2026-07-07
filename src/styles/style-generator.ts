/**
 * StyleGenerator - Pure style generation functions
 * Generates Cytoscape CSS from node/edge designs and themes
 * Stateless class - all methods are static
 * 
 * Structure:
 * 1. PRIMITIVES - generateNodeStyle, generateEdgeStyle
 * 2. SCENE - generateSceneStylesheet
 * 3. STYLESHEET OPERATIONS - addNodesToStylesheet, updateNodeInStylesheet, buildCentralAndSelectedRules
 */

import type { Node, Scene, NodeId, EdgeId, EdgeType, EdgeTypeId, EdgeTypeVisibilityMode } from '../core/main-types';
import { getTheme } from './themes';
import { getNodeStyle } from './designs/design-registry';
import {
  resolveBaseEdgeStyle,
  resolveEdgeDesignStyle,
  resolveEdgeTypeStyle,
  resolveEdgeTypeVisibilityStyle,
  pickCurveParams,
  type EdgeOverrideInput
} from './edge-visual-resolver';

export class StyleGenerator {
  // ===========================================================================
  // PRIMITIVES
  // ===========================================================================

  /**
   * Generate style for a single node
   * Pure function - takes node data, design config, themeId → returns CSS
   */
  static async generateNodeStyle(
    node: Node,
    design: { id: string; params: Record<string, unknown> },
    themeId: string = 'dark'
  ): Promise<any> {
    const theme = getTheme(themeId);
    return await getNodeStyle(node, design as any, theme);
  }

  /**
   * Generate default edge style
   * Returns CSS for all edges based on theme
   */
  static generateEdgeStyle(themeId: string = 'dark'): { selector: string; style: any } {
    return {
      selector: 'edge',
      style: resolveBaseEdgeStyle(themeId)
    };
  }

  /** Generate type selector rules for all workspace edge types. */
  static generateEdgeTypeStyles(
    edgeTypes: EdgeType[],
    themeId: string = 'dark'
  ): Array<{ selector: string; style: any }> {
    return edgeTypes.map(edgeType => ({
      selector: `edge[typeId = "${edgeType.id}"]`,
      style: this.generateEdgeStyleForType(edgeType, themeId)
    }));
  }

  /** Generate final scene-local visibility rules for edge types. */
  static generateEdgeTypeVisibilityStyles(
    visibility: Record<EdgeTypeId, EdgeTypeVisibilityMode> | undefined
  ): Array<{ selector: string; style: any }> {
    if (!visibility) return [];

    return Object.entries(visibility)
      .filter((entry): entry is [EdgeTypeId, EdgeTypeVisibilityMode] => entry[1] !== 'show')
      .map(([edgeTypeId, mode]) => ({
        selector: this.#edgeTypeVisibilitySelector(edgeTypeId),
        style: resolveEdgeTypeVisibilityStyle(mode)
      }));
  }

  /** Generate the resolved thematic style for one edge type. */
  static generateEdgeStyleForType(edgeType: EdgeType, themeId: string = 'dark'): any {
    return resolveEdgeTypeStyle(edgeType, themeId);
  }

  /**
   * Generate style for a specific edge by ID
   * Supports hybrid approach: 'custom' design uses params directly, others could use templates (future)
   *
   * @param edgeId - Edge identifier (unused in generation, kept for API clarity)
   * @param design - Design specification with id and params
   * @param themeId - Theme identifier (default: 'dark')
   * @returns Cytoscape style object for this edge
   */
  /**
   * Generate the sparse per-edge override rule for a specific edge by ID.
   * Takes the whole scene-edge record so both the visual override (`design`)
   * and the curve override (`curve`) are emitted into the rule.
   *
   * @param sceneEdge - Scene edge record `{ design, curve }` (or null)
   * @returns Cytoscape style object for this edge's per-edge rule
   */
  static generateEdgeStyleForId(
    _edgeId: EdgeId,
    sceneEdge: EdgeOverrideInput | null,
    _themeId: string = 'dark'
  ): any {
    return resolveEdgeDesignStyle(sceneEdge?.design ?? null, sceneEdge?.curve);
  }

  // ===========================================================================
  // SCENE
  // ===========================================================================

  /**
   * Generate complete stylesheet for a scene
   * Builds all node styles, edge styles, and special selectors
   * 
   * NOTE: This method is NOT currently used anywhere in the codebase.
   * Scene styling is done via transition.ts + stage-animator.ts instead.
   * Kept for potential future use - do not delete yet.
   */
  static async generateSceneStylesheet(
    scene: Scene,
    nodesData: Map<NodeId, Node>
  ): Promise<Array<{ selector: string; style: any }>> {
    const themeId = scene.themeId || 'dark';
    const styles: Array<{ selector: string; style: any }> = [];

    // Build styles for each node in the scene
    const nodeStylePromises = Object.entries(scene.nodes).map(async ([nodeId, sceneNode]) => {
      const node = nodesData.get(nodeId);
      if (!node) {
        console.warn(`Node ${nodeId} not found in database`);
        return null;
      }

      // Generate style for this node
      const nodeStyle = await this.generateNodeStyle(
        node,
        { id: sceneNode.design.id, params: sceneNode.design.params || {} } as any,
        themeId
      );

      // Apply scale to dimensions (full SVG scaling)
      const effectiveScale = sceneNode.scale ?? 1.0;
      if (effectiveScale !== 1.0) {
        nodeStyle.width = nodeStyle.width * effectiveScale;
        nodeStyle.height = nodeStyle.height * effectiveScale;
      }

      return {
        selector: `node[id = "${nodeId}"]`,
        style: nodeStyle
      };
    });

    // Wait for all node styles
    const nodeStyles = await Promise.all(nodeStylePromises);
    
    // Add node styles (filter out nulls)
    for (const style of nodeStyles) {
      if (style) {
        styles.push(style);
      }
    }

    // Add edge styles
    styles.push(this.generateEdgeStyle(themeId));

    // Type selector rules are added by the scene/transition feature because
    // they require the workspace edge type registry from graph storage.

    // Add central/selected rules at the end (last-match-wins in Cytoscape)
    styles.push(...this.buildCentralAndSelectedRules(themeId));

    return styles;
  }

  // ===========================================================================
  // STYLESHEET OPERATIONS
  // ===========================================================================

  /**
   * Add node styles to an existing stylesheet
   * Pure function - takes stylesheet, generates styles for multiple nodes, inserts before :selected
   * 
   * @param stylesheet - Current stylesheet array from cy.style().json()
   * @param nodes - Array of nodes to add with their data and designs
   * @param themeId - Theme identifier (default: 'dark')
   * @returns Updated stylesheet array
   */
  static async addNodesToStylesheet(
    stylesheet: any[],
    nodes: Array<{
      nodeId: NodeId;
      nodeData: Node;
      design: { id: string; params: Record<string, unknown> };
      scale?: number;
    }>,
    themeId: string = 'dark'
  ): Promise<any[]> {
    const updatedStylesheet = [...stylesheet];

    // Generate styles for all nodes
    for (const { nodeId, nodeData, design, scale } of nodes) {
      const selector = `node[id = "${nodeId}"]`;
      
      // Remove existing rule for this node (if any) to maintain one-rule-per-node
      const existingIndex = updatedStylesheet.findIndex(r => r.selector === selector);
      if (existingIndex !== -1) {
        updatedStylesheet.splice(existingIndex, 1);
      }
      
      const nodeStyle = await this.generateNodeStyle(nodeData, design, themeId);
      
      // Apply scale to dimensions (full SVG scaling)
      const effectiveScale = scale ?? 1.0;
      if (effectiveScale !== 1.0) {
        nodeStyle.width = nodeStyle.width * effectiveScale;
        nodeStyle.height = nodeStyle.height * effectiveScale;
      }
      
      const newRule = {
        selector,
        style: nodeStyle
      };
      
      // Insert at beginning (before :selected) to maintain proper specificity
      updatedStylesheet.unshift(newRule);
    }

    return updatedStylesheet;
  }

  /**
   * Update a single node's style in an existing stylesheet
   * Finds and replaces existing rule, or inserts at beginning if not found
   * 
   * @param stylesheet - Current stylesheet array from cy.style().json()
   * @param nodeId - ID of the node to update
   * @param nodeData - Node data
   * @param design - Design specification
   * @param scale - Scale factor (default 1.0)
   * @param themeId - Theme identifier (default: 'dark')
   * @returns Updated stylesheet array
   */
  static async updateNodeInStylesheet(
    stylesheet: any[],
    nodeId: NodeId,
    nodeData: Node,
    design: { id: string; params: Record<string, unknown> },
    scale: number,
    themeId: string = 'dark'
  ): Promise<any[]> {
    const updatedStylesheet = [...stylesheet];
    const selector = `node[id = "${nodeId}"]`;

    // Generate new style
    const nodeStyle = await this.generateNodeStyle(nodeData, design, themeId);
    
    // Apply scale to dimensions
    if (scale !== 1.0) {
      nodeStyle.width = nodeStyle.width * scale;
      nodeStyle.height = nodeStyle.height * scale;
    }

    const newRule = {
      selector,
      style: nodeStyle
    };

    // Find existing rule for this node
    const existingIndex = updatedStylesheet.findIndex(
      rule => rule.selector === selector
    );

    if (existingIndex !== -1) {
      // Replace existing rule in place
      updatedStylesheet[existingIndex] = newRule;
    } else {
      // Insert at beginning (before :selected)
      updatedStylesheet.unshift(newRule);
    }

    return updatedStylesheet;
  }

  /**
   * Build rules for central node and selected element states.
   * These must be appended at the END of the stylesheet (Cytoscape: last-match-wins).
   *
   * Order matters:
   *   1. node[?centralNode]           — overrides per-node design border
   *   2. node:selected                — overrides central border
   *   3. node[?centralNode]:selected  — overrides both
   *   4. edge:selected                — visible selection halo without changing semantic edge color
   *
   * @param themeId - Theme identifier (default: 'dark')
   * @returns Array of stylesheet rules
   */
  static buildCentralAndSelectedRules(
    themeId: string = 'dark'
  ): Array<{ selector: string; style: any }> {
    const theme = getTheme(themeId);

    return [
      {
        selector: 'node[?centralNode]',
        style: {
          'border-width': theme.node.borderCentral.width ?? 1,
          'border-color': theme.node.borderCentral.color
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': theme.node.borderSelected.width ?? 1,
          'border-color': theme.node.borderSelected.color,
          'overlay-opacity': 0
        }
      },
      {
        selector: 'node[?centralNode]:selected',
        style: {
          'border-width': theme.node.borderCentralSelected.width ?? 2,
          'border-color': theme.node.borderCentralSelected.color,
          'overlay-opacity': 0
        }
      },
      {
        selector: 'edge:selected',
        style: {
          'underlay-opacity': 0.35,
          'underlay-padding': 5,
          'overlay-opacity': 0,
          'z-index': 999,
          'z-index-compare': 'manual'
        }
      }
    ];
  }

  /**
   * Update a specific edge's style in an existing stylesheet
   * Finds and replaces existing per-edge rule, or inserts if not found
   *
   * @param stylesheet - Current stylesheet array from cy.style().json()
   * @param edgeId - ID of the edge to update
   * @param style - Cytoscape style object for this edge
   * @returns Updated stylesheet array
   */
  static updateEdgeInStylesheet(
    stylesheet: any[],
    edgeId: EdgeId,
    style: any
  ): any[] {
    const selector = `edge[id = "${edgeId}"]`;

    const newRule = {
      selector,
      style
    };

    const withoutExistingRule = stylesheet.filter(rule => rule.selector !== selector);
    const firstVisibilityRuleIndex = withoutExistingRule.findIndex(rule => this.#isEdgeTypeVisibilitySelector(rule.selector));
    if (firstVisibilityRuleIndex === -1) {
      return [...withoutExistingRule, newRule];
    }

    const updatedStylesheet = [...withoutExistingRule];
    updatedStylesheet.splice(firstVisibilityRuleIndex, 0, newRule);
    return updatedStylesheet;
  }

  /** Remove a specific edge's per-edge stylesheet rule. */
  static removeEdgeFromStylesheet(stylesheet: any[], edgeId: EdgeId): any[] {
    const selector = `edge[id = "${edgeId}"]`;
    return stylesheet.filter(rule => rule.selector !== selector);
  }

  /** Replace scene edge type visibility rules while preserving the rest of a stylesheet. */
  static updateEdgeTypeVisibilityInStylesheet(
    stylesheet: any[],
    visibility: Record<EdgeTypeId, EdgeTypeVisibilityMode> | undefined
  ): any[] {
    return [
      ...stylesheet.filter(rule => !this.#isEdgeTypeVisibilitySelector(rule.selector)),
      ...this.generateEdgeTypeVisibilityStyles(visibility)
    ];
  }

  /** Replace all workspace edge type rules while preserving the rest of a stylesheet. */
  static updateEdgeTypesInStylesheet(
    stylesheet: any[],
    edgeTypes: EdgeType[],
    themeId: string = 'dark'
  ): any[] {
    const edgeTypeSelectors = new Set(
      edgeTypes.map(edgeType => `edge[typeId = "${edgeType.id}"]`)
    );
    const updatedStylesheet = stylesheet.filter(rule => !edgeTypeSelectors.has(rule.selector));
    const edgeTypeRules = this.generateEdgeTypeStyles(edgeTypes, themeId);
    const edgeRuleIndex = updatedStylesheet.findIndex(rule => rule.selector === 'edge');

    if (edgeRuleIndex !== -1) {
      updatedStylesheet.splice(edgeRuleIndex + 1, 0, ...edgeTypeRules);
    } else {
      updatedStylesheet.unshift(...edgeTypeRules);
    }

    return updatedStylesheet;
  }

  static #edgeTypeVisibilitySelector(edgeTypeId: EdgeTypeId): string {
    return `edge[typeId = "${edgeTypeId}"][id]`;
  }

  static #isEdgeTypeVisibilitySelector(selector: unknown): boolean {
    return typeof selector === 'string' && /^edge\[typeId = ".+"\]\[id\]$/.test(selector);
  }

  /** Scene edges only need per-edge rules when they carry a visual or curve override. */
  static hasEdgeStyleOverride(
    sceneEdge: EdgeOverrideInput | null | undefined
  ): boolean {
    if (!sceneEdge) return false;
    const design = sceneEdge.design;
    const hasVisual = !!design && (design.id === 'custom' || Object.keys(design.params ?? {}).length > 0);
    const hasCurve = !!sceneEdge.curve && Object.keys(sceneEdge.curve).length > 0;
    // Legacy edges keep curve keys inside design.params; hasVisual already
    // covers them, but keep the explicit check for clarity/robustness.
    const hasLegacyCurve = !!design && Object.keys(pickCurveParams(design.params)).length > 0;
    return hasVisual || hasCurve || hasLegacyCurve;
  }

  /**
   * Insert, replace, or remove the per-edge override rule for one edge in a
   * stylesheet, based on whether the edge carries any override. Single home for
   * the "update-or-remove" composition so callers (scene edit ops, auto-layout)
   * don't each reimplement it.
   */
  static applyEdgeOverrideToStylesheet(
    stylesheet: any[],
    edgeId: EdgeId,
    sceneEdge: EdgeOverrideInput | null | undefined,
    themeId: string = 'dark'
  ): any[] {
    return this.hasEdgeStyleOverride(sceneEdge)
      ? this.updateEdgeInStylesheet(stylesheet, edgeId, this.generateEdgeStyleForId(edgeId, sceneEdge ?? null, themeId))
      : this.removeEdgeFromStylesheet(stylesheet, edgeId);
  }

}
