# CLAUDE.md — King's CalcLatex v2 Codebase

> **READ THIS FILE AT THE START OF EVERY SESSION. NO EXCEPTIONS.**

## What This Is

King's CalcLatex v2 is a **100% browser-native** Obsidian plugin for inline math evaluation and high-fidelity 2D/3D graphing. There is NO backend server. All computation happens in-browser.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Obsidian Plugin (TypeScript)                       │
│  ├── Editor Module (src/editor/)                    │
│  │   ├── Trigger detection (LaTeX → TriggerMatch)   │
│  │   ├── CM6 StateField decorations (NOT ViewPlugin)│
│  │   ├── Widget lifecycle (persistent DOM elements)  │
│  │   └── Tab keymap for result insertion             │
│  ├── Engine Module (src/engine/)                    │
│  │   ├── Parser (CortexJS: LaTeX → MathJSON)        │
│  │   ├── Evaluator (CortexJS + math.js: symbolic)   │
│  │   ├── CAS (simplify, solve, differentiate)       │
│  │   └── Units (math.js unit conversion)            │
│  ├── Renderer Module (src/renderer/)                │
│  │   ├── 2D (function-plot: interval arithmetic)    │
│  │   ├── 3D (Three.js: WebGL + custom shaders)     │
│  │   └── Auto-ranging (smart viewport from expr)    │
│  └── Views Module (src/views/)                      │
│      ├── Graph Inspector sidebar                    │
│      └── Parameter controls (sliders, ranges)       │
└─────────────────────────────────────────────────────┘
```

## Module Responsibilities

| Module | Owns | Does NOT Own |
|--------|------|--------------|
| `engine/` | LaTeX parsing, symbolic computation, numeric evaluation, unit conversion | Rendering, DOM, CM6 |
| `renderer/` | Graph rendering (2D Canvas/SVG, 3D WebGL), auto-ranging, visual theming | Expression parsing, CAS |
| `editor/` | CM6 integration, trigger detection, widget lifecycle, decorations, keymaps | Math computation, rendering logic |
| `views/` | Inspector sidebar, parameter UI, controls | Core computation, inline rendering |
| `main.ts` | Plugin lifecycle, settings, command registration, module wiring | Everything else |

## CRITICAL: CM6 Antipatterns (v1 Failures + Runtime Bugs — DO NOT REPEAT)

### 1. DO NOT rebuild DecorationSet on every transaction

v1 rebuilt all decorations on every click/keystroke, destroying all widgets (including iframe graphs). This caused:
- 3D graphs reloading on every cursor movement
- Spurious re-renders on click near $$
- All async evaluations re-firing constantly

```ts
// ❌ FORBIDDEN — This was the #1 v1 bug
update(decorations, tr) {
  const builder = new RangeSetBuilder<Decoration>();
  for (let i = 1; i <= doc.lines; i++) { ... } // full scan
  return builder.finish(); // destroys all existing widgets
}

// ✅ REQUIRED PATTERN — Map existing, rebuild only changed regions
update(update) {
  if (update.docChanged) {
    this.decorations = this.decorations.map(update.changes);
    this.rebuildChangedLines(update);
  }
  // Selection changes NEVER trigger decoration rebuild
}
```

### 2. DO NOT use iframes for graph rendering

v1 rendered Plotly HTML inside iframes. This sandboxed graphs from the Obsidian DOM, breaking:
- Theme propagation
- Scroll event handling
- Keyboard shortcuts
- Widget state preservation

**v2 rule**: All rendering happens in direct DOM elements (Canvas, SVG, WebGL canvas) inside the widget container. NEVER create an iframe.

### 3. DO NOT fire network requests from widget constructors

v1 widgets made HTTP fetch() calls in their constructor/toDOM(). This meant every decoration rebuild triggered N network requests.

**v2 rule**: The engine is in-process JavaScript. Expression evaluation is synchronous or microtask-async. No HTTP. No fetch(). No server dependency.

### 4. DO NOT put rendering logic in widget classes

Widgets should be thin wrappers that create a container element and delegate to the renderer module. The widget does NOT contain graph rendering code.

```ts
// ❌ WRONG
class GraphWidget extends WidgetType {
  toDOM() {
    // 50 lines of Three.js setup here
  }
}

