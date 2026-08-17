/**
 * Node System Properties
 *
 * Property keys owned by the app rather than by the user: written by
 * subsystems, never typed by hand, and never offered in the node editor's raw
 * JSON escape hatch.
 *
 * Declared once because hiding a key and preserving it are two halves of the
 * same decision, and a key hidden but not preserved is deleted on every save —
 * silently breaking whatever depends on it. See `docs/markdown-architecture.md`
 * §6.3.
 */

/** Keys hidden from the Advanced tab's JSON editor and carried through on save. */
export const NODE_SYSTEM_PROPERTIES = ['externalId', 'imageId'] as const;
