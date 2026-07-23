# Changelog

All notable changes to **King's CalcLatex** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.0] - 2026-07-22

### Added
- **Full LaTeX Suite settings parity**: exposed ~25 upstream settings that previously had no UI control at all (concealment/reveal timeout, paired-bracket coloring, cursor bracket highlighting, math preview + position/cursor glyph/bracket highlighting, matrix shortcut environment/macro names, tabout EOL/closing symbols, auto-enlarge brackets + space + triggers, word delimiters, force-math languages, snippet debug verbosity, IME suppression, whitespace cleanup, `$`-pair auto-delete, snippet recursion), grouped into 7 sub-sections under **LaTeX Suite Features**.
- Added a UI toggle for **Enable Regex Snippets** (existed as a setting with no control since an earlier release).
- Added `.github/workflows/ci.yml`: typecheck + build validation on every push/PR to `main`.

### Fixed
- **Most existing LaTeX Suite toggles were decorative** — `provider.ts` built the engine's config from a hardcoded default and read only the master on/off switch, so settings like "Auto-Fraction Expansion" or "Matrix Environment Shortcuts" saved a value but had zero effect on the running engine. All settings now actually drive the engine (see `buildLatexSuiteSettings()`/`buildRawSnippets()` in `src/latex-suite/provider.ts` for the full mapping).
- Custom snippet definitions (`customSnippetsText`) are now actually parsed and merged into the engine, with two layers of fallback so malformed custom JSON can never crash or silently zero the whole snippet engine again.
- Inline/display math mode triggers (`mk`/`dm` by default) are now actually configurable — previously the settings existed but did nothing.

### Known limitation
- Changing a LaTeX Suite setting requires reloading Obsidian (or disabling/re-enabling the plugin) to take effect — no live hot-reload yet. This is not a regression; the existing "Enable Ingested LaTeX Suite Snippet Engine" master toggle already had this limitation.

---

## [3.2.1] - 2026-07-22

### Fixed
- **LaTeX Suite engine was silently registering zero extensions** — the v3.2.0 "verbatim source fork" crashed while parsing the very first default snippet (`mk`) due to a `StringSnippet` field redeclaration colliding with `useDefineForClassFields` (ES2022 target). The crash was swallowed by a `try/catch` in `latex-suite/provider.ts` that returned an empty extension array, so the entire snippet engine did nothing with no error surfaced. All 200 default snippets (`mk`, `dm`, `sr`, `//` autofraction, tabout, matrix shortcuts, conceal, bracket highlighting) now load and expand correctly.
- Fixed `mkConcealPlugin` being called with the full settings object instead of `concealRevealTimeout`.
- Fixed a duplicated `@codemirror/state` dependency (via `@codemirror/commands`) causing type incompatibilities.
- Fixed the production build never actually syncing to the local vault plugin folder (`setTimeout` raced against `process.exit()`).

### Changed
- Restored TypeScript type-checking for the vendored LaTeX Suite source (`tsconfig.json` path mapping was missing, previously causing 140+ false module-resolution errors that made `tsc` unusable for this codebase). LaTeX Suite now typechecks with zero errors.
- Removed 16 dead files left over from an abandoned integration path (`latex-suite/main.ts` and its settings-UI cluster) that were never part of the live extension-loading path.

---

## [3.2.0] - 2026-07-22

### Added
- **Release v3.2.0 — 100% Verbatim Source Fork of Standalone Obsidian LaTeX Suite**: Integrated exact 200+ raw default snippet array, regex evaluation engine, visual mode text replacements (`Shift-U`, `Shift-K`, `Shift-C`, `Shift-S`), fraction `/`, and standalone extension array.

---

## [3.1.0] - 2026-07-22

### Added
- **Release v3.1.0 — Verbatim 1:1 Ingestion of Full Obsidian LaTeX Suite Source Architecture**: Integrated exact `snippetQueuePlugin`, `SnippetChangeSpec`, `expandSnippets`, and `tabstopsStateField` pipeline to guarantee 100% feature parity and zero event loop collisions.

---

## [3.0.0] - 2026-07-21

### Added
- **Major Release v3.0.0 — Official LuaSnip AST & Tabstop Engine Ingestion**: Ingested full, exact source code engine from `artisticat1/obsidian-latex-suite` with `valibot` schema validation, LuaSnip AST node tree (`BaseNode`, `ArrayNode`, `SnippetTabstopOnlyNode`), dynamic `TabstopGroup` sorting ($1, $2, $3 first, $0 last), and exact cursor placement.

---

## [2.3.0] - 2026-07-21

