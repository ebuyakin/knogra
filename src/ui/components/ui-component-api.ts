/**
 * UI Component API
 * Facade for mature UI components
 */

import type { Core } from 'cytoscape';
import type { FeatureAPI } from '../../features/feature-api';

import { NodeEditor } from './node-editor';
import { EdgeEditor } from './edge-editor';
import { NodePicker } from './node-picker';
import { NodeManager } from './node-manager';
import { BackgroundEditor } from './background-editor';
import { ThemeEditor } from './theme-editor';
import { ContextMenu } from './context-menu';
import { ConnectionBadgeManager } from './connection-badge';
import { FoldBadgeManager } from './fold-badge';
import { KeyboardHandler } from '../keyboard-handler';
import { TransitionInputGuard } from '../transition-input-guard';

export class UIComponentAPI {
  readonly nodeEditor: NodeEditor;
  readonly edgeEditor: EdgeEditor;
  readonly nodePicker: NodePicker;
  readonly nodeManager: NodeManager;
  readonly backgroundEditor: BackgroundEditor;
  readonly themeEditor: ThemeEditor;
  readonly contextMenu: ContextMenu;
  readonly badgeManager: ConnectionBadgeManager;
  readonly foldBadgeManager: FoldBadgeManager;
  readonly keyboardHandler: KeyboardHandler;
  readonly transitionInputGuard: TransitionInputGuard;

  constructor(cy: Core, container: HTMLElement, features: FeatureAPI) {
    // Create editors (independent)
    this.nodeEditor = new NodeEditor();
    this.edgeEditor = new EdgeEditor();
    this.nodePicker = new NodePicker();
    this.nodeManager = new NodeManager(features);
    this.backgroundEditor = new BackgroundEditor(container);
    this.themeEditor = new ThemeEditor();

    // Create context menu (depends on editors)
    this.contextMenu = new ContextMenu(
      cy,
      container,
      features,
      this.nodeEditor,
      this.edgeEditor,
      this.nodePicker,
      this.nodeManager,
      this.backgroundEditor,
      this.themeEditor
    );

    // Create badge managers
    this.badgeManager = new ConnectionBadgeManager(cy, container);
    this.foldBadgeManager = new FoldBadgeManager(cy, container, features);

    // Create keyboard handler
    this.keyboardHandler = new KeyboardHandler(cy, features, this.badgeManager, this.nodeEditor, this.nodeManager, container);

    // Create transition input guard (blocks input during transitions)
    this.transitionInputGuard = new TransitionInputGuard();
  }
}
