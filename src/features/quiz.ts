/**
 * Quiz — runtime recall over one canvas.
 *
 * A session samples nodes and masks their content on the instance it is bound
 * to; the user selects, reveals, grades. Two instances exist (feature-api.ts):
 * one over the scene instance, eligible nodes being those in some scene, and
 * one over the map instance, eligible nodes being the whole graph; a session
 * belongs to the canvas it was started on and the handoff is closed while it
 * runs (docs/map-view.md §7.5). The class knows neither canvas by name: it
 * reads an element's node through the instance contract both honour, the node
 * id in `data.nodeId` or else the element id, the design in `data.design`, the
 * theme in the instance's scratch or else the current scene's.
 */

import type cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import type { AppMode, Node, NodeId } from '../core/main-types';
import type { QuizConfig, QuizNodeStatus, QuizSnapshot, QuizSnapshotListener } from '../core/quiz-types';
import { eventBus } from '../events/event-bus';
import { getAppMode, setAppMode } from '../storage/app-mode';
import { graphStore } from '../storage/graph-store';
import { StyleGenerator } from '../styles/style-generator';

/** Which nodes a session may hide: those in some scene (the scene quiz), or every node (the map quiz). */
export type QuizEligibility = 'scenes' | 'graph';

interface QuizSession {
  config: QuizConfig;
  previousAppMode: AppMode;
  eligibleNodeIds: NodeId[];
  hiddenNodeIds: Set<NodeId>;
  revealedNodeIds: Set<NodeId>;
  correctNodeIds: Set<NodeId>;
  wrongNodeIds: Set<NodeId>;
}

// Per-element style bypass Quiz writes. A hidden node's content is masked by
// bypassing only its background-image; nothing else is ever touched.
const QUIZ_BYPASS_PROPS = 'background-image';

export function getEligibleQuizNodeIds(config: QuizConfig, eligibility: QuizEligibility): NodeId[] {
  const sceneNodeIds = new Set<NodeId>();
  const centralNodeIds = new Set<NodeId>();

  for (const scene of graphStore.scenes) {
    centralNodeIds.add(scene.centralNodeId);
    for (const nodeId of Object.keys(scene.nodes) as NodeId[]) {
      sceneNodeIds.add(nodeId);
    }
  }

  return graphStore.nodes
    .map(node => node.id)
    .filter(nodeId => eligibility === 'graph' || sceneNodeIds.has(nodeId))
    .filter(nodeId => config.includeCentralNodes || !centralNodeIds.has(nodeId));
}

export function sampleQuizNodeIds(nodeIds: NodeId[], hiddenPercent: number): NodeId[] {
  const clampedPercent = Math.max(0, Math.min(100, hiddenPercent));
  if (nodeIds.length === 0 || clampedPercent === 0) return [];

  const targetCount = Math.min(
    nodeIds.length,
    Math.max(1, Math.round(nodeIds.length * clampedPercent / 100))
  );
  const shuffled = [...nodeIds];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, targetCount);
}

export class Quiz {
  #cy: Core;
  #eligibility: QuizEligibility;
  #session: QuizSession | null = null;
  #listeners: Set<QuizSnapshotListener> = new Set();
  #selectedNodeId: NodeId | null = null;
  #message: string | null = null;
  #ending: boolean = false;

