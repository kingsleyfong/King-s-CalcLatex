# King's CalcLatex v2 — Cheat Sheet

> **100% browser-native.** Type LaTeX inside `$...$`, add a trigger suffix, and results or graphs appear inline. Press **Tab** to insert the result into your note. No backend, no server.

---

## Quick Reference Table

| Trigger | Category | What it does |
|:--------|:---------|:-------------|
| `=` | Evaluation | Exact symbolic result |
| `\approx` | Evaluation | Decimal approximation |
| `\equiv` | Evaluation | Algebraic simplification |
| `@diff` / `@differentiate` | CAS | Symbolic derivative |
| `@int` / `@integrate` | CAS | Indefinite integral |
| `@solve` | CAS | Solve equation for a variable |
| `@factor` | CAS | Factor a polynomial |
| `@expand` | CAS (Giac) | Expand an expression |
| `@limit` | CAS (Giac) | Limit as x → 0 |
| `@taylor` | CAS (Giac) | Taylor series expansion |
| `@partfrac` | CAS (Giac) | Partial fraction decomposition |
| `@steps` | CAS (Giac) | Step-by-step solution walkthrough |
| `@partial_x` / `@px` | CAS | Partial derivative ∂/∂x |
| `@partial_y` / `@py` | CAS | Partial derivative ∂/∂y |
| `@partial_z` / `@pz` | CAS | Partial derivative ∂/∂z |
| `@gradient` | CAS + Viz | Gradient vector + contour overlay |
| `@normal` | CAS | Surface normal vector |
| `@tangent` | CAS + Viz | Tangent plane at a point |
| `@plot2d` | Graphing | 2D plot (explicit, implicit, parametric, polar) |
| `@plot3d` | Graphing | 3D plot (surface, implicit, parametric, vector) |
| `@contour` | Graphing | Contour / level curve map |
| `@vecfield` | Graphing | 2D or 3D vector field |
| `@geom` | Graphing | Geometry mode (vectors, points) |
| `@region` | Graphing | Shaded region between curves |

> **Giac WASM** — Triggers marked "(Giac)" require `giacwasm.js` (19 MB) to be present in the plugin folder. Without it, those triggers return an unsupported message. All other triggers run on CortexJS + math.js.

---

## 1. Evaluation Triggers

### `=` — Exact Evaluation

Returns an exact symbolic result: integers, fractions, radicals.

```
$2 + 3 =$                          → 5
$\frac{1}{2} + \frac{1}{3} =$      → 5/6
$\sqrt{8} =$                       → 2√2
$2^{10} =$                         → 1024
```

### `\approx` — Decimal Approximation

Returns a floating-point result. Precision is configurable (default: 12 digits).

```
$\sqrt{2} \approx$                 → 1.41421356237
$\sin(\pi/4) \approx$              → 0.707106781187
$e^2 \approx$                      → 7.38905609893
$\ln(10) \approx$                  → 2.30258509299
```

### `\equiv` — Algebraic Simplification

Simplifies or rewrites an expression in canonical form.

```
$x^2 + 2x + 1 \equiv$              → (x+1)²
$(x+1)(x-1) \equiv$                → x² - 1
$\frac{x^2 - 1}{x - 1} \equiv$    → x + 1
$\sin^2(x) + \cos^2(x) \equiv$    → 1
```

### `\sum` / `\prod` — Summation and Product Notation

Evaluates finite sums and products. Use braced bounds: `_{var=lo}^{hi}`.

```
$\sum_{n=1}^{10} n^2 =$                 → 385
$\sum_{n=0}^{100} \frac{1}{2^n} \approx$ → 2.0
$\prod_{k=1}^{5} k =$                   → 120 (5!)
$\sum_{i=1}^{4} i^3 =$                  → 100
```

> Iteration is capped at 100,000 terms. Both `=` and `\approx` triggers work.

---

## 2. Symbolic CAS — Core Operations

Auto-detects the variable (prefers `x`, then `t`, then first available).

