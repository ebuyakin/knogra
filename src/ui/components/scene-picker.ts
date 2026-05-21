/**
 * Scene Picker Modal
 * Allows user to select a scene to load from available scenes
 */

import { graphStore } from '../../storage/graph-store';
import type { SceneId } from '../../core/main-types';
import '../../styles/scene-picker.css';

export class ScenePicker {
  #overlay: HTMLDivElement | null = null;
  #modal: HTMLDivElement | null = null;
  #isOpen: boolean = false;
  #onSelect: ((sceneId: SceneId) => void) | null = null;

  /**
   * Open the scene picker modal
   * @param onSelect - Callback when user selects a scene
   */
  open(onSelect: (sceneId: SceneId) => void): void {
    if (this.#isOpen) return;
    this.#isOpen = true;
    this.#onSelect = onSelect;
    this.#render();
  }

  /**
   * Close the modal
   */
  close(): void {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#cleanup();
  }

  /**
   * Check if modal is open
   */
  isOpen(): boolean {
    return this.#isOpen;
  }

  #render(): void {
    const scenes = graphStore.scenes;

    // Create overlay
    this.#overlay = document.createElement('div');
    this.#overlay.className = 'scene-picker-overlay';

    // Create modal
    this.#modal = document.createElement('div');
    this.#modal.className = 'scene-picker-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'scene-picker-header';
    header.innerHTML = `<h2>Select Scene</h2>`;

    // Scene list
    const list = document.createElement('div');
    list.className = 'scene-picker-list';

    if (scenes.length === 0) {
      list.innerHTML = `<p class="scene-picker-empty">No scenes available</p>`;
    } else {
      for (const scene of scenes) {
        const item = document.createElement('div');
        item.className = 'scene-picker-item';
        
        // Get central node title for display
        const centralNode = graphStore.nodes.find(n => n.id === scene.centralNodeId);
        const title = centralNode?.title || scene.centralNodeId;
        
        item.innerHTML = `
          <span class="scene-picker-item-title">${title}</span>
          <span class="scene-picker-item-id">${scene.id}</span>
        `;
        
        item.addEventListener('click', () => {
          this.#selectScene(scene.id);
        });
        
        list.appendChild(item);
      }
    }

    // Assemble modal
    this.#modal.appendChild(header);
    this.#modal.appendChild(list);
    this.#overlay.appendChild(this.#modal);

    // Add to DOM
    document.body.appendChild(this.#overlay);

    // Keyboard handler
    document.addEventListener('keydown', this.#handleKeydown);
  }

  #selectScene(sceneId: SceneId): void {
    if (this.#onSelect) {
      this.#onSelect(sceneId);
    }
    this.close();
  }

  #handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      // Don't close on Escape if this is the startup picker (no scene loaded)
      // Only close if there's already a scene loaded
      e.preventDefault();
    }
  };

  #cleanup(): void {
    document.removeEventListener('keydown', this.#handleKeydown);
    this.#overlay?.remove();
    this.#overlay = null;
    this.#modal = null;
    this.#onSelect = null;
  }
}

// Singleton instance
export const scenePicker = new ScenePicker();
