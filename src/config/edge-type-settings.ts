/**
 * Edge Type Settings
 * Starter relationship types for new workspaces and legacy imports.
 *
 * The seed is the only place the starter types are known by content. Once a
 * workspace exists, its registry in IndexedDB is the truth: the app never reads
 * a type by name or id from here, and the workspace's default type is simply
 * the first in registry order (`EdgeType.order`).
 */

import type { EdgeStyleSlotId, EdgeType, EdgeTypeId } from '../core/main-types';

const EDGE_STYLE_SLOT_IDS: EdgeStyleSlotId[] = [
  'edge-style-1',
  'edge-style-2',
  'edge-style-3'
];

type StarterEdgeType = Omit<EdgeType, 'createdAt' | 'updatedAt'>;

/**
 * Generalization, composition and sequence — the three axes of a knowledge
 * structure: what kind a thing is, what it is made of, and what it comes
 * before or follows from. Each answers a question the other two cannot.
 * Descriptions and labels are read by the assistant, so they are written as
 * sentences rather than UI captions, and carry no worked examples: an example
 * from one subject biases the model's choice of type in every other
 * (removed 2026-10-16).
 *
 * Array position is `order`; the first type is the new workspace's default.
 * Generalization leads so the default draws in the theme's neutral slot 1,
 * whose triangle is the UML generalization arrowhead.
 *
 * Edges run from the origin to what comes of it: general to specific, whole to
 * part, earlier to later, cause to effect. That matches the outward gesture of
 * the radial layout, and it makes the app's own parent/child wording agree
 * with the arrow — the source really is the containing, more general or prior
 * thing.
 *
 * Style slots follow the reading of the arrowheads every theme gives them:
 * slot 1 is a triangle (UML generalization), slot 2 a diamond (UML
 * composition), slot 3 an open vee, the arrow of a flow or dependency diagram.
 *
 * The third type was Association until 2026-10-16: a symmetric bucket for
 * whatever was neither kind nor part. It gave the assistant a place to put
 * influence, contrast and the like, but named no relation of its own, and the
 * ordered relations it swallowed — steps, causes, derivations — are the ones a
 * learner most often needs drawn. A workspace that wants a symmetric type adds
 * one in the Edge Type Manager.
 */
const STARTER_EDGE_TYPES: StarterEdgeType[] = [
  {
    id: 'edge-type-1' as EdgeTypeId,
    name: 'Generalization',
    order: 0,
    description: 'General and specific, as UML generalization. The source is the general case; the target is a narrower one that carries its properties — a subtype, a variety, or a named instance.',
    forwardLabel: 'has kind',
    inverseLabel: 'is a kind of',
    thematicStyleSlotId: 'edge-style-1'
  },
  {
    id: 'edge-type-2' as EdgeTypeId,
    name: 'Composition',
    order: 1,
    description: 'Whole and part, as UML composition. The source is the whole; the target is a component, stage, region or constituent of it, and the whole is incomplete without its parts.',
    forwardLabel: 'has part',
    inverseLabel: 'is part of',
    thematicStyleSlotId: 'edge-style-2'
  },
  {
    id: 'edge-type-3' as EdgeTypeId,
    name: 'Sequence',
    order: 2,
    description: 'Before and after, in whatever sense the subject orders things: time, cause, derivation, prerequisite. The source comes first; the target follows from it, is produced by it, or builds on it. Not for symmetric connections such as contrast or similarity.',
    forwardLabel: 'leads to',
    inverseLabel: 'follows from',
    thematicStyleSlotId: 'edge-style-3'
  }
];

export function getDefaultEdgeStyleSlotId(): EdgeStyleSlotId {
  return 'edge-style-1';
}

export function getEdgeStyleSlotIds(): EdgeStyleSlotId[] {
  return [...EDGE_STYLE_SLOT_IDS];
}

export function createStarterEdgeTypes(now: Date = new Date()): EdgeType[] {
  return STARTER_EDGE_TYPES.map(edgeType => ({
    ...edgeType,
    createdAt: now,
    updatedAt: now
  }));
}

export function isEdgeStyleSlotId(value: unknown): value is EdgeStyleSlotId {
  return typeof value === 'string' && EDGE_STYLE_SLOT_IDS.includes(value as EdgeStyleSlotId);
}