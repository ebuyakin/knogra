# Theme & Style Architecture

> **Status:** Current  
> **Last reviewed:** 2026-08-14  
> **Authority:** Canonical source for theme cascade, scene theme behavior, and style generation.  
> **Related:** [Documentation map](README.md), [Node design system](node-design-system.md), [Background design](background-design.md)

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

App-wide node defaults (design selection, inheritance, scale bounds). This level holds
**no visual style values**: an earlier version carried `node.shadow*` fallbacks, but those keys
were removed once `DEFAULT_THEME` began defining shadow itself. For every visual parameter the
cascade therefore starts at Level 2.

### Level 2: Per-Theme (scene-wide)

**Location:** `src/core/style-types.ts` → `ColorTheme`

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
Per-Node Override → Theme Default
```

Example for background color:
1. `node.designParams.colorOverrides.background` → if set, use it
2. Else `theme.node.background.color`

Shadow has no per-node override and no global fallback: `theme.node.shadow` is the only source.
`DEFAULT_THEME` defines it, and every theme is deep-merged over `DEFAULT_THEME`, so it is always
present. All six designs read it through `styles/designs/shadow-utils.ts`, which also derives the
SVG padding from it — meaning shadow parameters change node *dimensions*, not just appearance.

---

## Built-in Themes

16 built-in themes — 12 dark, 4 light. Each is deep-merged over `DEFAULT_THEME` so only differences need to be specified.

The subsystem is split by responsibility, mirroring `src/styles/designs/`:

| File | Owns |
|---|---|
| `src/config/theme-manifest.ts` | `THEME_MANIFEST` — id, display label and order of the built-in set |
| `src/styles/themes/index.ts` | Registry: merge cascade, custom-theme builder, `getTheme()` / `getAvailableThemes()` / `isBuiltInTheme()` |
| `src/styles/themes/default-theme.ts` | `DEFAULT_THEME` etalon, the `BuiltInTheme` override type, edge-style helpers |
| `src/styles/themes/dark-palettes.ts` | The 12 dark palettes |
| `src/styles/themes/light-palettes.ts` | The 4 light palettes |

**`THEME_MANIFEST` is the single source of id, label and order.** Palettes carry colour and an id — no `name` — and the registry applies the label from the manifest on lookup. The settings dropdown derives its options from the manifest, and `getAvailableThemes()` iterates it. Adding a theme is one manifest entry plus one literal in the matching palette file; there is no second list to keep in step and no ordering to synchronise.

The manifest lives in `config/` for the same reason as `design-manifest.ts`: setting definitions need the id/label list without importing the styles runtime. The palette files import types only, so colour data has no runtime dependencies.

### Dark

| ID | Name | Canvas | Shadow | Border | Notes |
|---|---|---|---|---|---|
| `default` | Black & White | `#0d1117` | on | off | Neutral dark, used as base |
| `slate` | Slate | `#14161a` | on | off | Grey/blue-grey |
| `high-contrast` | High Contrast | `#1b1a1a` | on | on | Accessibility, bright borders |
| `dark` | Dark | `#0a1628` | on | off | Blue-tinted dark |
| `ocean` | Ocean | `#0a1a1e` | on | off | Teal/cyan |
| `forest` | Forest | `#0c1a10` | on | off | Green/gold |
| `warm-dark` | Warm Dark | `#392615` | on | off | Saturated mid-tone amber/rust |
| `espresso` | Espresso | `#17110f` | on | off | Low-chroma coffee brown, copper/sage |
| `ember` | Ember | `#1a0c0a` | on | off | Red/orange |
| `wine` | Wine | `#180a12` | on | off | Deep plum/rose, gold selection |
| `midnight-purple` | Midnight Purple | `#100a1e` | **off** | **on** (1px) | Flat 2D look |
| `nebula` | Nebula | `#0b0d18` | on | off | Indigo with polychrome cyan/magenta/lime accents |

### Light

| ID | Name | Canvas | Shadow | Border | Notes |
|---|---|---|---|---|---|
| `light` | Light | `#f0f3f6` | on (default) | off | Cool grey. Predates the light-theme rules below and is left as-is |
| `paper` | Paper | `#f6f1e7` | soft tinted | on (1px) | Warm cream/sepia, burnt orange + olive |
| `meadow` | Meadow | `#eef4ec` | soft tinted | on (1px) | Soft sage, emerald + ochre |
| `iris` | Iris | `#f0edf8` | soft tinted | on (1px) | Pale violet, violet + gold |

All themes include a canvas vignette for smooth edge-to-corner shading.

### Light-theme rules

The dark recipe inverts badly on paper, so light themes depart from it in three ways:

