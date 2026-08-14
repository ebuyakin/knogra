# Background System Design

> **Status:** Current  
> **Last reviewed:** 2026-06-14  
> **Authority:** Canonical source for scene background canvas behavior and background rendering.  
> **Types:** `src/core/background-types.ts`  
> **Related:** [Documentation map](README.md), [Theme architecture](theme-architecture.md), [Node design system](node-design-system.md)

## Purpose & Motivation

Knogra visualizes knowledge graphs using Cytoscape.js. While nodes and edges convey structure, **background images add visual context and identity** to scenes:

- **Spatial context**: Maps, diagrams, or reference images that nodes can be positioned relative to
- **Aesthetic identity**: Each scene can have a distinct visual character
- **Information layering**: Background conveys ambient information while the graph conveys explicit relationships
- **User orientation**: Consistent backgrounds help users recognize and navigate between scenes

### Use Cases

| Use Case | Example |
|----------|---------|
| **Geographic** | World map with nodes representing cities/events |
| **Conceptual** | Abstract art creating mood for a topic cluster |
| **Reference** | Technical diagram with annotation nodes overlaid |
| **Decorative** | Subtle textures that distinguish scene themes |

---

## Relationship with Cytoscape

The background system is **independent but viewport-synchronized** with the Cytoscape graph:

```
┌─────────────────────────────────────────────────┐
│  Container (#cy)                                │
│  ┌───────────────────────────────────────────┐  │
│  │  Background Canvas (z-index: 0)           │  │ ← Our system
│  │  - Draws images in graph coordinates      │  │
│  │  - Listens to viewport changes            │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  Cytoscape Canvas (z-index: auto)         │  │ ← Cytoscape's system
│  │  - Draws nodes, edges, labels             │  │
│  │  - Controls viewport (pan, zoom)          │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Key points:**
- Background images use the **same coordinate system** as graph nodes (graph units, not pixels)
- Cytoscape **owns the viewport** (pan, zoom) — background canvas follows
- No direct dependency: Cytoscape doesn't know about background; background subscribes to viewport events
- Images render **below** all graph elements

This separation means:
- Background can be changed without touching graph state
- Graph can be manipulated without re-rendering background (unless viewport changes)
- Transitions can animate background independently of graph transitions

---

## Overview

Canvas-based background image system for rendering images behind the Cytoscape graph. Supports multiple images per scene, viewport-synchronized positioning, animated transitions with crossfade, and advanced visual effects including selective color adjustment.

---

## Architecture

### Why Canvas (Not CSS Background)

CSS backgrounds (`background-image`) seem simpler but don't meet our needs:

| Requirement | CSS Background | Canvas |
|-------------|----------------|--------|
| Move with graph pan/zoom | ❌ Complex hacks | ✅ Native coordinate transform |
| Multiple images | ❌ Limited stacking | ✅ Full control |
| Per-image opacity animation | ❌ All-or-nothing | ✅ Individual control |
| Blend modes per image | ❌ Not possible | ✅ `globalCompositeOperation` |
| Pixel-level effects | ❌ No access | ✅ ImageData manipulation |

Canvas gives us:
- **Viewport sync**: Images move/zoom with graph via coordinate transformation
- **Multi-layer**: Multiple images with individual z-index, blend modes, filters
- **Animation**: Fine-grained opacity control for transitions
- **Performance**: GPU-accelerated compositing

### Class Structure

```
BackgroundRenderer              # Coordinates canvases, owns caches
├── BackgroundCanvas (main)     # Primary drawing surface
├── BackgroundCanvas (transition) # Temporary, during crossfade
├── imageCache: Map<id, HTMLImageElement>
└── processedCache: Map<key, HTMLCanvasElement>  # Selective color results
```

---

## Type System

### `SceneBackgroundImage`
Instance of an image placed in a scene.

```
src/core/background-types.ts
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique placement ID |
| `imageId` | `BackgroundImageId` | → `BackgroundImage` asset |
| `position` | `{ x, y }` | Graph coordinates |
| `size` | `{ width, height }` | Graph units |
| `zIndex` | `number` | Stacking order |
| `appearance` | `ImageVisualAppearance` | All visual settings |

### `ImageVisualAppearance`
Visual settings for images. Used in `SceneBackgroundImage.appearance` and `ColorTheme.imageDefaults`.

