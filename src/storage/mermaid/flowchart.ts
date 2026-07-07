import type { Edge, EdgeType, Node, NodeId } from '../../core/main-types';

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

export interface ParsedMermaidGraph {
  nodes: ParsedMermaidNode[];
  edges: ParsedMermaidEdge[];
  equationsByMermaidId: Map<string, string>;
  tagsByMermaidId: Map<string, string[]>;
  notesByMermaidId: Map<string, string>;
}

interface NodeSpec {
  mermaidId: string;
  title?: string;
}

export function buildMermaidMarkdown(nodes: Node[], edges: Edge[], edgeTypes: EdgeType[] = []): string {
  const validNodes = nodes.filter(node => typeof node.id === 'string');
  const nodeIds = new Set(validNodes.map(node => node.id));
  const mermaidIds = new Map<NodeId, string>();
  const edgeTypeNames = new Map(edgeTypes.map(edgeType => [edgeType.id, edgeType.name]));

  validNodes.forEach((node, index) => {
    mermaidIds.set(node.id, `N${index + 1}`);
  });

  const lines = [
    '# Knogra Mermaid Export',
    '',
    '```mermaid',
    'flowchart LR',
  ];

  for (const node of validNodes) {
    const mermaidId = mermaidIds.get(node.id);
    if (!mermaidId) continue;
    const title = node.title.trim() || node.id;
    lines.push(`  ${mermaidId}["${escapeMermaidString(title)}"]`);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) continue;
    const sourceId = mermaidIds.get(edge.sourceId);
    const targetId = mermaidIds.get(edge.targetId);
    if (!sourceId || !targetId) continue;

    const edgeTypeName = edgeTypeNames.get(edge.typeId)?.trim() || 'related';
    lines.push(`  ${sourceId} -->|${escapeEdgeLabel(edgeTypeName)}| ${targetId}`);
  }

  lines.push('```', '');
  return lines.join('\n');
}

export function parseMermaidFlowchart(source: string): ParsedMermaidGraph {
  const body = removeKnograMetadataSections(extractMermaidBody(source));
  const lines = normalizeMermaidLines(body);
  const equationsByMermaidId = parseKnograEquationSection(source);
  const tagsByMermaidId = parseKnograTagsSection(source);
  const notesByMermaidId = parseKnograNotesSection(source);

  const headerIndex = lines.findIndex(line => /^(flowchart|graph)\s+/i.test(line));
  if (headerIndex < 0) {
    throw new Error('Only Mermaid graph/flowchart diagrams are supported.');
  }

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
        order: edges.length,
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

  if (nodes.size === 0) {
    throw new Error('No nodes found in Mermaid flowchart.');
  }

  return { nodes: [...nodes.values()], edges, equationsByMermaidId, tagsByMermaidId, notesByMermaidId };
}

function extractMermaidBody(source: string): string {
  const fenced = source.match(/```mermaid\s*([\s\S]*?)```/i);
  return fenced?.[1] ?? source;
}

const KNOGRA_EQUATION_HEADING = /^#{1,6}\s+Knogra equations\s*$/i;
const KNOGRA_TAGS_HEADING = /^#{1,6}\s+Knogra tags\s*$/i;
const KNOGRA_NOTES_HEADING = /^#{1,6}\s+Knogra notes\s*$/i;
const KNOGRA_METADATA_HEADING = /^#{1,6}\s+Knogra (equations|tags|notes)\s*$/i;
const KNOGRA_NOTE_END = '</note>';

