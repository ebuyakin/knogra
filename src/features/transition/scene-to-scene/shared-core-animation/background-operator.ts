/**
 * BackgroundOperator
 *
 * Layer 3 operator for background transitions during shared scene movement.
 * Handles fade out, fade in, crossfade, and viewport background rendering.
 */

import type { Core } from 'cytoscape';
import type { Scene } from '../../../../core/main-types';
import type { BackgroundRenderer } from '../../../../background/background-renderer';
import type { SharedTimings, MorphTimings } from '../../../../config/transition-settings';

import { getSetting } from '../../../../config';
import { isDebug } from '../../../../config/debug-flags';

type TimingKey = keyof SharedTimings | keyof MorphTimings;

export class BackgroundOperator {
  #cy: Core;
  #backgroundRenderer: BackgroundRenderer;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.#cy = cy;
    this.#backgroundRenderer = backgroundRenderer;
  }

  // ==========================================================================
  // BACKGROUND OPERATIONS
  // ==========================================================================

  /**
   * Stage 2.1: Fade out background
   */
  async fadeOutBackground(): Promise<void> {
    const { duration, delay } = this.#getTiming('sharedBgFadeOut');
    if (isDebug('d_background')) console.log(`[Background] fadeOutBackground: duration=${duration}ms, delay=${delay}ms`);
    
    const canvas = this.#getBackgroundCanvas();
    if (canvas) {
      await this.#animateCanvasOpacity(canvas, 0, duration);
    }
    
    await this.#delay(delay);
    if (isDebug('d_background')) console.log('[Background] fadeOutBackground: complete');
  }

  /**
   * Load background images for a scene
   */
  async loadBackground(scene: Scene): Promise<void> {
    if (isDebug('d_background')) console.log(`[Background] loadBackground: scene ${scene.id}, images=${scene.backgroundImages?.length ?? 0}`);
    if (scene.backgroundImages && scene.backgroundImages.length > 0) {
      await this.#backgroundRenderer.render(scene.backgroundImages);
      const zoom = this.#cy.zoom();
      const pan = this.#cy.pan();
      this.#backgroundRenderer.redraw(zoom, pan);
    } else {
      this.#backgroundRenderer.clear();
    }
    if (isDebug('d_background')) console.log('[Background] loadBackground: complete');
  }

  /**
   * Stage 2.4: Fade in background
   */
  async fadeInBackground(): Promise<void> {
    const { duration, delay } = this.#getTiming('sharedBgFadeIn');
    if (isDebug('d_background')) console.log(`[Background] fadeInBackground: duration=${duration}ms, delay=${delay}ms`);
    
    const canvas = this.#getBackgroundCanvas();
    if (canvas) {
      await this.#animateCanvasOpacity(canvas, 1, duration);
    }
    
    await this.#delay(delay);
    if (isDebug('d_background')) console.log('[Background] fadeInBackground: complete');
  }

  /**
   * Clear background (no animation)
   */
  clearBackground(): void {
    this.#backgroundRenderer.clear();
  }

  /**
   * Prepare background crossfade: create transition canvas, load images, draw.
   * Uses two canvases for smooth transition.
   * Timing: Synchronized with the parallel morph.
   * 
   * @param targetScene - The scene to transition to
   * @param totalDuration - Total duration for the crossfade
   */
  async crossfadeBackground(targetScene: Scene, totalDuration: number): Promise<void> {
    if (isDebug('d_background')) console.log(`[Background] crossfadeBackground: duration=${totalDuration}ms`);

    const mainCanvas = this.#backgroundRenderer.getMainCanvas();
    const hasOldBackground = mainCanvas && parseFloat(mainCanvas.style.opacity || '1') > 0;
    const hasNewBackground = targetScene.backgroundImages && targetScene.backgroundImages.length > 0;

    // Edge case: no backgrounds at all
    if (!hasOldBackground && !hasNewBackground) {
      if (isDebug('d_background')) console.log('[Background] crossfadeBackground: no backgrounds, skipping');
      return;
    }

    // Edge case: only new background (no old to fade out)
    if (!hasOldBackground && hasNewBackground) {
      if (isDebug('d_background')) console.log('[Background] crossfadeBackground: only fade in new');
      await this.#backgroundRenderer.render(targetScene.backgroundImages!);
      const zoom = this.#cy.zoom();
      const pan = this.#cy.pan();
      this.#backgroundRenderer.redraw(zoom, pan);
      await this.#animateCanvasOpacity(mainCanvas!, 1, totalDuration);
      return;
    }

    // Edge case: only old background (no new to fade in)
    if (hasOldBackground && !hasNewBackground) {
      if (isDebug('d_background')) console.log('[Background] crossfadeBackground: only fade out old');
      await this.#animateCanvasOpacity(mainCanvas!, 0, totalDuration);
      this.#backgroundRenderer.clear();
      return;
    }

    // Normal case: crossfade from old to new
    const transitionCanvas = this.#backgroundRenderer.prepareTransition();
    await this.#backgroundRenderer.renderToTransition(targetScene.backgroundImages!);

    const zoom = this.#cy.zoom();
    const pan = this.#cy.pan();
    this.#backgroundRenderer.redraw(zoom, pan);

    if (isDebug('d_background')) console.log('[Background] crossfadeBackground: executing crossfade');
    await Promise.all([
      this.#animateCanvasOpacity(mainCanvas!, 0, totalDuration),
      this.#animateCanvasOpacity(transitionCanvas, 1, totalDuration)
    ]);

    // Commit: transition canvas becomes main
    this.#backgroundRenderer.commitTransition();
    
    if (isDebug('d_background')) console.log('[Background] crossfadeBackground: complete');
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  #getBackgroundCanvas(): HTMLCanvasElement | null {
    return this.#backgroundRenderer.getMainCanvas();
  }

  /**
   * Immediately set canvas opacity (no animation).
   * Used to keep canvas hidden after loadBackground in sequential mode.
   */
  setCanvasOpacity(opacity: number): void {
    const canvas = this.#getBackgroundCanvas();
    if (canvas) {
      canvas.style.opacity = opacity.toFixed(3);
    }
  }

  async #animateCanvasOpacity(
    canvas: HTMLCanvasElement, 
    targetOpacity: number, 
    duration: number
  ): Promise<void> {
    // Clear any CSS transition left by openScene (prevents conflict with rAF loop)
    canvas.style.transition = '';
    const startOpacity = parseFloat(canvas.style.opacity || '1');
    const startTime = performance.now();
    
    return new Promise(resolve => {
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Linear easing
        const currentOpacity = startOpacity + (targetOpacity - startOpacity) * progress;
        
        canvas.style.opacity = currentOpacity.toFixed(3);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      
      requestAnimationFrame(animate);
    });
  }

  #getTiming(settingKey: TimingKey): { duration: number, delay: number } {
    const setting = getSetting(`transition.${settingKey}`) as [number, number];
    return {
      duration: setting[0],
      delay: setting[1]
    };
  }

  async #delay(ms: number): Promise<void> {
    if (ms <= 0) return;
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
