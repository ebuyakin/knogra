/**
 * Rule Primitives
 *
 * The three-function vocabulary every brief section is built from, and the type
 * that keeps the expansion maps honest.
 *
 * This is where D31 — *unspecified emits nothing* — is implemented, once. A
 * section builder is a list of `rule()` / `permission()` calls wrapped in
 * `stated()`, so an unset descriptor is a filtered-out entry rather than a
 * branch, and adding a knob never adds control flow.
 *
 * See docs/node-image-presets.md §3.5.
 */

import type { NodeImagePermission, NodeImageUnspecified } from '../../../core/node-image-types';

/**
 * A descriptor value that actually says something.
 *
 * The expansion maps are keyed on this rather than on the full union, so the
 * compiler still demands an entry for every real value while `'unspecified'`
 * has none to give — there is no sentence for the absence of an instruction.
 */
export type Specified<T extends string> = Exclude<T, NodeImageUnspecified>;

/** The two readings of a permission that are worth stating. */
export interface PermissionRule {
  permitted: string;
  forbidden: string;
}

/** Returns the expansion, or nothing when the descriptor was left unset (D31). */
export function rule<K extends string>(rules: Record<K, string>, value: K | NodeImageUnspecified): string | undefined {
  return value === 'unspecified' ? undefined : rules[value];
}

export function permission(rules: PermissionRule, value: NodeImagePermission): string | undefined {
  if (value === 'unspecified') return undefined;
  return value === 'allowed' ? rules.permitted : rules.forbidden;
}

/** Drops the gaps an unspecified descriptor leaves. */
export function stated(rules: (string | undefined)[]): string[] {
  return rules.filter((line): line is string => Boolean(line));
}
