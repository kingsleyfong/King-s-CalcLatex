/**
 * King's CalcLatex v2 — Auto-Range Computation
 *
 * Determines good axis ranges from expression analysis so the user
 * sees the interesting region of the graph without manual tuning.
 */

import type { PlotData, AxisRanges } from "../types";

// ── Constants ────────────────────────────────────────────────────────

/** Number of sample points for 1D range estimation */
const SAMPLES_1D = 100;

/** Number of sample points per axis for 2D (3D surface) range estimation */
const SAMPLES_2D = 20;

/** Padding factor added around computed ranges (10%) */
const PADDING = 0.1;

/** Minimum range span — prevents degenerate zero-width ranges */
const MIN_SPAN = 1.0;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Clamp a range to prevent extreme values from blowing up the viewport.
 */
function clampRange(
  min: number,
  max: number,
  limit: number = 1e6
): [number, number] {
  return [Math.max(min, -limit), Math.min(max, limit)];
}

/**
 * Add symmetric padding around a range and enforce minimum span.
 */
function padRange(
  min: number,
  max: number,
  defaultRange: [number, number]
): [number, number] {
  // If the range is degenerate or all-NaN, fall back to default
  if (!isFinite(min) || !isFinite(max) || min > max) {
    return defaultRange;
  }

  let span = max - min;

  // Enforce minimum span (e.g., constant function → y=5 everywhere)
  if (span < MIN_SPAN) {
    const center = (min + max) / 2;
    min = center - MIN_SPAN / 2;
    max = center + MIN_SPAN / 2;
    span = MIN_SPAN;
  }

  const pad = span * PADDING;
  return clampRange(min - pad, max + pad);
}

// ── Per-Type Range Estimation ────────────────────────────────────────

/**
 * Estimate y range for an explicit 2d function y=f(x).
 */
function rangeExplicit2D(
  pd: PlotData,
  defaults: AxisRanges
): AxisRanges {
  const fn = pd.compiledFns[0];
  if (!fn) return defaults;

  const [xMin, xMax] = defaults.x;
  const dx = (xMax - xMin) / (SAMPLES_1D - 1);

  let yLo = Infinity;
  let yHi = -Infinity;

  for (let i = 0; i < SAMPLES_1D; i++) {
    const x = xMin + i * dx;
    try {
      const y = fn(x);
      if (isFinite(y)) {
        if (y < yLo) yLo = y;
        if (y > yHi) yHi = y;
      }
    } catch {
      // skip
    }
  }

  return {
    x: defaults.x,
    y: padRange(yLo, yHi, defaults.y),
  };
}

/**
 * Estimate range for an implicit 2D function f(x,y)=0.
 * function-plot uses interval arithmetic to find the curve, so we
 * do a coarse sign-change search to center the viewport on the curve.
 */
function rangeImplicit2D(
  pd: PlotData,
  defaults: AxisRanges
): AxisRanges {
  const fn = pd.compiledFns[0];
  if (!fn) return defaults;

  const [xMin, xMax] = defaults.x;
  const [yMin, yMax] = defaults.y;
  const n = SAMPLES_2D;
  const dx = (xMax - xMin) / n;
  const dy = (yMax - yMin) / n;

  let signChangeXMin = Infinity;
  let signChangeXMax = -Infinity;
  let signChangeYMin = Infinity;
  let signChangeYMax = -Infinity;
  let foundSignChange = false;

  // Coarse grid scan for sign changes
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = xMin + i * dx;
      const y = yMin + j * dy;
      const xNext = x + dx;
      const yNext = y + dy;

      try {
        const v00 = fn(x, y);
        const v10 = fn(xNext, y);
        const v01 = fn(x, yNext);

        // Check horizontal and vertical neighbors for sign change
        if (
          (isFinite(v00) && isFinite(v10) && v00 * v10 < 0) ||
          (isFinite(v00) && isFinite(v01) && v00 * v01 < 0)
        ) {
          foundSignChange = true;
          if (x < signChangeXMin) signChangeXMin = x;
          if (xNext > signChangeXMax) signChangeXMax = xNext;
          if (y < signChangeYMin) signChangeYMin = y;
          if (yNext > signChangeYMax) signChangeYMax = yNext;
        }
      } catch {
        // skip
      }
    }
  }

  if (!foundSignChange) {
    return defaults;
  }

  // Center the viewport on the sign-change region with generous padding
  return {
    x: padRange(signChangeXMin, signChangeXMax, defaults.x),
    y: padRange(signChangeYMin, signChangeYMax, defaults.y),
  };
}

