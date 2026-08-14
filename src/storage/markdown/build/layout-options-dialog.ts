/**
 * Mermaid-import layout options modal.
 *
 * A secondary dialog opened from the main import dialog. It edits the persistent
 * `knogra.mermaid.import` store (see `layout-settings-store.ts`); the main dialog
 * snapshots the store into the import selection at import time.
 *
 * Only the section(s) relevant to the chosen layout are shown. Fan reuses the
 * radial layout at its top level, so under fan mode both a "Top level (radial)"
 * and a "Nested levels (fan)" group appear — fan keeps its own copy of the
 * radial knobs, independent of the standalone Radial layout.
 */

import type { BuildSelection } from './selection-dialog';
import {
  getMermaidImportLayoutSettings,
  setMermaidImportLayoutSettings,
  MERMAID_IMPORT_LAYOUT_DEFAULTS,
  type MermaidImportLayoutSettings,
} from './layout-settings-store';

type LayoutChoice = BuildSelection['layout'];

interface NumberField {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (value: number) => void;
}

interface Section {
  title: string;
  fields: NumberField[];
}

const RADIANS_PER_DEGREE = Math.PI / 180;

/** Whether a layout exposes any adjustable knobs. */
export function layoutHasOptions(_layout: LayoutChoice): boolean {
  // Every layout now exposes at least the layout-independent tagging toggle.
  return true;
}

/**
 * Show the layout options modal for `layout`. Resolves once the dialog closes.
 * Saving persists the edited knobs to the store; the non-visible layout's knobs
 * are left untouched.
 */
export function showMermaidLayoutOptionsDialog(layout: LayoutChoice): Promise<void> {
  return new Promise(resolve => {
    // Working copy — persisted only on Save, so Cancel discards edits and the
    // other layout's knobs (not shown here) survive round-trips.
    const settings: MermaidImportLayoutSettings = structuredClone(getMermaidImportLayoutSettings());

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2100;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:absolute;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;width:min(520px,92vw);max-height:88vh;overflow-y:auto;color:#e6edf3;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:16px;';

    const cyContainer = document.getElementById('cy');
    const rect = cyContainer?.getBoundingClientRect();
    dialog.style.left = rect ? `${rect.left + rect.width / 2}px` : '50%';
    dialog.style.top = rect ? `${rect.top + rect.height / 2}px` : '50%';
    dialog.style.transform = 'translate(-50%, -50%)';

    const heading = document.createElement('h3');
    heading.textContent = 'Layout options';
    heading.style.cssText = 'margin:0;font-size:16px;font-weight:600;';
    dialog.appendChild(heading);

    const sectionsHost = document.createElement('div');
    sectionsHost.style.cssText = 'display:flex;flex-direction:column;gap:20px;';
    dialog.appendChild(sectionsHost);

    const renderSections = (): void => {
      sectionsHost.innerHTML = '';
      const sections = buildSections(layout, settings);
      if (sections.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#8b949e;line-height:1.5;';
        empty.textContent = 'This layout has no adjustable parameters yet.';
        sectionsHost.appendChild(empty);
        return;
      }
      for (const section of sections) sectionsHost.appendChild(renderSection(section));
    };

    renderSections();

    const taggingRow = renderTaggingToggle(settings, () => settings.tagLeavesAndBranches, checked => {
      settings.tagLeavesAndBranches = checked;
    });
    dialog.appendChild(taggingRow.element);

    const thresholdRow = renderSecondLevelThresholdField(settings);
    dialog.appendChild(thresholdRow.element);

    const equationScaleRow = renderEquationScaleField(settings);
    dialog.appendChild(equationScaleRow.element);

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:space-between;gap:8px;';

    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset to defaults';
    // Negative left margin cancels the button's own border + horizontal padding so
    // its label lines up with the field labels above (which have no such inset).
    resetButton.style.cssText = 'margin-left:-3px;padding:6px 16px;border-radius:6px;border:1px solid #30363d;background:none;color:#c9d1d9;cursor:pointer;font-size:13px;';

    const rightButtons = document.createElement('div');
    rightButtons.style.cssText = 'display:flex;gap:8px;';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = 'padding:6px 16px;border-radius:6px;border:1px solid #30363d;background:none;color:#c9d1d9;cursor:pointer;font-size:13px;';

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.style.cssText = 'padding:6px 16px;border-radius:6px;border:none;background:#58a6ff;color:#fff;cursor:pointer;font-size:13px;font-weight:600;';

    rightButtons.appendChild(cancelButton);
    rightButtons.appendChild(saveButton);
    footer.appendChild(resetButton);
    footer.appendChild(rightButtons);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = (): void => {
      overlay.remove();
      resolve();
    };

    resetButton.addEventListener('click', () => {
      resetVisibleParams(layout, settings);
      renderSections();
      taggingRow.sync();
      thresholdRow.sync();
      equationScaleRow.sync();
    });
    cancelButton.addEventListener('click', close);
    saveButton.addEventListener('click', () => {
      setMermaidImportLayoutSettings(settings);
      close();
    });
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
  });
}

