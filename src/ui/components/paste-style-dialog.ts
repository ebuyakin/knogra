/**
 * PasteStyleDialog
 * Modal for applying a copied node style to all nodes carrying selected tag(s),
 * in the current scene or across all scenes. Design and scale are toggled
 * independently. Shows a live count before applying.
 */

import type { FeatureAPI } from '../../features/feature-api';
import type { TagStyleParams } from '../../features/scene/tag-style-plan';

export interface CopiedNodeStyle {
  design: { id: string; params: Record<string, unknown> };
  scale: number;
  sourceNodeId: string;
  sourceTags: string[];
}

export class PasteStyleDialog {
  #features: FeatureAPI;
  #overlay: HTMLDivElement | null = null;

  constructor(features: FeatureAPI) {
    this.#features = features;
  }

  open(copied: CopiedNodeStyle): void {
    this.#close();

    const allTags = this.#features.graph.getAllTags();
    if (allTags.length === 0) {
      window.alert('No tags exist in this workspace yet. Add tags to nodes (node editor) to target them by tag.');
      return;
    }

    const selectedTags = new Set(copied.sourceTags.filter(tag => allTags.includes(tag)));
    const orderedTags = [
      ...allTags.filter(tag => selectedTags.has(tag)),
      ...allTags.filter(tag => !selectedTags.has(tag))
    ];
    const state = { scope: 'all' as 'current' | 'all', applyDesign: true, applyScale: false };
    const overlay = document.createElement('div');
    overlay.className = 'paste-style-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '10000'
    } as CSSStyleDeclaration);

    const rect = document.getElementById('cy')?.getBoundingClientRect();
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'relative',
      left: `${rect ? rect.left + rect.width / 2 - window.innerWidth / 2 : 0}px`,
      top: `${rect ? rect.top + rect.height / 2 - window.innerHeight / 2 : 0}px`,
      background: '#161b22', color: '#e6edf3', border: '1px solid #30363d',
      borderRadius: '8px', padding: '20px', width: '340px', maxHeight: '80vh',
      overflowY: 'auto', font: '13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
    } as CSSStyleDeclaration);

    const title = document.createElement('div');
    title.textContent = 'Paste style to tagged nodes';
    Object.assign(title.style, { fontSize: '15px', fontWeight: '600', marginBottom: '14px' } as CSSStyleDeclaration);
    panel.appendChild(title);

    const count = document.createElement('div');
    Object.assign(count.style, { margin: '14px 0', color: '#9aa4af' } as CSSStyleDeclaration);

    const applyBtn = document.createElement('button');

    const refresh = (): void => {
      const params = this.#buildParams(state, selectedTags, copied.sourceNodeId);
      const plan = this.#features.scene.planTaggedStyleApplication(params);
      count.textContent = `Will restyle ${plan.totalNodeInstances} node(s) across ${plan.totalScenes} scene(s).`;
      const canApply = selectedTags.size > 0 && (state.applyDesign || state.applyScale) && plan.totalNodeInstances > 0;
      applyBtn.disabled = !canApply;
      applyBtn.style.opacity = canApply ? '1' : '0.5';
    };

    panel.appendChild(this.#section('Apply to scenes', [
      this.#radio('paste-scope', 'Current scene', state.scope === 'current', () => { state.scope = 'current'; refresh(); }),
      this.#radio('paste-scope', 'All scenes', state.scope === 'all', () => { state.scope = 'all'; refresh(); })
    ]));

    panel.appendChild(this.#section('Properties', [
      this.#checkbox('Design', state.applyDesign, checked => { state.applyDesign = checked; refresh(); }),
      this.#checkbox('Scale', state.applyScale, checked => { state.applyScale = checked; refresh(); })
    ]));

    const tagRows = orderedTags.map(tag =>
      this.#checkbox(tag, selectedTags.has(tag), checked => {
        if (checked) selectedTags.add(tag); else selectedTags.delete(tag);
        refresh();
      })
    );
    const tagList = document.createElement('div');
    Object.assign(tagList.style, {
      maxHeight: '160px', overflowY: 'auto', border: '1px solid #30363d',
      borderRadius: '6px', padding: '6px 10px', background: '#0d1117'
    } as CSSStyleDeclaration);
    for (const row of tagRows) tagList.appendChild(row);
    panel.appendChild(this.#section('Tags', [tagList]));

    panel.appendChild(count);

    const buttons = document.createElement('div');
    Object.assign(buttons.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' } as CSSStyleDeclaration);
    const cancelBtn = this.#button('Cancel', () => this.#close());
    applyBtn.textContent = 'Apply';
    this.#styleButton(applyBtn, true);
    applyBtn.addEventListener('click', () => {
      void this.#features.scene.applyStyleToTaggedNodes(
        { design: copied.design, scale: copied.scale },
        this.#buildParams(state, selectedTags, copied.sourceNodeId)
      );
      this.#close();
    });
    buttons.append(cancelBtn, applyBtn);
    panel.appendChild(buttons);

    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) this.#close(); });
    document.body.appendChild(overlay);
    this.#overlay = overlay;

    refresh();
  }

  #buildParams(
    state: { scope: 'current' | 'all'; applyDesign: boolean; applyScale: boolean },
    selectedTags: Set<string>,
    excludeNodeId: string
  ): TagStyleParams {
    return {
      tags: [...selectedTags],
      scope: state.scope,
      applyDesign: state.applyDesign,
      applyScale: state.applyScale,
      currentSceneId: this.#features.scene.getCurrentSceneId(),
      excludeNodeId
    };
  }

  #section(label: string, rows: HTMLElement[]): HTMLElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { marginBottom: '14px' } as CSSStyleDeclaration);
    const heading = document.createElement('div');
    heading.textContent = label;
    Object.assign(heading.style, { fontSize: '11px', textTransform: 'uppercase', color: '#7d8590', marginBottom: '6px' } as CSSStyleDeclaration);
    wrap.appendChild(heading);
    for (const row of rows) wrap.appendChild(row);
    return wrap;
  }

  #radio(name: string, label: string, checked: boolean, onSelect: () => void): HTMLElement {
    const row = document.createElement('label');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', cursor: 'pointer' } as CSSStyleDeclaration);
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.checked = checked;
    input.addEventListener('change', () => { if (input.checked) onSelect(); });
    row.append(input, document.createTextNode(label));
    return row;
  }

  #checkbox(label: string, checked: boolean, onToggle: (checked: boolean) => void): HTMLElement {
    const row = document.createElement('label');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', cursor: 'pointer' } as CSSStyleDeclaration);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onToggle(input.checked));
    row.append(input, document.createTextNode(label));
    return row;
  }

  #button(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    this.#styleButton(btn, false);
    btn.addEventListener('click', onClick);
    return btn;
  }

  #styleButton(btn: HTMLButtonElement, primary: boolean): void {
    Object.assign(btn.style, {
      padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
      border: '1px solid #30363d',
      background: primary ? '#238636' : '#21262d',
      color: '#e6edf3', font: 'inherit'
    } as CSSStyleDeclaration);
  }

  #close(): void {
    this.#overlay?.remove();
    this.#overlay = null;
  }
}