/**
 * Estimate z range for an explicit 3D function z=f(x,y).
 */
function rangeExplicit3D(
  pd: PlotData,
  defaults: AxisRanges
): AxisRanges {
  const fn = pd.compiledFns[0];
  if (!fn) return defaults;

  const [xMin, xMax] = defaults.x;
  const [yMin, yMax] = defaults.y;
  const dx = (xMax - xMin) / (SAMPLES_2D - 1);
  const dy = (yMax - yMin) / (SAMPLES_2D - 1);

  let zLo = Infinity;
  let zHi = -Infinity;

  for (let i = 0; i < SAMPLES_2D; i++) {
    for (let j = 0; j < SAMPLES_2D; j++) {
      const x = xMin + i * dx;
      const y = yMin + j * dy;
      try {
        const z = fn(x, y);
        if (isFinite(z)) {
          if (z < zLo) zLo = z;
          if (z > zHi) zHi = z;
        }
      } catch {
        // skip
      }
    }
  }

  return {
    x: defaults.x,
    y: defaults.y,
    z: padRange(zLo, zHi, defaults.z || defaults.y),
  };
}

/**
 * Estimate ranges for an implicit 3D function f(x,y,z)=0 via coarse sign-change scan.
 */
function rangeImplicit3D(pd: PlotData, defaults: AxisRanges): AxisRanges {
  const fn = pd.compiledFns[0];
  if (!fn) return defaults;

  const [xMin, xMax] = defaults.x;
  const [yMin, yMax] = defaults.y;
  const zDef = defaults.z || defaults.y;
  const [zMin, zMax] = zDef;
  const n = 12; // coarser grid for 3D (n^3 = 1728 samples)
  const dx = (xMax - xMin) / n;
  const dy = (yMax - yMin) / n;
  const dz = (zMax - zMin) / n;

  let xLo = Infinity, xHi = -Infinity;
  let yLo = Infinity, yHi = -Infinity;
  let zLo = Infinity, zHi = -Infinity;
  let found = false;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const x = xMin + i * dx;
        const y = yMin + j * dy;
        const z = zMin + k * dz;
        try {
          const v = fn(x, y, z);
          const vx = fn(x + dx, y, z);
          const vy = fn(x, y + dy, z);
          const vz = fn(x, y, z + dz);

          if ((isFinite(v) && isFinite(vx) && v * vx < 0) ||
              (isFinite(v) && isFinite(vy) && v * vy < 0) ||
              (isFinite(v) && isFinite(vz) && v * vz < 0)) {
            found = true;
            xLo = Math.min(xLo, x); xHi = Math.max(xHi, x + dx);
            yLo = Math.min(yLo, y); yHi = Math.max(yHi, y + dy);
            zLo = Math.min(zLo, z); zHi = Math.max(zHi, z + dz);
          }
        } catch { /* skip */ }
      }
    }
  }

  if (!found) return defaults;
  return {
    x: padRange(xLo, xHi, defaults.x),
    y: padRange(yLo, yHi, defaults.y),
    z: padRange(zLo, zHi, zDef),
  };
}

/**
 * Estimate ranges for a parametric 3D curve [x(t), y(t), z(t)] by sampling.
 */
