/**
 * Image Viewer
 * In-page floating image panels: draggable, resizable, non-modal, and multiple
 * at once. Being part of the page (not an OS `window.open`), they always stay
 * on the same monitor/Space as Knogra and never hide behind the main window.
 * Uses the full-resolution source when available, else the stored bytes.
 */

import type { ChatImageAttachment } from '../../../core/chat-types';

const TITLEBAR_H = 30;
const ZOOM_STEP = 1.2;
const MIN_BODY = 80;
let topZ = 11000;
let cascade = 0;

/** Open an image attachment in a draggable/resizable in-page viewer panel. */
export function openImageViewer(attachment: ChatImageAttachment): void {
  const src = attachment.fullUrl ?? attachment.dataUrl ?? attachment.sourceUrl;
  if (!src) return;

  const panel = document.createElement('div');
  panel.className = 'image-viewer';

  // Initial size from the (thumbnail) aspect ratio, capped to the viewport.
  const aspect = attachment.width && attachment.height
    ? attachment.width / attachment.height
    : 4 / 3;
  const maxW = Math.round(window.innerWidth * 0.8);
  const maxH = Math.round(window.innerHeight * 0.8);
  let w = Math.min(520, maxW);
  let h = Math.round(w / aspect);
  if (h + TITLEBAR_H > maxH) { h = maxH - TITLEBAR_H; w = Math.round(h * aspect); }

  const offset = (cascade % 6) * 28;
  cascade++;
  panel.style.width = `${w}px`;
  panel.style.height = `${h + TITLEBAR_H}px`;
  panel.style.left = `${40 + offset}px`;
  panel.style.top = `${40 + offset}px`;
  panel.style.zIndex = String(++topZ);

  // Raise to front on any interaction.
  panel.addEventListener('pointerdown', () => { panel.style.zIndex = String(++topZ); });

  const bar = document.createElement('div');
  bar.className = 'image-viewer-bar';

  const title = document.createElement('span');
  title.className = 'image-viewer-title';
  title.textContent = attachment.name || 'Image';

  // Zoom scales the panel (image fits it via object-fit: contain), preserving
  // aspect ratio. An optional client-space anchor keeps that point fixed so the
  // cursor stays over the same spot across repeated zoom clicks.
  const zoom = (factor: number, anchor?: { x: number; y: number }): void => {
    const rect = panel.getBoundingClientRect();
    const bodyH = panel.offsetHeight - TITLEBAR_H;
    if (bodyH <= 0) return;
    const aspectNow = panel.offsetWidth / bodyH;
    let newBodyH = bodyH * factor;
    if (newBodyH < MIN_BODY) newBodyH = MIN_BODY;
    const newW = Math.round(newBodyH * aspectNow);
    newBodyH = Math.round(newBodyH);

    if (anchor) {
      const dx = anchor.x - rect.left;
      const dy = anchor.y - (rect.top + TITLEBAR_H);
      const left = Math.round(anchor.x - dx * (newW / rect.width));
      const top = Math.round(anchor.y - TITLEBAR_H - dy * (newBodyH / bodyH));
      // Never let the title bar (top-left corner) escape the screen, or it
      // becomes undraggable.
      panel.style.left = `${Math.max(0, left)}px`;
      panel.style.top = `${Math.max(0, top)}px`;
    }
    panel.style.width = `${newW}px`;
    panel.style.height = `${newBodyH + TITLEBAR_H}px`;
  };

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.type = 'button';
  zoomOutBtn.className = 'image-viewer-zoom';
  zoomOutBtn.setAttribute('aria-label', 'Zoom out');
  zoomOutBtn.textContent = '−';
  zoomOutBtn.addEventListener('click', () => zoom(1 / ZOOM_STEP));

  const zoomInBtn = document.createElement('button');
  zoomInBtn.type = 'button';
  zoomInBtn.className = 'image-viewer-zoom';
  zoomInBtn.setAttribute('aria-label', 'Zoom in');
  zoomInBtn.textContent = '+';
  zoomInBtn.addEventListener('click', () => zoom(ZOOM_STEP));

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'image-viewer-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => panel.remove());

  bar.append(title, zoomOutBtn, zoomInBtn, closeBtn);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'image-viewer-body';
  const img = document.createElement('img');
  img.src = src;
  img.alt = attachment.name;
  bodyEl.appendChild(img);

  // Click the image to zoom in (shift-click to zoom out), anchored at the
  // cursor so repeated clicks work without moving the pointer.
  bodyEl.addEventListener('click', (e) => {
    zoom(e.shiftKey ? 1 / ZOOM_STEP : ZOOM_STEP, { x: e.clientX, y: e.clientY });
  });
  bodyEl.addEventListener('mousemove', (e) => {
    bodyEl.classList.toggle('zoom-out', e.shiftKey);
  });

  // Snug the panel to the image's natural size once known (scaled down only if
  // larger than the viewport), so small images don't float in a big panel.
  img.addEventListener('load', () => {
    const nW = img.naturalWidth;
    const nH = img.naturalHeight;
    if (!nW || !nH) return;
    const scale = Math.min(1, (window.innerWidth * 0.85) / nW, (window.innerHeight * 0.85 - TITLEBAR_H) / nH);
    panel.style.width = `${Math.round(nW * scale)}px`;
    panel.style.height = `${Math.round(nH * scale) + TITLEBAR_H}px`;
  });

  panel.append(bar, bodyEl);
  document.body.appendChild(panel);

  makeDraggable(panel, bar);
}

/** Drag the panel by its title bar (pointer capture for reliable tracking). */
function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  handle.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return; // don't drag from the bar buttons
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    panel.style.left = `${origLeft + (e.clientX - startX)}px`;
    panel.style.top = `${origTop + (e.clientY - startY)}px`;
  });

  const end = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}
