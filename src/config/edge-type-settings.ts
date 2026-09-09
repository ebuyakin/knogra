/**
 * Edge Type Settings
 * Starter relationship types for new workspaces and legacy imports.
 */

import type { EdgeStyleSlotId, EdgeType, EdgeTypeId } from '../core/main-types';

const DEFAULT_EDGE_TYPE_ID = 'related' as EdgeTypeId;

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
 * Edges run from the broader end to the narrower one: whole to part, general to
 * specific. That matches the outward gesture of the radial layout, and it makes
 * the app's own parent/child wording agree with the arrow — the source really is
 * the containing or more general thing.
 *
 * The `part-of` and `example-of` ids no longer match their names. Ids are
 * persisted on every edge in every existing workspace, and changing them would
 * orphan those edges onto the default type.
 */
const STARTER_EDGE_TYPES: StarterEdgeType[] = [
  {
    id: DEFAULT_EDGE_TYPE_ID,
    name: 'Related',
    description: 'General association, and the fallback when neither of the other categories fits. Use it for influence, cause, contrast, correspondence, or any connection that is not general-to-specific or whole-to-part.',
    forwardLabel: 'relates to',
    thematicStyleSlotId: 'edge-style-1'
  },
  {
    id: 'part-of' as EdgeTypeId,
    name: 'Composition',
    description: 'Whole and part. The source is the whole; the target is a component, stage, region or constituent of it, and the whole is incomplete without its parts. Car has part Engine; Chapter has part Introduction.',
    forwardLabel: 'has part',
    inverseLabel: 'is part of',
    thematicStyleSlotId: 'edge-style-2'
  },
  {
    id: 'example-of' as EdgeTypeId,
    name: 'Generalization',
    description: 'General and specific. The source is the general case; the target is a narrower one that carries its properties — a subtype, a variety, or a named instance. Car has kind Sedan; Metabolic pathway has kind Photosynthesis.',
    forwardLabel: 'has kind',
    inverseLabel: 'is a kind of',
    thematicStyleSlotId: 'edge-style-3'
  }
];

export function getDefaultEdgeTypeId(): EdgeTypeId {
  return DEFAULT_EDGE_TYPE_ID;
}

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