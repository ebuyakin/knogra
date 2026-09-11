/**
 * Edge Type Resolution
 *
 * A model reply names a relationship in words — a type name, or the label it has
 * been reading on every edge in the prompt. Neither is an id. This module is the
 * single place that turns those words into what the graph stores, so a wrong
 * guess has one home rather than one per call site.
 *
 * Resolution never rejects. An unrecognised value falls back, because a dropped
 * suggestion is a worse outcome than a suggestion on the default type.
 *
 * See docs/ai-prompt-etalon.md, "The reply", for the contract this implements.
 */

import type { EdgeTypeId } from '../core/main-types';
import { graphStore } from '../storage/graph-store';

/** Direction in the feature layer's words: 'child' means the new node is the edge's target. */
export type ProposedEdgeDirection = 'child' | 'parent';

function normalize(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}

/**
 * Type name first, then forward label. The label is matched because every edge in
 * the prompt is written with its label rather than its type name, so the label is
 * the string the model has actually been reading.
 *
 * Inverse labels are deliberately not matched: an inverse label names its own type
 * with the direction reversed, and there is no way to tell whether the model had
 * already accounted for that in its direction field.
 */
export function resolveEdgeTypeId(written: string | undefined): EdgeTypeId {
  const needle = normalize(written);
  if (!needle) return graphStore.defaultEdgeTypeId;

  const byName = graphStore.edgeTypes.find(edgeType => normalize(edgeType.name) === needle);
  if (byName) return byName.id;

  const byForwardLabel = graphStore.edgeTypes.find(
    edgeType => normalize(edgeType.forwardLabel) === needle
  );
  return byForwardLabel?.id ?? graphStore.defaultEdgeTypeId;
}

/**
 * The AI's direction vocabulary stops here; `src/features` only ever sees
 * child/parent. Whitespace around the arrow is ignored, and anything
 * unrecognised — including a missing value — reads as "central -> new".
 */
export function resolveEdgeDirection(written: string | undefined): ProposedEdgeDirection {
  const arrow = written?.replace(/\s+/g, '').toLowerCase() ?? '';
  return arrow === 'new->central' || arrow === 'existing->central' ? 'parent' : 'child';
}

/**
 * How the relationship will actually be created, for the shelf tooltip. Resolved
 * rather than echoed, so it shows the edge the user will get even when the model
 * wrote a label or an unknown name.
 */
export function describeRelationship(
  edgeType: string | undefined,
  direction: string | undefined
): string {
  const typeId = resolveEdgeTypeId(edgeType);
  const typeName = graphStore.edgeTypes.find(candidate => candidate.id === typeId)?.name;
  const role = resolveEdgeDirection(direction) === 'parent' ? 'parent' : 'child';

  return typeName ? `(${typeName}, ${role})` : `(${role})`;
}

/**
 * The proposed edge read outward from the central node, for the chat summary:
 * the arrow is the edge's real direction, and the label is the one that reads in
 * that direction, so an inbound edge shows the type's inverse wording.
 */
export function formatRelationshipOutward(
  edgeType: string | undefined,
  direction: string | undefined
): string {
  const typeId = resolveEdgeTypeId(edgeType);
  const type = graphStore.edgeTypes.find(candidate => candidate.id === typeId);
  const outward = resolveEdgeDirection(direction) === 'child';

  const arrow = outward ? '→' : '←';
  const label = outward ? type?.forwardLabel : type?.inverseLabel ?? type?.forwardLabel;

  return label ? `${arrow} ${label}` : `${arrow} ${type?.name ?? ''}`.trim();
}
