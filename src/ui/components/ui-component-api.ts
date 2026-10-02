/**
 * UI Component API
 * Facade for mature UI components
 */

import type { Core } from 'cytoscape';
import type { Scene } from '../../core/main-types';
import type { FeatureAPI } from '../../features/feature-api';

import { NodeEditor } from './node-editor/node-editor';
import { EdgeEditor } from './edge-editor';
import { EdgeTypeManager } from './edge-type-manager';
import { EdgeTypeVisibilityModal } from './edge-type-visibility-modal';
import { NodePicker } from './node-picker';
import { NodeManager } from './node-manager';
import { BackgroundEditor } from './background-editor';
import { ThemePicker } from './theme-picker';
import { QuizPanel } from './quiz-panel';
import { ContextMenu } from '../context-menu/context-menu';
import { PasteStyleDialog } from './paste-style-dialog';
import { AnchorLinkTooltip } from './anchor-link-tooltip';
import { MapBoxTooltip } from './map-box-tooltip';
import { QuickTitleEditor } from './quick-title-editor';
import { ConnectionBadgeManager } from './connection-badge';
import { FoldBadgeManager } from './fold-badge';
import { EdgeCreationMode } from '../edge-creation-mode';
import { KeyboardHandler } from '../keyboard/keyboard-handler';
import { TransitionInputGuard } from '../transition-input-guard';
import { graphStore } from '../../storage/graph-store';
import { StyleGenerator } from '../../styles/style-generator';

export class UIComponentAPI {
  readonly nodeEditor: NodeEditor;
  readonly edgeEditor: EdgeEditor;
  readonly edgeTypeManager: EdgeTypeManager;
  readonly edgeTypeVisibilityModal: EdgeTypeVisibilityModal;
  readonly nodePicker: NodePicker;
  readonly nodeManager: NodeManager;
  readonly backgroundEditor: BackgroundEditor;
  readonly themePicker: ThemePicker;
  readonly quizPanel: QuizPanel;
  readonly anchorLinkTooltip: AnchorLinkTooltip;
  readonly mapBoxTooltip: MapBoxTooltip;
  readonly quickTitleEditor: QuickTitleEditor;
  readonly contextMenu: ContextMenu;
  readonly pasteStyleDialog: PasteStyleDialog;
  readonly badgeManager: ConnectionBadgeManager;
  readonly foldBadgeManager: FoldBadgeManager;
  readonly edgeCreationMode: EdgeCreationMode;
  readonly keyboardHandler: KeyboardHandler;
  readonly transitionInputGuard: TransitionInputGuard;

  /** Both surfaces come from main.ts; the UI never obtains an instance or a container from a feature. */
  constructor(cy: Core, container: HTMLElement, features: FeatureAPI, mapCy: Core, mapContainer: HTMLElement) {
    // Create editors (independent)
    this.nodeEditor = new NodeEditor();
    this.edgeEditor = new EdgeEditor();
    this.edgeTypeManager = new EdgeTypeManager({
      onEdgeTypesChanged: () => this.#refreshCurrentEdgeTypeStyles(cy),
      resolveThemeId: () => this.#currentScene(cy)?.themeId || 'dark'
    });
    this.edgeTypeVisibilityModal = new EdgeTypeVisibilityModal(features);
    this.nodePicker = new NodePicker();
    this.nodeManager = new NodeManager(features);
    this.backgroundEditor = new BackgroundEditor(container);
    this.themePicker = new ThemePicker();
    this.quizPanel = new QuizPanel(features, container);
    this.anchorLinkTooltip = new AnchorLinkTooltip(cy, container);
    this.mapBoxTooltip = new MapBoxTooltip(mapCy, mapContainer, features);
    this.quickTitleEditor = new QuickTitleEditor(cy, container);
    this.edgeCreationMode = new EdgeCreationMode(cy, container, features);
    this.pasteStyleDialog = new PasteStyleDialog(features);

    // Create context menu (depends on editors)
    this.contextMenu = new ContextMenu({
      cy,
      container,
      mapCy,
      features,
      edgeCreationMode: this.edgeCreationMode,
      nodeEditor: this.nodeEditor,
      edgeEditor: this.edgeEditor,
      edgeTypeManager: this.edgeTypeManager,
      edgeTypeVisibilityModal: this.edgeTypeVisibilityModal,
      nodeManager: this.nodeManager,
      backgroundEditor: this.backgroundEditor,
      themePicker: this.themePicker,
      quizPanel: this.quizPanel,
      anchorLinkTooltip: this.anchorLinkTooltip,
      pasteStyleDialog: this.pasteStyleDialog
    });

    // Create badge managers
    this.badgeManager = new ConnectionBadgeManager(cy, container);
    this.foldBadgeManager = new FoldBadgeManager(cy, container, features);

    // Create keyboard handler
    this.keyboardHandler = new KeyboardHandler({
      cy,
      features,
      container,
      badgeManager: this.badgeManager,
      nodeEditor: this.nodeEditor,
      nodeManager: this.nodeManager,
      anchorLinkTooltip: this.anchorLinkTooltip,
      quickTitleEditor: this.quickTitleEditor
    });
    this.keyboardHandler.setEdgeCreationMode(this.edgeCreationMode);

    // Create transition input guard (blocks input during transitions)
    this.transitionInputGuard = new TransitionInputGuard(cy);
  }

  #currentScene(cy: Core): Scene | undefined {
    const currentSceneId = cy.scratch('currentSceneId') as string | undefined;
    return graphStore.scenes.find(scene => scene.id === currentSceneId);
  }

  #refreshCurrentEdgeTypeStyles(cy: Core): void {
    const currentScene = this.#currentScene(cy);
    const themeId = currentScene?.themeId || 'dark';
    const stylesheet = (cy.style() as any).json();
    let updatedStylesheet = StyleGenerator.updateEdgeTypesInStylesheet(
      stylesheet,
      graphStore.edgeTypes,
      themeId
    );
    updatedStylesheet = StyleGenerator.updateEdgeTypeVisibilityInStylesheet(
      updatedStylesheet,
      currentScene?.edgeTypeVisibility
    );
    cy.style().fromJson(updatedStylesheet).update();
  }
}
