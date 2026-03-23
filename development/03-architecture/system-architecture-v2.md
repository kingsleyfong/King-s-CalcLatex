# System Architecture v2.0 — Browser-Native

## Overview

v2 is a 100% browser-native rewrite. All computation (CAS, rendering, units) happens in-process within the Obsidian Electron environment. No backend server, no HTTP, no iframes.

## Layers

### 1. Engine Layer (src/engine/)
In-process JavaScript math engine:
- **Parser**: CortexJS Compute Engine parses LaTeX → MathJSON AST
- **Evaluator**: CortexJS `.evaluate()` / `.N()` for symbolic and numeric results
- **CAS**: CortexJS `.simplify()`, `.solve()`, differentiation, integration
- **Units**: math.js `unit()` API for unit conversions
- **Compiler**: CortexJS `.compile()` produces JS functions for graph evaluation

### 2. Renderer Layer (src/renderer/)
Client-side rendering with no iframes:
- **2D**: function-plot (D3-based). Uses interval arithmetic for implicit curves. Re-evaluates on viewport change for infinite zoom resolution. Renders SVG directly into widget DOM.
- **3D**: Three.js with WebGLRenderer. Custom ShaderMaterial for GPU-evaluated surfaces. OrbitControls for zoom/pan/rotate. Renders Canvas directly into widget DOM.
- **Auto-range**: Samples expression at coarse points to determine sensible viewport before rendering.

### 3. Editor Layer (src/editor/)
CodeMirror 6 integration using ViewPlugin (NOT StateField):
- **Trigger Detection**: Regex scanner finds `=`, `\approx`, `\equiv`, `@plot2d`, `@plot3d`, `@geom`, `@persist`, `@convert` inside `$...$` and `$$...$$` blocks
- **Decoration Manager**: ViewPlugin that maps decorations through document changes. Only rebuilds decorations for changed lines. Never does full-document rebuild.
- **Widgets**: Thin wrapper classes that create container elements and delegate to renderers. Widgets persist across cursor movements and selection changes.
- **Keymap**: Tab-to-insert intercepts Tab at trigger positions and injects computed results.

### 4. View Layer (src/views/)
Obsidian sidebar views:
- **Graph Inspector**: Full-size graph with parameter controls, diagnostics, and export
- **Controls**: Parameter sliders for free variables, range adjustments

## Data Flow

### Inline Evaluation
```
User types: $\frac{d}{dx} x^3 =$
  → Trigger detection finds "=" at end of math block
  → Engine.parse("\\frac{d}{dx} x^3") → MathJSON AST
  → Engine.evaluate(ast, "exact") → "3x^2"
  → Widget displays " 3x^2" inline
```

### 2D Graph
```
User types: $x^2 + y^2 = 25 @plot2d$
  → Trigger detection finds "@plot2d"
  → Engine.parse("x^2 + y^2 = 25") → MathJSON AST
  → Engine.classify(ast) → { type: "implicit", vars: ["x","y"] }
  → AutoRange.compute(ast) → { x: [-7, 7], y: [-7, 7] }
  → Renderer2D.render(container, { fn: "x^2 + y^2 - 25", type: "implicit", range })
  → function-plot renders SVG with interval arithmetic into container
  → User zooms → function-plot re-evaluates at new density automatically
```

### 3D Graph
```
User types: $z = \sin(x) \cdot \cos(y) @plot3d$
  → Trigger detection finds "@plot3d"
  → Engine.parse("\\sin(x) \\cdot \\cos(y)") → MathJSON AST
  → Engine.classify(ast) → { type: "explicit_3d", vars: ["x","y"] }
  → Engine.compile(ast, ["x","y"]) → (x,y) => Math.sin(x) * Math.cos(y)
  → AutoRange.compute(ast) → { x: [-6,6], y: [-6,6], z: [-1.2,1.2] }
  → Renderer3D.render(container, compiledFn, range)
  → Three.js creates Surface mesh, renders WebGL canvas into container
  → OrbitControls enable smooth rotation/zoom
```

## Why Each Technology

| Choice | Why | Alternative Rejected |
|--------|-----|---------------------|
| CortexJS | Best JS LaTeX parser + symbolic eval | SymPy (requires Python server) |
| math.js | Mature numeric + units | Pint (Python only) |
| function-plot | Interval arithmetic, auto-zoom, MIT, 50KB | Plotly (data viz, no math awareness, 3.3MB) |
| Three.js | Standard WebGL, OrbitControls, huge ecosystem | Raw WebGL (too low-level), MathBox (unmaintained) |
| ViewPlugin | Proper decoration mapping, widget persistence | StateField (caused v1 bugs via full rebuild) |
| Direct DOM | No sandboxing, theme integration, event propagation | iframes (v1 failure) |
