# Archive Summary: Kings CalcTex (v1 Prototype)

## Overview & Rationale
`Kings CalcTex` was the initial v1 prototype built to explore mathematical computation and graphing inside Obsidian.

## Technical Architecture (v1)
- **Architecture**: Multi-package monorepo + Python daemon server (`localhost:8000`).
- **Engine**: Python process running SymPy (symbolic CAS) and Plotly (2D/3D graphing).
- **Rendering**: Generated HTML blobs sent over HTTP to Obsidian and rendered inside embedded `<iframe>` elements.

## Why `Kings CalcTex` is Obsolete
1. **Daemon Dependency**: Required a running Python environment and background server process on port 8000.
2. **Fixed Resolution & No Infinite Zoom**: Plotly generated static grid data (500x500 2D, 60³ 3D) with no adaptive interval arithmetic or smooth zoom.
3. **Iframe Sandboxing**: HTML iframes isolated graphs from Obsidian's CSS DOM, destroying theme propagation, keyboard shortcuts, and state management.
4. **Latency**: HTTP round-trips for every keystroke added latency.

## Successor: King's CalcLatex (v2)
`Kings CalcLatex` v2 completely replaced `Kings CalcTex`. It is **100% browser-native** in TypeScript:
- **CAS**: Giac WASM + CortexJS ComputeEngine running in-process (no Python server).
- **2D**: Custom Canvas 2D Desmos-style renderer with 1:1 aspect ratio, adaptive grid, POIs, and marching squares.
- **3D**: Three.js WebGL static image architecture with click-to-interact OrbitControls.
- **UI**: Native CodeMirror 6 `StateField` decorations and direct DOM widgets.
