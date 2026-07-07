/**
 * Mermaid edge-label mapping and scene-composition flags.
 *
 * Neutral home for the per-label mapping type, label normalisation, and the
 * per-edge scene-composition flag builder — shared by the import dialog (UI +
 * live preview) and the import builder (scene generation) without an import
 * cycle between them. See `docs/mermaid-fan-layout.md` §9.
 */

import type { EdgeStyleSlotId } from '../../core/main-types';
import type { ParsedMermaidEdge } from './flowchart';

/** Author's per-Mermaid-label import choices, captured in the import dialog. */
export interface MermaidEdgeLabelMapping {
  sourceLabelKey: string;
  edgeTypeName: string;
  thematicStyleSlotId: EdgeStyleSlotId;
  /** Traverse this label forward (source→target): pull in children. */
  includeChildren: boolean;
  /** Traverse this label backward (target→source): pull in parents. */
  includeParents: boolean;
  /** Draw this label as a non-generative cross link between scene nodes. */
  includeCrossEdges: boolean;
}

/** Per-edge scene-composition flags, indexed parallel to a graph's edge list. */
export interface EdgeSceneFlags {
  /** Traverse source→target (this edge can pull in a child). */
  children: boolean;
  /** Traverse target→source (this edge can pull in a parent). */
  parents: boolean;
  /** Draw this edge when it is a non-generative cross link. */
  crossEdges: boolean;
}

export function normalizeMermaidEdgeLabel(label: string): string {
  return sanitizeMermaidEdgeLabel(label).toLowerCase();
}

export function sanitizeMermaidEdgeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

/**
 * Resolve each edge's scene-composition flags from the per-label mappings.
 * Edges whose label has no mapping default to fully included (all flags on),
 * matching the legacy undirected/all-types behaviour.
 */
export function buildEdgeSceneFlags(
  edges: ParsedMermaidEdge[],
  mappings: MermaidEdgeLabelMapping[]
): EdgeSceneFlags[] {
  const byLabelKey = new Map<string, MermaidEdgeLabelMapping>();
  for (const mapping of mappings) byLabelKey.set(mapping.sourceLabelKey, mapping);

  return edges.map(edge => {
    const mapping = byLabelKey.get(normalizeMermaidEdgeLabel(edge.title));
    return {
      children: mapping ? mapping.includeChildren : true,
      parents: mapping ? mapping.includeParents : true,
      crossEdges: mapping ? mapping.includeCrossEdges : true,
    };
  });
}
