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

import type { Node, Scene, NodeId, EdgeId } from '../core/main-types';
import { getTheme } from './themes';
import { getNodeStyle } from './designs/design-registry';

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
    const theme = getTheme(themeId);
    return {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': theme.edge.line.color,
        'target-arrow-color': theme.edge.line.color,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    };
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
  static generateEdgeStyleForId(
    _edgeId: EdgeId,
    design: { id: string; params: Record<string, unknown> } | null,
    themeId: string = 'dark'
  ): any {
    const theme = getTheme(themeId);

    // Default edge style from theme
    const defaultStyle = {
      'width': 2,
      'line-color': theme.edge.line.color,
      'line-opacity': 1.0,
      'target-arrow-color': theme.edge.line.color,
      'target-arrow-shape': 'triangle',
      'arrow-scale': 1.0,
      'curve-style': 'bezier'
    };

    // If no design, return defaults
    if (!design || !design.params) {
      return defaultStyle;
    }

    // Hybrid approach: Check design.id
    if (design.id === 'custom') {
      // Use params directly, merge with defaults
      return {
        ...defaultStyle,
        ...design.params
      };
    }

    // Future: Could support template designs here
    // For now, treat any non-custom design as custom
    return {
      ...defaultStyle,
      ...design.params
    };
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
   * Build the 3 rules for central node, selected, and central+selected states.
   * These must be appended at the END of the stylesheet (Cytoscape: last-match-wins).
   *
   * Order matters:
   *   1. node[?centralNode]           — overrides per-node design border
   *   2. node:selected                — overrides central border
   *   3. node[?centralNode]:selected  — overrides both
   *
   * @param themeId - Theme identifier (default: 'dark')
   * @returns Array of 3 stylesheet rules
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
    const updatedStylesheet = [...stylesheet];
    const selector = `edge[id = "${edgeId}"]`;

    const newRule = {
      selector,
      style
    };

    // Find existing rule for this edge
    const existingIndex = updatedStylesheet.findIndex(
      rule => rule.selector === selector
    );

    if (existingIndex !== -1) {
      // Replace existing rule in place
      updatedStylesheet[existingIndex] = newRule;
    } else {
      // Insert after general 'edge' rule (to override it)
      // Find the general edge rule
      const edgeRuleIndex = updatedStylesheet.findIndex(
        rule => rule.selector === 'edge'
      );

      if (edgeRuleIndex !== -1) {
        // Insert right after general edge rule
        updatedStylesheet.splice(edgeRuleIndex + 1, 0, newRule);
      } else {
        // Fallback: insert at beginning
        updatedStylesheet.unshift(newRule);
      }
    }

    return updatedStylesheet;
  }
}
