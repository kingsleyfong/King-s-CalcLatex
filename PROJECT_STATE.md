# King's CalcLatex — Project State

> **This file is the canonical source of truth for LLM agents working on this project.**
> Read this file at the START of every conversation. Update it at the END of every conversation.

## Quick Summary
**King's CalcLatex** is an Obsidian desktop plugin that provides inline LaTeX evaluation, CAS computation, and high-fidelity 2D/3D graphing — all rendered directly in the editor.

**v2.0** is a complete ground-up rewrite: 100% browser-native, no Python backend.

## Current Status: 🟢 v3.2.1 — LaTeX Suite fixed, settings fully wired, pushed to GitHub (2026-07-22, Part 37) — needs in-Obsidian confirmation

> ⚠️ **Correction:** The old "🟢 WORKING (v3.2.0)" claim was FALSE. The snippet engine was silently registering **zero** extensions until Part 36. Do not trust a green status without an end-to-end check.

### What Happened (Part 36 — the real fix)
The live path is `main.ts → latex-suite/provider.ts → latex_suite.ts → runSnippets`. **Parts 33–35 all edited the standalone `src/latex-suite/main.ts` class, which nothing live imports** — so the actual bug was never touched. That dead file has now been deleted.

**Root cause:** ES2022 target ⇒ `useDefineForClassFields` ON, but the vendored code was written for upstream's ES6/`false` build. `StringSnippet` redeclared `data: SnippetData<"string">;`, which under define-semantics reset `this.data = undefined` after `super()` set it, so `this.data.triggerAfter = …` threw on the first snippet (`mk`). `parseRawSnippetArray` threw → `provider.ts`'s `try/catch` swallowed it → `initLaTeXSuiteEngine` returned `[]` → **engine did nothing, no error surfaced.**

**Fixed:** `useDefineForClassFields:false` + removed the redeclaration (both fix it). Verified in isolation: all **200** snippets now parse, `snippetsEnabled:true`. Also restored the type checker, deleted 16 dead vendored files, fixed a `mkConcealPlugin` arg bug, deduped `@codemirror/state`, and fixed the production build's broken vault-sync.

### What Happened (Part 37 — pushed live + settings parity)
Committed & tagged `v3.2.1`, pushed to `github.com/kingsleyfong/King-s-CalcLatex` (`main` + tag) — Release workflow auto-published it. Added a `ci.yml` workflow so every push/PR now gets typechecked+built (previously only tagged releases were validated at all, which is how the Part 36 bug shipped invisibly for ~10 commits).

Separately: most of the LaTeX Suite settings toggles already in the UI (`enableAutoFraction`, `enableMatrixShortcuts`, etc.) turned out to be **decorative — `provider.ts` ignored `plugin.settings` almost entirely** and built its config from a hardcoded default. Fixed via two parallel agents on disjoint files (UI in `settings.ts`, engine wiring in `provider.ts`) against a contract I wrote first in `types.ts`. All ~29 upstream settings are now both exposed in the UI and actually control the engine — full mapping documented inline in `provider.ts`. Full detail in `development/handoff_log.md` (Part 37).

**Known limitation (not a regression, pre-existed for `enableLaTeXSuite`):** changing a LaTeX Suite setting requires reloading Obsidian to take effect — no live hot-reload yet (would need a CodeMirror `Compartment`, deferred as future work).

**Still to confirm (needs Obsidian, not CLI):** reload the plugin and (1) type `mk`, `dm`, `//`, `sr` — they should expand; (2) regression-check that a 2D plot, 3D plot, and `=` evaluation still render; (3) change a LaTeX Suite setting (e.g. auto-fraction macro), reload Obsidian, confirm it took effect. **Also:** add & verify `kingsleyfong@gmail.com` under GitHub → Settings → Emails — commits are authored with that address but your account's verified email is `ktcfong@uwaterloo.ca`, so GitHub currently can't attribute any commit to you (only the required Claude co-author trailer shows).

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
- [x] `\sum_{n=lo}^{hi}` and `\prod_{n=lo}^{hi}` — finite summation and product evaluation, capped at 100k iterations (2026-03-24)

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
- [x] Piecewise functions: `\begin{cases}` with conditional branches compiled to nested ternary (2026-03-24)
- [x] Domain restrictions: `\{0 < x < 5\}` suffix clips compiled functions to specified interval (2026-03-24)

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
- [x] Height-based vertex coloring for explicit_3d surfaces — 5-stop blue→cyan→green→yellow→red gradient by z-value (2026-03-24)

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

