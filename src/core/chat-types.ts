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

/** MIME types accepted for note image attachments */
export type NoteImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

/**
 * Image attached to a note. Stored inline as a base64 data URL.
 * Local-only: attachments are never included in AI requests.
 */
export interface NoteImageAttachment {
  id: string;
  type: 'image';
  mimeType: NoteImageMimeType;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

/** Individual message in a conversation */
export interface ChatMessage {
  id: MessageId;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  source?: MessageSource;
  /** Note image attachments (notes only in current version) */
  attachments?: NoteImageAttachment[];
}

/** Full conversation associated with a node */
export interface Conversation {
  nodeId: NodeId;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}
