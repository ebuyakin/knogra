/**
 * Chat Types
 * Persistent data shapes for AI conversations.
 * Lives in core so storage/ can reference them without importing from ai/.
 */

import type { NodeId } from './main-types';

/** Unique identifier for a chat message */
export type MessageId = string;

/** Origin of a chat message */
export type MessageSource = 'ai' | 'note' | 'tutorial';

/** Individual message in a conversation */
export interface ChatMessage {
  id: MessageId;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  source?: MessageSource;
}

/** Full conversation associated with a node */
export interface Conversation {
  nodeId: NodeId;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}