### Added
- **Native LaTeX Suite Ingestion**: Ingested LaTeX Suite snippet engine directly into King's CalcLatex. Provides CodeMirror 6 markdown snippet auto-expansion (`mk`, `dm`, `sr`, `cb`, `fra`, `pmat`, `bmat`, matrices, operators) across both standard `.md` notes and Excalidraw canvas overlays.
- **Section 3 Settings Tab**: Added dedicated settings section **LaTeX Suite Features (Snippets & Fast Math Entry)** with toggle controls for snippet expansion, auto-fractions, and matrix shortcuts.
- **Open-Source Attribution**: Created `ACKNOWLEDGEMENTS.md` and updated `README.md` crediting Gilles Castel & Arturo (LaTeX Suite), Developer-Mike (CalcTex), and Zsviczian (Excalidraw).

---

## [2.2.1] - 2026-07-21

### Fixed
- **Valid MathJax RGBA Background Fills**: Fixed black box rendering bug by formatting `\bbox` background options as valid MathJax RGBA strings (`rgba(254, 202, 87, 0.22)`).
- **Click-Outside Modal Dismissal**: Clicking outside the LaTeX modification modal window on the canvas now automatically dismisses/closes the modal popup.
- **`Ctrl + \` Default Shortcut**: Set default LaTeX equation edit shortcut to `Ctrl + \` with capture phase fallback matching for backslash key.
- **Leaf-Bound Modal Placement**: Modal positioning now measures active Excalidraw tab leaf bounds (`activeLeaf.view.contentEl`), keeping the popup centered at the bottom of the Excalidraw tab in split-screen layouts.
- **GitHub Actions Release CI Workflow**: Corrected artifact copy path (`cp repo-v2/styles.css styles.css`) and added `contents: write` permissions to GitHub Actions workflow.

---

## [2.2.0] - 2026-07-21

### Added
- **Excalidraw OD (On-Demand) Integration**: Consolidated `kings-excalidraw-math-companion` directly into `King's CalcLatex`, eliminating redundant separate plugins.
- **Custom LaTeX Prompt Modal Positioning**: Added user configurable modal window placement setting (`latexModalPosition`) with default location **Near Bottom of Screen** (`bottom: 40px`), as well as `center`, `top`, and `cursor` options.
- **Excalidraw Canvas Plotting**: Support rendering 2D/3D plots and inserting PNG plot elements directly into Excalidraw scenes via ExcalidrawAutomate (`ea`).
- **Textarea Math Companion**: Live MathJax preview tooltip, color dot bar (`\color{red}`), and `\bbox` panel inside Excalidraw text editing overlays.

### Changed
- **Settings UI Restructure**: Split plugin settings into two clear, dedicated sections:
  1. **Markdown Note Features (`.md`)**
  2. **Excalidraw OD Features (Canvas & Math Companion)**

---

## [2.1.1] - 2026-07-21

### Fixed
- **Memory Leak Fix (`terminateGiac`)**: Fixed Web Worker memory leak where reloading the plugin or syncing builds accumulated orphaned 19 MB WASM workers using up to 2.5 GB of RAM. `terminateGiac()` is now explicitly invoked on plugin unload (`onunload()`).
- **CM6 Decoration Performance**: Implemented an $O(1)$ document string fast-path check (`buildDecorationsFromState()`) in CodeMirror 6. Notes without CalcLatex triggers now bypass line-by-line regex parsing completely and return `Decoration.none` instantly.

### Changed
- Standardized release versioning, synchronized `manifest.json` and `versions.json` across local vault and repository roots, and added Keep a Changelog standards.

---

## [2.1.0] - 2026-04-06

### Added
- **WebM Animation Export**: Added video recording button (`⏺` / `⏹`) on parameter sliders using native `canvas.captureStream()` and `MediaRecorder`.
- **ODE Phase Portraits**: Direction fields and phase space solution curves for ODEs (`y' = f(x, y)`).
- **Per-Expression Color & Line Style Overrides**: Support `#color` (e.g. `#red`, `#3b82f6`) and line styles (`--` for dashed, `..` for dotted) in semicolon-separated expressions.
- **Laplace Transforms**: Added `@laplace` and `@ilaplace` symbolic transforms powered by Giac WASM.
- **Data Table & Scatter Regression**: Added `@scatter` regression fitting (`lin`, `poly2`, `poly3`, `exp`) and HTML `@table` view widgets.

---

## [2.0.0] - 2026-03-16

### Added
- **100% Browser-Native Architecture (Path C)**: Complete ground-up rewrite eliminating Python backend and iframe sandboxing.
- **CAS Engine**: Giac WASM primary engine + CortexJS ComputeEngine fallback.
- **2D Renderer**: Custom Canvas 2D Desmos-style renderer with 1:1 aspect ratio, adaptive grid, POI auto-detection, and marching squares.
- **3D Renderer**: Three.js WebGL static image architecture with click-to-interact OrbitControls.
- **CM6 Integration**: Native StateField decorations and block widgets.
