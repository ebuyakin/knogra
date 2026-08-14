/**
 * Markdown export — section chooser
 *
 * Which parts a document carries is a per-export decision, not a setting: the
 * file you hand to an AI is not the file you keep beside the graph
 * (markdown-architecture §5.8). AI chat defaults off because it can dwarf
 * everything else in the file.
 */

import type { DocumentExportSections } from './document/document';

const DEFAULT_SECTIONS: DocumentExportSections = {
  diagram: true,
  equations: true,
  tags: true,
  comments: true,
  notes: true,
  articles: true,
  aiChat: false
};

interface SectionOption {
  key: keyof DocumentExportSections;
  label: string;
  hint: string;
}

const OPTIONS: SectionOption[] = [
  { key: 'diagram', label: 'Flowchart', hint: 'the Mermaid diagram — nodes and edges' },
  { key: 'comments', label: 'Comments', hint: 'one line per node' },
  { key: 'tags', label: 'Tags', hint: 'one line per node' },
  { key: 'articles', label: 'Articles', hint: 'locked, markdown-rendered prose' },
  { key: 'notes', label: 'Notes', hint: 'editable notes written in the app' },
  { key: 'equations', label: 'Equations', hint: 'one line per node' },
  { key: 'aiChat', label: 'AI chat', hint: 'read-only — never imported back' }
];

/**
 * @param omittedImages Uploaded images with no source URL. They cannot be
 * written as links and are stated up front, since the document is the artefact
 * a user might otherwise mistake for a complete copy.
 */
export function showExportSectionsDialog(omittedImages: number): Promise<DocumentExportSections | null> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;';

    const dialog = document.createElement('div');
    dialog.style.cssText =
      'position:absolute;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;' +
      'width:440px;color:#e6edf3;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.5);';

    const rect = document.getElementById('cy')?.getBoundingClientRect();
    dialog.style.left = rect ? `${rect.left + rect.width / 2}px` : '50%';
    dialog.style.top = rect ? `${rect.top + rect.height / 2}px` : '50%';
    dialog.style.transform = 'translate(-50%, -50%)';

    dialog.innerHTML = `
      <h3 style="margin:0 0 12px; font-size:16px; font-weight:600;">Export as Markdown</h3>
      <p style="margin:0 0 16px; color:#8b949e; line-height:1.5;">
        Without the flowchart the file cannot build a graph, only update one. A Markdown
        document carries no scenes, positions, designs or themes — it is not a backup.
      </p>
      <div id="ed-sections" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;"></div>
      ${omittedImages > 0 ? `
      <p style="margin:0 0 20px; color:#d29922; line-height:1.5;">
        ${omittedImages} uploaded ${omittedImages === 1 ? 'image is' : 'images are'} left out — only images
        with a source URL can be written as links. They stay in the workspace file.
      </p>` : ''}
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="ed-cancel" style="padding:6px 16px; border-radius:6px; border:1px solid #30363d;
          background:none; color:#c9d1d9; cursor:pointer; font-size:13px;">Cancel</button>
        <button id="ed-ok" style="padding:6px 16px; border-radius:6px; border:none;
          background:#58a6ff; color:#fff; cursor:pointer; font-size:13px; font-weight:600;">Export</button>
      </div>
    `;

    const host = dialog.querySelector('#ed-sections') as HTMLElement;
    const inputs = new Map<keyof DocumentExportSections, HTMLInputElement>();

    for (const option of OPTIONS) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex; align-items:baseline; gap:8px; cursor:pointer;';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = DEFAULT_SECTIONS[option.key];
      input.style.accentColor = '#58a6ff';
      inputs.set(option.key, input);

      const text = document.createElement('span');
      text.innerHTML = `<strong style="font-weight:600;">${option.label}</strong><span style="color:#8b949e;"> — ${option.hint}</span>`;

      label.append(input, text);
      host.appendChild(label);
    }

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = (value: DocumentExportSections | null): void => {
      overlay.remove();
      resolve(value);
    };

    dialog.querySelector('#ed-cancel')?.addEventListener('click', () => close(null));
    dialog.querySelector('#ed-ok')?.addEventListener('click', () => {
      close({
        diagram: inputs.get('diagram')?.checked ?? false,
        equations: inputs.get('equations')?.checked ?? false,
        tags: inputs.get('tags')?.checked ?? false,
        comments: inputs.get('comments')?.checked ?? false,
        notes: inputs.get('notes')?.checked ?? false,
        articles: inputs.get('articles')?.checked ?? false,
        aiChat: inputs.get('aiChat')?.checked ?? false
      });
    });
  });
}
