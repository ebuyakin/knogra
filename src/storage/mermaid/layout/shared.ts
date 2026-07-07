import type { ParsedMermaidNode } from '../flowchart';

export interface Position {
  x: number;
  y: number;
}

export interface EstimatedNodeFootprint {
  width: number;
  height: number;
}

const DEFAULT_NODE_ASPECT = 16 / 9;
const DEFAULT_NODE_FONT_SIZE = 14;
const DEFAULT_NODE_MIN_WIDTH = 100;
const DEFAULT_NODE_LINE_HEIGHT_FACTOR = 1.4;
const DEFAULT_NODE_CHAR_WIDTH_FACTOR = 0.6;
const DEFAULT_NODE_HORIZONTAL_PADDING = 28;
const DEFAULT_NODE_VERTICAL_PADDING = 18;
const DEFAULT_NODE_SHADOW_PADDING_ESTIMATE = 0;

export function estimateDefaultNodeFootprint(node: ParsedMermaidNode): EstimatedNodeFootprint {
  const title = node.title.trim() || node.mermaidId;
  const charWidth = DEFAULT_NODE_FONT_SIZE * DEFAULT_NODE_CHAR_WIDTH_FACTOR;
  const lineHeight = DEFAULT_NODE_FONT_SIZE * DEFAULT_NODE_LINE_HEIGHT_FACTOR;
  const textPixelWidth = title.length * charWidth;
  const optimalLineCount = Math.max(1, Math.round(Math.sqrt(textPixelWidth / (lineHeight * DEFAULT_NODE_ASPECT))));
  const candidateLineCounts = [optimalLineCount - 1, optimalLineCount, optimalLineCount + 1].filter(count => count >= 1);
  let bestLines: string[] = [title];
  let bestAspectDiff = Infinity;

  for (const lineCount of candidateLineCounts) {
    const targetLineWidth = textPixelWidth / lineCount;
    const lines = wordWrapTitle(title, targetLineWidth, DEFAULT_NODE_FONT_SIZE);
    const longestLine = Math.max(...lines.map(line => line.length));
    const contentWidth = Math.max(longestLine * charWidth, DEFAULT_NODE_MIN_WIDTH - DEFAULT_NODE_HORIZONTAL_PADDING * 2);
    const contentHeight = lines.length * lineHeight;
    const totalWidth = contentWidth + DEFAULT_NODE_HORIZONTAL_PADDING * 2;
    const totalHeight = contentHeight + DEFAULT_NODE_VERTICAL_PADDING * 2;
    const aspectDiff = Math.abs(totalWidth / totalHeight - DEFAULT_NODE_ASPECT);

    if (aspectDiff < bestAspectDiff) {
      bestAspectDiff = aspectDiff;
      bestLines = lines;
    }
  }

  const longestLine = Math.max(...bestLines.map(line => line.length));
  const contentWidth = Math.max(longestLine * charWidth, DEFAULT_NODE_MIN_WIDTH - DEFAULT_NODE_HORIZONTAL_PADDING * 2);
  const contentHeight = bestLines.length * lineHeight;

  return {
    width: contentWidth + DEFAULT_NODE_HORIZONTAL_PADDING * 2 + DEFAULT_NODE_SHADOW_PADDING_ESTIMATE,
    height: contentHeight + DEFAULT_NODE_VERTICAL_PADDING * 2 + DEFAULT_NODE_SHADOW_PADDING_ESTIMATE,
  };
}

function wordWrapTitle(title: string, targetWidthPx: number, fontSize: number): string[] {
  if (title.includes('\n')) return title.split('\n');

  const charWidth = fontSize * DEFAULT_NODE_CHAR_WIDTH_FACTOR;
  const maxCharsPerLine = Math.max(1, Math.floor(targetWidthPx / charWidth));
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length <= maxCharsPerLine || current === '') {
      current = test;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [title];
}
