/**
 * Panel API
 * Facade for UI panels (actively developed)
 */

import type { Core } from 'cytoscape';
import type { FeatureAPI } from '../../features/feature-api';
import type { ShelfAction, ShelfItem } from '../../ai/types';
import type { ShelfChangeReason, RemovalMeta, AdditionMeta } from '../../ai/node-shelf';

import { ChatPanel } from './chat-panel/chat-panel';
import { SuggestionPanel } from './suggestion-panel';
import { PathPanel } from './path-panel';
import { NodeShelf } from '../../ai/node-shelf';
import { ShelfInteractionGuard } from '../shelf-interaction-guard';

export class PanelAPI {
  readonly chatPanel: ChatPanel;
  readonly suggestionPanel: SuggestionPanel;
  readonly pathPanel: PathPanel;
  readonly nodeShelf: NodeShelf;
  readonly #shelfGuard = new ShelfInteractionGuard();

  constructor(cy: Core, features: FeatureAPI) {
    const suggestionsContainer = document.getElementById('suggestions');
    if (!suggestionsContainer) {
      throw new Error('Suggestions container not found');
    }

    const pathPanelContainer = document.getElementById('path-panel');
    if (!pathPanelContainer) {
      throw new Error('Path panel container not found');
    }

    // Create components
    this.chatPanel = new ChatPanel(cy);
    this.suggestionPanel = new SuggestionPanel(suggestionsContainer, cy);
    this.pathPanel = new PathPanel(cy, features, pathPanelContainer);
    this.nodeShelf = new NodeShelf(features);

    // Wire: ChatPanel actions → NodeShelf
    this.chatPanel.onActionsReceived((actions) => {
      const shelfActions = actions.filter(
        (a): a is ShelfAction => a.type === 'create_connected' || a.type === 'include_existing'
      );
      this.nodeShelf.addItems(shelfActions);
    });

    // Wire: NodeShelf items → SuggestionPanel (dispatch by reason)
    //
    // Shelf animations must not be disrupted mid-flight (ShelfInteractionGuard):
    // - Add/Remove commands (reason 'removal') are fully blocked by the click and
    //   dismiss handlers below, which own the whole execution.
    // - Post-transition and AI-addition re-arrangements are shelf-only blocked
    //   here, so the rest of the app stays interactive while the shelf settles.
    // `pendingShelfRender` lets the Add/Remove handlers await the removal render
    // that this dispatcher kicks off in response to their command.
    let pendingShelfRender: Promise<void> = Promise.resolve();
    this.nodeShelf.setEvents({
      onItemsChanged: (
        items: ShelfItem[],
        reason: ShelfChangeReason,
        meta?: RemovalMeta | AdditionMeta
      ) => {
        switch (reason) {
          case 'transition':
            pendingShelfRender = this.#shelfGuard.runShelfBlocked(
              () => this.suggestionPanel.renderTransition(items)
            );
            break;
          case 'addition':
            if (meta && 'startIndex' in meta) {
              pendingShelfRender = this.#shelfGuard.runShelfBlocked(
                () => this.suggestionPanel.renderAddition(items, meta)
              );
            }
            break;
          case 'removal':
            if (meta && 'index' in meta) {
              pendingShelfRender = this.suggestionPanel.renderRemoval(meta.index, items, meta.style);
            }
            break;
        }
      }
    });

    // Wire: SuggestionPanel click → NodeShelf placeNode (Add-from-shelf)
    this.suggestionPanel.setBlockedPredicate(() => this.#shelfGuard.isBusy());
    this.#shelfGuard.onBusyChange((busy) => this.suggestionPanel.setBlockedVisual(busy));
    this.suggestionPanel.onItemClick((index) => {
      if (this.#shelfGuard.isBusy()) return;
      void this.#shelfGuard.runFullyBlocked(async () => {
        await this.nodeShelf.placeNode(index);
        await pendingShelfRender;
      });
    });

    // Wire: SuggestionPanel dismiss → NodeShelf removeItem (Remove-from-shelf)
    this.suggestionPanel.onItemDismiss((index) => {
      if (this.#shelfGuard.isBusy()) return;
      void this.#shelfGuard.runFullyBlocked(async () => {
        this.nodeShelf.removeItem(index);
        await pendingShelfRender;
      });
    });
  }
}
