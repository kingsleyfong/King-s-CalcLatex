# Handoff Log: King's CalcLatex Session Summary

## Session: 2026-03-24 (Part 2) — Tier 1 Competitive Features (3 parallel agents)

### What Was Done

#### New Features (implemented via 3 parallel Sonnet agents + orchestrator validation)

1. **Per-expression colors + line styles** (`engine/index.ts`, `renderer2d.ts`, `renderer3d.ts`)
   - `#colorname` suffix (red, blue, green, orange, purple, cyan, yellow, pink, etc.)
   - `#hexcode` suffix (3-digit and 6-digit hex)
   - `--` for dashed lines, `..` for dotted lines
   - 2D: `ctx.strokeStyle = pd.color`, `ctx.setLineDash()` per trace with proper reset
   - 3D: `NAMED_COLORS` lookup map + hex parsing for Three.js material color override

2. **Laplace transforms** (`engine/giac.ts`, `engine/evaluator.ts`)
   - `giacLaplace(latex)` — Giac command `laplace(expr, t, s)`
   - `giacILaplace(latex)` — Giac command `ilaplace(expr, s, t)`
   - Smart variable detection: isolated character match (avoids false positives from `\sin`, `\tan`, etc.)

3. **ODE solving + phase portraits** (`engine/ode.ts` NEW, `engine/index.ts`, `renderer2d.ts`)
   - `solveODE_RK4()` — textbook 4th-order Runge-Kutta numerical solver
   - `computeDirectionField()` — arrow grid for y' = f(x,y)
   - `generateSolutionCurves()` — RK4 from multiple initial conditions
   - `buildODESpec()` — strips y'/frac{dy}{dx}/dot{y} prefix, compiles with [x,y]
   - `drawODEPhase()` — gray direction field + colored solution curves in 2D canvas

#### Bugs Found & Fixed by Validation Agent

| # | Severity | Fix |
|---|----------|-----|
| 1 | HIGH | Color regex `\d{3}\|\d{6}` → `[0-9a-fA-F]{3}\|[0-9a-fA-F]{6}` (hex letters not matched) |
| 2 | HIGH | `drawInequality`/`drawContour`/`drawRegionFill` — `parseInt(color.slice(1,3), 16)` → `colorToRGB()` helper (named colors like "red" produced NaN) |
| 3 | MEDIUM | `giacLaplace` variable detection — `latex.includes("t")` → `/(?<![a-zA-Z\\])t(?![a-zA-Z])/` (false positive on `\tan`, `\sqrt`, etc.) |
| 4 | MEDIUM | `giacILaplace` variable detection — same isolated-char regex fix for `s` |

### Files Modified
- `src/types.ts` — added EvalMode "laplace"/"ilaplace", PlotMode "phase"/"ode", ExprType "ode_phase", PlotData color?/lineStyle?
- `src/editor/triggers.ts` — @laplace, @ilaplace, @phase, @ode trigger patterns
- `src/engine/index.ts` — color/style extraction in preparePlot, buildODESpec(), hex regex fix
- `src/engine/giac.ts` — giacLaplace(), giacILaplace() with isolated variable detection
- `src/engine/evaluator.ts` — "laplace"/"ilaplace" cases calling giac functions
- `src/engine/ode.ts` — NEW: solveODE_RK4, computeDirectionField, generateSolutionCurves
- `src/renderer/renderer2d.ts` — pd.color/lineStyle, drawODEPhase(), colorToRGB() helper
- `src/renderer/renderer3d.ts` — NAMED_COLORS map, pd.color applied to 3D materials

### Next Session Priorities
1. Tables + scatter plots + regression
2. Animation export (GIF / slider animation)
3. Mobile touch events
4. Giac lazy loading (19MB startup cost)

---

## Session: 2026-03-24 (Part 1) — High-Impact Feature Batch (4 parallel agents)

### What Was Done

#### New Features (all implemented via parallel Sonnet agents, validated, and deployed)

1. **Height-based 3D surface coloring** (`renderer3d.ts`)
   - `heightToColor(t)` — 5-stop gradient: deep blue → cyan → green → yellow → red
   - `buildExplicit3DMesh()` adds per-vertex color attribute normalized to z range
   - `buildExplicit3D()` uses `vertexColors: true` on MeshPhongMaterial
   - Flat surfaces (zMin ≈ zMax) get uniform mid-green

2. **Slider range customization** (`widgets.ts`, `styles/main.css`)
   - Editable min/max number inputs flanking each slider
   - Bounds validated (min < max), step auto-recalculated as (max-min)/200
   - Current value clamped when bounds change
   - Animation speed auto-adapts to new range

3. **Summation & product evaluation** (`evaluator.ts`)
   - `trySummationProduct()` detects `\sum_{var=lo}^{hi} body` and `\prod_{var=lo}^{hi} body`
   - Body compiled via `compileToFunction`, iterated from lo to hi
   - Capped at 100,000 iterations
   - Works with both `=` (exact) and `\approx` (approximate) triggers

