# Node Design System

> **Status:** Current  
> **Last reviewed:** 2026-08-16  
> **Authority:** Canonical source for built-in node designs and node-level visual parameters.  
> **Related:** [Documentation map](README.md), [Theme architecture](theme-architecture.md), [Node SVG images](nodes-svg-images.md), [Central node styling refactor](central-node-styling-refactor.md)

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
| `image` | `image-node.ts` | round-rectangle | SVG pictogram alone in the box |
| `image-caption` | `image-caption-node.ts` | round-rectangle | Title bar + pictogram; same renderer as `image` |
| `tester` | `tester-node.ts` | round-rectangle | Development/testing design |

The two image designs fall back to `default-node` when the node has no image or its record cannot be
resolved — a node must never disappear because a picture is missing. See
[Node SVG images](nodes-svg-images.md) §5.

---

## Per-Design Constants (Level 3)

Layout constants hardcoded per design type. Most are developer decisions; the ones marked overridable
are exposed to the user through the Design tab's declared layout controls (see below).

| Parameter | Design | Value | Notes |
|---|---|---|---|
| `BORDER_RADIUS` | default-node | `8` px | Hardcoded |
| `borderRadius` | equation, equation-compact, image | `6` px (default) | Overridable via design params |
| `rx` | rectangle-node | `8` px | Hardcoded in SVG |
| `H_PADDING` | default-node | `18` px | Hardcoded default for `params.hPadding` |
| `V_PADDING` | default-node | `18` px | Hardcoded default for `params.vPadding` |
| `LINE_HEIGHT_FACTOR` | default-node | `1.4` | Hardcoded |
| `CHAR_WIDTH_FACTOR` | default-node | `0.6` | Hardcoded |
| `font-family` | all designs | system sans-serif | Hardcoded, copy-pasted |
| `DEFAULT_FONT_SIZE` | default-node | `14` px | Exported; overridable via design params |
| `DEFAULT_MIN_WIDTH` | default-node | `100` px | Exported; overridable via design params |
| `DEFAULT_ASPECT` | default-node | `16/9` | Exported; overridable via design params |
| `IMAGE_DEFAULT_H_PADDING` / `_V_PADDING` | image, image-caption | `14` px | Exported; overridable via design params |
| `IMAGE_DEFAULT_ASPECT` | image, image-caption | `1` | Exported; used only when `fixedAspect` |
| `IMAGE_DEFAULT_TITLE_FONT_SIZE` | image-caption | `11` px | Exported; the title bar's height derives from it |
| Cytoscape `shape` | per design | varies | `roundrectangle`, `ellipse`, etc. |

The exported constants are exported for one reason: the Design tab's layout controls are declared
against them, so a control's default cannot drift from the design it configures.

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
| `fontSize` | number | Per-node font size (default-node) |
| `titleFontSize` | number | Title font size (image-caption); the title bar's height derives from it |
| `minWidth` | number | Per-node minimum width |
| `size` | number | Circle radius / rectangle width |
| `aspectRatio` | number | Target width:height ratio. default-node `16/9`, image designs `1` |
| `fixedAspect` | boolean | Hold that ratio exactly (default false) |
| `hPadding` / `vPadding` | number | Per-axis padding. default-node `18`, image designs `14` |

### Declared layout controls

Which of these the Design tab shows is **declared per design** in `styles/designs/design-registry.ts`,
not branched on in the editor. Each entry names the param key it writes, its label, its bounds and its
default — the default referenced from the design module's own exported constant, so the two cannot
diverge. `design-tab.ts` renders, validates and merges whatever it is handed and names no design id;
a design absent from the table simply shows no layout section.

Two details worth keeping:

- The section is **rebuilt on every design change**, carrying values across by key, because the
  control set belongs to the design rather than to the tab. The two image designs differ by one knob,
  so resetting the other four on a switch would read as a bug.
- A control may declare `enabledBy`, naming a checkbox it depends on. This is per-design on purpose:
  an image node's `aspectRatio` does nothing until `fixedAspect` holds it, so the input is disabled
  and dimmed, while `default-node` reflows its text toward that ratio either way and stays live.

Values equal to the design's default are **deleted** rather than written, so an unchanged node keeps
an empty params object and stays theme-responsive.

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
- `fixedAspect: false` (default) — aspect ratio is a *hint* for the line-breaking algorithm. The actual box dimensions are determined by text wrapping + fixed padding (H_PADDING=18, V_PADDING=18). Short titles may not match the target ratio.
- `fixedAspect: true` — after text layout, the box is expanded (wider or taller) to match the exact target ratio. This gives a consistent visual shape regardless of title length.

**Why aspect ratio "snaps":** Since line count is integer, small changes to `aspectRatio` may not change the line-breaking decision. The visual shape only changes when the ratio is different enough to shift the optimal line count to a different integer.

### Image Node Sizing

The same two param names mean something different for the image designs, because a picture cannot be
reflowed the way text can. Width is authoritative — the size class times `imageScale`, floored by
`minWidth` and the title — and the mode decides the height:

- `fixedAspect: false` (default) — height follows the image's own `viewBox` ratio.
- `fixedAspect: true` — height follows `aspectRatio`, and the image is contained in what the title
  bar and padding leave: scaled down to fit, centred, never upscaled past the size-class width.

`imageScale` is **reserved**: it is multiplied into every render but no control writes it, so it is
always 1. Kept for image designs whose framing is not padding-shaped — a round node, for instance.

Full rules and the reason for the no-upscale rule: [Node SVG images](nodes-svg-images.md) §5.2.

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
