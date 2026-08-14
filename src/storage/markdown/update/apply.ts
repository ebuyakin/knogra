/**
 * Update — applying a plan
 *
 * Writes an approved `UpdatePlan` through the stores, then reloads. Nothing is
 * mirrored into live Cytoscape: the reload is what makes the new content
 * visible, and it is also the only end state in which suspending GraphSaver
 * forever is safe (markdown-architecture §5.7).
 *
 * The only module in `update/` that performs IO.
 */

import type { ChatMessage, Conversation, MessageSource } from '../../../core/chat-types';
import type { Node, NodeId } from '../../../core/main-types';
import { chatStore, generateMessageId } from '../../chat-store';
import { graphStore } from '../../graph-store';
import { graphSaver } from '../../graph-saver';
import type { ProseAddition, ProseSectionPlan, ProseReplacement, UpdatePlan } from './plan';

export interface UpdateSectionSelection {
  equations: boolean;
  comments: boolean;
  tags: boolean;
  notes: boolean;
  articles: boolean;
}

/**
 * **Suspends GraphSaver and never resumes it.** A save queued before this ran
 * is debounced by 500 ms and would otherwise fire between the store write and
 * the reload, overwriting every node in the open scene from stale `cy` data.
 * `suspend()` clears that pending timeout as well as blocking new ones.
 *
 * **No app state is touched** — unlike Build, which creates a new graph and so
 * clears app state, picks a scene and requests a fit. Update leaves the user on
 * the scene they were on, with their viewport and fold state intact.
 */
export async function applyUpdate(plan: UpdatePlan, sections: UpdateSectionSelection): Promise<void> {
  graphSaver.suspend('markdown:update');

  await applyNodeFields(plan, sections);
  await applyProse(plan, sections);

  window.location.reload();
}

// ============================================================================
// NODE FIELDS
// ============================================================================

interface NodePatch {
  equation?: string;
  comment?: string;
  tags?: string[];
}

/**
 * Batched per node, because equations, comments and tags routinely name the
 * same node and each `updateNode` is a full record write.
 */
async function applyNodeFields(plan: UpdatePlan, sections: UpdateSectionSelection): Promise<void> {
  const patches = new Map<NodeId, NodePatch>();
  const patchFor = (nodeId: NodeId): NodePatch => {
    const existing = patches.get(nodeId);
    if (existing) return existing;
    const created: NodePatch = {};
    patches.set(nodeId, created);
    return created;
  };

  if (sections.equations) {
    for (const change of plan.equations.changes) patchFor(change.nodeId).equation = change.value;
  }
  if (sections.comments) {
    for (const change of plan.comments.changes) patchFor(change.nodeId).comment = change.value;
  }
  if (sections.tags) {
    for (const change of plan.tags.changes) patchFor(change.nodeId).tags = change.value;
  }

  const nodeById = new Map<NodeId, Node>(graphStore.nodes.map(node => [node.id, node]));

  for (const [nodeId, patch] of patches) {
    const node = nodeById.get(nodeId);
    if (!node) continue;

    // Spread the existing bag rather than rebuilding it: `externalId` and every
    // other property the document knows nothing about must survive (§6.3).
    await graphStore.updateNode({
      ...node,
      tags: patch.tags ?? node.tags,
      properties: {
        ...node.properties,
        ...(patch.equation !== undefined ? { equation: patch.equation } : {}),
        ...(patch.comment !== undefined ? { comment: patch.comment } : {})
      },
      updatedAt: new Date()
    });
  }
}

// ============================================================================
// PROSE
// ============================================================================

interface ProseWrite {
  replacements: ProseReplacement[];
  additions: Array<{ addition: ProseAddition; source: MessageSource }>;
}

/**
 * One conversation write per node, covering both prose sections: notes and
 * articles live in the same ordered message list, so writing them separately
 * would read a stale conversation for the second one.
 */
async function applyProse(plan: UpdatePlan, sections: UpdateSectionSelection): Promise<void> {
  const writes = new Map<NodeId, ProseWrite>();
  const writeFor = (nodeId: NodeId): ProseWrite => {
    const existing = writes.get(nodeId);
    if (existing) return existing;
    const created: ProseWrite = { replacements: [], additions: [] };
    writes.set(nodeId, created);
    return created;
  };

  const collect = (section: ProseSectionPlan, source: MessageSource): void => {
    for (const replacement of section.replaced) writeFor(replacement.nodeId).replacements.push(replacement);
    for (const addition of section.added) writeFor(addition.nodeId).additions.push({ addition, source });
  };

  if (sections.notes) collect(plan.notes, 'note');
  if (sections.articles) collect(plan.articles, 'tutorial');

  for (const [nodeId, write] of writes) {
    const now = new Date();
    const conversation: Conversation = (await chatStore.getConversation(nodeId)) ?? {
      nodeId,
      messages: [],
      createdAt: now,
      updatedAt: now
    };

    for (const replacement of write.replacements) {
      const message = conversation.messages.find(candidate => candidate.id === replacement.messageId);
      // Absent only if the conversation changed after the plan was computed.
      if (!message) continue;
      message.content = replacement.content;
    }

    for (const { addition, source } of write.additions) {
      conversation.messages.push(createMessage(addition, source));
    }

    conversation.updatedAt = now;
    await chatStore.saveConversation(conversation);
  }
}

/**
 * `role` decides rendering and `source` decides permissions (§4.4), so both are
 * set from the section the entry came from: an article must be `assistant` to
 * render its markdown, a note must be `user` to stay editable.
 */
function createMessage(addition: ProseAddition, source: MessageSource): ChatMessage {
  return {
    id: generateMessageId(),
    role: source === 'note' ? 'user' : 'assistant',
    content: addition.content,
    timestamp: new Date(),
    source,
    // The document's own note id, so a re-run replaces this message instead of
    // appending a second copy.
    externalId: addition.noteId
  };
}
