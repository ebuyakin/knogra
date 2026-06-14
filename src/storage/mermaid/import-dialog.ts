import type { ParsedMermaidGraph } from './flowchart';
import { getMermaidSceneSlice, MERMAID_SCENE_LIMITS } from './scene-slice';

export interface MermaidImportSelection {
  anchorMermaidId: string;
  depth: number;
  allLevels: boolean;
  layout: 'radial' | 'top-down' | 'left-right';
}

export function showMermaidImportSelectionDialog(
  parsed: ParsedMermaidGraph
): Promise<MermaidImportSelection | null> {
  const nodes = [...parsed.nodes].sort((left, right) => left.order - right.order);
  const defaultAnchorId = nodes[0]?.mermaidId;

  if (!defaultAnchorId) {
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:absolute;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;width:min(840px,92vw);max-height:88vh;color:#e6edf3;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:16px;';

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
        Imported graph has ${nodes.length} node${nodes.length === 1 ? '' : 's'}.
        The workspace will include the full graph, but the initial scene will only show the anchor node and the nodes within the chosen depth.
      </p>
    `;

    const body = document.createElement('div');
    body.style.cssText = 'display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,0.9fr);gap:16px;min-height:0;';

    const anchorPanel = document.createElement('div');
    anchorPanel.style.cssText = 'display:flex;flex-direction:column;gap:10px;min-height:0;';

    const anchorLabel = document.createElement('div');
    anchorLabel.textContent = 'Choose the origin point';
    anchorLabel.style.cssText = 'font-weight:600;color:#c9d1d9;';
    anchorPanel.appendChild(anchorLabel);

    const list = document.createElement('div');
    list.style.cssText = 'border:1px solid #30363d;border-radius:6px;padding:8px;overflow:auto;max-height:52vh;background:#0d1117;';

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
    depthInput.style.cssText = 'width:120px;padding:8px 10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;';

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

    depthLabel.appendChild(depthInput);
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
    layoutHint.textContent = 'Radial is best for graph-like maps. Flow layouts follow Mermaid edge direction from the origin.';
    layoutHint.style.cssText = 'color:#8b949e;line-height:1.5;font-size:12px;';

    layoutLabel.appendChild(layoutSelect);
    depthPanel.appendChild(layoutLabel);
    depthPanel.appendChild(layoutHint);

    const sceneSizeStatus = document.createElement('div');
    sceneSizeStatus.style.cssText = 'padding:10px 12px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#8b949e;line-height:1.5;font-size:12px;';
    depthPanel.appendChild(sceneSizeStatus);

    body.appendChild(anchorPanel);
    body.appendChild(depthPanel);
    dialog.appendChild(body);

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

    importButton.addEventListener('click', () => {
      if (importButton.disabled) return;
      close({
        anchorMermaidId: getSelectedAnchorId(),
        depth: getDepth(),
        allLevels: allLevelsInput.checked,
        layout: layoutSelect.value as MermaidImportSelection['layout'],
      });
    });

    updateSceneSizeStatus();

    overlay.addEventListener('click', event => {
      if (event.target === overlay) close(null);
    });
  });
}