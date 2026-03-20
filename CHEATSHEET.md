# King's CalcLatex v2 — Cheat Sheet

## Overview

King's CalcLatex v2 is a **100% browser-native** Obsidian plugin for inline math evaluation and high-fidelity 2D/3D graphing. No backend server — all computation happens in-browser via CortexJS + math.js + Three.js.

Type LaTeX inside `$...$` or `$$...$$`, add a trigger suffix, and results/graphs appear inline.

---

## Evaluation Triggers

Press **Tab** after the result appears to insert it into your note.

| Trigger | Mode | Example | Result |
|:--------|:-----|:--------|:-------|
| `=` | Exact | `$\frac{1}{2} + \frac{1}{3} =$` | `5/6` |
| `\approx` | Approximate | `$\sqrt{2} \approx$` | `1.41421356237` |
| `\equiv` | Simplify | `$x^2 + 2x + 1 \equiv$` | `(x+1)^2` |
| `@persist` | Persist variable | `$a = 5 @persist$` | Stores `a=5` for later use |
| `@convert <unit>` | Unit conversion | `$50 \text{ kg} @convert lb$` | `110.23 lb` |

---

## Symbolic CAS Operations

These triggers perform symbolic computation and display the result inline — just like `=` or `\approx`, but for calculus and algebra operations.

### Differentiation (`@diff`)

Computes the full derivative. Auto-detects the variable (prefers `x`, then `t`, then first available).

```
$x^3 + 2x @diff$           → 3x² + 2
$\sin(x)\cos(x) @diff$     → cos(2x)    (or equivalent)
$e^{3t} @diff$              → 3e^{3t}    (auto-detects t)
```

### Integration (`@int`)

Computes the indefinite integral (antiderivative). Same auto-detection logic for the variable.

```
$3x^2 + 2 @int$            → x³ + 2x
$\cos(x) @int$             → sin(x)
$e^x @int$                 → eˣ
```

> **Note:** CortexJS has limited symbolic integration. Simple polynomials, trig, and exponentials work. For complex integrands, a "not supported" message appears. Giac WASM integration is planned for a future release.

### Partial Derivatives (`@px`, `@py`, `@pz`)

Computes ∂f/∂x, ∂f/∂y, or ∂f/∂z explicitly. Essential for multivariable calculus.

```
$x^2 y + y^3 @px$          → 2xy           (∂f/∂x)
$x^2 y + y^3 @py$          → x² + 3y²     (∂f/∂y)
$x^2 + y^2 + z^2 @pz$     → 2z            (∂f/∂z)
$\sin(xy) @px$             → y·cos(xy)
$\sin(xy) @py$             → x·cos(xy)
```

For equations like `$z = x^2 + y^2 @px$`, the LHS is stripped — it differentiates the RHS `x^2 + y^2`.

**Engineering applications:**
- **Heat equation:** $\frac{\partial T}{\partial t} = \alpha \nabla^2 T$ — use `@px` and `@py` to verify thermal gradients.
- **Stress analysis:** $\sigma_{ij} = C_{ijkl} \epsilon_{kl}$ — partial derivatives of displacement give strain.
- **Fluid mechanics:** Velocity components $u = \frac{\partial \psi}{\partial y}$, $v = -\frac{\partial \psi}{\partial x}$ from stream function.

### Gradient Vector (`@grad`)

Computes the symbolic gradient ∇f. Auto-detects dimensionality from the variables present.

```
$x^2 + y^2 @grad$          → ∇f = (2x, 2y)
$x^2 + y^2 + z^2 @grad$   → ∇f = (2x, 2y, 2z)
$xy + yz @grad$            → ∇f = (y, x + z, y)
$3x + 2y @grad$            → ∇f = (3, 2)          (constant gradient)
```

The gradient is always perpendicular to contour lines and points in the direction of steepest ascent.

**Engineering applications:**
- **Fourier's Law:** $\mathbf{q} = -k \nabla T$. Compute $\nabla T$ symbolically to get the heat flux direction.
- **Gradient descent:** Step direction $\mathbf{x}_{k+1} = \mathbf{x}_k - \alpha \nabla f(\mathbf{x}_k)$.
- **Conservative force fields:** If $\mathbf{F} = -\nabla V$, compute $\nabla V$ to find the force.

### Surface Normal Vector (`@normal`)

Computes the normal vector to a surface.

- **Explicit surface** `z = f(x,y)`: returns $\vec{n} = (\partial f/\partial x,\ \partial f/\partial y,\ -1)$.
- **Implicit surface** `F(x,y,z) = 0`: returns $\vec{n} = \nabla F = (\partial F/\partial x,\ \partial F/\partial y,\ \partial F/\partial z)$.

```
$z = x^2 + y^2 @normal$        → n = (2x, 2y, -1)
$x^2 + y^2 + z^2 = 9 @normal$  → n = (2x, 2y, 2z)
$x^2 + y^2 - z^2 = 1 @normal$  → n = (2x, 2y, -2z)
$xy + z @normal$                → n = (y, x, 1)
```

> The normal is **not** unit-normalized. To get $\hat{n}$, divide by $|\vec{n}|$ yourself: $\hat{n} = \frac{\vec{n}}{|\vec{n}|}$.

**Engineering applications:**
- **Aerodynamics:** Panel methods require outward-pointing unit normals for surface pressure integration.
- **Contact mechanics:** Normal force direction at contact points on curved surfaces.
- **Flux integrals:** $\iint_S \mathbf{F} \cdot \hat{n}\, dS$ requires surface normals.
- **Radiative heat transfer:** View factor depends on angle between surface normal and line of sight.

