import type { NodeId, Scene } from '../../../core/main-types';
import type { ParsedMermaidEdge, ParsedMermaidNode } from '../flowchart';
import { layoutMermaidSceneNodesRadial, type RadialLayoutParams } from './radial';
import { layoutMermaidSceneNodesFlow } from './flow';

type MermaidSceneLayout = 'radial' | 'top-down' | 'left-right' | 'fan';

export function layoutMermaidSceneNodes(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  centralMermaidId: string,
  layout: MermaidSceneLayout,
  idByMermaidId: Map<string, NodeId>,
  radialParams: RadialLayoutParams
): Scene['nodes'] {
  if (layout === 'top-down' || layout === 'left-right') {
    return layoutMermaidSceneNodesFlow(nodes, edges, centralMermaidId, layout, idByMermaidId);
  }

  return layoutMermaidSceneNodesRadial(nodes, edges, centralMermaidId, idByMermaidId, radialParams);
}
