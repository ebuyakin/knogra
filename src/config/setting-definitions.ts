/**
 * Setting Definitions
 * UI metadata for the Settings Modal
 * 
 * Defines how settings are displayed: labels, descriptions, input types, constraints.
 * The actual default values are in the domain-specific files (transition-settings.ts, etc.)
 */

import type { SettingKey } from './index';
import { DESIGN_MANIFEST } from './design-manifest';

const BASE_THEME_OPTIONS = [
  { value: 'default', label: 'Black & White' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'high-contrast', label: 'High Contrast' },
  { value: 'warm-dark', label: 'Warm Dark' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'midnight-purple', label: 'Midnight Purple' },
  { value: 'forest', label: 'Forest' },
  { value: 'slate', label: 'Slate' },
  { value: 'ember', label: 'Ember' },
];

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
}

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
        description: 'Animated: full morph transitions with spatial continuity. Fade: quick crossfade between scenes (faster for editing)',
        type: 'select',
        options: [
          { value: 'animated', label: 'Animated' },
          { value: 'fade', label: 'Fade (quick)' }
        ]
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
            description: 'Total duration of the shared morph phase [duration, delay] (ms)',
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
    id: 'ai',
    label: 'AI Assistant',
    icon: '◇',
    settings: [
      {
        key: 'ai.provider',
        label: 'AI Provider',
        description: 'Which AI service to use',
        type: 'select',
        options: [
          { value: 'gemini', label: 'Google Gemini' },
          { value: 'openrouter', label: 'OpenRouter (multi-model)' }
        ]
      },
      {
        key: 'ai.geminiApiKey',
        label: 'Gemini API Key',
        description: 'Your Google Gemini API key',
        type: 'string'
      },
      {
        key: 'ai.geminiModel',
        label: 'Gemini Model',
        description: 'Gemini model name (e.g. gemini-3-flash-preview)',
        type: 'string'
      },
      {
        key: 'ai.openrouterApiKey',
        label: 'OpenRouter API Key',
        description: 'Your OpenRouter API key',
        type: 'string'
      },
      {
        key: 'ai.openrouterModel',
        label: 'OpenRouter Model',
        description: 'Model ID (e.g. anthropic/claude-sonnet-4)',
        type: 'string'
      },
      {
        key: 'ai.webSearchEnabled',
        label: 'Web Search (Gemini)',
        description: 'Enable web search grounding (Gemini only)',
        type: 'boolean'
      },
      {
        key: 'ai.thinkingLevel',
        label: 'Thinking Level (Gemini)',
        description: 'Reasoning depth vs speed (Gemini only)',
        type: 'select',
        options: [
          { value: 'minimal', label: 'Minimal — fastest' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High — most thorough' }
        ]
      },
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
            label: 'Exit Duration',
            description: 'Duration for shelf items to exit on scene change (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'ai.shelfPauseBetween',
            label: 'Pause Between',
            description: 'Pause between exit and enter animations (ms)',
            type: 'number',
            min: 0,
            max: 5000,
            step: 100
          },
          {
            key: 'ai.shelfEnterDuration',
            label: 'Enter Duration',
            description: 'Duration for shelf items to enter (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'ai.shelfRemovalDuration',
            label: 'Removal Duration',
            description: 'Duration for removing a single item (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'ai.shelfRemovalPause',
            label: 'Removal Pause',
            description: 'Pause after removal before collapse (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'ai.shelfCollapseDuration',
            label: 'Collapse Duration',
            description: 'Duration for gap collapse after removal (ms)',
            type: 'number',
            min: 0,
            max: 3000,
            step: 100
          },
          {
            key: 'ai.shelfAdditionDuration',
            label: 'Addition Duration',
            description: 'Duration for new items to animate in (ms)',
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
    id: 'custom-theme',
    label: 'Custom Theme',
    icon: '◇',
    description: 'User-configurable theme. Select a base theme and override individual properties. Empty values inherit from the base.',
    children: [
      {
        id: 'custom-theme-canvas',
        label: 'Canvas',
        settings: [
          {
            key: 'customTheme.baseTheme',
            label: 'Base Theme',
            description: 'Built-in theme to start from. All unset properties inherit from this theme.',
            type: 'select',
            options: BASE_THEME_OPTIONS
          },
          {
            key: 'customTheme.canvasColor',
            label: 'Background Color',
            description: 'Canvas background color (hex). Empty = inherit from base.',
            type: 'string'
          },
          {
            key: 'customTheme.canvasVignetteStrength',
            label: 'Vignette Strength',
            description: 'Canvas edge darkening (0–1). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05
          },
          {
            key: 'customTheme.canvasVignetteSpread',
            label: 'Vignette Spread',
            description: 'Solid border inset from edges (px). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 200,
            step: 5
          },
          {
            key: 'customTheme.canvasVignetteBlur',
            label: 'Vignette Blur',
            description: 'Feather distance beyond spread (px). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 500,
            step: 10
          },
          {
            key: 'customTheme.canvasVignetteColor',
            label: 'Vignette Color',
            description: 'Vignette shade color (hex). Empty = inherit from base.',
            type: 'string'
          },
          {
            key: 'customTheme.canvasVignetteColorOpacity',
            label: 'Vignette Color Opacity',
            description: 'Base opacity of the vignette shade (0–1). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05
          }
        ]
      },
      {
        id: 'custom-theme-node',
        label: 'Node',
        settings: [
          {
            key: 'customTheme.nodeBackground',
            label: 'Background Color',
            description: 'Node background color (hex). Empty = inherit from base.',
            type: 'string'
          },
          {
            key: 'customTheme.nodeOpacity',
            label: 'Opacity',
            description: 'Node background opacity (0–1). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05
          },
          {
            key: 'customTheme.nodeTextColor',
            label: 'Text Color',
            description: 'Node text color (hex). Empty = inherit from base.',
            type: 'string'
          },
          {
            key: 'customTheme.nodeBorderColor',
            label: 'Border Color',
            description: 'Normal border color (hex). Empty = inherit from base.',
            type: 'string'
          },
          {
            key: 'customTheme.nodeBorderWidth',
            label: 'Border Width',
            description: 'Normal border width (px). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 5,
            step: 0.5
          },
          {
            key: 'customTheme.centralBorderColor',
            label: 'Central Border',
            description: 'Central node border color (hex). Empty = inherit.',
            type: 'string'
          },
          {
            key: 'customTheme.selectedBorderColor',
            label: 'Selected Border',
            description: 'Selected node border color (hex). Empty = inherit.',
            type: 'string'
          },
          {
            key: 'customTheme.centralSelectedBorderColor',
            label: 'Central+Selected Border',
            description: 'Central+selected border color (hex). Empty = inherit.',
            type: 'string'
          },
          {
            key: 'customTheme.shadowOffsetX',
            label: 'Shadow Offset X',
            description: 'Horizontal shadow offset (px). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 20,
            step: 1
          },
          {
            key: 'customTheme.shadowOffsetY',
            label: 'Shadow Offset Y',
            description: 'Vertical shadow offset (px). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 20,
            step: 1
          },
          {
            key: 'customTheme.shadowBlur',
            label: 'Shadow Blur',
            description: 'Shadow blur radius (px). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 20,
            step: 1
          },
          {
            key: 'customTheme.shadowOpacity',
            label: 'Shadow Opacity',
            description: 'Shadow opacity (0–1). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.1
          },
          {
            key: 'customTheme.shadowColor',
            label: 'Shadow Color',
            description: 'Shadow color (hex). Empty = inherit from base.',
            type: 'string'
          },
          {
            key: 'customTheme.nodeVignetteStrength',
            label: 'Vignette Strength',
            description: 'Node edge darkening (0–1). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05
          },
          {
            key: 'customTheme.nodeVignetteSpread',
            label: 'Vignette Spread',
            description: 'Solid border inset (px). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 200,
            step: 5
          },
          {
            key: 'customTheme.nodeVignetteBlur',
            label: 'Vignette Blur',
            description: 'Feather distance (px). Empty = inherit from base.',
            type: 'number',
            min: 0,
            max: 500,
            step: 10
          },
          {
            key: 'customTheme.nodeVignetteColor',
            label: 'Vignette Color',
            description: 'Vignette shade color (hex). Empty = inherit from base.',
            type: 'string'
          }
        ]
      },
      {
        id: 'custom-theme-edge',
        label: 'Edge',
        settings: [
          {
            key: 'customTheme.edgeColor',
            label: 'Line Color',
            description: 'Edge line color (hex). Empty = inherit from base.',
            type: 'string'
          },
          {
            key: 'customTheme.edgeArrowColor',
            label: 'Arrow Color',
            description: 'Edge arrow color (hex). Empty = inherit from base.',
            type: 'string'
          }
        ]
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