function buildSections(layout: LayoutChoice, settings: MermaidImportLayoutSettings): Section[] {
  if (layout === 'radial') {
    return [{ title: 'Radial context', fields: radialFields(settings.radial) }];
  }
  if (layout === 'fan') {
    return [
      { title: 'Top level (radial)', fields: radialFields(settings.fanTop) },
      { title: 'Nested levels (fan)', fields: fanFields(settings.fanNested) },
    ];
  }
  return [];
}

function radialFields(params: MermaidImportLayoutSettings['radial']): NumberField[] {
  return [
    {
      label: 'Ring spacing (px)',
      hint: 'Minimum radial distance between successive rings.',
      min: 20, max: 600, step: 10,
      get: () => params.ringSpacing,
      set: value => { params.ringSpacing = value; },
    },
    {
      label: 'Sibling gap (px)',
      hint: 'Minimum arc gap between adjacent siblings on a ring.',
      min: 0, max: 300, step: 5,
      get: () => params.siblingGap,
      set: value => { params.siblingGap = value; },
    },
    {
      label: 'Density',
      hint: 'Scales reserved node footprint; below 1 packs rings tighter.',
      min: 0.1, max: 2, step: 0.05,
      get: () => params.footprintScale,
      set: value => { params.footprintScale = value; },
    },
  ];
}

function fanFields(params: MermaidImportLayoutSettings['fanNested']): NumberField[] {
  return [
    {
      label: 'Ring spacing (px)',
      hint: 'Minimum radial distance from a node to its fanned descendants.',
      min: 10, max: 600, step: 10,
      get: () => params.ringSpacing,
      set: value => { params.ringSpacing = value; },
    },
    {
      label: 'Spread (degrees)',
      hint: 'Angular width of a fan; caps how wide descendants spread.',
      min: 30, max: 360, step: 5,
      get: () => Math.round(params.spreadArc / RADIANS_PER_DEGREE),
      set: value => { params.spreadArc = value * RADIANS_PER_DEGREE; },
    },
    {
      label: 'Max child gap (degrees)',
      hint: 'Caps the angle between adjacent children so scenes with few children stay compact.',
      min: 10, max: 360, step: 5,
      get: () => Math.round(params.maxChildAngle / RADIANS_PER_DEGREE),
      set: value => { params.maxChildAngle = value * RADIANS_PER_DEGREE; },
    },
    {
      label: 'Sibling gap (px)',
      hint: 'Minimum gap between fanned siblings.',
      min: 0, max: 300, step: 5,
      get: () => params.siblingGap,
      set: value => { params.siblingGap = value; },
    },
    {
      label: 'Density',
      hint: 'Scales reserved node footprint; below 1 packs siblings tighter.',
      min: 0.1, max: 2, step: 0.05,
      get: () => params.footprintScale,
      set: value => { params.footprintScale = value; },
    },
  ];
}

function resetVisibleParams(layout: LayoutChoice, settings: MermaidImportLayoutSettings): void {
  if (layout === 'radial') {
    settings.radial = { ...MERMAID_IMPORT_LAYOUT_DEFAULTS.radial };
  } else if (layout === 'fan') {
    settings.fanTop = { ...MERMAID_IMPORT_LAYOUT_DEFAULTS.fanTop };
    settings.fanNested = { ...MERMAID_IMPORT_LAYOUT_DEFAULTS.fanNested };
  }
  settings.tagLeavesAndBranches = MERMAID_IMPORT_LAYOUT_DEFAULTS.tagLeavesAndBranches;
  settings.secondLevelThreshold = MERMAID_IMPORT_LAYOUT_DEFAULTS.secondLevelThreshold;
  settings.equationScale = MERMAID_IMPORT_LAYOUT_DEFAULTS.equationScale;
}

/**
 * Render the layout-independent "Tag branches and leaves" toggle. Returns the
 * element plus a `sync` callback that re-reads the current value (used after a
 * Reset so the checkbox reflects the restored default).
 */