### `@diff` / `@differentiate` — Derivative

```
$x^3 + 2x @diff$                   → 3x² + 2
$\sin(x)\cos(x) @diff$             → cos(2x)
$e^{3t} @diff$                     → 3e^{3t}
$\ln(x) @diff$                     → 1/x
$x^2 e^x @diff$                   → 2xe^x + x²e^x
```

### `@int` / `@integrate` — Indefinite Integral

```
$3x^2 + 2 @int$                    → x³ + 2x
$\cos(x) @int$                     → sin(x)
$e^x @int$                         → eˣ
$\frac{1}{x} @int$                 → ln|x|
```

> CortexJS handles polynomials, standard trig, and exponentials. For complex integrands, enable Giac WASM for enhanced coverage.

### Definite Integrals

Use standard notation with limits of integration:

```
$\int_0^{\pi} \sin(x)\,dx =$        → 2
$\int_0^1 x^2\,dx =$               → 1/3
$\int_1^e \frac{1}{x}\,dx =$       → 1
```

### `@solve` — Solve Equations

Solves for the auto-detected variable. The `= 0` is implied if no equals sign is present.

```
$x^2 - 4 = 0 @solve$               → x = ±2
$2x + 5 = 0 @solve$                → x = -5/2
$x^2 + 3x + 2 @solve$              → x = -1, x = -2
```

### `@factor` — Factor Polynomials

```
$x^2 + 3x + 2 @factor$             → (x+1)(x+2)
$x^2 - 1 @factor$                  → (x-1)(x+1)
$x^2 - 5x + 6 @factor$             → (x-2)(x-3)
$x^3 - 8 @factor$                  → (x-2)(x²+2x+4)    (difference of cubes)
$x^3 + 27 @factor$                 → (x+3)(x²-3x+9)    (sum of cubes)
```

---

## 3. Symbolic CAS — Giac Operations

These require Giac WASM to be loaded.

### `@expand` — Expand Expressions

```
$(x+1)^3 @expand$                  → x³ + 3x² + 3x + 1
$(x+y)^2 @expand$                  → x² + 2xy + y²
$(2x-1)(x+3) @expand$              → 2x² + 5x - 3
```

### `@limit` — Compute Limits

Default: limit as x → 0. One-sided limits are handled automatically.

```
$\frac{\sin(x)}{x} @limit$         → 1
$\frac{e^x - 1}{x} @limit$         → 1
$\frac{1 - \cos(x)}{x^2} @limit$  → 1/2
$(1 + x)^{1/x} @limit$             → e
```

### `@taylor` — Taylor Series

Default: order 5 expansion around x = 0.

```
$e^x @taylor$                      → 1 + x + x²/2! + x³/3! + x⁴/4! + x⁵/5!
$\sin(x) @taylor$                  → x - x³/6 + x⁵/120
$\cos(x) @taylor$                  → 1 - x²/2 + x⁴/24
$\ln(1+x) @taylor$                 → x - x²/2 + x³/3 - x⁴/4 + x⁵/5
```

### `@partfrac` — Partial Fraction Decomposition

```
$\frac{1}{x^2 - 1} @partfrac$      → 1/(2(x-1)) - 1/(2(x+1))
$\frac{x}{(x+1)(x+2)} @partfrac$   → -1/(x+1) + 2/(x+2)
$\frac{1}{x^2 + x} @partfrac$      → 1/x - 1/(x+1)
```

### `@steps` — Step-by-Step Solutions

Shows intermediate steps for CAS operations. Requires Giac WASM.

```
$x^2 - 4 = 0 @steps$              → Step 1: ... Step 2: ... → x = ±2
$\int x^2\,dx @steps$              → Step 1: Power rule... → x³/3
```

---

## 4. Multivariable Calculus

### `@partial_x` / `@px`, `@partial_y` / `@py`, `@partial_z` / `@pz` — Partial Derivatives

