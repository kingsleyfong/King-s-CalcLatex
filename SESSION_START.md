# King's CalcLatex — Session Entry Point

> **Point new agent sessions HERE, not at the full project folder.**
> Load deeper docs only as needed — see the nav table below.

---

## Your Role: CTO Orchestrator

- **Kingsley = CEO.** Take initiative on individual implementation decisions; ask only when genuinely ambiguous.
- **Spawn parallel Sonnet subagents** for independent low-level workstreams (implementation, file writes, validation, search). Always specify `model: "sonnet"` in subagent tool calls.
- **Use Opus** for planning/architecture agents that need deep reasoning.
- **AUTOMATIC PER-CYCLE DOC UPDATE HOOK**: After EVERY prompt & response cycle, automatically update `PROJECT_STATE.md`, `development/handoff_log.md`, and `repo-v2/CLAUDE.md`.
- Never put two unrelated tasks in the same subagent's context window.

---

## Project Status: 🟢 WORKING (2026-04-06)

**King's CalcLatex v2** — 100% browser-native Obsidian plugin. Inline LaTeX evaluation + high-fidelity 2D/3D graphing. No backend. TypeScript + CM6 + Three.js + Giac WASM.

---

## Navigation Index

| What you need | Load this | Ignore |
|:---|:---|:---|
| Feature list / next priorities | `PROJECT_STATE.md` §Completed + §Next Steps | §Known Issues unless debugging |
| Last session context | `development/handoff_log.md` — **last entry only** | All earlier entries |
| Coding rules + antipatterns | `repo-v2/CLAUDE.md` | `development/` subfolders |
| User syntax reference | `CHEATSHEET.md` | |
| All type contracts | `repo-v2/src/types.ts` | |

---

## Architecture (60-second version)

```
$latex @trigger$  →  CM6 StateField  →  Widget.toDOM()
                                              ↓
                                engine.preparePlot / evaluate()
                                    ↓              ↓
                               Giac WASM    CortexJS + math.js
                                       ↓
                            renderer2d.create() / renderer3d.renderSnapshot()
                                ↓                    ↓
                           Canvas 2D (pan/zoom)   Three.js snapshot + click-to-interact
```

**Four hard constraints** (full list: `repo-v2/CLAUDE.md` antipatterns):
1. CM6 block widgets → `StateField` only — never `ViewPlugin`
2. 3D graphs → static `<img>` snapshot + click-to-interact — never persistent WebGL contexts
3. No iframes, no `fetch()`, no network — everything in-browser
4. Engine never throws — returns `{ ok: true, value } | { ok: false, error }`

---

## Key File Map

```
repo-v2/src/
├── main.ts               Plugin entry · renderer2d/3d facade objects
├── types.ts              ALL shared types (ExprType, PlotMode, PlotData, GraphHandle…)
├── engine/
│   ├── index.ts          preparePlot(), evaluate(), buildScatterSpec(), parseDataPoints()
│   ├── evaluator.ts      Numeric eval + Giac/CortexJS dispatch
│   ├── cas.ts            Differentiate, integrate, solve, Laplace
│   ├── giac.ts           Giac WASM bridge (giacCompute, giacLaplace, etc.)
│   └── ode.ts            RK4 solver, direction fields
├── editor/
│   ├── triggers.ts       ALL trigger pattern defs (@plot2d, @scatter, @diff, etc.)
│   ├── widgets.ts        ResultWidget · Graph2DWidget · Graph3DWidget · TableWidget
│   ├── decorations.ts    CM6 StateField + widget routing switch
│   └── keymap.ts         Tab-to-insert result
├── renderer/
│   ├── renderer2d.ts     Custom Canvas 2D (Desmos-style, 1:1 aspect, POIs, pan/zoom)
│   └── renderer3d.ts     Three.js 3D (explicit, implicit, parametric, vectors, points)
└── styles.css            All CSS — .kcl-* prefix
```

**Build:** `cd repo-v2 && npm run build`  
**Deploy:** `cp repo-v2/main.js repo-v2/styles.css .obsidian/plugins/kings-calclatex/`

---

## Before Touching Code

Read `repo-v2/CLAUDE.md` — 16 numbered antipatterns from real runtime bugs. **Required** before editing `editor/` or `renderer/`.
