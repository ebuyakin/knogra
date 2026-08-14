/**
 * Keyboard Context
 * The shared bag of collaborators every keyboard binding may reach for.
 *
 * Held by KeyboardHandler and handed to each binding block, so blocks stay
 * plain functions instead of methods on a growing class. Late-bound members
 * (badge manager, edge creation mode) are mutated in place on this object;
 * bindings read them at key-press time, never at construction.
 */

import type { Core } from 'cytoscape';
import type { FeatureAPI } from '../../features/feature-api';
import type { ConnectionBadgeManager } from '../components/connection-badge';
import type { EdgeCreationMode } from '../edge-creation-mode';
import type { NodeEditor } from '../components/node-editor/node-editor';
import type { NodeManager } from '../components/node-manager';
import type { AnchorLinkTooltip } from '../components/anchor-link-tooltip';
import type { QuickTitleEditor } from '../components/quick-title-editor';
import type { SettingsModal } from '../components/settings-modal';
import type { ShortcutOverlay } from '../components/shortcut-overlay';

/** What UIComponentAPI supplies when constructing the handler. */
export interface KeyboardDependencies {
  cy: Core;
  features: FeatureAPI;
  container?: HTMLElement | null;
  badgeManager?: ConnectionBadgeManager | null;
  nodeEditor?: NodeEditor | null;
  nodeManager?: NodeManager | null;
  anchorLinkTooltip?: AnchorLinkTooltip | null;
  quickTitleEditor?: QuickTitleEditor | null;
}

/** What the binding blocks receive. */
export interface KeyboardContext {
  cy: Core;
  features: FeatureAPI;
  container: HTMLElement | null;
  badgeManager: ConnectionBadgeManager | null;
  edgeCreationMode: EdgeCreationMode | null;
  nodeEditor: NodeEditor | null;
  nodeManager: NodeManager | null;
  anchorLinkTooltip: AnchorLinkTooltip | null;
  quickTitleEditor: QuickTitleEditor | null;
  settingsModal: SettingsModal;
  shortcutOverlay: ShortcutOverlay;
}

/**
 * A block of related shortcuts. Returns true when it consumed the key, which
 * stops the remaining blocks from being consulted — the direct equivalent of
 * an early `return` in the original single if-chain.
 */
export type BindingBlock = (
  context: KeyboardContext,
  event: KeyboardEvent,
  key: string,
  ctrl: boolean
) => boolean | Promise<boolean>;