```
$x^2 y + y^3 @px$                  → 2xy           (∂f/∂x)
$x^2 y + y^3 @py$                  → x² + 3y²      (∂f/∂y)
$x^2 + y^2 + z^2 @pz$             → 2z             (∂f/∂z)
$\sin(xy) @px$                     → y·cos(xy)
$\sin(xy) @py$                     → x·cos(xy)
$e^{xyz} @pz$                      → xye^{xyz}
```

When an `=` sign is present (e.g., `$z = x^2 + y^2 @px$`), the LHS is stripped and the RHS is differentiated.

### `@gradient` — Gradient Vector Field

Computes ∇f symbolically and renders contour lines overlaid with gradient arrows.

```
$x^2 + y^2 @gradient$              → ∇f = (2x, 2y) — arrows point radially outward
$3x + 2y @gradient$                → ∇f = (3, 2) — constant direction everywhere
$x^2 - y^2 @gradient$             → saddle point at origin; zero gradient there
$\sin(x)\cos(y) @gradient$        → complex pattern; arrows perpendicular to contours
```

> Gradient arrows are always perpendicular to contour lines — this is the geometric definition of the gradient.

### `@normal` — Surface Normal Vector

- Explicit surface `z = f(x,y)`: returns $\vec{n} = (f_x,\ f_y,\ -1)$
- Implicit surface `F(x,y,z) = c`: returns $\vec{n} = \nabla F$

```
$z = x^2 + y^2 @normal$            → n = (2x, 2y, -1)
$x^2 + y^2 + z^2 = 9 @normal$     → n = (2x, 2y, 2z)
$x^2 + y^2 - z^2 = 1 @normal$     → n = (2x, 2y, -2z)
$xy + z @normal$                   → n = (y, x, 1)
```

> The result is not unit-normalized. To get $\hat{n}$, divide by $|\vec{n}|$ manually.

### `@tangent` — Tangent Plane

Format: `f(x,y); (a, b)`. Renders the surface (semi-transparent), the tangent plane, and a point marker.

Tangent plane formula: $z = f(a,b) + f_x(a,b)(x-a) + f_y(a,b)(y-b)$

```
$x^2 + y^2; (1, 1) @tangent$       → plane: z = 2x + 2y - 2
$\sin(x)\cos(y); (0, 0) @tangent$  → plane: z = x  (f_y(0,0) = 0)
$x^2 - y^2; (1, 0) @tangent$      → saddle: tangent plane not horizontal
$\sqrt{x^2 + y^2}; (3, 4) @tangent$
```

> At a critical point (local max/min/saddle), the tangent plane is horizontal — $f_x = f_y = 0$.

---

## 5. Linear Algebra

Matrix operations use the standard `=` trigger.

### Matrix Multiplication

```
$\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix}\begin{pmatrix}5\\6\end{pmatrix} =$
```
→ Column vector result.

```
$\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix}\begin{pmatrix}5 & 6\\7 & 8\end{pmatrix} =$
```
→ 2×2 matrix product.

### Cross Product

```
$\begin{pmatrix}1 & 0 & 0\end{pmatrix}\times\begin{pmatrix}0 & 1 & 0\end{pmatrix} =$
```
→ (0, 0, 1)

### Other Operations

```
$\det\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix} =$      → -2
$\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix}^T =$         → transposed matrix
$\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix}^{-1} =$      → matrix inverse
```

---

## 6. 2D Plotting (`@plot2d`)

### Explicit Curves

```
$y = \sin(x) @plot2d$
$y = x^3 - 3x @plot2d$
$y = e^{-x^2} @plot2d$
```

### Implicit Curves

Rendered via marching squares.

```
$x^2 + y^2 = 25 @plot2d$           — circle, radius 5
$\frac{x^2}{4} + \frac{y^2}{9} = 1 @plot2d$  — ellipse
$x^2 - y^2 = 1 @plot2d$            — hyperbola
```

### Parametric Curves

Parameter `t` defaults to $[-2\pi, 2\pi]$.

