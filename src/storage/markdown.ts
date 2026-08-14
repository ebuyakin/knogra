import type { Edge, EdgeType, Node, NodeId } from '../core/main-types';
import type { ChatImageAttachment, Conversation } from '../core/chat-types';

import { AppStateManager } from './app-state';
import { isEditMode } from './app-mode';
import { chatStore } from './chat-store';
import { graphStore } from './graph-store';
import { exportWorkspace } from './workspace';
import { hasMeaningfulWorkspaceData } from './workspace/dialogs';
import { claimExportBaseName, clearAllData, exportGraphData, importGraphData, importConversations, resetFileNaming } from './workspace/transfer';
import {
  parseDocument,
  serializeDocument,
  type DocumentChatEntry
} from './markdown/document/document';
import { showBuildSelectionDialog } from './markdown/build/selection-dialog';
import { showExportSectionsDialog } from './markdown/export-dialog';
import { buildGraphFromDocument } from './markdown/build/builder';
import { planUpdate } from './markdown/update/plan';
import { applyUpdate } from './markdown/update/apply';
import { isEmptyPlan, showUpdateDialog } from './markdown/update/update-dialog';

interface BuildConfirmation {
  exportFirst: boolean;
}

export async function exportDocument(): Promise<void> {
  const graph = await exportGraphData();
  const nodes = graph.nodes.filter(isNode);
  const edges = graph.edges.filter(isEdge);
  const edgeTypes = (graph.edgeTypes ?? []).filter(isEdgeType);

  if (nodes.length === 0) {
    alert('There are no nodes to export.');
    return;
  }

  const { notes, articles, chat, omittedImages } = await collectConversationEntries();

  const sections = await showExportSectionsDialog(omittedImages);
  if (!sections) return;

  // The document's own heading, which is content rather than a file name: it
  // names the graph for a reader, and falls back to the date when there is no
  // anchor title to name it after.
  const anchorTitle = nodes.find(node => node.isAnchor)?.title.trim();
  const dateStamp = new Date().toISOString().split('T')[0];
  const markdown = serializeDocument({
    title: `Knogra Graph — ${anchorTitle || dateStamp}`,
    nodes,
    edges,
    edgeTypes,
    notes,
    articles,
    chat,
    sections
  });

  // Shares the workspace save's prefix and counter, so documents and workspace
  // backups of one graph interleave in export order in a folder listing.
  downloadText(markdown, `${await claimExportBaseName()}.md`);
}

/**
 * Split every stored conversation by `source`, never by `role`: a note is
 * written by the note editor as `role: 'user'`, so any rule phrased in terms of
 * role selects the wrong set (markdown-architecture §5.8).
 *
 * Three destinations, because the app stores three kinds of prose and two of
 * them round-trip: notes and articles each get their own section, while `ai`
 * and legacy messages go to the export-only chat section.
 */
async function collectConversationEntries(): Promise<{
  notes: Array<{ nodeId: string; noteId: string; content: string }>;
  articles: Array<{ nodeId: string; noteId: string; content: string }>;
  chat: DocumentChatEntry[];
  omittedImages: number;
}> {
  const notes: Array<{ nodeId: string; noteId: string; content: string }> = [];
  const articles: Array<{ nodeId: string; noteId: string; content: string }> = [];
  const chat: DocumentChatEntry[] = [];
  let omittedImages = 0;

  for (const nodeId of await chatStore.getNodesWithConversations()) {
    const conversation = await chatStore.getConversation(nodeId as NodeId);
    if (!conversation) continue;

    for (const message of conversation.messages) {
      if (!message.content.trim()) continue;

      const rendered = withImageLinks(message);
      omittedImages += rendered.omitted;
      const entry = { nodeId, noteId: message.id, content: rendered.content };

      if (message.source === 'note') {
        notes.push(entry);
      } else if (message.source === 'tutorial') {
        articles.push(entry);
      } else {
        chat.push({
          nodeId,
          messageId: message.id,
          role: message.role,
          content: rendered.content
        });
      }
    }
  }

  return { notes, articles, chat, omittedImages };
}