// ✅ CORRECT
class GraphWidget extends WidgetType {
  toDOM() {
    const container = document.createElement("div");
    container.className = "kcl-graph-2d";
    this.renderer.mount(container, this.expression);
    return container;
  }
}
```

### 5. DO NOT use ViewPlugin for block widget decorations (RUNTIME BUG 2026-03-16)

Obsidian throws `RangeError: Block decorations may not be specified via plugins` if you
return `block: true` widget decorations from a `ViewPlugin.decorations` getter.

**Root cause**: CM6 enforces that block-level decorations (those that push content above/below
a line) MUST come from a `StateField` provided via `EditorView.decorations.from(f)`.

```ts
// ❌ THROWS AT RUNTIME in Obsidian
const plugin = ViewPlugin.fromClass(class {
  get decorations() {
    return builder.finish(); // builder included block: true widgets → CRASH
  }
});

// ✅ ONLY VALID PATTERN for block widgets
export function createDecorationPlugin(plugin: any) {
  return StateField.define<DecorationSet>({
    create(state) { return buildDecorationsFromState(state, plugin); },
    update(decorations, tr) {
      if (!tr.docChanged) return decorations; // NEVER rebuild on selection-only changes
      decorations = decorations.map(tr.changes);
      // rebuild only changed lines ...
      return decorations;
    },
    provide(f) {
      return EditorView.decorations.from(f); // THIS is the only valid path for block widgets
    },
  });
}
```

### 6. DO NOT insert Tab result before the trigger symbol (RUNTIME BUG 2026-03-16)

When Tab inserts an evaluation result, insert at `trigger.to` (AFTER the trigger character),
NOT at `trigger.from` (BEFORE it). Inserting before `=` leaves the content still ending with `=`,
which re-fires trigger detection → infinite autocomplete loop.

```ts
// ❌ WRONG — inserts " 5" before "=", content becomes "2+3 5=$", "=" still at end → re-trigger
const insertPos = trigger.from;

// ✅ CORRECT — inserts " 5" after "=", content becomes "2+3= 5$", no "=" at end → no re-trigger
const insertPos = trigger.to;
```

### 8. DO NOT use CortexJS `compiled.evaluate()` for multi-variable functions (RUNTIME BUG 2026-03-16)

`expr.compile().evaluate({ x: val })` only accepts a single-key scope object. For functions
of multiple variables (e.g. `f(x, y)` for explicit_3d surfaces), `y` is never passed, so
every evaluation returns NaN → blank Three.js surface with NaN bounding sphere error.

```ts
// ❌ BROKEN — y is never in scope, all z values are NaN for f(x,y)
const compiled = expr.compile?.();
const result = compiled.evaluate({ [vars[0]]: args[0] }); // only vars[0]="x"

// ✅ CORRECT — always use Function constructor; it binds all variables
const fn = new Function(...vars, `"use strict"; return (${jsStr});`);
// fn is called as fn(x, y) — both args bound to correct parameters
```

### 10. ALWAYS handle CortexJS normalization heads in `jsonToInfix` (RUNTIME BUG 2026-03-16)

CortexJS auto-simplifies expressions at parse time **before** you ever see the JSON:
- `x^2` → `["Square", "x"]`  (NOT `["Power", "x", 2]`)
- `x^3` → `["Cube", "x"]`    (NOT `["Power", "x", 3]`)
- `\sqrt[n]{x}` → `["Root", "x", n]`

If `jsonToInfix` doesn't handle these heads, it falls through to the generic lowercase case:
`["Square", "x"]` → `"square(x)"` — invalid in both function-plot and `new Function`.
function-plot throws "symbol 'square' is undefined". `new Function` receives non-JS syntax.

```ts
// ❌ WRONG — no Square handler → "square(x)"
const fnName = UNARY_FN_MAP[head]; // Square is not in map
return head.toLowerCase() + "(" + args.map(jsonToInfix).join(", ") + ")"; // "square(x)"

