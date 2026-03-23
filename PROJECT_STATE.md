# King's CalcLatex — Project State

> **This file is the canonical source of truth for LLM agents working on this project.**
> Read this file at the START of every conversation. Update it at the END of every conversation.

## Quick Summary
**King's CalcLatex** is an Obsidian desktop plugin that provides inline LaTeX evaluation, CAS computation, and high-fidelity 2D/3D graphing — all rendered directly in the editor.

**v2.0** is a complete ground-up rewrite: 100% browser-native, no Python backend.

## Current Status: 🟢 WORKING (v2.0 Path C — Giac WASM integrated, 2026-03-23)

### What Happened
On 2026-03-16, after analyzing v1's fundamental architecture limitations, decided to pursue **Path C** — a full browser-native rewrite. The v1 architecture (Python/SymPy/Plotly → HTTP → iframe) had rendering limitations that could never reach Desmos-level UX:
- Plotly is a data viz library, not a math engine (no interval arithmetic, no adaptive sampling)
- Fixed-grid rendering (500x500 2D, 60³ 3D) with no infinite-zoom capability
- HTTP round-trips for every interaction
- Iframe sandboxing killed theme propagation and widget state

### v2.0 Architecture
```
┌──────────────────────────────────────────────┐
│  100% Browser-Native Obsidian Plugin          │
│  ├── CAS: Giac WASM (primary) + CortexJS      │
│  │         + math.js (fallback chain)          │
│  ├── 2D:  function-plot (D3, interval arith)   │
│  ├── 3D:  Three.js + custom GLSL shaders       │
│  └── UI:  CM6 StateField + direct DOM widgets  │
└──────────────────────────────────────────────┘
```

### Completed & Confirmed Working

#### Core Architecture
- [x] Architecture decision (Path C) documented
- [x] Project scaffold (directory structure, package.json, tsconfig, esbuild)
- [x] CLAUDE.md agentic framework (root + repo-v2)
- [x] Type definitions and module interfaces (types.ts)
- [x] Engine module (CortexJS parser, evaluator, CAS, units, persistence)
- [x] Editor module (CM6 StateField decorations, trigger detection, widgets, Tab keymap)
- [x] 2D Renderer (custom canvas, Desmos-style, scroll/pan/zoom)
- [x] 3D Renderer (Three.js, static-image architecture, click-to-interact)
- [x] Auto-ranging module (smart viewport calculation)
- [x] Graph Inspector view + parameter controls
- [x] Settings tab (ranges, precision, auto-range, theme, zoom mode, arrow scale)
- [x] Build + sync pipeline verified (clean build, ~1.4MB bundle)

#### Evaluation Triggers
- [x] `=` exact symbolic evaluation
- [x] `\approx` numeric decimal — **CortexJS rational-pair bug fixed (2026-03-19)**
- [x] `\equiv` algebraic simplification
- [x] `@persist` variable assignment
- [x] `@convert <unit>` unit conversion
- [x] `@steps` — step-by-step CAS solution walkthrough (Giac debug capture, classified into named calculus rules) (2026-03-23)
- [x] Definite integral evaluation: `\int_a^b f(x)\,dx =` renders with notation and numeric result via Simpson's rule (2026-03-23)

#### CAS Triggers (all new, 2026-03-19)
- [x] `@diff` — symbolic differentiation (auto-detects variable)
- [x] `@int` — symbolic integration (auto-detects variable)
- [x] `@solve` — equation solving
- [x] `@factor` — polynomial factoring
- [x] `@px` — partial derivative ∂/∂x
- [x] `@py` — partial derivative ∂/∂y
- [x] `@pz` — partial derivative ∂/∂z
- [x] `@grad` — gradient vector ∇f (auto-detects 2D/3D from variables)
- [x] `@normal` — surface normal vector (explicit z=f(x,y) OR implicit F=0)

#### New CAS Triggers (2026-03-20 — Giac-powered)
- [x] `@limit` — symbolic limit (e.g. `\lim_{x \to 0}`)
- [x] `@taylor` — Taylor series expansion
- [x] `@partfrac` — partial fraction decomposition
- [x] `@expand` — full polynomial/trig expansion
- [x] Additional trig identities: cos²-sin²→cos(2θ), 2sin·cos→sin(2θ) (2026-03-23)
- [x] Sum/difference of cubes factoring: x³±a³ → (x±a)(x²∓ax+a²) (2026-03-23)
- [x] Context-aware CAS error messages when Giac unavailable (2026-03-23)

#### 2D Graphing (`@plot2d`)
- [x] Explicit curves: `y = f(x)`
- [x] Implicit curves: `f(x,y) = c` (marching squares / interval arithmetic)
- [x] Parametric: `(\cos(t), \sin(t))`
- [x] Polar: `r = f(\theta)` — theta vs t variable bug fixed
- [x] Inequalities: `y > f(x)` with shading
- [x] Points: `(5,5)` — filled dot with coordinate label
- [x] Multi-equation overlay (semicolon-separated)
- [x] POIs: roots, extrema, intersections

