/**
 * Prompts
 *
 * Where the text a model reads comes from. Every sentence lives in the Markdown
 * files under prompts/; this module renders them with values the caller
 * supplies, and defines the quick-action table the chat panel shows.
 *
 * The renderer knows four constructs and nothing about graphs, scenes or chat:
 *
 *   {{name}}                      a value: string or number
 *   {{#if name}} ... {{/if}}      kept when the value is truthy — a non-empty
 *                                 string, a non-zero number, true, a non-empty
 *                                 list. Blocks nest.
 *   {{#each name}} ... {{/each}}  repeated once per record in a list, with the
 *                                 record's fields available inside. Does not nest.
 *   {{> name}}                    the file name.md, rendered in place with the
 *                                 same data
 *
 * A data record declares every placeholder its file may use, present even when
 * empty. That is what makes a typo detectable: a key the record does not have is
 * a misspelling in the file or in the code, never an empty value. Dev builds
 * throw on it and on any `{{...}}` left after rendering; production warns and
 * carries on, because a prompt with one bad line is better than no chat.
 *
 * Every .md in prompts/ is available by file name, so adding a file and
 * including it from a parent needs no code.
 */

import type { EdgeTypeConstraint } from './types';
import { getSetting } from '../config';

// ============================================================================
// TEMPLATE DATA
// ============================================================================

export type TemplateScalar = string | number | boolean | undefined;
export type TemplateValue = TemplateScalar | TemplateRecord[];
export type TemplateRecord = Record<string, TemplateValue>;

/** One line under Relationship Types. */
export type RelationshipTypeLine = {
  name: string;
  description: string | undefined;
  forwardLabel: string;
  inverseLabel: string | undefined;
};

/**
 * Everything system-prompt.md and workspace.md can name. Lists arrive already
 * rendered one line each; the file owns the sentences around them. Empty strings
 * and zero counts drop their blocks.
 */
export type SystemPromptData = {
  centralTitle: string;
  centralTags: string | undefined;
  centralComment: string | undefined;
  centralEquation: string | undefined;
  centralProperties: string | undefined;
  relationshipTypes: RelationshipTypeLine[];
  sceneDescription: string | undefined;
  sceneContextStrength: string;
  sceneNodes: string;
  sceneEdges: string;
  hiddenEdges: string;
  selectedNodes: string;
  outsideConnections: string;
  remainingNodes: string;
  omittedNodeCount: number;
  shelf: boolean;
  sceneShelf: string;
  otherShelf: string;
  omittedShelfCount: number;
  language: string;
  customInstructions: string;
};

export function renderSystemPrompt(data: SystemPromptData): string {
  return renderPrompt('system-prompt', data);
}

// ============================================================================
// QUICK ACTIONS
// ============================================================================

export type QuickActionId = 'scene' | 'node' | 'suggest' | 'connect' | 'clear';

/** The four that send a message; each has a file of the same name under prompts/. */
export type PromptQuickActionId = Exclude<QuickActionId, 'clear'>;
export type SlottableQuickActionId = 'suggest' | 'connect';

export interface QuickAction {
  id: QuickActionId;
  /** Button text. */
  label: string;
  /** What the timeline shows in place of the message text. Never sent to the model. */
  displayText?: string;
}

export interface ResolvedQuickActionMessage {
  prompt: string;
  displayText?: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'scene', label: 'Scene', displayText: 'Discuss the current scene.' },
  { id: 'node', label: 'Node', displayText: 'Explain the selected node(s).' },
  { id: 'suggest', label: 'Suggest', displayText: 'Suggest new concepts to add to my knowledge graph.' },
  { id: 'connect', label: 'Connect', displayText: 'Find existing concepts that belong in this scene.' },
  { id: 'clear', label: 'Clear' }
];

type QuickActionInstructionSettingKey =
  | 'ai.scenePromptInstructions'
  | 'ai.nodePromptInstructions'
  | 'ai.suggestPromptInstructions'
  | 'ai.connectPromptInstructions';

const QUICK_ACTION_INSTRUCTION_SETTINGS: Record<PromptQuickActionId, QuickActionInstructionSettingKey> = {
  scene: 'ai.scenePromptInstructions',
  node: 'ai.nodePromptInstructions',
  suggest: 'ai.suggestPromptInstructions',
  connect: 'ai.connectPromptInstructions'
};

export function isSlottableQuickActionId(id: QuickActionId): id is SlottableQuickActionId {
  return id === 'suggest' || id === 'connect';
}

function isPromptQuickActionId(id: QuickActionId): id is PromptQuickActionId {
  return id in QUICK_ACTION_INSTRUCTION_SETTINGS;
}

/**
 * The message a quick action sends: its file, rendered with the shortcut's
 * additional instructions and, for Suggest and Connect, the relationship the
 * user chose. Scene and Node ignore the constraint; their files never name it.
 */
