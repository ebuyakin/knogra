/**
 * EventBus
 * Lightweight typed pub/sub for cross-module communication
 * 
 * Data flows unidirectionally: Graph System → AI System
 */

import type { AppMode, NodeId, SceneId } from '../core/main-types';

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * All events and their payloads
 */
export interface EventMap {
  sceneChanged: { sceneId: SceneId; centralNodeId: NodeId };
  transitionStart: void;
  transitionEnd: void;
  appModeChanged: { mode: AppMode };
  // Future events:
  // nodeSelected: { nodeId: NodeId };
}

export type EventName = keyof EventMap;
export type EventPayload<E extends EventName> = EventMap[E];
export type EventCallback<E extends EventName> = (payload: EventPayload<E>) => void;

// ============================================================================
// EVENT BUS
// ============================================================================

class EventBus {
  #listeners: Map<EventName, Set<EventCallback<any>>> = new Map();

  /**
   * Subscribe to an event
   */
  on<E extends EventName>(event: E, callback: EventCallback<E>): void {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from an event
   */
  off<E extends EventName>(event: E, callback: EventCallback<E>): void {
    this.#listeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event to all subscribers
   */
  emit<E extends EventName>(event: E, payload: EventPayload<E>): void {
    const callbacks = this.#listeners.get(event);
    if (!callbacks) return;

    for (const callback of callbacks) {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[EventBus] Error in ${event} handler:`, error);
      }
    }
  }

  /**
   * Remove all listeners (for testing/cleanup)
   */
  clear(): void {
    this.#listeners.clear();
  }
}

// Singleton instance
export const eventBus = new EventBus();
