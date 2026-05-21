/**
 * Design registry types
 * Part of the Knogra type system — see main-types.ts for full index.
 *
 * This file owns:
 *   - Design registry (NodeDesign, DesignConfigSchema, SchemaProperty)
 *   - Design-specific params (AreaColors)
 *
 * Does NOT own:
 *   - Visual styling primitives (→ style-types.ts)
 *   - Data model entities (→ main-types.ts)
 *   - Background image appearance (→ background-types.ts)
 */

import type { Node } from './main-types';
import type { ColorTheme, CytoscapeNodeStyle } from './style-types';

// Re-exports from style-types.ts (backward compatibility)
export type { GradientConfig, GradientStop, ColorOverrides, VisualEffects } from './style-types';

// ============================================================================
// Design-Specific Params
// ============================================================================

/** Per-area colors for multi-section designs */
export interface AreaColors {
  top?: string;
  middle?: string;
  bottom?: string;
}

// ============================================================================
// Design System Types
// ============================================================================

export interface NodeDesign {
  id: string;
  name: string;
  description?: string;
  
  // Complete Cytoscape style (can be async for MathJax rendering)
  getCytoscapeStyle: (
    nodeData: Node,
    config: Record<string, unknown>,
    theme: ColorTheme
  ) => CytoscapeNodeStyle | Promise<CytoscapeNodeStyle>;
  
  // Configuration schema (for UI generation)
  configSchema?: DesignConfigSchema;
}

// Note: CytoscapeNodeStyle is defined in main-types.ts

export interface DesignConfigSchema {
  properties: Record<string, SchemaProperty>;
}

export interface SchemaProperty {
  type: 'boolean' | 'number' | 'string' | 'enum';
  default?: unknown;
  description?: string;
  options?: string[];  // For enum type
}
