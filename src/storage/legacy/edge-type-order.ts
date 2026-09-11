/**
 * Edge types written before `EdgeType.order` existed (app versions up to 1.6)
 * carry no position. This module gives them one, by a rule that must be the
 * same wherever such records can appear: the live database on first load after
 * the upgrade, and any workspace file exported before the change. A workspace
 * file never expires, so neither does this module.
 *
 * The rule: records that already have an order keep it; records without one
 * are placed after them, oldest first by `createdAt`, ties broken by `id`.
 * A pre-1.7 workspace holds its three starter types at one timestamp, so the
 * id tie-break decides their order — `example-of`, `part-of`, `related`, i.e.
 * Generalization first. Types the user added later have later timestamps and
 * follow. Sorting by id alone would not do: user-created ids (`edge-type-N`)
 * sort before the starter ids.
 */

import type { EdgeType } from '../../core/main-types';

/** An edge type as it may arrive from storage: `order` present or not. */
export type StoredEdgeType = Omit<EdgeType, 'order'> & { order?: number };

export interface EdgeTypeOrderResult {
  edgeTypes: EdgeType[];
  /** True when at least one record was given an order and should be written back. */
  changed: boolean;
}

export function assignMissingEdgeTypeOrder(records: StoredEdgeType[]): EdgeTypeOrderResult {
  const ordered = records.filter(hasOrder);
  const unordered = records.filter(record => !hasOrder(record));

  if (unordered.length === 0) {
    return { edgeTypes: ordered, changed: false };
  }

  const nextOrder = ordered.length > 0
    ? Math.max(...ordered.map(record => record.order)) + 1
    : 0;

  const filled = [...unordered]
    .sort(compareLegacyEdgeTypes)
    .map((record, index): EdgeType => ({ ...record, order: nextOrder + index }));

  return { edgeTypes: [...ordered, ...filled], changed: true };
}

function hasOrder(record: StoredEdgeType): record is EdgeType {
  return typeof record.order === 'number' && Number.isFinite(record.order);
}

function compareLegacyEdgeTypes(a: StoredEdgeType, b: StoredEdgeType): number {
  const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}