export function resolveQuickActionMessage(
  action: QuickAction,
  constraint: EdgeTypeConstraint
): ResolvedQuickActionMessage {
  if (!isPromptQuickActionId(action.id)) {
    throw new Error(`Quick action "${action.id}" sends no message`);
  }

  const shortcutInstructions = getQuickActionInstructions(action.id);
  const data = isSlottableQuickActionId(action.id)
    ? { ...constraint, shortcutInstructions }
    : { shortcutInstructions };

  return { prompt: renderPrompt(action.id, data), displayText: action.displayText };
}

function getQuickActionInstructions(id: PromptQuickActionId): string {
  const value = getSetting(QUICK_ACTION_INSTRUCTION_SETTINGS[id]);
  return typeof value === 'string' ? value.trim() : '';
}

// ============================================================================
// RENDERER
// ============================================================================

/** File name without extension → file text, for every .md under prompts/. */
const files: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('./prompts/*.md', { query: '?raw', import: 'default', eager: true }))
    .map(([path, text]) => [path.replace(/^\.\/prompts\//, '').replace(/\.md$/, ''), text])
);

/** Deeper than any sane hierarchy; exists to turn a self-include into an error. */
const MAX_INCLUDE_DEPTH = 8;

export function renderPrompt(name: string, data: TemplateRecord): string {
  return tidy(render(source(name), data, name));
}

/**
 * Four passes, in an order that keeps each one simple. Includes go first so the
 * later passes see one flat text. Each goes before if, because an each body is
 * rendered on its own with the item's data, and an if inside it must read the
 * item, not the parent. Ifs are resolved innermost-first, which is what lets
 * them nest without a parser. Values last, once every block has decided
 * whether it exists.
 */
function render(template: string, data: TemplateRecord, file: string): string {
  let text = expandIncludes(template, file);
  text = expandEach(text, data, file);
  text = expandIfs(text, data, file);
  text = expandValues(text, data, file);
  assertResolved(text, file);
  return text;
}

const INCLUDE = /\{\{>\s*([\w-]+)\s*\}\}/g;

function expandIncludes(template: string, file: string): string {
  let text = template;
  for (let depth = 0; text.includes('{{>'); depth++) {
    if (depth >= MAX_INCLUDE_DEPTH) {
      throw new Error(`[prompts] Include depth exceeded under "${file}.md" — a file includes itself, or an include is malformed`);
    }
    text = text.replace(INCLUDE, (_, name: string) => source(name));
  }
  return text;
}

const EACH = /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

function expandEach(template: string, data: TemplateRecord, file: string): string {
  return template.replace(EACH, (_, key: string, rawBody: string) => {
    const list = lookup(key, data, file);
    if (list === undefined || list === '') return '';
    if (!Array.isArray(list)) {
      throw new Error(`[prompts] "{{#each ${key}}}" in "${file}.md" needs a list, got ${typeof list}`);
    }

    // The body is written on its own lines; strip the newlines the markers
    // leave, or every item arrives with a blank line after it.
    const body = rawBody.replace(/^\n/, '').replace(/\n$/, '');
    return list.map(item => render(body, { ...data, ...item }, file)).join('\n');
  });
}

/**
 * An if whose body contains no other if — the tempered pattern refuses to run
 * past a nested opener. Resolving these repeatedly resolves the whole tree from
 * the inside out.
 */
const INNERMOST_IF = /\{\{#if (\w+)\}\}((?:(?!\{\{#if )[\s\S])*?)\{\{\/if\}\}/;

function expandIfs(template: string, data: TemplateRecord, file: string): string {
  let text = template;
  let match: RegExpExecArray | null;
  while ((match = INNERMOST_IF.exec(text)) !== null) {
    const [whole, key, body] = match;
    const kept = isTruthy(lookup(key, data, file)) ? body : '';
    text = text.slice(0, match.index) + kept + text.slice(match.index + whole.length);
  }
  return text;
}

const VALUE = /\{\{(\w+)\}\}/g;

function expandValues(template: string, data: TemplateRecord, file: string): string {
  return template.replace(VALUE, (_, key: string) => {
    const value = lookup(key, data, file);
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  });
}

function source(name: string): string {
  const text = files[name];
  if (text === undefined) throw new Error(`[prompts] No template file "${name}.md"`);
  return text;
}

function lookup(key: string, data: TemplateRecord, file: string): TemplateValue {
  if (!(key in data)) {
    problem(`[prompts] Unknown placeholder "{{${key}}}" in or under "${file}.md" — not a key of its data record`);
    return undefined;
  }
  return data[key];
}

function isTruthy(value: TemplateValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'number') return value !== 0;
  return value === true;
}

function assertResolved(text: string, file: string): void {
  const leftover = text.match(/\{\{[^}]*\}\}/);
  if (leftover) problem(`[prompts] Unresolved "${leftover[0]}" in or under "${file}.md"`);
}

/** Loud in development, survivable in production. */
function problem(message: string): void {
  if (import.meta.env.DEV) throw new Error(message);
  console.warn(message);
}

/** Removed blocks leave their line breaks behind; the files rely on this collapse. */
function tidy(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