4. **Piecewise functions** (`parser.ts`)
   - `tryParsePiecewise()` string-level preprocessor for `\begin{cases}...\end{cases}`
   - Splits on `\\` and `&`, builds `["Piecewise", [expr, cond], ...]` MathJSON
   - `conditionToInfix()` converts Less/Greater/And/Or/Not to JS booleans
   - `jsonToInfix()` handles Piecewise/Which heads via nested ternary

5. **Domain restrictions** (`engine/index.ts`)
   - Regex detects `\{lo OP var OP hi\}` suffix in buildPlotData()
   - Supports <, >, ≤, ≥, \le, \leq, \ge, \geq and reversed forms
   - Compiled functions wrapped to return NaN outside [lo, hi]
   - Bug fix: uses Math.min/max to normalize regardless of operator direction

### Validation
- Full code review agent verified all 4 features + regression check on existing functionality
- One bug found and fixed: domain restriction reversed operator `\{5 > x > 0\}` normalization
- Clean build, deployed to Obsidian

### Files Modified
- `src/renderer/renderer3d.ts` — heightToColor(), vertex colors in buildExplicit3DMesh/buildExplicit3D
- `src/editor/widgets.ts` — minInput/maxInput in addSliders()
- `styles/main.css` — .kcl-slider-bound styles
- `src/engine/evaluator.ts` — trySummationProduct()
- `src/engine/parser.ts` — tryParsePiecewise(), conditionToInfix(), Piecewise/Which in jsonToInfix
- `src/engine/index.ts` — domain restriction regex + wrapper in buildPlotData()

---

## Session: 2026-03-23 — 3D Quality Fixes + Feature Batch + Documentation

### What Was Done

#### Feature Batch (Request A — all completed)
1. **Giac reliability verified** — loads correctly via inline script injection
2. **Repo restructure** — manifest.json, versions.json, LICENSE, styles.css, README.md at repo root; release.yml workflow builds from repo-v2/
3. **Better CAS error messages** — context-aware errors when Giac unavailable (e.g., "@limit requires Giac WASM")
4. **Definite integral evaluation** — `\int_a^b f(x)\,dx =` parses limits and evaluates via Simpson's rule (1000 subdivisions)
5. **Better @steps output** — Giac debug output classified into named calculus rules (power rule, chain rule, etc.)
6. **PNG export** — download button added to 2D and 3D graph toolbars
7. **More CAS fallbacks** — sum/difference of cubes factoring, cos²-sin²→cos(2θ), 2sin·cos→sin(2θ) identities

#### 3D Quality Fixes (Request B — both completed)
8. **1:1:1 Z-axis by default** — added `autoScaleZ3d` setting (default: false); z range now matches x/y for proportional axes
9. **Analytical plane rendering** — `detectPlane()` identifies linear implicit surfaces; `buildPlane3DMesh()` computes exact plane-AABB intersection polygon (3-6 vertices) instead of marching cubes diamond artifact

#### Documentation Update
10. Updated README.md, CHEATSHEET.md, PROJECT_STATE.md with all new features and settings

### Files Modified
- `src/types.ts` — added `autoScaleZ3d` to KCLSettings
- `src/settings.ts` — added auto-scale Z toggle UI
- `src/engine/index.ts` — gated auto-z-range behind autoScaleZ3d setting
- `src/engine/evaluator.ts` — definite integral parsing/evaluation, better error messages, trig identities
- `src/engine/cas.ts` — sum/difference of cubes factoring
- `src/engine/giac.ts` — step classification pipeline for @steps
- `src/editor/widgets.ts` — PNG download button on graph toolbar
- `src/renderer/renderer3d.ts` — detectPlane(), buildPlane3DMesh(), plane-first routing in buildImplicit3D
- `.github/workflows/release.yml` — release workflow
- `version-bump.mjs` — syncs root-level manifest/versions

### Known Issues
- Sliders still fixed ±10 range
- No piecewise functions, tables, or regression
- giacwasm.js still loaded eagerly (19MB)

### Next Session Priorities
1. Slider range customization (per-slider min/max/step)
2. Piecewise function syntax
3. Height-based 3D surface coloring
4. Tables + scatter plots

---

## Session: 2026-03-20 — Giac WASM Integration + CAS/3D Fixes

### Status: 🟢 Build clean | 🟢 Confirmed working by user

### Completed

| Area | Work done | Files |
|------|-----------|-------|
| Giac WASM bridge | New `giac.ts` module — initialises `window.Giac`, exposes `giacCompute(cmd)` | `engine/giac.ts` |
| CAS wiring | `cas.ts` and `evaluator.ts` now try Giac first for all CAS ops; fall back to CortexJS + manual code on error | `engine/cas.ts`, `engine/evaluator.ts` |
| Electron CSP fix | `main.ts` reads `giacwasm.js` via `fs.readFileSync` and injects as inline `<script>` — file:// src URLs blocked by Electron CSP | `main.ts` |
| Settings toggle | `enableGiac` boolean added to plugin settings; when off, Giac bridge is bypassed entirely | `settings.ts` |
| New triggers | `@limit`, `@taylor`, `@partfrac`, `@expand` wired through triggers.ts → cas.ts → Giac | `editor/triggers.ts`, `engine/cas.ts` |
| 3D per-axis scaling | Surfaces now fill the cube correctly when x/y/z ranges differ; per-axis scale factors `(sx, sy, sz)` replace single uniform scale | `renderer/renderer3d.ts` |
| jsonToLatex | Custom `jsonToLatex()` added to `parser.ts`; replaces broken CortexJS `.latex` property for CAS output | `engine/parser.ts` |

