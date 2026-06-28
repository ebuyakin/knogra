import type { FeatureAPI } from '../../features/feature-api';
import type { QuizSnapshot } from '../../core/quiz-types';
import '../../styles/quiz-panel.css';

export class QuizPanel {
  #features: FeatureAPI;
  #container: HTMLElement;
  #overlay: HTMLDivElement;
  #root: HTMLDivElement;
  #visible: boolean = false;
  #snapshot: QuizSnapshot;
  #hiddenPercent: number = 40;
  #includeCentral: boolean = true;
  #isDragging: boolean = false;
  #dragOffsetX: number = 0;
  #dragOffsetY: number = 0;

  constructor(features: FeatureAPI, container: HTMLElement) {
    this.#features = features;
    this.#container = container;
    this.#snapshot = this.#features.quiz.getSnapshot();
    this.#overlay = document.createElement('div');
    this.#overlay.className = 'quiz-panel-overlay hidden';
    this.#root = document.createElement('div');
    this.#root.className = 'quiz-panel';
    this.#overlay.appendChild(this.#root);
    document.body.appendChild(this.#overlay);

    this.#features.quiz.subscribe((snapshot) => {
      this.#snapshot = snapshot;
      this.#render();
    });

    this.#render();
  }

  show(): void {
    this.#visible = true;
    this.#positionOverlay();
    this.#render();
    this.#positionPanel();
  }

  hide(): void {
    this.#visible = false;
    this.#render();
  }

  toggle(): void {
    this.#visible = !this.#visible;
    this.#render();
  }

  isVisible(): boolean {
    return this.#visible;
  }

  #render(): void {
    this.#overlay.classList.toggle('hidden', !this.#visible);
    if (!this.#visible) return;

    this.#root.innerHTML = this.#snapshot.active
      ? this.#renderActive()
      : this.#renderInactive();

    this.#attachListeners();
  }

  #positionOverlay(): void {
    const rect = this.#container.getBoundingClientRect();
    this.#overlay.style.top = `${rect.top}px`;
    this.#overlay.style.left = `${rect.left}px`;
    this.#overlay.style.width = `${rect.width}px`;
    this.#overlay.style.height = `${rect.height}px`;
  }

  #positionPanel(): void {
    this.#root.style.left = '';
    this.#root.style.top = '';
    this.#root.style.right = '';
    this.#root.style.transform = '';

    const padding = 20;
    const containerRect = this.#container.getBoundingClientRect();
    const panelRect = this.#root.getBoundingClientRect();
    const left = containerRect.right - panelRect.width - padding;
    const top = containerRect.top + padding;

    this.#root.style.left = `${Math.max(containerRect.left + padding, left)}px`;
    this.#root.style.top = `${Math.max(containerRect.top + padding, top)}px`;
  }

  #renderInactive(): string {
    return `
      <div class="quiz-panel-header">
        <div>
          <div class="quiz-panel-title">Quiz</div>
          <div class="quiz-panel-subtitle">${this.#snapshot.eligibleNodeCount} eligible nodes</div>
        </div>
        <button class="quiz-icon-button" data-action="hide" title="Close">×</button>
      </div>
      <div class="quiz-panel-body">
        <label class="quiz-field">
          <span>Hide</span>
          <input class="quiz-number-input" data-role="hidden-percent" type="number" min="10" max="100" step="10" value="${this.#hiddenPercent}">
          <span>%</span>
        </label>
        <label class="quiz-checkbox-field">
          <input data-role="include-central" type="checkbox" ${this.#includeCentral ? 'checked' : ''}>
          <span>Allow hiding central nodes</span>
        </label>
        ${this.#snapshot.message ? `<div class="quiz-message">${this.#escapeHtml(this.#snapshot.message)}</div>` : ''}
      </div>
      <div class="quiz-panel-footer">
        <button class="quiz-primary-button" data-action="start">Start</button>
      </div>
    `;
  }

  #renderActive(): string {
    const selectedLabel = this.#snapshot.selectedNodeTitle
      ? this.#escapeHtml(this.#snapshot.selectedNodeTitle)
      : this.#snapshot.selectedNodeId
        ? 'Hidden node'
        : 'No node selected';
    const selectedStatus = this.#formatStatus(this.#snapshot.selectedNodeStatus);
    const canReveal = this.#snapshot.selectedNodeStatus === 'hidden';
    const canGrade = this.#snapshot.selectedNodeStatus === 'revealed'
      || this.#snapshot.selectedNodeStatus === 'correct'
      || this.#snapshot.selectedNodeStatus === 'wrong';

    return `
      <div class="quiz-panel-header">
        <div>
          <div class="quiz-panel-title">Quiz</div>
          <div class="quiz-panel-subtitle">${this.#snapshot.hiddenCount} hidden · ${this.#snapshot.remainingCount} left</div>
        </div>
        <button class="quiz-icon-button" data-action="hide" title="Close">×</button>
      </div>
      <div class="quiz-stats-grid">
        <div><strong>${this.#snapshot.correctCount}</strong><span>Correct</span></div>
        <div><strong>${this.#snapshot.wrongCount}</strong><span>Wrong</span></div>
        <div><strong>${this.#snapshot.revealedCount}</strong><span>Revealed</span></div>
      </div>
      <div class="quiz-selected-node">
        <div class="quiz-selected-title" title="${selectedLabel}">${selectedLabel}</div>
        <div class="quiz-selected-status">${selectedStatus}</div>
      </div>
      <div class="quiz-action-grid">
        <button data-action="reveal" ${canReveal ? '' : 'disabled'}>Reveal</button>
        <button data-action="correct" ${canGrade ? '' : 'disabled'}>Correct</button>
        <button data-action="wrong" ${canGrade ? '' : 'disabled'}>Wrong</button>
      </div>
      <div class="quiz-panel-footer">
        <button class="quiz-secondary-button" data-action="end">End quiz</button>
      </div>
    `;
  }

  #attachListeners(): void {
    this.#root.querySelector('[data-action="hide"]')?.addEventListener('click', () => this.hide());
    this.#root.querySelector('[data-action="start"]')?.addEventListener('click', () => this.#startQuiz());
    this.#root.querySelector('[data-action="end"]')?.addEventListener('click', () => this.#features.quiz.end());
    this.#root.querySelector('[data-action="reveal"]')?.addEventListener('click', () => this.#features.quiz.revealSelected());
    this.#root.querySelector('[data-action="correct"]')?.addEventListener('click', () => this.#features.quiz.markSelectedCorrect());
    this.#root.querySelector('[data-action="wrong"]')?.addEventListener('click', () => this.#features.quiz.markSelectedWrong());

    const percentInput = this.#root.querySelector('[data-role="hidden-percent"]') as HTMLInputElement | null;
    percentInput?.addEventListener('input', () => this.#syncInputs());
    const includeCentralInput = this.#root.querySelector('[data-role="include-central"]') as HTMLInputElement | null;
    includeCentralInput?.addEventListener('change', () => this.#syncInputs());

    const header = this.#root.querySelector('.quiz-panel-header');
    header?.addEventListener('mousedown', (event) => this.#startDrag(event as MouseEvent));
  }

  #startDrag(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;

    const panelRect = this.#root.getBoundingClientRect();
    this.#isDragging = true;
    this.#dragOffsetX = event.clientX - panelRect.left;
    this.#dragOffsetY = event.clientY - panelRect.top;

    document.addEventListener('mousemove', this.#handleDragMove);
    document.addEventListener('mouseup', this.#stopDrag);
    event.preventDefault();
  }

  #handleDragMove = (event: MouseEvent): void => {
    if (!this.#isDragging) return;

    this.#root.style.left = `${event.clientX - this.#dragOffsetX}px`;
    this.#root.style.top = `${event.clientY - this.#dragOffsetY}px`;
  };

  #stopDrag = (): void => {
    this.#isDragging = false;
    document.removeEventListener('mousemove', this.#handleDragMove);
    document.removeEventListener('mouseup', this.#stopDrag);
  };

  #startQuiz(): void {
    this.#syncInputs();
    this.#features.quiz.start({
      hiddenPercent: this.#hiddenPercent,
      includeCentralNodes: this.#includeCentral
    });
  }

  #syncInputs(): void {
    const percentInput = this.#root.querySelector('[data-role="hidden-percent"]') as HTMLInputElement | null;
    if (percentInput) {
      const value = Number(percentInput.value);
      if (Number.isFinite(value)) {
        this.#hiddenPercent = Math.max(1, Math.min(100, value));
      }
    }
    const includeCentralInput = this.#root.querySelector('[data-role="include-central"]') as HTMLInputElement | null;
    if (includeCentralInput) {
      this.#includeCentral = includeCentralInput.checked;
    }
  }

  #formatStatus(status: QuizSnapshot['selectedNodeStatus']): string {
    switch (status) {
      case 'hidden': return 'Hidden';
      case 'revealed': return 'Revealed';
      case 'correct': return 'Correct';
      case 'wrong': return 'Wrong';
      case 'not-hidden': return 'Not in quiz';
      default: return 'Select a node';
    }
  }

  #escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}