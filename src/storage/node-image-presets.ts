/**
 * Node Image Preset Registry
 * Owns `knogra.nodeImagePresets`: the collection of generation presets and the
 * one marked as default.
 *
 * Synchronous throughout. A preset is roughly a kilobyte and the collection is
 * bounded by what a person will hand-author, so localStorage carries it and
 * nothing here has to be awaited — which is what lets the generation dialog and
 * the preset editor read it during construction.
 *
 * Three rules are enforced here rather than in the UI:
 *   - **Seed when the key is absent.** One rule covers first run, Ctrl+N, and
 *     workspaces predating the feature. An *empty* collection is a deliberate
 *     act and is left alone; only an *absent* key seeds.
 *   - **Normalise on read.** localStorage is untrusted input, and with no merge
 *     step nothing else backfills a field added by a later build.
 *   - **Refuse to delete the last preset.** Generation needs one to exist.
 *
 * See docs/node-image-presets.md §4.
 */

import type {
  NodeImageForm,
  NodeImageBackdrop,
  NodeImageColourMode,
  NodeImageDepth,
  NodeImageDetailLevel,
  NodeImageEnclosure,
  NodeImagePaletteSize,
  NodeImageAspect,
  NodeImagePermission,
  NodeImagePreset,
  NodeImagePresetColour,
  NodeImagePresetContent,
  NodeImagePresetDraft,
  NodeImagePresetId,
  NodeImagePresetTechnical,
  NodeImageRenderMode,
  NodeImageStrokeWeight,
  NodeImageType
} from '../core/node-image-types';
import { NODE_IMAGE_PRESETS_KEY } from '../config/storage-config';
import {
  NODE_IMAGE_ASPECTS,
  NODE_IMAGE_FORMS,
  NODE_IMAGE_GRADIENT_USES,
  NODE_IMAGE_TRANSPARENCY_USES,
  NODE_IMAGE_BACKDROPS,
  NODE_IMAGE_COLOUR_MODES,
  NODE_IMAGE_DEPTHS,
  NODE_IMAGE_DETAIL_LEVELS,
  NODE_IMAGE_ENCLOSURES,
  NODE_IMAGE_PALETTE_SIZES,
  NODE_IMAGE_PERMISSIONS,
  NODE_IMAGE_PRESET_DEFAULTS,
  NODE_IMAGE_RENDER_MODES,
  NODE_IMAGE_STROKE_WEIGHTS,
  NODE_IMAGE_TYPES,
  createNodeImagePresetId,
  createStarterNodeImagePresets,
  type NodeImageOption
} from '../config/node-image-preset-definitions';

// ============================================================================
// TYPES
// ============================================================================

/** The whole stored record: the collection plus which preset is preselected. */
interface StoredNodeImagePresets {
  presets: NodeImagePreset[];
  defaultPresetId: NodeImagePresetId | null;
}

/** Why a deletion did or did not happen. The UI reports the refusal. */
export type NodeImagePresetDeletion = 'deleted' | 'refused-last' | 'not-found';

// ============================================================================
// READING
// ============================================================================

/** Every preset, in stored order. */
export function listNodeImagePresets(): NodeImagePreset[] {
  return read().presets;
}

export function getNodeImagePreset(id: NodeImagePresetId): NodeImagePreset | undefined {
  return read().presets.find(preset => preset.id === id);
}

/**
 * The preset the generation dialog opens on.
 *
 * Undefined only when the collection is genuinely empty — which the delete
 * guard prevents, but an imported workspace can still produce.
 */
export function getDefaultNodeImagePreset(): NodeImagePreset | undefined {
  const stored = read();
  const preferred = stored.presets.find(preset => preset.id === stored.defaultPresetId);
  return preferred ?? stored.presets[0];
}

// ============================================================================
// WRITING
// ============================================================================

export function createNodeImagePreset(draft: NodeImagePresetDraft): NodeImagePreset {
  const now = new Date();
  const preset: NodeImagePreset = {
    ...draft,
    content: { ...draft.content },
    technical: { ...draft.technical },
    id: createNodeImagePresetId(),
    createdAt: now,
    updatedAt: now
  };

  const stored = read();
  write({
    presets: [...stored.presets, preset],
    defaultPresetId: stored.defaultPresetId ?? preset.id
  });
  return preset;
}