### Key Technical Notes
- Giac loads synchronously at plugin startup (~19MB). No lazy-load yet — this is the primary known performance issue.
- All CAS ops follow the pattern: try `giacCompute()` → parse result → if error/empty → fall back to CortexJS path.
- `jsonToLatex()` walks MathJSON recursively. Do NOT use `.latex` on CortexJS expressions returned from CAS operations — it silently returns wrong strings for many forms.

### Next Session: Priority Tasks
1. **Test all CAS triggers** with Giac loaded — `@diff`, `@int`, `@solve`, `@factor`, `@limit`, `@taylor`, `@partfrac`, `@expand`
2. **Performance profiling** — measure cold-start cost of 19MB load; investigate deferred injection after plugin `onload()` returns
3. **Parameter sliders** — wire `views/controls.ts` free-variable sliders to graph re-render

---

## Session: 2026-03-17 (Part 10) — Black Screen Root Cause Found + Static Image Architecture

### Status: 🟢 Build clean | 🟢 Confirmed working by user

### Summary
After 5+ failed attempts to manage WebGL context lifecycles via scroll visibility detection, this session took two key steps:

1. **Switched to Static Image Architecture (Path B)** — all 3D graphs render as static `<img>` snapshots (zero persistent WebGL contexts). Click-to-interact creates exactly 1 live WebGL context at a time. This sidesteps the Chrome ~16-context limit entirely.

2. **Found the actual root cause** via diagnostic console logging — not a WebGL limit issue at all.

### Root Cause (confirmed via console logs)

CM6 calls `destroy()` on widget instances when they leave the virtual viewport, then calls **`toDOM()` again on the same instance** when they scroll back. This is CM6's documented widget re-use behavior for persistent decorations.

The `destroyed = true` flag set by `destroy()` was never reset. When `toDOM()` was called again on the same instance, the async rendering microtask hit `if (this.destroyed) return` and silently aborted. No error thrown, no error logged — just blank content.

```
// Console evidence:
[KCL 2D] preparePlot called, latex: y=x^2 mode: plot2d
[KCL 2D] preparePlot result: OK
// ← stopped here. renderer2d.create never called.
// Only explanation: if (this.destroyed) return; fired.
```

### Fixes Applied

| File | Change | Why |
|------|--------|-----|
| `widgets.ts` | `Graph2DWidget.toDOM()`: reset `this.destroyed = false`, clean up stale `this.handle` | CM6 calls toDOM() again after scrolling back — instance is re-used, must reset state |
| `widgets.ts` | `Graph3DWidget.toDOM()`: reset `this.destroyed = false`, show cached `snapshotUrl` instantly on re-entry | Same reason; snapshot already cached from first render so re-display is instant |
| `widgets.ts` | **Rewrote Graph3DWidget** to static image architecture | Eliminated all scroll/visibility lifecycle management; zero persistent WebGL contexts |
| `renderer3d.ts` | Added `renderSnapshot(spec, isDark)` export | Creates temp container, renders one frame, grabs `toDataURL()`, destroys everything (~50ms) |
| `renderer3d.ts` | Added `preserveDrawingBuffer: true` to WebGLRenderer | Required for `toDataURL()` to return rendered content |
| `main.ts` | Added `renderer3d.renderSnapshot` to plugin facade | Widgets access it via `this.plugin.renderer3d.renderSnapshot()` |
| `styles/main.css` | Added `.kcl-graph-3d-snapshot`, `.kcl-graph-3d-hint`, `.kcl-graph-3d-close` | Static image, hover hint, interactive close button |

### New Architecture: 3D Graph Lifecycle

```
toDOM() called
  ├── If snapshotUrl cached → _showSnapshot() immediately (instant scroll-back)
  └── Else → show loading → Promise.resolve().then(_renderInitialSnapshot)
                              ├── engine.preparePlot() [sync]
                              ├── renderer3d.renderSnapshot() [sync, ~50ms]
                              │   └── create temp container → create3DGraph → render 1 frame
                              │       → toDataURL() → destroy graph → remove temp container
                              └── _showSnapshot() → <img src=dataUrl>

Click on img
  ├── Close any other interactive widget (_activeInteractive3D)
  └── renderer3d.create() → live OrbitControls WebGL canvas
      Close button (×) → _exitInteractive()
          ├── canvas.toDataURL() → update snapshotUrl at current angle
          └── handle.destroy() → back to <img>
```

**Max live WebGL contexts: 1 (the interactive one). All others are static images.**

### Antipattern #14 added to repo-v2/CLAUDE.md

