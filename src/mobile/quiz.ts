/**
 * Quiz (docs/mobile-viewer.md §10.2)
 *
 * The viewer's own quiz, behaving as the desktop's map quiz does
 * (features/quiz.ts with graph-wide eligibility, which the viewer does not
 * import, §11.1): every node in the graph is eligible, a sample of them is
 * hidden by masking each box's face with the design regenerated at text
 * opacity 0, a hidden node stays masked wherever it appears, and the session
 * follows travel because every box added to the instance is masked on
 * arrival. Reveal unmasks the selected box; Correct and Wrong grade it.
 *
 * Only the face is touched, as a per-element style bypass; shape, fill, size
 * and position stay as drawn. Nothing is written anywhere. The viewer never
 * edits, so there is no app mode to force, unlike the desktop.
 */

import type { Core, NodeSingular } from 'cytoscape';
import type { NodeId } from '../core/main-types';
import type { NodeDesign } from '../features/map-view/default-design';
import { graphStore } from '../storage/graph-store';
import { StyleGenerator } from '../styles/style-generator';

export interface PhoneQuizConfig {
  /** The share of the graph's nodes hidden, 1 to 100. */
  hiddenPercent: number;
}

export type PhoneQuizStatus = 'not-hidden' | 'hidden' | 'revealed' | 'correct' | 'wrong';

export interface PhoneQuizSnapshot {
  active: boolean;
  eligibleCount: number;
  hiddenCount: number;
  remainingCount: number;
  correctCount: number;
  wrongCount: number;
  /** Revealed without a verdict so far; a later Correct or Wrong on the node still takes it out of here. */
  skippedCount: number;
  selectedNodeId: NodeId | null;
  selectedStatus: PhoneQuizStatus | null;
  message: string | null;
}

export type PhoneQuizListener = (snapshot: PhoneQuizSnapshot) => void;

interface Session {
  hidden: Set<NodeId>;
  revealed: Set<NodeId>;
  correct: Set<NodeId>;
  wrong: Set<NodeId>;
}

/** The one style property the quiz bypasses: the face. */
const FACE_PROPERTY = 'background-image';

/** Every node in the graph. The desktop can spare central nodes; on the map every landmark becomes the focus on travel, so there is no such distinction. */
function eligibleNodeIds(): NodeId[] {
  return graphStore.nodes.map(node => node.id);
}

