# Node Design System

> **Status:** Current  
> **Last reviewed:** 2026-08-14  
> **Authority:** Canonical source for built-in node designs and node-level visual parameters.  
> **Related:** [Documentation map](README.md), [Theme architecture](theme-architecture.md), [Central node styling refactor](central-node-styling-refactor.md)

## Overview

The design system defines how individual nodes are visually rendered in graph scenes. Each node has a **design type** (shape/layout) and can have **per-node overrides** (colors, effects, gradients).

For the theme system and cascade model, see `theme-architecture.md`.

---

## Built-in Designs

| ID | File | Shape | Notes |
|---|---|---|---|
| `default` | `default-node.ts` | roundrectangle | Text card with auto-sizing, supports vignette |
| `circle` | `circle-node.ts` | ellipse | Simple circle with centered label |
| `rectangle` | `rectangle-node.ts` | roundrectangle | Fixed-ratio rectangle, supports vignette |
| `equation` | `equation-node.ts` | round-rectangle | 3-section layout, MathJax equations |
| `equation-compact` | `equation-compact-node.ts` | round-rectangle | Compact MathJax layout |
| `tester` | `tester-node.ts` | round-rectangle | Development/testing design |

---

## Per-Design Constants (Level 3)

Layout constants hardcoded per design type. These are developer decisions, not user-configurable.

| Parameter | Design | Value | Notes |
|---|---|---|---|
| `BORDER_RADIUS` | default-node | `8` px | Hardcoded |
| `borderRadius` | equation, equation-compact | `6` px (default) | Overridable via design params |
| `rx` | rectangle-node | `8` px | Hardcoded in SVG |
| `H_PADDING` | default-node | `28` px | Hardcoded |
| `V_PADDING` | default-node | `18` px | Hardcoded |
| `LINE_HEIGHT_FACTOR` | default-node | `1.4` | Hardcoded |
| `CHAR_WIDTH_FACTOR` | default-node | `0.6` | Hardcoded |
| `font-family` | all designs | system sans-serif | Hardcoded, copy-pasted |
| `DEFAULT_FONT_SIZE` | default-node | `14` px | Overridable via design params |
| `DEFAULT_MIN_WIDTH` | default-node | `100` px | Overridable via design params |
| `DEFAULT_ASPECT` | default-node | `16/9` | Overridable via design params |
| Cytoscape `shape` | per design | varies | `roundrectangle`, `ellipse`, etc. |

---

## Per-Node Overrides (Level 4)

Each node in a scene can override specific visual properties. Stored in `Scene.nodes[nodeId].design.params` (IndexedDB). Unset values fall back to theme.

### Color Overrides (`colorOverrides: ColorOverrides`)

| Field | Type | Notes |
|---|---|---|
| `background` | string | Override theme background color |
| `backgroundAlt` | string | Override theme alt background |
| `text` | string | Override theme text color |
| `border` | string | ⚠️ **Defined but unwired** — no design reads it yet |

### Visual Effects (`effects: VisualEffects`)

| Field | Type | Range | Notes |
|---|---|---|---|
| `backgroundOpacity` | number | 0.0–1.0 | Override theme background opacity |
| `backgroundAltOpacity` | number | 0.0–1.0 | Override theme alt opacity |
| `textOpacity` | number | 0.0–1.0 | Override text opacity |
| `brightness` | number | 0.5–1.5 | Override brightness |
| `saturation` | number | 0.0–2.0 | Override saturation |
| `hue` | number | 0–360 | Override hue rotation |

### Gradient (`gradient: GradientConfig`)

| Field | Type | Notes |
|---|---|---|
| `type` | solid / linear / radial | Gradient type |
| `angle` | number | Linear gradient angle (degrees) |
| `stops` | GradientStop[] | Custom color stops |

### Area Colors (`areaColors: AreaColors`, equation designs only)

| Field | Type | Notes |
|---|---|---|
| `top` | string | Top section color |
| `middle` | string | Middle section color |
| `bottom` | string | Bottom section color |

### Layout Params (per design)

| Field | Type | Notes |
|---|---|---|
| `scale` | number | Size multiplier (1.0 = default), range 0.2–3.0 (`NODE_SCALE_MIN` / `NODE_SCALE_MAX` in `config/node-settings.ts`). Stored at `Scene.nodes[id].scale` — **per scene**, so the same node can be sized differently in each |
| `fontSize` | number | Per-node font size |
| `minWidth` | number | Per-node minimum width |
| `size` | number | Circle radius / rectangle width |
| `aspectRatio` | number | Target width:height ratio (default-node only, default 16/9) |
| `fixedAspect` | boolean | Enforce exact aspect ratio (default-node only, default false) |

#### Editing `scale`

Two paths, both writing `cyNode.data('scale')` and persisting via GraphSaver's `data` listener:

- **Node editor slider** — absolute value for one node, via `Scene.updateNodeStyle(id, { scale })`.
- **`>` / `<` shortcut** — multiplicative step (`node.scaleStep`, default 1.1) applied to **all selected nodes**, via `Scene.scaleNodes(ids, factor)`. Positions do not change, so nodes grow in place and may overlap — the same behaviour as dragging the slider.