### Verified Working
- User confirmed: "great works how I expect"
- 3D graphs show static snapshot images with "Click to interact" hover hint
- Clicking opens interactive OrbitControls mode
- Scroll-back shows cached snapshot instantly (no re-render)
- 2D graphs and result widgets also fixed on scroll-back

---

## Session: 2026-03-17 (Part 9) — WebGL Black Screen: Definitive Fix via Global Scroll Listener

### Status: 🟢 Build clean | 🟡 Needs live test

| Fix | Root cause | File |
|-----|-----------|------|
| Black screen on scroll-back (attempt 3, definitive) | IntersectionObserver inherently fragile in CM6 — replaced with global scroll listener + getBoundingClientRect() | widgets.ts |

### Why IntersectionObserver Kept Failing
Three separate attempts with IntersectionObserver all failed:
1. `root: null` — CM6's `.cm-scroller` is always inside the browser viewport → widgets perpetually "intersecting"
2. `root: .cm-scroller` — `container.closest('.cm-scroller')` may return null in some Obsidian versions/layouts, silently falling back to `root: null` → same as #1
3. All IntersectionObserver approaches — CM6 may call `toDOM()` at different times relative to DOM insertion, making the `requestAnimationFrame`-deferred setup fragile

### Definitive Architecture: Global Scroll Manager

```
Module-level set: _g3dRegistry (all live Graph3DWidget instances)
Global listener:  document.addEventListener("scroll", rAF-throttled, {capture: true})
                  ↑ capture:true catches ALL scroll events (window, .cm-scroller, etc.)
Per-widget check: _scanVisibility() uses getBoundingClientRect()
                  ↑ always viewport-accurate regardless of scroll container
```

**Key properties:**
- `getBoundingClientRect()` returns correct viewport-relative coords even inside `.cm-scroller`
- `capture: true` intercepts scroll events from ANY scrollable ancestor
- `el.isConnected` check prevents false-positives from detached DOM elements (return zeros)
- `requestAnimationFrame` throttle: at most one scan per frame regardless of scroll velocity
- `MOUNT_MARGIN = 300px` / `UNMOUNT_MARGIN = 600px`: hysteresis prevents rapid mount/unmount thrash
- `MAX_WEBGL_CONTEXTS = 10`: hard cap pool, evicts oldest active if limit reached
- `cachedSpec`: PlotSpec stored after first preparePlot; scroll-back doesn't re-parse

### Files Changed
- `widgets.ts`: Complete rewrite of Graph3DWidget; Graph2DWidget unchanged (SVG, no context limit)

### Next Tests
1. Create 5+ `@plot3d` blocks → scroll down through all → scroll back up → none should be black
2. Rapid scroll: scroll through quickly multiple times → no accumulation
3. `$z=x^2+y^2 @plot3d$`, `$x^2+y^2+z^2=9 @plot3d$`, `$\frac{\cos(t),\sin(t),t}{3} @plot3d$`

---

## Session: 2026-03-17 (Part 8) — WebGL Black Screen: Correct IntersectionObserver Root

### Status: 🟢 Build clean | 🟡 Needs live test

| Fix | Root cause | File |
|-----|-----------|------|
| Black screen on scroll-back (attempt 2) | IntersectionObserver `root:null` observes browser viewport — CM6's `.cm-scroller` is always inside viewport so nothing ever unmounts | widgets.ts |

### Root Cause (Part 8 — refined from Part 7)
Part 7 added IntersectionObserver but used `root: null` (browser viewport). This does NOT work inside CodeMirror 6:
- All `kcl-graph-3d` containers live inside `.cm-scroller`
- `.cm-scroller` itself never moves — it stays inside the Obsidian pane which is always in the browser viewport
- So every widget container is ALWAYS "intersecting the browser viewport"
- `isIntersecting` stays `true` forever → `unmount()` never called → contexts accumulate → 16-context limit → black

### Fix
- `setupObserver()` defers with `requestAnimationFrame` (container not in DOM when `toDOM()` returns)
- Finds `container.closest('.cm-scroller')` — the actual CM6 scroll container
- Falls back to `.workspace-leaf-content` if scroller not found yet (retries with rAF)
- Passes the scroller as `root` to IntersectionObserver — now correctly tracks scroll visibility within CM6
- `mount()` made fully synchronous (preparePlot + renderer3d.create are both sync) — no async race conditions

### Also fixed
- Removed async/await from `mount()` — eliminates the window where `destroy()` could race the mount
- `this.cachedSpec` still caches PlotSpec after first preparePlot
- Canvas DOM cleanup in `unmount()` unchanged (still removes canvas to prevent black rectangle)

---

## Session: 2026-03-17 (Part 7) — WebGL Context Limit Black Screen Fix

### Status: 🟢 Build clean | 🟡 Needs live test

| Fix | Root cause | File |
|-----|-----------|------|
| Black screen on scroll-back | Chrome ~16 WebGL context limit; CM6 never calls destroy() on scroll-off | widgets.ts + styles/main.css |

