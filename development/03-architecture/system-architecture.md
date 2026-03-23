# System Architecture

## Layers

### 1. Plugin Layer (TypeScript)
The Obsidian plugin owns all user interaction:
- **Inline Widgets**: CodeMirror 6 decorations that render results/graphs directly in the editor
- **Graph Inspector**: A dedicated Obsidian sidebar view for full graph interaction (zoom, pan, rotate, sliders, export)
- **Trigger Detection**: Watches for `=`, `\approx`, `\equiv`, `@plot2d`, `@plot3d`, `@geom`, `@persist`, `@convert`
- **Math Block Awareness**: Handles both `$...$` inline and `$$...$$` display math

### 2. Protocol Layer (Shared Types)
A stable, typed JSON contract between plugin and engine:
```
EvaluateRequest  → EvaluateResponse   (resultLatex, resultText)
PlotRequest      → PlotResponse       (graphSpec with renderHtml)
PersistRequest   → PersistResponse    (storedSymbol confirmation)
ConvertRequest   → ConvertResponse    (converted value + unit)
HealthRequest    → HealthResponse     (engine status)
```

### 3. Engine Layer (Python + FastAPI)
Local HTTP service on `localhost:3210`:
- **Evaluator**: SymPy + latex2sympy2 for symbolic computation
- **Plotter**: Plotly `go.Contour` (2D) and `go.Isosurface` (3D) for implicit, `go.Surface`/`go.Scatter` for explicit
- **Persister**: In-memory symbol store (per session)
- **Converter**: Pint library for unit conversions
- **CAS**: Full symbolic solve, factor, expand, eigenvalues, systems

## Data Flow: Inline Graph

```
User types: $z = x^2 - y^2 @plot3d$
  ↓
Plugin detects @plot3d trigger
  ↓
Plugin sends PlotRequest { latex: "z = x^2 - y^2", mode: "plot3d" }
  ↓
Engine classifies as explicit 3D surface
  ↓
Engine builds Plotly Figure, returns HTML + GraphSpec
  ↓
Plugin renders HTML in inline iframe widget (dark theme)
  ↓
Plugin also updates Graph Inspector sidebar (if open)
```

## Why Backend Returns HTML (Not Just Data)

v2 tried to make the frontend own rendering, but this adds massive complexity (the plugin would need its own Plotly integration). Instead:
- Backend generates Plotly HTML fragments (not full pages)
- Frontend wraps them in themed iframes
- GraphSpec metadata is also returned for Inspector controls (range editing, slider values)

This is a pragmatic hybrid: backend handles the hard math + plotting, frontend handles where/how to display it.
