/**
 * Debug Flags
 * 
 * Centralized control of diagnostic logging throughout the app.
 * All flags default to false. Enable at runtime from browser console:
 * 
 *   DEBUG.d_transition = true     // transition orchestration logs
 *   DEBUG.d_departure = true      // departure phase (flyOut, fadeOut)
 *   DEBUG.d_arrival = true        // arrival phase (flyIn, fadeIn)
 *   DEBUG.d_analyzer = true       // edge crossfade/tween classification
 *   DEBUG.d_ghost = true          // ghost element stylesheet diagnostics
 *   DEBUG.d_edgeStyle = true      // edge style update diagnostics
 *   DEBUG.d_saver = true          // graph saver sync cycle logs
 *   DEBUG.d_store = true          // graph store operations
 *   DEBUG.d_style = true          // stylesheet rule updates
 *   DEBUG.d_scene = true          // scene operations
 *   DEBUG.d_background = true     // background renderer/animator logs
 *   DEBUG.d_chat = true           // chat session logs
 *   DEBUG.d_nav = true            // keyboard arrow-key navigation logs
 *   DEBUG.d_fold = true           // fold/unfold state and transition reclassification
 *   DEBUG.d_shelf = true          // AI node shelf operations
 *   DEBUG.d_deletion = true       // node cascade deletion
 *   DEBUG.all = true              // enable everything
 */

interface DebugFlags {
  /** Transition orchestration (transition.ts, phase-orchestrator.ts) */
  d_transition: boolean;
  /** Departure phase: flyOut, fadeOut (departure-animator.ts) */
  d_departure: boolean;
  /** Arrival phase: flyIn, fadeIn (arrival-animator.ts) */
  d_arrival: boolean;
  /** Transition analyzer: edge classification (transition-analyzer.ts) */
  d_analyzer: boolean;
  /** Ghost element setup/cleanup (shared-core-animator.ts) */
  d_ghost: boolean;
  /** Edge style update diagnostics (scene.ts updateEdgeStyle) */
  d_edgeStyle: boolean;
  /** GraphSaver sync cycle (graph-saver.ts) */
  d_saver: boolean;
  /** GraphStore operations (graph-store.ts) */
  d_store: boolean;
  /** StyleGenerator rule operations (style-generator.ts) */
  d_style: boolean;
  /** Scene operations (scene.ts) */
  d_scene: boolean;
  /** Background renderer/animator */
  d_background: boolean;
  /** Chat session (chat-session.ts) */
  d_chat: boolean;
  /** Image retrieval (ai/image-search/) */
  d_image: boolean;
  /** Keyboard arrow-key navigation (keyboard-handler.ts) */
  d_nav: boolean;
  /** Fold/unfold: state application, transition reclassification */
  d_fold: boolean;
  /** AI node shelf: filtering, placement, animations */
  d_shelf: boolean;
  /** Node cascade deletion */
  d_deletion: boolean;
  /** Master switch — enables all flags */
  all: boolean;
}

export const DEBUG: DebugFlags = {
  d_transition: false,   // transition orchestr — phase boundaries, scene entry/exit
  d_departure: false,
  d_arrival: false,
  d_analyzer: false,
  d_ghost: false,
  d_edgeStyle: false,
  d_saver: false,
  d_store: false,
  d_style: false,
  d_scene: false,
  d_background: false,
  d_chat: false,
  d_image: false,
  d_nav: false,
  d_fold: false,         // fold/unfold state changes and transition reclassification
  d_shelf: false,
  d_deletion: false,
  all: false,
};

// Expose to browser console for runtime toggling
(window as any).DEBUG = DEBUG;

/**
 * Check if a specific debug flag is enabled.
 * Returns true if the specific flag OR the master 'all' flag is on.
 */
export function isDebug(flag: keyof Omit<DebugFlags, 'all'>): boolean {
  return DEBUG.all || DEBUG[flag];
}
