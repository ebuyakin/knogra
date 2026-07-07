/**
 * Scene-layout contract & shared I/O types
 *
 * The uniform shape every auto-layout algorithm conforms to. Algorithms are
 * pure functions of plain data → positions (relative to the central node at the
 * origin); all Cytoscape access stays in the `AutoLayout` feature class.
 *
 * See `docs/autolayout-architecture.md` §3.
 */

import type { NodeId } from '../../../core/main-types';

export interface Position {
  x: number;
  y: number;
}

export interface LayoutInputNode {
  id: NodeId;
  footprint: { width: number; height: number };
}

export interface LayoutInputEdge {
  sourceId: NodeId;
  targetId: NodeId;
  order: number;
}

/** Knobs shared across algorithms. A superset; each algorithm reads what it needs. */
export interface LayoutParams {
  /** Base radial distance between consecutive depth rings (px) — a minimum gap. */
  ringSpacing: number;
  /** Minimum gap enforced between sibling nodes on the same ring (px). */
  siblingGap: number;
}

export interface LayoutInput {
  nodes: LayoutInputNode[];
  edges: LayoutInputEdge[];
  /** The layout root, placed at the origin (0, 0). */
  centralId: NodeId;
  params: LayoutParams;
}

/** A pure layout: plain inputs → node positions relative to the central node. */
export type SceneLayoutFn = (input: LayoutInput) => Map<NodeId, Position>;

export interface SceneLayout {
  /** Stable key; also the persisted `autolayout.layoutType` value. */
  id: string;
  compute: SceneLayoutFn;
}