### Solve Equations (`@solve`)

Solves equations for a variable. Auto-detects the variable (prefers `x`, then `y`).

```
$x^2 - 4 = 0 @solve$      → x = ±2
$x^2 + 3x + 2 @solve$     → (expression = 0 implied)
$2x + 5 = 0 @solve$        → x = -5/2
```

### Factor Expressions (`@factor`)

Factors polynomial expressions.

```
$x^2 + 3x + 2 @factor$     → (x+1)(x+2)
$x^2 - 1 @factor$          → (x-1)(x+1)
```

### Linear Algebra (via `=`)

Matrix operations work with the standard `=` trigger:

```
$\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix} \times \begin{pmatrix}5 & 6\\7 & 8\end{pmatrix} =$
```
Cross product of 3D vectors:
```
$\begin{pmatrix}1 & 0 & 0\end{pmatrix} \times \begin{pmatrix}0 & 1 & 0\end{pmatrix} =$   → (0, 0, 1)
```

---

## 2D Graphing (`@plot2d`)

### Basic Curves

```
$y = \sin(x) @plot2d$
```
Smooth sine wave with auto-ranged axes.

```
$y = x^3 - 3x @plot2d$
```
Cubic with local extrema. Points of interest (roots, extrema) shown automatically.

### Implicit Curves

```
$x^2 + y^2 = 25 @plot2d$
```
Circle radius 5, rendered via marching squares.

### Parametric Curves

```
$(\cos(t), \sin(t)) @plot2d$
```
Unit circle via parametric equations. `t` range defaults to `[-2pi, 2pi]`.

### Polar Curves

```
$r = 1 + \cos(\theta) @plot2d$
```
Cardioid in polar coordinates.

### Inequalities

```
$y > \sin(x) @plot2d$
```
Shaded region above sine curve. Supports `>`, `<`, `>=`, `<=`. Strict inequalities use dashed boundary.

### Points

```
$(5, 5) @plot2d$
```
Renders as a filled dot with coordinate label. Points have no coordinate variables — just constants.

```
$(0,0); (3,4); y = x @plot2d$
```
Multiple points + curve together.

### Multi-Equation Overlay

Separate expressions with semicolons:

```
$y = \sin(x); y = \cos(x) @plot2d$
```
Both curves overlaid with distinct colors. Parameter sliders auto-appear for free variables.

```
$y = a\sin(bx); (5,5) @plot2d$
```
Sine curve with sliders for `a` and `b`, plus a point.

---

## 3D Graphing (`@plot3d`)

### Explicit Surfaces

```
$z = x^2 + y^2 @plot3d$
```
Paraboloid. Click to interact (rotate via OrbitControls), scroll to zoom.

```
$z = \sin(x) \cos(y) @plot3d$
```
Egg-carton surface.

### Implicit Surfaces

```
$x^2 + y^2 + z^2 = 9 @plot3d$
```
Sphere radius 3, rendered via marching cubes.

