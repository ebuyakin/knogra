/**
 * Setting Definitions
 * UI metadata for the Settings Modal
 * 
 * Defines how settings are displayed: labels, descriptions, input types, constraints.
 * The actual default values are in the domain-specific files (transition-settings.ts, etc.)
 */

import type { SettingKey } from './index';
import type { ProviderType } from '../core/main-types';
import { PROVIDER_REGISTRY } from './ai-providers';
import { DESIGN_MANIFEST } from './design-manifest';
import { THEME_MANIFEST } from './theme-manifest';
import { AUTOLAYOUT_ALGORITHMS } from './autolayout-settings';
import { ARRIVAL_ANIMATORS, DEPARTURE_ANIMATORS, MORPHING_ANIMATORS } from './transition-settings';

// ============================================================================
// TYPES
// ============================================================================

export type SettingType = 'number' | 'boolean' | 'select' | 'string' | 'textarea' | 'stageTiming' | 'numberArray';

export interface SettingDefinition {
  key: SettingKey;
  label: string;
  description: string;
  type: SettingType;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: unknown; label: string }[];
  /** For stageTiming: hide the delay-after input (value stays 0) */
  hideDelay?: boolean;
}

export interface SettingCategory {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  children?: SettingCategory[];
  settings?: SettingDefinition[];
  /** Start with children hidden in the tree. */
  collapsed?: boolean;
}

// ============================================================================
// PROVIDER PARAMETERS
// ============================================================================

/**
 * Vendor-specific tuning, shown inside each provider's subsection.
 *
 * Kept here rather than on the registry descriptor: `ai-providers.ts` would have
 * to import `SettingDefinition` from this file, closing an import cycle. A
 * provider with nothing to tune simply has no entry.
 */