function rangeParametric3D(pd: PlotData, defaults: AxisRanges): AxisRanges {
  if (pd.compiledFns.length < 3) return defaults;

  const tRange: [number, number] = defaults.t || [-2 * Math.PI, 2 * Math.PI];
  const [tMin, tMax] = tRange;
  const dt = (tMax - tMin) / (SAMPLES_1D - 1);

  let xLo = Infinity, xHi = -Infinity;
  let yLo = Infinity, yHi = -Infinity;
  let zLo = Infinity, zHi = -Infinity;

  for (let i = 0; i < SAMPLES_1D; i++) {
    const t = tMin + i * dt;
    try {
      const x = pd.compiledFns[0](t);
      const y = pd.compiledFns[1](t);
      const z = pd.compiledFns[2](t);
      if (isFinite(x) && isFinite(y) && isFinite(z)) {
        xLo = Math.min(xLo, x); xHi = Math.max(xHi, x);
        yLo = Math.min(yLo, y); yHi = Math.max(yHi, y);
        zLo = Math.min(zLo, z); zHi = Math.max(zHi, z);
      }
    } catch { /* skip */ }
  }

  return {
    x: padRange(xLo, xHi, defaults.x),
    y: padRange(yLo, yHi, defaults.y),
    z: padRange(zLo, zHi, defaults.z || defaults.y),
    t: tRange,
  };
}

/**
 * Estimate ranges for a 3D vector [vx, vy, vz] (constant components).
 * Expands the viewport to include both the origin and the vector tip.
 */
function rangeVector3D(pd: PlotData, defaults: AxisRanges): AxisRanges {
  if (pd.compiledFns.length < 3) return defaults;

  const vx = pd.compiledFns[0]();
  const vy = pd.compiledFns[1]();
  const vz = pd.compiledFns[2]();

  if (!isFinite(vx) || !isFinite(vy) || !isFinite(vz)) return defaults;

  // Include both origin (0,0,0) and vector tip with padding
  const pad = Math.max(Math.abs(vx), Math.abs(vy), Math.abs(vz), 1) * 0.3;
  return {
    x: padRange(Math.min(0, vx) - pad, Math.max(0, vx) + pad, defaults.x),
    y: padRange(Math.min(0, vy) - pad, Math.max(0, vy) + pad, defaults.y),
    z: padRange(Math.min(0, vz) - pad, Math.max(0, vz) + pad, defaults.z || defaults.y),
  };
}

// ── Main Entry ───────────────────────────────────────────────────────

/**
 * Compute smart axis ranges for one or more plot expressions.
 *
 * Analyzes the compiled functions by sampling and returns adjusted
 * AxisRanges that frame the interesting region of the graph.
 *
 * @param data      - The PlotData array from a PlotSpec.
 * @param defaults  - Default axis ranges (from settings or prior computation).
 * @returns Adjusted AxisRanges.
 */
