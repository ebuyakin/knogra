/**
 * Update — planning
 *
 * Computes what an Update *would* do, given a parsed document and a snapshot of
 * the graph. Writes nothing: the dialog renders this, and only an approved plan
 * reaches the applier.
 *
 * Every section is planned, always. Which sections the user applies is a
 * dialog concern, so ticking a checkbox re-renders counts that are already in
 * memory rather than re-planning (markdown-architecture §5.6).
 *
 * Pure: no store access, no DOM.
 */

import type { Conversation, MessageId } from '../../../core/chat-types';
import type { Node, NodeId } from '../../../core/main-types';
import type { DocumentNote, KnograDocument } from '../document/document';
import {
  buildMessageIndex,
  buildNodeIndex,
  resolveMessage,
  resolveNode,
  type MessageIndex,
  type NodeIndex,
  type NodeMatch
} from './identity';

export type SkipReason = 'unknown-node' | 'missing-note-id';

export interface SkippedEntry {
  /** The id as written in the document. */
  documentId: string;
  reason: SkipReason;
}

export interface FieldChange<TValue> {
  documentId: string;
  nodeId: NodeId;
  value: TValue;
}

export interface FieldSectionPlan<TValue> {
  changes: Array<FieldChange<TValue>>;
  /** Entries whose value the node already carries. Nothing to write. */
  unchanged: number;
  skipped: SkippedEntry[];
}

export interface ProseReplacement {
  documentId: string;
  nodeId: NodeId;
  messageId: MessageId;
  content: string;
}

export interface ProseAddition {
  documentId: string;
  nodeId: NodeId;
  /** Stored as the new message's `externalId`, so a re-run replaces it. */
  noteId: string;
  content: string;
}

export interface ProseSectionPlan {
  replaced: ProseReplacement[];
  added: ProseAddition[];
  unchanged: number;
  skipped: SkippedEntry[];
}

/**
 * Node matching across the whole plan. Counted over the ids the **content
 * sections** name, not the diagram — Update ignores the diagram entirely (§5.2).
 */
export interface NodeMatchSummary {
  total: number;
  matchedByRealId: number;
  matchedByExternalId: number;
  unmatched: string[];
}

export interface UpdatePlan {
  nodes: NodeMatchSummary;
  equations: FieldSectionPlan<string>;
  comments: FieldSectionPlan<string>;
  tags: FieldSectionPlan<string[]>;
  notes: ProseSectionPlan;
  articles: ProseSectionPlan;
}

/** What planning needs from the graph. Read once, when the dialog opens. */
export interface UpdateGraphSnapshot {
  nodes: Node[];
  conversations: Conversation[];
}

export function planUpdate(document: KnograDocument, graph: UpdateGraphSnapshot): UpdatePlan {
  const resolver = createNodeResolver(buildNodeIndex(graph.nodes));
  const nodeById = new Map<NodeId, Node>(graph.nodes.map(node => [node.id, node]));
  const messageIndexes = createMessageIndexes(graph.conversations);

  const equations = planProperty(document.equationsByMermaidId, 'equation', resolver, nodeById);
  const comments = planProperty(document.commentsByMermaidId, 'comment', resolver, nodeById);
  const tags = planTags(document.tagsByMermaidId, resolver, nodeById);
  const notes = planProse(document.notes, resolver, messageIndexes);
  const articles = planProse(document.articles, resolver, messageIndexes);

  return { nodes: resolver.summarize(), equations, comments, tags, notes, articles };
}

// ============================================================================
// NODE FIELDS
// ============================================================================

/**
 * Equations and comments are one value per node, so an entry is either a
 * replacement or a no-op. Empty values never reach here — the parser drops
 * them, which is what implements "empty means skip, never clear" (§5.3).
 */
function planProperty(
  entries: Map<string, string>,
  key: 'equation' | 'comment',
  resolver: NodeResolver,
  nodeById: Map<NodeId, Node>
): FieldSectionPlan<string> {
  const plan = emptyFieldPlan<string>();

  for (const [documentId, value] of entries) {
    const match = resolver.resolve(documentId);
    if (!match) {
      plan.skipped.push({ documentId, reason: 'unknown-node' });
      continue;
    }

    const current = nodeById.get(match.nodeId)?.properties?.[key];
    if (current === value) {
      plan.unchanged += 1;
      continue;
    }

    plan.changes.push({ documentId, nodeId: match.nodeId, value });
  }

  return plan;
}