/** Applies a partial edit. Returns the updated record, or undefined if the id is gone. */
export function updateNodeImagePreset(
  id: NodeImagePresetId,
  changes: Partial<NodeImagePresetDraft>
): NodeImagePreset | undefined {
  const stored = read();
  const existing = stored.presets.find(preset => preset.id === id);
  if (!existing) return undefined;

  const updated: NodeImagePreset = {
    ...existing,
    ...changes,
    content: { ...existing.content, ...changes.content },
    technical: { ...existing.technical, ...changes.technical },
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date()
  };

  write({
    presets: stored.presets.map(preset => (preset.id === id ? updated : preset)),
    defaultPresetId: stored.defaultPresetId
  });
  return updated;
}

/**
 * Removes a preset, unless it is the last one.
 *
 * Deleting the current default hands the role to whatever remains first, so the
 * generation dialog always opens on something real.
 */
export function deleteNodeImagePreset(id: NodeImagePresetId): NodeImagePresetDeletion {
  const stored = read();
  if (!stored.presets.some(preset => preset.id === id)) return 'not-found';
  if (stored.presets.length <= 1) return 'refused-last';

  const remaining = stored.presets.filter(preset => preset.id !== id);
  write({
    presets: remaining,
    defaultPresetId: stored.defaultPresetId === id ? remaining[0].id : stored.defaultPresetId
  });
  return 'deleted';
}

/** Marks a preset as the one the generation dialog opens on. Unknown ids are ignored. */
export function setDefaultNodeImagePreset(id: NodeImagePresetId): void {
  const stored = read();
  if (!stored.presets.some(preset => preset.id === id)) return;
  write({ presets: stored.presets, defaultPresetId: id });
}

/**
 * Adds fresh copies of the starter presets.
 *
 * Additive by design: starters are seeds, so restoring them never overwrites an
 * edited copy and never resurrects a deleted one in place.
 */
