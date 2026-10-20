/**
 * Mobile viewer — startup (docs/mobile-viewer.md).
 *
 * A second page of the app. With `?graph=<library url>` it installs that
 * graph on the phone and reloads; without, it shows the graph already stored.
 * Step 1 shows the graph's title and node count; the map follows.
 *
 * The stores read IndexedDB the moment they are imported, so they are
 * imported only on the showing path, after any install has been written and
 * the page reloaded.
 */

import type { NodeId } from '../core/main-types';
import type { ColorTheme } from '../core/style-types';
import type { PhoneMap } from './phone-map';
import type { PaneName, Panes } from './panes';
import { installFromUrl, isLibraryUrl } from './install';

const GRAPH_PARAM = 'graph';
/** How long after the last resize event the map is laid out again. */
const RESIZE_SETTLE_MS = 150;

/** The `?graph=` URL, removed from the address so a reload does not reinstall; null when absent or not a library file. */
function consumeGraphUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(GRAPH_PARAM);
  if (raw === null) return null;
  params.delete(GRAPH_PARAM);
  const query = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
  return isLibraryUrl(raw) ? raw : null;
}

function setStatus(text: string): void {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = text;
  status.hidden = text === '';
}

async function install(url: string): Promise<void> {
  setStatus('Installing the graph…');
  try {
    await installFromUrl(url);
  } catch (err) {
    console.error('[viewer] Install failed', err);
    setStatus('Could not install the graph. Open it again from knogra.io.');
    return;
  }
  // The address no longer carries the parameter, so the reload shows what was installed.
  window.location.reload();
}

async function show(): Promise<void> {
  const { graphStore } = await import('../storage/graph-store');
  if (graphStore.nodes.length === 0) {
    setStatus('No graph on this phone yet. Open one from the library on knogra.io.');
    return;
  }
  // The anchor's map is the first map (§6); without an anchor, the first scene's central node stands in.
  const anchor = graphStore.nodes.find(node => node.isAnchor);
  const firstCentralId = graphStore.scenes[0]?.centralNodeId;
  const start = anchor ?? graphStore.nodes.find(node => node.id === firstCentralId) ?? graphStore.nodes[0];

  const [{ default: cytoscape }, { initializeMathJax }, { DOUBLE_CLICK_INTERVAL_MS }, { getTheme }, { PhoneMap }, { wireMapGestures, wirePaneSwipe }, { Panes }, { NotesPane }, { PhoneQuiz }, { QuizPane }] = await Promise.all([
    import('cytoscape'),
    import('../utils/mathjax'),
    import('../config/interaction-settings'),
    import('../styles/themes'),
    import('./phone-map'),
    import('./gestures'),
    import('./panes'),
    import('./notes-pane'),
    import('./quiz'),
    import('./quiz-pane'),
  ]);
  // Equation faces are compiled by MathJax; it must be ready before the first style is generated.
  await initializeMathJax();

  const container = document.getElementById('map');
  if (!container) throw new Error('Container #map not found');
  // The same instance options as the editor's map surface: the focus is pinned to the centre, the viewer neither pans nor zooms, and nothing is grabbable.
  const cy = cytoscape({
    container,
    style: [],
    layout: { name: 'preset', fit: false },
    userPanningEnabled: false,
    userZoomingEnabled: false,
    boxSelectionEnabled: false,
    // Landmarks can be dragged, to feel them, to peek under them, to clear room; the next travel tidies up (phone-map.ts).
    autoungrabify: false,
    multiClickDebounceTime: DOUBLE_CLICK_INTERVAL_MS,
  });

  const map = new PhoneMap(cy);
  // A rotation lays the shown map out again (§5.4). The event comes in bursts while the viewport settles; the last one counts.
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => void map.handleResize(), RESIZE_SETTLE_MS);
  });
  // The quiz (§10): over the map instance, in the map's theme. The gestures ask it which boxes are hidden.
  const quiz = new PhoneQuiz(cy, () => map.themeId);
  wireMapGestures(cy, map, quiz);
  wireBar(map, start.id);
  // The page takes the map's colours (§5.1): the variables viewer.css reads, set from the theme of every map shown.
  map.subscribe(() => applyViewerTheme(getTheme(map.themeId)));

  const strip = document.getElementById('panes');
  const quizRoot = document.getElementById('quiz-pane');
  const mapRoot = document.getElementById('map-pane');
  const notesRoot = document.getElementById('notes-pane');
  if (!strip || !quizRoot || !mapRoot || !notesRoot) throw new Error('Panes not found');
  const panes = new Panes(strip);
  // A finger that has hold of a box is dragging it, not swiping the strip.
  wirePaneSwipe(strip, panes, () => cy.nodes(':grabbed').length > 0);
  const notes = new NotesPane(notesRoot);
  // The notes pane follows the focus when opened (§9).
  panes.subscribe(pane => {
    if (pane === 'notes') void notes.showNode(map.focusNodeId);
  });
  wirePaneButtons(panes);

  // The notes are out of reach while a quiz runs (§10.2); starting a quiz brings the map, since that is where it happens.
  new QuizPane(quiz, quizRoot, mapRoot);
  const notesButton = document.querySelector<HTMLButtonElement>('#bar [data-action="notes"]');
  let quizWasActive = quiz.isActive();
  quiz.subscribe(snapshot => {
    panes.setLocked('notes', snapshot.active);
    if (notesButton) notesButton.disabled = snapshot.active;
    if (snapshot.active && !quizWasActive) panes.goTo('map');
    quizWasActive = snapshot.active;
  });

  try {
    await map.show(start.id);
    setStatus('');
  } catch (err) {
    console.error('[viewer] Could not show the map', err);
    setStatus('Could not draw the map.');
  }
}

