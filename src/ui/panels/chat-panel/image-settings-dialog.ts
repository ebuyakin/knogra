/**
 * Image settings dialog
 *
 * Configure, from the note editor's Generate menu: the generated-image settings
 * in one compact dialog (docs/ai/chat-image-generation.md §2.1). The rows are
 * the same setting definitions the Settings modal shows under Notes →
 * Generated Images, read from one list in setting-definitions.ts; here each
 * description is the label's tooltip rather than a line of text, so the dialog
 * fits without scrolling. Edits are staged and written on Save; Cancel, Escape
 * and a click outside discard them.
 *
 * Centred on the Cytoscape area and draggable by its header, like the app's
 * other modals, and in the node editor's colours: its frame, input and button
 * classes are reused. Panel-owned, like image-lightbox.ts; the Settings
 * modal's own code is not involved.
 */

import type { SettingDefinition } from '../../../config/setting-definitions';
import { generatedImageSettings } from '../../../config/setting-definitions';
import { getSetting, setSetting, type SettingKey } from '../../../config';
import '../../../styles/node-editor.css';

const EDGE_MARGIN_PX = 20;

export interface ImageSettingsDialogOptions {
  /** Called once the dialog is gone, saved or not. */
  onClose?: () => void;
  /** Offered as a third button when present: save the staged values, close, then run. */
  onSaveAndRun?: () => void;
}

export function openImageSettingsDialog(options: ImageSettingsDialogOptions = {}): void {
  const staged = new Map<SettingKey, unknown>();

  const overlay = document.createElement('div');
  overlay.className = 'image-settings-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'image-settings-dialog';

  const header = document.createElement('div');
  header.className = 'image-settings-titlebar';
  header.textContent = 'Generated images';

  const body = document.createElement('div');
  body.className = 'image-settings-body';
  for (const setting of generatedImageSettings()) {
    body.appendChild(renderRow(setting, staged));
  }

  const footer = document.createElement('div');
  footer.className = 'image-settings-footer';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'node-editor-btn node-editor-btn-neutral';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'node-editor-btn node-editor-btn-neutral';
  saveBtn.textContent = 'Save';
  footer.append(cancelBtn, saveBtn);

  const close = (): void => {
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
    options.onClose?.();
  };
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
  };
  const save = (): void => {
    for (const [key, value] of staged) setSetting(key, value);
  };

  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', () => {
    save();
    close();
  });

  const onSaveAndRun = options.onSaveAndRun;
  if (onSaveAndRun) {
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'node-editor-btn node-editor-btn-neutral';
    runBtn.textContent = 'Save and Run';
    runBtn.addEventListener('click', () => {
      save();
      close();
      onSaveAndRun();
    });
    footer.appendChild(runBtn);
  }
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeydown, true);

  dialog.append(header, body, footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  centreOnCanvas(dialog);
  setupDrag(header, dialog);
}

// ============================================================================
// ROWS
// ============================================================================

/** A textarea stacks under its label; a checkbox gets air around it. Others sit beside their label. */
const ROW_MODIFIER: Partial<Record<SettingDefinition['type'], string>> = {
  textarea: 'image-settings-row--stacked',
  boolean: 'image-settings-row--checkbox'
};

function renderRow(setting: SettingDefinition, staged: Map<SettingKey, unknown>): HTMLElement {
  const row = document.createElement('div');
  row.className = `image-settings-row ${ROW_MODIFIER[setting.type] ?? ''}`.trim();
  // The description is the tooltip: the dialog has to fit the screen, and the
  // Settings modal still shows the same text in full.
  row.title = setting.description;

  const label = document.createElement('label');
  label.className = 'image-settings-label';
  label.textContent = setting.label;

  row.append(label, renderInput(setting, staged));
  return row;
}

/** The four input types the generated-image settings use; others are not expected here. */
function renderInput(setting: SettingDefinition, staged: Map<SettingKey, unknown>): HTMLElement {
  const current = getSetting(setting.key);

  if (setting.type === 'boolean') {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'image-settings-checkbox';
    checkbox.checked = Boolean(current);
    checkbox.addEventListener('change', () => staged.set(setting.key, checkbox.checked));
    return checkbox;
  }

  if (setting.type === 'select') {
    const select = document.createElement('select');
    select.className = 'node-editor-select';
    for (const option of setting.options ?? []) {
      const el = document.createElement('option');
      el.value = String(option.value);
      el.textContent = option.label;
      el.selected = option.value === current;
      select.appendChild(el);
    }
    select.addEventListener('change', () => staged.set(setting.key, select.value));
    return select;
  }

  if (setting.type === 'textarea') {
    const textarea = document.createElement('textarea');
    textarea.className = 'node-editor-textarea image-settings-textarea';
    textarea.rows = 7;
    textarea.value = String(current);
    textarea.addEventListener('change', () => staged.set(setting.key, textarea.value));
    return textarea;
  }

  const text = document.createElement('input');
  text.type = 'text';
  text.className = 'node-editor-input';
  text.value = String(current);
  text.addEventListener('change', () => staged.set(setting.key, text.value));
  return text;
}

// ============================================================================
// PLACEMENT
// ============================================================================

/** Centre on the Cytoscape viewport, as the app's other modals do, so the chat panel stays visible beside it. */
function centreOnCanvas(dialog: HTMLElement): void {
  const canvasRect = document.getElementById('cy')?.getBoundingClientRect();
  const dialogRect = dialog.getBoundingClientRect();
  const areaLeft = canvasRect?.left ?? 0;
  const areaTop = canvasRect?.top ?? 0;
  const areaWidth = canvasRect?.width ?? window.innerWidth;
  const areaHeight = canvasRect?.height ?? window.innerHeight;

  dialog.style.position = 'fixed';
  dialog.style.left = `${Math.max(EDGE_MARGIN_PX, areaLeft + areaWidth / 2 - dialogRect.width / 2)}px`;
  dialog.style.top = `${Math.max(EDGE_MARGIN_PX, areaTop + areaHeight / 2 - dialogRect.height / 2)}px`;
}

function setupDrag(handle: HTMLElement, dialog: HTMLElement): void {
  handle.addEventListener('mousedown', (event: MouseEvent) => {
    const rect = dialog.getBoundingClientRect();
    const dragOffsetX = event.clientX - rect.left;
    const dragOffsetY = event.clientY - rect.top;
    document.body.style.cursor = 'move';

    const onMouseMove = (moveEvent: MouseEvent): void => {
      dialog.style.left = `${moveEvent.clientX - dragOffsetX}px`;
      dialog.style.top = `${moveEvent.clientY - dragOffsetY}px`;
    };

    const onMouseUp = (): void => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    event.preventDefault();
  });
}
