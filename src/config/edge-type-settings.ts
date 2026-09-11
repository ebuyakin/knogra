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
 * Generalization, composition, and a bucket for the rest — the three relation
 * categories that recur across data modelling, systems thinking and linguistics.
 * Descriptions and labels are read by the assistant, so they are written as
 * sentences rather than UI captions.
 *
 * Array position is `order`; the first type is the new workspace's default.
 * Generalization leads so the default draws in the theme's neutral slot 1,
 * whose triangle is the UML generalization arrowhead.
 *
 * Edges run from the broader end to the narrower one: whole to part, general to
 * specific. That matches the outward gesture of the radial layout, and it makes
 * the app's own parent/child wording agree with the arrow — the source really is
 * the containing or more general thing.
 *
 * Style slots follow the UML reading of the arrowheads every theme gives them:
 * slot 1 is a triangle (generalization), slot 2 a diamond (composition), slot 3
 * a circle, which UML does not use and so carries no conflicting meaning for
 * the association type.
 *
 * Association is symmetric in meaning but the edge under it is still directed,
 * and operations such as include-children act on that direction. Its two labels
 * exist so a reader can tell which end is which; they differ in voice only,
 * because a symmetric relation has no real inverse.
 */
const STARTER_EDGE_TYPES: StarterEdgeType[] = [
  {
    id: 'edge-type-1' as EdgeTypeId,
    name: 'Generalization',
    order: 0,
    description: 'General and specific. The source is the general case; the target is a narrower one that carries its properties — a subtype, a variety, or a named instance. Car has kind Sedan; Metabolic pathway has kind Photosynthesis.',
    forwardLabel: 'has kind',
    inverseLabel: 'is a kind of',
    thematicStyleSlotId: 'edge-style-1'
  },
  {
    id: 'edge-type-2' as EdgeTypeId,
    name: 'Composition',
    order: 1,
    description: 'Whole and part. The source is the whole; the target is a component, stage, region or constituent of it, and the whole is incomplete without its parts. Car has part Engine; Chapter has part Introduction.',
    forwardLabel: 'has part',
    inverseLabel: 'is part of',
    thematicStyleSlotId: 'edge-style-2'
  },
  {
    id: 'edge-type-3' as EdgeTypeId,
    name: 'Association',
    order: 2,
    description: 'General association, and the fallback when neither of the other categories fits. Use it for influence, cause, contrast, correspondence, or any connection that is not general-to-specific or whole-to-part.',
    forwardLabel: 'relates to',
    inverseLabel: 'is related to',
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