// ✅ CORRECT — explicit handlers BEFORE the UNARY_FN_MAP lookup
if (head === "Square" && args.length === 1) return "(" + jsonToInfix(args[0]) + " ^ 2)";
if (head === "Cube" && args.length === 1)   return "(" + jsonToInfix(args[0]) + " ^ 3)";
if (head === "Root" && args.length === 2)   return "((" + jsonToInfix(args[0]) + ") ^ (1 / " + jsonToInfix(args[1]) + "))";
```

**Defensive fallback**: For any remaining unknown CortexJS PascalCase head, return `"NaN"`
instead of producing invalid syntax that crashes `new Function`. A NaN sentinel degrades
gracefully (plot shows gaps) rather than throwing an exception.

### 11. ALWAYS accept both `"Equal"` and `"Assign"` as equation heads in `buildPlotData` (RUNTIME BUG 2026-03-16)

CortexJS may serialize `x = y` as `["Equal", x, y]` or `["Assign", x, y]` depending on
version and context. Checking only `json[0] === "Equal"` silently falls through to
`plotExpr = expr` (the ENTIRE expression including the equation head), producing garbage.

```ts
// ❌ WRONG — misses "Assign" variant
if (Array.isArray(json) && json[0] === "Equal" && json.length === 3) { ... }

// ✅ CORRECT
const isEquation = Array.isArray(json) &&
  (json[0] === "Equal" || json[0] === "Assign" || json[0] === "Equation") &&
  json.length === 3;
```

### 12. ALWAYS call `publishInspectorState` after a successful `preparePlot` in widgets (RUNTIME BUG 2026-03-16)

`publishInspectorState()` exists on the plugin but was never called from Graph2DWidget or
Graph3DWidget. The Graph Inspector sidebar sat empty regardless of what was plotted.

```ts
// In toDOM() of Graph2DWidget / Graph3DWidget, after successful preparePlot:
this.plugin.publishInspectorState?.({
  spec: specResult.value,
  latex: this.latex,
  title: this.latex,
  summary: `2D plot · ${specResult.value.data[0]?.type ?? ""}`,
  diagnostics: (specResult.diagnostics ?? []).map((d: any) => d.message),
});
```

### 13. ALWAYS use global scroll listener + getBoundingClientRect() for Graph3DWidget — NEVER IntersectionObserver (RUNTIME BUG 2026-03-17)

Chrome limits simultaneous WebGL contexts to ~16 per page. CM6 calls `destroy()` on a widget
only when it is **replaced** by a different widget (eq() → false). It does NOT call destroy()
when the widget scrolls off-screen. Every 3D graph in the document therefore holds a live
WebGL context permanently once visible.

When the user scrolls down and context #17+ is created, Chrome silently kills the oldest
context. Those canvases go black. Scrolling back up → all top graphs are dead.

```ts
// ❌ WRONG — creates WebGL context eagerly on every toDOM(), never released
toDOM() {
  Promise.resolve().then(() => {
    this.handle = this.plugin.renderer3d.create(container, spec); // context lives forever
  });
}

// ❌ ALSO WRONG — IntersectionObserver with root:null doesn't work in CM6.
// .cm-scroller is always inside the browser viewport → all widgets appear
// perpetually intersecting → nothing ever unmounts.
// ❌ ALSO WRONG — IntersectionObserver with root:.cm-scroller is fragile.
// The selector may fail in some Obsidian versions/layouts, silently falling
// through to null root — same problem as above.
toDOM() {
  this.observer = new IntersectionObserver(callback, { root: scrollRoot }); // fragile
}

// ✅ CORRECT — module-level global scroll listener + getBoundingClientRect()
// getBoundingClientRect() is always viewport-accurate regardless of which element
// is scrolling. No root configuration, no selector fragility, no async issues.

// Module-level (file scope):
const _g3dRegistry = new Set<Graph3DWidget>();
let _g3dRafPending = false;

function _g3dScheduleScan() {
  if (_g3dRafPending) return;
  _g3dRafPending = true;
  requestAnimationFrame(() => {
    _g3dRafPending = false;
    _g3dRegistry.forEach(w => w._scanVisibility());
  });
}
document.addEventListener("scroll", _g3dScheduleScan, { passive: true, capture: true });
// ↑ capture:true catches scroll from ALL elements including .cm-scroller

