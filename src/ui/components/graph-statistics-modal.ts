import type { GraphStatistics, GraphStatisticBucket } from '../../features/graph/graph';
import '../../styles/graph-statistics-modal.css';

export class GraphStatisticsModal {
  #dialog: HTMLDialogElement | null = null;

  show(stats: GraphStatistics): void {
    this.#dialog?.remove();
    const dialog = document.createElement('dialog');
    dialog.className = 'graph-statistics-dialog';
    dialog.innerHTML = this.#render(stats);
    document.body.appendChild(dialog);
    this.#dialog = dialog;

    dialog.querySelector('.graph-statistics-close')?.addEventListener('click', () => this.#close());
    dialog.querySelector('.btn-close-statistics')?.addEventListener('click', () => this.#close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog) this.#close();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.#close();
    });

    dialog.showModal();
    this.#positionDialog(dialog);
  }

  #close(): void {
    this.#dialog?.close();
    this.#dialog?.remove();
    this.#dialog = null;
  }

  #positionDialog(dialog: HTMLDialogElement): void {
    const chatPanel = document.getElementById('chat');
    const chatWidth = chatPanel?.offsetWidth || 350;
    const leftAreaWidth = window.innerWidth - chatWidth;
    const left = (leftAreaWidth - dialog.offsetWidth) / 2;
    const top = (window.innerHeight - dialog.offsetHeight) / 2;
    dialog.style.left = `${Math.max(20, left)}px`;
    dialog.style.top = `${Math.max(20, top)}px`;
  }

  #render(stats: GraphStatistics): string {
    return `
      <div class="graph-statistics-container">
        <div class="graph-statistics-header">
          <h2>Graph Statistics</h2>
          <button class="graph-statistics-close" aria-label="Close">&times;</button>
        </div>
        <div class="graph-statistics-body">
          <div class="graph-statistics-summary">
            ${this.#renderSection('Inventory', [
              ['Nodes', stats.totals.nodes],
              ['Edges', stats.totals.edges],
              ['Edge types', stats.totals.edgeTypes],
              ['Scenes', stats.totals.scenes],
              ['Background images', stats.totals.backgroundImages]
            ])}
            ${this.#renderSection('Connectivity', [
              ['Separate graph groups', stats.connectivity.connectedComponents],
              ['Nodes in largest group', stats.connectivity.largestComponentSize],
              ['Isolated nodes', stats.connectivity.isolatedNodes],
              ['Disconnected from anchor', stats.connectivity.disconnectedFromAnchor],
              ['Max anchor distance', stats.connectivity.maxAnchorDistance ?? '—']
            ])}
            ${this.#renderSection('Scene Coverage', [
              ['Nodes not in any scene', stats.sceneCoverage.nodesNotInAnyScene],
              ['Nodes without own scene', stats.sceneCoverage.nodesWithoutOwnScene],
              ['Node appearances in scenes', stats.sceneCoverage.totalSceneNodeInclusions],
              ['Edge appearances in scenes', stats.sceneCoverage.totalSceneEdgeInclusions]
            ])}
            ${this.#renderSection('Averages', [
              ['Edges per node', this.#formatNumber(stats.averages.edgesPerNode)],
              ['Average degree', this.#formatNumber(stats.averages.averageDegree)],
              ['Nodes per scene', this.#formatNumber(stats.averages.nodesPerScene)],
              ['Edges per scene', this.#formatNumber(stats.averages.edgesPerScene)],
              ['Scenes per node', this.#formatNumber(stats.averages.scenesPerNode)]
            ])}
          </div>
          <div class="graph-statistics-distributions" aria-label="Number of nodes by distribution">
            <h3 class="graph-statistics-distributions-title">Number of nodes by</h3>
            ${this.#renderDistribution('Anchor distance', stats.distributions.nodesByAnchorDistance)}
            ${this.#renderDistribution('Connected edges', stats.distributions.nodesByConnectionCount)}
            ${this.#renderDistribution('Scene appearances', stats.distributions.nodesBySceneCount)}
            ${this.#renderDistribution('Edge type totals', stats.distributions.edgesByType)}
          </div>
        </div>
        <div class="graph-statistics-footer">
          <button class="btn-close-statistics">Close</button>
        </div>
      </div>
    `;
  }

  #renderSection(title: string, rows: Array<[string, string | number]>): string {
    return `
      <section class="graph-statistics-section">
        <h3>${this.#escapeHtml(title)}</h3>
        <div class="graph-statistics-list">
          ${rows.map(([label, value]) => `
            <div class="graph-statistics-row">
              <span>${this.#escapeHtml(label)}</span>
              <strong>${this.#escapeHtml(String(value))}</strong>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  #renderDistribution(title: string, buckets: GraphStatisticBucket[]): string {
    return `
      <section class="graph-statistics-section graph-statistics-distribution">
        <h3>${this.#escapeHtml(title)}</h3>
        <table class="graph-statistics-table">
          <tbody>
          ${buckets.length > 0
            ? buckets.map(bucket => `
              <tr>
                <td>${this.#escapeHtml(bucket.label)}</td>
                <td>${bucket.count}</td>
              </tr>
            `).join('')
            : '<tr><td colspan="2" class="graph-statistics-empty">No data</td></tr>'}
          </tbody>
        </table>
      </section>
    `;
  }

  #formatNumber(value: number): string {
    return value.toFixed(2);
  }

  #escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}