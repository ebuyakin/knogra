/**
 * Map Bindings
 * The keys that mean something while the map view is shown, and the wall that
 * keeps every scene key from reaching a scene that is not on screen
 * (docs/map-view.md §7.4). Consulted first; claims every key while active.
 *
 * The map's keyboard is its own: the scene's bindings never run while it is
 * shown, so nothing here competes with them. Keys are chosen to read as their
 * scene counterparts do. Entering the map from a scene is the slash in
 * view-bindings.ts, a stopgap in the scene's exhausted namespace until the
 * leader key.
 */

import type { KeyboardContext } from '../keyboard-context';
import { getSetting } from '../../../config';

export async function handleMapKeys(context: KeyboardContext, event: KeyboardEvent, key: string, ctrl: boolean): Promise<boolean> {
  const { mapView } = context.features;
  if (!mapView.isActive()) return false;
  // Chords: settings, save and the diagnostics snapshot are the app's, not the
  // scene's, and pass on to the workspace keys. The rest are swallowed: opening
  // or replacing the workspace under a shown map has no map answer yet, and a
  // chord claimed without preventDefault would reach the browser.
  if (ctrl) {
    const passesThrough = key === ',' || key === 's' || (key === 'd' && event.shiftKey);
    if (passesThrough) return false;
    event.preventDefault();
    return true;
  }

  const step = getSetting('node.scaleStep');

  // Same characters and the same no-Shift-guard reasoning as the scene's
  // Enlarge / Shrink (scene-bindings.ts): `<` is unshifted on most ISO layouts.
  if (key === '<' || key === '>') {
    event.preventDefault();
    await mapView.scaleSelected(key === '>' ? step : 1 / step);
    return true;
  }

  // , and .: the selected boxes in or out, as the scene's tighten / spread; distance changes, size does not.
  if (key === ',' || key === '.') {
    event.preventDefault();
    await mapView.moveSelected(key === '.' ? step : 1 / step);
    return true;
  }

  // W: all landmarks, as the scene's W makes all nodes look bigger. M: all markers.
  if (key === 'w' || key === 'm') {
    event.preventDefault();
    await mapView.scaleGroup(key === 'w' ? 'landmarks' : 'markers', event.shiftKey ? 1 / step : step);
    return true;
  }

  // Arrows and h j k l walk the map as a tree, as the scene's move the selection between nodes: left and right
  // among siblings (landmarks around the focus, markers around their landmark), down out a level, up in a level.
  if (key === 'arrowright' || key === 'l' || key === 'arrowleft' || key === 'h') {
    event.preventDefault();
    mapView.selectSibling(key === 'arrowright' || key === 'l' ? 1 : -1);
    return true;
  }
  if (key === 'arrowdown' || key === 'j') {
    event.preventDefault();
    mapView.selectOutward();
    return true;
  }
  if (key === 'arrowup' || key === 'k') {
    event.preventDefault();
    mapView.selectInward();
    return true;
  }

  // Space: balloon the selected box if it is small, or collapse it; markers balloon on their own when the keyboard selects them.
  if (key === ' ') {
    event.preventDefault();
    mapView.toggleSelectedPreview();
    return true;
  }

  // G: re-focus on the selected landmark, as the scene's G goes to the selected node's scene.
  if (key === 'g') {
    event.preventDefault();
    const selected = mapView.selectedNodeId();
    if (selected !== null) await mapView.focusOn(selected);
    return true;
  }

  // [ ]: the map's own history, as the scene's [ ] walk the scene history.
  if (key === '[' || key === ']') {
    event.preventDefault();
    if (key === '[') await mapView.back();
    else await mapView.forward();
    return true;
  }

  // F: back to the base frame, where the scene's F fits to view. The map never reframes after an edit on its own.
  if (key === 'f' && !event.shiftKey) {
    event.preventDefault();
    mapView.reframe();
    return true;
  }

  // = and -: zoom about the focus, the scene's keys and step.
  if (key === '=' || key === '-') {
    event.preventDefault();
    const zoomStep = getSetting('interaction.zoomStep');
    mapView.zoom(key === '=' ? zoomStep : 1 / zoomStep);
    return true;
  }

  // Enter: the focus's study scene, created from the map if it has none (docs/map-view.md §8).
  if (key === 'enter') {
    event.preventDefault();
    await context.mapHandoff.leave();
    return true;
  }

  // Escape: an open balloon first, the map second, back to the scene it was entered from; one press, one outcome.
  if (key === 'escape') {
    event.preventDefault();
    if (mapView.hasPreview()) mapView.collapsePreview();
    else await context.mapHandoff.back();
    return true;
  }

  return true;
}