### Root Cause Analysis
- Chrome hard-limits ~16 simultaneous WebGL contexts per page (process-level limit)
- CM6's `WidgetType.destroy()` is only called when a widget is **replaced** (eq() → false), NOT when it scrolls off-screen
- Every `Graph3DWidget.toDOM()` was creating a `WebGLRenderer` (= new context) that lived forever
- Scrolling down: context 17+ → Chrome kills oldest contexts → top graphs go black
- Scrolling back up: dead contexts = black canvases everywhere

### Fix: IntersectionObserver-Gated WebGL Lifecycle
- `Graph3DWidget` now uses `IntersectionObserver` with `rootMargin: "150px 0px"`
- **mount()**: fires when container enters viewport → creates WebGLRenderer, starts render loop
- **unmount()**: fires when container leaves viewport → calls `handle.destroy()`, **removes canvas DOM node**
  - Removing the canvas is critical: a disposed WebGL canvas stays black if left in DOM
- **cachedSpec**: `PlotSpec` stored after first `preparePlot` — scroll-back is instant (no re-parsing)
- **mounting flag**: prevents concurrent mount() calls during rapid scroll
- **CSS `min-height: 400px`** on `.kcl-graph-3d`: container keeps height when canvas removed → no scroll jump
- `observer.disconnect()` called in `destroy()` so CM6 widget cleanup is complete

### Antipattern #13 added to CLAUDE.md

### Next Tests
1. Create 5+ `@plot3d` blocks in one note → scroll through all → scroll back → none should be black
2. `$z=x^2+y^2 @plot3d$` → paraboloid appears as you scroll into it, disappears (gracefully) as you scroll away
3. Rapid scroll up/down should not accumulate contexts (check DevTools → GPU tab)
4. `$\frac{\cos(t),\sin(t),t}{3} @plot3d$` → parametric helix

---

## Session: 2026-03-17 (Part 6) — Parametric 3D Fix, WebGL Leak, Desmos 3D UX

### Status: 🟢 Build clean | 🟡 Needs live test

| Fix | Root cause | File |
|-----|-----------|------|
| `extractTupleComponents` Divide/Multiply cases | `\frac{tuple}{n}` → `["Divide",["Sequence",...],n]` unhandled | parser.ts |
| WebGL context leak | `destroy()` raced async `toDOM()` chain → orphaned contexts | widgets.ts |
| Desmos-like 3D UX | No tick numbers, single grid plane, wrong camera angle | renderer3d.ts |

### Parametric 3D Fix
- Added two new cases to `extractTupleComponents` in `parser.ts`:
  - `["Divide", ["Sequence",...], n]` → each component divided by scalar (handles `\frac{\cos(t),\sin(t),t}{3}`)
  - `["Multiply", ["Sequence",...], scalar]` → each component multiplied by scalar
- These run after the existing `Sequence`/`List`/`Delimiter` cases

### WebGL Context Leak Fix
- Root cause: CM6 calls `destroy()` on old widget while `toDOM()` async chain is still pending
  - `destroy()` sees `this.handle === null` → skips cleanup
  - Async chain resolves later → creates WebGL context with no owner → context leaks
  - Browser hits ~16-context limit → "Too many active WebGL contexts"
- Fix: Added `private destroyed = false` flag to both `Graph2DWidget` and `Graph3DWidget`
  - `destroy()` sets `this.destroyed = true` FIRST, then cleans handle
  - Async chain checks `if (this.destroyed) return` after each `await`
  - If destroyed between `preparePlot` and `renderer.create`: immediately calls `handle.destroy()`

### Desmos 3D UX Redesign
- Added `niceStep()` helper: produces round tick spacings (1, 2, 5, 10, 0.5...)
- Added `addAxisTicks()`: places numeric sprites (±2, ±4, etc.) along each axis
  - Small perpendicular offset so numbers don't overlap the axis line
  - Uses same canvas-texture sprite system as axis name labels
- Three grid planes (Desmos 3D-style):
  - XZ plane (math XY floor) — was already there
  - XY plane (math XZ front wall) — `gridXY.rotation.x = π/2`
  - YZ plane (math YZ side wall) — `gridYZ.rotation.z = π/2`
  - Color: dark `0x444466` / `0x2a2a44`, light `0xbbbbdd` / `0xddddee`
- Camera: FOV 40° (was 50°), position `(0.85, 0.75, 0.85) × camDist` for Desmos-style angle
- Fill light added (soft backfill, intensity 0.25)
- Surface materials: lower shininess (35/30), specular highlight added
- Background: dark `0x1a1a2e` (was `0x1e1e1e`), light `0xfafafa`
- Color constants: `COLOR_X="#ff4d4d"`, `COLOR_Y="#44cc44"`, `COLOR_Z="#4488ff"`

### Next Tests
1. `$\frac{\cos(t),\sin(t),t}{3} @plot3d$` → should render helix
2. `$(\cos(t), \sin(t), t/3) @plot3d$` → same helix, different syntax
3. `$z=x^2+y^2 @plot3d$` → paraboloid with tick numbers on axes
4. `$x^2+y^2+z^2=9 @plot3d$` → sphere with 3-plane grid
5. Check WebGL context count doesn't grow on repeated edit/undo

---