#### 3D Graphing (`@plot3d`)
- [x] Explicit surfaces: `z = f(x,y)` — z-clamping to prevent cube overflow
- [x] Implicit surfaces: `F(x,y,z) = 0` — marching cubes, auto z-range
- [x] Parametric 3D curves: `(\cos(t), \sin(t), t/3)` and `\frac{...}{n}` notation
- [x] Vectors: `<1,2,3>` and `\langle a,b,c \rangle`
- [x] 3D Points: `(1,2,3)` — sphere with range-relative radius
- [x] Multi-equation 3D overlay
- [x] 1:1:1 axis scaling (origin-mode and range-center mode)
- [x] Static image + click-to-interact (avoids Chrome 16-context limit)
- [x] 2D expressions promoted to 3D when in `@plot3d` mode
- [x] Default 1:1:1 proportional axis scaling (autoScaleZ3d setting, default: off) (2026-03-23)
- [x] Analytical plane rendering for implicit_3d — planes render as full box-filling polygons, not diamond artifacts from marching cubes (2026-03-23)

#### Calc 3 Plot Modes
- [x] `@contour` — contour/iso-level curves of f(x,y)
- [x] `@vecfield` — 2D and 3D vector fields with auto-routing
- [x] `@vecfield 0.5` — per-expression arrow scale suffix
- [x] `@gradient` — contour + ∇f arrows
- [x] `@tangent` — surface + tangent plane + point
- [x] `@region` — shaded area between two curves
- [x] `@geom` — 3D geometry mode for vectors

#### Linear Algebra (via `=`)
- [x] Cross product (manual, bypasses CortexJS)
- [x] Determinant, transpose, inverse
- [x] Dot product, matrix multiplication

#### Export & UI
- [x] PNG download button on 2D and 3D graph toolbars (2026-03-23)
- [x] Screenshot-to-clipboard button on graph toolbars (2026-03-23)

### Known Issues
- 3D interactive mode: only one graph interactive at a time (by design — Chrome 16-context limit)
- Parameter sliders: fixed range ±10, step 0.1 — no per-slider customization yet
- `giacwasm.js` is 19MB — loaded on plugin startup; no lazy-loading yet
- 3D static snapshot of parametric curves may appear thin; click to interact
- No piecewise function support
- No table/data/regression features

### All Runtime Bugs Fixed (cumulative)
1. **Block decorations RangeError** — ViewPlugin → StateField
2. **Tab re-trigger loop** — `insertPos = trigger.to`
3. **First Tab exits math block** — cursor containment check
4. **z=f(x,y) classified as implicit** — string-level fast path in classifyExpression
5. **Multi-var NaN surface** — always use `new Function` (not CortexJS compiled)
6. **z range defaulted wrong** — sample 20×20 grid for actual z extent
7. **Square/Cube/Root CortexJS heads** — explicit jsonToInfix handlers
8. **Equal vs Assign equation heads** — accept both in buildPlotData
9. **Inspector never populated** — publishInspectorState() added to widgets
10. **Parametric 3D tuple extraction** — Divide/Multiply cases in extractTupleComponents
11. **WebGL context leak race** — destroyed flag guards async toDOM() chain
12. **Black screen on scroll-back** — reset `destroyed = false` in toDOM() (CM6 re-uses same instance)
13. **3D context limit** — Static image architecture: zero persistent WebGL contexts
14. **Polar curves not rendering** — `\theta` → CortexJS symbol "theta", not "t"; theta-aware var detection
15. **3D origin-mode scaling overflow** — `s = 1/max(|extremes|)` not `s = 2/maxSpan`
16. **Explicit 3D mesh escaping cube** — z-clamping to ranges.z in buildExplicit3DMesh
17. **Implicit 3D plane not filling cube** — sign-change z search for auto-range
18. **3D vecfield routing to 2D widget** — heuristic: 3+ semicolons OR z variable → 3D
19. **captureArg mode string** — `@vecfield:0.5` splits correctly in createWidget and preparePlot
20. **\approx shows fraction not decimal** — CortexJS numericValue is rational pair `[-8, 577]`; `forceNumber()` handles array, Decimal, fraction-string, compiled-fn fallbacks
21. **Electron CSP blocks file:// script src** — `giacwasm.js` cannot be loaded via `<script src="file://...">` under Electron's CSP; workaround: read file contents with `fs.readFileSync` and inject as inline `<script>` tag
22. **3D per-axis scaling wrong** — surfaces did not fill the cube when x/y/z ranges differed; fixed by computing per-axis scale factors `(sx, sy, sz)` and applying them independently rather than using a single uniform scale
23. **CortexJS `.latex` property broken for CAS output** — `.latex` on a CortexJS expression object returns mangled or empty strings for some CAS results; replaced with custom `jsonToLatex()` that walks MathJSON directly
24. **3D Z-axis not 1:1:1** — auto-computed z range broke proportional scaling; now defaults to matching x/y range with opt-in autoScaleZ3d setting
25. **Implicit 3D planes render as diamond** — marching cubes produces diamond intersection artifact for linear surfaces; now detects planes analytically and computes exact plane-AABB intersection polygon