/** The theme's colours as CSS variables on the root, so bars, buttons, counter and notes match the map. */
function applyViewerTheme(theme: ColorTheme): void {
  const root = document.documentElement.style;
  root.setProperty('--theme-canvas-raw', theme.canvas.background.color);
  root.setProperty('--theme-text', theme.node.text.color);
  root.setProperty('--theme-text-secondary', theme.node.textSecondary.color);
  root.setProperty('--theme-accent', theme.node.borderCentral.color);
  root.setProperty('--theme-line', theme.edge.line.color);
}

/** The buttons that move between panes (§8): Quiz and Notes on the bar, Map on each side pane's bar. */
function wirePaneButtons(panes: Panes): void {
  const bind = (selector: string, pane: PaneName): void => {
    for (const button of document.querySelectorAll<HTMLButtonElement>(selector)) {
      button.addEventListener('click', () => panes.goTo(pane));
    }
  };
  bind('#bar [data-action="quiz"]', 'quiz');
  bind('#bar [data-action="notes"]', 'notes');
  bind('.pane-bar [data-action="map"]', 'map');
}

/** The bar's buttons (§8): Back steps through the history, Home travels to the anchor; both grey when they would do nothing. */
/** Back and Home: one of each in the bar and in the quiz bar, wired alike, so the way home is there in both modes. */
function wireBar(map: PhoneMap, homeNodeId: NodeId): void {
  const backs = [...document.querySelectorAll<HTMLButtonElement>('#map-pane [data-action="back"]')];
  const homes = [...document.querySelectorAll<HTMLButtonElement>('#map-pane [data-action="home"]')];
  if (backs.length === 0 || homes.length === 0) throw new Error('Bar buttons not found');

  for (const back of backs) back.addEventListener('click', () => void map.back());
  for (const home of homes) home.addEventListener('click', () => void map.focusOn(homeNodeId));

  const refresh = (): void => {
    for (const back of backs) back.disabled = !map.canGoBack();
    for (const home of homes) home.disabled = map.focusNodeId === homeNodeId;
  };
  map.subscribe(refresh);
  refresh();
}

const graphUrl = consumeGraphUrl();
if (graphUrl) {
  await install(graphUrl);
} else {
  await show();
}
