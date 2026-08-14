/**
 * Knogra document — Mermaid diagram
 *
 * Parses and serializes the flowchart block of a Markdown document. Pure — no
 * section knowledge beyond stripping them, no IO.
 *
 * The diagram is optional (§4.3): a document carrying only content sections
 * parses to zero nodes and edges. Deciding whether that is acceptable belongs
 * to the operation — Build refuses it, Update ignores the diagram entirely.
 */

import type { Edge, EdgeType, Node, NodeId } from '../../../core/main-types';
import { stripKnograSections } from './sections';

export interface ParsedMermaidNode {
  mermaidId: string;
  title: string;
  order: number;
}

export interface ParsedMermaidEdge {
  sourceMermaidId: string;
  targetMermaidId: string;
  title: string;
  order: number;
}

export interface ParsedDiagram {
  nodes: ParsedMermaidNode[];
  edges: ParsedMermaidEdge[];
}

interface NodeSpec {
  mermaidId: string;
  title?: string;
}

/**
 * Parse the flowchart, if there is one. Absence is not an error — no fence, no
 * `flowchart` / `graph` header, or no nodes all yield an empty diagram.
 * Malformed content still throws: a corrupt file must be reported, not
 * silently half-read.
 */
export function parseDiagram(source: string): ParsedDiagram {
  const body = stripKnograSections(extractMermaidBody(source));
  const lines = normalizeMermaidLines(body);

  const headerIndex = lines.findIndex(line => /^(flowchart|graph)\s+/i.test(line));
  if (headerIndex < 0) return { nodes: [], edges: [] };

  const nodes = new Map<string, ParsedMermaidNode>();
  const edges: ParsedMermaidEdge[] = [];
  let order = 0;

  const ensureNode = (spec: NodeSpec): void => {
    const existing = nodes.get(spec.mermaidId);
    const title = spec.title?.trim() || spec.mermaidId;
    if (!existing) {
      nodes.set(spec.mermaidId, { mermaidId: spec.mermaidId, title, order: order++ });
      return;
    }
    if (existing.title === existing.mermaidId && title !== spec.mermaidId) {
      nodes.set(spec.mermaidId, { ...existing, title });
    }
  };

  for (let index = headerIndex + 1; index < lines.length; index++) {
    const line = stripTrailingSemicolon(lines[index]);
    if (isIgnoredMetadataLine(line)) continue;

    const edge = parseEdgeLine(line);
    if (edge) {
      ensureNode(edge.source);
      ensureNode(edge.target);
      edges.push({
        sourceMermaidId: edge.source.mermaidId,
        targetMermaidId: edge.target.mermaidId,
        title: edge.title,
        order: edges.length
      });
      continue;
    }

    const node = parseNodeSpec(line);
    if (node) {
      ensureNode(node);
      continue;
    }

    throw new Error(`Could not parse Mermaid line: ${line}`);
  }

  return { nodes: [...nodes.values()], edges };
}

/**
 * Write the fenced flowchart using **real `NodeId`s** as diagram ids, not the
 * positional `N1…Nn` of the old Mermaid export. Knogra ids already satisfy the
 * identifier grammar, so every exported document is self-identifying and can be
 * matched back exactly (§5.8).
 */
export function serializeDiagram(nodes: Node[], edges: Edge[], edgeTypes: EdgeType[]): string {
  const nodeIds = new Set<NodeId>(nodes.map(node => node.id));
  const edgeTypeNames = new Map(edgeTypes.map(edgeType => [edgeType.id, edgeType.name]));

  const lines = ['```mermaid', 'flowchart LR'];

  for (const node of nodes) {
    const title = node.title.trim() || node.id;
    lines.push(`  ${node.id}["${escapeMermaidString(title)}"]`);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) continue;
    const edgeTypeName = edgeTypeNames.get(edge.typeId)?.trim() || 'related';
    lines.push(`  ${edge.sourceId} -->|${escapeEdgeLabel(edgeTypeName)}| ${edge.targetId}`);
  }

  lines.push('```', '');
  return lines.join('\n');
}

function extractMermaidBody(source: string): string {
  const fenced = source.match(/```mermaid\s*([\s\S]*?)```/i);
  return fenced?.[1] ?? source;
}

function stripTrailingSemicolon(line: string): string {
  return line.endsWith(';') ? line.slice(0, -1).trim() : line;
}

function normalizeMermaidLines(body: string): string[] {
  const result: string[] = [];
  let inFrontmatter = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '---') { inFrontmatter = !inFrontmatter; continue; }
    if (inFrontmatter || line.length === 0 || isIgnoredMetadataLine(line)) continue;
    result.push(line);
  }
  return result;
}

function isIgnoredMetadataLine(line: string): boolean {
  return /^(%%|title:|accTitle:|accDescr:|subgraph\b|end\b|classDef\b|class\b|style\b|linkStyle\b|click\b)/i.test(line);
}

function parseEdgeLine(line: string): { source: NodeSpec; target: NodeSpec; title: string } | null {
  const pipeLabel = line.match(/^(.+?)\s*-->\|([^|]*)\|\s*(.+)$/);
  if (pipeLabel) {
    return {
      source: parseNodeSpec(pipeLabel[1].trim()) ?? parseBareNode(pipeLabel[1].trim()),
      target: parseNodeSpec(pipeLabel[3].trim()) ?? parseBareNode(pipeLabel[3].trim()),
      title: unquoteLabel(pipeLabel[2].trim())
    };
  }

  const inlineLabel = line.match(/^(.+?)\s*--\s*(.*?)\s*-->\s*(.+)$/);
  if (inlineLabel) {
    return {
      source: parseNodeSpec(inlineLabel[1].trim()) ?? parseBareNode(inlineLabel[1].trim()),
      target: parseNodeSpec(inlineLabel[3].trim()) ?? parseBareNode(inlineLabel[3].trim()),
      title: unquoteLabel(inlineLabel[2].trim())
    };
  }

  const plain = line.match(/^(.+?)\s*-->\s*(.+)$/);
  if (plain) {
    return {
      source: parseNodeSpec(plain[1].trim()) ?? parseBareNode(plain[1].trim()),
      target: parseNodeSpec(plain[2].trim()) ?? parseBareNode(plain[2].trim()),
      title: ''
    };
  }

  return null;
}

function parseNodeSpec(text: string): NodeSpec | null {
  const bracket = text.match(/^([A-Za-z0-9_-]+)\s*\[\s*(.+?)\s*\]$/);
  if (bracket) return { mermaidId: bracket[1], title: unquoteNodeTitle(bracket[2].trim()) };

  const bare = text.match(/^[A-Za-z0-9_-]+$/);
  if (bare) return { mermaidId: text };

  return null;
}

function parseBareNode(text: string): NodeSpec {
  const parsed = parseNodeSpec(text);
  if (parsed) return parsed;
  throw new Error(`Invalid Mermaid node reference: ${text}`);
}

function unquoteLabel(label: string): string {
  const trimmed = label.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return trimmed;
}

function unquoteNodeTitle(label: string): string {
  return unquoteLabel(label).replace(/<br\s*\/?>/gi, '\n');
}

function escapeMermaidString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

function escapeEdgeLabel(value: string): string {
  return value.replace(/\|/g, '/').replace(/\r?\n/g, ' ');
}
