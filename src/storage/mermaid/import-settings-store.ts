/**
 * Mermaid-import layout settings store.
 *
 * A standalone persistence surface (localStorage key `knogra.mermaid.import`),
 * deliberately kept out of the consolidated `knogra.settings` object so these
 * publisher-only authoring knobs never travel inside an exported `.knogra`
 * workspace nor get overwritten when importing one.
 *
 * The fan layout reuses the radial layout at its top level (levels 0–1), so
 * `fanTop` is a full, independent copy of the radial knobs — tuning fan never
 * disturbs the standalone Radial layout and vice versa.
 */

import { MERMAID_IMPORT_KEY } from '../../config/storage-config';
import { RADIAL_LAYOUT_DEFAULTS, type RadialLayoutParams } from './layout/radial';
import { FAN_LAYOUT_DEFAULTS, type FanLayoutParams } from './layout/fan';

export interface MermaidImportLayoutSettings {
  /** Standalone "Radial context" layout. */
  radial: RadialLayoutParams;
  /** Fan's top level (levels 0–1), laid out radially. Independent copy. */
  fanTop: RadialLayoutParams;
  /** Fan's nested levels (≥2). */
  fanNested: FanLayoutParams;
  /** Tag each node `branch` (degree ≥ 2) or `leaf` (degree 1) at import time.
   *  Layout-independent — computed from the raw graph's edge degree. */
  tagLeavesAndBranches: boolean;
}

export const MERMAID_IMPORT_LAYOUT_DEFAULTS: MermaidImportLayoutSettings = {
  radial: { ...RADIAL_LAYOUT_DEFAULTS },
  fanTop: { ...RADIAL_LAYOUT_DEFAULTS },
  fanNested: { ...FAN_LAYOUT_DEFAULTS },
  tagLeavesAndBranches: true,
};

/**
 * Read the persisted settings, deep-merged with defaults so a partial or stale
 * stored object never yields `undefined` knobs.
 */
export function getMermaidImportLayoutSettings(): MermaidImportLayoutSettings {
  const stored = localStorage.getItem(MERMAID_IMPORT_KEY);
  if (!stored) return structuredClone(MERMAID_IMPORT_LAYOUT_DEFAULTS);

  try {
    const parsed = JSON.parse(stored) as Partial<MermaidImportLayoutSettings>;
    return {
      radial: { ...MERMAID_IMPORT_LAYOUT_DEFAULTS.radial, ...parsed.radial },
      fanTop: { ...MERMAID_IMPORT_LAYOUT_DEFAULTS.fanTop, ...parsed.fanTop },
      fanNested: { ...MERMAID_IMPORT_LAYOUT_DEFAULTS.fanNested, ...parsed.fanNested },
      tagLeavesAndBranches:
        parsed.tagLeavesAndBranches ?? MERMAID_IMPORT_LAYOUT_DEFAULTS.tagLeavesAndBranches,
    };
  } catch {
    return structuredClone(MERMAID_IMPORT_LAYOUT_DEFAULTS);
  }
}

/** Persist a full settings object. */
export function setMermaidImportLayoutSettings(settings: MermaidImportLayoutSettings): void {
  localStorage.setItem(MERMAID_IMPORT_KEY, JSON.stringify(settings));
}

/** Restore factory defaults (clears the stored object). */
export function resetMermaidImportLayoutSettings(): void {
  localStorage.removeItem(MERMAID_IMPORT_KEY);
}
