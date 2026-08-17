/**
 * Node Editor - Design tab
 *
 * Visual attributes: design type, scale, colour/opacity overrides, and the
 * layout knobs the selected design declares.
 *
 * The tab names no design id. Which knobs exist, what each one defaults to and
 * which param it writes all come from `getDesignLayoutControls`, so a design
 * that grows a layout param is one line next to that design.
 */

import type { DesignId } from '../../../core/main-types';
import { NODE_SCALE_MAX, NODE_SCALE_MIN } from '../../../config/node-settings';
import {
  AVAILABLE_DESIGNS,
  getDesignLayoutControls,
  type NodeLayoutControl
} from '../../../styles/designs/design-registry';
import { getTheme } from '../../../styles/themes';
import {
  caption,
  createColorWithOpacity,
  createNumberInput,
  createSelect,
  el,
  numberParam,
  readNumberInput,
  text
} from './editor-fields';
import type {
  DesignTabValues,
  EditorTab,
  NodeLayoutValues
} from './node-editor-types';

export interface DesignTabDeps {
  design: { id: DesignId; params: Record<string, unknown> };
  scale: number;
  themeId: string;
}

export interface DesignTab extends EditorTab<DesignTabValues> {
  /** Switches the selected design; returns false when the design is not registered. */
  selectDesign(designId: DesignId): boolean;
}

/** The layout section, rebuilt whenever the selected design changes. */
interface LayoutSection {
  element: HTMLDivElement;
  rebuild(designId: DesignId): void;
  /** Null when a value is out of range — the user has already been told. */
  read(): NodeLayoutValues | null;
}

export function createDesignTab(deps: DesignTabDeps): DesignTab {
  const element = el('div', 'node-editor-panel');
  const params = deps.design.params || {};

  const designSelect = createSelect(
    'Design',
    deps.design.id,
    AVAILABLE_DESIGNS.map((design) => design.id)
  );

  const scale = createScaleRow(deps.scale);

  const theme = getTheme(deps.themeId);
  const colorOverrides = (params.colorOverrides as Record<string, string>) || {};
  const effects = (params.effects as Record<string, number>) || {};

  const themeText = theme.node.text as { color: string; opacity: number };
  const themeBg = theme.node.background as { color: string; opacity: number };
  const themeBgAlt = theme.node.backgroundAlt as { color: string; opacity: number };

  const textRow = createColorWithOpacity(
    'Text',
    colorOverrides.text,
    themeText.color,
    effects.textOpacity ?? themeText.opacity
  );
  const bgRow = createColorWithOpacity(
    'Background',
    colorOverrides.background,
    themeBg.color,
    effects.backgroundOpacity ?? themeBg.opacity
  );
  const bgAltRow = createColorWithOpacity(
    'Background Alt',
    colorOverrides.backgroundAlt,
    themeBgAlt.color,
    effects.backgroundAltOpacity ?? themeBgAlt.opacity
  );

  const layout = createLayoutSection(params);

  const syncLayout = (): void => {
    layout.rebuild(designSelect.select.value as DesignId);
  };
  designSelect.select.addEventListener('change', syncLayout);
  syncLayout();

  const colorSection = el('div', 'node-editor-group');
  colorSection.append(
    caption('Colours & Opacity'),
    textRow.container,
    bgRow.container,
    bgAltRow.container
  );

  element.append(designSelect.container, scale.container, colorSection, layout.element);

  return {
    element,

    selectDesign(designId: DesignId): boolean {
      const exists = Array.from(designSelect.select.options).some(
        (option) => option.value === designId
      );
      if (!exists) return false;
      designSelect.select.value = designId;
      syncLayout();
      return true;
    },

    read(): DesignTabValues | null {
      const layoutValues = layout.read();
      if (!layoutValues) return null;

      return {
        designId: designSelect.select.value as DesignId,
        scale: scale.input.valueAsNumber,
        colors: {
          text: textRow.getColor(),
          background: bgRow.getColor(),
          backgroundAlt: bgAltRow.getColor()
        },
        // The theme default is the implicit value: reporting it as undefined
        // keeps design params sparse and the node theme-responsive. Storing it
        // explicitly would make the design differ across scenes and trigger
        // ghost crossfades in transitions for visually identical nodes.
        opacities: {
          text: overrideOpacity(textRow.getOpacity(), themeText.opacity),
          background: overrideOpacity(bgRow.getOpacity(), themeBg.opacity),
          backgroundAlt: overrideOpacity(bgAltRow.getOpacity(), themeBgAlt.opacity)
        },
        layout: layoutValues
      };
    }
  };
}

/** An opacity equal to the theme default is not an override. */
function overrideOpacity(value: number, themeDefault: number): number | undefined {
  return Math.abs(value - themeDefault) < 0.001 ? undefined : value;
}

/**
 * Writes layout values into design params, dropping any that match the design
 * default so unchanged nodes keep an empty params object.
 *
 * Only the selected design's own keys are touched: params left behind by a
 * previously selected design are none of this design's business, and every
 * design ignores keys it does not know.
 */