const PROVIDER_PARAMETERS: Partial<Record<ProviderType, SettingDefinition[]>> = {
  gemini: [
    {
      key: 'ai.webSearchEnabled',
      label: 'Web Search',
      description: 'Ground answers with Google Search results',
      type: 'boolean'
    },
    {
      key: 'ai.thinkingLevel',
      label: 'Thinking Level',
      description: 'Reasoning depth vs speed',
      type: 'select',
      options: [
        { value: 'minimal', label: 'Minimal — fastest' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High — most thorough' }
      ]
    }
  ],
  openai: [
    {
      key: 'ai.webSearchEnabled',
      label: 'Web Search',
      description: 'Let the model search the web before answering. Shared with Gemini',
      type: 'boolean'
    },
    {
      key: 'ai.openaiReasoningEffort',
      label: 'Reasoning Effort',
      description: 'Reasoning depth vs speed. Not every model accepts every level',
      type: 'select',
      options: [
        { value: 'none', label: 'None — no reasoning' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium — OpenAI\'s default' },
        { value: 'high', label: 'High' },
        { value: 'xhigh', label: 'Extra high' },
        { value: 'max', label: 'Max — most thorough' }
      ]
    }
  ],
  anthropic: [
    {
      key: 'ai.anthropicEffort',
      label: 'Effort',
      description: 'Caps total tokens spent, thinking included. Not every model accepts every level',
      type: 'select',
      options: [
        { value: 'low', label: 'Low — fastest' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High — Anthropic\'s default' },
        { value: 'xhigh', label: 'Extra high' },
        { value: 'max', label: 'Max — most thorough' }
      ]
    },
    {
      key: 'ai.anthropicMaxTokens',
      label: 'Max Output Tokens',
      description: 'Claude requires a reply cap. Counts thinking as well as visible text, so raise it alongside effort',
      type: 'number',
      min: 1024,
      max: 32768,
      step: 1024
    }
  ]
};

// ============================================================================
// DEFINITIONS
// ============================================================================

export const SETTING_CATEGORIES: SettingCategory[] = [
  {
    id: 'nodes',
    label: 'Nodes',
    icon: '◇',
    children: [
      {
        id: 'node-interaction',
        label: 'Interaction',
        settings: [
          {
            key: 'interaction.doubleClickNode',
            label: 'Double-click on node',
            description: 'Edit: opens the node editor. Navigate: goes to the node\'s scene (same as G key)',
            type: 'select',
            options: [
              { value: 'edit', label: 'Edit node' },
              { value: 'navigate', label: 'Go to scene' }
            ]
          },
          {
            key: 'interaction.zoomStep',
            label: 'Zoom step',
            description: 'Multiplier for +/- zoom (applied to current scene and all-scenes zoom)',
            type: 'number',
            min: 1.05,
            max: 3,
            step: 0.05
          },
          {
            key: 'node.scaleStep',
            label: 'Node scale step',
            description: 'Multiplier for the < / > shortcut that shrinks or enlarges the selected nodes. The selection scales as a group and stops when the first node reaches the size limit.',
            type: 'number',
            min: 1.02,
            max: 2,
            step: 0.05
          }
        ]
      },
      {
        id: 'node-creation',
        label: 'Creation',
        settings: [
          {
            key: 'node.inheritDesignFromSelected',
            label: 'Inherit Design from Selected',
            description: 'When adding a free node, inherit design from currently selected node',
            type: 'boolean'
          },
          {
            key: 'node.inheritDesignForConnected',
            label: 'Inherit Design for Child/Parent',
            description: 'When adding a child or parent, inherit design from the source node',
            type: 'boolean'
          },
          {
            key: 'node.defaultDesign',
            label: 'Default Design',
            description: 'Design to use when not inheriting (or no node selected)',
            type: 'select',
            options: DESIGN_MANIFEST.map(d => ({ value: d.id, label: d.label }))
          },
          {
            key: 'node.equationDesign',
            label: 'Equation Design',
            description: 'Design to use when Add Equation or Replace Equation imports an equation into a node',
            type: 'select',
            options: DESIGN_MANIFEST.map(d => ({ value: d.id, label: d.label }))
          },
          {
            key: 'node.spacing',
            label: 'Node Spacing',
            description: 'How far a newly added child/parent is placed from its source node (1.0 = default; lower packs tighter). Affects newly placed nodes only.',
            type: 'number',
            min: 0.2,
            max: 3,
            step: 0.1
          }
        ]
      },
      {
        id: 'node-images',
        label: 'Images',
        settings: [
          {
            key: 'node.imageSizeSmall',
            label: 'Small Image Width',
            description: 'Base render width in pixels for a small node image. Height follows from the image\'s aspect ratio, and the node\'s scale applies on top.',
            type: 'number',
            min: 24,
            max: 512,
            step: 4
          },
          {
            key: 'node.imageSizeMedium',
            label: 'Medium Image Width',
            description: 'Base render width in pixels for a medium node image',
            type: 'number',
            min: 24,
            max: 512,
            step: 4
          },
          {
            key: 'node.imageSizeLarge',
            label: 'Large Image Width',
            description: 'Base render width in pixels for a large node image',
            type: 'number',
            min: 24,
            max: 1024,
            step: 4
          },
          {
            key: 'node.imageMaxKB',
            label: 'Image Size Limit (KB)',
            description: 'Largest accepted SVG source, in kilobytes. A guard against a workspace filling up with oversized images, not a limit on how detailed a drawing may be.',
            type: 'number',
            min: 4,
            max: 1024,
            step: 16
          }
        ]
      },
      {
        id: 'fold',
        label: 'Fold/Unfold',
        settings: [
          {
            key: 'fold.collapseDuration',
            label: 'Collapse Duration',
            description: 'Animation duration for collapsing nodes (ms)',
            type: 'number',
            min: 100,
            max: 2000,
            step: 50
          },
          {
            key: 'fold.expandDuration',
            label: 'Expand Duration',
            description: 'Animation duration for expanding nodes (ms)',
            type: 'number',
            min: 100,
            max: 2000,
            step: 50
          },
          {
            key: 'fold.bulkUnfoldDuration',
            label: 'Bulk Unfold Duration',
            description: 'Per-root grow duration for "Unfold all" (Shift+Z) (ms)',
            type: 'number',
            min: 50,
            max: 2000,
            step: 50
          },
          {
            key: 'fold.collapseEdgeFadeDelay',
            label: 'Collapse Edge Fade Delay',
            description: 'Delay after fading edges before collapse starts (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'fold.expandEdgeFadeDelay',
            label: 'Expand Edge Fade Delay',
            description: 'Delay before fading in edges after expansion (ms)',
            type: 'number',
            min: 0,
            max: 1000,
            step: 50
          },
          {
            key: 'fold.minRadiusMultiplier',
            label: 'Minimum Radius Multiplier',
            description: 'Children placed at least (parentSize × multiplier) away',
            type: 'number',
            min: 0.5,
            max: 3.0,
            step: 0.1
          },
          {
            key: 'fold.expandShowAllEdges',
            label: 'Show All Edges on Expand',
            description: 'Include all edges when expanding, not just parent→child',
            type: 'boolean'
          },
          {
            key: 'fold.collapseRemoveAll',
            label: 'Collapse Removes All',
            description: 'Remove all descendants on collapse, ignoring external edges',
            type: 'boolean'
          }
        ]
      }
    ]
  },
  {
    id: 'edges',
    label: 'Edges',
    icon: '◇',
    description: 'Default visual style for new edges',
    settings: [
      {
        key: 'edge.defaultColor',
        label: 'Color',
        description: 'Default edge line color (hex)',
        type: 'string'
      },
      {
        key: 'edge.defaultWidth',
        label: 'Width',
        description: 'Default edge thickness in pixels',
        type: 'number',
        min: 0.5, max: 20, step: 0.5
      },
      {
        key: 'edge.defaultOpacity',
        label: 'Opacity',
        description: 'Default transparency (0.0 - 1.0)',
        type: 'number',
        min: 0, max: 1, step: 0.1
      },
      {
        key: 'edge.defaultCurveStyle',
        label: 'Curve Style',
        description: 'Default shape algorithm for edges',
        type: 'select',
        options: [
          { value: 'straight', label: 'Straight' },
          { value: 'bezier', label: 'Bezier' },
          { value: 'unbundled-bezier', label: 'Unbundled Bezier' },
          { value: 'round-segments', label: 'Round Segments' },
          { value: 'taxi', label: 'Taxi' }
        ]
      },
      {
        key: 'edge.defaultArrowShape',
        label: 'Arrow Shape',
        description: 'Default target arrow',
        type: 'select',
        options: [
          { value: 'triangle', label: 'Triangle' },
          { value: 'vee', label: 'Vee' },
          { value: 'circle', label: 'Circle' },
          { value: 'none', label: 'None' }
        ]
      },
      {
        key: 'edge.defaultArrowScale',
        label: 'Arrow Scale',
        description: 'Default arrow size multiplier',
        type: 'number',
        min: 0.1, max: 5, step: 0.1
      },
      {
        key: 'edge.bezierControlDistances',
        label: 'Bezier Control Distances',
        description: 'Default control point distances (comma-separated)',
        type: 'numberArray'
      },
      {
        key: 'edge.bezierControlWeights',
        label: 'Bezier Control Weights',
        description: 'Default control point weights, 0.0–1.0 (comma-separated)',
        type: 'numberArray'
      },
      {
        key: 'edge.segmentRadii',
        label: 'Segment Radii',
        description: 'Default corner radii for round-segments (comma-separated)',
        type: 'numberArray'
      },
      {
        key: 'edge.taxiRadius',
        label: 'Taxi Turn Radius',
        description: 'Default radius for taxi-style turns',
        type: 'number',
        min: 0, max: 100, step: 1
      },
      {
        key: 'edge.taxiDirection',
        label: 'Taxi Direction',
        description: 'Default taxi routing direction',
        type: 'select',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'vertical', label: 'Vertical' },
          { value: 'downward', label: 'Downward' },
          { value: 'rightward', label: 'Rightward' },
          { value: 'leftward', label: 'Leftward' },
          { value: 'upward', label: 'Upward' }
        ]
      }
    ]
  },
  {
    id: 'transitions',
    label: 'Transitions',
    icon: '◇',
    settings: [
      {
        key: 'transition.transitionMode',
        label: 'Transition Mode',
        description: 'Animated: three-phase transitions with spatial continuity. Fade: quick crossfade between scenes (faster for editing)',
        type: 'select',
        options: [
          { value: 'animated', label: 'Animated' },
          { value: 'fade', label: 'Fade (quick)' }
        ]
      },
      {
        key: 'transition.departureAnimator',
        label: 'Departure',
        description: 'How nodes that are not in the next scene leave',
        type: 'select',
        options: DEPARTURE_ANIMATORS.map(animator => ({ value: animator.id, label: animator.label }))
      },
      {
        key: 'transition.morphingAnimator',
        label: 'Morphing',
        description: 'How nodes in both scenes move to their new places',
        type: 'select',
        options: MORPHING_ANIMATORS.map(animator => ({ value: animator.id, label: animator.label }))
      },
      {
        key: 'transition.arrivalAnimator',
        label: 'Arrival',
        description: 'How nodes new to the next scene appear',
        type: 'select',
        options: ARRIVAL_ANIMATORS.map(animator => ({ value: animator.id, label: animator.label }))
      }
    ],
    children: [
      {
        id: 'departure-phase',
        label: 'Departure',
        settings: [
          {
            key: 'transition.departureEdgeTiming',
            label: 'Edge Timing Mode',
            description: 'When edges fade out relative to nodes',
            type: 'select',
            options: [
              { value: 'before', label: 'Before — edges fade, then nodes fly out' },
              { value: 'parallel', label: 'Parallel — edges fade with nodes' }
            ]
          },
          {
            key: 'transition.departureEdgesFadeOut',
            label: '1.1: Edges Fade Out',
            description: 'Edges to departing nodes fade out [duration, delay] in ms',
            type: 'stageTiming'
          },
          {
            key: 'transition.departureLayerDuration',
            label: '1.2: Layer Duration',
            description: 'Fly-out animation duration per cascade layer [duration, delay] in ms',
            type: 'stageTiming',
            hideDelay: true
          },
          {
            key: 'transition.departureLayerStagger',
            label: '1.2: Layer Stagger',
            description: 'Delay between cascade layers starting [delay, unused] in ms',
            type: 'stageTiming',
            hideDelay: true
          },
          {
            key: 'transition.departureCentralZoomOut',
            label: '1.2.B.2: Central Zoom Out',
            description: 'Old central node shrinks (when departing) [duration, delay] in ms',
            type: 'stageTiming'
          }
        ]
      },
      {
        id: 'shared-phase',
        label: 'Morphing',
        settings: [
          {
            key: 'transition.morphDuration',
            label: 'Total Duration',
            description: 'Total duration of the morphing phase, the shared nodes moving and rescaling [duration, delay] (ms)',
            type: 'stageTiming'
          },
          {
            key: 'transition.morphCrossfadeOverlap',
            label: 'Crossfade Overlap',
            description: 'How much the fade-out and fade-in overlap (negative = gap between them)',
            type: 'number',
            min: -100, max: 100, step: 5
          },
          // LEGACY SETTINGS (kept for compatibility)
          {
            key: 'transition.sharedBackgroundTiming',
            label: 'Background Timing Mode',
            description: 'How background transitions during shared movement',
            type: 'select',
            options: [
              { value: 'sequential', label: 'Sequential — fade out, move, fade in' },
              { value: 'parallel', label: 'Parallel — crossfade with movement' }
            ]
          },
          {
            key: 'transition.sharedBgFadeOut',
            label: 'Background Fade Out',
            description: 'Old background fades out [duration, delay] in ms',
            type: 'stageTiming'
          },
          {
            key: 'transition.sharedBgFadeIn',
            label: 'Background Fade In',
            description: 'New background fades in [duration, delay] in ms',
            type: 'stageTiming'
          }
        ]
      },
      {
        id: 'arrival-phase',
        label: 'Arrival',
        settings: [
          {
            key: 'transition.arrivalEdgeTiming',
            label: 'Edge Timing Mode',
            description: 'When edges fade in relative to nodes',
            type: 'select',
            options: [
              { value: 'after', label: 'After — nodes fly in, then edges fade' },
              { value: 'parallel', label: 'Parallel — edges fade with nodes' }
            ]
          },
          {
            key: 'transition.arrivalLayerDuration',
            label: '3.1: Layer Duration',
            description: 'Fly-in animation duration per cascade layer [duration, delay] in ms',
            type: 'stageTiming',
            hideDelay: true
          },
          {
            key: 'transition.arrivalLayerStagger',
            label: '3.1: Layer Stagger',
            description: 'Delay between cascade layers starting [delay, unused] in ms',
            type: 'stageTiming',
            hideDelay: true
          },
          {
            key: 'transition.arrivalEdgesFadeIn',
            label: '3.2: Edges Fade In',
            description: 'Edges to new nodes fade in [duration, delay] in ms',
            type: 'stageTiming'
          }
        ]
      },
      {
        id: 'open-scene-timings',
        label: 'Open Scene',
        settings: [
          {
            key: 'transition.openBgFadeIn',
            label: 'Background Fade In',
            description: 'Background image fades in [duration, delay] in ms',
            type: 'stageTiming'
          },
          {
            key: 'transition.openCentralZoomIn',
            label: 'Central Node Zoom In',
            description: 'Central node zooms in at position [duration, delay] in ms',
            type: 'stageTiming'
          },
          {
            key: 'transition.openCentralFlyIn',
            label: 'Central Node Fly In',
            description: 'Central node flies from center (unused) [duration, delay] in ms',
            type: 'stageTiming'
          },
          {
            key: 'transition.openLayerDuration',
            label: 'Layer Duration',
            description: 'Fly-in animation duration per cascade layer [duration] in ms',
            type: 'stageTiming',
            hideDelay: true
          },
          {
            key: 'transition.openLayerStagger',
            label: 'Layer Stagger',
            description: 'Delay between cascade layers starting [delay] in ms',
            type: 'stageTiming',
            hideDelay: true
          },
          {
            key: 'transition.openEdgesFadeIn',
            label: 'Edges Fade In',
            description: 'Edges fade in after nodes [duration, delay] in ms',
            type: 'stageTiming'
          },
          {
            key: 'transition.openEdgeMode',
            label: 'Edge Animation Mode',
            description: 'When edges fade in during scene open',
            type: 'select',
            options: [
              { value: 'sequential', label: 'Sequential — after nodes fly in' },
              { value: 'parallel', label: 'Parallel — with nodes flying in' }
            ]
          }
        ]
      },
      {
        id: 'transition-close-scene',
        label: 'Close Scene',
        settings: [
          {
            key: 'transition.closeLayerDuration',
            label: 'Layer Duration',
            description: 'Fly-out animation duration per cascade layer [duration] in ms',
            type: 'stageTiming',
            hideDelay: true
          },
          {
            key: 'transition.closeLayerStagger',
            label: 'Layer Stagger',
            description: 'Delay between cascade layers starting [delay] in ms',
            type: 'stageTiming',
            hideDelay: true
          },
          {
            key: 'transition.closeCentralFadeOut',
            label: 'Central Fade Out',
            description: 'Central node shrinks/fades + background fades out [duration, delay] in ms',
            type: 'stageTiming'
          }
        ]
      }
    ]
  },

  {
    id: 'autolayout',
    label: 'Auto-layout',
    icon: '◇',
    description: 'Automatic re-arrangement of the current scene into a regular radial shape, rooted at the scene\'s central node.',
    settings: [
      {
        key: 'autolayout.layoutType',
        label: 'Layout',
        description: 'Arrangement algorithm (more to come)',
        type: 'select',
        options: AUTOLAYOUT_ALGORITHMS.map(algorithm => ({ value: algorithm.id, label: algorithm.label }))
      },
      {
        key: 'autolayout.ringSpacing',
        label: 'Ring Spacing',
        description: 'Base distance between concentric depth rings (px)',
        type: 'number',
        min: 80,
        max: 600,
        step: 10
      },
      {
        key: 'autolayout.siblingGap',
        label: 'Sibling Gap',
        description: 'Minimum gap between neighbouring nodes on a ring (px)',
        type: 'number',
        min: 0,
        max: 300,
        step: 5
      },
      {
        key: 'autolayout.footprintScale',
        label: 'Density',
        description: 'Scales reserved node footprint; below 1 packs rings and siblings tighter',
        type: 'number',
        min: 0.1,
        max: 2,
        step: 0.05
      },
      {
        key: 'autolayout.ringOrder',
        label: 'Ring Order',
        description: 'How nodes are sequenced around a ring. "Preserve current angular order" keeps the clockwise order you arranged by hand — drag nodes into the order you want, then re-run.',
        type: 'select',
        options: [
          { value: 'edge', label: 'Edge order' },
          { value: 'angular', label: 'Preserve current angular order (default)' }
        ]
      },
      {
        key: 'autolayout.rotateStep',
        label: 'Rotate Step',
        description: 'Angle (degrees) the scene rotates per Rotate command',
        type: 'number',
        min: 1,
        max: 180,
        step: 1
      },
      {
        key: 'autolayout.densityStep',
        label: 'Node Size Step',
        description: 'Factor the nodes grow or shrink by per Enlarge/Shrink command; below 2, above 1. Node positions on screen stay put — only their apparent size changes. The opposite command exactly reverses it.',
        type: 'number',
        min: 1.01,
        max: 2,
        step: 0.01
      },
      {
        key: 'autolayout.animate',
        label: 'Animate',
        description: 'Animate nodes to their new positions instead of snapping',
        type: 'boolean'
      },
      {
        key: 'autolayout.animationDuration',
        label: 'Animation Duration',
        description: 'Duration of the re-arrangement animation (ms)',
        type: 'number',
        min: 0,
        max: 3000,
        step: 50
      },
      {
        key: 'autolayout.growDirection',
        label: 'Grow Direction',
        description: 'Grow & Arrange: which neighbours to pull in from the central node',
        type: 'select',
        options: [
          { value: 'both', label: 'Both (undirected)' },
          { value: 'children', label: 'Children (outgoing)' },
          { value: 'parents', label: 'Parents (incoming)' }
        ]
      },
      {
        key: 'autolayout.growConfirmThreshold',
        label: 'Grow Confirm Threshold',
        description: 'Grow & Arrange: confirm before adding more than this many nodes to the scene',
        type: 'number',
        min: 0,
        max: 500,
        step: 5
      }
    ]
  },

  {
    id: 'map',
    label: 'Helicopter view',
    icon: '◇',
    description: 'A map of one node: the focus in the middle, its landmarks (direct neighbours) on a ring around it, and each landmark\'s markers (the neighbours\' neighbours, as miniatures) in a fan beside it. Every edge keeps one direction across all maps, so moving from map to map never turns anything; distances and sizes are adjustable per map.',
    settings: [
      {
        key: 'map.baseZoom',
        label: 'Base Zoom',
        description: 'Zoom of the map. At 1 a node is the size its design specifies, as in a scene at zoom 1. The one knob for screen size',
        type: 'number',
        min: 0.25,
        max: 3,
        step: 0.05
      },
      {
        key: 'map.themeMode',
        label: 'Theme',
        description: 'One theme for every map, or the theme of the focus\'s own scene',
        type: 'select',
        options: [
          { value: 'fixed', label: 'Fixed theme for all maps' },
          { value: 'scene', label: 'Follow the focus\'s scene' }
        ]
      },
      {
        key: 'map.themeId',
        label: 'Fixed Theme',
        description: 'The theme every map uses when Theme is fixed',
        type: 'select',
        options: THEME_MANIFEST.map(theme => ({ value: theme.id, label: theme.label }))
      }
    ],
    children: [
      {
        id: 'map-ring',
        label: 'Ring',
        settings: [
          {
            key: 'map.ringRadius',
            label: 'Ring Radius',
            description: 'How far the landmarks sit from the focus, as a fraction of half the screen height; the distance straight above or below the focus',
            type: 'number',
            min: 0.2,
            max: 1,
            step: 0.05
          },
          {
            key: 'map.horizontalStretch',
            label: 'Horizontal Stretch',
            description: 'Widens the ring sideways into an ellipse. 1 is a circle; the screen\'s own aspect fills its width',
            type: 'number',
            min: 1,
            max: 3,
            step: 0.05
          }
        ]
      },
      {
        id: 'map-landmarks',
        label: 'Landmarks',
        settings: [
          {
            key: 'map.landmarkFloor',
            label: 'Landmark Scale Floor',
            description: 'The smallest a crowded landmark may shrink to, as a fraction of full size: the readable floor. Crowded landmarks are first turned apart (Landmark Deviation) to keep it',
            type: 'number',
            min: 0.2,
            max: 1,
            step: 0.05
          },
          {
            key: 'map.landmarkDeviation',
            label: 'Landmark Deviation',
            description: 'How far a landmark may be drawn away from its stored direction so that crowded landmarks stay readable, in degrees; the stored direction is not changed, and the clockwise order never is. 0 draws every landmark exactly where its direction says',
            type: 'number',
            min: 0,
            max: 90,
            step: 5
          },
          {
            key: 'map.arcLandmarkShare',
            label: 'Sector: Landmark Share',
            description: 'Each landmark owns a sector of the ring, divided by weight between the landmark itself, a marker on each side, the clearance on each side and breathing space on each side; what does not fit its share shrinks. This is the landmark\'s weight',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05
          },
          {
            key: 'map.arcMarkerShare',
            label: 'Sector: Marker Share',
            description: 'The weight of a marker beside the landmark, counted on both sides',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05
          },
          {
            key: 'map.arcClearanceShare',
            label: 'Sector: Clearance Share',
            description: 'The weight of the gap between the landmark and its markers, counted on both sides; a narrow sector squeezes it first',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05
          },
          {
            key: 'map.arcBreathingShare',
            label: 'Sector: Breathing Share',
            description: 'The weight of the air between one landmark\'s fan and the next, counted on both sides',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05
          }
        ]
      },
      {
        id: 'map-markers',
        label: 'Markers',
        settings: [
          {
            key: 'map.markerScale',
            label: 'Marker Scale',
            description: 'A marker\'s size as a fraction of its landmark\'s, before crowding shrinks it',
            type: 'number',
            min: 0.1,
            max: 1,
            step: 0.05
          },
          {
            key: 'map.markerGap',
            label: 'Marker Gap',
            description: 'Least space between neighbouring markers of one landmark, as a fraction of their size; they shrink until it holds',
            type: 'number',
            min: 0,
            max: 3,
            step: 0.05
          },
          {
            key: 'map.scaleFloor',
            label: 'Marker Scale Floor',
            description: 'The smallest a crowded marker may shrink to, as a fraction of Marker Scale; below it, overlap is accepted',
            type: 'number',
            min: 0.05,
            max: 1,
            step: 0.05
          },
          {
            key: 'map.leafClearance',
            label: 'Leaf Clearance',
            description: 'Gap between a landmark and its markers when there is room, as a fraction of the landmark\'s height; a narrow sector lowers it',
            type: 'number',
            min: 0,
            max: 3,
            step: 0.05
          },
          {
            key: 'map.leafAspect',
            label: 'Leaf Aspect',
            description: 'The shape of the ellipse a landmark\'s markers sit on: its length away from the focus as a multiple of its width. 1 is round',
            type: 'number',
            min: 0.5,
            max: 4,
            step: 0.1
          },
          {
            key: 'map.previewScale',
            label: 'Preview Scale',
            description: 'The size a small box grows to when right-clicked or double-clicked, so it can be read in place; every marker, and any landmark that crowding shrank below this',
            type: 'number',
            min: 0.2,
            max: 2,
            step: 0.05
          }
        ]
      },
      {
        id: 'map-directions',
        label: 'Directions',
        settings: [
          {
            key: 'map.twinAllowance',
            label: 'Twin Allowance',
            description: 'How far the two ends of an edge may point away from exactly opposite, in degrees, so that each node can arrange its own neighbours. 0 keeps them rigidly opposite; higher lets the line between two focuses turn by more on a re-focus',
            type: 'number',
            min: 0,
            max: 90,
            step: 5
          },
          {
            key: 'map.resetKeepsOrder',
            label: 'Reset Keeps Order',
            description: 'Resetting directions re-spaces landmarks and markers evenly in the clockwise order they have now, so a sequence you arranged by dragging survives the tidying. Off: directions are chosen afresh, order not kept',
            type: 'boolean'
          }
        ]
      },
      {
        id: 'map-lines',
        label: 'Lines',
        settings: [
          {
            key: 'map.lineScalePower',
            label: 'Line Scale Power',
            description: 'How much a line thins with the box it leads to: its width and arrow are multiplied by the box\'s scale to this power. 1 fully proportional, 0 never',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05
          }
        ]
      },
      {
        id: 'map-animation',
        label: 'Animation',
        settings: [
          {
            key: 'map.animate',
            label: 'Animate',
            description: 'Animate re-focusing and resetting instead of snapping',
            type: 'boolean'
          },
          {
            key: 'map.departDuration',
            label: 'Depart Duration',
            description: 'Leaving markers slide into their landmarks and fade (ms); also the markers folding away before leaving the map',
            type: 'number',
            min: 0,
            max: 2000,
            step: 50
          },
          {
            key: 'map.moveDuration',
            label: 'Move Duration',
            description: 'Every remaining box moves and resizes in one movement (ms); also a reset',
            type: 'number',
            min: 0,
            max: 3000,
            step: 50
          },
          {
            key: 'map.arriveDuration',
            label: 'Arrive Duration',
            description: 'New markers slide out of their landmarks and fade in (ms); also the markers growing out after entering the map',
            type: 'number',
            min: 0,
            max: 2000,
            step: 50
          },
          {
            key: 'map.phasePause',
            label: 'Pause Between Phases',
            description: 'Hold between depart, move and arrive (ms); 0 normally, raise it to watch each phase',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          }
        ]
      }
    ]
  },

  {
    id: 'arrange',
    label: 'Arrange',
    icon: '◇',
    description: 'Geometric tools that act on the selected nodes only, anchored on their own centre — align, circle, rotate, and spacing. Distinct from Auto-layout, which re-arranges the whole scene around its central node.',
    settings: [
      {
        key: 'arrange.spacingStep',
        label: 'Spacing Step',
        description: 'Factor the distance between selected nodes changes by per Tighten/Spread command; below 2, above 1. Node size is unaffected. The opposite command exactly reverses it.',
        type: 'number',
        min: 1.01,
        max: 2,
        step: 0.01
      },
      {
        key: 'arrange.rotateStep',
        label: 'Rotate Step',
        description: 'Angle (degrees) the selected nodes turn by per Rotate command, about their own centre. Separate from the scene Rotate Step, which turns the whole scene about its central node.',
        type: 'number',
        min: 1,
        max: 180,
        step: 1
      }
    ]
  },

  {
    id: 'ai-providers',
    label: 'AI Providers',
    icon: '◇',
    collapsed: true,
    settings: [
      {
        key: 'ai.provider',
        label: 'AI Provider',
        description: 'Which AI service to use',
        type: 'select',
        options: PROVIDER_REGISTRY.map(provider => ({ value: provider.type, label: provider.label }))
      }
    ],
    children: PROVIDER_REGISTRY.map((provider): SettingCategory => ({
      id: `ai-provider-${provider.type}`,
      label: provider.label,
      settings: [
        {
          key: provider.apiKeySettingKey,
          label: provider.apiKeyLabel,
          description: provider.apiKeyDescription,
          type: 'string'
        },
        {
          key: provider.modelSettingKey,
          label: provider.modelLabel,
          description: `Model name (e.g. ${provider.defaultModel})`,
          type: 'string'
        },
        ...(PROVIDER_PARAMETERS[provider.type] ?? [])
      ]
    }))
  },
  {
    id: 'ai-chat',
    label: 'AI Chat',
    icon: '◇',
    settings: [
      {
        key: 'ai.chatScrollPosition',
        label: 'Chat Scroll Position',
        description: 'Where to scroll when opening a scene\'s chat: bottom (latest messages) or top (first messages)',
        type: 'select',
        options: [
          { value: 'bottom', label: 'Bottom (latest)' },
          { value: 'top', label: 'Top (first)' }
        ]
      },
      {
        key: 'ai.responseLanguage',
        label: 'Response Language',
        description: 'Language for AI responses and node suggestions (empty = English)',
        type: 'string'
      },
      {
        key: 'ai.customInstructions',
        label: 'Custom Instructions',
        description: 'Additional instructions appended to the AI\'s system prompt. Set a personal style, domain assumptions, or response preferences. Saved per workspace.',
        type: 'textarea',
        placeholder: 'e.g. Respond in a Socratic style, or: Assume I have a PhD in physics'
      },
      {
        key: 'ai.scenePromptInstructions',
        label: 'Scene Shortcut Additions',
        description: 'Additional instructions appended only when using the Scene shortcut.',
        type: 'textarea',
        placeholder: 'e.g. Evaluate the scene structure before explaining missing context.'
      },
      {
        key: 'ai.nodePromptInstructions',
        label: 'Node Shortcut Additions',
        description: 'Additional instructions appended only when using the Node shortcut.',
        type: 'textarea',
        placeholder: 'e.g. Use intuitive examples first, then give a concise technical summary.'
      },
      {
        key: 'ai.suggestPromptInstructions',
        label: 'Suggest Shortcut Additions',
        description: 'Additional instructions appended only when using the Suggest shortcut.',
        type: 'textarea',
        placeholder: 'e.g. Prefer missing prerequisites and avoid broad adjacent topics.'
      },
      {
        key: 'ai.connectPromptInstructions',
        label: 'Connect Shortcut Additions',
        description: 'Additional instructions appended only when using the Connect shortcut.',
        type: 'textarea',
        placeholder: 'e.g. Prioritize existing nodes that clarify prerequisites or resolve gaps in this scene.'
      }
    ]
  },
  {
    id: 'notes',
    label: 'Notes',
    icon: '◇',
    settings: [
      {
        key: 'ai.imageResultCount',
        label: 'Image Results',
        description: 'How many images an online image search retrieves per request (1–10)',
        type: 'number',
        min: 1,
        max: 10,
        step: 1
      },
      {
        key: 'ai.storeRetrievedImages',
        label: 'Store Found Images Offline',
        description: 'Keep a local copy of images found online so they work offline. Off: only the link is kept and the image is fetched each time its note is opened. Affects found images only.',
        type: 'boolean'
      }
    ]
  },
  {
    id: 'shelf',
    label: 'Shelf',
    icon: '◇',
    children: [
      {
        id: 'shelf-designs',
        label: 'Node Designs',
        settings: [
          {
            key: 'node.shelfDesignWithEquation',
            label: 'Equation Suggestions',
            description: 'Design for AI-suggested nodes that contain equations',
            type: 'select',
            options: DESIGN_MANIFEST.map(d => ({ value: d.id, label: d.label }))
          },
          {
            key: 'node.shelfDesignBasic',
            label: 'Basic Suggestions',
            description: 'Design for AI-suggested nodes without equations',
            type: 'select',
            options: DESIGN_MANIFEST.map(d => ({ value: d.id, label: d.label }))
          }
        ]
      },
      {
        id: 'shelf-display',
        label: 'Display',
        settings: [
          {
            key: 'ai.shelfPreviewScale',
            label: 'Preview Scale',
            description: 'Size of shelf previews relative to actual nodes (0.1–1.0)',
            type: 'number',
            min: 0.1,
            max: 1.0,
            step: 0.1
          },
          {
            key: 'ai.shelfPreviewOpacity',
            label: 'Preview Opacity',
            description: 'Opacity of shelf previews (0–1)',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.1
          },
          {
            key: 'ai.shelfPreviewGrayscale',
            label: 'Preview Grayscale',
            description: 'Grayscale filter on shelf previews (0–100%)',
            type: 'number',
            min: 0,
            max: 100,
            step: 10
          }
        ]
      },
      {
        id: 'shelf-animation',
        label: 'Animation',
        settings: [
          {
            key: 'ai.shelfExitDuration',
            label: 'Scene transition: outgoing shelf sliding out',
            description: 'On scene change: time for the current suggestions to slide out (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'ai.shelfPauseBetween',
            label: 'Scene transition: pause between outgoing and incoming shelf motions',
            description: 'On scene change: blank pause while the shelf is empty, between old leaving and new arriving (ms)',
            type: 'number',
            min: 0,
            max: 5000,
            step: 100
          },
          {
            key: 'ai.shelfEnterDuration',
            label: 'Scene transition: incoming shelf sliding in',
            description: 'On scene change: time for the new scene\'s suggestions to slide in (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'ai.shelfRemovalDuration',
            label: 'Shelf operation: used node fading out',
            description: 'When a suggestion is placed into the scene or dismissed: time for that card to fade out (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'ai.shelfRemovalPause',
            label: 'Shelf operation: pause after node fading out',
            description: 'Pause after the card has gone, before the remaining cards close the gap (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'ai.shelfCollapseDuration',
            label: 'Shelf operation: sliding to close the gap',
            description: 'Time for the remaining cards to slide left and close the gap (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'ai.shelfAdditionDuration',
            label: 'New nodes sliding in',
            description: 'When the AI adds new suggestions to the shelf: time for each new card to slide in (existing cards stay put) (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          }
        ]
      }
    ]
  },
  {
    id: 'files',
    label: 'Files',
    icon: '◇',
    settings: [
      {
        key: 'file.namePrefix',
        label: 'File Name',
        description: 'Base name for saved workspace and document files, without the number or extension. Leave blank to have it named after the anchor node on the next save. Letters, digits, underscore and hyphen only — anything else becomes a hyphen.',
        type: 'string',
        placeholder: 'e.g. kg-calculus'
      },
      {
        key: 'file.nextNumber',
        label: 'Next File Number',
        description: 'Version number stamped on the next saved file. Counts up on every save, shared by workspace and document files so a folder listing sorts in the order you exported. Numbered 01–99, then a00–z99. Set it back to 1 to restart the sequence.',
        type: 'number',
        min: 1,
        max: 2699,
        step: 1
      }
    ]
  }
];

/**
 * Flatten all settings for search functionality
 */
export function getAllSettings(): SettingDefinition[] {
  const result: SettingDefinition[] = [];
  
  function traverse(categories: SettingCategory[]): void {
    for (const cat of categories) {
      if (cat.settings) {
        result.push(...cat.settings);
      }
      if (cat.children) {
        traverse(cat.children);
      }
    }
  }
  
  traverse(SETTING_CATEGORIES);
  return result;
}
