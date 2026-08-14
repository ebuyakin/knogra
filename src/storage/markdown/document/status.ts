/**
 * Knogra document — per-section presence
 *
 * How much of each content section actually names a node in the same document.
 * Used by the Build dialog to label and disable its per-section checkboxes;
 * kept out of the dialog so the counting rule has one home and can be reused
 * by the Update dialog's preview. Pure.
 */

import type { KnograDocument } from './document';

export interface SectionStatus {
  total: number;
  matched: number;
  unmatched: number;
}

export function getEquationStatus(document: KnograDocument): SectionStatus {
  return countAgainstNodes(document, document.equationsByMermaidId.keys());
}

export function getTagStatus(document: KnograDocument): SectionStatus {
  return countAgainstNodes(document, document.tagsByMermaidId.keys());
}

export function getCommentStatus(document: KnograDocument): SectionStatus {
  return countAgainstNodes(document, document.commentsByMermaidId.keys());
}

/**
 * Notes and articles share one checkbox, so they share one count. Measured per
 * node, not per entry: several notes on one node are one annotated node, which
 * is what the checkbox label means.
 */
export function getNoteStatus(document: KnograDocument): SectionStatus {
  const annotatedIds = new Set<string>([
    ...document.notes.map(note => note.nodeId),
    ...document.articles.map(note => note.nodeId)
  ]);
  return countAgainstNodes(document, annotatedIds);
}

function countAgainstNodes(document: KnograDocument, ids: Iterable<string>): SectionStatus {
  const nodeIds = new Set(document.nodes.map(node => node.mermaidId));
  let total = 0;
  let matched = 0;

  for (const id of ids) {
    total += 1;
    if (nodeIds.has(id)) matched += 1;
  }

  return { total, matched, unmatched: total - matched };
}
