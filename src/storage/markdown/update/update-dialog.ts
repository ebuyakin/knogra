/**
 * Update — the one dialog
 *
 * Settings and preview on the same screen (markdown-architecture §5.6): the
 * section a user is deciding about sits next to the count of what it will do,
 * so nobody has to choose blind. Ticking a box never re-plans — every number
 * shown is already in the plan.
 */

import type { UpdatePlan } from './plan';
import type { UpdateSectionSelection } from './apply';

export interface UpdateDialogResult {
  sections: UpdateSectionSelection;
  saveFirst: boolean;
}

interface SectionRow {
  key: keyof UpdateSectionSelection;
  label: string;
  summary: string;
  note?: string;
  hasWork: boolean;
}

export function showUpdateDialog(plan: UpdatePlan): Promise<UpdateDialogResult | null> {
  const rows = buildRows(plan);

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;';

    const dialog = document.createElement('div');
    dialog.style.cssText =
      'position:absolute;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;' +
      'width:520px;max-height:80vh;overflow:auto;color:#e6edf3;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.5);';
    centerOnCanvas(dialog);

    dialog.innerHTML = `
      <h3 style="margin:0 0 12px; font-size:16px; font-weight:600;">Update graph from document</h3>
      <p style="margin:0 0 16px; color:#8b949e; line-height:1.5;">${matchSummary(plan)}</p>
      <div id="ud-sections" style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;"></div>
      ${skipSummary(plan)}
      <label style="display:flex; align-items:center; gap:8px; margin:16px 0 20px; cursor:pointer;">
        <input type="checkbox" id="ud-save" checked style="accent-color:#58a6ff;">
        Save current workspace to a file first (recommended)
      </label>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="ud-cancel" style="padding:6px 16px; border-radius:6px; border:1px solid #30363d;
          background:none; color:#c9d1d9; cursor:pointer; font-size:13px;">Cancel</button>
        <button id="ud-apply" style="padding:6px 16px; border-radius:6px; border:none;
          background:#58a6ff; color:#fff; cursor:pointer; font-size:13px; font-weight:600;">Apply</button>
      </div>
    `;

    const sectionsHost = dialog.querySelector('#ud-sections') as HTMLElement;
    const inputs = new Map<keyof UpdateSectionSelection, HTMLInputElement>();

    for (const row of rows) {
      const label = document.createElement('label');
      label.style.cssText = `display:flex; align-items:baseline; gap:8px; cursor:${row.hasWork ? 'pointer' : 'default'}; opacity:${row.hasWork ? '1' : '0.45'};`;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = row.hasWork;
      input.disabled = !row.hasWork;
      input.style.accentColor = '#58a6ff';
      inputs.set(row.key, input);

      const text = document.createElement('span');
      text.innerHTML =
        `<strong style="font-weight:600;">${row.label}</strong>` +
        `<span style="color:#8b949e;"> — ${row.summary}</span>` +
        (row.note ? `<span style="color:#d29922;"> · ${row.note}</span>` : '');

      label.append(input, text);
      sectionsHost.appendChild(label);
    }

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = (value: UpdateDialogResult | null): void => {
      overlay.remove();
      resolve(value);
    };

    dialog.querySelector('#ud-cancel')?.addEventListener('click', () => close(null));
    dialog.querySelector('#ud-apply')?.addEventListener('click', () => {
      close({
        sections: {
          equations: inputs.get('equations')?.checked ?? false,
          comments: inputs.get('comments')?.checked ?? false,
          tags: inputs.get('tags')?.checked ?? false,
          notes: inputs.get('notes')?.checked ?? false,
          articles: inputs.get('articles')?.checked ?? false
        },
        saveFirst: (dialog.querySelector('#ud-save') as HTMLInputElement | null)?.checked ?? false
      });
    });
  });
}

/** True when the plan would change nothing at all, whatever the user ticks. */
export function isEmptyPlan(plan: UpdatePlan): boolean {
  return buildRows(plan).every(row => !row.hasWork);
}

