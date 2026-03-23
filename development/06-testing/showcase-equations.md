# Testing Strategy

## Showcase Equations (Manual Verification)

### 2D Explicit
- `y = x^2 @plot2d` — Parabola
- `y = \sin(x) @plot2d` — Sine wave
- `y = \frac{1}{x} @plot2d` — Hyperbola (should handle asymptotes)

### 2D Implicit
- `x^2 + y^2 = 25 @plot2d` — Circle
- `(x^2 + y^2 - 1)^3 - x^2y^3 = 0 @plot2d` — 2D Heart
- `(x^2 + y^2)^2 - 50(x^2 - y^2) - 100 = 0 @plot2d` — Cassini Oval
- `\sin(x) + \cos(y) = \sin(xy) @plot2d` — Interference pattern

### 3D Explicit
- `z = x^2 - y^2 @plot3d` — Saddle surface
- `z = \sin(x) \cdot \cos(y) @plot3d` — Wavy surface

### 3D Implicit
- `x^2 + y^2 + z^2 = 9 @plot3d` — Sphere
- `(5 - \sqrt{x^2 + y^2})^2 + z^2 = 4 @plot3d` — Torus
- `x^4 - 5x^2 + y^4 - 5y^2 + z^4 - 5z^2 + 11.8 = 0 @plot3d` — Tangle Cube

### CAS Evaluation
- `\int_{0}^{1} x^2 dx =` → `\frac{1}{3}`
- `\frac{d}{dx} x^3 =` → `3x^2`
- `\solve x^2 - 5x + 6 = 0` → `x = 2, x = 3`
- `\det \begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix} =` → `-2`

### Unit Conversions
- `5 \text{kg} @convert \text{lb}` → `11.023 lb`
- `100 \text{°C} @convert \text{°F}` → `212 °F`
