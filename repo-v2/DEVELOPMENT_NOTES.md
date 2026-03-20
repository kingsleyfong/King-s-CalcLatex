# King's CalcLatex v2 — Development Notes & Learnings

> **For LLM agents and future developers:** This file captures every non-obvious bug, architectural decision, and CortexJS quirk discovered during development. Read this before touching anything.

---

## CortexJS Compute Engine — Known Quirks

### 1. `numericValue` returns a rational pair array, not a JS number

```ts
ce.parse("-\\frac{8}{577}").N().numericValue
// → [-8, 577]   ← array, NOT a number!
```

CortexJS represents rational numbers as `[numerator, denominator]` arrays. The old `evaluateApproximate` code checked for `typeof nv === "number"` and fell through, leaving the string form `(-8/577)` displayed instead of `-0.01386...`.

**Fix:** `forceNumber()` in `evaluator.ts` — handles JS number, rational pair array, Decimal `.toNumber()`, Decimal `.toString()` parse, fraction string parse `"(-8/577)"`, and compiled-fn fallback.

### 2. `\theta` parses as symbol `"theta"`, not `"t"`

CortexJS parses `\theta` → symbol name `"theta"`, `\phi` → `"phi"`, etc. Code that checks `syms.has("t")` for polar/parametric curves silently misses `\theta` expressions.

**Affected locations:**
- `parser.ts` `classifyExpression()` — `hasT` check must include `|| allSyms.has("theta")`
- `engine/index.ts` polar branch — detect `usesTheta` in fnStr before choosing vars

### 3. `x^2` parses as `["Square", x]`, not `["Power", x, 2]`

CortexJS auto-normalizes at parse time:
- `x^2` → `["Square", x]`
- `x^3` → `["Cube", x]`
- `\sqrt[n]{x}` → `["Root", x, n]`

`jsonToInfix()` must handle these BEFORE the `UNARY_FN_MAP` lookup, or they fall through to `"square(x)"` which breaks both function-plot and `new Function`.

### 4. CortexJS `.compile().evaluate()` is broken for multi-variable functions

`expr.compile().evaluate({ x: val })` only accepts one variable in the scope. For `f(x,y)`, `y` is always undefined → all z values are NaN → blank 3D surface.

**Fix:** Always use `new Function(...vars, \`return (${jsStr});\`)` — bind all variables by position.

### 5. `["Equal", lhs, rhs]` vs `["Assign", lhs, rhs]` vs `["Equation", ...]`

CortexJS may serialize `y = x^2` as any of these three heads depending on context and version. Every equation handler must accept all three:
```ts
const isEquation = Array.isArray(json) &&
  (json[0] === "Equal" || json[0] === "Assign" || json[0] === "Equation") &&
  json.length === 3;
```

### 6. Tuple/sequence heads for parametric curves

`(\cos(t), \sin(t), t)` may parse as:
- `["Sequence", a, b, c]`
- `["List", a, b, c]`
- `["Delimiter", ["Sequence", a, b, c], "(", ")"]`
- `["Divide", ["Sequence", a, b, c], scalar]` for `\frac{a,b,c}{n}`
- `["Multiply", ["Sequence", a, b, c], 1/n]` (rarer)

`extractTupleComponents()` in `parser.ts` handles all these cases.

### 7. String-level LHS detection for `classifyExpression`

`ce.parse("z").json` may not serialize as the plain string `"z"`. CortexJS might return an array form, causing `collectSymbols` to miss it. Always do string-level checks first:

```ts
if (/^z$/.test(lhsTrimmed) || /^z$/.test(rhsTrimmed)) return "explicit_3d";
if (/^y$/.test(lhsTrimmed) || /^y$/.test(rhsTrimmed)) return "explicit_2d";
```

---

## Three.js — Known Quirks

### Y-up Convention (math ≠ Three.js)

Three.js uses Y-up. Math (x, y, z) → Three.js (x, z, y). Every `position.set()` call must swap the last two arguments:

```ts
sphere.position.set(mathX, mathZ, mathY);  // math Y becomes Three.js Z
```

### Origin-Mode Scaling

The 3D bounding cube is `[-1, 1]³`. The `worldGroup` scale maps math coordinates into it. For asymmetric ranges (e.g., `z ∈ [0, 50]`), the wrong formula causes overflow:

```ts
// ❌ Wrong for asymmetric ranges — z=50 maps to 50*(2/50)=2.0, outside [-1,1]
const s = 2 / maxSpan;

// ✅ Correct — find the furthest extent from origin
const maxHalf = Math.max(Math.abs(xLo), Math.abs(xHi), Math.abs(yLo), Math.abs(yHi), ...);
const s = maxHalf > 0 ? 1 / maxHalf : 1;
```

### Z-clamping for Explicit 3D Meshes

`buildExplicit3DMesh` must clamp z values to `ranges.z` to prevent geometry from extending outside the bounding cube. Without this, `z = x^2 + y^2` on `[-5,5]` produces z values up to 50 which escape the unit cube.

```ts
zValues[i][j] = isFinite(z) ? Math.max(zLo, Math.min(zHi, z)) : NaN;
```

### WebGL Context Limit (Chrome ~16 contexts)

Chrome kills WebGL contexts beyond ~16. CM6's `destroy()` is only called when decorations change, NOT when widgets scroll off-screen. This means every 3D graph in a long document holds a live context forever.

**Solution:** Static image architecture
1. `renderSnapshot()` — create temp container, render 1 frame, capture `canvas.toDataURL()`, destroy everything (~50ms per snapshot)
2. Display as `<img>` — zero persistent contexts
3. Click → enter interactive mode (max 1 live context at a time)

---

## CodeMirror 6 — Known Antipatterns

### Block Decorations Must Use StateField

```ts
// ❌ Throws RangeError in Obsidian at runtime
const plugin = ViewPlugin.fromClass(class {
  get decorations() { return RangeSetBuilder.finish(); } // block:true widgets
});

// ✅ Required pattern
StateField.define({
  provide: f => EditorView.decorations.from(f)
});
```

### CM6 Reuses Widget Instances on Scroll-Back

CM6 calls `destroy()` then `toDOM()` on the **same object instance** when a widget scrolls out and back in. If `toDOM()` doesn't reset `this.destroyed = false`, async work guarded by `if (this.destroyed) return` silently aborts → blank widget.

```ts
toDOM(): HTMLElement {
  this.destroyed = false; // MUST reset — CM6 reuses same instance
  // ...
}
```

### Tab Insertion Position

Insert at `trigger.to` (AFTER the trigger character), not `trigger.from`. Inserting before `=` leaves the `=` in place → re-triggers → infinite loop.

### Cursor Containment for Tab Activation

Check if cursor is anywhere inside `mathRange.from...mathRange.to`, not just near `trigger.to`. Cursor just before the closing `$` is inside the block but far from `trigger.to`.

---

## Vector Field (`@vecfield`) — Mode String Routing

`@vecfield 0.5` produces mode string `"vecfield:0.5"` via `captureArg: true`. This breaks exact string matching everywhere:

```ts
// ❌ Breaks when suffix present
if (trigger.mode === "vecfield") { ... }

// ✅ Always split
const baseMode = trigger.mode.split(":")[0]; // "vecfield"
const scaleStr = trigger.mode.includes(":") ? trigger.mode.split(":")[1] : undefined;
```

`preparePlot(latex, mode)` takes `mode: string`, not `PlotMode` — necessary because modes like `"vecfield:0.5"` aren't in the `PlotMode` union.

### 2D vs 3D Routing at Trigger Time

Widget selection happens before the engine runs, so we can't inspect the parsed expression. Use LaTeX content heuristics:

```ts
case "vecfield": {
  const parts = trigger.latex.split(";").filter(s => s.trim());
  const hasZ = /(?:^|[^a-zA-Z])z(?:$|[^a-zA-Z])/.test(trigger.latex);
  return (parts.length >= 3 || hasZ)
    ? new Graph3DWidget(plugin, trigger)
    : new Graph2DWidget(plugin, trigger);
}
```

---

## Expression Classification — Detection Order

`classifyExpression()` in `parser.ts` must check in this exact order:

1. **Vector** (`<a,b,c>` regex) — BEFORE inequality: angle brackets contain `<` and `>` which falsely trigger `detectInequality`
2. **Point** (tuple + no coord vars) — BEFORE inequality and before bare-expression fallback
3. **Inequality** — BEFORE equality check (since `>=` contains `=`)
4. **Polar** (`r = f(theta)`)
5. **Equation-based** (string-level LHS fast path, then symbol analysis)
6. **Bare expression fallback** (analyze free variables)

