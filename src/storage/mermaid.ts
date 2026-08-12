import type { Edge, EdgeType, Node } from '../core/main-types';

import { AppStateManager } from './app-state';
import { exportWorkspace } from './workspace';
import { hasMeaningfulWorkspaceData } from './workspace/dialogs';
import { clearAllData, exportGraphData, importGraphData, importConversations } from './workspace/transfer';
import { buildMermaidMarkdown, parseMermaidFlowchart } from './mermaid/flowchart';
import { showMermaidImportSelectionDialog } from './mermaid/import-dialog';
import { createImportedGraph } from './mermaid/import-builder';

interface MermaidImportOptions {
  exportFirst: boolean;
}

export async function exportMermaidGraph(): Promise<void> {
  const graph = await exportGraphData();
  const nodes = graph.nodes.filter(isNode);
  const edges = graph.edges.filter(isEdge);
  const edgeTypes = (graph.edgeTypes ?? []).filter(isEdgeType);

  if (nodes.length === 0) {
    alert('There are no nodes to export.');
    return;
  }

  const markdown = buildMermaidMarkdown(nodes, edges, edgeTypes);
  const dateStamp = new Date().toISOString().split('T')[0];
  downloadText(markdown, `knogra-mermaid-${dateStamp}.md`);
}

export async function showImportMermaidDialog(): Promise<void> {
  const hasExistingData = await hasMeaningfulWorkspaceData();
  const options = await confirmMermaidImport(hasExistingData);
  if (!options) return;

  if (options.exportFirst) {
    await exportWorkspace();
  }

  const file = await pickMermaidFile();
  if (!file) return;

  try {
    const source = await file.text();
    const parsed = parseMermaidFlowchart(source);
    const selection = await showMermaidImportSelectionDialog(parsed);
    if (!selection) return;
    const imported = createImportedGraph(parsed, selection);

    await clearAllData(true);
    AppStateManager.clearAppState();
    await importGraphData({ nodes: imported.nodes, edges: imported.edges, edgeTypes: imported.edgeTypes, scenes: imported.scenes }, []);
    await importConversations(imported.conversations);
    AppStateManager.saveLastSceneId(imported.sceneId);
    AppStateManager.requestFitOnNextOpen(imported.sceneId);
    window.location.reload();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Mermaid file could not be imported.';
    alert(`Failed to import Mermaid flowchart. ${message}`);
  }
}

function confirmMermaidImport(hasExistingData: boolean): Promise<MermaidImportOptions | null> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:absolute;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;max-width:420px;color:#e6edf3;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.5);';

    const cyContainer = document.getElementById('cy');
    const rect = cyContainer?.getBoundingClientRect();
    if (rect) {
      dialog.style.left = `${rect.left + rect.width / 2}px`;
      dialog.style.top = `${rect.top + rect.height / 2}px`;
      dialog.style.transform = 'translate(-50%, -50%)';
    } else {
      dialog.style.left = '50%';
      dialog.style.top = '50%';
      dialog.style.transform = 'translate(-50%, -50%)';
    }
    dialog.innerHTML = `
      <h3 style="margin:0 0 12px; font-size:16px; font-weight:600;">Import Mermaid Flowchart</h3>
      <p style="margin:0 0 16px; color:#8b949e; line-height:1.5;">
        This will replace your current workspace graph with nodes and edges from a Mermaid flowchart.
        ${hasExistingData ? 'Your current workspace will be lost unless you export it first.' : 'Continue?'}
      </p>
      ${hasExistingData ? `
      <label style="display:flex; align-items:center; gap:8px; margin-bottom:20px; cursor:pointer;">
        <input type="checkbox" id="mi-export" style="accent-color:#58a6ff;">
        Save current workspace to a file first (recommended)
      </label>` : ''}
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="mi-cancel" style="padding:6px 16px; border-radius:6px; border:1px solid #30363d;
          background:none; color:#c9d1d9; cursor:pointer; font-size:13px;">Cancel</button>
        <button id="mi-ok" style="padding:6px 16px; border-radius:6px; border:none;
          background:#58a6ff; color:#fff; cursor:pointer; font-size:13px; font-weight:600;">Choose File</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = (value: MermaidImportOptions | null): void => {
      overlay.remove();
      resolve(value);
    };

    dialog.querySelector('#mi-cancel')?.addEventListener('click', () => close(null));
    dialog.querySelector('#mi-ok')?.addEventListener('click', () => {
      const checkbox = dialog.querySelector('#mi-export') as HTMLInputElement | null;
      close({ exportFirst: hasExistingData ? checkbox?.checked ?? false : false });
    });
  });
}

function pickMermaidFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    Object.assign(input, { type: 'file', accept: '.md,.mmd,.txt,text/markdown,text/plain' });
    input.onchange = (): void => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  Object.assign(link, { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function isNode(value: unknown): value is Node { const node = value as Partial<Node>; return typeof node.id === 'string' && typeof node.title === 'string'; }
function isEdge(value: unknown): value is Edge { const edge = value as Partial<Edge>; return typeof edge.id === 'string' && typeof edge.sourceId === 'string' && typeof edge.targetId === 'string' && typeof edge.title === 'string'; }
function isEdgeType(value: unknown): value is EdgeType { const edgeType = value as Partial<EdgeType>; return typeof edgeType.id === 'string' && typeof edgeType.name === 'string'; }