export function mergeNodeLayoutParams(
  designParams: Record<string, unknown>,
  designId: DesignId,
  values: NodeLayoutValues
): void {
  for (const control of getDesignLayoutControls(designId)) {
    const value = values[control.key];

    if (control.kind === 'checkbox') {
      if (value === true) {
        designParams[control.key] = true;
      } else {
        delete designParams[control.key];
      }
      continue;
    }

    if (typeof value !== 'number') continue;
    if (Math.abs(value - control.defaultValue) > 0.0001) {
      designParams[control.key] = value;
    } else {
      delete designParams[control.key];
    }
  }
}

function createScaleRow(value: number): { container: HTMLDivElement; input: HTMLInputElement } {
  const container = el('div', 'node-editor-inline-row');
  const label = text('span', 'Scale');
  label.className = 'node-editor-inline-label';

  const numberInput = document.createElement('input');
  numberInput.type = 'number';
  numberInput.className = 'node-editor-scale-input';
  numberInput.min = String(NODE_SCALE_MIN);
  numberInput.max = String(NODE_SCALE_MAX);
  numberInput.step = '0.05';
  numberInput.value = value.toFixed(2);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'node-editor-opacity-slider';
  slider.min = String(NODE_SCALE_MIN);
  slider.max = String(NODE_SCALE_MAX);
  slider.step = '0.05';
  slider.value = String(value);

  slider.addEventListener('input', () => {
    numberInput.value = slider.valueAsNumber.toFixed(2);
  });
  numberInput.addEventListener('input', () => {
    const parsed = parseFloat(numberInput.value);
    if (!isNaN(parsed) && parsed >= NODE_SCALE_MIN && parsed <= NODE_SCALE_MAX) {
      slider.value = String(parsed);
    }
  });

  container.append(label, numberInput, slider);
  return { container, input: slider };
}

/**
 * The Node Layout section.
 *
 * Rebuilt on every design change rather than built once, because the control
 * set is the design's, not the tab's. Values already on screen are carried
 * across the switch when the new design shares the key — the two image designs
 * differ by one knob, and resetting the other four would read as a bug.
 */
function createLayoutSection(params: Record<string, unknown>): LayoutSection {
  const element = el('div', 'node-editor-group');
  const grid = el('div', 'node-editor-layout-controls');
  element.append(caption('Node Layout'), grid);

  let controls: NodeLayoutControl[] = [];
  let inputs = new Map<string, HTMLInputElement>();

  /** Raw, unvalidated — for carrying edits across a rebuild only. */
  function rawValues(): Map<string, number | boolean> {
    const values = new Map<string, number | boolean>();
    for (const control of controls) {
      const input = inputs.get(control.key);
      if (!input) continue;
      values.set(
        control.key,
        control.kind === 'checkbox' ? input.checked : input.valueAsNumber
      );
    }
    return values;
  }

  function rebuild(designId: DesignId): void {
    const carried = rawValues();
    controls = getDesignLayoutControls(designId);
    inputs = new Map();
    grid.replaceChildren();
    element.style.display = controls.length > 0 ? '' : 'none';

    for (const control of controls) {
      const carriedValue = carried.get(control.key);

      if (control.kind === 'checkbox') {
        const { container, input } = createLayoutCheckbox(
          control.label,
          typeof carriedValue === 'boolean' ? carriedValue : params[control.key] === true
        );
        inputs.set(control.key, input);
        grid.appendChild(container);
        continue;
      }

      const seed = typeof carriedValue === 'number' && Number.isFinite(carriedValue)
        ? carriedValue
        : numberParam(params[control.key], control.defaultValue);
      const field = createNumberInput(
        control.label,
        seed,
        String(control.min),
        String(control.max),
        String(control.step)
      );
      field.container.classList.add('node-editor-layout-cell');
      inputs.set(control.key, field.input);
      grid.appendChild(field.container);
    }

    applyDependencies();
    for (const control of controls) {
      if (control.kind !== 'checkbox') continue;
      inputs.get(control.key)?.addEventListener('change', applyDependencies);
    }
  }

  /** A control gated by an unchecked box is disabled rather than left lying. */
  function applyDependencies(): void {
    for (const control of controls) {
      if (control.kind !== 'number' || !control.enabledBy) continue;
      const input = inputs.get(control.key);
      const gate = inputs.get(control.enabledBy);
      if (!input || !gate) continue;
      input.disabled = !gate.checked;
      input.parentElement?.classList.toggle('node-editor-layout-cell-disabled', input.disabled);
    }
  }

  return {
    element,
    rebuild,

    read(): NodeLayoutValues | null {
      const values: NodeLayoutValues = {};
      for (const control of controls) {
        const input = inputs.get(control.key);
        if (!input) continue;

        if (control.kind === 'checkbox') {
          values[control.key] = input.checked;
          continue;
        }

        const value = readNumberInput(input, control.label);
        if (value === null) return null;
        values[control.key] = value;
      }
      return values;
    }
  };
}

function createLayoutCheckbox(
  label: string,
  checked: boolean
): { container: HTMLElement; input: HTMLInputElement } {
  const container = document.createElement('label');
  container.className = 'node-editor-checkbox-row node-editor-layout-cell';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;

  const labelEl = text('span', label);
  labelEl.className = 'node-editor-inline-label';

  container.append(labelEl, input);
  return { container, input };
}
