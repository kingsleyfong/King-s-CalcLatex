# Kings CalcLaTeX

A **browser-native** Obsidian plugin that turns your vault into an engineering math workstation. Type LaTeX with trigger suffixes, and results or interactive graphs appear inline in your notes — no backend server, no external dependencies. It also extends into **Excalidraw**: canvas text auto-renders into equation images, and the full LaTeX Suite snippet engine (tabstops, auto-fraction, Greek letters, conceal, bracket coloring) works both in Markdown notes and inside Excalidraw's own "Edit LaTeX" modal.

## Features

### Inline Evaluation
Type LaTeX inside `$...$` and add a trigger suffix:

| Input | Output |
|:------|:-------|
| `$2 + 3 =$` | `5` |
| `$\sin(\pi/4) \approx$` | `0.707106781187` |
| `$x^2 + 2x + 1 \equiv$` | `(x+1)^2` |
| `$\int_0^{\pi} \sin(x)\,dx =$` | `2` |
| `$\sum_{n=1}^{10} n^2 =$` | `385` |
| `$\prod_{k=1}^{5} k =$` | `120` |

### Symbolic CAS
Differentiation, integration, solving, factoring — all in-browser.

```
$x^3 + 2x @diff$               → 3x² + 2
$3x^2 + 2 @int$                → x³ + 2x
$x^2 - 4 = 0 @solve$           → x = ±2
$x^2 - 5x + 6 @factor$         → (x-2)(x-3)
$x^3 - 8 @factor$              → (x-2)(x²+2x+4)
```

Factoring handles sum/difference of cubes and additional trig identities in simplification.

### Advanced CAS (Giac WASM)
Optional 19MB WASM engine for limits, Taylor series, partial fractions, expand, step-by-step solutions, and enhanced solving/integration.

```
$\frac{\sin(x)}{x} @limit$     → 1
$e^x @taylor$                  → 1 + x + x²/2 + x³/6 + ...
$\frac{1}{x^2-1} @partfrac$    → partial fraction decomposition
$(x+1)^3 @expand$              → x³ + 3x² + 3x + 1
$x^2 - 5x + 6 @steps$         → step-by-step solution walkthrough
```

### 2D Graphing
Explicit, implicit, parametric, polar curves, inequalities, and multi-equation overlays with interactive pan/zoom. Download any graph as PNG via the toolbar.

```
$y = \sin(x) @plot2d$
$x^2 + y^2 = 25 @plot2d$
$r = 1 + \cos(\theta) @plot2d$
$y > \sin(x) @plot2d$
$y = a\sin(bx) @plot2d$          ← auto-generates sliders for a, b
$(5,5) @plot2d$                  ← renders as filled dot
$y = \begin{cases} x^2 & x > 0 \\ -x & x \leq 0 \end{cases} @plot2d$
$y = \sin(x) \{0 < x < 2\pi\} @plot2d$
```

Free variables auto-generate sliders with editable min/max bounds.

### 3D Graphing
WebGL surfaces, implicit surfaces (marching cubes), parametric curves, vectors, and points with click-to-interact rotation. All three axes use 1:1:1 proportional scaling by default (consistent with Desmos/GeoGebra behavior). Analytical planes fill the full bounding box with no diamond artifacts. Explicit surfaces use height-based coloring (blue-to-red gradient by z-value) for Desmos-style visualization.

```
$z = x^2 + y^2 @plot3d$
$x^2 + y^2 + z^2 = 9 @plot3d$
$(\cos(t), \sin(t), t/3) @plot3d$
$\langle 1, 2, 3 \rangle @plot3d$
$(1,2,3) @plot3d$                ← renders as sphere
```

### Multivariable Calculus
Partial derivatives, gradients with contour overlays, surface normals, tangent planes.

```
$x^2 y + y^3 @px$              → 2xy
$x^2 + y^2 @gradient$          → ∇f = (2x, 2y) with contour + arrow plot
$z = x^2 + y^2 @normal$        → n = (2x, 2y, -1)
$x^2 + y^2; (1,1) @tangent$    → tangent plane visualization
```

### Linear Algebra
Matrix multiplication, determinants, transpose, inverse, cross product, dot product.

```
$\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix}\begin{pmatrix}5 & 6\\7 & 8\end{pmatrix} =$
$\det\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix} =$
$\begin{pmatrix}1 & 0 & 0\end{pmatrix}\times\begin{pmatrix}0 & 1 & 0\end{pmatrix} =$
```

### ODE Phase Portraits
Solve first-order ODEs numerically — direction field + solution curves via RK4.

```
$y' = x - y @phase$            → direction field + solution curves
$y' = y(1-y) @ode$             → direction field only
```

### Laplace Transforms (Giac WASM)

```
$t^2 @laplace$                 → 2/s³
$\frac{1}{s^2+1} @ilaplace$   → sin(t)
```