## Session: 2026-03-16 (Part 5) — Vector/@geom, Parametric 3D, Free Vars, @convert

### Status: 🟢 Build clean | 🟡 Needs live test

| Fix | Root cause | File |
|-----|-----------|------|
| NaN sentinel → `(0/0)` | `"NaN"` not parseable by function-plot | parser.ts |
| `["Sequence"/"List"]` in jsonToInfix | CortexJS tuple serialization unhandled | parser.ts |
| Parametric 3D: extract 3 component fns | `buildPlotData` returned 1 fn, renderer needs 3 | parser.ts + index.ts |
| Free vars (c,r) in compiled fn | `new Function` left c,r unbound → NaN | parser.ts compileToFunction |
| `@convert` mode wired | ResultWidget called evaluate with bad mode | widgets.ts |
| `@geom` → Graph3DWidget | Was Graph2DWidget, vector needed 3D renderer | decorations.ts |
| `buildGeomSpec` for `<a,b,c>` vectors | No geometric parser existed | index.ts |

### Free Var Behavior (torus)
- `$(c-\sqrt{x^2+y^2})^2+z^2=r^2@plot3d$` — c=r=1 by default (self-intersecting torus)
- For standard torus: first write `$c=3$` (no trigger) then use `@persist` on the value
  OR use numeric values directly: `$(3-\sqrt{x^2+y^2})^2+z^2=1@plot3d$`

---

## Session: 2026-03-16 (Part 4) — CortexJS Head Normalization + Inspector Wiring

### Status at END of Session:
- **Build**: 🟢 CLEAN. 1.43MB bundle.
- **Runtime**: 🟡 FIXES APPLIED — Reload Obsidian and test.

### Root Cause of ALL Remaining Plot Failures

**CortexJS auto-normalizes `x^2` → `["Square", x]` at parse time.**

`jsonToInfix` had no handler for `"Square"` (or `"Cube"`, `"Root"`). It fell through to:
```ts
return head.toLowerCase() + "(" + args.map(jsonToInfix).join(", ") + ")";
// → "square(x)" — invalid in function-plot AND in new Function body
```

- function-plot: throws `"symbol 'square' is undefined"`
- `new Function("x","y","z","return (square(x)+...);")` → SyntaxError → `() => NaN` → blank surface

The plane `2(x-2)+1(y-1)-2(z-5)=0` worked ONLY because it has NO squared terms.

### Bugs Fixed

#### Bug 7: `["Square", x]` → `"square(x)"` in `jsonToInfix`
- **File**: `src/engine/parser.ts`
- **Fix**: Added explicit handlers before UNARY_FN_MAP lookup:
  `"Square"` → `(x ^ 2)`, `"Cube"` → `(x ^ 3)`, `"Root"` → `(x ^ (1/n))`
  Unknown PascalCase heads → `"NaN"` sentinel (graceful degradation, not syntax crash)
- Expanded UNARY_FN_MAP: `Floor`, `Ceiling`, `Round`, `Sign`, `Log2`, inverse hyp trig
- Added Math.* replacements for new functions in `compileToFunction`

#### Bug 8: `buildPlotData` only accepted `"Equal"` as equation head
- **File**: `src/engine/index.ts`
- **Fix**: Accept `"Equal" | "Assign" | "Equation"` as valid equation heads.

#### Bug 9: Graph Inspector sidebar always empty
- **File**: `src/editor/widgets.ts`
- **Fix**: Both Graph2DWidget and Graph3DWidget now call `plugin.publishInspectorState?.()` after a successful `preparePlot`.

### Antipatterns Added to CLAUDE.md: #10, #11, #12

### Next Tests
1. `$x^2+y^2+z^2=9 @plot3d$` → sphere (implicit_3d marching cubes)
2. `$z=x^2+y^2 @plot3d$` → paraboloid (explicit_3d grid)
3. `$(x^2+y^2-1)^2-x^2y^2=0 @plot2d$` → no more "square is undefined"
4. Graph Inspector: render a graph → check sidebar populates

---

## Session: 2026-03-16 (Part 3) — 3D Rendering Fixes

### Status at END of Session:
- **Build**: 🟢 CLEAN. 1.4MB bundle.
- **Runtime**: 🟡 FIXES APPLIED — Needs Obsidian reload + live test.

### Bugs Fixed

#### Bug 4: `z=x^2+y^2 @plot3d` classified as `implicit_3d` → marching cubes → "no isosurface found"
- **File**: `src/engine/parser.ts` — `classifyExpression`
- **Root cause**: `classifyExpression` relied on `isSimpleLHS(lhsSyms, "z")` which requires
  `lhsSyms` to contain the string `"z"`. But `ce.parse("z").json` may not serialize as the
  plain string `"z"` (CortexJS version-dependent) — `collectSymbols` skips it, `lhsSyms = {}`,
  `isSimpleLHS` returns false, falls through to `return "implicit_3d"`.
