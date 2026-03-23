# Engine Research: Desmos, GeoGebra, and Our Approach

## Desmos
- **Arch**: 100% browser-native JavaScript. No backend server
- **CAS**: Proprietary. Interval arithmetic evaluates math over ranges, not points
- **2D Rendering**: Marching Squares on adaptive grids + GLSL shaders (GPU)
- **3D Rendering**: Marching Cubes + WebGL shaders at 60 FPS
- **Key Insight**: Interval arithmetic can *prove* a curve exists in a region — never misses features
- **API**: Embeddable JS calculator (`desmos.com/api/v1.6`), LaTeX expression model
- **Limitation for us**: Proprietary, requires internet, can't extend CAS

## GeoGebra
- **Arch**: Java desktop + JS web, multi-platform
- **CAS**: Giac/Xcas — 150k lines of C++ with JS/Java bindings. Also used by HP Prime
- **2D Rendering**: Java2D (desktop), HTML5 Canvas (web)
- **3D Rendering**: Custom 3D engine (GeoGebra 5.0+), supports AR
- **Key Insight**: CAS (Giac) is completely separate from rendering
- **Limitation for us**: Java ecosystem, massive codebase, not embeddable in Obsidian

## Our Approach: King's CalcLatex
- **CAS**: SymPy (mature Python symbolic math) + latex2sympy2 (LaTeX → SymPy)
- **2D Rendering**: Plotly `go.Contour` (500×500 grid) for implicit, `go.Scatter` for explicit
- **3D Rendering**: Plotly `go.Isosurface` (85³ grid) for implicit, `go.Surface` for explicit
- **Units**: Pint library for unit conversions
- **Trade-off**: Not GPU-accelerated like Desmos, but smooth enough for coursework. Benefits: full CAS, offline, extensible

## Lessons from v1 & v2

### v1 (calctex-patch) — What worked
- Inline rendering UX (graphs appear in-editor)
- Dark theme integration
- Cross product / dot product handling

### v1 — What broke
- `spb.plot_implicit` crashes with Plotly backend
- Backend returns raw HTML (no structured protocol)
- Symbol mapping bugs caused "empty graphs"
- Solving equations into branches (√) broke isosurface

### v2 (Kings CalcTex) — What worked
- Typed protocol (`shared-spec`)
- `go.Contour` for 2D implicit (no spb dependency)
- `go.Isosurface` for 3D implicit
- Graph Inspector sidebar with sliders
- LHS-RHS raw parsing (no branch solving)

### v2 — What broke
- Never shipped — over-engineered for the scope
- No inline rendering (only sidebar)
- White backgrounds (didn't match Obsidian)