---

## `\approx` Numeric Evaluation — `forceNumber()` Strategy

CortexJS `.N()` may return: JS number, rational pair array, Decimal object, or unevaluated symbolic expression. The `forceNumber()` function tries in order:

1. `numericValue` as JS number
2. `numericValue` as `[num, den]` rational pair array → `num / den`
3. `numericValue` as Decimal-like object with `.toNumber()` or `.toString()`
4. Parse `String(expr)` — strips parens, handles `"a/b"` and `"-a/b"` fraction strings
5. Compile to zero-arg JS function via `compileToFunction(expr, [])` and call it

If all fail, show symbolic form with a warning diagnostic.

---

## Build & Deploy

```bash
cd repo-v2
npm run build
# Output: main.js in repo-v2/

# Deploy to local Obsidian (Windows):
cp main.js "C:/Users/<user>/Documents/Obsidian Vault/.obsidian/plugins/kings-calclatex/main.js"
cp styles/main.css "C:/Users/<user>/Documents/Obsidian Vault/.obsidian/plugins/kings-calclatex/styles.css"
```

The `esbuild.config.mjs` bundles everything into a single `main.js`. TypeScript errors abort the build. Use `npm run dev` for watch mode during development.

---

## Test Checklist (Before Any Commit)

```
# Evaluation
$2+3=$                              → 5
$\frac{1}{3} \approx$               → 0.333333333333
$-\frac{8}{1+576} \approx$          → -0.013864818024  ← rational pair bug
$x^2 + 2x + 1 \equiv$              → (x+1)^2

# CAS
$x^3 + 2x @diff$                   → 3x^2 + 2
$3x^2 + 2 @int$                    → x^3 + 2x
$x^2 y + y^3 @px$                  → 2xy
$x^2 + y^2 @grad$                  → ∇f = (2x, 2y)
$z = x^2 + y^2 @normal$            → n = (2x, 2y, -1)
$x^2 - 4 = 0 @solve$              → x = ±2
$x^2 + 3x + 2 @factor$             → (x+1)(x+2)

# 2D
$y = \sin(x) @plot2d$              → smooth sine wave
$r = 1 + \cos(\theta) @plot2d$     → cardioid (polar)
$(5,5) @plot2d$                    → filled dot
$y > \sin(x) @plot2d$              → inequality shading

# 3D
$z = x^2 + y^2 @plot3d$           → paraboloid (1:1:1 scale)
$x^2 + y^2 + z^2 = 9 @plot3d$    → sphere
$<1,2,3> @plot3d$                  → vector arrow
$(1,2,3) @plot3d$                  → sphere point
$(\cos(t), \sin(t), t/3) @plot3d$  → helix

# Calc 3
$x^2 + y^2 @contour$              → concentric contour circles
$-y; x @vecfield$                  → rotation field (2D)
$-y; x; z @vecfield$               → 3D field (routed to 3D widget)
$x^2 + y^2 @gradient$             → contour + gradient arrows
$x^2 + y^2; (1,1) @tangent$       → surface + tangent plane
$y = x^2; y = 2x+1 @region$       → shaded region between curves

# Regression
$\langle 1,2,3 \rangle @geom$      → vector in @geom mode still works
$y = \sin(x); y = \cos(x) @plot2d$ → multi-eq overlay still works
```

---

## Planned Features (Not Yet Implemented)

| Feature | Notes |
|---------|-------|
| Parameter sliders | Free vars (a, b, c) detected by `detectFreeVars()`, sliders in `views/controls.ts` not yet wired to re-render |
| Giac WASM | Lazy-loaded advanced CAS — complex integrals, PDE solving, symbolic matrices |
| PNG/SVG export | `canvas.toDataURL()` for 2D, `renderer.domElement.toDataURL()` for 3D |
| Touch / mobile | 2D pan/zoom needs `touchstart`/`touchmove` handlers |
| Complex numbers | CortexJS supports `ImaginaryUnit`; needs renderer support |
| Polar 3D | `r = f(theta, z)` cylindrical surfaces |
| Implicit 2D shading | Region inside/outside `f(x,y) = 0` |