- **Fix**: Added string-level fast path BEFORE CortexJS analysis:
  ```ts
  if (/^z$/.test(lhsTrimmed) || /^z$/.test(rhsTrimmed)) return "explicit_3d";
  if (/^y$/.test(lhsTrimmed) || /^y$/.test(rhsTrimmed)) return "explicit_2d";
  if (/^x$/.test(lhsTrimmed)) return "explicit_2d";
  ```

#### Bug 5: `buildExplicit3DMesh` receives all-NaN z values → `NaN bounding sphere` error
- **File**: `src/engine/parser.ts` — `compileToFunction`
- **Root cause**: CortexJS `compiled.evaluate({ [vars[0]]: args[0] })` only passes the first
  variable (`x`). For `f(x, y)`, `y` is never in scope → all evaluations return NaN.
- **Fix**: Removed CortexJS compile path entirely. Always use `new Function(...vars, body)`,
  which correctly binds all variables as named parameters.

#### Bug 6: 3D surface clips out of view for `z = x^2+y^2` (z range defaulted to [-5,5])
- **File**: `src/engine/index.ts` — `computeRanges`
- **Root cause**: z range hardcoded to [-5, 5]. For `z=x^2+y^2` with x,y ∈ [-5,5],
  actual z goes 0→50. Camera distance ~12 units — surface was behind near clip or way off-screen.
- **Fix**: For `explicit_3d`, sample 20×20 grid on xy domain, measure actual z extent,
  set z range to `[zMin - padding, zMax + padding]`.

#### Feature: 3D axis labels (X, Y, Z text on axes)
- **File**: `src/renderer/renderer3d.ts`
- Added `addAxisLabel()` using `CanvasTexture + SpriteMaterial + Sprite` (no external fonts).
- Labels tracked in `permanentDisposables` — survive spec updates, cleaned on `destroy()`.
- Coordinate mapping: Three.js Y-up ↔ math Z-up (Y/Z axes are swapped in all geometry).

### Antipatterns Added to `repo-v2/CLAUDE.md`
- #8: CortexJS `compiled.evaluate()` is single-variable — use Function constructor for multi-var
- #9: String-level fast path required before CortexJS JSON analysis in classifyExpression

### "Rendering Everywhere" — by design
- Decorations are always visible across the full document (StateField scans all lines on load).
- This is intentional: Desmos-style always-on inline results.
- If user wants proximity/hover-based rendering, that's a future UX feature.

### Next Steps
1. Reload Obsidian → test `$z=x^2+y^2 @plot3d$`
2. Verify labeled axes (X, Y, Z text on tips of colored axes)
3. Test `$z=sin(x)*cos(y) @plot3d$` — more complex surface
4. If still blank: check esbuild bundled Three.js version (SpriteMaterial/CanvasTexture import path)
5. If `addons/controls/OrbitControls.js` throws 404: check esbuild config for three addons resolution

---

## Session: 2026-03-16 (Part 2) — Runtime Bug Fixes

### Status at END of Session:
- **Build**: 🟢 CLEAN. Zero errors after runtime fixes.
- **Bundle**: 1.4MB synced to `.obsidian/plugins/kings-calclatex/`
- **Runtime**: 🟡 FIXES APPLIED — Needs fresh Obsidian reload + live test.

### Bugs Fixed This Session

#### Bug 1: `RangeError: Block decorations may not be specified via plugins`
- **File**: `src/editor/decorations.ts`
- **Root cause**: Used `ViewPlugin` with `block: true` widget decorations. CM6/Obsidian
  prohibits this entirely — block decorations must come from `StateField`.
- **Fix**: Rewrote `decorations.ts` as a `StateField.define()` with
  `provide(f) { return EditorView.decorations.from(f); }`.
- **Impact**: This was causing ALL graph widgets (`@plot2d`, `@plot3d`) to silently fail,
  and the sidebar Graph Inspector to show nothing (no PlotSpec ever dispatched).

#### Bug 2: Tab inserts result BEFORE `=`, causing infinite re-trigger loop
- **File**: `src/editor/keymap.ts`
- **Root cause**: `insertPos = trigger.from` — inserts before the trigger character.
  Content `$2+3=$` becomes `$2+3 5=$` — `=` still at end → trigger fires again.
- **Fix**: Changed to `insertPos = trigger.to` — inserts after the trigger character.
  Content becomes `$2+3= 5$` — no `=` at end → no re-trigger.

#### Bug 3: First Tab press inside `$...$` exits the block instead of triggering insert
- **File**: `src/editor/keymap.ts`
- **Root cause**: Cursor detection used `Math.abs(cursor - mathRange.to) <= 2`.
  `mathRange.to` is AFTER closing `$`, so cursor just inside the block fails the check.
- **Fix**: Changed to `cursor >= mathRange.from && cursor <= mathRange.to` — cursor
  anywhere inside the math block activates Tab insertion.

### Antipatterns Added to `repo-v2/CLAUDE.md`
- #5: ViewPlugin cannot host `block: true` decorations — use `StateField`
- #6: Insert at `trigger.to` not `trigger.from` (Tab insertion position)
- #7: Detect cursor by range containment, not proximity to `mathRange.to`

