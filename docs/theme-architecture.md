# Theme & Style Architecture

## Overview

Themes control the visual appearance of graph elements (nodes, edges, canvas background). Themes are **per-scene** — different scenes can have different themes. The visual system is organized as a 4-level cascade from global defaults down to individual node overrides.

**Scope:** Themes affect graph content only (nodes, edges, canvas). App chrome (panels, modals, buttons) is unaffected by themes.

---

## Type System

All visual types live in `src/core/style-types.ts` (see `main-types.ts` for the full type system index). The types are organized bottom-up from atomic primitives to the top-level theme:

```
TextStyleProps ──────────────────────────────────────────┐
BorderStyleProps ────────────────────────────────────────┤
ShadowStyleProps ────────────────────────────────────────┤
GradientStop → GradientConfig ──┐                        │
VignetteConfig ─────────────────┼→ BackgroundStyleProps ─┤
                                                         │
ColorOverrides (per-node color substitutions) ───────────┤
VisualEffects  (per-node effect adjustments) ────────────┤
                                                         │
NodeStyle (background + text + border + shadow) ─────────┤
EdgeStyle (line + arrow + label) ────────────────────────┤
                                                         ↓
                                        ColorTheme (canvas + node + edge)
```

### Style Primitives

| Type | Fields | Used by |
|---|---|---|
| `TextStyleProps` | `color`, `opacity` | Node text, edge labels, decoration text |
| `BorderStyleProps` | `color`, `width` | Node borders (normal, central, selected) |
| `ShadowStyleProps` | `offsetX`, `offsetY`, `blur`, `opacity`, `color` | Node drop shadow (SVG filter) |
| `GradientStop` | `offset`, `color`, `opacity` | Color gradient stops for fills |
| `GradientConfig` | `type`, `angle`, `stops` | Gradient configuration (solid/linear/radial) |
| `VignetteConfig` | `strength`, `spread`, `blur`, `color`, `colorOpacity` | Edge darkening effect |
| `BackgroundStyleProps` | `color`, `opacity`, `brightness`, `saturation`, `hue`, `gradient`, `vignette` | Node backgrounds, canvas, edge lines |

### Composite Styles

| Type | Composes | Purpose |
|---|---|---|
| `NodeStyle` | background, backgroundAlt, text, textSecondary, border (×4), accent, shadow | Complete node appearance |
| `EdgeStyle` | line, lineSecondary, arrow, label, width | Complete edge appearance |
| `ColorTheme` | canvas, node (`NodeStyle`), edge (`EdgeStyle`), decoration, imageDefaults | Complete scene appearance |

### Per-Node Override Types

| Type | Fields | Purpose |
|---|---|---|
| `ColorOverrides` | `background`, `backgroundAlt`, `text`, `border` | Replace specific theme colors for one node |
| `VisualEffects` | `backgroundOpacity`, `backgroundAltOpacity`, `textOpacity`, `brightness`, `saturation`, `hue` | Adjust visual effects for one node |

---

## 4-Level Cascade

Visual parameters resolve through 4 levels. Higher levels override lower.

### Level 1: Global Settings

**Location:** `src/config/node-settings.ts`

App-wide defaults. Currently contains shadow fallback values (`node.shadow*`), but these are effectively unused — all built-in themes define shadow explicitly, so theme values always take priority.

### Level 2: Per-Theme (scene-wide)

**Location:** `src/styles/themes.ts` → `ColorTheme`

Each scene has a `themeId`. The theme defines the visual baseline for every node and edge in that scene.

**Node properties (theme.node):**

| Group | Properties |
|---|---|
| **Background** | `background.color/opacity/brightness/saturation/hue/gradient/vignette`, `backgroundAlt.*` |
| **Text** | `text.color/opacity`, `textSecondary.color/opacity` |
| **Border** | `border.color/width`, `borderCentral.*`, `borderSelected.*`, `borderCentralSelected.*` |
| **Shadow** | `shadow.offsetX/offsetY/blur/opacity/color` |
| **Accent** | `accent.color/opacity/…` |

**Canvas properties (theme.canvas):**
- `background.color` — container background
- `background.vignette.*` — edge darkening (strength, spread, blur, color)

**Edge properties (theme.edge):**
- `line.*`, `lineSecondary.*`, `arrow.*`, `label.*`, `width`

### Level 3: Per-Design-Type

**Location:** Each design file in `src/styles/designs/`

Layout constants hardcoded per design type (not user-configurable). See `node-design-system.md` for details.

### Level 4: Per-Node-Instance

**Location:** `Scene.nodes[nodeId].design.params` (stored in IndexedDB)

Individual node overrides via `ColorOverrides` and `VisualEffects`. See `node-design-system.md` for the complete field list.

### Resolution Chain

```
Per-Node Override → Theme Default → (Global Settings fallback)
```

Example for background color:
1. `node.designParams.colorOverrides.background` → if set, use it
2. Else `theme.node.background.color`

Example for shadow:
1. `theme.node.shadow` → if defined, use it
2. Else fall back to global `node.shadow*` settings

---

## Built-in Themes

10 built-in themes, all hardcoded in `src/styles/themes.ts`. Each is deep-merged over `DEFAULT_THEME` so only differences need to be specified.