```
$(\cos(t), \sin(t)) @plot2d$        — unit circle
$(\cos(t), \sin(2t)) @plot2d$       — Lissajous figure (1:2)
$(t - \sin(t), 1 - \cos(t)) @plot2d$  — cycloid
$(e^{0.1t}\cos(t), e^{0.1t}\sin(t)) @plot2d$  — logarithmic spiral
```

### Polar Curves

```
$r = 1 + \cos(\theta) @plot2d$      — cardioid
$r = \cos(2\theta) @plot2d$         — four-petal rose
$r = \theta @plot2d$                — Archimedean spiral
```

### Inequalities

```
$y > \sin(x) @plot2d$               — shaded region above sine
$y \leq x^2 @plot2d$               — region below parabola
```

Strict inequalities use a dashed boundary line. Supports `>`, `<`, `>=`, `<=`.

### Points

```
$(5, 5) @plot2d$                    — filled dot with coordinate label
$(0,0); (3,4) @plot2d$             — multiple points
```

### Piecewise Functions

Use `\begin{cases}...\end{cases}` with conditions separated by `&`.

```
$y = \begin{cases} x^2 & x > 0 \\ -x & x \leq 0 \end{cases} @plot2d$
$y = \begin{cases} \sin(x) & x < \pi \\ 0 & \text{otherwise} \end{cases} @plot2d$
```

Each branch is evaluated conditionally. Gaps appear at discontinuities.

### Domain Restrictions

Append `\{lo < var < hi\}` to clip an expression to a specific interval.

```
$y = x^2 \{0 < x < 5\} @plot2d$         — parabola only on [0, 5]
$y = \sin(x) \{-\pi < x < \pi\} @plot2d$ — one period of sine
```

Supports `<`, `>`, `\le`, `\leq`, `\ge`, `\geq`. Also works with reversed notation: `\{5 > x > 0\}`.

### Multi-Equation Overlay

Separate expressions with semicolons. Each gets a distinct color.

```
$y = \sin(x); y = \cos(x) @plot2d$
$y = \sin(x); y = 0 @plot2d$        — sine and x-axis (useful with @region)
$x^2 + y^2 = 1; x^2 + y^2 = 4 @plot2d$  — two concentric circles
```

### Parameter Sliders

Free variables (not `x`, `y`, `t`, `r`, `θ`) auto-generate interactive sliders.

```
$y = a\sin(bx) @plot2d$             — sliders for a and b
$y = A e^{-kx} @plot2d$            — sliders for A and k
```

---

## 7. 3D Plotting (`@plot3d`)

### Explicit Surfaces

Click to enter interactive mode, then drag to rotate, scroll to zoom.

```
$z = x^2 + y^2 @plot3d$            — paraboloid
$z = \sin(x)\cos(y) @plot3d$       — egg-carton
$z = x^2 - y^2 @plot3d$           — saddle (hyperbolic paraboloid)
$z = e^{-(x^2+y^2)} @plot3d$       — Gaussian bell
```

> Explicit surfaces use height-based vertex coloring — a blue-to-red gradient mapped to the z-value range, matching Desmos/GeoGebra visual style.

### Implicit Surfaces

Rendered via marching cubes.

```
$x^2 + y^2 + z^2 = 9 @plot3d$      — sphere, radius 3
$x^2 + y^2 - z^2 = 1 @plot3d$     — hyperboloid of one sheet
$z^2 - x^2 - y^2 = 1 @plot3d$     — hyperboloid of two sheets
$x^2 + y^2 = 4 @plot3d$            — cylinder (no z term → infinite)
$\frac{x^2}{4} + \frac{y^2}{9} + z^2 = 1 @plot3d$  — ellipsoid
```

> All three axes use 1:1:1 proportional scaling by default. Enable "Auto-Scale Z" in settings to fit Z range to the surface.

### Quadric Surface Reference

