# IMPLEMENTATION PLAN: King's CalcLatex v0.1.x

## Goal
The goal is to achieve parity with the original CalcTex plugin by resolving critical rendering issues, fixing matrix operations, and stabilizing the UI.

## Phase 3.1: Parity & Bug Fixes (COMPLETED)
- [x] Implicit Plotting ($x^2+y^2+z^2=9$): Fixed variable detection in engine.py.
- [x] Matrix Cross Multiplication: Exposed `sp.Matrix` to evaluator and fixed `\times`.
- [x] Math Isolation: Implemented global pre-scan for `$ ... $` in editor.ts.
- [x] StateField Architecture: Shifted from ViewPlugin to StateField for stable decoration management.

## Phase 3.2: Immediate Next Steps (FOR NEXT SESSION)

### [BUG] Trigger-on-Click UI Refresh
Clicking any line with math delimiters (`$$` or `$ ... $`) triggers a re-render/creation of all widgets on that line.
- **Location**: `editor.ts` -> `createInlineRenderer`.
- **Context**: Occurs in the `StateField` update logic. Needs to be filtered to avoid re-rendering if content hasn't changed.

### [UI] 3D Graph Interaction Stability
Interaction with 3D iframes sometimes triggers duplicate logic or state loss due to CodeMirror viewport updates.
- **Goal**: Ensure the iframe is "reused" or persistent during drag/rotate.

### [FEATURE] Tab-to-Insert Completion
Indentation often competes with the Tab handler.
- **Implementation**: Hardened the CM6 Keymap with `Prec.highest`.

## Architecture Note: StateField
The plugin now uses a `StateField<DecorationSet>` to manage widgets. This is the canonical CM6 way to ensure widgets are tied to document state and not just "view" volatility.
