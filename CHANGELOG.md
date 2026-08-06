# Changelog

All notable changes to **Kings CalcLaTeX** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.9.1] - 2026-08-06

### Fixed
- **Typing lag in large `.md` notes with many equations, specifically while editing inside math mode.** Root-caused to the vendored LaTeX Suite snippet-matching engine (`latex-suite/features/run_snippets.ts`): on every keystroke it re-sliced the entire document from position 0 up to the cursor (`sliceDoc(0, to)`) to check for snippet triggers -- an O(cursor position) cost repeated on every keystroke, so typing near the end of a large document got progressively slower the more content preceded the cursor. This is inherited unchanged from upstream `artisticat1/obsidian-latex-suite` (confirmed via diff) and matches a still-open upstream report (issue #320: "LaTeX Suite will significantly affect Obsidian's performance" on documents over ~10-25k characters). Bounded the slice to a generous fixed window (2000 characters) around the cursor instead -- built-in and realistic custom snippet triggers never need more lookback than that, and for any document/cursor position where the old and new behavior would differ (i.e. more than 2000 characters precede the cursor), correctness is preserved by converting positions back to absolute document coordinates before use. For documents under 2000 characters (the common case), the computed window start is always position 0, making this a no-op -- behavior is byte-for-byte identical to before.

---

## [3.9.0] - 2026-08-01

### Added
- **Excalidraw drawing snapshot/restore commands.** Excalidraw regenerates equation images from their stored LaTeX source on every load, rescaling each one back to its current on-canvas size -- a step that has proven fragile in practice and can silently reset manually-resized equations to their natural size after a reload. Two new Command Palette commands protect against this:
  - **"Excalidraw: Snapshot current drawing (element positions/sizes)"** -- captures every element's `x`/`y`/`width`/`height`/`angle` and saves it as a timestamped JSON file next to the drawing.
  - **"Excalidraw: Restore current drawing from a snapshot"** -- lists every snapshot found for the current drawing and, after picking one, restores only the elements whose position/size actually drifted -- anything added or removed since is left untouched.
  - Built on `ExcalidrawAutomate`'s public `getSceneElements()`/`updateScene()` API rather than parsing Excalidraw's internal compressed-file format, so it stays correct regardless of what file format Excalidraw uses internally.

---

## [3.8.6] - 2026-07-30

### Fixed
- **Settings tab was completely blank since v3.8.3.** `Setting.setClass()` expects a single class name and internally calls `classList.add()` with the whole string as one token -- passing a space-separated string (`"kcl-settings-section-header kcl-settings-section-header-first"`, from the v3.8.3 heading-conversion pass) threw `InvalidCharacterError` the instant the settings tab tried to render, before any setting row was drawn, leaving the tab entirely empty. Fixed by chaining two separate `.setClass()` calls instead. Confirmed no other multi-class `.setClass()` calls exist anywhere in the codebase. Caught via a live user report with the actual browser console error -- this class of bug can't be caught by `tsc`/`build`, since `setClass()`'s type signature is just `(cls: string): this`.

---

## [3.8.5] - 2026-07-29

### Fixed
- **Cleaned up remaining non-blocking Warnings/Recommendations from the Obsidian community directory review** (v3.8.4 already passed with zero Errors -- this is a discretionary polish pass):
  - Replaced raw Node `fs` file access in the Giac WASM loader with the vault adapter API (`app.vault.adapter.exists()`/`.read()`), and replaced an internal-property path hack (`vault.adapter.basePath`) with the public `manifest.dir` API.
  - Fixed 3 more unsafe `innerHTML` writes in the "Edit LaTeX" modal.
  - Made all `setTimeout`/`clearTimeout`/`requestAnimationFrame` calls popout-window-safe (`window.*`-prefixed) across 12 files.
  - Replaced `instanceof HTMLElement`/`HTMLInputElement`/`HTMLTextAreaElement` checks with Obsidian's cross-window-safe `.instanceOf()` -- this also fixed two small pre-existing bugs (a possible-null crash, and a type gap where a content-editable check ran against the wrong element type).
  - Removed dead code: 2 fully unused functions and 11 unused imports/variables.
  - Release workflow now generates cryptographic build-provenance attestations for `main.js`/`styles.css`.
- No user-facing behavior changes -- this is a compliance-only release.

---

## [3.8.4] - 2026-07-28

### Fixed
- **Cleared the remaining two blocking Errors from a second Obsidian community directory review pass**, both surfaced only after the v3.8.3 fixes:
  - The settings page's top-level heading ("Kings CalcLaTeX Settings") violated two new rules -- headings can't include "settings" or the plugin name -- removed the redundant heading entirely (Obsidian's own UI already provides that context).
  - `latex-modal.ts`'s 27 remaining `!important` static style writes (the "Edit LaTeX" modal's positioning logic, deliberately held off in v3.8.3) converted to `!important`-carrying CSS classes for the static/literal values only. The genuinely dynamic, rect-derived pixel offsets (bottom/top/left/max-width) stay as direct inline `!important` writes -- required to reliably beat Excalidraw's own `!important` CSS (confirmed via its bundled stylesheet, which anchor-positions `.cm-tooltip-cursor` tooltips with `!important`) -- since Obsidian's `no-static-styles-assignment` rule only flags static-literal style writes, not computed ones. Also replaced a `:has()` selector dependency with an explicit class applied via `classList`, clearing two CSS-lint Warnings as a side effect.
- No user-facing behavior changes -- this is a compliance-only release, functionally identical to v3.8.3's positioning/panning/cursor-tooltip behavior.

---

## [3.8.3] - 2026-07-28

### Fixed
- **Resolved every blocking Error from the Obsidian community plugin directory's automated review** of the v3.8.2 submission:
  - `manifest.json` description no longer redundantly restates "Obsidian."
  - `onunload()` no longer detaches Graph Inspector leaves (was silently discarding the user's manual pane layout on plugin reload).
  - Replaced a deprecated `event.keyCode === 229` IME-composition check with the modern `event.key === "Process"`.
  - Removed dead, `eval`-based snippet-loading code (`importModule`/`importRaw`/`parseSnippets`/`parseSnippetVariables`) from the vendored LaTeX Suite snippet parser -- this fork never called it; snippet data is pre-compiled and fed through `parseRawSnippetArray` instead.
  - Replaced unsafe `innerHTML` template-string writes (Excalidraw shortcut HUD, text-styles sidebar row) with safe DOM construction.
  - Converted all raw heading elements in the settings page to `Setting().setHeading()`.
  - Replaced ~40 direct `.style.xxx =` assignments across the editor/renderer/Excalidraw modules with `setCssStyles`/`setCssProps`/CSS classes.
  - Removed the Giac WASM inline-`<script>`-injection fallback path (only used if Web Worker creation itself failed) that was tripping the directory's code-obfuscation scanner.
  - Untracked the old, unreferenced v1 codebase (`repo/`) from the GitHub repo (kept locally, no longer pushed or scanned).
- No user-facing behavior changes -- this is a compliance-only release.

---

## [3.8.2] - 2026-07-27

### Changed
- **Renamed the plugin from "King's CalcLatex" to "Kings CalcLaTeX"** to comply with Obsidian's community plugin naming rules ahead of directory submission — the `name` field only permits hyphens, plus signs, and parentheses as punctuation, and the apostrophe in "King's" was flagged as a violation. The plugin `id` (`kings-calclatex`) was already compliant and is unchanged, so this does not affect existing installs. Also took the opportunity to fix "Latex" → the conventional "LaTeX" capitalization.

---

## [3.8.1] - 2026-07-27

### Fixed
- **"Edit LaTeX" modal could grow wider than the Excalidraw pane in split-screen, and long equations were unreachable at their far ends.** The modal is a body-level Obsidian `Modal` with no awareness of which split pane it was opened from, so it had no width limit and would keep growing to fit a long, unwrapped equation — the cursor was still moving correctly on Home/End/arrow keys, it was just landing in space rendered off-screen. `applyModalPosition()` now also caps the modal's `max-width` to the active Excalidraw pane's own width (minus 40px breathing room on each side, floored at 360px so a very narrow pane still stays usable), computed from the same `leafEl.getBoundingClientRect()` already used for vertical placement. With a real fixed width in place, `.cm-scroller`'s horizontal auto-scroll-to-cursor (pinned explicitly in `styles.css` as insurance) now has a box to pan within, so typing/navigating toward either end pans the visible window like a single-line text field instead of clipping.

---

## [3.8.0] - 2026-07-26

### Added
- **Excalidraw OD LHS Element Styling Shortcuts**: non-conflicting left-hand keyboard shortcuts for styling canvas elements (`Shift + F` for Line Style, `Shift + D` for Stroke Width, `Shift + X` for Edge Roundness, `Shift + Q` for Sloppiness/Roughness), secondary number-key selection (`1`-`4`) with `stopPropagation()` so Excalidraw's own tool-switching shortcuts don't fire, a floating HUD toast showing the active options, and full configuration in Settings → Excalidraw OD.

---

## [3.7.0] - 2026-07-26

### Added
- **New setting: LaTeX Prompt Modal Cursor Position** (Settings → Excalidraw OD). Excalidraw previously always placed the cursor at the *start* of an equation when re-opening the "Edit LaTeX" modal on an existing element, requiring a manual click to continue/append to it — now defaults to the *end* instead (the more common edit), with "Start of Equation" available as an option if you prefer the old behavior.

---

## [3.6.1] - 2026-07-26

### Fixed
- **Canvas Tab navigation between tabstops (e.g. after `mk`, or an exponent/fraction snippet) could land the cursor at the wrong position.** `TabstopManager.adjustForEdit()` existed but was never actually called anywhere in the input-handling flow, so a tabstop's stored position went stale the moment the user typed inside an *earlier* tabstop (e.g. typing "10" into `^{|}`'s empty braces shifts everything after it, but the next tabstop's recorded position never moved to match) — Tab would then jump to that stale, pre-edit position instead of the correct one. Fixed by diffing the buffer against its last-known state on every keystroke and feeding that edit delta into `adjustForEdit`, so stored tabstop positions now track live edits correctly. (The "Edit LaTeX" modal is unaffected — it already switched to the real vendored engine's own tabstop tracking in 3.6.0, which never had this bug.)

---

## [3.6.0] - 2026-07-26

### Changed
- **The "Edit LaTeX" modal now injects the real, vendored LaTeX Suite CM6 engine directly, instead of running a parallel hand-rolled reimplementation.** The exact same extension array the main note editor uses (snippets, tabstops, auto-fraction, tabout, matrix shortcuts, conceal, bracket-color-matching, math-preview-tooltip) is appended into the modal's own CodeMirror instance via `StateEffect.appendConfig` — without touching Excalidraw's plugin registry or its own "detect the community Latex Suite plugin" mechanism, which is what broke right-click/double-click/`Ctrl+\` editing in a much earlier session. Falls back automatically to the previous hand-rolled engine if the real-engine injection fails for any reason. The canvas text-box path is unaffected (still the hand-rolled engine — there's no CM6 instance there to inject into).
- Added `alwaysMathFacet` to the vendored LaTeX Suite's math-bounds detection (`utils/context.ts`) — a deliberate, clearly-marked fork addition, not upstream drift — so the real engine can be told "this entire buffer is math" for host editors (like this modal) that have no markdown syntax tree to detect math regions from.

### Fixed
- Modal live preview threw `ReferenceError: MathJax is not defined` on every render attempt — Obsidian only lazy-loads MathJax on first real use via normal markdown rendering, which this floating modal never goes through. Now awaits Obsidian's own `loadMathJax()` before the first render.

### Note
- **This is an architecture change, not a polish pass, and is UNVERIFIED live as of this release.** It was built after confirming (via a live throwaway probe) that Excalidraw's modal `EditorView` survives across a full typing session rather than being torn down and rebuilt by React — but whether the real engine's snippets, tabstops, conceal, bracket-coloring, and tooltip actually work correctly once injected has not yet been tested in Obsidian.
- Also found, not yet fixed: canvas tabstop navigation can land at a stale position after typing inside an earlier tabstop (`TabstopManager.adjustForEdit()` is dead code, never called). Deferred — canvas conversion/snippets were confirmed working well otherwise, and this session's focus was the modal.

---

## [3.5.1] - 2026-07-26

### Fixed
- **Auto-fraction on the canvas (`/`) could eat the opening `$` and drop the numerator entirely** — e.g. `$1$` + `/` produced `\frac{}{}$` instead of `$\frac{1}{}$`. Root cause: unlike upstream LaTeX Suite (which only ever sees text already stripped of its surrounding `$` by CM6's syntax tree), this engine's canvas surface operates on the raw buffer with the `$` delimiters still literally present, and the numerator-boundary scan didn't know to stop at one. The captured numerator (`"$1"`) then got spliced directly into the `\frac{...}{$0}$1` template string, where its own leading `"$1"` collided with the template's own `$`-prefixed tabstop syntax and was silently consumed as a fake tabstop instead of literal text. Fixed by treating `$` as an unconditional numerator boundary.
- Modal live-preview render failures are no longer silently swallowed — logged via `console.warn` so a genuinely broken preview is now distinguishable from one that's just empty (CSS hides an empty preview div entirely, so a silent failure looked identical to the feature not existing).

---

## [3.5.0] - 2026-07-25

### Added
- **Canvas text now auto-converts to a rendered LaTeX equation on blur.** Finishing a `$...$`/`$$...$$` block in an Excalidraw canvas text box and clicking away now replaces it with a real rendered SVG equation via Excalidraw's own `ExcalidrawAutomate` API — this did not exist as a feature anywhere in Excalidraw or this plugin before.
- **The "Edit LaTeX" modal now has a real snippet engine.** `mk`, `sr`, Greek letters, auto-fraction, matrix `Tab`→`&`, and tabstop navigation now work inside the modal's editor, driven by the same engine as the canvas (previously the modal had no snippet expansion at all — only its own "Install Latex Suite" nag, which is now suppressed in favor of this).

### Fixed
- `ExcalidrawAutomate.getAPI` crashed (`TypeError: Cannot read properties of undefined`) when called after being destructured off its owning object, which strips its `this` binding. Always called as a bound method now.
- The original plain-text canvas element could be left behind after a successful equation conversion (both visible at once) — the deletion mutation raced `addElementsToView`'s async scene commit and was sometimes silently dropped. Reordered to delete first, synchronously, before adding the equation.
- The modal's snippet matching read CodeMirror 6 editor state one keystroke late (CM6 reconciles contenteditable edits via a microtask that runs after the native `input` event fires), cascading into a runaway closing-brace loop for bracket-pair snippets. Fixed by deferring the read to a microtask — while keeping the re-entrancy guard synchronous, since deferring *that* too silently broke the canvas path's own re-entrant-dispatch protection (caught in review before shipping).
- The modal's `input` and `keydown` listeners need opposite event-phase placement to coexist with CM6's own internal handling — split into independent targets instead of both sharing one ancestor capture-phase listener.
- Tab-based tabstop navigation inside the modal was very likely losing the race against a focus-trap Excalidraw/Obsidian's modal system implements for accessibility — moved the keydown interception to `document.documentElement` (scoped to only fire for keydowns originating inside the modal's own editor) so it can no longer be preempted regardless of which container implements the trap.

### Note
- The Tab-navigation fix addresses the most likely cause but has not yet been confirmed live in Obsidian.

---

## [3.4.0] - 2026-07-23

### Fixed
- **The entire Excalidraw companion was silently non-functional**: `ExcalidrawCompanionManager.onload()` threw on its very first async call (calling `parseSnippets`/`parseSnippetVariables` — functions that `eval` a raw JS source string — with our pre-compiled snippet data instead, which throws `"Invalid format"`). This meant the snippet engine, blur interceptor, live preview tooltip, and LaTeX modal enhancer never initialized at all, for any Excalidraw canvas. Rewrote the snippet-loading path to work directly on the pre-compiled data. **Verified empirically**: 199/200 default snippets now convert correctly (excluding the intentionally-disabled `dm`), including `${GREEK}`/`${SYMBOL}` variable substitution and regex-snippet compilation.
- Restored a blur-time text-sync fix in the Excalidraw textarea interceptor (trims trailing whitespace and syncs Excalidraw's internal text-element state before its own blur handler runs) that appears to have been lost in an earlier session.
- Added continuous position re-application for the LaTeX modification modal — it was only positioned once, and Excalidraw's React-controlled modal likely resets its own inline position on every keystroke.
- Hid Excalidraw's own "Install the 'Latex Suite' plugin..." suggestion banner in its native LaTeX modal, and added our own live MathJax preview there instead — without touching Excalidraw's plugin registry (an earlier, since-reverted attempt to spoof plugin detection there broke right-click edit, double-click edit, and the equation shortcut entirely).
- Fixed 3 real type errors surfaced by creating a previously-missing `src/excalidraw/types.ts` (3 files imported types from a file that didn't exist, silently erased by the bundler since the imports were type-only): a default/named import mismatch and a `Result<T>` narrowing bug in the graph-injector, and an inconsistent event-handler field type in the snippet engine.

### Note
- The `onload()` crash fix is verified in isolation. The blur-sync and modal-repositioning fixes restore/add code paths that have been dormant this whole time (since nothing after the crash ever ran) — they need confirmation in Obsidian, not just a clean build.

---

## [3.3.1] - 2026-07-23

### Fixed
- **Conceal, tabstop-placeholder colors, bracket highlighting/coloring, and the math-preview tooltip had zero supporting CSS** — the vendored LaTeX Suite JS was cloned from upstream, but its `styles.css` never was. The decoration logic was computing correct DOM classes the entire time; without CSS they rendered as plain unstyled text, indistinguishable from not working at all. Ported the relevant sections of upstream's real stylesheet in.
- **`onInput` was double-processing every keystroke**: an earlier session removed a guard (`&& lastKeyboardEvent`) meant to restrict a code path to an IME-composition fallback case only; every ordinary keystroke was being reprocessed through it in addition to the normal `keydown` handler. Reverted to upstream's exact logic.
- **Custom/invalid snippets were silently coerced instead of rejected**: `validateRawSnippets` had a "tolerant fallback" that turned a schema-validation failure into a defaulted, type-unsafe object rather than throwing. Reverted to upstream's strict behavior, which is now handled correctly by the two-layer fallback added in 3.3.0's custom-snippets feature.

### Verified
- Full file-by-file diff of all 30 live vendored LaTeX Suite source files against a fresh clone of `artisticat1/obsidian-latex-suite`: confirmed byte-identical except the two bugs above (now fixed) and 6 files with TypeScript-strict-mode-only annotations (no behavioral difference, left as-is).
- The 200-entry default snippet data and every `DEFAULT_SETTINGS` value already matched upstream exactly — the "settings don't match" perception was entirely caused by the missing CSS, not incorrect data or defaults.
- Re-ran the isolated snippet-parsing harness after removing the tolerant-fallback hack: all 200 default snippets still parse successfully under strict validation.

### Note
- Conceal defaults to **off**, matching upstream — enable it under Settings → LaTeX Suite Features → Concealment & Highlighting and reload Obsidian to see this fix take effect.

---

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
- **Native LaTeX Suite Ingestion**: Ingested LaTeX Suite snippet engine directly into Kings CalcLaTeX. Provides CodeMirror 6 markdown snippet auto-expansion (`mk`, `dm`, `sr`, `cb`, `fra`, `pmat`, `bmat`, matrices, operators) across both standard `.md` notes and Excalidraw canvas overlays.
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
- **Excalidraw OD (On-Demand) Integration**: Consolidated `kings-excalidraw-math-companion` directly into `Kings CalcLaTeX`, eliminating redundant separate plugins.
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
