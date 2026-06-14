import type { Edge, Node, NodeId } from '../../core/main-types';

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
}

interface NodeSpec {
  mermaidId: string;
  title?: string;
}

export function buildMermaidMarkdown(nodes: Node[], edges: Edge[]): string {
  const validNodes = nodes.filter(node => typeof node.id === 'string');
  const nodeIds = new Set(validNodes.map(node => node.id));
  const mermaidIds = new Map<NodeId, string>();

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

    const title = edge.title.trim();
    if (title.length > 0) {
      lines.push(`  ${sourceId} -->|${escapeEdgeLabel(title)}| ${targetId}`);
    } else {
      lines.push(`  ${sourceId} --> ${targetId}`);
    }
  }

  lines.push('```', '');
  return lines.join('\n');
}

export function parseMermaidFlowchart(source: string): ParsedMermaidGraph {
  const body = extractMermaidBody(source);
  const lines = normalizeMermaidLines(body);

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

  return { nodes: [...nodes.values()], edges };
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
  if (bracket) return { mermaidId: bracket[1], title: unquoteLabel(bracket[2].trim()) };

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

function escapeMermaidString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

function escapeEdgeLabel(value: string): string {
  return value.replace(/\|/g, '/').replace(/\r?\n/g, ' ');
}