See the [[#Implicit Surfaces in 3D|Implicit Surfaces]] section below for a full conceptual treatment.

### Parametric 3D Curves

```
$(\cos(t), \sin(t), t/3) @plot3d$
```
Helix. Also works with fraction notation:

```
$\frac{\cos(t), \sin(t), t}{3} @plot3d$
```
Same helix via `\frac{numerator}{denominator}` — each component divided by 3.

### Vectors

```
$\langle 1, 2, 3 \rangle @plot3d$
```
3D arrow from origin to (1,2,3). Also works with `<1,2,3>` syntax.

```
$\langle 1,1,0 \rangle; \langle 0,1,1 \rangle @plot3d$
```
Multiple vectors overlaid.

### 3D Points

```
$(1, 2, 3) @plot3d$
```
Rendered as a sphere in 3D space. Axes are always 1:1:1 scale.

```
$(5,5) @plot3d$
```
2D point promoted to 3D at z=0.

### Multi-Equation 3D

```
$(1,1,1); z = x^2; 2(x-2) + 1(y-1) - 2(z-5) = 0 @plot3d$
```
Point + paraboloid + plane together. Each expression colored distinctly.

---

## Geometry (`@geom`)

```
$\langle 1, 2, 3 \rangle @geom$
```
Dedicated 3D geometry mode for vectors. Same rendering as `@plot3d` but optimized for geometric objects.

---

## Contour Plots (`@contour`)

### What Is a Contour Plot?

A contour plot shows a 2D cross-section of a 3D surface $z = f(x, y)$. Each contour line (iso-level curve) connects all points where $f$ takes the same value. The result looks exactly like a topographic map: the contour lines are the elevation lines, and the spacing between them tells you how fast you are climbing.

**Reading the spacing:**
- Closely spaced contours mean $f$ changes rapidly in that region — steep terrain, large gradient.
- Widely spaced contours mean $f$ changes slowly — flat terrain, small gradient.
- The gradient $\nabla f$ always points perpendicular to the contour lines and toward increasing $f$.

**Engineering relevance:**
- **Thermodynamics / Heat Transfer:** A temperature field $T(x,y)$ over a plate. Contours are isotherms. Heat flows perpendicular to isotherms (from hot to cold).
- **Fluid Mechanics:** Pressure fields $P(x,y)$ over an airfoil cross-section. Contours are isobars.
- **Structural Analysis:** Stress or strain energy distributions over a cross-section.
- **Potential fields:** Electric or gravitational potential — equipotential surfaces.

### Syntax

```
$x^2 + y^2 @contour$
```
Iso-level curves of $f(x,y) = x^2 + y^2$, a paraboloid viewed from above. Contours are concentric circles — spacing increases as you move out, reflecting the increasing slope.

```
$\sin(x) \cos(y) @contour$
```
Contour map of the egg-carton function. Shows alternating saddle points and extrema laid out in a grid pattern.

```
$x^2 - y^2 @contour$
```
Saddle surface. Contours are hyperbolas. The saddle point at the origin is where contours cross — not a maximum or minimum.

```
$e^{-(x^2 + y^2)} @contour$
```
Gaussian "hill". Contours are concentric ellipses (circles here). Useful analogy: probability density functions, heat pulse spreading from a point source.

### Visualization Tips

- Contour lines can never cross (unless the function is ill-defined there).
- A closed contour that does not contain another contour encloses either a local maximum or minimum.
- Overlay with `@gradient` to see the gradient arrows perpendicular to each contour — this immediately makes the concept visual.

---

## Vector Fields (`@vecfield`)

### What Is a Vector Field?

A vector field assigns a vector to every point in space. At each grid point $(x, y)$ (or $(x, y, z)$), an arrow is drawn whose direction and length encode the field value $\mathbf{F}(x,y) = \langle P(x,y),\, Q(x,y) \rangle$.

Think of it as a snapshot of wind velocities across a weather map, or the force exerted on a test charge at every point in an electric field.

**Engineering relevance:**
- **Fluid Mechanics:** Velocity fields $\mathbf{v}(x,y)$ show how fluid moves. Divergence $\nabla \cdot \mathbf{v} > 0$ means a source (fluid being injected); $< 0$ means a sink (fluid being removed).
- **Electromagnetism:** Electric field $\mathbf{E}$ and magnetic field $\mathbf{B}$ are vector fields. Field lines are integral curves of the field.
- **Thermodynamics:** Heat flux $\mathbf{q} = -k \nabla T$ is a vector field — it flows from hot to cold, magnitude proportional to temperature gradient.
- **Structural Analysis:** Body forces (gravity, distributed loads) across a domain.

**Pattern recognition — what to look for:**
- **Rotation / Vortex:** Arrows curl around a central point. Curl $\nabla \times \mathbf{F} \neq 0$.
- **Source / Sink:** Arrows radiate outward (source) or inward (sink). Divergence $\nabla \cdot \mathbf{F} \neq 0$.
- **Uniform flow:** All arrows point the same direction with the same magnitude. Constant field.
- **Conservative field:** Arrows have no net rotation. You can write $\mathbf{F} = \nabla f$ for some potential $f$.

### Arrow Scale Suffix

Control arrow size with a numeric suffix after `@vecfield`:

```
$-y; x @vecfield 0.5$
```
Arrows scaled to 50% of the default size. Useful when arrows overlap in dense regions.

```
$-y; x @vecfield 2.0$
```
Arrows scaled to 200% of default. Useful for sparse fields or small magnitude fields that are otherwise hard to read.

The default arrow scale can also be set globally in plugin settings (King's CalcLatex → Default Vector Arrow Scale).

### 2D Vector Fields

```
$-y; x @vecfield$
```
Semicolon-separated components $P(x,y);\, Q(x,y)$. This is a pure rotation field — arrows circulate counterclockwise. This is the classic vortex: $\mathbf{F} = \langle -y, x \rangle$. Divergence is zero, curl is nonzero.

```
$(x, -y) @vecfield$
```
Tuple notation. This field has arrows pointing away from the x-axis and toward the x-axis along y. It is a saddle-type flow — a hyperbolic fixed point at the origin.

```
$x; y @vecfield$
```
Pure radial source field. Every arrow points directly away from the origin. Divergence is positive everywhere ($\nabla \cdot \mathbf{F} = 2$). Analogous to a 2D point source in fluid mechanics or a positive point charge in electrostatics.

```
$-x; -y @vecfield$
```
Pure radial sink. Every arrow points toward the origin. Negative divergence everywhere.

```
$y; x @vecfield$
```
Conservative (irrotational) field. You can verify: $\frac{\partial Q}{\partial x} = \frac{\partial P}{\partial y} = 1$, so the curl is zero. A potential function exists: $f(x,y) = xy$.

### 3D Vector Fields

```
$-y; x; z @vecfield$
```
Three semicolon-separated components $P;\, Q;\, R$ for a 3D arrow grid. Rotation in the xy-plane plus upward/downward drift in z.

```
$(y, -x, z) @vecfield$
```
3D field in tuple notation. Clockwise rotation in xy, expanding in z.

```
$0; 0; -1 @vecfield$
```
Uniform downward field — analogous to a gravitational body force field $\mathbf{g} = -g\hat{k}$ acting uniformly throughout a volume.

---

## Gradient Visualization (`@gradient`)

### What Is the Gradient?

The gradient $\nabla f = \left\langle \frac{\partial f}{\partial x},\, \frac{\partial f}{\partial y} \right\rangle$ is a vector field derived from a scalar field $f(x,y)$. It tells you two things simultaneously:
1. **Direction:** The gradient points in the direction of steepest increase of $f$.
2. **Magnitude:** $|\nabla f|$ is the rate of change in that direction (the steepness).

The gradient is always perpendicular to the contour lines of $f$. This is a theorem, not an approximation.

**Engineering relevance:**
- **Heat Transfer:** Fourier's Law: heat flux $\mathbf{q} = -k \nabla T$. Heat flows opposite to the temperature gradient (from hot to cold). The gradient tells you where heat flows fastest.
- **Fluid Mechanics:** Pressure-driven flow: $\mathbf{F} = -\nabla P$. Fluid accelerates in the direction of decreasing pressure.
- **Structural / FEA:** Stress gradients across a section. High gradient regions are where you need mesh refinement.
- **Optimization:** Gradient descent. You step opposite to the gradient to minimize a cost function.

The `@gradient` trigger renders contour lines of $f$ overlaid with gradient arrows. This makes it immediately obvious that arrows are perpendicular to contours.

### Syntax

```
$x^2 + y^2 @gradient$
```
Paraboloid. Gradient arrows point radially outward from the origin — steepest ascent on the bowl is straight up the bowl wall. Contours are circles; arrows are radii.

```
$\sin(x)\cos(y) @gradient$
```
Egg-carton function. Gradient arrows point toward nearby peaks and away from valleys. At saddle points, the gradient is zero.

```
$x^2 - y^2 @gradient$
```
Saddle surface. Gradient points in the $+x$ direction along the x-axis (uphill on the ridge) and in the $-y$ direction along the y-axis (downhill into the valley). At the origin, $\nabla f = \mathbf{0}$ — a critical point but neither max nor min.

```
$3x + 2y @gradient$
```
Linear field. Gradient is constant: $\nabla f = \langle 3, 2 \rangle$ everywhere. All arrows are identical — uniform slope in a fixed direction. Contours are parallel straight lines.

### Visualization Tips

- Zero-gradient points (where arrows vanish) are critical points: maxima, minima, or saddle points.
- The density of contour lines combined with arrow length gives a sense of curvature: tightly packed contours with long arrows = rapidly changing field.
- To find the directional derivative in direction $\hat{u}$, compute $D_{\hat{u}} f = \nabla f \cdot \hat{u}$. The gradient visualization shows the maximum directional derivative.

---

## Tangent Planes (`@tangent`)

### What Is a Tangent Plane?

For a function $f(x,y)$, the tangent plane at a point $(a, b)$ is the best linear approximation to the surface near that point. It is defined by:

$$z = f(a,b) + f_x(a,b)(x - a) + f_y(a,b)(y - b)$$

where $f_x$ and $f_y$ are the partial derivatives. This is the 3D analog of the tangent line in single-variable calculus.

The normal vector to the tangent plane is $\mathbf{n} = \langle -f_x(a,b),\, -f_y(a,b),\, 1 \rangle$ (or any scalar multiple).

**Engineering relevance:**
- **Linearization / Error Propagation:** If you compute $z = f(x,y)$ from measured $x$ and $y$, small errors $\Delta x$ and $\Delta y$ propagate as $\Delta z \approx f_x \Delta x + f_y \Delta y$. The tangent plane is the error propagation formula.
- **Structural Surface Analysis:** Tangent planes define the local orientation of a curved surface — critical for computing surface normals for aerodynamic panel methods or FEA contact problems.
- **Optimization:** Gradient descent on a surface uses the tangent plane to step downhill. Newton's method uses it to find critical points.
- **Heat Transfer:** Local surface orientation (normal vector from tangent plane) determines the angle of incidence for radiative heat transfer.

### Syntax

Format: `f(x,y); (a, b)` — surface expression then evaluation point.

Renders three objects:
1. The surface $z = f(x,y)$ (semi-transparent)
2. The tangent plane at $(a, b, f(a,b))$
3. A point marker at the tangency point

```
$x^2 + y^2; (1, 1) @tangent$
```
Paraboloid with tangent plane at $(1,1)$. Here $f_x = 2x = 2$ and $f_y = 2y = 2$, so the plane is $z = 2 + 2(x-1) + 2(y-1) = 2x + 2y - 2$.

```
$\sin(x)\cos(y); (0, 0) @tangent$
```
Tangent plane to egg-carton at origin. Since $f_x(0,0) = \cos(0)\cos(0) = 1$ and $f_y(0,0) = -\sin(0)\sin(0) = 0$, the plane is $z = x$ — a tilted plane through the origin.

```
$x^2 - y^2; (1, 0) @tangent$
```
Saddle surface tangent at $(1,0)$. The tangent plane at a saddle point is not flat — it intersects the surface along two lines, which is visible if you look closely at the rendering.

```
$\sqrt{x^2 + y^2}; (3, 4) @tangent$
```
Cone surface. The partial derivatives are $f_x = x/\sqrt{x^2+y^2}$ and $f_y = y/\sqrt{x^2+y^2}$. At $(3,4)$ the surface value is $5$ and the tangent plane has a well-defined normal.

### Visualization Tips

- The tangent plane should appear to "kiss" the surface at the point — it lies flat against the surface locally.
- Where the surface has high curvature, the tangent plane departs rapidly from the surface as you move away from the point.
- At a critical point (local max, min, or saddle), the tangent plane is horizontal ($f_x = f_y = 0$).

---

## Region Shading (`@region`)

### What Is Region Shading?

Region shading fills the area between two curves, making it easy to visualize the domain of a double integral or an area calculation. Setting up integration limits correctly is often the hardest part of multivariable calculus — seeing the region graphically eliminates ambiguity about which curve is "on top" and where the curves intersect.

**Engineering relevance:**
- **Double Integrals:** $\iint_R f(x,y)\, dA$ requires knowing $R$. Visualizing $R$ before computing saves errors in limit-setting.
- **Fluid Mechanics / Hydrostatics:** Cross-sectional areas of flow passages, submerged surfaces, pressure distribution integrals.
- **Structural:** Moment of inertia calculations $I = \iint_R y^2\, dA$ over cross-sectional regions.
- **Thermodynamics:** Work computed as area under a $P$-$V$ curve — the region between process curve and axis.

### Syntax

```
$y = x^2; y = 2x + 1 @region$
```
Shades the area between the parabola $y = x^2$ and the line $y = 2x+1$. Boundary curves drawn on top. Find intersections: $x^2 = 2x+1 \Rightarrow x = 1 \pm \sqrt{2}$.

```
$y = \sin(x); y = 0 @region$
```
Area between sine curve and x-axis. Over $[0, \pi]$ this is the classic $\int_0^\pi \sin(x)\, dx = 2$.

```
$y = \sqrt{x}; y = x^2 @region$
```
Region between $y = \sqrt{x}$ and $y = x^2$ over $[0,1]$. The square root curve is above the parabola on this interval — verify visually before integrating.

```
$y = e^x; y = x + 2 @region$
```
Region between exponential and a line. Useful for setting up $\int_a^b [(x+2) - e^x]\, dx$ when studying bounded areas.

### Visualization Tips

- The shaded region directly tells you the order of integration and the direction of inequality.
- Identify intersection points visually before computing them algebraically — confirms you have the right number of pieces.
- For type I (vertical slices) vs type II (horizontal slices) integration, the shape of the region tells you which is simpler to set up.

---

## Parametric Curves: 2D and 3D

### What Are Parametric Curves?

A parametric curve traces a path through space as a parameter $t$ varies. Instead of $y = f(x)$ (which fails for curves that loop back), you write $\mathbf{r}(t) = \langle x(t), y(t) \rangle$ or $\langle x(t), y(t), z(t) \rangle$.

The parameter $t$ usually represents time, arc length, or angle. The velocity vector $\mathbf{r}'(t) = \langle x'(t), y'(t), z'(t) \rangle$ is always tangent to the curve.

**Engineering relevance:**
- **Kinematics:** Position of a particle or robot end-effector as a function of time. $\mathbf{r}(t)$ is the trajectory.
- **CNC / Path Planning:** Tool paths for machining are parametric curves.
- **Structural:** Curved beam geometries, arch shapes (catenary, cycloid).
- **Fluid Mechanics:** Streamlines are parametric curves tangent to the velocity field.
- **Electromagnetism:** Particle trajectories in electric/magnetic fields.

**Frenet frame intuition:** At every point on a smooth 3D curve, three orthogonal vectors describe the local geometry:
- $\hat{T}$: unit tangent (direction of travel)
- $\hat{N}$: unit normal (toward which the curve turns)
- $\hat{B} = \hat{T} \times \hat{N}$: binormal (perpendicular to the plane of curvature)

Curvature $\kappa$ measures how fast the curve bends; torsion $\tau$ measures how fast it twists out of the plane.

### 2D Parametric Curves

```
$(\cos(t), \sin(t)) @plot2d$
```
Unit circle. $t \in [-2\pi, 2\pi]$. Velocity: $\mathbf{r}'(t) = \langle -\sin t, \cos t \rangle$ — always perpendicular to position, confirming circular motion.

```
$(\cos(t), \sin(2t)) @plot2d$
```
Lissajous figure. The ratio of frequencies (here 1:2) determines the shape. These appear in vibration analysis as phase portraits of two coupled oscillators.

```
$(t - \sin(t), 1 - \cos(t)) @plot2d$
```
Cycloid — the path traced by a point on the rim of a rolling circle. Famous in brachistochrone problem (fastest descent under gravity). The cusps occur when the point touches the ground ($t = 0, 2\pi, ...$).

```
$(e^{0.1 t} \cos(t), e^{0.1 t} \sin(t)) @plot2d$
```
Archimedean/logarithmic spiral. Appears in gear profiles, drill-bit geometries, and galaxy arms.

### 3D Parametric Curves

```
$(\cos(t), \sin(t), t/3) @plot3d$
```
Circular helix. Radius 1, pitch $1/3$ per radian. The tangent vector $\mathbf{r}'(t) = \langle -\sin t, \cos t, 1/3 \rangle$ has constant magnitude — the curve has constant curvature and constant torsion. Think: coil spring, DNA strand, helical antenna.

```
$(\cos(t), \sin(t), \sin(2t)) @plot3d$
```
Trefoil-style curve. The z-component oscillates twice per revolution, giving a figure-8 cross-section when projected onto the xz-plane.

```
$(t, t^2, t^3) @plot3d$
```
Twisted cubic — the canonical example of a space curve that is not planar. The projections onto xy, xz, and yz planes are a parabola, cubic, and semicubic parabola respectively.

```
$(\cos(t), \sin(t), t) @plot3d$
```
Standard helix, full pitch. Compare with `t/3` version to see how pitch changes slope.

---

## Implicit Surfaces in 3D

### What Is an Implicit Surface?

An implicit surface is defined by $F(x, y, z) = c$ rather than $z = f(x, y)$. The surface is the set of all $(x,y,z)$ satisfying the equation — a level surface of the function $F$ in 3D space. Rendered via marching cubes algorithm.

**Engineering relevance:**
- **Constraint surfaces:** In optimization, equality constraints $g(x,y,z) = 0$ define feasible regions — these are implicit surfaces.
- **Quadric surfaces:** All conic sections generalize to 3D as quadrics (ellipsoids, hyperboloids, paraboloids, cones). These appear in antenna design, optics, pressure vessels, and stress ellipsoids.
- **Level surfaces in scalar fields:** In thermodynamics, isothermal surfaces $T(x,y,z) = T_0$ in a 3D temperature field are implicit surfaces.

### Quadric Surface Taxonomy

All quadric surfaces follow the form $\frac{x^2}{a^2} + \frac{y^2}{b^2} + \frac{z^2}{c^2} = 1$ (with sign variations):

**Ellipsoid** — all three signs positive, equals 1:
```
$\frac{x^2}{4} + \frac{y^2}{9} + z^2 = 1 @plot3d$
```
Egg-shaped closed surface. Special case $a=b=c$: sphere. Appears in stress ellipsoids, inertia ellipsoids, diffusion ellipsoids.

**Sphere:**
```
$x^2 + y^2 + z^2 = 9 @plot3d$
```
Radius 3. The simplest implicit surface. Every point is distance 3 from origin.

**Elliptic Paraboloid** — one variable linear in $z$:
```
$z = x^2 + y^2 @plot3d$
```
Bowl opening upward. Has a global minimum at origin. Cross-sections parallel to xy-plane are circles; parallel to xz or yz are parabolas.

**Hyperbolic Paraboloid** (saddle):
```
$z = x^2 - y^2 @plot3d$
```
Saddle shape. Cross-sections parallel to xy-plane are hyperbolas; parallel to xz/yz are parabolas. Appears in saddle roof architecture and in the second derivative test failure case.

**Hyperboloid of One Sheet** — middle sign negative:
```
$x^2 + y^2 - z^2 = 1 @plot3d$
```
Waist-shaped, connected surface. Cross-sections at constant $z$ are circles (or ellipses). Appears in cooling tower shapes and ruled surfaces in structural engineering.

**Hyperboloid of Two Sheets** — $z^2$ dominates:
```
$z^2 - x^2 - y^2 = 1 @plot3d$
```
Two disconnected bowls opening up and down. The "gap" around the origin is characteristic.

**Elliptic Cone:**
```
$x^2 + y^2 - z^2 = 0 @plot3d$
```
Double cone with apex at origin. The boundary case between one-sheet and two-sheet hyperboloid.

**Cylinder** (no $z$ term):
```
$x^2 + y^2 = 4 @plot3d$
```
Infinite circular cylinder of radius 2. The absence of $z$ means the surface extends infinitely in the $z$-direction — any point $(x,y)$ on the circle generates the full vertical line.

### Visualization Tips

- To classify a quadric surface: count how many variables are squared, and check whether the squared terms all have the same sign.
- The marching cubes algorithm may show slight faceting on smooth surfaces — zoom out for a better sense of global shape.
- Overlay with a point `$(a,b,c) @plot3d$` to check a specific point on or near the surface.

---

## Interaction

### 2D Graphs
- **Scroll** to zoom (anchored at cursor)
- **Drag** to pan
- **Hover** for nearest-curve coordinates with crosshair snapping
- **Double-click** or press **0** to reset view
- **+/-** keys to zoom in/out
- Grid toggle button (top-right): All / Major / None
- POI toggle button: Show/hide points of interest (roots, extrema, intersections)

### 3D Graphs
- **Click** to enter interactive mode (static snapshot by default)
- **Drag** to rotate (OrbitControls)
- **Scroll** to zoom (rescales math ranges)
- **Double-click** to reset
- **Hover** for 3D coordinate tooltip on surfaces
- Expression labels overlay (top-left)

---

## Graph Inspector

Open via Command Palette: **King's CalcLatex: Open Graph Inspector**

Shows details for the currently rendered graph:
- Expression LaTeX
- Plot mode and type classification
- Diagnostics (info/warning/error)
- PlotSpec data

---

## Settings

Open Obsidian Settings → King's CalcLatex:

| Setting | Default | Description |
|:--------|:--------|:------------|
| Default 2D Range | [-10, 10] | Default x/y range for 2D graphs |
| Default 3D Range | [-5, 5] | Default x/y/z range for 3D graphs |
| Numeric Precision | 12 | Decimal places for `\approx` mode |
| Auto Range | On | Automatically determine viewport from expression |
| Graph Theme | Auto | Light/dark follows Obsidian theme |
| 3D Zoom Mode | Origin | Zoom anchored at origin vs range center |
| Show POIs | On | Points of interest on 2D graphs |
| Default Vector Arrow Scale | 1.0 | Default arrow size for `@vecfield` (overridden per-expression by suffix) |

---

## Test Equations

Quick copy-paste tests to verify everything works:

### Evaluation
- `$2+3=$`
- `$\sin(\pi/4) \approx$`
- `$x^2 + 2x + 1 \equiv$`

### CAS / Symbolic
- `$x^3 + 2x @diff$` — derivative → 3x² + 2
- `$3x^2 + 2 @int$` — integral → x³ + 2x
- `$x^2 y + y^3 @px$` — ∂/∂x → 2xy
- `$x^2 y + y^3 @py$` — ∂/∂y → x² + 3y²
- `$x^2 + y^2 @grad$` — gradient → (2x, 2y)
- `$z = x^2 + y^2 @normal$` — surface normal → (2x, 2y, -1)
- `$x^2 - 4 = 0 @solve$` — solve → x = ±2
- `$x^2 + 3x + 2 @factor$` — factor → (x+1)(x+2)

### 2D
- `$y = \sin(x) @plot2d$`
- `$x^2 + y^2 = 25 @plot2d$`
- `$y > \sin(x) @plot2d$`
- `$(5,5) @plot2d$`
- `$y = \sin(x); y = \cos(x) @plot2d$`

### 3D
- `$z = x^2 + y^2 @plot3d$`
- `$x^2 + y^2 + z^2 = 9 @plot3d$`
- `$(\cos(t), \sin(t), t/3) @plot3d$`
- `$\langle 1,2,3 \rangle @plot3d$`
- `$(1,2,3) @plot3d$`

### Calc 3 Features
- `$x^2 + y^2 @contour$`
- `$-y; x @vecfield$`
- `$x^2 + y^2 @gradient$`
- `$x^2 + y^2; (1,1) @tangent$`
- `$y = x^2; y = 2x + 1 @region$`

### Geometry
- `$\langle 1,2,3 \rangle @geom$`

---

## Calc 3 Study Guide

Suggested equation sequences for studying specific topics. Type each into a fresh note cell and observe the visualization progression.

---

### Partial Derivatives and Tangent Planes

Start with a surface, then examine its tangent planes at different points to build intuition for partial derivatives.

1. Visualize the surface:
   `$z = x^2 + y^2 @plot3d$`

2. Contour map to see level curves:
   `$x^2 + y^2 @contour$`

3. Tangent plane at a generic point — inspect the tilt:
   `$x^2 + y^2; (1, 1) @tangent$`

4. Tangent plane at the vertex — should be flat ($f_x = f_y = 0$):
   `$x^2 + y^2; (0, 0) @tangent$`

5. Now try a saddle — tangent plane at the saddle point:
   `$x^2 - y^2; (0, 0) @tangent$`

6. Tangent plane away from the saddle:
   `$x^2 - y^2; (2, 1) @tangent$`

Key questions: Does the tangent plane "look flat" at a critical point? Does it tilt more steeply as you move to a point with larger partial derivatives?

---

### Gradient and Directional Derivatives

1. Gradient of a paraboloid — arrows point radially outward:
   `$x^2 + y^2 @gradient$`

2. Gradient of a linear function — constant direction everywhere:
   `$3x + 2y @gradient$`

3. Gradient at a saddle — zero at origin, opposite directions along axes:
   `$x^2 - y^2 @gradient$`

4. Gradient of a wavy function — complex pattern with multiple critical points:
   `$\sin(x)\cos(y) @gradient$`

5. Compare gradient to the raw contour map — confirm perpendicularity:
   `$\sin(x)\cos(y) @contour$`

Key observation: In step 5, every gradient arrow should be perpendicular to the contour line it originates from. If you can see this clearly, you understand the gradient theorem geometrically.

**Directional derivative formula:** $D_{\hat{u}} f(a,b) = \nabla f(a,b) \cdot \hat{u}$. It is maximized when $\hat{u}$ is parallel to $\nabla f$ — hence "steepest ascent."

---

### Double and Triple Integral Regions

1. Simple region between a parabola and a line:
   `$y = x^2; y = 2x @region$`
   Intersection points: $x^2 = 2x \Rightarrow x = 0,\, x = 2$. Integral: $\int_0^2 \int_{x^2}^{2x} f\, dy\, dx$.

2. Trigonometric bounded region:
   `$y = \sin(x); y = 0 @region$`
   Classic: $\int_0^\pi \sin(x)\, dx = 2$.

3. Region between two parabolas:
   `$y = \sqrt{x}; y = x^2 @region$`
   Intersect at $(0,0)$ and $(1,1)$. On $[0,1]$, $\sqrt{x} \geq x^2$. Type I: $\int_0^1 \int_{x^2}^{\sqrt{x}} dy\, dx$.

4. Circular region (use implicit plot):
   `$x^2 + y^2 = 4 @plot2d$`
   Reminder that polar coordinates simplify this: $\int_0^{2\pi} \int_0^2 f(r,\theta)\, r\, dr\, d\theta$.

5. 3D domain visualization — surface over region:
   `$z = x^2 + y^2 @plot3d$`
   Then `$z = 4 @plot3d$` to see where the horizontal plane intersects the paraboloid — this defines a triple integral domain.

---

### Vector Fields and Line Integrals (Conceptual)

A line integral $\int_C \mathbf{F} \cdot d\mathbf{r}$ measures the total "work" done by field $\mathbf{F}$ along curve $C$. Visualize both the field and the path together.

1. Pure rotation field (zero work for any closed loop):
   `$-y; x @vecfield$`
   This field has zero divergence and nonzero curl. A particle moving with the flow does no net work around a closed orbit.

2. Conservative field (work depends only on endpoints):
   `$y; x @vecfield$`
   This is $\nabla(xy)$ — a gradient field. The line integral around any closed curve is zero.

3. Source field:
   `$x; y @vecfield$`
   Positive divergence everywhere. Analogous to a fluid source at the origin.

4. Sink field:
   `$-x; -y @vecfield$`
   Negative divergence everywhere.

5. Overlay a parametric path with a field — manually place them in the same cell:
   `$-y; x @vecfield$` then `$(\cos(t), \sin(t)) @plot2d$`
   The circular path follows the arrows exactly — the vector field is tangent to the circle everywhere. Work is maximized.

**Conservative test:** $\mathbf{F} = \langle P, Q \rangle$ is conservative if and only if $\frac{\partial Q}{\partial x} = \frac{\partial P}{\partial y}$ (in a simply connected domain).

---

### Surface Classification (Quadric Surfaces)

Work through these in order to build pattern recognition:

1. Sphere:
   `$x^2 + y^2 + z^2 = 4 @plot3d$`
   All signs equal, right-hand side positive. Closed, symmetric.

2. Ellipsoid (stretched sphere):
   `$\frac{x^2}{4} + y^2 + \frac{z^2}{9} = 1 @plot3d$`
   Different denominators give different radii in each axis direction.

3. Elliptic paraboloid (bowl):
   `$z = x^2 + y^2 @plot3d$`
   One variable is linear (not squared). Opens upward. No upper bound.

4. Hyperbolic paraboloid (saddle):
   `$z = x^2 - y^2 @plot3d$`
   Mixed signs on the squared terms. No closed cross-sections.

5. Hyperboloid of one sheet (cooling tower):
   `$x^2 + y^2 - z^2 = 1 @plot3d$`
   Two positive, one negative. Connected. Minimum circular cross-section at $z=0$ ("waist").

6. Hyperboloid of two sheets (two bowls):
   `$z^2 - x^2 - y^2 = 1 @plot3d$`
   One positive, two negative. Disconnected. Gap around origin.

7. Cone (boundary between hyperboloids):
   `$x^2 + y^2 = z^2 @plot3d$`
   Right-hand side is zero — the cone is the degenerate case where the hyperboloid "collapses."

**Identification rule:** Write the equation as $\pm\frac{x^2}{a^2} \pm \frac{y^2}{b^2} \pm \frac{z^2}{c^2} = k$ and count signs:
- All same sign, $k > 0$: ellipsoid
- Two same sign, one opposite, $k > 0$: hyperboloid of one sheet
- One sign, two opposite, $k > 0$: hyperboloid of two sheets
- All same sign, $k = 0$: single point (degenerate)
- Mixed, $k = 0$: cone
- One variable not squared: paraboloid (elliptic if other two same sign, hyperbolic if opposite)

---

### Symbolic CAS Workflow: From Surface to Normal

Walk through the full symbolic pipeline for a surface — partials, gradient, normal, tangent plane.

1. Define the surface and visualize it:
   `$z = x^2 + y^2 @plot3d$`

2. Compute partial derivatives symbolically:
   `$x^2 + y^2 @px$`       → 2x
   `$x^2 + y^2 @py$`       → 2y

3. Compute the gradient:
   `$x^2 + y^2 @grad$`     → ∇f = (2x, 2y)

4. Verify gradient visually — arrows should be perpendicular to contours:
   `$x^2 + y^2 @gradient$`

5. Compute the surface normal:
   `$z = x^2 + y^2 @normal$` → n = (2x, 2y, -1)

6. Visualize the tangent plane at a specific point:
   `$x^2 + y^2; (1, 1) @tangent$`

**Key insight:** The gradient `@grad` gives you the 2D direction of steepest ascent on the surface. The normal `@normal` gives you the 3D vector perpendicular to the surface itself. At point $(1,1)$: $\nabla f = (2, 2)$ points away from origin in xy-plane, while $\vec{n} = (2, 2, -1)$ tilts downward in 3D.

---

### Symbolic CAS Workflow: Implicit Surfaces

For implicit surfaces $F(x,y,z) = 0$, the normal is simply the gradient of $F$.

1. Visualize a sphere:
   `$x^2 + y^2 + z^2 = 9 @plot3d$`

2. Compute its normal:
   `$x^2 + y^2 + z^2 = 9 @normal$` → n = (2x, 2y, 2z)

   On the sphere surface, this always points radially outward — as expected.

3. Try a hyperboloid:
   `$x^2 + y^2 - z^2 = 1 @plot3d$`
   `$x^2 + y^2 - z^2 = 1 @normal$` → n = (2x, 2y, -2z)

   The z-component sign flip reflects the "waist" geometry.

4. Partial derivative check — each component independently:
   `$x^2 + y^2 - z^2 @px$` → 2x
   `$x^2 + y^2 - z^2 @py$` → 2y
   `$x^2 + y^2 - z^2 @pz$` → -2z

---

### Derivatives and Integration Practice

Build intuition by computing derivatives and verifying with plots.

1. Derivative of a polynomial:
   `$x^3 - 3x @diff$`      → 3x² - 3
   `$y = x^3 - 3x @plot2d$` — visualize the original
   `$y = 3x^2 - 3 @plot2d$` — the derivative: zeros at x = ±1 are the extrema of the original

2. Derivative of trig:
   `$\sin(x) @diff$`        → cos(x)
   `$\cos(x) @diff$`        → -sin(x)

3. Chain rule:
   `$\sin(x^2) @diff$`      → 2x·cos(x²)
   `$e^{-x^2} @diff$`       → -2x·e^{-x²} (Gaussian derivative)

4. Integration as inverse:
   `$3x^2 - 3 @int$`        → x³ - 3x (recovers the original from step 1)