function buildRows(plan: UpdatePlan): SectionRow[] {
  return [
    fieldRow('equations', 'Equations', plan.equations.changes.length, plan.equations.unchanged),
    fieldRow('comments', 'Comments', plan.comments.changes.length, plan.comments.unchanged),
    {
      ...fieldRow('tags', 'Tags', plan.tags.changes.length, plan.tags.unchanged),
      // Tags drive style copying, so this is the one section that can change
      // how the graph looks (§5.3).
      note: plan.tags.changes.length > 0 ? 'may change appearance' : undefined
    },
    proseRow('articles', 'Articles', plan),
    proseRow('notes', 'Notes', plan)
  ];
}

function fieldRow(
  key: keyof UpdateSectionSelection,
  label: string,
  changed: number,
  unchanged: number
): SectionRow {
  return {
    key,
    label,
    summary: changed > 0 ? `${changed} replaced${unchangedSuffix(unchanged)}` : emptySummary(unchanged),
    hasWork: changed > 0
  };
}

function proseRow(key: 'notes' | 'articles', label: string, plan: UpdatePlan): SectionRow {
  const section = plan[key];
  const parts: string[] = [];
  if (section.replaced.length > 0) parts.push(`${section.replaced.length} replaced`);
  if (section.added.length > 0) parts.push(`${section.added.length} added`);

  return {
    key,
    label,
    summary: parts.length > 0
      ? `${parts.join(', ')}${unchangedSuffix(section.unchanged)}`
      : emptySummary(section.unchanged),
    hasWork: parts.length > 0
  };
}

function unchangedSuffix(unchanged: number): string {
  return unchanged > 0 ? `, ${unchanged} unchanged` : '';
}

function emptySummary(unchanged: number): string {
  return unchanged > 0 ? `nothing to change (${unchanged} already current)` : 'nothing in the document';
}

function matchSummary(plan: UpdatePlan): string {
  const { total, matchedByRealId, matchedByExternalId } = plan.nodes;
  const matched = matchedByRealId + matchedByExternalId;
  if (total === 0) return 'The document names no nodes.';
  return `Matched ${matched} of ${total} nodes — ${matchedByRealId} by node id, ${matchedByExternalId} by external id.`;
}

/**
 * Unmatched entries are the signal that a document is pointed at the wrong
 * workspace, so they are stated before Apply rather than reported after it.
 */
function skipSummary(plan: UpdatePlan): string {
  const lines: string[] = [];

  if (plan.nodes.unmatched.length > 0) {
    const sample = plan.nodes.unmatched.slice(0, 4).join(' · ');
    const rest = plan.nodes.unmatched.length > 4 ? ' · …' : '';
    lines.push(`${plan.nodes.unmatched.length} document entries name no known node · ${sample}${rest}`);
  }

  const missingIds = countMissingNoteIds(plan);
  if (missingIds > 0) {
    lines.push(`${missingIds} prose entries carry no note id, so they cannot be matched`);
  }

  if (lines.length === 0) return '';

  return `
    <div style="border:1px solid #30363d; border-radius:6px; padding:10px 12px; color:#8b949e; line-height:1.5;">
      <div style="color:#c9d1d9; margin-bottom:4px;">Not matched (nothing will change)</div>
      ${lines.map(line => `<div>${line}</div>`).join('')}
    </div>
  `;
}

function countMissingNoteIds(plan: UpdatePlan): number {
  const isMissingId = (reason: string): boolean => reason === 'missing-note-id';
  return (
    plan.notes.skipped.filter(entry => isMissingId(entry.reason)).length +
    plan.articles.skipped.filter(entry => isMissingId(entry.reason)).length
  );
}

function centerOnCanvas(dialog: HTMLElement): void {
  const rect = document.getElementById('cy')?.getBoundingClientRect();
  dialog.style.left = rect ? `${rect.left + rect.width / 2}px` : '50%';
  dialog.style.top = rect ? `${rect.top + rect.height / 2}px` : '50%';
  dialog.style.transform = 'translate(-50%, -50%)';
}
