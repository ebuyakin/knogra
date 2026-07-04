import type { EdgeStyleSlotId } from '../../core/main-types';
import { getDefaultEdgeStyleSlotId, getEdgeStyleSlotIds } from '../../config/edge-type-settings';
import type { ParsedMermaidGraph } from './flowchart';
import { getMermaidSceneSlice, MERMAID_SCENE_LIMITS } from './scene-slice';

export interface MermaidEdgeLabelMapping {
  sourceLabelKey: string;
  edgeTypeName: string;
  thematicStyleSlotId: EdgeStyleSlotId;
}

export interface MermaidImportSelection {
  anchorMermaidId: string;
  depth: number;
  allLevels: boolean;
  layout: 'radial' | 'top-down' | 'left-right';
  importEquations: boolean;
  importTags: boolean;
  sceneGeneration: 'anchor' | 'hubs' | 'all';
  subSceneDepth: number;
  edgeLabelMappings: MermaidEdgeLabelMapping[];
}

export function showMermaidImportSelectionDialog(
  parsed: ParsedMermaidGraph
): Promise<MermaidImportSelection | null> {
  const nodes = [...parsed.nodes].sort((left, right) => left.order - right.order);
  const defaultAnchorId = nodes[0]?.mermaidId;
  const edgeLabelRows = getEdgeLabelRows(parsed);
  const equationMetadataStatus = getEquationMetadataStatus(parsed);
  const tagMetadataStatus = getTagMetadataStatus(parsed);
  const hubNodeCount = countHubNodes(parsed);
  const totalNodeCount = parsed.nodes.length;

  if (!defaultAnchorId) {
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:absolute;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;width:min(980px,92vw);max-height:88vh;overflow-y:auto;color:#e6edf3;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:16px;';

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
    list.style.cssText = 'border:1px solid #30363d;border-radius:6px;padding:8px;overflow:auto;max-height:30vh;background:#0d1117;';

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
    layoutLabel.textContent = 'Choose the starting scene layout';
    layoutLabel.style.cssText = 'font-weight:600;color:#c9d1d9;display:flex;flex-direction:column;gap:8px;margin-top:8px;';

    const layoutSelect = document.createElement('select');
    layoutSelect.style.cssText = 'width:180px;padding:8px 10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;';
    layoutSelect.innerHTML = `
      <option value="radial">Radial context</option>
      <option value="top-down">Top-down flow</option>
      <option value="left-right">Left-right flow</option>
    `;

    const layoutHint = document.createElement('div');
    layoutHint.textContent = 'Radial suits graph-like maps; flow layouts follow Mermaid edge direction.';
    layoutHint.style.cssText = 'color:#8b949e;line-height:1.5;font-size:12px;';

    layoutLabel.appendChild(layoutSelect);
    depthPanel.appendChild(layoutLabel);
    depthPanel.appendChild(layoutHint);

    const canImportEquations = equationMetadataStatus.total > 0;

    const equationLabel = document.createElement('label');
    equationLabel.style.cssText = `display:flex;align-items:flex-start;gap:8px;color:${canImportEquations ? '#c9d1d9' : '#8b949e'};cursor:${canImportEquations ? 'pointer' : 'not-allowed'};font-size:13px;margin-top:4px;`;

    const equationInput = document.createElement('input');
    equationInput.type = 'checkbox';
    equationInput.disabled = !canImportEquations;
    equationInput.style.accentColor = '#58a6ff';
    equationInput.style.marginTop = '2px';
    equationInput.style.opacity = canImportEquations ? '1' : '0.5';

    const equationText = document.createElement('span');
    equationText.textContent = canImportEquations
      ? `Import equations (${equationMetadataStatus.matched} matched${equationMetadataStatus.unmatched > 0 ? `, ${equationMetadataStatus.unmatched} unmatched` : ''})`
      : 'Import equations (none found)';

    equationLabel.appendChild(equationInput);
    equationLabel.appendChild(equationText);
    depthPanel.appendChild(equationLabel);

    const canImportTags = tagMetadataStatus.total > 0;

    const tagLabel = document.createElement('label');
    tagLabel.style.cssText = `display:flex;align-items:flex-start;gap:8px;color:${canImportTags ? '#c9d1d9' : '#8b949e'};cursor:${canImportTags ? 'pointer' : 'not-allowed'};font-size:13px;margin-top:4px;`;

    const tagInput = document.createElement('input');
    tagInput.type = 'checkbox';
    tagInput.disabled = !canImportTags;
    tagInput.style.accentColor = '#58a6ff';
    tagInput.style.marginTop = '2px';
    tagInput.style.opacity = canImportTags ? '1' : '0.5';

    const tagText = document.createElement('span');
    tagText.textContent = canImportTags
      ? `Import tags (${tagMetadataStatus.matched} matched${tagMetadataStatus.unmatched > 0 ? `, ${tagMetadataStatus.unmatched} unmatched` : ''})`
      : 'Import tags (none found)';

    tagLabel.appendChild(tagInput);
    tagLabel.appendChild(tagText);
    depthPanel.appendChild(tagLabel);

    const sceneGenLabel = document.createElement('label');
    sceneGenLabel.style.cssText = 'display:flex;flex-direction:column;gap:6px;color:#c9d1d9;font-size:13px;margin-top:12px;';
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
    depthPanel.appendChild(sceneGenLabel);

    const subDepthLabel = document.createElement('label');
    subDepthLabel.style.cssText = 'display:flex;flex-direction:column;gap:6px;color:#c9d1d9;font-size:13px;margin-top:8px;';
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
    depthPanel.appendChild(subDepthLabel);

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
    edgeTypeGrid.style.cssText = 'border:1px solid #30363d;border-radius:6px;background:#0d1117;overflow:auto;max-height:28vh;';
    edgeTypeGrid.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:720px;">
        <thead style="position:sticky;top:0;background:#161b22;z-index:1;">
          <tr>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #30363d;color:#8b949e;">Mermaid label</th>
            <th style="text-align:center;padding:8px 10px;border-bottom:1px solid #30363d;color:#8b949e;width:70px;">Count</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #30363d;color:#8b949e;width:230px;">Knogra edge type name</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #30363d;color:#8b949e;width:170px;">Thematic style</th>
          </tr>
        </thead>
        <tbody>
          ${edgeLabelRows.map(row => `
            <tr data-label-key="${escapeAttr(row.key)}">
              <td style="padding:8px 10px;border-bottom:1px solid #21262d;color:#e6edf3;word-break:break-word;">${escapeHtml(row.displayLabel)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #21262d;text-align:center;color:#8b949e;">${row.count}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #21262d;">
                <input class="mi-edge-type-name" value="${escapeAttr(row.defaultTypeName)}" style="width:100%;box-sizing:border-box;padding:6px 8px;border-radius:4px;border:1px solid #30363d;background:#161b22;color:#e6edf3;font-size:12px;" />
              </td>
              <td style="padding:8px 10px;border-bottom:1px solid #21262d;">
                <select class="mi-edge-style" style="width:100%;box-sizing:border-box;padding:6px 8px;border-radius:4px;border:1px solid #30363d;background:#161b22;color:#e6edf3;font-size:12px;">
                  ${getEdgeStyleSlotIds().map(slotId => `<option value="${slotId}" ${slotId === row.defaultStyleSlotId ? 'selected' : ''}>${formatStyleSlot(slotId)}</option>`).join('')}
                </select>
              </td>
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
        return {
          sourceLabelKey: labelKey,
          edgeTypeName: sanitizeEdgeTypeName(nameInput?.value ?? '') || 'related',
          thematicStyleSlotId: (styleSelect?.value || getDefaultEdgeStyleSlotId()) as EdgeStyleSlotId,
        };
      });
    };

    const updateSceneSizeStatus = (): void => {
      try {
        const slice = getMermaidSceneSlice(parsed, getSelectedAnchorId(), getDepth(), allLevelsInput.checked);
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
        sceneGeneration: sceneGenSelect.value as MermaidImportSelection['sceneGeneration'],
        subSceneDepth: subDepthSelect.value === '2' ? 2 : 1,
        edgeLabelMappings: getEdgeLabelMappings(),
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

export function normalizeMermaidEdgeLabel(label: string): string {
  return sanitizeMermaidEdgeLabel(label).toLowerCase();
}

export function normalizeEdgeTypeName(name: string): string {
  return sanitizeEdgeTypeName(name).toLowerCase();
}

function sanitizeMermaidEdgeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
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