  constructor(cy: Core, eligibility: QuizEligibility) {
    this.#cy = cy;
    this.#eligibility = eligibility;

    this.#cy.on('select unselect', 'node', () => {
      this.#refreshSelectedNode();
      this.#emitSnapshot();
    });

    this.#cy.on('add', 'node', (event: cytoscape.EventObject) => {
      if (!this.#session) return;
      void this.#applyNodeState(event.target as cytoscape.NodeSingular);
    });

    eventBus.on('transitionEnd', () => this.#applyCurrentSceneState());
    eventBus.on('sceneChanged', () => this.#applyCurrentSceneState());
    eventBus.on('appModeChanged', ({ mode }) => {
      if (this.#session && mode === 'edit' && !this.#ending) {
        this.#end({ restoreAppMode: false });
      }
    });
  }

  isActive(): boolean {
    return this.#session !== null;
  }

  /** A node's standing in the running session; 'not-hidden' when none runs. For the UI that must not give a hidden node away. */
  statusOf(nodeId: NodeId): QuizNodeStatus {
    return this.#getNodeStatus(nodeId);
  }

  subscribe(listener: QuizSnapshotListener): () => void {
    this.#listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.#listeners.delete(listener);
    };
  }

  getSnapshot(): QuizSnapshot {
    const selectedNodeStatus = this.#selectedNodeId ? this.#getNodeStatus(this.#selectedNodeId) : null;
    const selectedNodeTitle = this.#selectedNodeId && selectedNodeStatus !== 'hidden'
      ? graphStore.nodes.find(node => node.id === this.#selectedNodeId)?.title ?? null
      : null;

    if (!this.#session) {
      return {
        active: false,
        config: null,
        previousAppMode: null,
        eligibleNodeCount: getEligibleQuizNodeIds({ hiddenPercent: 30, includeCentralNodes: true }, this.#eligibility).length,
        hiddenCount: 0,
        revealedCount: 0,
        remainingCount: 0,
        correctCount: 0,
        wrongCount: 0,
        selectedNodeId: this.#selectedNodeId,
        selectedNodeTitle,
        selectedNodeStatus,
        message: this.#message
      };
    }

    return {
      active: true,
      config: this.#session.config,
      previousAppMode: this.#session.previousAppMode,
      eligibleNodeCount: this.#session.eligibleNodeIds.length,
      hiddenCount: this.#session.hiddenNodeIds.size,
      revealedCount: this.#session.revealedNodeIds.size,
      remainingCount: this.#session.hiddenNodeIds.size - this.#session.revealedNodeIds.size,
      correctCount: this.#session.correctNodeIds.size,
      wrongCount: this.#session.wrongNodeIds.size,
      selectedNodeId: this.#selectedNodeId,
      selectedNodeTitle,
      selectedNodeStatus,
      message: this.#message
    };
  }

  start(config: QuizConfig): void {
    if (this.#session) {
      this.#end({ restoreAppMode: true });
    }

    const normalizedConfig = this.#normalizeConfig(config);
    const eligibleNodeIds = getEligibleQuizNodeIds(normalizedConfig, this.#eligibility);
    const hiddenNodeIds = sampleQuizNodeIds(eligibleNodeIds, normalizedConfig.hiddenPercent);

    if (hiddenNodeIds.length === 0) {
      this.#message = 'No eligible nodes to hide.';
      this.#emitSnapshot();
      return;
    }

    this.#session = {
      config: normalizedConfig,
      previousAppMode: getAppMode(),
      eligibleNodeIds,
      hiddenNodeIds: new Set(hiddenNodeIds),
      revealedNodeIds: new Set(),
      correctNodeIds: new Set(),
      wrongNodeIds: new Set()
    };

    this.#message = null;
    setAppMode('view');
    this.#refreshSelectedNode();
    this.#applyCurrentSceneState();
    eventBus.emit('quizStateChanged', { active: true });
    this.#emitSnapshot();
  }

  end(): void {
    this.#end({ restoreAppMode: true });
  }

  revealSelected(): void {
    const session = this.#session;
    const nodeId = this.#selectedNodeId;
    if (!session || !nodeId || this.#getNodeStatus(nodeId) !== 'hidden') return;

    session.revealedNodeIds.add(nodeId);
    this.#message = null;
    this.#applyNodeStateById(nodeId);
    this.#emitSnapshot();
  }

  markSelectedCorrect(): void {
    this.#markSelected('correct');
  }

  markSelectedWrong(): void {
    this.#markSelected('wrong');
  }

  #markSelected(status: 'correct' | 'wrong'): void {
    const session = this.#session;
    const nodeId = this.#selectedNodeId;
    const currentStatus = nodeId ? this.#getNodeStatus(nodeId) : null;
    if (!session || !nodeId || (currentStatus !== 'revealed' && currentStatus !== 'correct' && currentStatus !== 'wrong')) {
      return;
    }

    session.revealedNodeIds.add(nodeId);
    if (status === 'correct') {
      session.correctNodeIds.add(nodeId);
      session.wrongNodeIds.delete(nodeId);
    } else {
      session.wrongNodeIds.add(nodeId);
      session.correctNodeIds.delete(nodeId);
    }

    this.#message = null;
    this.#applyNodeStateById(nodeId);
    this.#emitSnapshot();
  }

  #end(options: { restoreAppMode: boolean }): void {
    const session = this.#session;
    if (!session) return;

    this.#ending = true;
    this.#clearAllBypasses();
    this.#session = null;
    this.#message = null;

    if (options.restoreAppMode && getAppMode() !== session.previousAppMode) {
      setAppMode(session.previousAppMode);
    }

    this.#ending = false;
    eventBus.emit('quizStateChanged', { active: false });
    this.#emitSnapshot();
  }

  #normalizeConfig(config: QuizConfig): QuizConfig {
    return {
      hiddenPercent: Math.max(1, Math.min(100, Math.round(config.hiddenPercent))),
      includeCentralNodes: config.includeCentralNodes
    };
  }

  #refreshSelectedNode(): void {
    const selectedNode = this.#cy.nodes(':selected').first();
    this.#selectedNodeId = selectedNode.length > 0 ? this.#nodeIdOf(selectedNode) : null;
  }

  /** The node behind an element: `data.nodeId` where the instance's ids are opaque (the map), else the element id (a scene). */
  #nodeIdOf(node: cytoscape.NodeSingular): NodeId {
    return (node.data('nodeId') as NodeId | undefined) ?? (node.id() as NodeId);
  }

  #applyCurrentSceneState(): void {
    if (!this.#session) return;

    void Promise.all(this.#cy.nodes().map(node => this.#applyNodeState(node)));
    this.#refreshSelectedNode();
    this.#emitSnapshot();
  }

  /** Every element of the node, several on the map (twins), one on a scene. */
  #applyNodeStateById(nodeId: NodeId): void {
    this.#cy.nodes().forEach(node => {
      if (this.#nodeIdOf(node) === nodeId) void this.#applyNodeState(node);
    });
  }

  /**
   * Apply a node's quiz visual via a per-element style bypass only.
   * The only visual difference between states is text opacity: a hidden node
   * has its content masked (textOpacity 0); every other state shows the node
   * exactly as it normally renders. Nothing else ever changes.
   */
  async #applyNodeState(node: cytoscape.NodeSingular): Promise<void> {
    if (this.#getNodeStatus(this.#nodeIdOf(node)) === 'hidden') {
      await this.#hideNodeContent(node);
      return;
    }
    node.removeStyle('background-image');
  }

  /**
   * Hide a node's content by regenerating its design with text opacity 0 and
   * applying the result as a per-element background-image bypass. The node
   * shape, fill, size, and position are untouched — only the content vanishes.
   */
  async #hideNodeContent(node: cytoscape.NodeSingular): Promise<void> {
    try {
      const maskedImage = await this.#maskedBackgroundImage(node);
      if (!maskedImage) return;
      // State may have changed while the masked SVG was generating.
      if (this.#getNodeStatus(this.#nodeIdOf(node)) !== 'hidden') return;
      node.style('background-image', maskedImage);
    } catch (error) {
      console.warn(`[Quiz] Failed to mask node ${node.id()}`, error);
    }
  }

  async #maskedBackgroundImage(node: cytoscape.NodeSingular): Promise<string | null> {
    const design = (node.data('design') as { id: string; params: Record<string, unknown> } | undefined)
      ?? { id: 'equation-node', params: {} };
    const baseEffects = design.params?.effects as Record<string, unknown> | undefined;
    const maskedDesign = {
      id: design.id,
      params: { ...design.params, effects: { ...baseEffects, textOpacity: 0 } }
    };

    const style = await StyleGenerator.generateNodeStyle(
      this.#resolveNodeData(node),
      maskedDesign,
      this.#currentThemeId()
    );
    return (style as { 'background-image'?: string })['background-image'] ?? null;
  }

  #resolveNodeData(node: cytoscape.NodeSingular): Node {
    const nodeId = this.#nodeIdOf(node);
    const stored = graphStore.nodes.find(n => n.id === nodeId);
    if (stored) return stored;
    return {
      id: nodeId,
      title: (node.data('title') as string) ?? '',
      tags: (node.data('tags') as string[]) ?? [],
      properties: (node.data('properties') as Record<string, unknown>) ?? {}
    };
  }

  /** The theme the instance draws in: declared in its scratch (the map), else the current scene's. */
  #currentThemeId(): string {
    const declared = this.#cy.scratch('themeId') as string | undefined;
    if (declared) return declared;
    const sceneId = this.#cy.scratch('currentSceneId') as string | undefined;
    const scene = sceneId ? graphStore.scenes.find(s => s.id === sceneId) : null;
    return scene?.themeId ?? 'dark';
  }

  #getNodeStatus(nodeId: NodeId): QuizNodeStatus {
    const session = this.#session;
    if (!session || !session.hiddenNodeIds.has(nodeId)) return 'not-hidden';
    if (session.correctNodeIds.has(nodeId)) return 'correct';
    if (session.wrongNodeIds.has(nodeId)) return 'wrong';
    if (session.revealedNodeIds.has(nodeId)) return 'revealed';
    return 'hidden';
  }

  #clearNodeBypass(node: cytoscape.NodeSingular): void {
    node.removeStyle(QUIZ_BYPASS_PROPS);
  }

  #clearAllBypasses(): void {
    this.#cy.nodes().forEach(node => this.#clearNodeBypass(node));
  }

  #emitSnapshot(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) {
      listener(snapshot);
    }
  }
}