/**
 * Tags replace the whole set (§5.3). Compared as a set, so reordering the same
 * tags is not reported as a change the user has to think about.
 */
function planTags(
  entries: Map<string, string[]>,
  resolver: NodeResolver,
  nodeById: Map<NodeId, Node>
): FieldSectionPlan<string[]> {
  const plan = emptyFieldPlan<string[]>();

  for (const [documentId, values] of entries) {
    const match = resolver.resolve(documentId);
    if (!match) {
      plan.skipped.push({ documentId, reason: 'unknown-node' });
      continue;
    }

    if (isSameTagSet(nodeById.get(match.nodeId)?.tags ?? [], values)) {
      plan.unchanged += 1;
      continue;
    }

    plan.changes.push({ documentId, nodeId: match.nodeId, value: values });
  }

  return plan;
}

function isSameTagSet(current: string[], next: string[]): boolean {
  const currentSet = new Set(current);
  return currentSet.size === new Set(next).size && next.every(tag => currentSet.has(tag));
}

function emptyFieldPlan<TValue>(): FieldSectionPlan<TValue> {
  return { changes: [], unchanged: 0, skipped: [] };
}

// ============================================================================
// PROSE
// ============================================================================

/**
 * The note id decides add-vs-replace and nothing else does (§5.4). An entry
 * carrying no note id cannot be classified, so it is skipped and reported
 * rather than guessed at — guessing is what accumulates duplicate copies of the
 * same article.
 */
function planProse(
  entries: DocumentNote[],
  resolver: NodeResolver,
  messageIndexes: Map<NodeId, MessageIndex>
): ProseSectionPlan {
  const plan: ProseSectionPlan = { replaced: [], added: [], unchanged: 0, skipped: [] };

  for (const entry of entries) {
    const match = resolver.resolve(entry.nodeId);
    if (!match) {
      plan.skipped.push({ documentId: entry.nodeId, reason: 'unknown-node' });
      continue;
    }

    if (!entry.noteId) {
      plan.skipped.push({ documentId: entry.nodeId, reason: 'missing-note-id' });
      continue;
    }

    const index = messageIndexes.get(match.nodeId);
    const existing = index ? resolveMessage(index, entry.noteId) : null;

    if (!existing) {
      plan.added.push({
        documentId: entry.nodeId,
        nodeId: match.nodeId,
        noteId: entry.noteId,
        content: entry.content
      });
      continue;
    }

    if (existing.content === entry.content) {
      plan.unchanged += 1;
      continue;
    }

    plan.replaced.push({
      documentId: entry.nodeId,
      nodeId: match.nodeId,
      messageId: existing.id,
      content: entry.content
    });
  }

  return plan;
}

function createMessageIndexes(conversations: Conversation[]): Map<NodeId, MessageIndex> {
  const indexes = new Map<NodeId, MessageIndex>();
  for (const conversation of conversations) {
    indexes.set(conversation.nodeId, buildMessageIndex(conversation.messages));
  }
  return indexes;
}

// ============================================================================
// NODE RESOLUTION
// ============================================================================

interface NodeResolver {
  resolve(documentId: string): NodeMatch | null;
  summarize(): NodeMatchSummary;
}

/**
 * Memoized so the same document id named by four sections is one entry in the
 * summary, and so "matched 47 of 52 nodes" counts nodes rather than mentions.
 */
function createNodeResolver(index: NodeIndex): NodeResolver {
  const cache = new Map<string, NodeMatch | null>();

  return {
    resolve(documentId: string): NodeMatch | null {
      const cached = cache.get(documentId);
      if (cached !== undefined) return cached;

      const match = resolveNode(index, documentId);
      cache.set(documentId, match);
      return match;
    },

    summarize(): NodeMatchSummary {
      let matchedByRealId = 0;
      let matchedByExternalId = 0;
      const unmatched: string[] = [];

      for (const [documentId, match] of cache) {
        if (!match) unmatched.push(documentId);
        else if (match.via === 'id') matchedByRealId += 1;
        else matchedByExternalId += 1;
      }

      return { total: cache.size, matchedByRealId, matchedByExternalId, unmatched };
    }
  };
}
