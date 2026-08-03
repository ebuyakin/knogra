/**
 * Node Editor - Design tab
 *
 * Visual attributes: design type, scale, colour/opacity overrides, and the
 * layout knobs that only the `default-node` design exposes.
 */

import type { DesignId } from '../../../core/main-types';
import { AVAILABLE_DESIGNS } from '../../../styles/designs/design-registry';
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
  DefaultNodeLayoutValues,
  DesignTabValues,
  EditorTab
} from './node-editor-types';

const DEFAULT_NODE_FONT_SIZE = 14;
const DEFAULT_NODE_MIN_WIDTH = 100;
const DEFAULT_NODE_ASPECT_RATIO = 16 / 9;
const DEFAULT_NODE_DESIGN_ID = 'default-node';

const SCALE_MIN = 0.2;
const SCALE_MAX = 3.0;

export interface DesignTabDeps {
  design: { id: DesignId; params: Record<string, unknown> };
  scale: number;
  themeId: string;
}

export interface DesignTab extends EditorTab<DesignTabValues> {
  /** Switches the selected design; returns false when the design is not registered. */
  selectDesign(designId: DesignId): boolean;
}

interface LayoutControls {
  container: HTMLDivElement;
  fontSizeInput: HTMLInputElement;
  minWidthInput: HTMLInputElement;
  aspectRatioInput: HTMLInputElement;
  fixedAspectInput: HTMLInputElement;
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

  const layout = createLayoutControls(params);
  const layoutSection = el('div', 'node-editor-group');
  layoutSection.append(caption('Node Layout'), layout.container);

  const syncLayoutVisibility = (): void => {
    layoutSection.style.display =
      designSelect.select.value === DEFAULT_NODE_DESIGN_ID ? '' : 'none';
  };
  designSelect.select.addEventListener('change', syncLayoutVisibility);
  syncLayoutVisibility();

  const colorSection = el('div', 'node-editor-group');
  colorSection.append(
    caption('Colours & Opacity'),
    textRow.container,
    bgRow.container,
    bgAltRow.container
  );

  element.append(designSelect.container, scale.container, colorSection, layoutSection);

  return {
    element,

    selectDesign(designId: DesignId): boolean {
      const exists = Array.from(designSelect.select.options).some(
        (option) => option.value === designId
      );
      if (!exists) return false;
      designSelect.select.value = designId;
      syncLayoutVisibility();
      return true;
    },

    read(): DesignTabValues | null {
      const designId = designSelect.select.value as DesignId;
      let defaultNodeLayout: DefaultNodeLayoutValues | null = null;

      if (designId === DEFAULT_NODE_DESIGN_ID) {
        defaultNodeLayout = readLayoutControls(layout);
        if (!defaultNodeLayout) return null;
      }

      return {
        designId,
        scale: scale.input.valueAsNumber,
        colors: {
          text: textRow.getColor(),
          background: bgRow.getColor(),
          backgroundAlt: bgAltRow.getColor()
        },
        opacities: {
          text: textRow.getOpacity(),
          background: bgRow.getOpacity(),
          backgroundAlt: bgAltRow.getOpacity()
        },
        defaultNodeLayout
      };
    }
  };
}

/**
 * Writes layout values into design params, dropping any that match the design
 * default so unchanged nodes keep an empty params object.
 */
export function mergeDefaultNodeLayoutParams(
  designParams: Record<string, unknown>,
  values: DefaultNodeLayoutValues
): void {
  setNumberParam(designParams, 'fontSize', Math.round(values.fontSize), DEFAULT_NODE_FONT_SIZE);
  setNumberParam(designParams, 'minWidth', values.minWidth, DEFAULT_NODE_MIN_WIDTH);
  setNumberParam(designParams, 'aspectRatio', values.aspectRatio, DEFAULT_NODE_ASPECT_RATIO);
  if (values.fixedAspect) {
    designParams.fixedAspect = true;
  } else {
    delete designParams.fixedAspect;
  }
}

function setNumberParam(
  designParams: Record<string, unknown>,
  key: string,
  value: number,
  defaultValue: number
): void {
  if (Math.abs(value - defaultValue) > 0.0001) {
    designParams[key] = value;
  } else {
    delete designParams[key];
  }
}

function createScaleRow(value: number): { container: HTMLDivElement; input: HTMLInputElement } {
  const container = el('div', 'node-editor-inline-row');
  const label = text('span', 'Scale');
  label.className = 'node-editor-inline-label';

  const numberInput = document.createElement('input');
  numberInput.type = 'number';
  numberInput.className = 'node-editor-scale-input';
  numberInput.min = String(SCALE_MIN);
  numberInput.max = String(SCALE_MAX);
  numberInput.step = '0.05';
  numberInput.value = value.toFixed(2);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'node-editor-opacity-slider';
  slider.min = String(SCALE_MIN);
  slider.max = String(SCALE_MAX);
  slider.step = '0.05';
  slider.value = String(value);

  slider.addEventListener('input', () => {
    numberInput.value = slider.valueAsNumber.toFixed(2);
  });
  numberInput.addEventListener('input', () => {
    const parsed = parseFloat(numberInput.value);
    if (!isNaN(parsed) && parsed >= SCALE_MIN && parsed <= SCALE_MAX) {
      slider.value = String(parsed);
    }
  });

  container.append(label, numberInput, slider);
  return { container, input: slider };
}

function createLayoutControls(params: Record<string, unknown>): LayoutControls {
  const container = el('div', 'node-editor-layout-controls');

  const fontSize = createNumberInput(
    'Font size',
    numberParam(params.fontSize, DEFAULT_NODE_FONT_SIZE),
    '6',
    '48',
    '1'
  );
  const minWidth = createNumberInput(
    'Min Width',
    numberParam(params.minWidth, DEFAULT_NODE_MIN_WIDTH),
    '40',
    '600',
    '5'
  );
  const aspectRatio = createNumberInput(
    'Aspect ratio',
    numberParam(params.aspectRatio, DEFAULT_NODE_ASPECT_RATIO),
    '0.3',
    '5',
    '0.05'
  );

  const fixedAspectRow = document.createElement('label');
  fixedAspectRow.className = 'node-editor-checkbox-row node-editor-layout-cell';
  const fixedAspectInput = document.createElement('input');
  fixedAspectInput.type = 'checkbox';
  fixedAspectInput.checked = params.fixedAspect === true;
  const fixedAspectLabel = text('span', 'Fixed Aspect');
  fixedAspectLabel.className = 'node-editor-inline-label';
  fixedAspectRow.append(fixedAspectLabel, fixedAspectInput);

  fontSize.container.classList.add('node-editor-layout-cell');
  aspectRatio.container.classList.add('node-editor-layout-cell');
  minWidth.container.classList.add('node-editor-layout-cell');

  container.append(
    fixedAspectRow,
    aspectRatio.container,
    fontSize.container,
    minWidth.container
  );

  return {
    container,
    fontSizeInput: fontSize.input,
    minWidthInput: minWidth.input,
    aspectRatioInput: aspectRatio.input,
    fixedAspectInput
  };
}

function readLayoutControls(controls: LayoutControls): DefaultNodeLayoutValues | null {
  const fontSize = readNumberInput(controls.fontSizeInput, 'Font size');
  const minWidth = readNumberInput(controls.minWidthInput, 'Minimum width');
  const aspectRatio = readNumberInput(controls.aspectRatioInput, 'Aspect ratio');

  if (fontSize === null || minWidth === null || aspectRatio === null) return null;

  return {
    fontSize,
    minWidth,
    aspectRatio,
    fixedAspect: controls.fixedAspectInput.checked
  };
}