| Equation form | Surface |
|:---|:---|
| $x^2+y^2+z^2=r^2$ | Sphere |
| $\frac{x^2}{a^2}+\frac{y^2}{b^2}+\frac{z^2}{c^2}=1$ | Ellipsoid |
| $z=x^2+y^2$ | Elliptic paraboloid (bowl) |
| $z=x^2-y^2$ | Hyperbolic paraboloid (saddle) |
| $x^2+y^2-z^2=1$ | Hyperboloid of one sheet |
| $z^2-x^2-y^2=1$ | Hyperboloid of two sheets |
| $x^2+y^2=z^2$ | Elliptic cone |
| $x^2+y^2=r^2$ | Cylinder |

### Parametric 3D Curves

```
$(\cos(t), \sin(t), t/3) @plot3d$   — helix, pitch 1/3
$(\cos(t), \sin(t), \sin(2t)) @plot3d$  — figure-8 z-oscillation
$(t, t^2, t^3) @plot3d$             — twisted cubic (canonical space curve)
```

### Vectors

```
$\langle 1, 2, 3 \rangle @plot3d$   — arrow from origin to (1,2,3)
$\langle 1,1,0 \rangle; \langle 0,1,1 \rangle @plot3d$  — two vectors
```

Also accepts `<1,2,3>` notation.

### Points

```
$(1, 2, 3) @plot3d$                 — sphere marker in 3D space
$(5, 5) @plot3d$                    — 2D point promoted to z=0
```

### Multi-Equation 3D Overlay

```
$z = x^2 + y^2; 2(x-1)+2(y-1)-(z-2)=0 @plot3d$   — surface + tangent plane
$(1,1,2); z = x^2 + y^2 @plot3d$                   — point on surface
$x^2+y^2+z^2=9; z=2 @plot3d$                       — sphere + cutting plane
```

---

## 8. Contour Plots (`@contour`)

Shows level curves of $f(x,y)$ — the 2D "topographic map" of a surface. Closely spaced contours = steep terrain (large gradient). Widely spaced = shallow terrain.

```
$x^2 + y^2 @contour$               — paraboloid: concentric circles
$x^2 - y^2 @contour$              — saddle: hyperbolas crossing at origin
$\sin(x)\cos(y) @contour$         — egg-carton: grid of peaks and saddles
$e^{-(x^2+y^2)} @contour$         — Gaussian hill: tight circles at peak
$3x + 2y @contour$                 — linear: parallel straight lines
```

> Gradient arrows ($\nabla f$) are always perpendicular to contour lines. Use `@gradient` to see both overlaid.

---

## 9. Vector Fields (`@vecfield`)

Draws an arrow at each grid point showing the field's direction and magnitude. Separate components with semicolons or use tuple notation.

### 2D Vector Fields

```
$-y; x @vecfield$                   — rotation (vortex), ∇·F=0, curl≠0
$x; y @vecfield$                    — radial source, ∇·F=2>0
$-x; -y @vecfield$                  — radial sink, ∇·F<0
$y; x @vecfield$                    — conservative field (F=∇(xy)), curl=0
$(x, -y) @vecfield$                — saddle-type hyperbolic flow
```

### 3D Vector Fields

```
$-y; x; z @vecfield$               — rotation in xy-plane + upward drift
$(y, -x, z) @vecfield$             — clockwise xy-rotation + expanding z
$0; 0; -1 @vecfield$               — uniform downward field (gravity analogy)
```

### Arrow Scale Suffix

Append a number after `@vecfield` to scale arrow size:

```
$-y; x @vecfield 0.5$              — 50% scale (avoid overlap in dense regions)
$-y; x @vecfield 2.0$              — 200% scale (for sparse or low-magnitude fields)
```

Default scale is set globally in plugin settings.

---

## 10. Special Modes

### `@geom` — Geometry Mode

Dedicated mode for vectors and geometric objects. Same rendering as `@plot3d` but optimized for geometric work.

```
$\langle 1, 2, 3 \rangle @geom$f    — 3D vector arrow
```

