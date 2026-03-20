# CLAUDE.md — King's CalcLatex Project Root

> **This file provides top-level context for any agent working on King's CalcLatex.**
> For code-specific instructions, see `repo-v2/CLAUDE.md`.

## Project Overview

King's CalcLatex is an Obsidian desktop plugin that turns Obsidian into a professional engineering math workstation. Users type LaTeX with trigger suffixes (`=`, `\approx`, `@plot2d`, `@plot3d`), and results/graphs appear inline in the editor.

**v2.0** is a complete ground-up rewrite using 100% browser-native computation. There is no backend server.

## Directory Map

```
Kings CalcLatex/
├── CLAUDE.md              ← YOU ARE HERE
├── PROJECT_STATE.md       ← Canonical state (read first, update last)
├── README.md              ← End-user documentation
├── CHEATSHEET.md          ← Quick reference
├── development/           ← LLM-optimized design docs
│   ├── 01-product/        ← Vision, goals
│   ├── 02-research/       ← Engine comparisons, prior art
│   ├── 03-architecture/   ← System design docs
│   ├── 04-adrs/           ← Architecture Decision Records
│   ├── 05-specs/          ← Implementation specs
│   ├── 06-testing/        ← Test cases, showcase equations
│   ├── 07-roadmap/        ← Roadmap, task tracking
│   └── handoff_log.md     ← Session handoff notes
├── repo/                  ← OLD v1 codebase (reference only, DO NOT MODIFY)
├── repo-v2/               ← NEW v2 codebase (active development)
│   ├── CLAUDE.md          ← Code-level agent instructions
│   ├── src/
│   │   ├── main.ts        ← Plugin entry point
│   │   ├── settings.ts    ← Settings tab
│   │   ├── types.ts       ← Shared type definitions
│   │   ├── engine/        ← CAS + expression evaluation (CortexJS, math.js)
│   │   ├── renderer/      ← Graph rendering (function-plot 2D, Three.js 3D)
│   │   ├── editor/        ← CM6 integration (triggers, widgets, decorations)
│   │   └── views/         ← Graph Inspector, parameter controls
│   ├── styles/main.css    ← Plugin styles
│   └── package.json       ← Dependencies
└── scripts/               ← Build/deploy scripts
```

## Tech Stack (v2.0)

| Layer | Technology | Role |
|-------|-----------|------|
| CAS / Parsing | CortexJS Compute Engine | LaTeX → MathJSON → symbolic eval |
| Numeric | math.js | Matrices, units, numeric computation |
| 2D Rendering | function-plot (D3-based) | Interval arithmetic, auto-range, implicit curves |
| 3D Rendering | Three.js + custom shaders | WebGL surfaces, GPU-evaluated math |
| Editor | CodeMirror 6 ViewPlugin | Inline decorations, widget lifecycle |
| Plugin | Obsidian API | Settings, commands, sidebar views |

## Agent Session Protocol

### At Session Start
1. Read `PROJECT_STATE.md` — current status, known issues, next steps
2. Read `repo-v2/CLAUDE.md` — coding standards, antipatterns
3. Read `development/handoff_log.md` — what happened last session

### During Session
- Follow the module boundaries in `repo-v2/CLAUDE.md`
- Test with showcase equations before declaring work complete
- If you encounter a new failure pattern, add it to `repo-v2/CLAUDE.md` antipatterns

### At Session End
1. Update `PROJECT_STATE.md` with current status
2. Update `development/handoff_log.md` with session summary
3. List any known issues discovered

## Key Design Decisions

1. **No backend server** — All computation in-browser via JS/TS libraries
2. **No iframes** — Direct DOM rendering (Canvas/SVG/WebGL) inside CM6 widgets
3. **Persistent widgets** — Decorations mapped through changes, never rebuilt from scratch
4. **Renderer separation** — Widget classes are thin; renderer module owns all graph logic
5. **Result-type error handling** — Engine returns `{ ok, value } | { ok, error }`, never throws
6. **Future CAS upgrade path** — Architecture supports lazy-loading Giac WASM for advanced CAS
