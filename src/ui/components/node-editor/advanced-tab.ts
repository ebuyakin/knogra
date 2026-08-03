/**
 * Node Editor - Advanced tab
 *
 * Raw escape hatches: node properties and design parameters as JSON. Kept off
 * the default tab so the common edit — a title, maybe a comment — never shows a
 * JSON blob. Read-only service data lives in the Identity tab.
 */

import type { Node } from '../../../core/main-types';
import { caption, createTextarea, el } from './editor-fields';
import type { AdvancedTabValues, EditorTab } from './node-editor-types';

export interface AdvancedTabDeps {
  node: Node;
  designParams: Record<string, unknown>;
}

export function createAdvancedTab(deps: AdvancedTabDeps): EditorTab<AdvancedTabValues> {
  const element = el('div', 'node-editor-panel');

  // `equation` and `comment` are owned by the Content tab; showing them here too
  // would give the same value two editable homes.
  const editableProperties = { ...deps.node.properties };
  delete editableProperties.equation;
  delete editableProperties.comment;
  const propertiesJson =
    Object.keys(editableProperties).length > 0
      ? JSON.stringify(editableProperties, null, 2)
      : '';
  // Fixed rows: long JSON scrolls inside the textarea rather than adding a
  // second scrollbar to the panel.
  const properties = createTextarea('', propertiesJson, '{\n  "key": "value"\n}', 4, {
    autoGrow: false
  });

  const designParamsJson =
    Object.keys(deps.designParams).length > 0
      ? JSON.stringify(deps.designParams, null, 2)
      : '';
  const designParams = createTextarea('', designParamsJson, '{\n  "fontSize": 14\n}', 7, {
    autoGrow: false
  });

  element.append(
    caption('Properties (JSON)'),
    properties.container,
    caption('Design Parameters (JSON)'),
    designParams.container
  );

  return {
    element,
    read(): AdvancedTabValues | null {
      const parsedProperties = parseJsonObject(properties.input.value, 'Properties');
      if (!parsedProperties) return null;

      const parsedDesignParams = parseJsonObject(designParams.input.value, 'Design Parameters');
      if (!parsedDesignParams) return null;

      return { properties: parsedProperties, designParams: parsedDesignParams };
    }
  };
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> | null {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    alert(`Invalid JSON in ${label} field. Please fix and try again.`);
    return null;
  }
}
