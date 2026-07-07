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

/** Where an image attachment came from */
export type AttachmentOrigin = 'note' | 'retrieved';

/** Source/license credit for a retrieved image */
export interface ImageAttribution {
  author?: string;
  license?: string;
  licenseUrl?: string;
  sourceName: string;
  sourcePageUrl?: string;
  attributionRequired?: boolean;
}

/**
 * Image attached to a chat message.
 * Note images are user-uploaded and stored inline as a base64 data URL.
 * Retrieved images carry a `sourceUrl` and optionally stored `dataUrl` bytes.
 * Local-only: attachments are never included in AI requests.
 */
export interface ChatImageAttachment {
  id: string;
  type: 'image';
  origin: AttachmentOrigin;
  mimeType: NoteImageMimeType;
  name: string;
  width: number;
  height: number;
  /** Downscaled bytes when stored locally; absent in link-only mode */
  dataUrl?: string;
  /** Remote source URL (retrieved images) */
  sourceUrl?: string;
  /** Full-resolution original URL for the lightbox (retrieved images) */
  fullUrl?: string;
  /** Credit metadata (retrieved images) */
  attribution?: ImageAttribution;
}

/** Individual message in a conversation */
export interface ChatMessage {
  id: MessageId;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  source?: MessageSource;
  /** Image attachments (note uploads or retrieved images) */
  attachments?: ChatImageAttachment[];
}

/** Full conversation associated with a node */
export interface Conversation {
  nodeId: NodeId;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}
