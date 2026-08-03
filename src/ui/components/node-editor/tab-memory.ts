/**
 * Node Editor - active tab memory
 *
 * Session-scoped on purpose: a design-focused work session should keep landing
 * on the Design tab node after node, while a fresh browser tab starts on
 * Content. sessionStorage gives exactly that lifetime and never travels into an
 * exported workspace.
 */

import { NODE_EDITOR_TAB_KEY } from '../../../config/storage-config';
import { NODE_EDITOR_TAB_IDS, type NodeEditorTabId } from './node-editor-types';

const DEFAULT_TAB: NodeEditorTabId = 'content';

function isTabId(value: string | null): value is NodeEditorTabId {
  return value !== null && (NODE_EDITOR_TAB_IDS as readonly string[]).includes(value);
}

export function readActiveTab(): NodeEditorTabId {
  try {
    const stored = sessionStorage.getItem(NODE_EDITOR_TAB_KEY);
    return isTabId(stored) ? stored : DEFAULT_TAB;
  } catch {
    // Storage can be unavailable in hardened privacy modes; the default is fine.
    return DEFAULT_TAB;
  }
}

export function writeActiveTab(tabId: NodeEditorTabId): void {
  try {
    sessionStorage.setItem(NODE_EDITOR_TAB_KEY, tabId);
  } catch {
    // Losing tab memory is not worth failing the interaction over.
  }
}
