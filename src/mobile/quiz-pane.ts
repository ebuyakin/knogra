/**
 * Quiz pane and the running-quiz controls (docs/mobile-viewer.md §10)
 *
 * The quiz pane is where a quiz is configured, started and ended. While a
 * quiz runs, the map pane shows Correct and Wrong in place of the bar and a
 * counter to read: over the top of the map upright, heading the button column
 * sideways. Both are drawn from the quiz's snapshot.
 */

import type { PhoneQuiz, PhoneQuizSnapshot } from './quiz';

/** What the field starts at (view.html) and what a blank field means. */
const DEFAULT_HIDDEN_PERCENT = 50;

interface QuizElements {
  pane: HTMLElement;
  percent: HTMLInputElement;
  eligible: HTMLElement;
  message: HTMLElement;
  start: HTMLButtonElement;
  end: HTMLButtonElement;
  counter: HTMLElement;
  bar: HTMLElement;
  quizBar: HTMLElement;
  correct: HTMLButtonElement;
  wrong: HTMLButtonElement;
}

function find<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Quiz pane: ${selector} not found`);
  return element;
}

export class QuizPane {
  #quiz: PhoneQuiz;
  #el: QuizElements;

  constructor(quiz: PhoneQuiz, quizPane: HTMLElement, mapPane: HTMLElement) {
    this.#quiz = quiz;
    this.#el = {
      pane: quizPane,
      percent: find(quizPane, '[data-role="hidden-percent"]'),
      eligible: find(quizPane, '[data-role="eligible"]'),
      message: find(quizPane, '[data-role="message"]'),
      start: find(quizPane, '[data-action="start"]'),
      end: find(quizPane, '[data-action="end"]'),
      counter: find(mapPane, '#quiz-counter'),
      bar: find(mapPane, '#bar'),
      quizBar: find(mapPane, '#quiz-bar'),
      correct: find(mapPane, '[data-action="correct"]'),
      wrong: find(mapPane, '[data-action="wrong"]'),
    };

    this.#el.start.addEventListener('click', () => this.#start());
    this.#el.end.addEventListener('click', () => this.#quiz.end());
    this.#el.correct.addEventListener('click', () => this.#quiz.markCorrect());
    this.#el.wrong.addEventListener('click', () => this.#quiz.markWrong());

    this.#quiz.subscribe(snapshot => this.#render(snapshot));
  }

  #start(): void {
    const percent = Number(this.#el.percent.value);
    this.#quiz.start({ hiddenPercent: Number.isFinite(percent) ? percent : DEFAULT_HIDDEN_PERCENT });
  }

  #render(snapshot: PhoneQuizSnapshot): void {
    const { active } = snapshot;
    this.#el.pane.classList.toggle('quiz-active', active);
    this.#el.eligible.textContent = `${snapshot.eligibleCount} nodes can be hidden`;
    this.#el.message.textContent = snapshot.message ?? '';
    this.#el.message.hidden = snapshot.message === null;
    this.#el.start.hidden = active;
    this.#el.end.hidden = !active;
    this.#el.percent.disabled = active;

    this.#el.bar.hidden = active;
    this.#el.quizBar.hidden = !active;
    if (!active) return;

    // Four parts; the stylesheet joins them in a line upright and stacks them sideways.
    const parts = [
      `${snapshot.remainingCount} left of ${snapshot.hiddenCount}`,
      `${snapshot.correctCount} right`,
      `${snapshot.wrongCount} wrong`,
      `${snapshot.skippedCount} skipped`,
    ];
    this.#el.counter.replaceChildren(
      ...parts.map(text => {
        const span = document.createElement('span');
        span.textContent = text;
        return span;
      })
    );
    // The verdict is taken once: both buttons wait for the next reveal.
    const awaitingVerdict = snapshot.selectedStatus === 'revealed';
    this.#el.correct.disabled = !awaitingVerdict;
    this.#el.wrong.disabled = !awaitingVerdict;
  }
}