| Property | Range | Description |
|----------|-------|-------------|
| `opacity` | 0–1 | Overall transparency |
| `blendMode` | `BlendMode` | CSS composite operation |
| `brightness` | 0–2 | 1 = no change |
| `contrast` | 0–2 | 1 = no change |
| `saturation` | 0–2 | Global saturation |
| `hue` | 0–360 | Rotate all colors |
| `blur` | 0–10 | Pixels |
| `borderFade` | 0–1 | Edge fade amount |
| `selectiveColor` | `SelectiveColorAdjustment` | Per-range color control |
| `mask` | `GradientMask` | Opacity gradient |

### `SelectiveColorAdjustment`

**Why selective color?** Global adjustments (brightness, saturation) affect all colors equally. But often you want to:
- Make a sunset more vibrant without oversaturating the sky
- Mute greens in foliage while preserving skin tones
- Shift reds toward orange without affecting blues

Selective color provides independent control over 4 color ranges covering the full spectrum:

```
       Yellow (30–90°)
      /              \
 Red (330–30°)    Green (90–180°)
      \              /
       Blue (180–330°)
```

Each range (`red`, `yellow`, `green`, `blue`) has:
- `hue`: -30 to +30 (shift toward neighbors)
- `saturation`: 0–2
- `lightness`: 0–2

### `GradientMask`
Gradient-based opacity mask.

| Field | Description |
|-------|-------------|
| `type` | `'linear'` or `'radial'` |
| `angle` | For linear (degrees) |
| `center` | For radial (normalized 0–1) |
| `stops` | Array of `{ offset, opacity }` |

### `BlendMode`
All CSS `globalCompositeOperation` values: `source-over`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, etc.

---

## Key Files

### Core Types
| File | Contents |
|------|----------|
| `src/core/background-types.ts` | `SceneBackgroundImage`, `ImageVisualAppearance`, `SelectiveColorAdjustment`, `BlendMode`, `GradientMask` |
| `src/core/main-types.ts` | `BackgroundImage` (asset), `BackgroundImageId` |

### Rendering
| File | Responsibility |
|------|----------------|
| `src/background/background-canvas.ts` | Single canvas management |
| `src/background/background-renderer.ts` | Multi-canvas coordination, caching |
| `src/background/selective-color-processor.ts` | Pixel-level color range processing |

### Features
| File | Responsibility |
|------|----------------|
| `src/features/scene-background.ts` | Viewport sync, scene lifecycle |
| `src/features/transition/*.ts` | Animated transitions with crossfade |

### Utilities
| File | Responsibility |
|------|----------------|
| `src/features/utils/pure/coordinate-transform.ts` | Graph ↔ canvas coordinate conversion |

---

## Classes

### `BackgroundCanvas`
```
src/background/background-canvas.ts
```

Single canvas element with drawing capabilities.

| Method | Description |
|--------|-------------|
| `constructor(container, zIndex)` | Create canvas, insert into DOM |
| `setImages(images, sources)` | Store images and sources for rendering |
| `redraw(zoom, pan)` | Draw all images at viewport position |
| `clear()` | Clear canvas |
| `resize(w, h)` | Handle window resize |
| `getElement()` | Return canvas element |
| `destroy()` | Remove from DOM |

**Does NOT own:** Image cache (passed in from parent)

### `BackgroundRenderer`
```
src/background/background-renderer.ts
```

Coordinates canvases and manages transitions.

| Method | Description |
|--------|-------------|
| `render(images)` | Load images to main canvas |
| `redraw(zoom, pan)` | Redraw all active canvases |
| `clear()` | Clear all canvases |
| `resize(w, h)` | Resize all canvases |
| `getMainCanvas()` | Return main canvas element |
| `prepareTransition()` | Create transition canvas |
| `renderToTransition(images)` | Load images to transition canvas |
| `getTransitionCanvas()` | Return transition canvas (if exists) |
| `commitTransition()` | Swap transition → main, cleanup |
| `cancelTransition()` | Abort, remove transition canvas |
| `destroy()` | Cleanup everything |

**Owns:** Image cache, processed cache, both canvases

### `processSelectiveColor`
```
src/background/selective-color-processor.ts
```

```typescript
function processSelectiveColor(
  source: HTMLImageElement | HTMLCanvasElement,
  selectiveColor: SelectiveColorAdjustment
): HTMLCanvasElement
```

Pixel-by-pixel processing: RGB → HSL → determine color range → apply adjustment → HSL → RGB.

---

## Coordinate System

### Why Graph Coordinates?

Background images are positioned in **graph coordinates** (same units as Cytoscape nodes), not screen pixels. This is essential because:

