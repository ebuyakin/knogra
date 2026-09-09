/**
 * Relationship Slot
 *
 * Turns the workspace's edge types into the choices offered on the Suggest and
 * Connect buttons, and stamps the chosen one onto the actions that come back.
 *
 * The menu item's text and the sentence the model receives are built here
 * together and never separately, because the moment they are composed in two
 * places they can disagree and nothing would show it.
 *
 * See docs/ai-prompt-etalon.md, "The user messages" and "The reply".
 */

import type { EdgeType } from '../core/main-types';
import type {
  CreateConnectedDirection,
  IncludeExistingDirection,
  ProposedAction,
  RelationshipSlot,
  SlotDirection
} from './types';
import { graphStore } from '../storage/graph-store';

/** A direction, with the relationship types reachable under it. */
export interface SlotGroup {
  label: string;
  /** Choosing the group itself leaves the type free. */
  slot: RelationshipSlot;
  options: SlotOption[];
}

export interface SlotOption {
  label: string;
  slot: RelationshipSlot;
}

/** The placeholder the constraint sentences use for the node being proposed. */
const PROPOSED = 'X';

export const ANY_RELATIONSHIP: RelationshipSlot = { label: 'any relationship', constraint: '' };

/**
 * Menu rows name what is being asked for — a child, a parent — rather than which
 * end of the arrow it sits on. The node title stays out: it can be long or wrap
 * onto several lines, neither of which a menu row survives.
 */
export function buildSlotGroups(centralTitle: string): SlotGroup[] {
  const title = normalizeTitle(centralTitle);
  const edgeTypes = graphStore.edgeTypes;

  return [
    directionGroup('central -> other', 'Child', title, edgeTypes),
    directionGroup('other -> central', 'Parent', title, edgeTypes),
    {
      label: 'Any',
      slot: ANY_RELATIONSHIP,
      options: edgeTypes.map(edgeType => ({
        label: edgeType.name,
        slot: {
          edgeTypeId: edgeType.id,
          label: `${edgeType.name}, either direction`,
          constraint: typeOnlyConstraint(edgeType, title)
        }
      }))
    }
  ];
}

function directionGroup(
  direction: SlotDirection,
  role: string,
  centralTitle: string,
  edgeTypes: EdgeType[]
): SlotGroup {
  return {
    label: role,
    slot: {
      direction,
      label: `${role.toLowerCase()}, any type`,
      constraint: directionOnlyConstraint(direction, centralTitle)
    },
    options: edgeTypes.map(edgeType => ({
      label: edgeType.name,
      slot: {
        edgeTypeId: edgeType.id,
        direction,
        label: `${role.toLowerCase()}, ${edgeType.name}`,
        constraint: fullConstraint(edgeType, direction, centralTitle)
      }
    }))
  };
}

/** A title can wrap or hold newlines; the constraint sentence has to stay one line. */
function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

// ============================================================================
// CONSTRAINT SENTENCES
// ============================================================================

function fullConstraint(
  edgeType: EdgeType,
  direction: SlotDirection,
  centralTitle: string
): string {
  const arrow = arrowFor(edgeType, direction, centralTitle);
  const forward = forwardReading(edgeType, direction, centralTitle);
  const inverse = inverseReading(edgeType, direction, centralTitle);

  const readings = inverse
    ? `read it as "${forward}", or from the other end, "${inverse}"`
    : `read it as "${forward}"`;

  return `Every suggested concept ${PROPOSED} must fit this edge exactly:  ${arrow}  — ${readings}. Do not suggest concepts related to ${centralTitle} in any other way, however relevant they seem.`;
}

function directionOnlyConstraint(direction: SlotDirection, centralTitle: string): string {
  const arrow = direction === 'central -> other'
    ? `${centralTitle} -> ${PROPOSED}`
    : `${PROPOSED} -> ${centralTitle}`;

  return `Every suggested concept ${PROPOSED} must sit at this end of its edge:  ${arrow}. The relationship type is yours to choose from the vocabulary above, but the direction is not.`;
}

function typeOnlyConstraint(edgeType: EdgeType, centralTitle: string): string {
  return `Every suggested concept ${PROPOSED} must be related to ${centralTitle} by the ${edgeType.name} relationship, in whichever direction fits it. Do not use any other relationship type.`;
}

// ============================================================================
// READINGS
// ============================================================================

function arrowFor(edgeType: EdgeType, direction: SlotDirection, centralTitle: string): string {
  const label = forwardLabel(edgeType);
  return direction === 'central -> other'
    ? `${centralTitle} -[${label}]-> ${PROPOSED}`
    : `${PROPOSED} -[${label}]-> ${centralTitle}`;
}

function forwardReading(edgeType: EdgeType, direction: SlotDirection, centralTitle: string): string {
  const label = forwardLabel(edgeType);
  return direction === 'central -> other'
    ? `${centralTitle} ${label} ${PROPOSED}`
    : `${PROPOSED} ${label} ${centralTitle}`;
}

/** Empty when the type has no inverse label, which is normal for a symmetric type. */
function inverseReading(edgeType: EdgeType, direction: SlotDirection, centralTitle: string): string {
  const label = edgeType.inverseLabel?.trim();
  if (!label) return '';

  return direction === 'central -> other'
    ? `${PROPOSED} ${label} ${centralTitle}`
    : `${centralTitle} ${label} ${PROPOSED}`;
}

function forwardLabel(edgeType: EdgeType): string {
  return edgeType.forwardLabel?.trim() || edgeType.name.trim();
}

// ============================================================================
// STAMPING
// ============================================================================

/**
 * The user named the relationship, so their choice replaces whatever the model
 * wrote. An axis the user left free is left as the model set it.
 */
export function stampSlot(actions: ProposedAction[], slot: RelationshipSlot): ProposedAction[] {
  if (!slot.edgeTypeId && !slot.direction) return actions;

  const edgeType = slot.edgeTypeId
    ? graphStore.edgeTypes.find(candidate => candidate.id === slot.edgeTypeId)?.name
    : undefined;

  return actions.map(action => {
    if (action.type === 'create_connected') {
      return {
        ...action,
        ...(edgeType ? { edgeType } : {}),
        ...(slot.direction ? { direction: createConnectedDirection(slot.direction) } : {})
      };
    }

    if (action.type === 'include_existing') {
      return {
        ...action,
        ...(edgeType ? { edgeType } : {}),
        ...(slot.direction ? { direction: includeExistingDirection(slot.direction) } : {})
      };
    }

    return action;
  });
}

function createConnectedDirection(direction: SlotDirection): CreateConnectedDirection {
  return direction === 'central -> other' ? 'central -> new' : 'new -> central';
}

function includeExistingDirection(direction: SlotDirection): IncludeExistingDirection {
  return direction === 'central -> other' ? 'central -> existing' : 'existing -> central';
}
