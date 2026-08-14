/**
 * Knogra document — whole-document facade
 *
 * Owns the parsed document model and composes the two halves: an optional
 * Mermaid diagram and the `Knogra …` content sections. Pure — no IO, no store
 * access, no DOM.
 *
 * Canonical spec: `docs/markdown-architecture.md` §4.
 */

import type { Edge, EdgeType, Node } from '../../../core/main-types';
import {
  parseDiagram,
  serializeDiagram,
  type ParsedMermaidEdge,
  type ParsedMermaidNode
} from './diagram';
import {
  parseSections,
  serializeSections,
  type DocumentChatEntry,
  type DocumentNote
} from './sections';

export type { DocumentChatEntry, DocumentNote, ParsedMermaidEdge, ParsedMermaidNode };

/**
 * A parsed Knogra Markdown document.
 *
 * Every part is optional: a document with no diagram carries empty `nodes` and
 * `edges`, and one with no content sections carries empty collections. Which
 * combinations an operation accepts is the operation's decision, not the
 * parser's.
 */
export interface KnograDocument {
  nodes: ParsedMermaidNode[];
  edges: ParsedMermaidEdge[];
  equationsByMermaidId: Map<string, string>;
  tagsByMermaidId: Map<string, string[]>;
  commentsByMermaidId: Map<string, string>;
  /** `Knogra notes` — editable annotations, `source: 'note'`. */
  notes: DocumentNote[];
  /**
   * `Knogra articles` — locked, markdown-rendered prose, `source: 'tutorial'`.
   * The legacy `Knogra tutorial` heading feeds the same collection.
   */
  articles: DocumentNote[];
}

export function parseDocument(source: string): KnograDocument {
  const diagram = parseDiagram(source);
  const sections = parseSections(source);

  return {
    nodes: diagram.nodes,
    edges: diagram.edges,
    equationsByMermaidId: sections.equationsByMermaidId,
    tagsByMermaidId: sections.tagsByMermaidId,
    commentsByMermaidId: sections.commentsByMermaidId,
    notes: sections.notes,
    articles: sections.articles
  };
}

/**
 * Which parts to write. Equations, tags and comments come from the nodes.
 *
 * `diagram` is optional like the rest: a document carrying only equations or
 * only prose is a legitimate artefact, and on a large graph the flowchart can
 * dwarf the content the reader actually wants. A document without it cannot
 * build a graph, but Update reads node ids from the sections themselves.
 */
export interface DocumentExportSections {
  diagram: boolean;
  equations: boolean;
  tags: boolean;
  comments: boolean;
  notes: boolean;
  articles: boolean;
  aiChat: boolean;
}

export interface DocumentExportInput {
  title: string;
  nodes: Node[];
  edges: Edge[];
  edgeTypes: EdgeType[];
  /** Messages with `source: 'note'`, already resolved to their real ids. */
  notes: Array<{ nodeId: string; noteId: string; content: string }>;
  /** Messages with `source: 'tutorial'`. */
  articles: Array<{ nodeId: string; noteId: string; content: string }>;
  /** Everything else in the conversations — `ai` and legacy. */
  chat: DocumentChatEntry[];
  sections: DocumentExportSections;
}

export function serializeDocument(input: DocumentExportInput): string {
  const parts = [`# ${input.title}`, ''];

  if (input.sections.diagram) {
    parts.push(serializeDiagram(input.nodes, input.edges, input.edgeTypes));
  }

  const sections = serializeSections({
    equations: input.sections.equations ? collectProperty(input.nodes, 'equation') : [],
    tags: input.sections.tags ? collectTags(input.nodes) : [],
    comments: input.sections.comments ? collectProperty(input.nodes, 'comment') : [],
    notes: input.sections.notes ? input.notes : [],
    articles: input.sections.articles ? input.articles : [],
    chat: input.sections.aiChat ? input.chat : []
  });

  if (sections.length > 0) parts.push(sections);
  return parts.join('\n');
}

function collectProperty(nodes: Node[], key: 'equation' | 'comment'): Array<{ nodeId: string; value: string }> {
  const entries: Array<{ nodeId: string; value: string }> = [];
  for (const node of nodes) {
    const value = node.properties?.[key];
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    entries.push({ nodeId: node.id, value: value.trim() });
  }
  return entries;
}

function collectTags(nodes: Node[]): Array<{ nodeId: string; values: string[] }> {
  const entries: Array<{ nodeId: string; values: string[] }> = [];
  for (const node of nodes) {
    const tags = (node.tags ?? []).map(tag => tag.trim()).filter(tag => tag.length > 0);
    if (tags.length > 0) entries.push({ nodeId: node.id, values: tags });
  }
  return entries;
}
