# King's CalcLatex

An Obsidian desktop plugin + local Python engine that transforms Obsidian into a professional engineering math workstation.

## What It Does

- **Inline Evaluation**: Type LaTeX math, append `=` or `\approx`, and the result appears directly in your editor
- **CAS Engine**: Full symbolic computation — solve equations, factor polynomials, eigenvalues, systems of equations
- **2D/3D Graphing**: High-fidelity Plotly graphs rendered inline, with a full Graph Inspector sidebar for deep interaction
- **Unit Conversions**: Engineering unit support built-in
- **Variable Persistence**: Save variables across notes within a session

## Quick Start

1. Run `Start Engine.bat` to launch the Python math engine
2. Open Obsidian and enable Kings CalcLatex in Community Plugins
3. Start writing LaTeX math with triggers

## For Developers / LLM Agents

**Read `PROJECT_STATE.md` first** — it's the canonical source of truth for the project's current status, architecture, and next steps.

The `development/` folder contains structured documentation optimized for fast retrieval by humans and LLMs.

## Project Layout

- `PROJECT_STATE.md` — Read first, update last (every session)
- `CHEATSHEET.md` — Quick reference for end users
- `development/` — Research, architecture, ADRs, specs, testing, roadmap
- `repo/` — Source code monorepo