export function restoreStarterNodeImagePresets(): NodeImagePreset[] {
  const stored = read();
  const restored = createStarterNodeImagePresets();
  write({
    presets: [...stored.presets, ...restored],
    defaultPresetId: stored.defaultPresetId ?? restored[0].id
  });
  return restored;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

function read(): StoredNodeImagePresets {
  const raw = localStorage.getItem(NODE_IMAGE_PRESETS_KEY);
  if (raw === null) return seed();

  try {
    return normalizeStored(JSON.parse(raw));
  } catch {
    // Unparseable: the record is unrecoverable, so treat it as a first run
    // rather than leaving the feature without a preset to generate from.
    return seed();
  }
}

function write(stored: StoredNodeImagePresets): void {
  localStorage.setItem(NODE_IMAGE_PRESETS_KEY, JSON.stringify(stored));
}

function seed(): StoredNodeImagePresets {
  const presets = createStarterNodeImagePresets();
  const stored: StoredNodeImagePresets = { presets, defaultPresetId: presets[0].id };
  write(stored);
  return stored;
}

// ============================================================================
// WORKSPACE TRANSFER
//
// Presets travel with the workspace as their own envelope member: they are a
// kind of setting, and follow the settings rules — carried in the file, and
// cleared by `clearAllData()` only when settings are.
// ============================================================================

/**
 * The whole stored record, for the workspace file.
 *
 * Deliberately `read()` rather than a raw localStorage peek, so a workspace
 * saved from a browser that has never opened the feature still carries the
 * starters instead of nothing at all.
 */
export function exportNodeImagePresets(): unknown {
  return read();
}

/**
 * Adopt an imported collection, replacing the local one.
 *
 * Absent means the file carried no presets — written before the feature, or a
 * legacy ZIP — and the local collection is left alone. An *empty* collection is
 * not the same thing: its author deleted theirs deliberately, and that is
 * imported as faithfully as any other content. The same distinction `read()`
 * draws between an absent key and an emptied one.
 */
export function importNodeImagePresets(value: unknown): void {
  if (!isRecord(value)) return;
  write(normalizeStored(value));
}

// ============================================================================
// NORMALISATION
// Stored JSON is untrusted: fields may be missing, of the wrong type, or hold a
// value this build no longer knows. Every one falls back to the vocabulary
// default rather than throwing.
// ============================================================================

function normalizeStored(value: unknown): StoredNodeImagePresets {
  const record = isRecord(value) ? value : {};
  const presets = Array.isArray(record.presets)
    ? record.presets.map(normalizePreset)
    : [];
  const defaultPresetId = typeof record.defaultPresetId === 'string'
    ? record.defaultPresetId
    : null;
  return { presets, defaultPresetId };
}

function normalizePreset(value: unknown): NodeImagePreset {
  const record = isRecord(value) ? value : {};
  const content = isRecord(record.content) ? record.content : {};
  const technical = isRecord(record.technical) ? record.technical : {};
  const colour = isRecord(record.colour) ? record.colour : {};
  const defaults = NODE_IMAGE_PRESET_DEFAULTS;

  return {
    id: typeof record.id === 'string' ? record.id : createNodeImagePresetId(),
    name: typeof record.name === 'string' && record.name.trim() ? record.name : 'Untitled',
    content: {
      imageType: pick<NodeImageType>(NODE_IMAGE_TYPES, content.imageType, defaults.content.imageType),
      form: pick<NodeImageForm>(NODE_IMAGE_FORMS, content.form, defaults.content.form),
      depth: pick<NodeImageDepth>(NODE_IMAGE_DEPTHS, content.depth, defaults.content.depth),
      enclosure: pick<NodeImageEnclosure>(NODE_IMAGE_ENCLOSURES, content.enclosure, defaults.content.enclosure),
      textAllowed: pick<NodeImagePermission>(NODE_IMAGE_PERMISSIONS, content.textAllowed, defaults.content.textAllowed)
    } satisfies NodeImagePresetContent,
    technical: {
      renderMode: pick<NodeImageRenderMode>(NODE_IMAGE_RENDER_MODES, technical.renderMode, defaults.technical.renderMode),
      strokeWeight: pick<NodeImageStrokeWeight>(NODE_IMAGE_STROKE_WEIGHTS, technical.strokeWeight, defaults.technical.strokeWeight),
      aspect: pick<NodeImageAspect>(NODE_IMAGE_ASPECTS, technical.aspect, defaults.technical.aspect),
      detailLevel: pick<NodeImageDetailLevel>(NODE_IMAGE_DETAIL_LEVELS, technical.detailLevel, defaults.technical.detailLevel),
      backdrop: pick<NodeImageBackdrop>(NODE_IMAGE_BACKDROPS, technical.backdrop, defaults.technical.backdrop),
      gradientsAllowed: pick<NodeImagePermission>(NODE_IMAGE_GRADIENT_USES, technical.gradientsAllowed, defaults.technical.gradientsAllowed),
      transparencyAllowed: pick<NodeImagePermission>(NODE_IMAGE_TRANSPARENCY_USES, technical.transparencyAllowed, defaults.technical.transparencyAllowed)
    } satisfies NodeImagePresetTechnical,
    colour: {
      colourMode: pick<NodeImageColourMode>(NODE_IMAGE_COLOUR_MODES, colour.colourMode, defaults.colour.colourMode),
      // `technical.paletteSize` is where this lived before colour became its own
      // group, so a record written then keeps its choice instead of silently
      // reverting to unspecified.
      paletteSize: pick<NodeImagePaletteSize>(
        NODE_IMAGE_PALETTE_SIZES,
        colour.paletteSize ?? technical.paletteSize,
        defaults.colour.paletteSize
      )
    } satisfies NodeImagePresetColour,
    // `styleDirection` was this field's name before it was relabelled, so a
    // record written then keeps its prose.
    extraInstructions: typeof record.extraInstructions === 'string'
      ? record.extraInstructions
      : typeof record.styleDirection === 'string' ? record.styleDirection : '',
    createdAt: pickDate(record.createdAt),
    updatedAt: pickDate(record.updatedAt)
  };
}

/**
 * Rejects anything not in the option list, which is also the migration path: a
 * record written when these four fields were booleans has `false` here, `false`
 * is not an option, and it normalises to `unspecified` rather than silently
 * becoming an instruction to forbid.
 */
function pick<T>(options: NodeImageOption<T>[], value: unknown, fallback: T): T {
  return options.some(option => option.value === value) ? value as T : fallback;
}

function pickDate(value: unknown): Date {
  if (typeof value !== 'string' && typeof value !== 'number') return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
