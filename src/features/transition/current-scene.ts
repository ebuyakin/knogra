/**
 * Current scene
 *
 * Which scene the instance is showing: the id in `cy.scratch('currentSceneId')`,
 * which GraphSaver and the animators read, and the Scene object behind it,
 * which is the stored one or, during the map handoff (map-view.md §8), a
 * transient one the store does not hold. The only writer of the scratch;
 * owned by Transition (Layer 0).
 */

import type { Core } from 'cytoscape';
import type { Scene, SceneId } from '../../core/main-types';
import { graphStore } from '../../storage/graph-store';

export class CurrentScene {
  #cy: Core;
  /** A current scene the store does not hold; null whenever a stored scene is current. */
  #transient: Scene | null = null;

  constructor(cy: Core) {
    this.#cy = cy;
  }

  id(): SceneId | undefined {
    return (this.#cy.scratch('currentSceneId') as SceneId | undefined) ?? undefined;
  }

  /** The current scene, transient or stored; undefined when none is current or the stored one is gone. */
  get(): Scene | undefined {
    const currentSceneId = this.id();
    if (!currentSceneId) return undefined;
    if (this.#transient?.id === currentSceneId) return this.#transient;
    const scene = graphStore.scenes.find(s => s.id === currentSceneId);
    if (!scene) console.warn(`Current scene ${currentSceneId} not found`);
    return scene;
  }

  /** Make `scene` current; a scene the store does not hold is remembered as the transient one until a stored one is current. */
  set(scene: Scene): void {
    this.#cy.scratch('currentSceneId', scene.id);
    this.#transient = graphStore.scenes.some(s => s.id === scene.id) ? null : scene;
  }

  /** No scene is current: after a close. */
  clear(): void {
    this.#cy.scratch('currentSceneId', null);
    this.#transient = null;
  }
}
