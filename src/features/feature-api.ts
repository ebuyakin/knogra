/**
 * Feature API
 * Facade for all feature modules
 */

import type { Core } from 'cytoscape';
import type { BackgroundRenderer } from '../background/background-renderer';
import { Scene } from './scene/scene';
import { SceneBackground } from './scene-background';
import { Node } from './node';
import { Edge } from './edge';
import { Graph } from './graph/graph';
import { Transition } from './transition/transition';
import { Path } from './path/path';
import { Quiz } from './quiz';
import { AutoLayout } from './autolayout/autolayout';
import { Arrange } from './arrange/arrange';

export class FeatureAPI {
  scene: Scene;
  sceneBackground: SceneBackground;
  node: Node;
  edge: Edge;
  graph: Graph;
  transition: Transition;
  path: Path;
  quiz: Quiz;
  autolayout: AutoLayout;
  arrange: Arrange;

  constructor(cy: Core, backgroundRenderer: BackgroundRenderer) {
    this.scene = new Scene(cy);
    this.sceneBackground = new SceneBackground(cy, backgroundRenderer);
    this.node = new Node(cy);
    this.edge = new Edge(cy);
    this.graph = new Graph(cy);
    this.transition = new Transition(cy, backgroundRenderer);
    this.path = new Path(cy);
    this.quiz = new Quiz(cy);
    this.autolayout = new AutoLayout(cy);
    this.arrange = new Arrange(cy);
  }
}
