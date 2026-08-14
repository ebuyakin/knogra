/**
 * Workspace Bindings
 * The Ctrl/Cmd chords plus chat focus. First block consulted, matching the
 * original chain: a chord must never fall through to a bare-letter shortcut.
 */

import type { KeyboardContext } from '../keyboard-context';
import { exportWorkspace, showImportDialog, newWorkspace } from '../../../storage/workspace';

export function handleWorkspaceKeys(
  context: KeyboardContext,
  event: KeyboardEvent,
  key: string,
  ctrl: boolean
): boolean {
  // Cmd/Ctrl + , - Open settings
  if (key === ',' && ctrl) {
    event.preventDefault();
    context.settingsModal.open();
    return true;
  }

  // Cmd/Ctrl + Shift + D - Download diagnostics snapshot (dev only)
  if (key === 'd' && ctrl && event.shiftKey) {
    event.preventDefault();
    if (import.meta.env.DEV) {
      import('../../../utils/diagnostics/snapshot').then(({ downloadSnapshot }) => downloadSnapshot(context.cy));
    }
    return true;
  }

  // Cmd/Ctrl + S - Export workspace
  if (key === 's' && ctrl) {
    event.preventDefault();
    exportWorkspace();
    return true;
  }

  // Cmd/Ctrl + O - Import workspace
  if (key === 'o' && ctrl) {
    event.preventDefault();
    showImportDialog();
    return true;
  }

  // Cmd/Ctrl + N - New workspace
  if (key === 'n' && ctrl) {
    event.preventDefault();
    newWorkspace();
    return true;
  }

  // ` (backtick) - Focus chat input
  if (key === '`' && !ctrl) {
    event.preventDefault();
    const chatInput = document.querySelector('.chat-input') as HTMLTextAreaElement;
    chatInput?.focus();
    return true;
  }

  return false;
}
