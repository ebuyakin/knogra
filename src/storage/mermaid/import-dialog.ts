import type { EdgeStyleSlotId } from '../../core/main-types';
import { getDefaultEdgeStyleSlotId, getEdgeStyleSlotIds } from '../../config/edge-type-settings';
import type { ParsedMermaidGraph } from './flowchart';
import { getMermaidSceneSlice, MERMAID_SCENE_LIMITS } from './scene-slice';
import { buildEdgeSceneFlags, normalizeMermaidEdgeLabel, sanitizeMermaidEdgeLabel, type MermaidEdgeLabelMapping } from './edge-mapping';
import { getMermaidImportLayoutSettings, type MermaidImportLayoutSettings } from './import-settings-store';
import { showMermaidLayoutOptionsDialog, layoutHasOptions } from './import-options-dialog';

export type { MermaidEdgeLabelMapping };

export interface MermaidImportSelection {
  anchorMermaidId: string;
  depth: number;
  allLevels: boolean;
  layout: 'radial' | 'top-down' | 'left-right' | 'fan';
  importEquations: boolean;
  importTags: boolean;
  importNotes: boolean;
  importComments: boolean;
  sceneGeneration: 'anchor' | 'hubs' | 'all';
  subSceneDepth: number;
  edgeLabelMappings: MermaidEdgeLabelMapping[];
  /** Snapshot of the layout knobs at import time (taken from the persistent
   *  `knogra.mermaid.import` store), so the builder stays a pure function of the
   *  selection. */
  layoutParams: MermaidImportLayoutSettings;
}

