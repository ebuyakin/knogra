/**
 * Path Modal Shell
 *
 * Presentation scaffolding shared by the path manager's surfaces: overlay/modal
 * construction, scene labelling, and HTML escaping.
 *
 * These helpers were file-local to `path-picker.ts`, which meant they had no
 * owner once that file was split. Giving them a module keeps the list and the
 * sequence editor visually identical without either one owning the other.
 */

import type { SceneId } from '../../../core/main-types';
import { graphStore } from '../../../storage/graph-store';

export interface ModalParts {
  overlay: HTMLDivElement;
  modal: HTMLDivElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Display label for a scene — the central node's title, falling back to the
 * scene title. `Unknown scene` covers ids that outlived their scene.
 */
export function sceneLabel(sceneId: SceneId): string {
  const scene = graphStore.scenes.find(s => s.id === sceneId);
  if (!scene) return 'Unknown scene';
  const node = graphStore.nodes.find(n => n.id === scene.centralNodeId);
  return node?.title || scene.title || 'Unknown';
}

/**
 * Build an overlay anchored to the Cytoscape container rather than the viewport,
 * so the chat panel and other chrome stay visible and usable behind it.
 * Falls back to full viewport when `#cy` is absent.
 */
export function buildOverlay(title: string): ModalParts {
  const overlay = document.createElement('div');
  overlay.className = 'path-picker-overlay';

  const cyContainer = document.getElementById('cy');
  if (cyContainer) {
    const rect = cyContainer.getBoundingClientRect();
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  const modal = document.createElement('div');
  modal.className = 'path-picker-modal';

  const header = document.createElement('div');
  header.className = 'path-picker-header';
  header.innerHTML = `<h2>${escapeHtml(title)}</h2>`;

  const body = document.createElement('div');
  body.className = 'path-picker-body';

  const footer = document.createElement('div');
  footer.className = 'path-picker-footer';

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);

  return { overlay, modal, body, footer };
}

export function renderEmpty(host: HTMLElement, message: string): void {
  host.innerHTML = `<p class="path-picker-empty">${escapeHtml(message)}</p>`;
}

/**
 * Dismissable overlay lifecycle: backdrop click and Escape both close.
 * Returns a teardown function that also detaches the key listener.
 */
export function attachDismiss(overlay: HTMLDivElement, close: () => void): () => void {
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    close();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKeydown);

  return () => document.removeEventListener('keydown', onKeydown);
}
