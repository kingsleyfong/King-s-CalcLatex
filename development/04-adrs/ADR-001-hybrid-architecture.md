# ADR-001: Hybrid TypeScript + Python Architecture

## Status: Accepted

## Context
We need to build a math engine for Obsidian that supports:
- Full CAS (symbolic algebra, equation solving, eigenvalues)
- High-fidelity 2D/3D plotting
- LaTeX parsing
- Unit conversions
- Fast inline feedback

## Decision
Use a **hybrid architecture**:
- TypeScript Obsidian plugin for UI/UX
- Python FastAPI server for math computation

## Rationale

### Why not pure JavaScript?
- No mature CAS library exists in JS. CortexJS Compute Engine is incomplete
- No equivalent to SymPy's depth (symbolic solving, eigenvectors, PDE support)
- Plotly.js exists but generating complex figures is easier with Python + numpy

### Why not pure Python?
- Obsidian plugins must be TypeScript/JavaScript
- Python cannot directly interact with CodeMirror 6 or Obsidian's API

### Why FastAPI over Flask?
- v1 used Flask — it works but is synchronous and slow for multiple requests
- FastAPI is async-native, auto-generates OpenAPI docs, and has better type support
- uvicorn provides better performance for the local server use case

### Why Plotly over custom WebGL?
- Desmos uses custom GLSL shaders for GPU rendering — far too complex to replicate
- Plotly provides interactive WebGL 3D graphs out of the box
- `go.Contour` and `go.Isosurface` handle implicit equations robustly
- Dark theme support via `plotly_dark` template

## Consequences
- Requires Python runtime on the user's machine
- Requires starting a background server before Obsidian
- Network latency between plugin and engine (mitigated: localhost only)
- Engine can be upgraded independently of the plugin