### Next Steps for Next Session
1. **Reload Obsidian** (`Ctrl+P → Reload app without saving`)
2. **Test**: `$2+3=$` → Tab → should insert ` 5` after `=`
3. **Test**: `$y=\sin(x) @plot2d$` → should render function-plot graph below line
4. **Test**: `$z=x^2+y^2 @plot3d$` → should render Three.js surface below line
5. **Test Graph Inspector**: Open sidebar, check if it receives/displays PlotSpec
6. **If @plot2d still blank**: Check `renderer2d.ts` — function-plot D3 selector issues
7. **If @plot3d still blank**: Check `renderer3d.ts` — Three.js `OrbitControls` import path

---

## Session: 2026-03-16 — Path C Full Rewrite

### Status at END of Session:
- **Build**: 🟢 CLEAN. esbuild compiles all 20 TypeScript source files with zero errors.
- **Bundle**: 1.4MB (CortexJS + math.js + function-plot + Three.js, all client-side)
- **Runtime**: 🟡 UNTESTED. Plugin synced to `.obsidian/plugins/kings-calclatex/` but not yet loaded in Obsidian.

### What Happened
1. **Full analysis of v1 codebase** — identified root cause of all three UI/UX bugs (full DecorationSet rebuild on every CM6 transaction)
2. **Decision: Path C** — complete browser-native rewrite eliminating the Python backend entirely
3. **Research** — analyzed Desmos internals, GeoGebra, and all viable JS/TS math libraries
4. **Architecture design** — CortexJS (CAS) + function-plot (2D) + Three.js (3D) + CM6 ViewPlugin (editor)
5. **Project scaffold** — directory structure, package.json, tsconfig, esbuild config, build scripts
6. **Agentic framework** — CLAUDE.md files at root, dev, and repo levels with antipatterns from v1
7. **Full implementation via 4 parallel agents**:
   - Engine: parser, evaluator, CAS, units, persistence (5 files)
   - Editor: triggers, widgets, decorations, keymap (5 files)
   - Renderer: 2D function-plot, 3D Three.js, auto-range (4 files)
   - Main: plugin entry, settings, Graph Inspector, parameter controls (4 files)
8. **Integration fixes** — wired renderer facades into plugin, added getStatus(), fixed constructor
9. **Build + sync** — clean build, synced to Obsidian plugin directory

### Completed (20 source files)
```
repo-v2/src/
├── main.ts              ✅ Plugin entry, renderer facades, commands
├── settings.ts          ✅ Settings tab (range, precision, theme)
├── types.ts             ✅ All shared types + Result<T> helpers
├── engine/
│   ├── index.ts         ✅ ExpressionEngine facade + preparePlot pipeline
│   ├── parser.ts        ✅ CortexJS LaTeX → MathJSON, toFnString, compile
│   ├── evaluator.ts     ✅ Symbolic/numeric evaluation
│   ├── cas.ts           ✅ Differentiate, integrate, solve
│   └── units.ts         ✅ math.js unit conversion
├── renderer/
│   ├── index.ts         ✅ Re-exports
│   ├── renderer2d.ts    ✅ function-plot with interval arithmetic
│   ├── renderer3d.ts    ✅ Three.js: surfaces, marching cubes, vectors
│   └── auto-range.ts    ✅ Smart viewport calculation
├── editor/
│   ├── index.ts         ✅ Re-exports
│   ├── triggers.ts      ✅ Trigger detection (=, \approx, @plot2d, etc.)
│   ├── widgets.ts       ✅ Thin widgets (Result, Graph2D, Graph3D)
│   ├── decorations.ts   ✅ ViewPlugin with v1-fix (no rebuild on selection)
│   └── keymap.ts        ✅ Tab-to-insert
└── views/
    ├── inspector.ts     ✅ Graph Inspector sidebar
    └── controls.ts      ✅ Parameter sliders
```

### Critical Fix: v1's #1 Bug
The decorations.ts ViewPlugin now:
- Returns immediately if `!update.docChanged` (selection-only changes do NOTHING)
- Maps existing decorations through `update.changes` (position adjustment)
- Only rescans changed lines (not full document rebuild)
- Widget `eq()` prevents DOM recreation for unchanged expressions

### Immediate Backlog for Next Session:
1. **Runtime test in Obsidian** — reload app, open a note, type `$2+3=$` and check if evaluation appears
2. **Debug any runtime errors** — CortexJS initialization, function-plot rendering, Three.js canvas
3. **Test showcase equations** from `development/06-testing/showcase-equations.md`
4. **Fix Three.js OrbitControls import path** if it fails at runtime
5. **Fix function-plot dark theme** if D3 SVG structure doesn't match expected selectors

### Architecture Notes for Next Agent:
- The plugin is typed as `any` in widgets to avoid circular imports. If you need the real type, import `KingsCalcLatexPlugin` from "../main".
- `ExpressionEngine.preparePlot()` is the core graph pipeline: parse → classify → compile → auto-range → PlotSpec
- Renderers return `GraphHandle` with update/destroy methods. Widgets store these and call `destroy()` in their cleanup.
- The ViewPlugin pattern means decorations persist across cursor movements. Only doc changes trigger decoration updates.