### Per-Expression Colors & Line Styles

```
$y = \sin(x) #red; y = \cos(x) #blue @plot2d$
$y = x^2 --; y = -x .. @plot2d$    ← dashed and dotted
```

### Vector Fields & Contour Plots

```
$-y; x @vecfield$              → rotation field
$x^2 + y^2 @contour$           → concentric contour lines
$y = x^2; y = 2x @region$      → shaded region between curves
```

### Unit Conversion

```
$5\text{ft} \to \text{m} @convert$     → 1.524 m
$100\text{kg} \to \text{lb} @convert$   → 220.462 lb
```

### LaTeX Suite Snippet Engine (Markdown Notes)
The full [LaTeX Suite](https://github.com/artisticat1/obsidian-latex-suite) snippet-expansion engine is vendored directly into the editor — no separate plugin required. Inside any `$...$`/`$$...$$` block:

```
mk           → $ | $                (inline math block, cursor in the middle)
dm           → $$ | $$              (display math block, cursor in the middle)
sr           → ^2                   (superscript squared)
sq           → \sqrt{ }             (square root, cursor inside)
fra          → \frac{ }{ }          (fraction, cursor in numerator)
pmat         → \begin{pmatrix} ... \end{pmatrix}
```

Tab jumps between tabstops after a snippet expands. Also included: Greek-letter and symbol shortcuts, matrix-environment shortcuts, `tabout` (Tab exits the current bracket/subscript at the end of an expression), concealed LaTeX commands (rendered as their symbol until the cursor is nearby), color-matched/highlighted bracket pairs, and a hover math-preview tooltip. Every knob (custom snippets, trigger characters, regex snippets, conceal timing, bracket coloring, etc.) is configurable under **Settings → LaTeX Suite Features**.

### Excalidraw OD (On-Demand Math Companion)
Turns Excalidraw canvases into a math-aware surface, entirely through this plugin (no changes to Excalidraw itself). Enable/configure under **Settings → Excalidraw OD Features**.

- **Auto-render on blur**: type `$x^2 + 1$` or `$$...$$` into a canvas text element and click away — it's automatically replaced with a rendered LaTeX equation image (MathJax SVG), the same as pasting/creating a math element directly.
- **Same real snippet engine, on canvas too**: the identical LaTeX Suite engine used in Markdown notes (see above) also drives Excalidraw's text-editing overlays and its native **"Edit LaTeX"** equation-editor modal — snippets, tabstops, auto-fraction, matrix shortcuts, conceal, and bracket coloring all work identically in both places.
- **Enhanced "Edit LaTeX" modal**:
  - Live rendered MathJax preview as you type (Excalidraw's own modal doesn't include one).
  - Inline **color picker** (`\color{...}`) and a **border/box panel** (`\bbox[...]{...}`) for quickly styling an equation without hand-writing the LaTeX.
  - Configurable cursor start position (end of equation by default, so continuing/appending doesn't require a manual click — or start, if you prefer).
  - Configurable modal window position (bottom/top/center/near cursor).
  - The modal is width-capped to the Excalidraw pane it was opened from (won't overflow into a split-screen neighbor), and long equations pan horizontally to keep the cursor in view instead of clipping off-screen.
  - Quick-open shortcut on a selected equation element (default **Ctrl + L**, configurable modifier/key).
- **Element styling shortcuts**: with elements selected, left-hand keyboard shortcuts cycle common style properties without touching the mouse — default **Shift + F** (line style: solid/dashed/dotted), **Shift + D** (stroke width), **Shift + X** (edge roundness), **Shift + Q** (sloppiness/roughness). A number key (`1`–`4`) picks a specific variant directly, and a floating HUD shows the active options. All trigger keys and the modifier are configurable.
- **Text underline toggle**: adds an underline button directly into Excalidraw's own text-properties panel when a text element is selected.

## All Triggers

| Trigger | Category | Description |
|:--------|:---------|:------------|
| `=` | Eval | Exact symbolic result |
| `\approx` | Eval | Decimal approximation |
| `\equiv` | Eval | Algebraic simplification |
| `@diff` | CAS | Derivative |
| `@int` | CAS | Integral |
| `@solve` | CAS | Solve equation |
| `@factor` | CAS | Factor polynomial |
| `@expand` | CAS (Giac) | Expand expression |
| `@limit` | CAS (Giac) | Compute limit |
| `@taylor` | CAS (Giac) | Taylor series |
| `@partfrac` | CAS (Giac) | Partial fractions |
| `@steps` | CAS (Giac) | Step-by-step solution |
| `@px` / `@py` / `@pz` | CAS | Partial derivatives |
| `@grad` | CAS | Gradient vector |
| `@normal` | CAS | Surface normal |
| `@convert` | Units | Unit conversion |
| `@plot2d` | Graph | 2D plot |
| `@plot3d` | Graph | 3D plot |
| `@contour` | Graph | Contour map |
| `@vecfield` | Graph | Vector field |
| `@gradient` | Graph | Gradient + contour overlay |
| `@tangent` | Graph | Tangent plane |
| `@region` | Graph | Shaded region |
| `@phase` | Graph | ODE phase portrait |
| `@ode` | Graph | ODE direction field |
| `@geom` | Graph | Geometry mode |
| `@laplace` | CAS (Giac) | Laplace transform |
| `@ilaplace` | CAS (Giac) | Inverse Laplace |

## Installation

### From Community Plugins (recommended)
1. Open **Settings > Community Plugins > Browse**
2. Search for "Kings CalcLaTeX"
3. Click **Install**, then **Enable**

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/kingsleyfong/King-s-CalcLatex/releases)
2. Create folder `.obsidian/plugins/kings-calclatex/`
3. Place the three files inside
4. Reload Obsidian and enable the plugin in Settings

Excalidraw OD features require the [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) community plugin to also be installed and enabled — they're inert without it.

### Enabling Giac WASM (optional)
For advanced CAS operations (`@limit`, `@taylor`, `@partfrac`, `@expand`, `@steps`, enhanced `@solve`/`@int`):
1. Download `giacwasm.js` (~19 MB) from [Giac WASM builds](https://www-fourier.univ-grenoble-alpes.fr/~parMDisse/giac/giac_online/giacwasm.js)
2. Place it in `.obsidian/plugins/kings-calclatex/giacwasm.js`
3. Enable "Giac WASM" in plugin settings
4. Reload Obsidian — look for "Giac WASM initialized" in console

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| CAS / Parsing | [CortexJS Compute Engine](https://cortexjs.io/compute-engine/) |
| Advanced CAS | [Giac WASM](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html) (optional) |
| Numeric | [math.js](https://mathjs.org/) |
| 2D Rendering | [function-plot](https://mauriciopoppe.github.io/function-plot/) (D3-based, interval arithmetic) |
| 3D Rendering | [Three.js](https://threejs.org/) (WebGL) |
| Editor Integration | CodeMirror 6 StateField decorations |
| Snippet Engine | Vendored [LaTeX Suite](https://github.com/artisticat1/obsidian-latex-suite) CM6 extensions — shared between Markdown notes and Excalidraw's "Edit LaTeX" modal |
| Equation Rendering | [MathJax](https://www.mathjax.org/) (Obsidian's built-in renderer) — used for Excalidraw's canvas equation images and modal live preview |
| Canvas Integration | [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) / ExcalidrawAutomate (required for all Excalidraw OD features) |

## Settings

Settings are organized into three sections:

**1. Markdown Note Features** — evaluation/graphing behavior in `.md` files:

| Setting | Default | Description |
|:--------|:--------|:------------|
| 2D Default Range | [-10, 10] | x/y axis range for 2D graphs |
| 3D Default Range | [-5, 5] | x/y/z range for 3D graphs |
| Numeric Precision | 12 | Decimal places for `\approx` |
| Auto Range | On | Smart viewport from expression |
| Graph Theme | Auto | Follows Obsidian light/dark |
| Show POIs | On | Roots, extrema on 2D graphs |
| 3D Axis Ticks | On | Tick marks on 3D axes |
| 3D Zoom Mode | origin | Zoom target: `origin` keeps world origin fixed; `range-center` zooms toward viewport center |
| 2D Curves on 3D | curtain | How 2D curves are lifted into 3D: `curtain` extrudes a vertical sheet, `plane-curve` draws the curve flat on a plane |
| Auto-Scale Z (3D) | Off | All three axes use 1:1:1 proportional scaling by default. Enable to auto-fit Z axis to surface range. |
| Vector Arrow Scale | 1.0 | Arrow size for `@vecfield` |
| Giac WASM | On | Enable advanced CAS engine |

**2. Excalidraw OD Features** — canvas math companion (see above): modal position/cursor behavior, snippet/preview toggles, the "Edit LaTeX" quick-open shortcut, and the element-styling shortcut keys/modifier/HUD toggle.

**3. LaTeX Suite Features** — snippet engine behavior (applies to both Markdown notes and Excalidraw): inline/display math triggers, tabstop navigation, auto-fraction, matrix shortcuts, conceal, bracket coloring/highlighting, math-preview tooltip, custom/regex snippets, and related fine-tuning.

There are ~70 individual settings across these sections — open **Settings → Kings CalcLaTeX** in Obsidian for the full, current list with descriptions; this README covers the highlights.

## Development

```bash
git clone https://github.com/kingsleyfong/King-s-CalcLatex.git
cd repo-v2
npm install
npm run dev     # Watch mode
npm run build   # Production build
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

## License

[MIT](LICENSE)
