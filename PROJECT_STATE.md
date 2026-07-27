# Kings CalcLaTeX — Project State

> **This file is the canonical source of truth for LLM agents working on this project.**
> Read this file at the START of every conversation. Update it at the END of every conversation.

## Quick Summary
**Kings CalcLaTeX** is an Obsidian desktop plugin that provides inline LaTeX evaluation, CAS computation, and high-fidelity 2D/3D graphing — all rendered directly in the editor.

**v2.0** is a complete ground-up rewrite: 100% browser-native, no Python backend.

## Current Status: 🟢 v3.8.2 — release-tag/manifest-version mismatch fixed (blocked directory submission), retroactive `3.8.2` release created

### What Happened (Part 48 — release workflow tagged releases wrong for the entire project's history; fixed + unblocked pending directory submission)
User's community.obsidian.md submission showed "No release matches your manifest version" ("Make sure your GitHub release doesn't use a 'v' in front of the version number"). Read `.github/workflows/release.yml`: it derived the release tag from the pushed git ref (`tag="${GITHUB_REF#refs/tags/}"`) instead of from `manifest.json`'s `version` field. Every release this project has ever shipped (`v2.0.0` through `v3.8.2`, all 20) was tagged with a `v` prefix while `manifest.json`'s version never had one -- an exact-match mismatch that's existed since the very first release, invisible to BRAT/manual installs (they just grab the latest release regardless) and only caught now because the directory's review actually validates the match.

**Fixed the workflow**: now reads `manifest.json`'s version directly (`node -p "require('./repo-v2/manifest.json').version"`) and tags the release with that string, decoupled from whatever git tag triggered the build. Documented as antipattern #24 in `repo-v2/CLAUDE.md`, including the going-forward convention: push git tags WITHOUT a `v` prefix from now on, since the workflow will still correctly self-tag off manifest.json either way, but a `v`-prefixed push would create a redundant second tag on the same commit.

**Unblocked the immediate submission** without waiting for a new version cycle: created a `3.8.2` (no `v`) release by hand, `--target` pointed at the same commit as the existing `v3.8.2` release, with the same three assets (`main.js`, `manifest.json`, `styles.css`). Verified via `gh release view 3.8.2` that the tag, target commit, and asset list are all correct.

**Left alone, deliberately**: the other 19 historical `vX.Y.Z` releases/tags. Only the current version needs to match for the directory review to pass -- retroactively fixing history would mean deleting+recreating 19 releases (real GitHub churn, breaks any existing links to those release URLs) for zero functional benefit, since nobody's manifest.json will ever again point at those old versions expecting a match. Flagged to the user as a scope choice rather than assumed.

**Needs live confirmation from user**: refresh the community.obsidian.md submission page -- the "No release matches your manifest version" error should be gone now that a `3.8.2`-tagged release exists.

### What Happened (Part 47 — renamed "King's CalcLatex" → "Kings CalcLaTeX" for directory naming compliance)
User is submitting to the official Obsidian community plugin directory via community.obsidian.md and hit a naming-convention rejection. Checked the actual current docs (`docs.obsidian.md/Reference/Manifest`) rather than relying on memory: the `manifest.json` `name` field only permits hyphens, plus signs, and parentheses as punctuation — the apostrophe in "King's" was the violation. The plugin `id` (`kings-calclatex`) was already compliant (lowercase+hyphens, doesn't contain "obsidian", doesn't end in "plugin") and did not need to change.

User chose "Kings CalcLaTeX" (dropped the apostrophe, also fixed "Latex" → conventional "LaTeX" capitalization) over the plainer "Kings CalcLatex". Replaced across all user-facing/compliance-relevant surfaces: both `manifest.json` copies (root + `repo-v2/`), both `README.md` copies, both `CHANGELOG.md` copies, `ACKNOWLEDGEMENTS.md`, this file, both `CLAUDE.md` copies, `SESSION_START.md`, `CHEATSHEET.md`, `repo-v2/DEVELOPMENT_NOTES.md`, and the two actual runtime-visible strings in source (`settings.ts`'s Settings-tab `<h2>` header, `main.ts`'s startup `console.log`). Deliberately left untouched: `repo/` (explicitly read-only v1 codebase per this project's own conventions), `development/*.md` planning docs and `handoff_log.md` (historical snapshots/session log — retroactively renaming past entries would be revisionist busywork for zero benefit), and per-file `.ts` header doc-comments outside `main.ts`/`settings.ts` (cosmetic only, not user-facing, not compliance-relevant).

Also researched and corrected earlier-session guidance to the user about the submission mechanism itself: it is NOT a PR to `community-plugins.json` anymore (that's outdated) — it's now a web form at community.obsidian.md (sign in with Obsidian account, link GitHub to prove repo ownership, Plugins → New plugin, enter repo URL). Confirmed via `docs.obsidian.md/Plugins/Releasing/Submit+your+plugin` and cross-checked developer policies (`docs.obsidian.md/Developer+policies`) for other compliance risks: confirmed zero network calls anywhere in `src/` (`giacwasm.js` is read from the local plugin folder via `fs`, never fetched), no auto-update mechanism, LICENSE present — no other blockers found.

Typecheck and build clean. Shipped as v3.8.2 (patch — cosmetic rename, `id` unchanged so it's not a breaking change for anyone already on the plugin).

**Needs live confirmation from user**: re-check the Settings tab header renders "Kings CalcLaTeX Settings" correctly, then resubmit through community.obsidian.md and confirm the naming-convention rejection clears.

### What Happened (Part 46 — modal width capped to Excalidraw pane + cursor-follow panning for long equations)
User runs Excalidraw in split-screen and reported that with a long equation, the "Edit LaTeX" modal isn't constrained to the pane (renders centered on/wider than the whole app window) and the cursor "physically won't move" past a certain point when navigating with End/arrow keys. Diagnosed live with the user (without DOM access) by walking through Excalidraw's own `main.js`/`styles.css` (`.excalidraw-LatexPrompt .cm-editor { justify-content:center }`, `.cm-scroller { width:100% }`, no explicit width cap anywhere) and confirmed via their own End-key test that the cursor *is* moving correctly — it's landing off-screen because nothing gives the modal a hard width to stop growing at, so `.cm-scroller`'s horizontal auto-scroll-to-cursor never has a fixed box to pan within in the first place.

Fix (entirely in KCL, no Excalidraw plugin files touched): `applyModalPosition()` in `latex-modal.ts` now also computes `leafEl.getBoundingClientRect()` (same lookup already used for vertical placement) and caps `actualModal`'s `max-width` to that pane's width minus 40px margin on each side (floored at 360px), applied via the same `applyIfChanged`-guarded `!important` write pattern used for position — independent of the `latexModalPosition` setting (all 4 positions need the cap equally). Added `.excalidraw-LatexPrompt .cm-editor .cm-scroller { overflow-x: auto !important }` in `styles.css` as explicit insurance (CM6's default already provides this, but don't depend on it silently continuing to). Deliberately did NOT enable `EditorView.lineWrapping` — user explicitly wants pan-to-follow (like a single-line text field), not multi-line wrapping, to keep the "one continuous strip of math" feel.

Considered and rejected: setting `overflow: hidden` on `.modal` to force clipping. `.modal` already has an inline `transform` (translateX/translate) applied by `applyModalPosition()`, which makes it the containing block for any `position: fixed` descendant (tooltips, `.cm-tooltip-cursor`) — adding `overflow: hidden` on the same element would also clip those, since a `transform` + `overflow:hidden` ancestor clips fixed-position children too, not just static ones. Not needed anyway: `max-width` on `.modal` already bounds the width of children like `.cm-editor`/`.cm-scroller` through normal block layout (`width: 100%` resolves against the actual capped container width), no forced clipping required.

Typecheck clean for touched files (pre-existing unrelated errors remain in `engine/`, `renderer/`, `snippets/` — not touched, not introduced by this change). Build clean, synced to vault.

**Needs live confirmation from user**: open a long equation's "Edit LaTeX" modal in split-screen — modal should stay within the pane, and pressing End/arrow-keys toward either end should visibly pan the text horizontally to follow the cursor instead of appearing frozen.

### What Happened (Part 45 — Excalidraw OD LHS element styling shortcuts & HUD)
Implemented fluid, non-conflicting Left-Hand Side (LHS) keyboard shortcuts for styling canvas elements (`Shift + F` for Line Style, `Shift + D` for Stroke Thickness, `Shift + X` for Edge Roundness, `Shift + Q` for Sloppiness/Roughness). Built `ExcalidrawShortcutManager` in `src/excalidraw/shortcut-manager.ts`, added modal keydown interception for secondary number keys (`1`, `2`, `3`, `4`) with `stopPropagation()` to prevent tool switching, added a sleek floating HUD overlay (`.kcl-shortcut-hud`), and added full user configuration controls in Settings → Excalidraw OD Features. Tested and confirmed working live in Obsidian. Shipped as v3.8.0.

### What Happened (Part 44 — new setting: modal cursor position)

### What Happened (Part 43 — canvas Tab navigation fixed; Part 42 pivot confirmed working)

### What Happened (Part 43 — canvas Tab navigation fixed; Part 42 pivot confirmed working)
User tested v3.6.0 live and confirmed the modal works well ("everything works well ... mod. modal popup functions well") — the real-engine injection pivot from Part 42 holds. Then asked to fix canvas Tab navigation specifically ("tab does move around in the equation but not proper cursor location") — exactly the `TabstopManager.adjustForEdit()` dead-code bug identified but deferred at the end of Part 42 (canvas-only; the modal's real engine never had this bug). Fixed by diffing the buffer against a tracked `lastKnownText` on every keystroke and feeding the edit delta into the pre-existing `adjustForEdit`. Hand-traced against the exact previously-broken scenario from the user's own earlier log — tabstop positions now correctly track live edits instead of going stale. Shipped as v3.6.1, per the user's explicit ask to always ship a working checkpoint via CI/CD before taking on further requests, so there's a clean revert point.

**Needs live confirmation**: type inside a multi-tabstop snippet (e.g. `10` + `rd` → `10^{}`) on canvas, then Tab — confirm correct cursor landing position.

### What Happened (Part 42 pivot, confirmed working in Part 43)

### What Happened (Part 42 — modal now runs the real LaTeX Suite engine via CM6 appendConfig, not a reimplementation)
User's latest log (testing v3.5.1) surfaced two more concrete bugs: (1) modal live preview threw `ReferenceError: MathJax is not defined` on every render attempt — Obsidian only lazy-loads the global MathJax runtime on first real use, and this floating modal never goes through normal markdown rendering, so it was never loaded; fixed by awaiting `loadMathJax()` (Obsidian's own public loader) before the first `renderMath()` call. (2) Tabstop navigation lands at the wrong position after typing inside an earlier tabstop — traced to `TabstopManager.adjustForEdit()` existing but never actually being called anywhere in the input-handling flow, so stored tabstop positions go stale the moment the user types. **This second bug is NOT fixed** (still affects the canvas path specifically, see below) — it became moot for the modal because of a bigger change described next.

User then asked directly: given we have our own full LaTeX Suite vendored and working in the main note editor already, why not use *that* instead of a parallel simplified reimplementation for the modal? Investigated and agreed — with one correction to the mechanism: not Excalidraw's own "detect the community Latex Suite plugin" path (spoofing that plugin id previously broke right-click/double-click/Ctrl+\ entirely, Parts 4-5), but directly injecting our own engine's real CM6 `Extension[]` (`provider.ts`'s `initLaTeXSuiteEngine`/`getLaTeXSuiteEngineExtension` — confirmed via code reading to have **zero** dependency on Obsidian's workspace/editor objects, pure CM6) into the modal's own EditorView via `StateEffect.appendConfig`, which never touches Excalidraw's plugin registry at all.

Two things had to be confirmed/built before this was safe to ship:
1. **Does `appendConfig` even survive on Excalidraw's foreign, React-managed EditorView, or does React tear down and rebuild it mid-session (silently discarding anything appended)?** Verified live with a throwaway `updateListener` probe before committing to the real surgery — it fired continuously through a full typing session, including immediately after a Tab press. Confirmed stable; not a rebuilt-per-render view.
2. **The real engine's math-bounds detection (conceal, bracket-coloring, math-tooltip, and the snippet engine's own mode-gating) is coupled to Obsidian's markdown syntax tree**, which doesn't exist in Excalidraw's bare CM6 instance. Since the modal's entire buffer is always-and-only raw LaTeX (true by construction, same reason the old hand-rolled engine used a `forcedMode` hack), added `alwaysMathFacet` to `src/latex-suite/utils/context.ts` (clearly marked as a KCL fork addition, not upstream) — a facet that, when set, makes `mathBoundsPlugin.inMathBound()`/`getEquations()` short-circuit to "whole document is one math region" before ever touching the syntax tree. Zero effect on the main markdown editor (facet unset there).

`latex-modal.ts`'s `injectRealOrFallbackSnippetEngine()` now tries the real-engine injection first, falling back to the hand-rolled `SnippetEngine` (still required for the plain-`<textarea>` canvas path, which has no CM6 to inject into) only if it throws. This should, if it works, deliver real tabstops (no adjustForEdit bug), real conceal, real bracket-color-matching, real math-preview-tooltip, real auto-fraction, and real matrix shortcuts in the modal — for free, since it's the same already-correct code, not a fix targeted at any one symptom.

**Completely unverified live.** Typechecks clean (no new errors in `excalidraw/`/`latex-suite/`), builds clean, but this is a genuine architecture change to a foreign, undocumented host editor and needs real testing before being trusted.

### Still known, not yet fixed
- **Canvas tabstop staleness** (`TabstopManager.adjustForEdit()` dead code) still affects the canvas `<textarea>` path, which still uses the hand-rolled engine (can't inject CM6 extensions into a plain textarea). Deferred — the user's most recent complaints were modal-specific, and canvas conversion/snippets were explicitly called "happy with... so far."

### What Happened (Part 41 — auto-fraction "$" bug fixed, modal preview failure now logged not swallowed)
User's console log from testing v3.5.0 traced exactly to a real bug: canvas auto-fraction (`$1$` + `/`) produced `\frac{}{}$` instead of `$\frac{1}{}$` — `findNumerator()`'s backward scan didn't stop at `$`, so the numerator captured `"$1"` including the delimiter, which then collided with `parseTabstops`' own `$`-prefixed tabstop syntax when spliced into the `\frac{...}{$0}$1` template and got silently eaten. Fixed by adding `$` as an unconditional numerator boundary — hand-traced against the same input, now produces the correct `$\frac{1}{}$`.

Also confirmed from the same log: **Part 40's CM6 microtask-staleness fix is holding** — modal `onInput` reads are no longer one-keystroke-stale through a long typing sequence. That was the biggest open risk from last session.

**Modal live preview reportedly still doesn't show anything** — investigated but did not blind-fix; `.kcl-latex-live-preview` has real CSS (not a repeat of the old missing-stylesheet bug) but also `:empty { display: none }`, and the render call's `catch` block was silently swallowing failures with zero logging, making a broken preview indistinguishable from a nonexistent one. Added `console.warn` logging instead of guessing — next log will show the actual failure.

**`"rd"` typed after `10` expanding to `10^{}` is not a bug** — confirmed via grep that `{trigger: "rd", replacement: "^{$0}$1"}` is a genuine upstream LaTeX Suite default snippet.

Shipped as **v3.5.1** via the CI/CD pipeline (patch bump — bug fixes only).

**Still needs live confirmation**: (1) auto-fraction with `$` delimiters now correct, (2) modal preview — paste whatever the console shows now, warning or rendered equation, (3) Tab-in-modal explicitly tested with an active tabstop (last session's log was cut off exactly at the Tab keypress, no confirmation either way).

### What Happened (Part 40)

### What Happened (Part 40 — canvas blur-to-equation built as new feature + modal snippet engine wired, both mid-verification)
User confirmed `mk`/`sr`/auto-fraction expansion now works on the canvas (Part 39's fix holds). Two things remained broken and were addressed this session:

1. **Canvas text→LaTeX-SVG auto-conversion did not exist as a feature at all** (confirmed via reading the actual `obsidian-excalidraw-plugin` bundle — no such code path anywhere). Built it: `TextareaInterceptor` (`interceptor.ts`) now fires an `onBlurCommit` callback with the textarea's final value synchronously at blur time, before teardown. `ExcalidrawCompanionManager.onTextareaBlurCommit()` (`companion-manager.ts`) detects a full `$...$`/`$$...$$` block, calls `ExcalidrawAutomate.getAPI(view)` (**must be called as `win.ExcalidrawAutomate.getAPI(view)`, not destructured — destructuring strips `this` and crashes**), deletes the original plain-text element via a synchronous `api.updateScene()` **before** calling `ea.addLaTex()`/`ea.addElementsToView()` (reordered from delete-after — the async scene commit from `addElementsToView` was racing a later `getSceneElements()` read and silently dropping the deletion). User confirmed the equation now renders; **the delete-before-insert reorder is the one part of this NOT yet re-confirmed** (last user report was from before this reorder landed).

2. **Modal ("Edit LaTeX" popup) had no snippet engine wired at all** — `latex-modal.ts` only ever hid Excalidraw's own "Install Latex Suite" nag, never substituted a real one. Built `text-surface.ts` (a `TextSurface` abstraction — `TextareaSurface` for the plain canvas textarea, `CM6Surface` for the modal's CodeMirror 6 `EditorView`) so `SnippetEngine` (`snippet-engine.ts`) can drive either. Two real bugs surfaced and fixed along the way — both are now project-level antipatterns, see `repo-v2/CLAUDE.md`: (a) capture-phase ancestor listener needed for `keydown` (to beat CM6's own Tab/Backspace handling) but NOT for `input` (reads stale state mid-capture-descent) — split into independent `inputTarget`/`keydownTarget` params; (b) CM6 reconciles contenteditable edits via a `MutationObserver` **microtask**, which runs after the native `input` event — reading `editorView.state` synchronously in an `input` handler is one keystroke stale, cascading into a runaway brace-insertion loop for bracket-pair snippets. Fixed with `queueMicrotask()`, but **a caught-in-review regression**: deferring the read also deferred the `isExpanding` re-entrancy guard, which broke the canvas path (its `setValue` synchronously re-dispatches a native `input` event as part of bypassing React's controlled-input reversion — the deferred guard would have let that re-entrant call through, reintroducing the same runaway-brace bug on canvas that had just been fixed in the modal). Caught by advisor review before user retest; fixed by keeping the `isExpanding` check synchronous in `onInput`, only deferring the actual read into a new `processInput()`.

**NOT yet verified by the user — both need explicit retest**: (a) canvas `_`/`(`/`[`/`{` bracket-pair snippets specifically (not just `mk`, which doesn't exercise the `isExpanding` re-entrancy path) — confirms the re-entrancy-guard fix didn't regress canvas; (b) modal snippet expansion (`sr`, `mk`, subscript `_`) with the `[KCL-DEBUG] onInput: text=` log lines pasted — confirms the CM6 microtask defer actually produces fresh reads and no loop. If the modal log still shows one-keystroke-stale reads after this fix, that's a signal CM6 in this build flushes via `requestAnimationFrame` rather than a microtask, and the fix needs to move to CM6's native `updateListener` instead of guessing at more defer timings.

### What Happened (Part 39 — Excalidraw companion was completely dead)
User reported text→SVG conversion broken, wrong modal position, and a stale "Install Latex Suite" warning. Root cause: **`ExcalidrawCompanionManager.onload()` threw on its first async call** (`companion-manager.ts` was calling `parseSnippetVariables`/`parseSnippets` — functions that expect a raw JS string to `eval`, but was passing our pre-compiled snippet array/object instead, which throws `"Invalid format"`). This meant the snippet engine, blur interceptor, preview tooltip, and modal enhancer **never initialized at all** — explaining all three symptoms as one root cause. **Verified empirically** in an isolated Node harness (same technique used to catch the Part 36 bug).

**Fixed and confirmed working**: rewrote the snippet-loading path (`buildExcalidrawSnippets()`) to work directly on the pre-compiled data — verified 199/200 snippets convert correctly, including variable substitution and regex compilation.

**Fixed but NOT independently verifiable (needs live Obsidian confirmation)**: restored a blur-time text-sync fix in `interceptor.ts` (trims trailing whitespace, syncs Excalidraw's `editingTextElement` before its own blur handler runs) and added continuous modal-repositioning in `latex-modal.ts` (mirrors the existing tooltip-repositioning pattern, since Excalidraw's React-controlled modal likely resets its own position on every keystroke). Both target code paths that have been dormant this whole time — they may already be sufficient once `onload()` runs, or may need further iteration. Also added our own live MathJax preview + hid Excalidraw's "Install Latex Suite" banner in the modal (purely additive, doesn't touch Excalidraw's plugin registry — user explicitly declined re-attempting the plugin-registry spoof that catastrophically broke context menu/shortcuts/blur-conversion in Parts 4→5).

**Created the missing `src/excalidraw/types.ts`** (3 files imported `SnippetDef`/`MathMode` from a file that never existed — silently erased by esbuild since they were type-only imports, so nothing ever caught it) and fixed 3 real type errors it surfaced (`graph-injector.ts` default/named import mismatch + a `Result<T>` narrowing bug, `snippet-engine.ts`'s inconsistent event-handler field type). Full detail in `development/handoff_log.md` (Part 39).

**Still to confirm (needs Obsidian, not CLI) — priority order**: (1) check console on load for any further errors now that dormant code is running for the first time, (2) `mk`/display-math → click away → SVG conversion, (3) right-click/double-click/`Ctrl+\` still open the modal correctly, (4) modal shows live preview with no warning banner and stays positioned correctly while typing.

> ⚠️ **Correction:** The old "🟢 WORKING (v3.2.0)" claim was FALSE. The snippet engine was silently registering **zero** extensions until Part 36. Do not trust a green status without an end-to-end check.

### What Happened (Part 36 — the real fix)
The live path is `main.ts → latex-suite/provider.ts → latex_suite.ts → runSnippets`. **Parts 33–35 all edited the standalone `src/latex-suite/main.ts` class, which nothing live imports** — so the actual bug was never touched. That dead file has now been deleted.

**Root cause:** ES2022 target ⇒ `useDefineForClassFields` ON, but the vendored code was written for upstream's ES6/`false` build. `StringSnippet` redeclared `data: SnippetData<"string">;`, which under define-semantics reset `this.data = undefined` after `super()` set it, so `this.data.triggerAfter = …` threw on the first snippet (`mk`). `parseRawSnippetArray` threw → `provider.ts`'s `try/catch` swallowed it → `initLaTeXSuiteEngine` returned `[]` → **engine did nothing, no error surfaced.**

**Fixed:** `useDefineForClassFields:false` + removed the redeclaration (both fix it). Verified in isolation: all **200** snippets now parse, `snippetsEnabled:true`. Also restored the type checker, deleted 16 dead vendored files, fixed a `mkConcealPlugin` arg bug, deduped `@codemirror/state`, and fixed the production build's broken vault-sync.

### What Happened (Part 37 — pushed live + settings parity)
Committed & tagged `v3.2.1`, pushed to `github.com/kingsleyfong/King-s-CalcLatex` (`main` + tag) — Release workflow auto-published it. Added a `ci.yml` workflow so every push/PR now gets typechecked+built (previously only tagged releases were validated at all, which is how the Part 36 bug shipped invisibly for ~10 commits).

Separately: most of the LaTeX Suite settings toggles already in the UI (`enableAutoFraction`, `enableMatrixShortcuts`, etc.) turned out to be **decorative — `provider.ts` ignored `plugin.settings` almost entirely** and built its config from a hardcoded default. Fixed via two parallel agents on disjoint files (UI in `settings.ts`, engine wiring in `provider.ts`) against a contract I wrote first in `types.ts`. All ~29 upstream settings are now both exposed in the UI and actually control the engine — full mapping documented inline in `provider.ts`. Full detail in `development/handoff_log.md` (Part 37).

**Known limitation (not a regression, pre-existed for `enableLaTeXSuite`):** changing a LaTeX Suite setting requires reloading Obsidian to take effect — no live hot-reload yet (would need a CodeMirror `Compartment`, deferred as future work).

### What Happened (Part 38 — conceal's missing CSS + full upstream fidelity audit)
User reported conceal specifically broken. Root cause: **`src/latex-suite/**`'s JS was cloned from upstream, but its `styles.css` never was.** Every class the live decoration code produces (`cm-concealed-bold/underline/mathrm`, `latex-suite-snippet-placeholder-0/1/2`, `cm-snippetFieldPosition`, `latex-suite-highlighted-bracket`, `latex-suite-color-bracket-*`, `latex-suite-mismatched-bracket`, `latex-suite-math-preview-highlight`, `cm-tooltip-cursor`) had zero supporting CSS — conceal, tabstop-placeholder colors, bracket highlighting/coloring, and the math-preview tooltip were all computing correct decorations that looked identical to plain unstyled text. Fetched upstream's real `styles.css` and ported the relevant sections in.

Also did a **full file-by-file diff of all 30 live vendored files** against a fresh clone of `artisticat1/obsidian-latex-suite` (not a spot-check) — found and fixed 2 real bugs: (1) `latex_suite.ts`'s `onInput` had lost its `&& lastKeyboardEvent` guard in an earlier session, causing every keystroke to double-run snippet-matching instead of only the IME-composition fallback case; (2) `snippets/parse.ts` had a "tolerant fallback" that silently coerced invalid snippets instead of throwing (a leftover patch from the Part 36 root-cause chase, now a liability for the new custom-snippets feature). Both reverted to upstream's exact behavior. Confirmed the 200-snippet data file and all `DEFAULT_SETTINGS` values are byte-identical/field-identical to upstream — the "settings don't match" perception was entirely the missing CSS, not wrong data. Full detail in `development/handoff_log.md` (Part 38).

**⚠️ Read before assuming this is done:**
1. **Conceal defaults OFF** (matches upstream) — enable it in Settings → LaTeX Suite Features → Concealment & Highlighting, **reload Obsidian**, then check a math block with `\alpha` or `\mathbf{x}` outside the cursor.
2. **The `onInput` revert is the one change this session NOT covered by any automated check** — it's an interactive input-timing path. Re-test `mk`/`dm`/`//`/`sr` snippet expansion after reloading. If snippet expansion regresses, this revert (`latex_suite.ts`) is the first suspect — the pre-revert state is what the user most recently confirmed as working, so treat this as a fidelity fix that needs re-validation, not a risk-free one.

**Still to confirm (needs Obsidian, not CLI):** everything above, plus from Part 37: (1) `mk`/`dm`/`//`/`sr` expansion, (2) 2D/3D plot + `=` eval regression check, (3) a LaTeX Suite setting change taking effect after reload. **Also:** add & verify `kingsleyfong@gmail.com` under GitHub → Settings → Emails — commits are authored with that address but your account's verified email is `ktcfong@uwaterloo.ca`, so GitHub currently can't attribute any commit to you (only the required Claude co-author trailer shows).

### v2.0 Architecture
```
┌──────────────────────────────────────────────┐
│  100% Browser-Native Obsidian Plugin          │
│  ├── CAS: Giac WASM (primary) + CortexJS      │
│  │         + math.js (fallback chain)          │
│  ├── 2D:  function-plot (D3, interval arith)   │
│  ├── 3D:  Three.js + custom GLSL shaders       │
│  └── UI:  CM6 StateField + direct DOM widgets  │
└──────────────────────────────────────────────┘
```

### Completed & Confirmed Working

#### Core Architecture
- [x] Architecture decision (Path C) documented
- [x] Project scaffold (directory structure, package.json, tsconfig, esbuild)
- [x] CLAUDE.md agentic framework (root + repo-v2)
- [x] Type definitions and module interfaces (types.ts)
- [x] Engine module (CortexJS parser, evaluator, CAS, units, persistence)
- [x] Editor module (CM6 StateField decorations, trigger detection, widgets, Tab keymap)
- [x] 2D Renderer (custom canvas, Desmos-style, scroll/pan/zoom)
- [x] 3D Renderer (Three.js, static-image architecture, click-to-interact)
- [x] Auto-ranging module (smart viewport calculation)
- [x] Graph Inspector view + parameter controls
- [x] Settings tab (ranges, precision, auto-range, theme, zoom mode, arrow scale)
- [x] Build + sync pipeline verified (clean build, ~1.4MB bundle)

#### Evaluation Triggers
- [x] `=` exact symbolic evaluation
- [x] `\approx` numeric decimal — **CortexJS rational-pair bug fixed (2026-03-19)**
- [x] `\equiv` algebraic simplification
- [x] `@persist` variable assignment
- [x] `@convert <unit>` unit conversion
- [x] `@steps` — step-by-step CAS solution walkthrough (Giac debug capture, classified into named calculus rules) (2026-03-23)
- [x] Definite integral evaluation: `\int_a^b f(x)\,dx =` renders with notation and numeric result via Simpson's rule (2026-03-23)
- [x] `\sum_{n=lo}^{hi}` and `\prod_{n=lo}^{hi}` — finite summation and product evaluation, capped at 100k iterations (2026-03-24)

#### CAS Triggers (all new, 2026-03-19)
- [x] `@diff` — symbolic differentiation (auto-detects variable)
- [x] `@int` — symbolic integration (auto-detects variable)
- [x] `@solve` — equation solving
- [x] `@factor` — polynomial factoring
- [x] `@px` — partial derivative ∂/∂x
- [x] `@py` — partial derivative ∂/∂y
- [x] `@pz` — partial derivative ∂/∂z
- [x] `@grad` — gradient vector ∇f (auto-detects 2D/3D from variables)
- [x] `@normal` — surface normal vector (explicit z=f(x,y) OR implicit F=0)

#### New CAS Triggers (2026-03-20 — Giac-powered)
- [x] `@limit` — symbolic limit (e.g. `\lim_{x \to 0}`)
- [x] `@taylor` — Taylor series expansion
- [x] `@partfrac` — partial fraction decomposition
- [x] `@expand` — full polynomial/trig expansion
- [x] Additional trig identities: cos²-sin²→cos(2θ), 2sin·cos→sin(2θ) (2026-03-23)
- [x] Sum/difference of cubes factoring: x³±a³ → (x±a)(x²∓ax+a²) (2026-03-23)
- [x] Context-aware CAS error messages when Giac unavailable (2026-03-23)

#### 2D Graphing (`@plot2d`)
- [x] Explicit curves: `y = f(x)`
- [x] Implicit curves: `f(x,y) = c` (marching squares / interval arithmetic)
- [x] Parametric: `(\cos(t), \sin(t))`
- [x] Polar: `r = f(\theta)` — theta vs t variable bug fixed
- [x] Inequalities: `y > f(x)` with shading
- [x] Points: `(5,5)` — filled dot with coordinate label
- [x] Multi-equation overlay (semicolon-separated)
- [x] POIs: roots, extrema, intersections
- [x] Piecewise functions: `\begin{cases}` with conditional branches compiled to nested ternary (2026-03-24)
- [x] Domain restrictions: `\{0 < x < 5\}` suffix clips compiled functions to specified interval (2026-03-24)

#### 3D Graphing (`@plot3d`)
- [x] Explicit surfaces: `z = f(x,y)` — z-clamping to prevent cube overflow
- [x] Implicit surfaces: `F(x,y,z) = 0` — marching cubes, auto z-range
- [x] Parametric 3D curves: `(\cos(t), \sin(t), t/3)` and `\frac{...}{n}` notation
- [x] Vectors: `<1,2,3>` and `\langle a,b,c \rangle`
- [x] 3D Points: `(1,2,3)` — sphere with range-relative radius
- [x] Multi-equation 3D overlay
- [x] 1:1:1 axis scaling (origin-mode and range-center mode)
- [x] Static image + click-to-interact (avoids Chrome 16-context limit)
- [x] 2D expressions promoted to 3D when in `@plot3d` mode
- [x] Default 1:1:1 proportional axis scaling (autoScaleZ3d setting, default: off) (2026-03-23)
- [x] Analytical plane rendering for implicit_3d — planes render as full box-filling polygons, not diamond artifacts from marching cubes (2026-03-23)
- [x] Height-based vertex coloring for explicit_3d surfaces — 5-stop blue→cyan→green→yellow→red gradient by z-value (2026-03-24)

#### Calc 3 Plot Modes
- [x] `@contour` — contour/iso-level curves of f(x,y)
- [x] `@vecfield` — 2D and 3D vector fields with auto-routing
- [x] `@vecfield 0.5` — per-expression arrow scale suffix
- [x] `@gradient` — contour + ∇f arrows
- [x] `@tangent` — surface + tangent plane + point
- [x] `@region` — shaded area between two curves
- [x] `@geom` — 3D geometry mode for vectors

#### Linear Algebra (via `=`)
- [x] Cross product (manual, bypasses CortexJS)
- [x] Determinant, transpose, inverse
- [x] Dot product, matrix multiplication

#### Laplace Transforms (2026-03-24 — Giac-powered)
- [x] `@laplace` — forward Laplace transform (t → s) via Giac WASM
- [x] `@ilaplace` — inverse Laplace transform (s → t) via Giac WASM
- [x] Auto-detects time/frequency variable (isolated `t` or `s`, not inside `\tan`, `\sin`, etc.)

#### ODE Phase Portraits (2026-03-24)
- [x] `@phase` — direction field (gray arrows) + RK4 solution curves from multiple initial conditions
- [x] `@ode` — direction field only (no solution curves)
- [x] Supports `y' = f(x,y)`, `\frac{dy}{dx} = f(x,y)`, and `\dot{y} = f(x,y)` input formats
- [x] RK4 solver with adaptive step limiting, divergence clipping (|y| > 1e6)
- [x] New `engine/ode.ts` module: `solveODE_RK4`, `computeDirectionField`, `generateSolutionCurves`

#### Per-Expression Colors & Line Styles (2026-03-24)
- [x] `#colorname` suffix (red, blue, green, orange, purple, cyan, yellow, pink, white, black, gray)
- [x] `#hexcode` suffix (3-digit and 6-digit hex: `#f00`, `#ff0000`)
- [x] `--` suffix for dashed lines, `..` suffix for dotted lines
- [x] Applied in 2D renderer (stroke color + setLineDash) and 3D renderer (material color via NAMED_COLORS map)
- [x] Color parsing handles both named CSS colors and hex via offscreen canvas fallback

#### Export & UI
- [x] PNG download button on 2D and 3D graph toolbars (2026-03-23)
- [x] Screenshot-to-clipboard button on graph toolbars (2026-03-23)
- [x] Per-slider editable min/max bounds — click to customize range instead of fixed ±10 (2026-03-24)
- [x] WebM animation export — ⏺ record button per slider; captures one full min→max pass at 30fps via `canvas.captureStream()` + `MediaRecorder`; auto-stops at 4 s; downloads `kcl-{var}-anim.webm` (2026-04-06)

#### Scatter Plots, Tables, Regression (2026-04-05)
- [x] `@scatter` — scatter plot from `(x1,y1);(x2,y2);...` data pairs (filled dots on canvas graph)
- [x] `@scatter lin` — linear regression overlay (dashed curve, R² in label)
- [x] `@scatter poly2` — degree-2 polynomial regression
- [x] `@scatter poly3` — degree-3 polynomial regression
- [x] `@scatter exp` — exponential regression `y = a·e^(bx)` (y > 0 data required)
- [x] `@table` — render data as a formatted HTML table with n, x̄, ȳ stats
- [x] Auto-range from data extent (15% padding)
- [x] Regression implemented via least-squares normal equations (Gaussian elimination — no external dep)
- [x] R² goodness-of-fit displayed in graph expression label overlay

### Known Issues
- 3D interactive mode: only one graph interactive at a time (by design — Chrome 16-context limit)
- `giacwasm.js` is 19MB — loaded on plugin startup; no lazy-loading yet
- 3D static snapshot of parametric curves may appear thin; click to interact
- No table/data/regression features
- Piecewise: CortexJS may not parse all `\begin{cases}` forms; string-level preprocessor handles most common patterns
- Summation: only braced bound form `_{n=1}^{10}` supported; unbraced `_1^{10}` falls through to CortexJS

### All Runtime Bugs Fixed (cumulative)
1. **Block decorations RangeError** — ViewPlugin → StateField
2. **Tab re-trigger loop** — `insertPos = trigger.to`
3. **First Tab exits math block** — cursor containment check
4. **z=f(x,y) classified as implicit** — string-level fast path in classifyExpression
5. **Multi-var NaN surface** — always use `new Function` (not CortexJS compiled)
6. **z range defaulted wrong** — sample 20×20 grid for actual z extent
7. **Square/Cube/Root CortexJS heads** — explicit jsonToInfix handlers
8. **Equal vs Assign equation heads** — accept both in buildPlotData
9. **Inspector never populated** — publishInspectorState() added to widgets
10. **Parametric 3D tuple extraction** — Divide/Multiply cases in extractTupleComponents
11. **WebGL context leak race** — destroyed flag guards async toDOM() chain
12. **Black screen on scroll-back** — reset `destroyed = false` in toDOM() (CM6 re-uses same instance)
13. **3D context limit** — Static image architecture: zero persistent WebGL contexts
14. **Polar curves not rendering** — `\theta` → CortexJS symbol "theta", not "t"; theta-aware var detection
15. **3D origin-mode scaling overflow** — `s = 1/max(|extremes|)` not `s = 2/maxSpan`
16. **Explicit 3D mesh escaping cube** — z-clamping to ranges.z in buildExplicit3DMesh
17. **Implicit 3D plane not filling cube** — sign-change z search for auto-range
18. **3D vecfield routing to 2D widget** — heuristic: 3+ semicolons OR z variable → 3D
19. **captureArg mode string** — `@vecfield:0.5` splits correctly in createWidget and preparePlot
20. **\approx shows fraction not decimal** — CortexJS numericValue is rational pair `[-8, 577]`; `forceNumber()` handles array, Decimal, fraction-string, compiled-fn fallbacks
21. **Electron CSP blocks file:// script src** — `giacwasm.js` cannot be loaded via `<script src="file://...">` under Electron's CSP; workaround: read file contents with `fs.readFileSync` and inject as inline `<script>` tag
22. **3D per-axis scaling wrong** — surfaces did not fill the cube when x/y/z ranges differed; fixed by computing per-axis scale factors `(sx, sy, sz)` and applying them independently rather than using a single uniform scale
23. **CortexJS `.latex` property broken for CAS output** — `.latex` on a CortexJS expression object returns mangled or empty strings for some CAS results; replaced with custom `jsonToLatex()` that walks MathJSON directly
24. **3D Z-axis not 1:1:1** — auto-computed z range broke proportional scaling; now defaults to matching x/y range with opt-in autoScaleZ3d setting
25. **Implicit 3D planes render as diamond** — marching cubes produces diamond intersection artifact for linear surfaces; now detects planes analytically and computes exact plane-AABB intersection polygon
26. **`x = 1` renders as horizontal line `y = 1`** — `classifyExpression` was returning `explicit_2d` for `x = f(y)`, so `buildPlotData` extracted the RHS and compiled as `fn(x) = 1` → `y = 1`. Fix: `x = ...` now returns `implicit_2d`; marching squares draws `x - 1 = 0` as a vertical line. Also fixes `x = 1 @plot3d` (was rendering `z = 1` floor instead of `x = 1` plane).

## File Map
```
repo-v2/src/
├── main.ts              ← Plugin entry, settings, commands
├── settings.ts          ← Settings tab UI
├── types.ts             ← All shared types (ExprType, EvalMode, PlotSpec, etc.)
├── engine/
│   ├── index.ts         ← Engine facade (preparePlot, evaluate, persist, convert)
│   ├── parser.ts        ← CortexJS LaTeX→MathJSON, jsonToInfix, compileToFunction
│   ├── evaluator.ts     ← Numeric/symbolic eval + linear algebra intercepts
│   ├── cas.ts           ← Differentiate, integrate, solve, partials, gradient, normal
│   ├── ode.ts           ← ODE RK4 solver, direction fields, solution curves
│   ├── units.ts         ← Unit conversions via math.js
│   └── poi.ts           ← Points of interest (roots, extrema, intersections)
├── renderer/
│   ├── index.ts         ← Renderer facade (create2DGraph, create3DGraph, renderSnapshot)
│   ├── renderer2d.ts    ← Full custom Canvas 2D (Desmos-style, no D3 deps)
│   ├── renderer3d.ts    ← Three.js 3D (explicit, implicit, parametric, vectors, points)
│   ├── auto-range.ts    ← Smart viewport from expression analysis
│   └── colors.ts        ← Color palette
├── editor/
│   ├── index.ts         ← CM6 extensions (exports)
│   ├── triggers.ts      ← Trigger detection (all @modes and special triggers)
│   ├── widgets.ts       ← ResultWidget, Graph2DWidget, Graph3DWidget
│   ├── decorations.ts   ← CM6 StateField decoration manager
│   └── keymap.ts        ← Tab-to-insert keymap
└── views/
    ├── inspector.ts     ← Graph Inspector sidebar
    └── controls.ts      ← Parameter slider controls
```

## Critical Architecture Notes for Future Agents

### CortexJS numericValue is a rational pair for fractions
`ce.parse("-\\frac{8}{577}").N().numericValue` returns `[-8, 577]` (array), NOT a JS number.
Always use `forceNumber()` in evaluator.ts which handles: JS number, rational pair array, Decimal .toNumber(), Decimal string, fraction string parsing, and compiled-fn fallback.

### CortexJS parses \theta as symbol "theta", not "t"
For polar and parametric expressions using `\theta`, check `syms.has("theta")` everywhere you check `syms.has("t")`. Both parser.ts (classifyExpression) and engine/index.ts (polar branch) do this.

### Three.js Y-up convention
Math coordinates (x, y, z) → Three.js (x, z, y). Every place you call `position.set()` must swap y and z.

### CM6 block decorations MUST use StateField
`ViewPlugin.decorations` throws `RangeError: Block decorations may not be specified via plugins` in Obsidian. Use `StateField.define({ provide: f => EditorView.decorations.from(f) })`.

### Chrome ~16 WebGL context limit
Do not create persistent WebGL contexts. Use `renderSnapshot()` (creates context, captures canvas.toDataURL(), destroys context in ~50ms). Keep at most 1 live interactive context at a time.

### captureArg mode strings
`@vecfield 0.5` triggers with mode `"vecfield:0.5"`. Always use `mode.split(":")[0]` for matching and `mode.startsWith("vecfield:")` for detection. preparePlot takes `mode: string`, not `PlotMode`.

### Giac WASM integration (2026-03-20)
- `giac.ts` is the bridge module — initialises Giac via `window.Giac`, exposes `giacCompute(cmd: string): string`
- `cas.ts` and `evaluator.ts` try Giac first for all CAS operations; fall back to CortexJS + manual code if Giac returns an error or is not yet initialised
- `main.ts` init: reads `giacwasm.js` bytes with `fs.readFileSync`, injects as inline `<script>` to satisfy Electron's CSP (`file://` src URLs are blocked)
- `settings.ts`: `enableGiac` boolean toggle; when false, Giac bridge short-circuits and the fallback chain runs immediately
- CAS output LaTeX: uses `jsonToLatex()` (custom MathJSON walker) — do NOT use CortexJS `.latex` property on CAS results

### CortexJS `.latex` is unreliable for CAS output
Use `jsonToLatex(expr.json)` (defined in `parser.ts`) whenever you need a LaTeX string from a CortexJS expression that came back from a CAS operation. The `.latex` getter silently returns wrong/empty strings for several expression forms.

## Next Steps (Priority Order)
1. **Mobile** — touch event handling for 2D pan/zoom
2. **Performance profiling** — Giac 19MB load time; investigate lazy loading
3. **Color picker UI** — visual color selection per curve (currently suffix-only)
4. **Higher-order ODE** — extend @phase to 2nd-order systems
5. **Save/load graph state** — persist zoom level, slider values, interactive angle