### `@region` — Shaded Region Between Curves

Fills the area between two curves. Useful for setting up integral limits visually.

```
$y = x^2; y = 2x @region$          — region between parabola and line
$y = \sin(x); y = 0 @region$       — area under sine curve
$y = \sqrt{x}; y = x^2 @region$   — region on [0,1], √x above x²
$y = e^x; y = x + 2 @region$      — exponential vs. linear bound
```

> Intersection points are detected automatically. The shaded region directly shows you the integration domain and which curve is "on top."

---

## 11. Settings

Open **Obsidian Settings → King's CalcLatex**.

| Setting | Default | Description |
|:--------|:--------|:------------|
| Default 2D Range | [-10, 10] | x/y axis range for 2D graphs |
| Default 3D Range | [-5, 5] | x/y/z range for 3D graphs |
| Numeric Precision | 12 | Decimal places for `\approx` |
| Auto Range | On | Smart viewport from expression shape |
| Graph Theme | Auto | Follows Obsidian light/dark theme |
| 3D Zoom Mode | Origin | Zoom anchored at origin vs. range center |
| Show POIs | On | Roots, extrema, intersections on 2D graphs |
| 3D Axis Tick Marks | On | Show tick marks on 3D axes |
| Default Vector Arrow Scale | 1.0 | Global arrow scale for `@vecfield` |
| Giac WASM CAS | Off | Enable advanced CAS (requires giacwasm.js) |
| 2D Curves on 3D | Curtain | How 2D equations render on @plot3d: 'Curtain' extrudes as wall, 'Plane curve' draws at z=0 |
| Auto-Scale Z (3D) | Off | Auto-fit Z axis to data range. Off = 1:1:1 proportional axes (Desmos-style) |

---

## 12. Interaction

### 2D Graphs

| Action | Effect |
|:-------|:-------|
| Scroll | Zoom (anchored at cursor) |
| Drag | Pan |
| Hover | Nearest-curve coordinates with crosshair |
| Double-click or `0` | Reset view |
| `+` / `-` | Zoom in/out |
| Grid button (top-right) | Toggle: All / Major / None |
| POI button | Show/hide roots, extrema, intersections |
| Slider min/max | Edit bounds | Click the min or max number next to a slider to set custom range |

### 3D Graphs

| Action | Effect |
|:-------|:-------|
| Click | Enter interactive mode |
| Drag | Rotate (OrbitControls) |
| Scroll | Zoom (rescales math ranges) |
| Double-click | Reset view |
| Hover on surface | 3D coordinate tooltip |

---

## 13. Export

| Button | Action |
|:-------|:-------|
| Screenshot (clipboard icon) | Copy graph to clipboard |
| Download (arrow icon) | Save graph as PNG file |

Both 2D and 3D graphs support export via toolbar buttons.

---

## 14. Graph Inspector

Open via Command Palette: **King's CalcLatex: Open Graph Inspector**

Shows for the active graph:
- Expression LaTeX source
- Detected plot mode and type classification
- Diagnostics (info / warning / error)
- Raw PlotSpec object

---

## 15. Test Equations

Copy-paste these to verify everything is working.

### Evaluation

```
$2 + 3 =$
$\frac{1}{2} + \frac{1}{3} =$
$\sin(\pi/4) \approx$
$x^2 + 2x + 1 \equiv$
```

### Core CAS

```
$x^3 + 2x @diff$                   → 3x² + 2
$3x^2 + 2 @int$                    → x³ + 2x
$x^2 - 4 = 0 @solve$               → x = ±2
$x^2 - 5x + 6 @factor$             → (x-2)(x-3)
```

### Giac CAS

```
$(x+1)^3 @expand$                  → x³ + 3x² + 3x + 1
$\frac{\sin(x)}{x} @limit$         → 1
$e^x @taylor$                      → Taylor series order 5
$\frac{1}{x^2-1} @partfrac$        → partial fractions
```

### Multivariable

