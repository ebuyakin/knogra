# Node Design Parameters — Cheat Sheet

> **Status:** Current  
> **Last reviewed:** 2026-07-09  
> **Authority:** Quick reference for the configurable parameters (and their JSON keys) of the `default-node`, `equation-node`, and `equation-compact-node` designs. The code in `src/styles/designs/` is the source of truth; update this sheet when a design's param interface changes.  
> **Related:** [Documentation map](README.md), [Node design system](node-design-system.md), [Theme architecture](theme-architecture.md)

## How to read this

- Each design is an independent module in `src/styles/designs/`; **parameter names are not shared** across designs (e.g. `default-node` uses `hPadding`/`vPadding`, the equation designs use `horizontalPadding`/`verticalPadding`).
- All parameters are **optional** — omitting one falls back to the default shown.
- Keys are the literal JSON property names accepted in a node's design config object.
- Colour/effect/gradient blocks are **shared sub-structures** (defined in `src/core/style-types.ts`); they are catalogued once in [§4](#4-shared-sub-structures) and referenced by each design.

---

## 1. `default-node`

16:9 auto-wrapping title rectangle. Size is driven by the title text.  
Source: `src/styles/designs/default-node.ts`.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `fontSize` | number | `14` | Title font size (px). |
| `minWidth` | number | `100` | Minimum node width before padding. |
| `aspectRatio` | number | `1.78` (16/9) | Target width/height the wrap algorithm aims for. |
| `fixedAspect` | boolean | `false` | `true` = hold exact aspect ratio by adjusting padding; `false` = fixed padding. |
| `hPadding` | number | `18` | **Horizontal** padding each side. |
| `vPadding` | number | `18` | **Vertical** padding each side. |
| `colorOverrides` | object | — | See [§4.1](#41-coloroverrides). |
| `effects` | object | — | See [§4.2](#42-effects-visualeffects). |
| `gradient` | object | — | See [§4.3](#43-gradient-gradientconfig). |

`default-node` does **not** support `areaColors` (it has no sections).

---

## 2. `equation-node`

Dashboard layout: title bar + equation (MathJax) + bottom metadata section.  
Source: `src/styles/designs/equation-node.ts`.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `topHeight` | number | `30` | Height of the title section. |
| `bottomHeight` | number | `30` | Height of the metadata section. |
| `horizontalPadding` | number | `20` | Horizontal padding. |
| `verticalPadding` | number | `20` | Vertical padding around the equation. |
| `borderRadius` | number | `6` | Corner radius. |
| `titleFontSize` | number | `11` | Title font size. |
| `typeFontSize` | number | `11` | Type-label font size. |
| `equationScale` | number | `1` | Equation size multiplier. |
| `minWidth` | number | `100` | Minimum node width. |
| `colorOverrides` | object | — | See [§4.1](#41-coloroverrides). |
| `effects` | object | — | See [§4.2](#42-effects-visualeffects). |
| `gradient` | object | — | See [§4.3](#43-gradient-gradientconfig). |
| `areaColors` | object | — | Per-section colours: `top`, `middle`, `bottom`. See [§4.4](#44-areacolors). |

---

## 3. `equation-compact-node`

Two-section layout: title bar + equation. Same as `equation-node` **without** the bottom metadata section — so its padding/section params differ.  
Source: `src/styles/designs/equation-compact-node.ts`.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `topHeight` | number | `30` | Height of the title section. |
| `horizontalPadding` | number | `20` | Horizontal padding. |
| `paddingAbove` | number | `25` | Padding **above** the equation. |
| `paddingBelow` | number | `35` | Padding **below** the equation (larger, to counterweight the title). |
| `borderRadius` | number | `6` | Corner radius. |
| `titleFontSize` | number | `11` | Title font size. |
| `equationScale` | number | `1` | Equation size multiplier. |
| `minWidth` | number | `100` | Minimum node width. |
| `colorOverrides` | object | — | See [§4.1](#41-coloroverrides). |
| `effects` | object | — | See [§4.2](#42-effects-visualeffects). |
| `gradient` | object | — | See [§4.3](#43-gradient-gradientconfig). |
| `areaColors` | object | — | Per-section colours: `top`, `middle` (no `bottom`). See [§4.4](#44-areacolors). |

### `equation-node` vs `equation-compact-node` — the differences

| Aspect | `equation-node` | `equation-compact-node` |
|---|---|---|
| Bottom metadata section | Yes (`bottomHeight`) | **No** |
| Vertical padding | `verticalPadding` (symmetric) | `paddingAbove` + `paddingBelow` (asymmetric) |
| Type-label font | `typeFontSize` | **Not present** |
| `areaColors` sections | `top`, `middle`, `bottom` | `top`, `middle` |

Everything else (`topHeight`, `horizontalPadding`, `borderRadius`, `titleFontSize`, `equationScale`, `minWidth`, and the shared colour/effect/gradient blocks) is identical.

---

## 4. Shared sub-structures

These blocks are accepted by all three designs (`areaColors` only by the equation designs). Defined in `src/core/style-types.ts`.

### 4.1 `colorOverrides`

Replaces specific theme colours for this node. All keys optional.

| Key | Type | Meaning |
|---|---|---|
| `background` | string (hex) | Node background colour. |
| `backgroundAlt` | string (hex) | Secondary/alt background colour. |
| `text` | string (hex) | Text colour. |
| `border` | string (hex) | Border colour. |

### 4.2 `effects` (`VisualEffects`)

Per-node adjustments over theme defaults. All keys optional.

| Key | Type | Range | Default | Meaning |
|---|---|---|---|---|
| `backgroundOpacity` | number | 0.0–1.0 | theme | Background opacity. |
| `backgroundAltOpacity` | number | 0.0–1.0 | theme | Alt-background opacity. |
| `textOpacity` | number | 0.0–1.0 | `1.0` | Text opacity. |
| `brightness` | number | 0.5–1.5 | `1.0` | Brightness multiplier. |
| `saturation` | number | 0.0–2.0 | `1.0` | Saturation multiplier. |
| `hue` | number | 0–360 | `0` | Hue rotation (degrees). |

### 4.3 `gradient` (`GradientConfig`)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | `'solid' \| 'linear' \| 'radial'` | — | Gradient kind. |
| `angle` | number (0–360) | `180` (top→bottom) | For `linear` only. |
| `stops` | `GradientStop[]` | bg → bgAlt | Colour stops (see below). |

`GradientStop`:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `offset` | number (0.0–1.0) | — | Position along the gradient. |
| `color` | string (hex) | — | Stop colour. |
| `opacity` | number (0.0–1.0) | `1.0` | Stop opacity. |

### 4.4 `areaColors`

Per-section background colours (equation designs only). All keys optional.

| Key | Type | Available in |
|---|---|---|
| `top` | string (hex) | `equation-node`, `equation-compact-node` |
| `middle` | string (hex) | `equation-node`, `equation-compact-node` |
| `bottom` | string (hex) | `equation-node` only |
