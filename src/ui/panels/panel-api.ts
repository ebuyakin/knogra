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

export class PanelAPI {
  readonly chatPanel: ChatPanel;
  readonly suggestionPanel: SuggestionPanel;
  readonly pathPanel: PathPanel;
  readonly nodeShelf: NodeShelf;

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
    this.nodeShelf.setEvents({
      onItemsChanged: (
        items: ShelfItem[],
        reason: ShelfChangeReason,
        meta?: RemovalMeta | AdditionMeta
      ) => {
        switch (reason) {
          case 'transition':
            this.suggestionPanel.renderTransition(items);
            break;
          case 'addition':
            if (meta && 'startIndex' in meta) {
              this.suggestionPanel.renderAddition(items, meta);
            }
            break;
          case 'removal':
            if (meta && 'index' in meta) {
              this.suggestionPanel.renderRemoval(meta.index, items, meta.style);
            }
            break;
        }
      }
    });

    // Wire: SuggestionPanel click → NodeShelf placeNode
    this.suggestionPanel.onItemClick((index) => {
      this.nodeShelf.placeNode(index);
    });

    // Wire: SuggestionPanel dismiss → NodeShelf removeItem
    this.suggestionPanel.onItemDismiss((index) => {
      this.nodeShelf.removeItem(index);
    });
  }
}