```
$x^2 y + y^3 @px$                  → 2xy
$x^2 y + y^3 @py$                  → x² + 3y²
$x^2 + y^2 @gradient$
$z = x^2 + y^2 @normal$            → (2x, 2y, -1)
$x^2 + y^2; (1,1) @tangent$
```

### 2D Plots

```
$y = \sin(x) @plot2d$
$x^2 + y^2 = 25 @plot2d$
$r = 1 + \cos(\theta) @plot2d$
$y > \sin(x) @plot2d$
$y = \sin(x); y = \cos(x) @plot2d$
$y = a\sin(bx) @plot2d$
```

### 3D Plots

```
$z = x^2 + y^2 @plot3d$
$x^2 + y^2 + z^2 = 9 @plot3d$
$(\cos(t), \sin(t), t/3) @plot3d$
$\langle 1, 2, 3 \rangle @plot3d$
```

### Special Modes

```
$x^2 + y^2 @contour$
$x^2 - y^2 @contour$
$-y; x @vecfield$
$x^2 + y^2 @gradient$
$y = x^2; y = 2x @region$
$\langle 1,2,3 \rangle @geom$
```

### Summation & Piecewise

```
$\sum_{n=1}^{10} n^2 =$
$\prod_{k=1}^{5} k =$
$y = \begin{cases} x^2 & x > 0 \\ -x & x \leq 0 \end{cases} @plot2d$
$y = x^2 \{0 < x < 5\} @plot2d$
```

---

## 16. CAS Capability Summary

| Operation | Without Giac | With Giac |
|:----------|:------------|:---------|
| Basic arithmetic (`=`) | CortexJS | CortexJS |
| Differentiation (`@diff`) | CortexJS (polynomials, trig, exp) | Enhanced (all standard functions) |
| Integration (`@int`) | CortexJS (limited) | Giac (broader coverage) |
| Solve (`@solve`) | CortexJS (polynomial) | Giac (general) |
| Factor (`@factor`) | CortexJS | Giac |
| Partial derivatives | CortexJS | Enhanced |
| Gradient / Normal | CortexJS | Enhanced |
| Expand (`@expand`) | Not available | Giac |
| Limits (`@limit`) | Not available | Giac |
| Taylor series (`@taylor`) | Not available | Giac |
| Partial fractions (`@partfrac`) | Not available | Giac |
| Steps (`@steps`) | Not available | Giac (step-by-step walkthrough) |
| Summation/Product (`\sum`, `\prod`) | Numeric evaluation | Numeric evaluation |

> Giac WASM (`giacwasm.js`) is ~19 MB and loaded on demand. Toggle it in Settings.

---

## 17. Common Engineering Patterns

### Heat Transfer — Fourier's Law

```
$T(x,y) = e^{-(x^2+y^2)} @gradient$   — heat flux direction = -k∇T
$e^{-(x^2+y^2)} @contour$              — isotherms (ellipses around peak)
```

### Fluid Mechanics — Stream Function

```
$\psi = -y; \psi = x @vecfield$        — velocity field from ψ
$-y; x @vecfield$                      — vortex/rotation flow
```

### Dynamics / Kinematics

```
$(\cos(t), \sin(t)) @plot2d$           — circular trajectory
$(\cos(t), \sin(t), t/3) @plot3d$     — helical path (e.g., threaded rod)
$x^3 - 3x @diff$                      → 3x² - 3 (velocity from position)
$3x^2 - 3 @int$                       → x³ - 3x (recover position)
```

### Structural — Error Propagation / Linearization

```
$x^2 + y^2; (3, 4) @tangent$          — linear approximation at (3,4,5)
$x^2 y + y^3 @px$                     → ∂f/∂x for sensitivity analysis
```

### Optimization — Critical Points

```
$x^2 - y^2 @gradient$                 — zero at saddle, identify critical pts
$x^2 + y^2 @contour$                  — level curves of objective function
$-(x^2 + y^2) + 4 @gradient$          — gradient descent direction = -∇f
```
