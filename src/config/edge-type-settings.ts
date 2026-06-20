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

const STARTER_EDGE_TYPES: StarterEdgeType[] = [
  {
    id: DEFAULT_EDGE_TYPE_ID,
    name: 'Related',
    description: 'Default general relationship between two nodes.',
    forwardLabel: 'relates to',
    thematicStyleSlotId: 'edge-style-1'
  },
  {
    id: 'part-of' as EdgeTypeId,
    name: 'Part of',
    description: 'Whole/part or entity/attribute relationship.',
    forwardLabel: 'is part of',
    inverseLabel: 'has part',
    thematicStyleSlotId: 'edge-style-2'
  },
  {
    id: 'example-of' as EdgeTypeId,
    name: 'Example of',
    description: 'Example, instance, or specialization relationship.',
    forwardLabel: 'is example of',
    inverseLabel: 'has example',
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