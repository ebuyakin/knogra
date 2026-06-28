import type cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import type { AppMode, Node, NodeId } from '../core/main-types';
import type { QuizConfig, QuizNodeStatus, QuizSnapshot, QuizSnapshotListener } from '../core/quiz-types';
import { eventBus } from '../events/event-bus';
import { getAppMode, setAppMode } from '../storage/app-mode';
import { graphStore } from '../storage/graph-store';
import { StyleGenerator } from '../styles/style-generator';

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

export function getEligibleQuizNodeIds(config: QuizConfig): NodeId[] {
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
    .filter(nodeId => sceneNodeIds.has(nodeId))
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
  #session: QuizSession | null = null;
  #listeners: Set<QuizSnapshotListener> = new Set();
  #selectedNodeId: NodeId | null = null;
  #message: string | null = null;
  #ending: boolean = false;

  constructor(cy: Core) {
    this.#cy = cy;

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
        eligibleNodeCount: getEligibleQuizNodeIds({ hiddenPercent: 30, includeCentralNodes: true }).length,
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
    const eligibleNodeIds = getEligibleQuizNodeIds(normalizedConfig);
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
    this.#selectedNodeId = selectedNode.length > 0 ? selectedNode.id() as NodeId : null;
  }

  #applyCurrentSceneState(): void {
    if (!this.#session) return;

    void Promise.all(this.#cy.nodes().map(node => this.#applyNodeState(node)));
    this.#refreshSelectedNode();
    this.#emitSnapshot();
  }

  #applyNodeStateById(nodeId: NodeId): void {
    const node = this.#cy.getElementById(nodeId as string);
    if (node.length > 0 && node.isNode()) {
      void this.#applyNodeState(node as cytoscape.NodeSingular);
    }
  }

  /**
   * Apply a node's quiz visual via a per-element style bypass only.
   * The only visual difference between states is text opacity: a hidden node
   * has its content masked (textOpacity 0); every other state shows the node
   * exactly as it normally renders. Nothing else ever changes.
   */
  async #applyNodeState(node: cytoscape.NodeSingular): Promise<void> {
    if (this.#getNodeStatus(node.id() as NodeId) === 'hidden') {
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
      if (this.#getNodeStatus(node.id() as NodeId) !== 'hidden') return;
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
    const stored = graphStore.nodes.find(n => n.id === node.id());
    if (stored) return stored;
    return {
      id: node.id() as NodeId,
      title: (node.data('title') as string) ?? '',
      tags: (node.data('tags') as string[]) ?? [],
      properties: (node.data('properties') as Record<string, unknown>) ?? {}
    };
  }

  #currentThemeId(): string {
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