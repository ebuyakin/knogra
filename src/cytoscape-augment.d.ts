/**
 * Type augmentation for cytoscape 3.33.x.
 *
 * `multiClickDebounceTime` exists at runtime (it is the window, in ms, within which two
 * clicks are synthesized into `dblclick`/`dbltap`) but is missing from the bundled
 * `index.d.ts`. Declared here so the option can be passed without casting.
 */
import 'cytoscape';

declare module 'cytoscape' {
  interface CytoscapeOptions {
    /** Window in ms for double-click/tap detection. Cytoscape default: 250. */
    multiClickDebounceTime?: number;
  }
}