- **Nodes are cards, not washes.** Dark themes run `node.background.opacity` at 0.5–0.6 so the canvas glow reads through. At that opacity on a light canvas a node all but disappears, so lights use 0.85 plus a 1px tinted border.
- **Shadows are soft and tinted.** The default `opacity: 0.7` black shadow reads as dirt on paper; lights use ~0.15 in a hue drawn from the palette.
- **`imageDefaults` are corrected.** The default `brightness: 0.5` stops background images overpowering a dark canvas; on a light one it dims them into mud. Lights override to `brightness: 1.05`, `opacity: 0.45`, `saturation: 0.85`.

`light` predates these rules and deliberately still violates all three, so workspaces already using it do not change under their authors.

> **Known limitation:** the app's chrome — panels, modals, menus — is styled by static CSS with no theme → CSS-variable bridge, so it stays dark under every theme. Light themes therefore mean a light canvas inside dark chrome.

---

## Theme Ownership

- Each `Scene` has a `themeId: ThemeId` property
- Theme is derived from the current scene — there is no separate "current theme" state
- Theme changes trigger a full re-render via `transition.openScene()`

---

## Custom Themes

### The settings-driven `custom` theme — retired, reserved

A single user-configurable theme once existed, built by `buildCustomTheme()` from ~24
`customTheme.*` settings overlaid on a chosen base theme. **It is no longer offered.**
`getAvailableThemes()` does not list it and the Settings page no longer exposes its fields.

It was withdrawn because it was a fourth authoring mechanism alongside the 16 built-in themes and
the per-node and per-edge overrides, while supporting only **one instance globally** — every scene
set to `custom` necessarily shared the same colours, since the theme's content lived in settings
rather than in the scene.

**What is deliberately retained**, and must stay:

- `buildCustomTheme()` and the `themeId === 'custom'` branch in `getTheme()`
- the `customTheme.*` keys in `src/config/custom-theme-settings.ts`, which still persist and still
  travel with the workspace via `exportSettings()`

A scene — local or in an imported workspace — that references `'custom'` therefore still resolves
to the appearance its author chose instead of silently dropping to `DEFAULT_THEME`. Treat this as
reserved rather than dead: if a per-scene custom theme is ever wanted, `theme-store.ts` (below) is
the mechanism to build it on, not this one.

### Stored themes (IndexedDB)

Named user themes are persisted via `src/storage/theme-store.ts`:

| Method | Purpose |
|---|---|
| `themeStore.getAllCustomThemes()` | Get all user-created themes |
| `themeStore.getTheme(id)` | Get one custom theme by ID |
| `themeStore.saveTheme(theme)` | Create or update a custom theme |
| `themeStore.deleteTheme(id)` | Remove a custom theme |

The store auto-initializes at module import time — no explicit `loadCustomThemes()` call needed.
Stored themes are included in the workspace export.

**No UI reaches this layer.** Nothing creates, edits or selects a stored theme, and
`getAvailableThemes()` does not list them. The persistence is complete and unused — this is the
natural foundation for any future multi-theme authoring feature.

### Resolution

`getTheme(themeId)` in `src/styles/themes/index.ts` resolves `'custom'` first, then the stored
themes, then built-in themes, then falls back to `DEFAULT_THEME`. Stored themes are deep-merged
over `DEFAULT_THEME` so partial definitions are valid.

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
User selects theme in the Theme Picker
  → scene.themeId updated in graphStore
  → transition.openScene(sceneId) → full re-render with new theme
```

The picker is a **picker, not an editor**: it selects a theme and reports the choice, and its
right-hand pane is a read-only inspector of the selected theme's resolved parameters. Theme
authoring lives in the palette files. Do not reintroduce editable inputs there without deciding
first where the edits would be stored — see *Custom Themes* above.

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
| `theme-picker.ts` | ❌ | ✅ | Reads themes only; the caller writes `scene.themeId` |

---

## Key Files

| File | Responsibility |
|---|---|
| `src/core/style-types.ts` | All visual type definitions |
| `src/core/main-types.ts` | Re-exports style types (barrel), type system index |
| `src/styles/themes/index.ts` | Registry: `getTheme()`, `getAvailableThemes()`, merge, custom builder |
| `src/styles/themes/*-palettes.ts` | Built-in theme colour data |
| `src/config/theme-manifest.ts` | Theme ids, labels and order |
| `src/storage/theme-store.ts` | Stored theme persistence (IndexedDB), currently no UI |
| `src/styles/style-generator.ts` | Cytoscape stylesheet builder, border rules |
| `src/styles/edge-visual-resolver.ts` | Edge style cascade; `resolveEdgeStyleSlot()` for the three theme edge styles |
| `src/styles/designs/shadow-utils.ts` | Shadow config, padding, SVG filter builder |
| `src/ui/components/theme-picker.ts` | Scene theme picker modal (read-only inspector) |
| `src/ui/components/theme-preview.ts` | Static theme sample rendered by the picker |

---

## Related Documentation

- **Node Design System** (`docs/node-design-system.md`) — Design types, per-node params, per-design constants
- **Background Design** (`docs/background-design.md`) — Background images, canvas rendering, transitions