1. **Zoom invariance**: An image at `{ x: 100, y: 100 }` stays aligned with a node at the same position regardless of zoom level
2. **Pan invariance**: Panning the viewport moves both the image and nodes together
3. **Authoring simplicity**: Place an image "under" a cluster of nodes by using node coordinates

### Coordinate Spaces

```
Graph Space                    Screen Space (Canvas Pixels)
─────────────                  ────────────────────────────
  • Position: center           • Position: top-left corner
  • Units: graph units         • Units: CSS pixels
  • Origin: (0, 0) arbitrary   • Origin: (0, 0) = top-left of canvas
```

### Transformation

```
Screen X = (Graph X × zoom) + pan.x
Screen Y = (Graph Y × zoom) + pan.y
Screen Width = Graph Width × zoom
Screen Height = Graph Height × zoom
```

The `coordinate-transform.ts` utilities handle this:
- `graphToCanvas(graphPos, zoom, pan)` → screen position
- `scaleSize(graphSize, zoom)` → screen dimensions

---

## Transition Flow

When switching between scenes, background images need to transition smoothly. A **crossfade** (old fading out while new fades in) prevents jarring visual discontinuities and maintains spatial orientation during navigation.

### Why Two Canvases?

A single canvas can only show one set of images at a time. To crossfade:
- **Main canvas**: Shows current scene's images
- **Transition canvas**: Created temporarily, loads new scene's images
- Both animate opacity simultaneously → visual blend
- After animation, transition canvas becomes the new main canvas

### Normal Operation (No Transition)
```typescript
await backgroundRenderer.render(scene.backgroundImages);
backgroundRenderer.redraw(cy.zoom(), cy.pan());

cy.on('viewport', () => backgroundRenderer.redraw(zoom, pan));
```

### Crossfade Transition
```typescript
// 1. Prepare (invisible canvas on top)
const transitionCanvas = backgroundRenderer.prepareTransition();

// 2. Load new scene to transition canvas
await backgroundRenderer.renderToTransition(newScene.backgroundImages);

// 3. Animate both simultaneously
await Promise.all([
  animateOpacity(backgroundRenderer.getMainCanvas(), 0),  // Old fades out
  animateOpacity(transitionCanvas, 1)                     // New fades in
]);

// 4. Finalize
backgroundRenderer.commitTransition();  // Swap canvases
```

### Timing (Parallel Mode)
- Phase 1 (20%): main 1.0 → 0.7
- Phase 2 (60%): main 0.7 → 0, transition 0 → 0.7 (parallel)
- Phase 3 (20%): transition 0.7 → 1.0

---

## DOM Structure

### Normal State
```html
<div id="cy">
  <canvas class="bg-main" style="z-index: 0; opacity: 1;">
  <!-- Cytoscape elements -->
</div>
```

### During Transition
```html
<div id="cy">
  <canvas class="bg-main" style="z-index: 0; opacity: 0.5;">
  <canvas class="bg-transition" style="z-index: 0; opacity: 0.5;">
  <!-- Cytoscape elements -->
</div>
```

---

## Caching Strategy

Image loading and pixel processing are expensive operations. The caching strategy optimizes for the common cases:

1. **Same image in multiple scenes**: Load once, reuse everywhere
2. **Same image with same effects**: Process once, cache result
3. **Scene switching**: Don't reload images that haven't changed

### Image Cache
```typescript
#imageCache: Map<BackgroundImageId, HTMLImageElement>
```
- Images loaded once, reused across scenes
- Persists across transitions
- Cleared on `destroy()`

### Processed Cache
```typescript
#processedCache: Map<string, HTMLCanvasElement>
```
- Key: `${imageId}-${selectiveColorHash}`
- Caches selective color processing results (expensive pixel-by-pixel operation)
- Invalidated when selective color settings change

---

## Theme Integration

Themes can define default visual settings for new background images, ensuring consistency across scenes without manual configuration.

```typescript
ColorTheme.imageDefaults?: ImageVisualAppearance
```

When a user adds an image to a scene, these defaults are applied automatically. Defined in `src/styles/themes/default-theme.ts`, and overridden per-theme by the light palettes.

---

## Usage Examples

### Selective Color — Warmer Image
```typescript
selectiveColor: {
  red: { saturation: 1.3 },
  yellow: { saturation: 1.2 }
}
```

### Selective Color — Cooler Image
```typescript
selectiveColor: {
  blue: { saturation: 1.3, lightness: 1.1 }
}
```

### Mute Greens
```typescript
selectiveColor: {
  green: { saturation: 0.5 }
}
```

### Shift Reds Toward Orange
```typescript
selectiveColor: {
  red: { hue: +15 }
}
```
