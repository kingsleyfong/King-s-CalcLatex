/**
 * King's CalcLatex v2 — 2D Graph Renderer (Custom Canvas)
 *
 * Desmos-style 2D graphing with:
 * - 1:1 aspect ratio (always — single scale value for both axes)
 * - Origin-crossing bold axes with arrows
 * - Adaptive grid (major + minor) with dynamic ticks on zoom
 * - Smooth scroll-to-zoom (point-anchored) + drag-to-pan
 * - Hover coordinates with vertical crosshair and nearest-curve snapping
 * - Points of interest (roots, extrema, intersections)
 * - Inequality shading (semi-transparent fill)
 * - Marching squares for implicit curves
 * - Parametric and polar curve support
 * - Dark/light theme
 *
 * NO iframes. NO SVG/D3. Pure Canvas 2D.
 */

import type { PlotSpec, PlotData, GraphHandle } from "../types";
import { COLORS } from "./colors";
import { detectPOIs, type POI } from "../engine/poi";

// ── Constants ────────────────────────────────────────────────────────

const MIN_SCALE = 0.0005;
const MAX_SCALE = 1e8;

// ── Theme Helpers ────────────────────────────────────────────────────

interface Theme {
  bg: string;
  minorGrid: string;
  majorGrid: string;
  axis: string;
  tickText: string;
  traceBg: string;
  traceText: string;
}

const DARK_THEME: Theme = {
  bg: "#1e1e1e",
  minorGrid: "rgba(255,255,255,0.04)",
  majorGrid: "rgba(255,255,255,0.10)",
  axis: "#bbb",
  tickText: "#999",
  traceBg: "rgba(0,0,0,0.78)",
  traceText: "#fff",
};

const LIGHT_THEME: Theme = {
  bg: "#ffffff",
  minorGrid: "rgba(0,0,0,0.045)",
  majorGrid: "rgba(0,0,0,0.12)",
  axis: "#333",
  tickText: "#666",
  traceBg: "rgba(255,255,255,0.92)",
  traceText: "#111",
};

// ── Math Helpers ─────────────────────────────────────────────────────

function niceStep(roughStep: number): number {
  if (roughStep <= 0 || !isFinite(roughStep)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const norm = roughStep / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}

function formatTick(value: number): string {
  if (Math.abs(value) < 1e-12) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e5 || (abs < 0.01 && abs > 0))
    return value.toExponential(1);
  if (Number.isInteger(value)) return String(value);
  return parseFloat(value.toPrecision(4)).toString();
}

// ── Marching Squares ─────────────────────────────────────────────────

const MS_CASES: number[][][] = [
  [],
  [[3, 2]],
  [[2, 1]],
  [[3, 1]],
  [[1, 0]],
  [[3, 0], [1, 2]],
  [[2, 0]],
  [[3, 0]],
  [[0, 3]],
  [[0, 2]],
  [[0, 1], [2, 3]],
  [[0, 1]],
  [[1, 3]],
  [[1, 2]],
  [[2, 3]],
  [],
];

function interp(v0: number, v1: number): number {
  if (v0 === v1) return 0.5;
  return v0 / (v0 - v1);
}

// ── Main Entry ───────────────────────────────────────────────────────