/** A random sample of `hiddenPercent` of the ids, at least one when there are any. */
function sample(nodeIds: NodeId[], hiddenPercent: number): NodeId[] {
  const share = Math.max(0, Math.min(100, hiddenPercent));
  if (nodeIds.length === 0 || share === 0) return [];
  const count = Math.min(nodeIds.length, Math.max(1, Math.round((nodeIds.length * share) / 100)));
  const shuffled = [...nodeIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

export class PhoneQuiz {
  #cy: Core;
  /** The theme the map is drawn in, for the masked face; the map's, read when a box is masked. */
  #themeId: () => string;
  #session: Session | null = null;
  #message: string | null = null;
  #listeners = new Set<PhoneQuizListener>();

  constructor(cy: Core, themeId: () => string) {
    this.#cy = cy;
    this.#themeId = themeId;
    this.#cy.on('select unselect', 'node', () => this.#emit());
    // A box arriving by travel is masked at once if its node is hidden.
    this.#cy.on('add', 'node', event => {
      if (this.#session) void this.#applyTo(event.target as NodeSingular);
    });
  }

  isActive(): boolean {
    return this.#session !== null;
  }

  subscribe(listener: PhoneQuizListener): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => this.#listeners.delete(listener);
  }

  snapshot(): PhoneQuizSnapshot {
    const selectedNodeId = this.#selectedNodeId();
    const selectedStatus = selectedNodeId ? this.statusOf(selectedNodeId) : null;
    const session = this.#session;
    // The node just revealed and still selected is awaiting its verdict, not skipped.
    const awaiting = selectedStatus === 'revealed' ? 1 : 0;
    return {
      active: session !== null,
      eligibleCount: eligibleNodeIds().length,
      hiddenCount: session?.hidden.size ?? 0,
      remainingCount: session ? session.hidden.size - session.revealed.size : 0,
      correctCount: session?.correct.size ?? 0,
      wrongCount: session?.wrong.size ?? 0,
      skippedCount: session ? session.revealed.size - session.correct.size - session.wrong.size - awaiting : 0,
      selectedNodeId,
      selectedStatus,
      message: this.#message,
    };
  }

  statusOf(nodeId: NodeId): PhoneQuizStatus {
    const session = this.#session;
    if (!session || !session.hidden.has(nodeId)) return 'not-hidden';
    if (session.correct.has(nodeId)) return 'correct';
    if (session.wrong.has(nodeId)) return 'wrong';
    if (session.revealed.has(nodeId)) return 'revealed';
    return 'hidden';
  }

  start(config: PhoneQuizConfig): void {
    if (this.#session) this.end();
    const percent = Math.max(1, Math.min(100, Math.round(config.hiddenPercent)));
    const hidden = sample(eligibleNodeIds(), percent);
    if (hidden.length === 0) {
      this.#message = 'No nodes to hide.';
      this.#emit();
      return;
    }
    this.#session = { hidden: new Set(hidden), revealed: new Set(), correct: new Set(), wrong: new Set() };
    this.#message = null;
    this.#applyToAll();
    this.#emit();
  }

  end(): void {
    if (!this.#session) return;
    this.#session = null;
    this.#message = null;
    this.#cy.nodes().forEach(node => {
      node.removeStyle(FACE_PROPERTY);
    });
    this.#emit();
  }

  /** Unmask a hidden node, wherever it is drawn; the verdict buttons then wait for it. */
  reveal(nodeId: NodeId): void {
    const session = this.#session;
    if (!session || this.statusOf(nodeId) !== 'hidden') return;
    session.revealed.add(nodeId);
    this.#applyToNode(nodeId);
    this.#emit();
  }

  markCorrect(): void {
    this.#mark('correct');
  }

  markWrong(): void {
    this.#mark('wrong');
  }

  /** One verdict per reveal: a node already judged takes no second one, so a double tap on the button cannot count twice. */
  #mark(verdict: 'correct' | 'wrong'): void {
    const session = this.#session;
    const nodeId = this.#selectedNodeId();
    if (!session || !nodeId || this.statusOf(nodeId) !== 'revealed') return;
    if (verdict === 'correct') session.correct.add(nodeId);
    else session.wrong.add(nodeId);
    this.#emit();
  }

  #selectedNodeId(): NodeId | null {
    const selected = this.#cy.nodes(':selected');
    if (selected.length !== 1) return null;
    return (selected.first().data('nodeId') as NodeId | undefined) ?? null;
  }

  #applyToAll(): void {
    this.#cy.nodes().forEach(node => void this.#applyTo(node));
  }

  #applyToNode(nodeId: NodeId): void {
    this.#cy.nodes().forEach(node => {
      if (node.data('nodeId') === nodeId) void this.#applyTo(node);
    });
  }

  /** Mask a hidden node's box; show every other box as drawn. */
  async #applyTo(node: NodeSingular): Promise<void> {
    const nodeId = node.data('nodeId') as NodeId | undefined;
    if (!nodeId || this.statusOf(nodeId) !== 'hidden') {
      node.removeStyle(FACE_PROPERTY);
      return;
    }
    try {
      const face = await this.#maskedFace(node, nodeId);
      // The node may have been revealed or the session ended while the face was generated.
      if (face && this.statusOf(nodeId) === 'hidden') node.style(FACE_PROPERTY, face);
    } catch (error) {
      console.warn(`[viewer quiz] Could not mask ${nodeId}`, error);
    }
  }

  /** The box's design regenerated with its text at opacity 0: the same shape and fill, no content. */
  async #maskedFace(node: NodeSingular, nodeId: NodeId): Promise<string | null> {
    const stored = graphStore.nodes.find(candidate => candidate.id === nodeId);
    const design = node.data('design') as NodeDesign | undefined;
    if (!stored || !design) return null;
    const effects = (design.params?.effects ?? {}) as Record<string, unknown>;
    const masked = { id: design.id, params: { ...design.params, effects: { ...effects, textOpacity: 0 } } };
    const style = (await StyleGenerator.generateNodeStyle(stored, masked, this.#themeId())) as Record<string, unknown>;
    const face = style[FACE_PROPERTY];
    return typeof face === 'string' ? face : null;
  }

  #emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}