// Widget scan (called each rAF-throttled scroll frame):
_scanVisibility() {
  const rect = this.container.getBoundingClientRect(); // always correct
  const inView = rect.bottom > -300 && rect.top < window.innerHeight + 300;
  if (inView && !this.handle) this._mount();
  else if (rect.bottom < -600 || rect.top > window.innerHeight + 600) this._unmount();
}
```

Additional rules:
- **mount() must be synchronous** — preparePlot and renderer3d.create are both sync. No async, no race conditions.
- **Check `el.isConnected`** before `getBoundingClientRect()` — detached elements return zeros which appears "in viewport"
- **Cache the PlotSpec** after first `preparePlot` so scroll-back is instant.
- **Remove the canvas DOM node** in unmount() — a disposed WebGL canvas stays solid black if left in DOM.
- **CSS min-height** on `.kcl-graph-3d` keeps the container sized when canvas is removed (prevents scroll jump).
- **Hard cap pool** (MAX=10) as additional safety: evict oldest active widget if approaching Chrome's 16-context limit.

### 9. DO NOT rely on CortexJS `.json` to detect simple-symbol LHS in `classifyExpression` (RUNTIME BUG 2026-03-16)

`z = x^2 + y^2` was classified as `implicit_3d` instead of `explicit_3d` because
`ce.parse("z").json` may not serialize as the plain string `"z"`. If it returns an
array form, `collectSymbols` skips it (array head is not recursed into), `lhsSyms`
stays empty, and `isSimpleLHS({}, "z")` returns false.

```ts
// ❌ BROKEN — depends on CortexJS JSON format for simple symbols
if (isSimpleLHS(lhsSyms, "z") || isSimpleLHS(rhsSyms, "z")) return "explicit_3d";

// ✅ CORRECT — string-level fast path runs first, no CortexJS dependency
if (/^z$/.test(lhsTrimmed) || /^z$/.test(rhsTrimmed)) return "explicit_3d";
if (/^y$/.test(lhsTrimmed) || /^y$/.test(rhsTrimmed)) return "explicit_2d";
```

### 7. DO NOT detect Tab cursor position by proximity to mathRange.to (RUNTIME BUG 2026-03-16)

`mathRange.to` is the position AFTER the closing `$`. A cursor just inside the block
(e.g., right before `$`) is several characters away and fails a small proximity threshold.

```ts
// ❌ WRONG — cursor just before closing $ fails threshold, Tab exits the block instead
const triggerEnd = t.mathRange ? t.mathRange.to : t.to;
return Math.abs(cursor - triggerEnd) <= PROXIMITY_THRESHOLD;

// ✅ CORRECT — cursor anywhere inside the $...$ block activates Tab
if (t.mathRange) {
  return cursor >= t.mathRange.from && cursor <= t.mathRange.to;
}
```

### 14. ALWAYS reset `this.destroyed = false` at the start of `toDOM()` (RUNTIME BUG 2026-03-17)

CM6 calls `destroy()` on a widget instance when it leaves the rendered viewport, then calls
`toDOM()` again on the **same instance** when it scrolls back into view. This is CM6's widget
re-use behavior for persistent decorations (where `eq()` returns true for the same expression).

If `toDOM()` doesn't reset the `destroyed` flag, any async work guarded by `if (this.destroyed) return`
will silently abort — producing blank/empty widgets with zero errors in the console.

```ts
// ❌ WRONG — destroyed stays true after scroll-back, rendering silently aborts
toDOM(): HTMLElement {
  const container = document.createElement("div");
  Promise.resolve().then(async () => {
    if (this.destroyed) return; // ← fires on re-entry, nothing renders
    // ... render
  });
  return container;
}