function renderTaggingToggle(
  _settings: MermaidImportLayoutSettings,
  get: () => boolean,
  set: (checked: boolean) => void,
): { element: HTMLElement; sync: () => void } {
  const row = document.createElement('label');
  row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding-top:4px;border-top:1px solid #21262d;cursor:pointer;';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = get();
  input.style.marginTop = '3px';

  const text = document.createElement('div');
  text.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';

  const label = document.createElement('span');
  label.textContent = 'Tag branches and leaves';
  label.style.cssText = 'color:#e6edf3;cursor:help;';


  text.appendChild(label);

  row.appendChild(input);
  row.appendChild(text);

  input.addEventListener('change', () => set(input.checked));

  return {
    element: row,
    sync: () => { input.checked = get(); },
  };
}

/**
 * Render the layout-independent "Two-level sub-scene node limit" field. Applies
 * only to generated sub-scenes at 2 levels; `0` disables the budget. Returns the
 * element plus a `sync` callback that re-reads the current value (used after a
 * Reset so the input reflects the restored default).
 */
function renderSecondLevelThresholdField(
  settings: MermaidImportLayoutSettings,
): { element: HTMLElement; sync: () => void } {
  const row = document.createElement('label');
  row.style.cssText = 'display:grid;grid-template-columns:1fr 110px;align-items:center;gap:10px 16px;padding-top:12px;border-top:1px solid #21262d;';

  const text = document.createElement('div');
  text.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';

  const label = document.createElement('span');
  label.textContent = 'Two-level sub-scene node limit';
  label.style.cssText = 'color:#e6edf3;';

  text.appendChild(label);

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = String(settings.secondLevelThreshold);
  input.style.cssText = 'width:110px;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;';

  input.addEventListener('change', () => {
    const parsed = Number.parseInt(input.value, 10);
    const value = Number.isFinite(parsed) && parsed > 0 ? Math.min(100, parsed) : 0;
    settings.secondLevelThreshold = value;
    input.value = String(value);
  });

  row.appendChild(text);
  row.appendChild(input);

  return {
    element: row,
    sync: () => { input.value = String(settings.secondLevelThreshold); },
  };
}

/**
 * Render the layout-independent "Equation size" field. Multiplies every imported
 * equation node's size at import time (`params.equationScale`); `1` leaves the
 * design default untouched. Returns the element plus a `sync` callback.
 */
function renderEquationScaleField(
  settings: MermaidImportLayoutSettings,
): { element: HTMLElement; sync: () => void } {
  const row = document.createElement('label');
  row.style.cssText = 'display:grid;grid-template-columns:1fr 110px;align-items:center;gap:10px 16px;padding-top:12px;border-top:1px solid #21262d;';

  const text = document.createElement('div');
  text.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';

  const label = document.createElement('span');
  label.textContent = 'Equation size';
  label.style.cssText = 'color:#e6edf3;';

  text.appendChild(label);

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0.1';
  input.max = '5';
  input.step = '0.1';
  input.value = String(settings.equationScale);
  input.style.cssText = 'width:110px;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;';

  input.addEventListener('change', () => {
    const parsed = Number.parseFloat(input.value);
    const value = Number.isFinite(parsed) && parsed > 0 ? Math.min(5, parsed) : 1;
    settings.equationScale = value;
    input.value = String(value);
  });

  row.appendChild(text);
  row.appendChild(input);

  return {
    element: row,
    sync: () => { input.value = String(settings.equationScale); },
  };
}

function renderSection(section: Section): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  const title = document.createElement('div');
  title.textContent = section.title;
  title.style.cssText = 'font-weight:600;color:#c9d1d9;';
  wrapper.appendChild(title);

  for (const field of section.fields) wrapper.appendChild(renderField(field));
  return wrapper;
}

function renderField(field: NumberField): HTMLElement {
  const row = document.createElement('label');
  row.style.cssText = 'display:grid;grid-template-columns:1fr 110px;align-items:center;gap:10px 16px;';

  const text = document.createElement('div');
  text.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';

  const label = document.createElement('span');
  label.textContent = field.label;
  label.style.cssText = 'color:#e6edf3;';

  text.appendChild(label);

  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(field.min);
  input.max = String(field.max);
  input.step = String(field.step);
  input.value = String(field.get());
  input.style.cssText = 'width:110px;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;';

  input.addEventListener('change', () => {
    const parsed = Number.parseFloat(input.value);
    if (!Number.isFinite(parsed)) {
      input.value = String(field.get());
      return;
    }
    const clamped = Math.min(field.max, Math.max(field.min, parsed));
    field.set(clamped);
    input.value = String(field.get());
  });

  row.appendChild(text);
  row.appendChild(input);
  return row;
}