export function create2DGraph(
  container: HTMLElement,
  spec: PlotSpec,
  isDark: boolean,
  showPOIs: boolean = true,
): GraphHandle {
  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  // ── Canvas Setup ────────────────────────────────────────────────

  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  // ── View State ──────────────────────────────────────────────────

  let logicalWidth = container.clientWidth || 400;
  let logicalHeight = container.clientHeight || 300;

  const xSpan0 = spec.ranges.x[1] - spec.ranges.x[0];
  const ySpan0 = spec.ranges.y[1] - spec.ranges.y[0];
  const maxSpan0 = Math.max(xSpan0, ySpan0);

  let centerX = (spec.ranges.x[0] + spec.ranges.x[1]) / 2;
  let centerY = (spec.ranges.y[0] + spec.ranges.y[1]) / 2;
  let scale = Math.min(logicalWidth, logicalHeight) / (maxSpan0 * 1.1);

  const initCenterX = centerX;
  const initCenterY = centerY;
  const initScale = scale;

  let currentSpec = spec;

  // ── Interaction State ───────────────────────────────────────────

  let dragging = false;
  let dragStartPx = 0;
  let dragStartPy = 0;
  let dragStartCX = 0;
  let dragStartCY = 0;
  let tracePixelX: number | null = null;
  let tracePixelY: number | null = null;
  let destroyed = false;
  let rafPending = false;
  let gridMode: "all" | "major" | "none" = "all";
  let poisEnabled = showPOIs;

  // POI cache
  let cachedPOIs: POI[] | null = null;
  let poiDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Coordinate Transforms ──────────────────────────────────────

  function mathToPixelX(mx: number): number {
    return (mx - centerX) * scale + logicalWidth / 2;
  }
  function mathToPixelY(my: number): number {
    return logicalHeight / 2 - (my - centerY) * scale;
  }
  function pixelToMathX(px: number): number {
    return (px - logicalWidth / 2) / scale + centerX;
  }
  function pixelToMathY(py: number): number {
    return (logicalHeight / 2 - py) / scale + centerY;
  }

  // ── Sizing ─────────────────────────────────────────────────────

  function syncCanvasSize(): void {
    logicalWidth = container.clientWidth || 400;
    logicalHeight = container.clientHeight || 300;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
  }

  syncCanvasSize();

  // ── POI Computation ─────────────────────────────────────────────

  function recomputePOIs(): void {
    if (poiDebounceTimer !== null) clearTimeout(poiDebounceTimer);
    poiDebounceTimer = setTimeout(() => {
      poiDebounceTimer = null;
      if (!poisEnabled) { cachedPOIs = null; return; }
      try {
        cachedPOIs = detectPOIs(currentSpec);
      } catch {
        cachedPOIs = [];
      }
      scheduleRender();
    }, 200);
  }

  // Initial POI computation
  recomputePOIs();

  // ── Render ─────────────────────────────────────────────────────

  function render(): void {
    if (destroyed) return;
    rafPending = false;

    syncCanvasSize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    const xMin = pixelToMathX(0);
    const xMax = pixelToMathX(logicalWidth);
    const yMax = pixelToMathY(0);
    const yMin = pixelToMathY(logicalHeight);

    const majorStep = niceStep(80 / scale);
    const minorStep = majorStep / 5;

    drawGrid(xMin, xMax, yMin, yMax, majorStep, minorStep);
    drawAxes(xMin, xMax, yMin, yMax);
    drawTickLabels(xMin, xMax, yMin, yMax, majorStep);
    drawTraces(xMin, xMax, yMin, yMax);
    if (poisEnabled && cachedPOIs) drawPOIs(cachedPOIs);
    drawTraceOverlay();
    drawExpressionLabels();
  }

  // ── Grid ───────────────────────────────────────────────────────

  function drawGrid(
    xMin: number, xMax: number, yMin: number, yMax: number,
    majorStep: number, minorStep: number,
  ): void {
    if (gridMode === "none") return;

    if (gridMode === "all") {
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = theme.minorGrid;
      ctx.beginPath();

      let v = Math.floor(xMin / minorStep) * minorStep;
      for (; v <= xMax; v += minorStep) {
        const rounded = Math.round(v / majorStep) * majorStep;
        if (Math.abs(v - rounded) < minorStep * 0.1) continue;
        const px = mathToPixelX(v);
        ctx.moveTo(px, 0);
        ctx.lineTo(px, logicalHeight);
      }
      v = Math.floor(yMin / minorStep) * minorStep;
      for (; v <= yMax; v += minorStep) {
        const rounded = Math.round(v / majorStep) * majorStep;
        if (Math.abs(v - rounded) < minorStep * 0.1) continue;
        const py = mathToPixelY(v);
        ctx.moveTo(0, py);
        ctx.lineTo(logicalWidth, py);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = theme.majorGrid;
    ctx.beginPath();

    let v = Math.floor(xMin / majorStep) * majorStep;
    for (; v <= xMax; v += majorStep) {
      if (Math.abs(v) < majorStep * 0.01) continue;
      const px = mathToPixelX(v);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, logicalHeight);
    }
    v = Math.floor(yMin / majorStep) * majorStep;
    for (; v <= yMax; v += majorStep) {
      if (Math.abs(v) < majorStep * 0.01) continue;
      const py = mathToPixelY(v);
      ctx.moveTo(0, py);
      ctx.lineTo(logicalWidth, py);
    }
    ctx.stroke();
  }

  // ── Axes ───────────────────────────────────────────────────────

  function drawAxes(
    xMin: number, xMax: number, yMin: number, yMax: number,
  ): void {
    ctx.strokeStyle = theme.axis;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";

    if (yMin <= 0 && yMax >= 0) {
      const py0 = mathToPixelY(0);
      ctx.beginPath();
      ctx.moveTo(0, py0);
      ctx.lineTo(logicalWidth, py0);
      ctx.stroke();
      drawArrow(logicalWidth - 2, py0, "right");
    }

    if (xMin <= 0 && xMax >= 0) {
      const px0 = mathToPixelX(0);
      ctx.beginPath();
      ctx.moveTo(px0, 0);
      ctx.lineTo(px0, logicalHeight);
      ctx.stroke();
      drawArrow(px0, 2, "up");
    }
  }

  function drawArrow(x: number, y: number, dir: "right" | "up"): void {
    ctx.fillStyle = theme.axis;
    ctx.beginPath();
    const s = 6;
    if (dir === "right") {
      ctx.moveTo(x, y);
      ctx.lineTo(x - s, y - s * 0.5);
      ctx.lineTo(x - s, y + s * 0.5);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x - s * 0.5, y + s);
      ctx.lineTo(x + s * 0.5, y + s);
    }
    ctx.fill();
  }

  // ── Tick Labels ────────────────────────────────────────────────

  function drawTickLabels(
    xMin: number, xMax: number, yMin: number, yMax: number,
    majorStep: number,
  ): void {
    ctx.fillStyle = theme.tickText;
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    const py0 = mathToPixelY(0);
    const px0 = mathToPixelX(0);

    const xTickY = (py0 >= 0 && py0 <= logicalHeight)
      ? Math.min(Math.max(py0 + 16, 14), logicalHeight - 4)
      : logicalHeight - 6;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    let v = Math.ceil(xMin / majorStep) * majorStep;
    for (; v <= xMax; v += majorStep) {
      const rounded = Math.round(v / majorStep) * majorStep;
      if (Math.abs(rounded) < majorStep * 0.01) continue;
      const px = mathToPixelX(rounded);
      if (px < 10 || px > logicalWidth - 10) continue;
      ctx.fillText(formatTick(rounded), px, xTickY);

      if (py0 >= 0 && py0 <= logicalHeight) {
        ctx.strokeStyle = theme.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py0 - 3);
        ctx.lineTo(px, py0 + 3);
        ctx.stroke();
      }
    }

    const yTickX = (px0 >= 0 && px0 <= logicalWidth)
      ? Math.max(Math.min(px0 - 8, logicalWidth - 10), 5)
      : 8;

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    v = Math.ceil(yMin / majorStep) * majorStep;
    for (; v <= yMax; v += majorStep) {
      const rounded = Math.round(v / majorStep) * majorStep;
      if (Math.abs(rounded) < majorStep * 0.01) continue;
      const py = mathToPixelY(rounded);
      if (py < 10 || py > logicalHeight - 10) continue;
      ctx.fillText(formatTick(rounded), yTickX, py);

      if (px0 >= 0 && px0 <= logicalWidth) {
        ctx.strokeStyle = theme.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px0 - 3, py);
        ctx.lineTo(px0 + 3, py);
        ctx.stroke();
      }
    }

    ctx.fillStyle = theme.tickText;
    ctx.font = "italic 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    if (yMin <= 0 && yMax >= 0) {
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("x", logicalWidth - 10, py0 - 6);
    }
    if (xMin <= 0 && xMax >= 0) {
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("y", px0 + 8, 8);
    }
  }

  // ── Curve Drawing ──────────────────────────────────────────────

  function drawTraces(
    xMin: number, xMax: number, yMin: number, yMax: number,
  ): void {
    // Region fill drawn first so boundary curves appear on top
    const regionItems = currentSpec.data.filter(d => d.type === "region_2d");
    if (regionItems.length >= 2) {
      const idx0 = currentSpec.data.indexOf(regionItems[0]);
      drawRegionFill(regionItems[0], regionItems[1], COLORS[idx0 % COLORS.length]);
    }

    for (let i = 0; i < currentSpec.data.length; i++) {
      const pd = currentSpec.data[i];
      const color = COLORS[i % COLORS.length];
      try {
        switch (pd.type) {
          case "explicit_2d":
            drawExplicit(pd, color);
            break;
          case "implicit_2d":
            drawImplicit(pd, color, xMin, xMax, yMin, yMax);
            break;
          case "parametric_2d":
            drawParametric(pd, color);
            break;
          case "polar":
            drawPolar(pd, color);
            break;
          case "inequality_2d":
            drawInequality(pd, color);
            break;
          case "point_2d":
            drawPoint(pd, color);
            break;
          case "contour_2d":
            drawContour(pd, color, xMin, xMax, yMin, yMax);
            break;
          case "vector_field_2d":
            drawVectorField2D(pd, color, xMin, xMax, yMin, yMax);
            break;
          case "region_2d":
            drawExplicit(pd, color);
            break;
          default:
            break;
        }
      } catch {
        // Skip trace on error
      }
    }
  }

  function drawExplicit(pd: PlotData, color: string): void {
    const fn = pd.compiledFns[0];
    if (!fn) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    let moved = false;
    let prevPy = NaN;

    for (let px = 0; px <= logicalWidth; px += 0.5) {
      const mx = pixelToMathX(px);
      let my: number;
      try { my = fn(mx); } catch { moved = false; continue; }
      if (!isFinite(my)) { moved = false; continue; }

      const py = mathToPixelY(my);
      if (moved && Math.abs(py - prevPy) > logicalHeight * 1.5) {
        moved = false;
      }
      if (!moved) {
        ctx.moveTo(px, py);
        moved = true;
      } else {
        ctx.lineTo(px, py);
      }
      prevPy = py;
    }
    ctx.stroke();
  }

  function drawImplicit(
    pd: PlotData, color: string,
    xMin: number, xMax: number, yMin: number, yMax: number,
  ): void {
    const fn = pd.compiledFns[0];
    if (!fn) return;

    const cellPixels = 2;
    const cellMath = cellPixels / scale;
    let nx = Math.ceil((xMax - xMin) / cellMath);
    let ny = Math.ceil((yMax - yMin) / cellMath);
    nx = Math.min(nx, 500);
    ny = Math.min(ny, 500);
    if (nx < 2 || ny < 2) return;

    const dx = (xMax - xMin) / nx;
    const dy = (yMax - yMin) / ny;

    const values = new Float32Array((nx + 1) * (ny + 1));
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= ny; j++) {
        const x = xMin + i * dx;
        const y = yMin + j * dy;
        try { values[i * (ny + 1) + j] = fn(x, y); }
        catch { values[i * (ny + 1) + j] = NaN; }
      }
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x0 = xMin + i * dx;
        const y0 = yMin + j * dy;

        const v00 = values[i * (ny + 1) + j];
        const v10 = values[(i + 1) * (ny + 1) + j];
        const v11 = values[(i + 1) * (ny + 1) + (j + 1)];
        const v01 = values[i * (ny + 1) + (j + 1)];

        if (isNaN(v00) || isNaN(v10) || isNaN(v11) || isNaN(v01)) continue;

        let caseIdx = 0;
        if (v00 > 0) caseIdx |= 1;
        if (v10 > 0) caseIdx |= 2;
        if (v11 > 0) caseIdx |= 4;
        if (v01 > 0) caseIdx |= 8;

        const segments = MS_CASES[caseIdx];
        if (!segments || segments.length === 0) continue;

        function edgePoint(edge: number): [number, number] {
          switch (edge) {
            case 0: { const t = interp(v01, v11); return [x0 + t * dx, y0 + dy]; }
            case 1: { const t = interp(v11, v10); return [x0 + dx, y0 + dy - t * dy]; }
            case 2: { const t = interp(v00, v10); return [x0 + t * dx, y0]; }
            case 3: { const t = interp(v01, v00); return [x0, y0 + dy - t * dy]; }
            default: return [x0, y0];
          }
        }

        for (const seg of segments) {
          const [mx1, my1] = edgePoint(seg[0]);
          const [mx2, my2] = edgePoint(seg[1]);
          ctx.moveTo(mathToPixelX(mx1), mathToPixelY(my1));
          ctx.lineTo(mathToPixelX(mx2), mathToPixelY(my2));
        }
      }
    }
    ctx.stroke();
  }

  function drawParametric(pd: PlotData, color: string): void {
    if (pd.compiledFns.length < 2) return;
    const fnX = pd.compiledFns[0];
    const fnY = pd.compiledFns[1];

    const tRange = currentSpec.ranges.t || [-2 * Math.PI, 2 * Math.PI];
    const samples = 2000;
    const dt = (tRange[1] - tRange[0]) / (samples - 1);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    let moved = false;
    for (let i = 0; i < samples; i++) {
      const t = tRange[0] + i * dt;
      let x: number, y: number;
      try { x = fnX(t); y = fnY(t); } catch { moved = false; continue; }
      if (!isFinite(x) || !isFinite(y)) { moved = false; continue; }
      const px = mathToPixelX(x);
      const py = mathToPixelY(y);
      if (!moved) { ctx.moveTo(px, py); moved = true; }
      else { ctx.lineTo(px, py); }
    }
    ctx.stroke();
  }

  function drawPolar(pd: PlotData, color: string): void {
    const fn = pd.compiledFns[0];
    if (!fn) return;

    const tRange = currentSpec.ranges.t || [0, 2 * Math.PI];
    const samples = 2000;
    const dt = (tRange[1] - tRange[0]) / (samples - 1);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    let moved = false;
    for (let i = 0; i < samples; i++) {
      const theta = tRange[0] + i * dt;
      let r: number;
      try { r = fn(theta); } catch { moved = false; continue; }
      if (!isFinite(r)) { moved = false; continue; }
      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);
      const px = mathToPixelX(x);
      const py = mathToPixelY(y);
      if (!moved) { ctx.moveTo(px, py); moved = true; }
      else { ctx.lineTo(px, py); }
    }
    ctx.stroke();
  }

  // ── Point ───────────────────────────────────────────────────────

  function drawPoint(pd: PlotData, color: string): void {
    if (pd.compiledFns.length < 2) return;
    const px_val = pd.compiledFns[0]();
    const py_val = pd.compiledFns[1]();
    if (!isFinite(px_val) || !isFinite(py_val)) return;

    const px = mathToPixelX(px_val);
    const py = mathToPixelY(py_val);

    // Filled dot with background border (matches POI root style)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = theme.bg;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Coordinate label
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      `(${parseFloat(px_val.toPrecision(4))}, ${parseFloat(py_val.toPrecision(4))})`,
      px + 8, py - 4,
    );
  }

  // ── Inequality Shading ──────────────────────────────────────────

  function drawInequality(pd: PlotData, color: string): void {
    const fn = pd.compiledFns[0];
    if (!fn || !pd.inequality) return;

    const { operator } = pd.inequality;
    const isStrict = operator === ">" || operator === "<";
    const isAbove = operator === ">" || operator === ">=";

    // Draw the boundary curve first
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (isStrict) {
      ctx.setLineDash([6, 4]);
    }

    ctx.beginPath();
    let moved = false;
    let prevPy = NaN;

    for (let px = 0; px <= logicalWidth; px += 0.5) {
      const mx = pixelToMathX(px);
      let my: number;
      try { my = fn(mx); } catch { moved = false; continue; }
      if (!isFinite(my)) { moved = false; continue; }
      const py = mathToPixelY(my);
      if (moved && Math.abs(py - prevPy) > logicalHeight * 1.5) moved = false;
      if (!moved) { ctx.moveTo(px, py); moved = true; }
      else { ctx.lineTo(px, py); }
      prevPy = py;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw shaded region (iterate x pixels, fill vertical strips)
    // Parse the color hex to get rgba with alpha
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    ctx.fillStyle = `rgba(${r},${g},${b},0.20)`;

    for (let px = 0; px < logicalWidth; px += 1) {
      const mx = pixelToMathX(px);
      let my: number;
      try { my = fn(mx); } catch { continue; }
      if (!isFinite(my)) continue;

      const curvePy = mathToPixelY(my);

      if (isAbove) {
        // Shade from curve up to top of canvas
        const top = 0;
        const height = curvePy - top;
        if (height > 0) ctx.fillRect(px, top, 1, height);
      } else {
        // Shade from curve down to bottom of canvas
        const height = logicalHeight - curvePy;
        if (height > 0) ctx.fillRect(px, curvePy, 1, height);
      }
    }
  }

  // ── Contour Lines ────────────────────────────────────────────────

  function drawContour(
    pd: PlotData, color: string,
    xMin: number, xMax: number, yMin: number, yMax: number,
  ): void {
    const fn = pd.compiledFns[0];
    if (!fn) return;

    const cellPixels = 3;
    const cellMath = cellPixels / scale;
    let nx = Math.ceil((xMax - xMin) / cellMath);
    let ny = Math.ceil((yMax - yMin) / cellMath);
    nx = Math.min(nx, 300);
    ny = Math.min(ny, 300);
    if (nx < 2 || ny < 2) return;

    const dx = (xMax - xMin) / nx;
    const dy = (yMax - yMin) / ny;

    const values = new Float32Array((nx + 1) * (ny + 1));
    let zLo = Infinity, zHi = -Infinity;
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= ny; j++) {
        const x = xMin + i * dx;
        const y = yMin + j * dy;
        let v: number;
        try { v = fn(x, y); } catch { v = NaN; }
        values[i * (ny + 1) + j] = v;
        if (isFinite(v)) {
          if (v < zLo) zLo = v;
          if (v > zHi) zHi = v;
        }
      }
    }

    if (!isFinite(zLo) || !isFinite(zHi) || zLo === zHi) return;

    const nLevels = 12;
    const step = niceStep((zHi - zLo) / nLevels);
    const levels: number[] = [];
    let lv = Math.ceil(zLo / step) * step;
    for (; lv <= zHi; lv += step) levels.push(lv);
    if (levels.length === 0) return;

    const cr = parseInt(color.slice(1, 3), 16);
    const cg = parseInt(color.slice(3, 5), 16);
    const cb = parseInt(color.slice(5, 7), 16);

    for (let li = 0; li < levels.length; li++) {
      const level = levels[li];
      const alpha = 0.3 + 0.7 * (li / Math.max(levels.length - 1, 1));

      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(2)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const v00 = values[i * (ny + 1) + j] - level;
          const v10 = values[(i + 1) * (ny + 1) + j] - level;
          const v11 = values[(i + 1) * (ny + 1) + (j + 1)] - level;
          const v01 = values[i * (ny + 1) + (j + 1)] - level;

          if (isNaN(v00) || isNaN(v10) || isNaN(v11) || isNaN(v01)) continue;

          let caseIdx = 0;
          if (v00 > 0) caseIdx |= 1;
          if (v10 > 0) caseIdx |= 2;
          if (v11 > 0) caseIdx |= 4;
          if (v01 > 0) caseIdx |= 8;

          const segments = MS_CASES[caseIdx];
          if (!segments || segments.length === 0) continue;

          const x0 = xMin + i * dx;
          const y0 = yMin + j * dy;

          for (const seg of segments) {
            const [mx1, my1] = contourEdge(seg[0], x0, y0, dx, dy, v00, v10, v11, v01);
            const [mx2, my2] = contourEdge(seg[1], x0, y0, dx, dy, v00, v10, v11, v01);
            ctx.moveTo(mathToPixelX(mx1), mathToPixelY(my1));
            ctx.lineTo(mathToPixelX(mx2), mathToPixelY(my2));
          }
        }
      }
      ctx.stroke();
    }
  }

  function contourEdge(
    edge: number,
    x0: number, y0: number, dx: number, dy: number,
    v00: number, v10: number, v11: number, v01: number,
  ): [number, number] {
    switch (edge) {
      case 0: { const t = interp(v01, v11); return [x0 + t * dx, y0 + dy]; }
      case 1: { const t = interp(v11, v10); return [x0 + dx, y0 + dy - t * dy]; }
      case 2: { const t = interp(v00, v10); return [x0 + t * dx, y0]; }
      case 3: { const t = interp(v01, v00); return [x0, y0 + dy - t * dy]; }
      default: return [x0, y0];
    }
  }

  // ── Vector Field 2D ─────────────────────────────────────────────

  function drawVectorField2D(
    pd: PlotData, color: string,
    xMin: number, xMax: number, yMin: number, yMax: number,
  ): void {
    if (pd.compiledFns.length < 2) return;
    const fnP = pd.compiledFns[0];
    const fnQ = pd.compiledFns[1];

    const gridN = 16;
    const dx = (xMax - xMin) / gridN;
    const dy = (yMax - yMin) / gridN;

    const vecs: { x: number; y: number; vx: number; vy: number }[] = [];
    let maxMag = 0;

    for (let i = 0; i < gridN; i++) {
      for (let j = 0; j < gridN; j++) {
        const x = xMin + (i + 0.5) * dx;
        const y = yMin + (j + 0.5) * dy;
        let vx: number, vy: number;
        try { vx = fnP(x, y); vy = fnQ(x, y); } catch { continue; }
        if (!isFinite(vx) || !isFinite(vy)) continue;
        const mag = Math.sqrt(vx * vx + vy * vy);
        if (mag > maxMag) maxMag = mag;
        vecs.push({ x, y, vx, vy });
      }
    }

    if (maxMag === 0 || vecs.length === 0) return;

    const arrowScale = Math.min(dx, dy) * 0.45 * (currentSpec.arrowScale ?? 1.0);

    for (const { x, y, vx, vy } of vecs) {
      const mag = Math.sqrt(vx * vx + vy * vy);
      if (mag < maxMag * 1e-6) continue;

      const nx = (vx / maxMag) * arrowScale;
      const ny = (vy / maxMag) * arrowScale;

      const px1 = mathToPixelX(x);
      const py1 = mathToPixelY(y);
      const px2 = mathToPixelX(x + nx);
      const py2 = mathToPixelY(y + ny);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();

      const angle = Math.atan2(py2 - py1, px2 - px1);
      const headLen = 4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px2, py2);
      ctx.lineTo(
        px2 - headLen * Math.cos(angle - 0.45),
        py2 - headLen * Math.sin(angle - 0.45),
      );
      ctx.lineTo(
        px2 - headLen * Math.cos(angle + 0.45),
        py2 - headLen * Math.sin(angle + 0.45),
      );
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── Region Fill (between two curves) ─────────────────────────────

  function drawRegionFill(pd1: PlotData, pd2: PlotData, color: string): void {
    const fn1 = pd1.compiledFns[0];
    const fn2 = pd2.compiledFns[0];
    if (!fn1 || !fn2) return;

    const cr = parseInt(color.slice(1, 3), 16);
    const cg = parseInt(color.slice(3, 5), 16);
    const cb = parseInt(color.slice(5, 7), 16);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.20)`;

    for (let px = 0; px < logicalWidth; px += 1) {
      const mx = pixelToMathX(px);
      let y1: number, y2: number;
      try { y1 = fn1(mx); y2 = fn2(mx); } catch { continue; }
      if (!isFinite(y1) || !isFinite(y2)) continue;

      const py1 = mathToPixelY(y1);
      const py2 = mathToPixelY(y2);
      const top = Math.min(py1, py2);
      const bottom = Math.max(py1, py2);
      if (bottom - top > 0) ctx.fillRect(px, top, 1, bottom - top);
    }
  }

  // ── Trace Overlay (Enhanced: crosshair + nearest-curve snap) ───

  function drawTraceOverlay(): void {
    if (tracePixelX === null || tracePixelY === null || dragging) return;

    const mx = pixelToMathX(tracePixelX);

    // Draw vertical dashed crosshair at mouse X
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = theme.tickText;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(tracePixelX, 0);
    ctx.lineTo(tracePixelX, logicalHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Find nearest curve to mouse position
    let bestDist = Infinity;
    let bestIndex = -1;
    let bestMy = NaN;

    for (let i = 0; i < currentSpec.data.length; i++) {
      const pd = currentSpec.data[i];

      if (pd.type === "explicit_2d" || pd.type === "inequality_2d" || pd.type === "region_2d") {
        const fn = pd.compiledFns[0];
        if (!fn) continue;
        let my: number;
        try { my = fn(mx); } catch { continue; }
        if (!isFinite(my)) continue;
        const py = mathToPixelY(my);
        const dist = Math.abs(py - tracePixelY!);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
          bestMy = my;
        }
      } else if (pd.type === "parametric_2d" || pd.type === "polar") {
        // Sample t to find nearest point
        const tRange = currentSpec.ranges.t || [0, 2 * Math.PI];
        const samples = 200;
        const dt = (tRange[1] - tRange[0]) / (samples - 1);

        for (let s = 0; s < samples; s++) {
          const t = tRange[0] + s * dt;
          let px2: number, py2: number;
          try {
            if (pd.type === "parametric_2d" && pd.compiledFns.length >= 2) {
              const x = pd.compiledFns[0](t);
              const y = pd.compiledFns[1](t);
              px2 = mathToPixelX(x);
              py2 = mathToPixelY(y);
            } else if (pd.type === "polar" && pd.compiledFns[0]) {
              const r = pd.compiledFns[0](t);
              px2 = mathToPixelX(r * Math.cos(t));
              py2 = mathToPixelY(r * Math.sin(t));
            } else continue;
          } catch { continue; }
          if (!isFinite(px2!) || !isFinite(py2!)) continue;
          const dist = Math.sqrt(
            (px2! - tracePixelX!) ** 2 + (py2! - tracePixelY!) ** 2,
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i;
            bestMy = pixelToMathY(py2!);
          }
        }
      } else if (pd.type === "point_2d" && pd.compiledFns.length >= 2) {
        const ptx = pd.compiledFns[0](), pty = pd.compiledFns[1]();
        if (isFinite(ptx) && isFinite(pty)) {
          const ppx = mathToPixelX(ptx), ppy = mathToPixelY(pty);
          const dist = Math.sqrt((ppx - tracePixelX!) ** 2 + (ppy - tracePixelY!) ** 2);
          if (dist < bestDist) { bestDist = dist; bestIndex = i; bestMy = pty; }
        }
      }
      // Skip implicit_2d — nearest point on implicit curve is expensive
    }

    // Only show if within 60 pixels of the nearest curve
    if (bestIndex < 0 || bestDist > 60) return;

    const color = COLORS[bestIndex % COLORS.length];
    const px = mathToPixelX(mx);
    const py = mathToPixelY(bestMy);

    // Dot on curve
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = theme.bg;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Coordinate label
    const labelX = parseFloat(mx.toPrecision(4));
    const labelY = parseFloat(bestMy.toPrecision(4));
    const text = `(${labelX}, ${labelY})`;

    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const metrics = ctx.measureText(text);
    const tw = metrics.width + 12;
    const th = 20;

    let lx = px + 10;
    let ly = py - 20;
    if (lx + tw > logicalWidth) lx = px - tw - 6;
    if (ly < 4) ly = py + 14;
    if (ly + th > logicalHeight) ly = logicalHeight - th - 4;

    // Pill background
    ctx.fillStyle = theme.traceBg;
    const r = 4;
    ctx.beginPath();
    ctx.moveTo(lx + r, ly);
    ctx.lineTo(lx + tw - r, ly);
    ctx.arcTo(lx + tw, ly, lx + tw, ly + r, r);
    ctx.lineTo(lx + tw, ly + th - r);
    ctx.arcTo(lx + tw, ly + th, lx + tw - r, ly + th, r);
    ctx.lineTo(lx + r, ly + th);
    ctx.arcTo(lx, ly + th, lx, ly + th - r, r);
    ctx.lineTo(lx, ly + r);
    ctx.arcTo(lx, ly, lx + r, ly, r);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = theme.traceText;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, lx + 6, ly + th / 2);
  }

  // ── Points of Interest ──────────────────────────────────────────

  function drawPOIs(pois: POI[]): void {
    for (const poi of pois) {
      const px = mathToPixelX(poi.x);
      const py = mathToPixelY(poi.y);

      // Skip if off-screen
      if (px < -20 || px > logicalWidth + 20 || py < -20 || py > logicalHeight + 20) continue;

      const color = COLORS[poi.exprIndex % COLORS.length];

      ctx.fillStyle = color;
      ctx.strokeStyle = theme.bg;
      ctx.lineWidth = 2;

      switch (poi.type) {
        case "root":
          // Filled circle
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
          break;
        case "extremum-min":
        case "extremum-max":
          // Diamond
          ctx.beginPath();
          ctx.moveTo(px, py - 6);
          ctx.lineTo(px + 5, py);
          ctx.lineTo(px, py + 6);
          ctx.lineTo(px - 5, py);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        case "intersection":
          // Star (5-pointed)
          drawStar(px, py, 5, 7, 3.5);
          ctx.fill();
          ctx.stroke();
          break;
      }

      // Coordinate label
      const labelX = parseFloat(poi.x.toPrecision(4));
      const labelY = parseFloat(poi.y.toPrecision(4));
      const text = `(${labelX}, ${labelY})`;
      ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = theme.tickText;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(text, px + 8, py - 4);
    }
  }

  function drawStar(cx: number, cy: number, points: number, outer: number, inner: number): void {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const angle = (Math.PI / 2) * -1 + (Math.PI / points) * i;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // ── Expression Labels ──────────────────────────────────────────

  function drawExpressionLabels(): void {
    const padding = 10;
    let y = padding + 12;
    for (let i = 0; i < currentSpec.data.length; i++) {
      const pd = currentSpec.data[i];
      const color = COLORS[i % COLORS.length];
      ctx.fillStyle = color;
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const label = pd.latex.replace(/@plot2d\s*$/i, "").trim();
      ctx.fillText(label, padding, y);
      y += 18;
    }
  }

  // ── Schedule Render ────────────────────────────────────────────

  function scheduleRender(): void {
    if (rafPending || destroyed) return;
    rafPending = true;
    requestAnimationFrame(render);
  }

  // ── Event Handlers ─────────────────────────────────────────────

  function onWheel(e: WheelEvent): void {
    e.preventDefault();

    if (e.ctrlKey) {
      const factor = e.deltaY > 0 ? 1 / 1.05 : 1.05;
      const mx = pixelToMathX(e.offsetX);
      const my = pixelToMathY(e.offsetY);
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
      centerX = mx - (e.offsetX - logicalWidth / 2) / scale;
      centerY = my - (logicalHeight / 2 - e.offsetY) / scale;
    } else {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5 ||
          (Math.abs(e.deltaX) > 1 && Math.abs(e.deltaY) < 5)) {
        centerX += e.deltaX / scale;
        centerY -= e.deltaY / scale;
      } else {
        const mx = pixelToMathX(e.offsetX);
        const my = pixelToMathY(e.offsetY);
        const factor = e.deltaY > 0 ? 1 / 1.12 : 1.12;
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
        centerX = mx - (e.offsetX - logicalWidth / 2) / scale;
        centerY = my - (logicalHeight / 2 - e.offsetY) / scale;
      }
    }
    scheduleRender();
  }

  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    dragging = true;
    dragStartPx = e.offsetX;
    dragStartPy = e.offsetY;
    dragStartCX = centerX;
    dragStartCY = centerY;
    container.classList.add("kcl-dragging");
  }

  function onMouseMove(e: MouseEvent): void {
    if (dragging) {
      const dx = e.offsetX - dragStartPx;
      const dy = e.offsetY - dragStartPy;
      centerX = dragStartCX - dx / scale;
      centerY = dragStartCY + dy / scale;
      scheduleRender();
    } else {
      tracePixelX = e.offsetX;
      tracePixelY = e.offsetY;
      scheduleRender();
    }
  }

  function onMouseUp(): void {
    dragging = false;
    container.classList.remove("kcl-dragging");
  }

  function onMouseLeave(): void {
    dragging = false;
    tracePixelX = null;
    tracePixelY = null;
    container.classList.remove("kcl-dragging");
    scheduleRender();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "=" || e.key === "+") {
      scale = Math.min(MAX_SCALE, scale * 1.2);
      scheduleRender();
      e.preventDefault();
    } else if (e.key === "-") {
      scale = Math.max(MIN_SCALE, scale / 1.2);
      scheduleRender();
      e.preventDefault();
    } else if (e.key === "0") {
      centerX = initCenterX;
      centerY = initCenterY;
      scale = initScale;
      scheduleRender();
      e.preventDefault();
    }
  }

  function onDblClick(): void {
    centerX = initCenterX;
    centerY = initCenterY;
    scale = initScale;
    scheduleRender();
  }

  // Attach events
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseLeave);
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("dblclick", onDblClick);

  // Grid toggle button
  const gridBtn = document.createElement("button");
  gridBtn.className = "kcl-graph-reset";
  gridBtn.style.right = "44px";
  gridBtn.textContent = "\u25A6";
  gridBtn.title = "Toggle grid: All / Major / None";
  gridBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (gridMode === "all") gridMode = "major";
    else if (gridMode === "major") gridMode = "none";
    else gridMode = "all";
    gridBtn.textContent = gridMode === "all" ? "\u25A6" : gridMode === "major" ? "\u25A4" : "\u25A2";
    scheduleRender();
  });
  container.appendChild(gridBtn);

  // POI toggle button
  const poiBtn = document.createElement("button");
  poiBtn.className = "kcl-graph-reset";
  poiBtn.style.right = "80px";
  poiBtn.textContent = "\u25C9"; // ◉
  poiBtn.title = "Toggle points of interest";
  poiBtn.style.opacity = poisEnabled ? "" : "0.4";
  poiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    poisEnabled = !poisEnabled;
    poiBtn.style.opacity = poisEnabled ? "" : "0.4";
    if (poisEnabled && !cachedPOIs) recomputePOIs();
    scheduleRender();
  });
  container.appendChild(poiBtn);

  // Reset button
  const resetBtn = document.createElement("button");
  resetBtn.className = "kcl-graph-reset";
  resetBtn.textContent = "\u27F2";
  resetBtn.title = "Reset view (or press 0)";
  resetBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onDblClick();
  });
  container.appendChild(resetBtn);

  // ── Resize Observer ────────────────────────────────────────────

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return;
    scheduleRender();
  });
  resizeObserver.observe(container);

  // ── Initial Render ─────────────────────────────────────────────
  scheduleRender();

  // ── GraphHandle ────────────────────────────────────────────────

  return {
    update(newSpec: PlotSpec): void {
      if (destroyed) return;
      currentSpec = newSpec;

      const xs = newSpec.ranges.x[1] - newSpec.ranges.x[0];
      const ys = newSpec.ranges.y[1] - newSpec.ranges.y[0];
      const ms = Math.max(xs, ys);
      centerX = (newSpec.ranges.x[0] + newSpec.ranges.x[1]) / 2;
      centerY = (newSpec.ranges.y[0] + newSpec.ranges.y[1]) / 2;
      scale = Math.min(logicalWidth, logicalHeight) / (ms * 1.1);

      recomputePOIs();
      scheduleRender();
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;

      if (poiDebounceTimer !== null) clearTimeout(poiDebounceTimer);
      resizeObserver.disconnect();

      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("dblclick", onDblClick);

      container.innerHTML = "";
    },
  };
}
