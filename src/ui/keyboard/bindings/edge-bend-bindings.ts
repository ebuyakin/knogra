/**
 * Edge Bend Bindings
 * H/J/K/L/R reshape the selected edge — but only while exactly one edge is
 * selected. Must stay ahead of the view block, where the same letters mean node
 * navigation and "include children"; falling through is the mechanism that lets
 * both meanings coexist.
 */

import type { KeyboardContext } from '../keyboard-context';
import { handleSelectedEdgeBendShortcut } from '../selection-commands';

const EDGE_BEND_KEYS = ['h', 'j', 'k', 'l', 'r'];

export async function handleEdgeBendKeys(
  context: KeyboardContext,
  event: KeyboardEvent,
  key: string,
  ctrl: boolean
): Promise<boolean> {
  if (ctrl || !EDGE_BEND_KEYS.includes(key)) return false;

  const handled = await handleSelectedEdgeBendShortcut(context, key, event.shiftKey);
  if (!handled) return false;

  event.preventDefault();
  return true;
}
