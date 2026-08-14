/**
 * KeyboardHandler — public face of the keyboard subsystem.
 * Owns the document listener, the pre-dispatch rules that apply even inside
 * input fields (Escape, F1), and the input-field guard. The shortcuts
 * themselves live in the binding blocks, which are consulted in a fixed order.
 *
 * That order is load-bearing: it is the original single if-chain sliced into
 * contiguous pieces, so a key claimed by an earlier block never reaches a later
 * one. Reordering the blocks changes behaviour.
 */

import type { KeyboardContext, KeyboardDependencies } from './keyboard-context';
import type { ConnectionBadgeManager } from '../components/connection-badge';
import type { EdgeCreationMode } from '../edge-creation-mode';
import { SettingsModal } from '../components/settings-modal';
import { ShortcutOverlay } from '../components/shortcut-overlay';
import { handleWorkspaceKeys } from './bindings/workspace-bindings';
import { handleEdgeBendKeys } from './bindings/edge-bend-bindings';
import { handleViewKeys } from './bindings/view-bindings';
import { handleSceneKeys } from './bindings/scene-bindings';

export type { KeyboardContext, KeyboardDependencies } from './keyboard-context';

export class KeyboardHandler {
  #context: KeyboardContext;
  #enabled: boolean = true;
  #keydownHandler: (event: KeyboardEvent) => void;

  constructor(deps: KeyboardDependencies) {
    this.#context = {
      cy: deps.cy,
      features: deps.features,
      container: deps.container ?? null,
      badgeManager: deps.badgeManager ?? null,
      edgeCreationMode: null,
      nodeEditor: deps.nodeEditor ?? null,
      nodeManager: deps.nodeManager ?? null,
      anchorLinkTooltip: deps.anchorLinkTooltip ?? null,
      quickTitleEditor: deps.quickTitleEditor ?? null,
      settingsModal: new SettingsModal(),
      shortcutOverlay: new ShortcutOverlay()
    };

    // Store handler reference for cleanup
    this.#keydownHandler = (event: KeyboardEvent) => {
      if (!this.#enabled) return;

      const key = event.key.toLowerCase();

      // Handle Escape from chat input (before the input field check)
      if (key === 'escape') {
        this.#context.edgeCreationMode?.cancel();

        // Close shortcut overlay if open
        if (this.#context.shortcutOverlay.isOpen()) {
          event.preventDefault();
          this.#context.shortcutOverlay.hide();
          return;
        }

        const chatInput = document.querySelector('.chat-input') as HTMLTextAreaElement;
        if (document.activeElement === chatInput) {
          event.preventDefault();
          chatInput.blur();
          const centralNodeId = this.#context.features.scene.getCentralNodeId();
          if (centralNodeId) {
            this.#context.cy.$(':selected').unselect();
            this.#context.cy.getElementById(centralNodeId).select();
          }
          return;
        }
      }

      // F1 - Toggle shortcut overlay (works even in input fields)
      if (key === 'f1') {
        event.preventDefault();
        this.#context.shortcutOverlay.toggle();
        return;
      }

      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      this.#handleKeyPress(event);
    };

    document.addEventListener('keydown', this.#keydownHandler);
  }

  /** Offer the key to each block in turn; the first to claim it wins. */
  async #handleKeyPress(event: KeyboardEvent): Promise<void> {
    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey || event.metaKey;

    if (handleWorkspaceKeys(this.#context, event, key, ctrl)) return;
    if (await handleEdgeBendKeys(this.#context, event, key, ctrl)) return;
    if (await handleViewKeys(this.#context, event, key, ctrl)) return;
    await handleSceneKeys(this.#context, event, key, ctrl);
  }

  /**
   * Set badge manager (for late binding)
   */
  setBadgeManager(manager: ConnectionBadgeManager): void {
    this.#context.badgeManager = manager;
  }

  /**
   * Set edge creation mode (for late binding)
   */
  setEdgeCreationMode(mode: EdgeCreationMode): void {
    this.#context.edgeCreationMode = mode;
  }

  /**
   * Enable/disable keyboard shortcuts
   */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  /**
   * Clean up
   */
  destroy(): void {
    document.removeEventListener('keydown', this.#keydownHandler);
  }
}