| ID | Name | Canvas | Shadow | Border | Notes |
|---|---|---|---|---|---|
| `default` | Black & White | `#0d1117` | on | off | Neutral dark, used as base |
| `dark` | Dark | `#0a1628` | on | off | Blue-tinted dark |
| `light` | Light | `#f0f3f6` | on | off | Light backgrounds, dark text |
| `high-contrast` | High Contrast | `#000000` | on | off | Accessibility, bright borders |
| `warm-dark` | Warm Dark | `#1a120b` | on | off | Amber/rust tones |
| `ocean` | Ocean | `#0a1a1e` | on | off | Teal/cyan |
| `midnight-purple` | Midnight Purple | `#100a1e` | **off** | **on** (1px) | Flat 2D look |
| `forest` | Forest | `#0c1a10` | on | off | Green/gold |
| `slate` | Slate | `#14161a` | on | off | Grey/blue-grey |
| `ember` | Ember | `#1a0c0a` | on | off | Red/orange |

All themes include canvas vignette for smooth edge-to-corner darkening.

---

## Theme Ownership

- Each `Scene` has a `themeId: ThemeId` property
- Theme is derived from the current scene — there is no separate "current theme" state
- Theme changes trigger a full re-render via `transition.openScene()`

---

## Custom Themes

### Storage

Custom themes are persisted in IndexedDB via `src/storage/theme-store.ts`:

| Method | Purpose |
|---|---|
| `themeStore.getAllCustomThemes()` | Get all user-created themes |
| `themeStore.getTheme(id)` | Get one custom theme by ID |
| `themeStore.saveTheme(theme)` | Create or update a custom theme |
| `themeStore.deleteTheme(id)` | Remove a custom theme |

The store auto-initializes at module import time — no explicit `loadCustomThemes()` call needed.

### Resolution

`getTheme(themeId)` in `src/styles/themes.ts` checks custom store first, then built-in themes, then falls back to `DEFAULT_THEME`. Custom themes are deep-merged over `DEFAULT_THEME` so partial definitions are valid.

---

## Border Rendering

Borders use **Cytoscape native border** (not SVG stroke):

- Normal state: `theme.node.border.width` / `.color` (output by each design's Cytoscape style)
- Central node: overridden by `theme.node.borderCentral` via `node[?centralNode]` selector
- Selected node: overridden by `theme.node.borderSelected` via `node:selected` selector
- Central + selected: overridden by `theme.node.borderCentralSelected`

Rules are built in `style-generator.ts → buildCentralAndSelectedRules(themeId)`, applied in priority order (central < selected < central+selected).

---

## Shadow Rendering

Shadow uses **SVG `<feDropShadow>` filter** inside each node's SVG image:

- Controlled by `theme.node.shadow`
- Shadow adds padding to the SVG canvas (`getShadowPadding()`)
- When `shadow.opacity = 0`, no filter or padding applied
- Shared utilities in `src/styles/designs/shadow-utils.ts`

---

## Data Flow

### Scene Load

```
transition.openScene(sceneId)
  → graphStore.getScene(sceneId) → scene.themeId
  → StyleGenerator.generateSceneStylesheet(scene, nodesData, scene.themeId)
  → getTheme(themeId) → ColorTheme
  → Each design renders SVG with theme colors
  → Canvas background + vignette applied to container
```

### Adding Node Mid-Scene

```
graph.addFreeNode() / scene.includeNode()
  → currentScene.themeId || 'dark'
  → StyleGenerator.addNodesToStylesheet(stylesheet, nodes, themeId)
  → getTheme(themeId) → render with theme colors
```

### Theme Change

```
User selects theme in Theme Editor
  → scene.themeId updated in graphStore
  → transition.openScene(sceneId) → full re-render with new theme
```

---

## Access Patterns

| Component | graphStore | getTheme | Notes |
|---|---|---|---|
| `themes.ts` | ❌ | N/A (defines themes) | Pure registry |
| `theme-store.ts` | ❌ | ❌ | IndexedDB only |
| `style-generator.ts` | ❌ | ✅ | Resolves themeId internally |
| Design files | ❌ | ❌ | Receive `ColorTheme` as param |
| `graph.ts` | ✅ | ❌ | Passes themeId to StyleGenerator |
| `scene.ts` | ✅ | ❌ | Passes themeId to StyleGenerator |
| `transition.ts` | ✅ | ❌ | Passes scene to StyleGenerator |
| `theme-editor.ts` | ✅ | ✅ | UI needs both |

---

## Key Files

| File | Responsibility |
|---|---|
| `src/core/style-types.ts` | All visual type definitions |
| `src/core/main-types.ts` | Re-exports style types (barrel), type system index |
| `src/styles/themes.ts` | Built-in themes, `getTheme()`, `getAvailableThemes()` |
| `src/storage/theme-store.ts` | Custom theme persistence (IndexedDB) |
| `src/styles/style-generator.ts` | Cytoscape stylesheet builder, border rules |
| `src/styles/designs/shadow-utils.ts` | Shadow config, padding, SVG filter builder |
| `src/ui/components/theme-editor.ts` | Theme editor modal |

---

## Related Documentation

- **Node Design System** (`docs/node-design-system.md`) — Design types, per-node params, per-design constants
- **Background Design** (`docs/background-design.md`) — Background images, canvas rendering, transitions