export function showMermaidImportSelectionDialog(
  parsed: ParsedMermaidGraph
): Promise<MermaidImportSelection | null> {
  const nodes = [...parsed.nodes].sort((left, right) => left.order - right.order);
  const defaultAnchorId = nodes[0]?.mermaidId;
  const edgeLabelRows = getEdgeLabelRows(parsed);
  const equationMetadataStatus = getEquationMetadataStatus(parsed);
  const tagMetadataStatus = getTagMetadataStatus(parsed);
  const noteMetadataStatus = getNotesMetadataStatus(parsed);
  const commentMetadataStatus = getCommentsMetadataStatus(parsed);
  const hubNodeCount = countHubNodes(parsed);
  const totalNodeCount = parsed.nodes.length;

  if (!defaultAnchorId) {
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:absolute;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;width:min(980px,92vw);max-height:90vh;overflow-y:auto;color:#e6edf3;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:16px;';

    const cyContainer = document.getElementById('cy');
    const rect = cyContainer?.getBoundingClientRect();
    if (rect) {
      dialog.style.left = `${rect.left + rect.width / 2}px`;
      dialog.style.top = `${window.innerHeight / 2}px`;
      dialog.style.transform = 'translate(-50%, -50%)';
    } else {
      dialog.style.left = '50%';
      dialog.style.top = '50%';
      dialog.style.transform = 'translate(-50%, -50%)';
    }
    dialog.innerHTML = `
      <h3 style="margin:0; font-size:16px; font-weight:600;">Choose the import starting point</h3>
      <p style="margin:0; color:#8b949e; line-height:1.5;">
        Imported graph has ${nodes.length} node${nodes.length === 1 ? '' : 's'} and ${parsed.edges.length} edge${parsed.edges.length === 1 ? '' : 's'} with ${edgeLabelRows.length} edge label${edgeLabelRows.length === 1 ? '' : 's'}.
        The workspace will include the full graph, but the initial scene will only show the anchor node and the nodes within the chosen depth.
      </p>
    `;

    const body = document.createElement('div');
    body.style.cssText = 'display:grid;grid-template-columns:minmax(0,0.9fr) minmax(440px,1fr);gap:16px;min-height:0;flex-shrink:0;';

    const anchorPanel = document.createElement('div');
    anchorPanel.style.cssText = 'display:flex;flex-direction:column;gap:10px;min-height:0;';

    const anchorLabel = document.createElement('div');
    anchorLabel.textContent = 'Choose the origin point';
    anchorLabel.style.cssText = 'font-weight:600;color:#c9d1d9;';
    anchorPanel.appendChild(anchorLabel);

    const list = document.createElement('div');
    list.style.cssText = 'border:1px solid #30363d;border-radius:6px;padding:8px;overflow:auto;flex:1;min-height:200px;max-height:360px;background:#0d1117;';

    nodes.forEach((node, index) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'mermaid-anchor-node';
      radio.value = node.mermaidId;
      radio.checked = node.mermaidId === defaultAnchorId;
      radio.style.marginTop = '2px';

      const text = document.createElement('div');
      text.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';

      const title = document.createElement('div');
      title.textContent = `${index + 1}. ${node.title || node.mermaidId} (${node.mermaidId})`;
      title.style.cssText = 'color:#e6edf3;line-height:1.35;word-break:break-word;';

      text.appendChild(title);
      row.appendChild(radio);
      row.appendChild(text);
      list.appendChild(row);
    });

    anchorPanel.appendChild(list);

    const depthPanel = document.createElement('div');
    depthPanel.style.cssText = 'display:flex;flex-direction:column;gap:10px;align-self:start;';

    const depthLabel = document.createElement('label');
    depthLabel.textContent = 'Choose the depth of the starting scene';
    depthLabel.style.cssText = 'font-weight:600;color:#c9d1d9;display:flex;flex-direction:column;gap:8px;';

    const depthInput = document.createElement('input');
    depthInput.type = 'number';
    depthInput.min = '0';
    depthInput.step = '1';
    depthInput.value = '1';
    depthInput.style.cssText = 'width:110px;flex-shrink:0;padding:8px 10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;';

    const sceneSizeStatus = document.createElement('div');
    sceneSizeStatus.style.cssText = 'flex:1;display:flex;align-items:center;padding:8px 12px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#8b949e;line-height:1.4;font-size:12px;font-weight:400;';

    const depthRow = document.createElement('div');
    depthRow.style.cssText = 'display:flex;align-items:stretch;gap:12px;';
    depthRow.appendChild(depthInput);
    depthRow.appendChild(sceneSizeStatus);

    const depthHint = document.createElement('div');
    depthHint.textContent = '0 = origin only, 1 = origin + direct connections, 2 = one more hop, and so on.';
    depthHint.style.cssText = 'color:#8b949e;line-height:1.5;font-size:12px;';

    const allLevelsLabel = document.createElement('label');
    allLevelsLabel.style.cssText = 'display:flex;align-items:center;gap:8px;color:#c9d1d9;cursor:pointer;font-size:13px;';

    const allLevelsInput = document.createElement('input');
    allLevelsInput.type = 'checkbox';
    allLevelsInput.style.accentColor = '#58a6ff';

    const allLevelsText = document.createElement('span');
    allLevelsText.textContent = 'All levels';

    allLevelsLabel.appendChild(allLevelsInput);
    allLevelsLabel.appendChild(allLevelsText);

    depthLabel.appendChild(depthRow);
    depthPanel.appendChild(depthLabel);
    depthPanel.appendChild(allLevelsLabel);
    depthPanel.appendChild(depthHint);

    const layoutLabel = document.createElement('label');
    layoutLabel.textContent = 'Choose the scene layout';
    layoutLabel.style.cssText = 'font-weight:600;color:#c9d1d9;display:flex;flex-direction:column;gap:8px;margin-top:8px;';

    const layoutSelect = document.createElement('select');
    layoutSelect.style.cssText = 'width:180px;padding:8px 10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;';
    layoutSelect.innerHTML = `
      <option value="radial">Radial context</option>
      <option value="fan">Fan (nested scenes)</option>
      <option value="top-down">Top-down flow</option>
      <option value="left-right">Left-right flow</option>
    `;

    const layoutHint = document.createElement('div');
    layoutHint.textContent = 'Radial suits graph-like maps; flow layouts follow Mermaid edge direction; fan continues the parent scene into nested sub-scenes.';
    layoutHint.style.cssText = 'color:#8b949e;line-height:1.5;font-size:12px;';

    const layoutRow = document.createElement('div');
    layoutRow.style.cssText = 'display:flex;align-items:center;gap:10px;';

    const layoutOptionsButton = document.createElement('button');
    layoutOptionsButton.type = 'button';
    layoutOptionsButton.textContent = 'Layout options…';
    layoutOptionsButton.style.cssText = 'padding:8px 12px;border-radius:6px;border:1px solid #30363d;background:none;color:#c9d1d9;cursor:pointer;font-size:13px;white-space:nowrap;';

    const syncLayoutOptionsButton = (): void => {
      const enabled = layoutHasOptions(layoutSelect.value as MermaidImportSelection['layout']);
      layoutOptionsButton.disabled = !enabled;
      layoutOptionsButton.style.opacity = enabled ? '1' : '0.5';
      layoutOptionsButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
    };
    layoutSelect.addEventListener('change', syncLayoutOptionsButton);
    layoutOptionsButton.addEventListener('click', () => {
      const layout = layoutSelect.value as MermaidImportSelection['layout'];
      if (!layoutHasOptions(layout)) return;
      void showMermaidLayoutOptionsDialog(layout);
    });
    syncLayoutOptionsButton();

    layoutRow.appendChild(layoutSelect);
    layoutRow.appendChild(layoutOptionsButton);
    layoutLabel.appendChild(layoutRow);
    depthPanel.appendChild(layoutLabel);
    depthPanel.appendChild(layoutHint);

    const importGroup = document.createElement('div');
    importGroup.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:4px;';

    const importGroupTitle = document.createElement('div');
    importGroupTitle.textContent = 'Import';
    importGroupTitle.style.cssText = 'font-weight:600;color:#c9d1d9;';

    const importGrid = document.createElement('div');
    importGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;';

    const eqCb = createMetaImportCheckbox('Equations', equationMetadataStatus);
    const tagCb = createMetaImportCheckbox('Tags', tagMetadataStatus);
    const noteCb = createMetaImportCheckbox('Notes / tutorial', noteMetadataStatus);
    const commentCb = createMetaImportCheckbox('Comments', commentMetadataStatus);

    importGrid.append(eqCb.label, tagCb.label, noteCb.label, commentCb.label);
    importGroup.append(importGroupTitle, importGrid);
    depthPanel.appendChild(importGroup);

    const equationInput = eqCb.input;
    const tagInput = tagCb.input;
    const noteInput = noteCb.input;
    const commentInput = commentCb.input;

    const sceneGenRow = document.createElement('div');
    sceneGenRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;';

    const sceneGenLabel = document.createElement('label');
    sceneGenLabel.style.cssText = 'display:flex;flex-direction:column;gap:6px;color:#c9d1d9;font-weight:600;min-width:0;';
    const sceneGenTitle = document.createElement('span');
    sceneGenTitle.textContent = 'Generate scenes for';
    const sceneGenSelect = document.createElement('select');
    sceneGenSelect.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;';
    sceneGenSelect.innerHTML = `
      <option value="anchor">Anchor only</option>
      <option value="hubs">All hub nodes (${hubNodeCount} scene${hubNodeCount === 1 ? '' : 's'})</option>
      <option value="all">All nodes (${totalNodeCount} scene${totalNodeCount === 1 ? '' : 's'})</option>
    `;
    sceneGenLabel.appendChild(sceneGenTitle);
    sceneGenLabel.appendChild(sceneGenSelect);

    const subDepthLabel = document.createElement('label');
    subDepthLabel.style.cssText = 'display:flex;flex-direction:column;gap:6px;color:#c9d1d9;font-weight:600;min-width:0;';
    const subDepthTitle = document.createElement('span');
    subDepthTitle.textContent = 'Levels per generated scene';
    const subDepthSelect = document.createElement('select');
    subDepthSelect.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;';
    subDepthSelect.innerHTML = `
      <option value="1">1 level (direct neighbours)</option>
      <option value="2">2 levels</option>
    `;
    subDepthLabel.appendChild(subDepthTitle);
    subDepthLabel.appendChild(subDepthSelect);

    sceneGenRow.appendChild(sceneGenLabel);
    sceneGenRow.appendChild(subDepthLabel);
    depthPanel.appendChild(sceneGenRow);

    sceneGenSelect.value = 'hubs';
    subDepthSelect.value = '2';

    const syncSceneGenControls = (): void => {
      const disabled = sceneGenSelect.value === 'anchor';
      subDepthSelect.disabled = disabled;
      subDepthLabel.style.opacity = disabled ? '0.5' : '1';
    };
    sceneGenSelect.addEventListener('change', syncSceneGenControls);
    syncSceneGenControls();

    body.appendChild(anchorPanel);
    body.appendChild(depthPanel);
    dialog.appendChild(body);

    const edgeTypePanel = document.createElement('div');
    edgeTypePanel.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-height:0;flex-shrink:0;';

    const edgeTypeTitle = document.createElement('div');
    edgeTypeTitle.textContent = 'Map Mermaid edge labels to Knogra edge types';
    edgeTypeTitle.style.cssText = 'font-weight:600;color:#c9d1d9;';
    edgeTypePanel.appendChild(edgeTypeTitle);

    const edgeTypeGrid = document.createElement('div');
    edgeTypeGrid.style.cssText = 'border:1px solid #30363d;border-radius:6px;background:#0d1117;overflow:auto;max-height:160px;';
    edgeTypeGrid.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px;">
        <thead style="position:sticky;top:0;background:#161b22;z-index:1;">
          <tr>
            <th style="text-align:left;padding:5px 10px;border-bottom:1px solid #30363d;color:#8b949e;">Mermaid label</th>
            <th style="text-align:center;padding:5px 10px;border-bottom:1px solid #30363d;color:#8b949e;width:70px;">Count</th>
            <th style="text-align:left;padding:5px 10px;border-bottom:1px solid #30363d;color:#8b949e;width:230px;">Knogra edge type name</th>
            <th style="text-align:left;padding:5px 10px;border-bottom:1px solid #30363d;color:#8b949e;width:120px;">Thematic style</th>
            <th style="text-align:center;padding:5px 10px;border-bottom:1px solid #30363d;color:#8b949e;width:76px;" title="Include this label's children (source→target) in generated scenes">Children</th>
            <th style="text-align:center;padding:5px 10px;border-bottom:1px solid #30363d;color:#8b949e;width:76px;" title="Include this label's parents (target→source) in generated scenes">Parents</th>
            <th style="text-align:center;padding:5px 10px;border-bottom:1px solid #30363d;color:#8b949e;width:90px;" title="Draw this label between nodes already in a scene (non-structural cross-links)">Cross-links</th>
          </tr>
        </thead>
        <tbody>
          ${edgeLabelRows.map(row => `
            <tr data-label-key="${escapeAttr(row.key)}">
              <td style="padding:4px 10px;border-bottom:1px solid #21262d;color:#e6edf3;word-break:break-word;">${escapeHtml(row.displayLabel)}</td>
              <td style="padding:4px 10px;border-bottom:1px solid #21262d;text-align:center;color:#8b949e;">${row.count}</td>
              <td style="padding:4px 10px;border-bottom:1px solid #21262d;">
                <input class="mi-edge-type-name" value="${escapeAttr(row.defaultTypeName)}" style="width:100%;box-sizing:border-box;padding:4px 8px;border-radius:4px;border:1px solid #30363d;background:#161b22;color:#e6edf3;font-size:12px;" />
              </td>
              <td style="padding:4px 10px;border-bottom:1px solid #21262d;">
                <select class="mi-edge-style" style="width:100%;box-sizing:border-box;padding:4px 8px;border-radius:4px;border:1px solid #30363d;background:#161b22;color:#e6edf3;font-size:12px;">
                  ${getEdgeStyleSlotIds().map(slotId => `<option value="${slotId}" ${slotId === row.defaultStyleSlotId ? 'selected' : ''}>${formatStyleSlot(slotId)}</option>`).join('')}
                </select>
              </td>
              <td style="padding:4px 10px;border-bottom:1px solid #21262d;text-align:center;"><input type="checkbox" class="mi-edge-children" checked style="accent-color:#58a6ff;cursor:pointer;" /></td>
              <td style="padding:4px 10px;border-bottom:1px solid #21262d;text-align:center;"><input type="checkbox" class="mi-edge-parents" checked style="accent-color:#58a6ff;cursor:pointer;" /></td>
              <td style="padding:4px 10px;border-bottom:1px solid #21262d;text-align:center;"><input type="checkbox" class="mi-edge-cross" checked style="accent-color:#58a6ff;cursor:pointer;" /></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    edgeTypePanel.appendChild(edgeTypeGrid);
    dialog.appendChild(edgeTypePanel);

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = 'padding:6px 16px;border-radius:6px;border:1px solid #30363d;background:none;color:#c9d1d9;cursor:pointer;font-size:13px;';

    const importButton = document.createElement('button');
    importButton.textContent = 'Import';
    importButton.style.cssText = 'padding:6px 16px;border-radius:6px;border:none;background:#58a6ff;color:#fff;cursor:pointer;font-size:13px;font-weight:600;';

    footer.appendChild(cancelButton);
    footer.appendChild(importButton);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Size the edge-type grid to exactly four full data rows (plus the sticky
    // header) so a partial row never gets clipped mid-height. Measured from the
    // live DOM to stay exact across fonts/themes; only clamps when there are
    // more than four rows to scroll through.
    const firstEdgeRow = edgeTypeGrid.querySelector('tbody tr') as HTMLElement | null;
    const edgeGridHead = edgeTypeGrid.querySelector('thead') as HTMLElement | null;
    if (firstEdgeRow) {
      const rowHeight = firstEdgeRow.getBoundingClientRect().height;
      const headHeight = edgeGridHead?.getBoundingClientRect().height ?? 0;
      edgeTypeGrid.style.maxHeight = `${Math.ceil(headHeight + rowHeight * 4)}px`;
    }

    const close = (value: MermaidImportSelection | null): void => {
      overlay.remove();
      resolve(value);
    };

    cancelButton.addEventListener('click', () => close(null));

    const getSelectedAnchorId = (): string => {
      const selected = dialog.querySelector('input[name="mermaid-anchor-node"]:checked') as HTMLInputElement | null;
      return selected?.value ?? defaultAnchorId;
    };

    const getDepth = (): number => {
      const depth = Number.parseInt(depthInput.value, 10);
      return Number.isFinite(depth) && depth >= 0 ? depth : 1;
    };

    const syncEdgeStyleGroups = (): void => {
      const groupStyles = new Map<string, EdgeStyleSlotId>();
      edgeTypeGrid.querySelectorAll('tbody tr').forEach(row => {
        const nameInput = row.querySelector('.mi-edge-type-name') as HTMLInputElement | null;
        const styleSelect = row.querySelector('.mi-edge-style') as HTMLSelectElement | null;
        if (!nameInput || !styleSelect) return;
        const normalizedName = normalizeEdgeTypeName(nameInput.value);
        if (!normalizedName) return;

        const existingStyle = groupStyles.get(normalizedName);
        if (existingStyle) {
          styleSelect.value = existingStyle;
        } else {
          groupStyles.set(normalizedName, styleSelect.value as EdgeStyleSlotId);
        }
      });
    };

    const getEdgeLabelMappings = (): MermaidEdgeLabelMapping[] => {
      syncEdgeStyleGroups();
      return Array.from(edgeTypeGrid.querySelectorAll('tbody tr')).map(row => {
        const labelKey = (row as HTMLElement).dataset.labelKey ?? '';
        const nameInput = row.querySelector('.mi-edge-type-name') as HTMLInputElement | null;
        const styleSelect = row.querySelector('.mi-edge-style') as HTMLSelectElement | null;
        const childrenCb = row.querySelector('.mi-edge-children') as HTMLInputElement | null;
        const parentsCb = row.querySelector('.mi-edge-parents') as HTMLInputElement | null;
        const crossCb = row.querySelector('.mi-edge-cross') as HTMLInputElement | null;
        return {
          sourceLabelKey: labelKey,
          edgeTypeName: sanitizeEdgeTypeName(nameInput?.value ?? '') || 'related',
          thematicStyleSlotId: (styleSelect?.value || getDefaultEdgeStyleSlotId()) as EdgeStyleSlotId,
          includeChildren: childrenCb?.checked ?? true,
          includeParents: parentsCb?.checked ?? true,
          includeCrossEdges: crossCb?.checked ?? true,
        };
      });
    };

    const updateSceneSizeStatus = (): void => {
      try {
        const slice = getMermaidSceneSlice(parsed, getSelectedAnchorId(), getDepth(), allLevelsInput.checked, buildEdgeSceneFlags(parsed.edges, getEdgeLabelMappings()));
        const countText = `${slice.nodeCount} node${slice.nodeCount === 1 ? '' : 's'}, ${slice.edgeCount} edge${slice.edgeCount === 1 ? '' : 's'}`;
        if (slice.overLimit) {
          sceneSizeStatus.textContent = `Starting scene: ${countText}. Limit is ${MERMAID_SCENE_LIMITS.maxNodes} nodes / ${MERMAID_SCENE_LIMITS.maxEdges} edges. Reduce depth or choose another origin.`;
          sceneSizeStatus.style.borderColor = '#f85149';
          sceneSizeStatus.style.color = '#ffb4ab';
          importButton.disabled = true;
          importButton.style.opacity = '0.5';
          importButton.style.cursor = 'not-allowed';
          return;
        }

        sceneSizeStatus.textContent = `Starting scene: ${countText}.`;
        sceneSizeStatus.style.borderColor = '#30363d';
        sceneSizeStatus.style.color = '#8b949e';
        importButton.disabled = false;
        importButton.style.opacity = '1';
        importButton.style.cursor = 'pointer';
      } catch (error) {
        sceneSizeStatus.textContent = error instanceof Error ? error.message : 'Could not calculate starting scene size.';
        sceneSizeStatus.style.borderColor = '#f85149';
        sceneSizeStatus.style.color = '#ffb4ab';
        importButton.disabled = true;
        importButton.style.opacity = '0.5';
        importButton.style.cursor = 'not-allowed';
      }
    };

    allLevelsInput.addEventListener('change', () => {
      depthInput.disabled = allLevelsInput.checked;
      depthInput.style.opacity = allLevelsInput.checked ? '0.5' : '1';
      updateSceneSizeStatus();
    });

    depthInput.addEventListener('input', updateSceneSizeStatus);
    list.querySelectorAll('input[name="mermaid-anchor-node"]').forEach(input => {
      input.addEventListener('change', updateSceneSizeStatus);
    });
    edgeTypeGrid.addEventListener('input', event => {
      if ((event.target as HTMLElement).classList.contains('mi-edge-type-name')) syncEdgeStyleGroups();
    });
    edgeTypeGrid.addEventListener('change', event => {
      const target = event.target as HTMLElement;
      if (target.classList.contains('mi-edge-style') || target.classList.contains('mi-edge-type-name')) syncEdgeStyleGroups();
      if (
        target.classList.contains('mi-edge-children') ||
        target.classList.contains('mi-edge-parents') ||
        target.classList.contains('mi-edge-cross')
      ) updateSceneSizeStatus();
    });

    importButton.addEventListener('click', () => {
      if (importButton.disabled) return;
      close({
        anchorMermaidId: getSelectedAnchorId(),
        depth: getDepth(),
        allLevels: allLevelsInput.checked,
        layout: layoutSelect.value as MermaidImportSelection['layout'],
        importEquations: equationInput.checked && !equationInput.disabled,
        importTags: tagInput.checked && !tagInput.disabled,
        importNotes: noteInput.checked && !noteInput.disabled,
        importComments: commentInput.checked && !commentInput.disabled,
        sceneGeneration: sceneGenSelect.value as MermaidImportSelection['sceneGeneration'],
        subSceneDepth: subDepthSelect.value === '2' ? 2 : 1,
        edgeLabelMappings: getEdgeLabelMappings(),
        layoutParams: getMermaidImportLayoutSettings(),
      });
    });

    updateSceneSizeStatus();

    overlay.addEventListener('click', event => {
      if (event.target === overlay) close(null);
    });
  });
}

interface EdgeLabelRow {
  key: string;
  displayLabel: string;
  count: number;
  defaultTypeName: string;
  defaultStyleSlotId: EdgeStyleSlotId;
}

function getEquationMetadataStatus(parsed: ParsedMermaidGraph): { total: number; matched: number; unmatched: number } {
  const nodeIds = new Set(parsed.nodes.map(node => node.mermaidId));
  const total = parsed.equationsByMermaidId.size;
  let matched = 0;

  for (const mermaidId of parsed.equationsByMermaidId.keys()) {
    if (nodeIds.has(mermaidId)) matched += 1;
  }

  return { total, matched, unmatched: total - matched };
}

function getTagMetadataStatus(parsed: ParsedMermaidGraph): { total: number; matched: number; unmatched: number } {
  const nodeIds = new Set(parsed.nodes.map(node => node.mermaidId));
  const total = parsed.tagsByMermaidId.size;
  let matched = 0;

  for (const mermaidId of parsed.tagsByMermaidId.keys()) {
    if (nodeIds.has(mermaidId)) matched += 1;
  }

  return { total, matched, unmatched: total - matched };
}

function getCommentsMetadataStatus(parsed: ParsedMermaidGraph): { total: number; matched: number; unmatched: number } {
  const nodeIds = new Set(parsed.nodes.map(node => node.mermaidId));
  const total = parsed.commentsByMermaidId.size;
  let matched = 0;

  for (const mermaidId of parsed.commentsByMermaidId.keys()) {
    if (nodeIds.has(mermaidId)) matched += 1;
  }

  return { total, matched, unmatched: total - matched };
}

/**
 * Build one compact metadata-import checkbox for the grouped "Import" row.
 * Short visible label with the matched count; a tooltip carries the
 * matched/unmatched breakdown so the label stays narrow in the 2-column grid.
 */
function createMetaImportCheckbox(
  name: string,
  status: { total: number; matched: number; unmatched: number }
): { label: HTMLLabelElement; input: HTMLInputElement } {
  const canImport = status.total > 0;

  const label = document.createElement('label');
  label.style.cssText = `display:flex;align-items:center;gap:8px;color:${canImport ? '#c9d1d9' : '#8b949e'};cursor:${canImport ? 'pointer' : 'not-allowed'};font-size:13px;`;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.disabled = !canImport;
  input.checked = canImport;
  input.style.accentColor = '#58a6ff';
  input.style.opacity = canImport ? '1' : '0.5';

  const text = document.createElement('span');
  text.textContent = canImport ? `${name} (${status.matched})` : `${name} (none)`;
  if (canImport && status.unmatched > 0) {
    label.title = `${status.matched} matched, ${status.unmatched} unmatched`;
  }

  label.appendChild(input);
  label.appendChild(text);
  return { label, input };
}

function getNotesMetadataStatus(parsed: ParsedMermaidGraph): { total: number; matched: number; unmatched: number } {
  const nodeIds = new Set(parsed.nodes.map(node => node.mermaidId));
  const annotatedIds = new Set<string>([
    ...parsed.notesByMermaidId.keys(),
    ...parsed.tutorialByMermaidId.keys(),
  ]);
  let matched = 0;

  for (const mermaidId of annotatedIds) {
    if (nodeIds.has(mermaidId)) matched += 1;
  }

  return { total: annotatedIds.size, matched, unmatched: annotatedIds.size - matched };
}

function countHubNodes(parsed: ParsedMermaidGraph): number {
  const degree = new Map<string, number>(parsed.nodes.map(node => [node.mermaidId, 0]));
  for (const edge of parsed.edges) {
    degree.set(edge.sourceMermaidId, (degree.get(edge.sourceMermaidId) ?? 0) + 1);
    degree.set(edge.targetMermaidId, (degree.get(edge.targetMermaidId) ?? 0) + 1);
  }
  let count = 0;
  for (const value of degree.values()) {
    if (value >= 2) count += 1;
  }
  return count;
}

function getEdgeLabelRows(parsed: ParsedMermaidGraph): EdgeLabelRow[] {
  const labelCounts = new Map<string, { displayLabel: string; count: number; firstOrder: number }>();
  for (const edge of parsed.edges) {
    const displayLabel = sanitizeMermaidEdgeLabel(edge.title);
    const key = normalizeMermaidEdgeLabel(displayLabel);
    const existing = labelCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      labelCounts.set(key, {
        displayLabel: displayLabel || '(unlabeled)',
        count: 1,
        firstOrder: edge.order,
      });
    }
  }

  const styleSlots = getEdgeStyleSlotIds();
  return [...labelCounts.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[1].firstOrder - right[1].firstOrder)
    .map(([key, value], index) => ({
      key,
      displayLabel: value.displayLabel,
      count: value.count,
      defaultTypeName: key === '' ? 'related' : titleCaseEdgeTypeName(value.displayLabel),
      defaultStyleSlotId: key === ''
        ? getDefaultEdgeStyleSlotId()
        : styleSlots[index % styleSlots.length],
    }));
}

export function normalizeEdgeTypeName(name: string): string {
  return sanitizeEdgeTypeName(name).toLowerCase();
}

function sanitizeEdgeTypeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function titleCaseEdgeTypeName(label: string): string {
  const sanitized = sanitizeEdgeTypeName(label);
  if (!sanitized) return 'related';
  return sanitized
    .split(' ')
    .map(word => word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word)
    .join(' ');
}

function formatStyleSlot(slotId: EdgeStyleSlotId): string {
  return `Style ${slotId.replace('edge-style-', '')}`;
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}