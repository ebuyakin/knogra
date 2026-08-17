/**
 * Design param types
 * Part of the Knogra type system — see main-types.ts for full index.
 *
 * This file owns:
 *   - Design-specific params (AreaColors)
 *
 * Does NOT own:
 *   - Visual styling primitives (→ style-types.ts)
 *   - Data model entities (→ main-types.ts)
 *   - Background image appearance (→ background-types.ts)
 */

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