export function computeAutoRange(
  data: PlotData[],
  defaults: AxisRanges
): AxisRanges {
  if (data.length === 0) return defaults;

  // Start with defaults and refine per expression type
  let result: AxisRanges = { ...defaults };

  // Use the first expression's type to determine the primary strategy,
  // then widen ranges to accommodate all expressions.
  for (const pd of data) {
    let itemRange: AxisRanges;

    switch (pd.type) {
      case "explicit_2d":
        itemRange = rangeExplicit2D(pd, defaults);
        result = mergeRanges(result, itemRange);
        break;

      case "implicit_2d":
        itemRange = rangeImplicit2D(pd, defaults);
        result = mergeRanges(result, itemRange);
        break;

      case "explicit_3d":
        itemRange = rangeExplicit3D(pd, defaults);
        result = mergeRanges(result, itemRange);
        break;

      case "parametric_2d":
      case "polar":
        // For parametric/polar, sample the curve and find bounding box
        itemRange = rangeParametric2D(pd, defaults);
        result = mergeRanges(result, itemRange);
        break;

      case "implicit_3d":
        itemRange = rangeImplicit3D(pd, defaults);
        result = mergeRanges(result, itemRange);
        break;

      case "parametric_3d":
        itemRange = rangeParametric3D(pd, defaults);
        result = mergeRanges(result, itemRange);
        break;

      case "vector_3d":
        itemRange = rangeVector3D(pd, defaults);
        result = mergeRanges(result, itemRange);
        break;

      case "point_2d":
        if (pd.compiledFns.length >= 2) {
          const px = pd.compiledFns[0](), py = pd.compiledFns[1]();
          if (isFinite(px) && isFinite(py)) {
            const pad = Math.max(Math.abs(px), Math.abs(py), 2) * 0.3;
            result = mergeRanges(result, {
              x: padRange(px - pad, px + pad, defaults.x),
              y: padRange(py - pad, py + pad, defaults.y),
            });
          }
        }
        break;

      case "point_3d":
        if (pd.compiledFns.length >= 3) {
          const px = pd.compiledFns[0](), py = pd.compiledFns[1](), pz = pd.compiledFns[2]();
          if (isFinite(px) && isFinite(py) && isFinite(pz)) {
            const pad = Math.max(Math.abs(px), Math.abs(py), Math.abs(pz), 1) * 0.3;
            result = mergeRanges(result, {
              x: padRange(px - pad, px + pad, defaults.x),
              y: padRange(py - pad, py + pad, defaults.y),
              z: padRange(pz - pad, pz + pad, defaults.z || defaults.y),
            });
          }
        }
        break;

      case "contour_2d":
      case "vector_field_2d":
      case "vector_field_3d":
        // These types use the specified domain as-is
        break;

      case "region_2d":
        itemRange = rangeExplicit2D(pd, defaults);
        result = mergeRanges(result, itemRange);
        break;

      default:
        break;
    }
  }

  return result;
}

/**
 * Estimate range for a parametric or polar 2D curve by sampling.
 */
function rangeParametric2D(
  pd: PlotData,
  defaults: AxisRanges
): AxisRanges {
  if (pd.compiledFns.length < 2 && pd.type === "parametric_2d") {
    return defaults;
  }

  const tRange: [number, number] =
    defaults.t ||
    (pd.type === "polar" ? [0, 2 * Math.PI] : [-2 * Math.PI, 2 * Math.PI]);

  const [tMin, tMax] = tRange;
  const dt = (tMax - tMin) / (SAMPLES_1D - 1);

  let xLo = Infinity;
  let xHi = -Infinity;
  let yLo = Infinity;
  let yHi = -Infinity;

  for (let i = 0; i < SAMPLES_1D; i++) {
    const t = tMin + i * dt;
    try {
      let x: number, y: number;

      if (pd.type === "polar") {
        // r = f(theta), convert to Cartesian
        const r = pd.compiledFns[0](t);
        if (!isFinite(r)) continue;
        x = r * Math.cos(t);
        y = r * Math.sin(t);
      } else {
        // parametric: x(t), y(t)
        x = pd.compiledFns[0](t);
        y = pd.compiledFns[1](t);
      }

      if (isFinite(x) && isFinite(y)) {
        if (x < xLo) xLo = x;
        if (x > xHi) xHi = x;
        if (y < yLo) yLo = y;
        if (y > yHi) yHi = y;
      }
    } catch {
      // skip
    }
  }

  return {
    x: padRange(xLo, xHi, defaults.x),
    y: padRange(yLo, yHi, defaults.y),
    t: tRange,
  };
}

/**
 * Merge two AxisRanges by taking the union (widest extent) of each axis.
 */
function mergeRanges(a: AxisRanges, b: AxisRanges): AxisRanges {
  return {
    x: [Math.min(a.x[0], b.x[0]), Math.max(a.x[1], b.x[1])],
    y: [Math.min(a.y[0], b.y[0]), Math.max(a.y[1], b.y[1])],
    z:
      a.z && b.z
        ? [Math.min(a.z[0], b.z[0]), Math.max(a.z[1], b.z[1])]
        : a.z || b.z,
    t:
      a.t && b.t
        ? [Math.min(a.t[0], b.t[0]), Math.max(a.t[1], b.t[1])]
        : a.t || b.t,
  };
}