#### Laplace Transforms (2026-03-24 — Giac-powered)
- [x] `@laplace` — forward Laplace transform (t → s) via Giac WASM
- [x] `@ilaplace` — inverse Laplace transform (s → t) via Giac WASM
- [x] Auto-detects time/frequency variable (isolated `t` or `s`, not inside `\tan`, `\sin`, etc.)

#### ODE Phase Portraits (2026-03-24)
- [x] `@phase` — direction field (gray arrows) + RK4 solution curves from multiple initial conditions
- [x] `@ode` — direction field only (no solution curves)
- [x] Supports `y' = f(x,y)`, `\frac{dy}{dx} = f(x,y)`, and `\dot{y} = f(x,y)` input formats
- [x] RK4 solver with adaptive step limiting, divergence clipping (|y| > 1e6)
- [x] New `engine/ode.ts` module: `solveODE_RK4`, `computeDirectionField`, `generateSolutionCurves`

#### Per-Expression Colors & Line Styles (2026-03-24)
- [x] `#colorname` suffix (red, blue, green, orange, purple, cyan, yellow, pink, white, black, gray)
- [x] `#hexcode` suffix (3-digit and 6-digit hex: `#f00`, `#ff0000`)
- [x] `--` suffix for dashed lines, `..` suffix for dotted lines
- [x] Applied in 2D renderer (stroke color + setLineDash) and 3D renderer (material color via NAMED_COLORS map)
- [x] Color parsing handles both named CSS colors and hex via offscreen canvas fallback

#### Export & UI
- [x] PNG download button on 2D and 3D graph toolbars (2026-03-23)
- [x] Screenshot-to-clipboard button on graph toolbars (2026-03-23)
- [x] Per-slider editable min/max bounds — click to customize range instead of fixed ±10 (2026-03-24)
- [x] WebM animation export — ⏺ record button per slider; captures one full min→max pass at 30fps via `canvas.captureStream()` + `MediaRecorder`; auto-stops at 4 s; downloads `kcl-{var}-anim.webm` (2026-04-06)

#### Scatter Plots, Tables, Regression (2026-04-05)
- [x] `@scatter` — scatter plot from `(x1,y1);(x2,y2);...` data pairs (filled dots on canvas graph)
- [x] `@scatter lin` — linear regression overlay (dashed curve, R² in label)
- [x] `@scatter poly2` — degree-2 polynomial regression
- [x] `@scatter poly3` — degree-3 polynomial regression
- [x] `@scatter exp` — exponential regression `y = a·e^(bx)` (y > 0 data required)
- [x] `@table` — render data as a formatted HTML table with n, x̄, ȳ stats
- [x] Auto-range from data extent (15% padding)
- [x] Regression implemented via least-squares normal equations (Gaussian elimination — no external dep)
- [x] R² goodness-of-fit displayed in graph expression label overlay

### Known Issues
- 3D interactive mode: only one graph interactive at a time (by design — Chrome 16-context limit)
- `giacwasm.js` is 19MB — loaded on plugin startup; no lazy-loading yet
- 3D static snapshot of parametric curves may appear thin; click to interact
- No table/data/regression features
- Piecewise: CortexJS may not parse all `\begin{cases}` forms; string-level preprocessor handles most common patterns
- Summation: only braced bound form `_{n=1}^{10}` supported; unbraced `_1^{10}` falls through to CortexJS

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
26. **`x = 1` renders as horizontal line `y = 1`** — `classifyExpression` was returning `explicit_2d` for `x = f(y)`, so `buildPlotData` extracted the RHS and compiled as `fn(x) = 1` → `y = 1`. Fix: `x = ...` now returns `implicit_2d`; marching squares draws `x - 1 = 0` as a vertical line. Also fixes `x = 1 @plot3d` (was rendering `z = 1` floor instead of `x = 1` plane).

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
│   ├── ode.ts           ← ODE RK4 solver, direction fields, solution curves
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
1. **Mobile** — touch event handling for 2D pan/zoom
2. **Performance profiling** — Giac 19MB load time; investigate lazy loading
3. **Color picker UI** — visual color selection per curve (currently suffix-only)
4. **Higher-order ODE** — extend @phase to 2nd-order systems
5. **Save/load graph state** — persist zoom level, slider values, interactive angle