The shortcut clamps **for the selection as a whole**, not per node: the largest step keeping every node inside the range is applied to all of them, so the group stops when its first member reaches a limit. This preserves relative sizes (the reason the step is a ratio rather than an increment) and makes the command exactly self-inverse, which is why it needs no undo. Per-node clamping would flatten deliberate size differences at the boundary, irreversibly. A node already outside the range — legacy or imported data — is a no-op in the offending direction rather than being snapped back.

Repeated presses are coalesced through an in-flight guard with a multiplicative accumulator, mirroring `AutoLayout.scaleScene`; without it, overlapping async stylesheet rebuilds would lose each other's updates.

Not to be confused with the scene-scoped **Enlarge / Shrink** (`W` / `Shift+W`), which changes *apparent* size for every node without touching `scale` — see [layout-architecture.md](layout-architecture.md) §1.1.

### Default Node Sizing Algorithm

The `default-node` design sizes the box based on text content and a target aspect ratio.

**How it works:**
1. Compute optimal line count: `n = sqrt(textWidth / (lineHeight × aspectRatio))`, rounded to nearest integer
2. Try n-1, n, and n+1 as candidates
3. Word-wrap the title at each candidate line count
4. Pick the wrapping that produces the closest aspect ratio to the target

**Two modes:**
- `fixedAspect: false` (default) — aspect ratio is a *hint* for the line-breaking algorithm. The actual box dimensions are determined by text wrapping + fixed padding (H_PADDING=28, V_PADDING=18). Short titles may not match the target ratio.
- `fixedAspect: true` — after text layout, the box is expanded (wider or taller) to match the exact target ratio. This gives a consistent visual shape regardless of title length.

**Why aspect ratio "snaps":** Since line count is integer, small changes to `aspectRatio` may not change the line-breaking decision. The visual shape only changes when the ratio is different enough to shift the optimal line count to a different integer.

---

## Architecture

### Layer 1: Design Implementation

**Location:** `src/styles/designs/`

TypeScript functions that generate SVG markup and return Cytoscape style objects. Each design:
- Receives `(nodeData, params, theme)`
- Builds SVG using theme colors + per-node overrides from params
- Returns `CytoscapeNodeStyle` with `background-image`, dimensions, shape, border

### Layer 2: Design Registry

**Location:** `src/styles/designs/design-registry.ts`

Maps design IDs to render functions. Provides config schemas for UI generation (`DesignConfigSchema`).

### Layer 3: Scene Data (Storage)

**Location:** IndexedDB via `graphStore.scenes`

Each scene stores per-node: position, scale, designId, designParams.

---

## Creating New Designs

1. **Create file** in `src/styles/designs/` exporting a render function
2. **Accept** `(nodeData, params, theme)` — use theme colors, not hardcoded values
3. **Return** `CytoscapeNodeStyle` with SVG image, dimensions, shape, border
4. **Register** in `design-registry.ts` with ID, name, config schema
5. **Use shadow utilities** from `shadow-utils.ts` for consistent shadow rendering
6. **Test** with all themes (especially light, high-contrast, midnight-purple)

---

## Known Issues & Cleanup Items

### Unwired / Reserved Fields

| Field | Location | Status | Disposition |
|---|---|---|---|
| `textSecondary` | Theme `NodeStyle` | Defined in every theme, read by no design | **Reserved.** A second text colour inside a node (subtitles, annotations) is wanted for future designs — keep it defined. Do not delete as dead. |
| `accent` | Theme `NodeStyle` | Read by `resolveEdgeStyleSlot()` as the `edge-style-2` fallback colour — but all 16 palettes define their slots explicitly, so the branch never runs in practice | Keep: live code on a currently unreachable path |
| `decoration.background` / `.text` | Theme `ColorTheme` | Defined in every theme, read by no code. Intended for the scene-level decorations in `knogra-vision.md` (icons/anchors); that idea landed as background images (`imageDefaults`) and anchors (CSS chrome) instead | Undecided — implement or remove |
| `ColorOverrides.border` | `style-types.ts` | Exists in type, no design reads it | Wire to Cytoscape border output |

### Inconsistencies

| Issue | Details |
|---|---|
| Border radius | Hardcoded `8px` in default/rectangle, parameterized `6px` in equation designs |
| font-family | Copy-pasted across all 6 designs, not extracted to a shared constant |
| Vignette support | Only default-node and rectangle-node render it; other designs ignore it |

---

## File Organization

```
src/styles/designs/
  design-registry.ts          # Design catalog and dispatcher
  shadow-utils.ts             # Shadow config + SVG filter builder (shared)
  default-node.ts             # Default text card design
  circle-node.ts              # Circle design
  rectangle-node.ts           # Rectangle design
  equation-node.ts            # Equation 3-section design
  equation-compact-node.ts    # Compact equation design
  tester-node.ts              # Test/dev design
```

---

## Related Documentation

- **Theme & Style Architecture** (`docs/theme-architecture.md`) — 4-level cascade, theme fields, built-in themes, rendering flow
- **Background Design** (`docs/background-design.md`) — Background images behind graph
- **Cytoscape Design Guide** (`guides/cytoscape-design-guide.md`) — SVG rendering techniques