function parseKnograEquationSection(source: string): Map<string, string> {
  const equations = new Map<string, string>();
  const section = extractKnograSection(source, KNOGRA_EQUATION_HEADING);
  if (!section) return equations;

  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*`([^`]*)`\s*$/);
    if (!match) continue;

    const equation = match[2].trim();
    if (equation) equations.set(match[1], equation);
  }

  return equations;
}

function parseKnograTagsSection(source: string): Map<string, string[]> {
  const tagsByMermaidId = new Map<string, string[]>();
  const section = extractKnograSection(source, KNOGRA_TAGS_HEADING);
  if (!section) return tagsByMermaidId;

  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!match) continue;

    const tags = match[2]
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
    if (tags.length > 0) tagsByMermaidId.set(match[1], [...new Set(tags)]);
  }

  return tagsByMermaidId;
}

/**
 * Parse the `Knogra notes` section into per-node multiline note text.
 *
 * Each note starts with `<mermaidId>:` (optionally with inline text on the
 * same line) and runs until a `</note>` marker, which may sit inline at the
 * end of a content line or alone on its own line. Bodies are preserved
 * verbatim (indentation, blank lines, markdown, colons) with only outer blank
 * lines trimmed. A note left open at section end is captured leniently. Last
 * note wins on duplicate ids.
 */
function parseKnograNotesSection(source: string): Map<string, string> {
  const notes = new Map<string, string>();
  const sectionLines = extractKnograNotesSection(source);
  if (sectionLines.length === 0) return notes;

  let currentId: string | null = null;
  let bodyLines: string[] = [];

  const flush = (): void => {
    if (currentId === null) return;
    const content = trimOuterBlankLines(bodyLines).join('\n');
    if (content.length > 0) notes.set(currentId, content);
    currentId = null;
    bodyLines = [];
  };

  for (const rawLine of sectionLines) {
    // Opening a note consumes the `<id>:` prefix; the remainder of that line
    // is the note's first line of content.
    let text = rawLine;
    if (currentId === null) {
      const startMatch = rawLine.trim().match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!startMatch) continue;
      currentId = startMatch[1];
      bodyLines = [];
      text = startMatch[2];
    }

    // The end marker may sit inline at the end of a content line or alone on
    // its own line. Content before it (if any) is kept; the note then closes.
    const endIndex = text.indexOf(KNOGRA_NOTE_END);
    if (endIndex >= 0) {
      const before = text.slice(0, endIndex);
      if (before.trim().length > 0) bodyLines.push(before);
      flush();
      continue;
    }

    bodyLines.push(text);
  }

  // Lenient close: a note left open at section end is still captured.
  flush();

  return notes;
}

/**
 * Extract the raw lines of the `Knogra notes` section. Unlike equation/tag
 * sections, this runs until the next Knogra metadata heading (or EOF) rather
 * than the next arbitrary heading, so prose notes may contain `#` markdown
 * headings without truncating the section.
 */
function extractKnograNotesSection(source: string): string[] {
  const lines = source.split(/\r?\n/);
  const startIndex = lines.findIndex(line => KNOGRA_NOTES_HEADING.test(line.trim()));
  if (startIndex < 0) return [];

  const sectionLines: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index++) {
    if (KNOGRA_METADATA_HEADING.test(lines[index].trim())) break;
    sectionLines.push(lines[index]);
  }
  return sectionLines;
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim().length === 0) start += 1;
  while (end > start && lines[end - 1].trim().length === 0) end -= 1;
  return lines.slice(start, end);
}

function extractKnograSection(source: string, heading: RegExp): string {
  const lines = source.split(/\r?\n/);
  const startIndex = lines.findIndex(line => heading.test(line.trim()));
  if (startIndex < 0) return '';

  const sectionLines: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index++) {
    if (/^#{1,6}\s+/.test(lines[index].trim())) break;
    sectionLines.push(lines[index]);
  }

  return sectionLines.join('\n');
}

function removeKnograMetadataSections(source: string): string {
  const lines = source.split(/\r?\n/);
  const result: string[] = [];
  let inMetadataSection = false;

  // A Knogra metadata section runs until the next Knogra metadata heading or
  // EOF. Arbitrary (non-Knogra) headings do not close it, so prose in the
  // notes section may contain `#` markdown headings without leaking into the
  // mermaid body. By convention these sections are appended after the diagram.
  for (const line of lines) {
    if (KNOGRA_METADATA_HEADING.test(line.trim())) {
      inMetadataSection = true;
      continue;
    }

    if (!inMetadataSection) result.push(line);
  }

  return result.join('\n');
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
      title: unquoteLabel(pipeLabel[2].trim()),
    };
  }

  const inlineLabel = line.match(/^(.+?)\s*--\s*(.*?)\s*-->\s*(.+)$/);
  if (inlineLabel) {
    return {
      source: parseNodeSpec(inlineLabel[1].trim()) ?? parseBareNode(inlineLabel[1].trim()),
      target: parseNodeSpec(inlineLabel[3].trim()) ?? parseBareNode(inlineLabel[3].trim()),
      title: unquoteLabel(inlineLabel[2].trim()),
    };
  }

  const plain = line.match(/^(.+?)\s*-->\s*(.+)$/);
  if (plain) {
    return {
      source: parseNodeSpec(plain[1].trim()) ?? parseBareNode(plain[1].trim()),
      target: parseNodeSpec(plain[2].trim()) ?? parseBareNode(plain[2].trim()),
      title: '',
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