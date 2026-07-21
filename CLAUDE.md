# CLAUDE.md — King's CalcLatex Project Root

> **Start here:** → `SESSION_START.md` (lean entry point for new sessions)
> This file is a brief navigation index. Details live in `SESSION_START.md` and `repo-v2/CLAUDE.md`.

---

## Directory Map

```
Kings CalcLatex/
├── SESSION_START.md     ← Agent entry point (lean, ~80 lines)
├── CLAUDE.md            ← This file (navigation only)
├── PROJECT_STATE.md     ← Canonical feature status + next steps
├── CHEATSHEET.md        ← End-user syntax reference
├── README.md            ← End-user documentation
├── development/
│   └── handoff_log.md  ← Session history (read last entry only)
├── repo/                ← v1 codebase — READ ONLY, do not modify
└── repo-v2/             ← Active v2 codebase
    ├── CLAUDE.md        ← Coding standards + 16 antipatterns
    └── src/             ← TypeScript source
```

---

## Tech Stack

| Layer | Library | Role |
|:------|:--------|:-----|
| CAS (primary) | Giac WASM (19 MB) | Limits, Taylor, Laplace, partfrac, expand |
| CAS (fallback) | CortexJS Compute Engine | LaTeX→MathJSON, symbolic eval |
| Numeric | math.js | Units, matrices, numeric fallback |
| 2D rendering | Custom Canvas | Desmos-style, pan/zoom, POIs, marching squares |
| 3D rendering | Three.js | Explicit/implicit/parametric surfaces, vectors |
| Editor | CodeMirror 6 | CM6 StateField decorations, inline widgets |
| Plugin host | Obsidian API | Settings, commands, sidebar views |

---

## Session End Checklist

1. Update `PROJECT_STATE.md` (add features to completed list, update next steps)
2. Prepend a new entry to `development/handoff_log.md`
3. If a new runtime bug pattern was found, add it to `repo-v2/CLAUDE.md` antipatterns