/**
 * Images become markdown links, never bytes: a base64 data URL is unreadable to
 * humans and models alike, and would dwarf the prose it belongs to
 * (markdown-architecture §5.8). An uploaded image has no URL to link, so it is
 * omitted and counted — the workspace file is where image bytes live.
 */
function withImageLinks(message: { content: string; attachments?: ChatImageAttachment[] }): {
  content: string;
  omitted: number;
} {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) return { content: message.content, omitted: 0 };

  const links: string[] = [];
  let omitted = 0;

  for (const attachment of attachments) {
    if (attachment.sourceUrl) links.push(`![${attachment.name}](${attachment.sourceUrl})`);
    else omitted += 1;
  }

  return {
    content: links.length > 0 ? `${message.content}\n\n${links.join('\n')}` : message.content,
    omitted
  };
}

export async function showBuildDocumentDialog(): Promise<void> {
  const hasExistingData = await hasMeaningfulWorkspaceData();
  const options = await confirmBuild(hasExistingData);
  if (!options) return;

  if (options.exportFirst) {
    await exportWorkspace();
  }

  const file = await pickDocumentFile();
  if (!file) return;

  try {
    const source = await file.text();
    const parsed = parseDocument(source);
    // A document may legitimately carry no diagram — that is the normal input to
    // Update. There is simply nothing for Build to construct from it.
    if (parsed.nodes.length === 0) {
      alert('This document has no Mermaid diagram, so there is no graph to build from it.');
      return;
    }
    const selection = await showBuildSelectionDialog(parsed);
    if (!selection) return;
    const imported = buildGraphFromDocument(parsed, selection);

    await clearAllData(true);
    // Settings are kept, but the graph is a different one: drop the previous
    // workspace's file name and counter so this one names itself on first save.
    resetFileNaming();
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

/**
 * Update: apply a document's content to the open graph, changing no structure.
 *
 * The View-mode refusal lives here, at the operation's entry point, because
 * that is where enforcement belongs — greying the menu item is an affordance,
 * never the guarantee (architecture.md §3.10).
 */
export async function showUpdateDocumentDialog(): Promise<void> {
  if (!isEditMode()) {
    alert('Updating a graph from a document is an edit. Switch to Edit mode first.');
    return;
  }

  const file = await pickDocumentFile();
  if (!file) return;

  try {
    const document = parseDocument(await file.text());
    const plan = planUpdate(document, {
      nodes: graphStore.nodes,
      conversations: await readAllConversations()
    });

    if (isEmptyPlan(plan)) {
      alert(
        plan.nodes.unmatched.length > 0
          ? 'Nothing in this document matches the open graph. It was probably written for a different workspace.'
          : 'This document would not change anything in the open graph.'
      );
      return;
    }

    const result = await showUpdateDialog(plan);
    if (!result) return;

    if (result.saveFirst) await exportWorkspace();
    await applyUpdate(plan, result.sections);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The document could not be read.';
    alert(`Failed to update from the document. ${message}`);
  }
}

async function readAllConversations(): Promise<Conversation[]> {
  const conversations: Conversation[] = [];
  for (const nodeId of await chatStore.getNodesWithConversations()) {
    const conversation = await chatStore.getConversation(nodeId as NodeId);
    if (conversation) conversations.push(conversation);
  }
  return conversations;
}

function confirmBuild(hasExistingData: boolean): Promise<BuildConfirmation | null> {
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
      <h3 style="margin:0 0 12px; font-size:16px; font-weight:600;">Import Markdown document</h3>
      <p style="margin:0 0 16px; color:#8b949e; line-height:1.5;">
        This replaces everything currently in this browser — graph, scenes, chat, images,
        paths and themes — with a graph built from a Markdown document.
        ${hasExistingData ? '' : 'Continue?'}
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

    const close = (value: BuildConfirmation | null): void => {
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

function pickDocumentFile(): Promise<File | null> {
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