// ✅ CORRECT — reset at top of toDOM(), clean up any stale handle
toDOM(): HTMLElement {
  const container = document.createElement("div");
  this.destroyed = false;   // ← CM6 re-used this instance; it's alive again
  if (this.handle) {        // ← clean up any stale renderer from before destroy()
    this.handle.destroy();
    this.handle = null;
  }
  Promise.resolve().then(async () => {
    if (this.destroyed) return; // now only fires if destroy() was called AFTER this toDOM()
    // ... render
  });
  return container;
}
```

**Also**: for 3D widgets that cache a snapshot URL, check for the cached URL at the start of
`toDOM()` and display it immediately — no re-render needed on scroll-back:

```ts
toDOM(): HTMLElement {
  this.destroyed = false;
  if (this.snapshotUrl) {
    this._showSnapshot(); // instant — no WebGL work
  } else {
    // first render: generate snapshot
  }
}
```

### 15. 3D Graphs MUST use static image architecture — NOT persistent WebGL contexts

The combination of antipatterns #13 + #14 + Chrome's ~16 WebGL context limit makes persistent
3D contexts fundamentally unreliable in CM6. The correct architecture for 3D graphs is:

- **Static `<img>` snapshot for all graphs** — render once via `renderSnapshot()`, display as data URL
- **Click-to-interact** creates exactly 1 live WebGL context (OrbitControls)
- **Only 1 interactive graph at a time** — clicking another auto-closes the previous
- `renderSnapshot()` creates a temp container, calls `create3DGraph()`, renders 1 frame,
  captures `canvas.toDataURL()`, then destroys everything. Context lives ~50ms per graph.

This completely sidesteps:
- Chrome's ~16-context limit (0 persistent contexts)
- CM6 virtual viewport destroy/toDOM cycling (#14)
- `getBoundingClientRect()` returning zeros for detached elements
- IntersectionObserver root fragility inside `.cm-scroller`

```ts
// ❌ WRONG — persistent WebGL context, subject to Chrome limit + CM6 lifecycle issues
toDOM(): HTMLElement {
  this.handle = this.plugin.renderer3d.create(container, spec); // lives forever
}

// ✅ CORRECT — static image, click-to-interact
toDOM(): HTMLElement {
  this.destroyed = false;
  if (this.snapshotUrl) {
    this._showSnapshot(); // instant from cache
  } else {
    this.snapshotUrl = this.plugin.renderer3d.renderSnapshot(spec); // ~50ms, then freed
    this._showSnapshot();
  }
  container.addEventListener("click", () => this._enterInteractive());
}
```

## Coding Standards

### Imports
```ts
// 1. External libraries
import { ComputeEngine } from "@cortex-js/compute-engine";
import * as THREE from "three";

// 2. Obsidian / CodeMirror (externals)
import { Plugin, ItemView } from "obsidian";
import { EditorView, ViewPlugin } from "@codemirror/view";

// 3. Internal modules (use relative paths)
import { ExpressionEngine } from "../engine";
import type { TriggerMatch, GraphSpec } from "../types";
```

### Naming
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/methods: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- CSS classes: `kcl-` prefix (e.g., `kcl-graph-2d`, `kcl-widget-result`)

### Error Handling
- Engine errors return typed result objects, NEVER throw
- Renderer errors show inline error messages in the widget
- Use discriminated unions: `{ ok: true, value } | { ok: false, error }`

### Performance
- Debounce expression evaluation (100ms after last keystroke)
- Cache compiled functions (key: LaTeX string → compiled evaluator)
- Limit 3D mesh resolution to viewport needs
- Use requestAnimationFrame for Three.js render loops
- Dispose Three.js resources in widget destroy()

## Build

```bash
npm install          # First time
npm run dev          # Watch mode (auto-rebuild on save)
npm run build        # Production build
```

Output goes to `main.js` in repo root. The build script copies it to `.obsidian/plugins/kings-calclatex/`.

## Testing Checklist

Before any session is considered complete, verify these equations work:

### Evaluation
- `$2+3=$` → shows `5`
- `$\sin(\pi/4) \approx$` → shows `0.707106781187`
- `$x^2 + 2x + 1 \equiv$` → shows `(x+1)^2`

### 2D Graphs
- `$y = \sin(x) @plot2d$` — smooth sine wave, auto-ranged
- `$x^2 + y^2 = 25 @plot2d$` — circle radius 5, interval arithmetic rendering
- `$y = x^3 - 3x @plot2d$` — cubic with local extrema visible

### 3D Graphs
- `$z = x^2 + y^2 @plot3d$` — paraboloid, smooth rotation
- `$x^2 + y^2 + z^2 = 9 @plot3d$` — sphere, auto-ranged to show full surface

## Agent Workflow

1. Read this file + `../PROJECT_STATE.md` at session start
2. Check `../development/handoff_log.md` for recent context
3. Make changes following the patterns above
4. Run `npm run build` to verify compilation
5. Test with the showcase equations
6. Update `../PROJECT_STATE.md` with what changed
7. Update `../development/handoff_log.md` with session summary