## File Map
```
repo-v2/src/
├── main.ts              ← Plugin entry, settings, commands
├── settings.ts          ← Settings tab UI
├── types.ts             ← All shared types (ExprType, EvalMode, PlotSpec, etc.)
├── engine/
│   ├── index.ts         ← Engine facade (preparePlot, evaluate, persist, convert)
│   ├── parser.ts        ← CortexJS LaTeX→MathJSON, jsonToInfix, compileToFunction
│   ├── evaluator.ts     ← Numeric/symbolic eval + linear algebra intercepts
│   ├── cas.ts           ← Differentiate, integrate, solve, partials, gradient, normal
│   ├── units.ts         ← Unit conversions via math.js
│   └── poi.ts           ← Points of interest (roots, extrema, intersections)
├── renderer/
│   ├── index.ts         ← Renderer facade (create2DGraph, create3DGraph, renderSnapshot)
│   ├── renderer2d.ts    ← Full custom Canvas 2D (Desmos-style, no D3 deps)
│   ├── renderer3d.ts    ← Three.js 3D (explicit, implicit, parametric, vectors, points)
│   ├── auto-range.ts    ← Smart viewport from expression analysis
│   └── colors.ts        ← Color palette
├── editor/
│   ├── index.ts         ← CM6 extensions (exports)
│   ├── triggers.ts      ← Trigger detection (all @modes and special triggers)
│   ├── widgets.ts       ← ResultWidget, Graph2DWidget, Graph3DWidget
│   ├── decorations.ts   ← CM6 StateField decoration manager
│   └── keymap.ts        ← Tab-to-insert keymap
└── views/
    ├── inspector.ts     ← Graph Inspector sidebar
    └── controls.ts      ← Parameter slider controls
```

## Critical Architecture Notes for Future Agents

### CortexJS numericValue is a rational pair for fractions
`ce.parse("-\\frac{8}{577}").N().numericValue` returns `[-8, 577]` (array), NOT a JS number.
Always use `forceNumber()` in evaluator.ts which handles: JS number, rational pair array, Decimal .toNumber(), Decimal string, fraction string parsing, and compiled-fn fallback.

### CortexJS parses \theta as symbol "theta", not "t"
For polar and parametric expressions using `\theta`, check `syms.has("theta")` everywhere you check `syms.has("t")`. Both parser.ts (classifyExpression) and engine/index.ts (polar branch) do this.

### Three.js Y-up convention
Math coordinates (x, y, z) → Three.js (x, z, y). Every place you call `position.set()` must swap y and z.

### CM6 block decorations MUST use StateField
`ViewPlugin.decorations` throws `RangeError: Block decorations may not be specified via plugins` in Obsidian. Use `StateField.define({ provide: f => EditorView.decorations.from(f) })`.

### Chrome ~16 WebGL context limit
Do not create persistent WebGL contexts. Use `renderSnapshot()` (creates context, captures canvas.toDataURL(), destroys context in ~50ms). Keep at most 1 live interactive context at a time.

### captureArg mode strings
`@vecfield 0.5` triggers with mode `"vecfield:0.5"`. Always use `mode.split(":")[0]` for matching and `mode.startsWith("vecfield:")` for detection. preparePlot takes `mode: string`, not `PlotMode`.

### Giac WASM integration (2026-03-20)
- `giac.ts` is the bridge module — initialises Giac via `window.Giac`, exposes `giacCompute(cmd: string): string`
- `cas.ts` and `evaluator.ts` try Giac first for all CAS operations; fall back to CortexJS + manual code if Giac returns an error or is not yet initialised
- `main.ts` init: reads `giacwasm.js` bytes with `fs.readFileSync`, injects as inline `<script>` to satisfy Electron's CSP (`file://` src URLs are blocked)
- `settings.ts`: `enableGiac` boolean toggle; when false, Giac bridge short-circuits and the fallback chain runs immediately
- CAS output LaTeX: uses `jsonToLatex()` (custom MathJSON walker) — do NOT use CortexJS `.latex` property on CAS results

### CortexJS `.latex` is unreliable for CAS output
Use `jsonToLatex(expr.json)` (defined in `parser.ts`) whenever you need a LaTeX string from a CortexJS expression that came back from a CAS operation. The `.latex` getter silently returns wrong/empty strings for several expression forms.

## Next Steps (Priority Order)
1. **Slider range customization** — per-slider min/max/step instead of fixed ±10
2. **Piecewise functions** — `{x>0: x^2, x<=0: -x}` syntax support
3. **Tables + scatter plots** — data entry and regression
4. **Summation/product notation** — `\sum_{n=1}^{10} n^2 =` evaluation
5. **Per-expression colors** — color picker per curve
6. **Height-based 3D surface coloring** — color gradient by z value (Desmos-style)
7. **Systems of equations** — simultaneous solving
8. **Domain restrictions** — `y=x^2 {0<x<5}` syntax
9. **Mobile** — touch event handling for 2D pan/zoom
10. **Performance profiling** — Giac 19MB load time; investigate lazy loading
