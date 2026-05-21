/**
 * Transition Invariants
 *
 * Post-transition consistency check: cy state must match the target scene record.
 * Catches silent corruption (missing/extra nodes or edges) before GraphSaver
 * resumes and persists the wrong state to the DB.
 *
 * Called at the end of each public transition path, just before resume().
 * Always runs — the cost is one set diff, the value is preventing data loss.
 */

import type { Core } from 'cytoscape';
import type { NodeId, EdgeId, Scene } from '../../core/main-types';

interface InvariantDiff {
  missingNodes: NodeId[];   // in scene, not in cy
  extraNodes: NodeId[];     // in cy, not in scene (includes leftover ghosts)
  missingEdges: EdgeId[];   // in scene, not in cy
  extraEdges: EdgeId[];     // in cy, not in scene (includes leftover ghosts)
}

function computeDiff(cy: Core, scene: Scene): InvariantDiff {
  const cyNodeIds = new Set(cy.nodes().map(n => n.id() as NodeId));
  const cyEdgeIds = new Set(cy.edges().map(e => e.id() as EdgeId));
  const sceneNodeIds = new Set(Object.keys(scene.nodes) as NodeId[]);
  const sceneEdgeIds = new Set(Object.keys(scene.edges) as EdgeId[]);

  return {
    missingNodes: [...sceneNodeIds].filter(id => !cyNodeIds.has(id)),
    extraNodes: [...cyNodeIds].filter(id => !sceneNodeIds.has(id)),
    missingEdges: [...sceneEdgeIds].filter(id => !cyEdgeIds.has(id)),
    extraEdges: [...cyEdgeIds].filter(id => !sceneEdgeIds.has(id)),
  };
}

/**
 * Verify cy matches the target scene. Logs an error with a structured diff
 * if they disagree. Does NOT throw — the next save would persist the wrong
 * state, but throwing here would skip graphSaver.resume() and leave the app
 * permanently suspended.
 *
 * @param context  Short label identifying the call site (for the log line).
 */
export function checkSceneInvariant(cy: Core, scene: Scene, context: string): void {
  const diff = computeDiff(cy, scene);
  const ok =
    diff.missingNodes.length === 0 &&
    diff.extraNodes.length === 0 &&
    diff.missingEdges.length === 0 &&
    diff.extraEdges.length === 0;

  if (ok) return;

  console.error(
    `[TransitionInvariant] cy/scene mismatch in ${context} (scene=${scene.id}). ` +
    `This will corrupt the scene record on the next save.`,
    diff
  );
}
