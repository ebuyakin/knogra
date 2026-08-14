/**
 * Update — id resolution
 *
 * Every document entry names something in the graph, and what it names is
 * decided **only by id** — never by title, which fails silently on a rename and
 * is ambiguous when titles repeat (markdown-architecture §6.1).
 *
 * Pure: no store access, no DOM.
 */

import type { ChatMessage } from '../../../core/chat-types';
import type { Node, NodeId } from '../../../core/main-types';

/** Which id the match was made on. Reported so the preview can say so. */
export type MatchVia = 'id' | 'externalId';

export interface NodeMatch {
  nodeId: NodeId;
  via: MatchVia;
}

export interface NodeIndex {
  byRealId: Map<string, NodeId>;
  byExternalId: Map<string, NodeId>;
}

/**
 * Duplicate `externalId`s are possible — a graph built twice from the same
 * document, then merged by hand — so the first node wins. Deterministic beats
 * letting store order decide which one prose lands on.
 */
export function buildNodeIndex(nodes: Node[]): NodeIndex {
  const byRealId = new Map<string, NodeId>();
  const byExternalId = new Map<string, NodeId>();

  for (const node of nodes) {
    byRealId.set(node.id, node.id);

    const externalId = node.properties?.externalId;
    if (typeof externalId === 'string' && externalId.length > 0 && !byExternalId.has(externalId)) {
      byExternalId.set(externalId, node.id);
    }
  }

  return { byRealId, byExternalId };
}

/** Real `NodeId` first, then `externalId`. No match is a skip, never a create. */
export function resolveNode(index: NodeIndex, documentId: string): NodeMatch | null {
  const realMatch = index.byRealId.get(documentId);
  if (realMatch) return { nodeId: realMatch, via: 'id' };

  const externalMatch = index.byExternalId.get(documentId);
  if (externalMatch) return { nodeId: externalMatch, via: 'externalId' };

  return null;
}

export interface MessageIndex {
  byRealId: Map<string, ChatMessage>;
  byExternalId: Map<string, ChatMessage>;
}

/**
 * Built per node: a note id resolves within the node that names it, so `intro`
 * under two nodes is two different messages (§6.2).
 *
 * Not filtered by kind. A message keeps its `source` when replaced (§5.4), so
 * moving an entry between the notes and articles sections rewrites the content
 * of the message it names rather than creating a second copy.
 */
export function buildMessageIndex(messages: ChatMessage[]): MessageIndex {
  const byRealId = new Map<string, ChatMessage>();
  const byExternalId = new Map<string, ChatMessage>();

  for (const message of messages) {
    byRealId.set(message.id, message);
    if (message.externalId && !byExternalId.has(message.externalId)) {
      byExternalId.set(message.externalId, message);
    }
  }

  return { byRealId, byExternalId };
}

/** Real `MessageId` first, then the author-chosen `externalId` label. */
export function resolveMessage(index: MessageIndex, noteId: string): ChatMessage | null {
  return index.byRealId.get(noteId) ?? index.byExternalId.get(noteId) ?? null;
}
