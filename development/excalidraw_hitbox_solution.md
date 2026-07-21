# Developer Guide: Excalidraw Hitbox Expansion Solution (Option A)

## Problem & Context
Excalidraw renders LaTeX math equations as SVG image elements. In standard MathJax SVGs, transparent areas between glyphs (e.g. whitespace between fractions, exponents, or matrix rows) can cause Excalidraw's pixel-alpha hit-testing to ignore clicks landing inside the visual bounding box.

## Future Implementation Guide: Option A (Invisible SVG Hitbox Rect)

If you ever wish to force Excalidraw to treat 100% of an equation's bounding rectangle as solid for mouse clicks and drag selection, apply Option A to the SVG generation pipeline:

### Implementation Steps

1. In `repo-v2/src/excalidraw/preview-tooltip.ts` (or wherever MathJax SVGs are converted to canvas/image elements):
2. After `MathJax.tex2svg(latex)` returns the `<svg>` DOM node:
3. Prepend an invisible `<rect>` element covering the full width and height of the SVG viewport:

```typescript
function injectHitboxRect(svg: SVGElement): void {
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "100%");
  rect.setAttribute("height", "100%");
  rect.setAttribute("fill", "rgba(0,0,0,0.001)"); // 0.1% opacity: 100% visually invisible, solid for hit-testing
  rect.setAttribute("pointer-events", "all");
  svg.insertBefore(rect, svg.firstChild);
}
```

### Technical Benefits
- **$O(1)$ Fast Hit-Testing**: Bypasses Excalidraw's pixel-by-pixel canvas buffer alpha scanning.
- **Layering Preservation**: Does not affect Z-index element stacking (elements on top layers continue to be hit-tested first).
- **Zero Visual Distortion**: 0.001 alpha is rendered as completely transparent by GPU compositors.
