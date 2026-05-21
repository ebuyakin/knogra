/**
 * Chat Store
 * IndexedDB storage for AI conversations (separate from graph database)
 */

import Dexie from 'dexie';
import type { NodeId } from '../core/main-types';
import type { Conversation, ChatMessage, MessageId, MessageSource } from '../core/chat-types';

const DB_NAME = 'knogra-chat';
const DB_VERSION = 1;

/**
 * Generate unique message ID
 */
function generateMessageId(): MessageId {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Chat data store
 * Manages conversation persistence in IndexedDB
 */
class ChatDataStore {
  #db: Dexie;

  constructor() {
    this.#db = new Dexie(DB_NAME);
    this.#db.version(DB_VERSION).stores({
      conversations: 'nodeId, updatedAt'
    });
  }

  /**
   * Get conversation for a node
   * Returns null if no conversation exists
   */
  async getConversation(nodeId: NodeId): Promise<Conversation | null> {
    const result = await this.#db.table('conversations').get(nodeId);
    return result ?? null;
  }

  /**
   * Save or update a conversation
   */
  async saveConversation(conversation: Conversation): Promise<void> {
    await this.#db.table('conversations').put(conversation);
  }

  /**
   * Delete conversation for a node
   */
  async deleteConversation(nodeId: NodeId): Promise<void> {
    await this.#db.table('conversations').delete(nodeId);
  }

  /**
   * Add a message to a conversation
   * Creates conversation if it doesn't exist
   */
  async addMessage(
    nodeId: NodeId,
    role: 'user' | 'assistant',
    content: string,
    source?: MessageSource
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: generateMessageId(),
      role,
      content,
      timestamp: new Date(),
      ...(source ? { source } : {})
    };

    let conversation = await this.getConversation(nodeId);
    
    if (conversation) {
      conversation.messages.push(message);
      conversation.updatedAt = new Date();
    } else {
      conversation = {
        nodeId,
        messages: [message],
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    await this.saveConversation(conversation);
    return message;
  }

  /**
   * Update a message's content (for editable notes)
   */
  async updateMessage(nodeId: NodeId, messageId: MessageId, newContent: string): Promise<void> {
    const conversation = await this.getConversation(nodeId);
    if (!conversation) return;

    const message = conversation.messages.find(m => m.id === messageId);
    if (!message) return;

    message.content = newContent;
    conversation.updatedAt = new Date();
    await this.saveConversation(conversation);
  }

  /**
   * Delete a message from a conversation
   */
  async deleteMessage(nodeId: NodeId, messageId: MessageId): Promise<void> {
    const conversation = await this.getConversation(nodeId);
    if (!conversation) return;

    conversation.messages = conversation.messages.filter(m => m.id !== messageId);
    conversation.updatedAt = new Date();
    await this.saveConversation(conversation);
  }

  /**
   * Delete messages by source type. Removes the conversation if no messages remain.
   */
  async deleteMessagesBySources(nodeId: NodeId, sources: Set<MessageSource | undefined>): Promise<void> {
    const conversation = await this.getConversation(nodeId);
    if (!conversation) return;

    conversation.messages = conversation.messages.filter(m => !sources.has(m.source));
    conversation.updatedAt = new Date();

    if (conversation.messages.length === 0) {
      await this.deleteConversation(nodeId);
    } else {
      await this.saveConversation(conversation);
    }
  }

  /**
   * Clear all chat history
   */
  async clearAll(): Promise<void> {
    await this.#db.table('conversations').clear();
  }

  /**
   * Get all node IDs that have conversations
   */
  async getNodesWithConversations(): Promise<NodeId[]> {
    const conversations = await this.#db.table('conversations').toArray();
    return conversations.map(c => c.nodeId);
  }
}

// Singleton instance
export const chatStore = new ChatDataStore();
