/**
 * King's CalcLatex v2 — Points of Interest (POI) Detection
 *
 * Numerical analysis for finding roots, extrema, and intersections
 * of explicit 2D functions. All methods use sign-change detection
 * with bisection refinement.
 */

import type { PlotSpec } from "../types";

// ── Types ─────────────────────────────────────────────────────────────

export interface POI {
  type: "root" | "extremum-min" | "extremum-max" | "intersection";
  x: number;
  y: number;
  /** Index of the expression in spec.data[] this POI belongs to */
  exprIndex: number;
  /** For intersections: the other expression index */
  otherExprIndex?: number;
}

// ── Constants ─────────────────────────────────────────────────────────

const BISECTION_ITERS = 40;
const SCAN_SAMPLES = 500;
const DERIV_H = 1e-6;
const DEDUP_THRESHOLD = 1e-4;

// ── Root Finding ──────────────────────────────────────────────────────

/**
 * Find roots of fn(x) = 0 in [xMin, xMax] via sign-change + bisection.
 */
export function findRoots(
  fn: (x: number) => number,
  xMin: number,
  xMax: number,
): { x: number; y: number }[] {
  const results: { x: number; y: number }[] = [];
  const dx = (xMax - xMin) / SCAN_SAMPLES;

  let prevY = safeEval(fn, xMin);

  for (let i = 1; i <= SCAN_SAMPLES; i++) {
    const x = xMin + i * dx;
    const y = safeEval(fn, x);

    if (isFinite(prevY) && isFinite(y) && prevY * y < 0) {
      const root = bisect(fn, x - dx, x);
      if (root !== null) {
        results.push({ x: root, y: 0 });
      }
    }
    prevY = y;
  }

  return dedup(results);
}

// ── Extrema Finding ───────────────────────────────────────────────────

/**
 * Find local extrema of fn(x) in [xMin, xMax] via numerical derivative
 * sign changes + second derivative classification.
 */
export function findExtrema(
  fn: (x: number) => number,
  xMin: number,
  xMax: number,
): { x: number; y: number; type: "extremum-min" | "extremum-max" }[] {
  const results: { x: number; y: number; type: "extremum-min" | "extremum-max" }[] = [];
  const dx = (xMax - xMin) / SCAN_SAMPLES;

  let prevDeriv = numericalDerivative(fn, xMin);

  for (let i = 1; i <= SCAN_SAMPLES; i++) {
    const x = xMin + i * dx;
    const d = numericalDerivative(fn, x);

    if (isFinite(prevDeriv) && isFinite(d) && prevDeriv * d < 0) {
      // Derivative sign change → extremum candidate
      const extremeX = bisect(
        (t) => numericalDerivative(fn, t),
        x - dx,
        x,
      );
      if (extremeX !== null) {
        const y = safeEval(fn, extremeX);
        if (isFinite(y)) {
          // Second derivative for classification
          const d2 = numericalSecondDerivative(fn, extremeX);
          const type = d2 > 0 ? "extremum-min" : "extremum-max";
          results.push({ x: extremeX, y, type });
        }
      }
    }
    prevDeriv = d;
  }

  return dedup(results) as typeof results;
}

// ── Intersection Finding ──────────────────────────────────────────────

/**
 * Find intersections of fn1(x) and fn2(x) in [xMin, xMax].
 * Reduces to finding roots of fn1(x) - fn2(x).
 */
export function findIntersections(
  fn1: (x: number) => number,
  fn2: (x: number) => number,
  xMin: number,
  xMax: number,
): { x: number; y: number }[] {
  const diff = (x: number) => {
    const a = safeEval(fn1, x);
    const b = safeEval(fn2, x);
    if (!isFinite(a) || !isFinite(b)) return NaN;
    return a - b;
  };
  const rootPoints = findRoots(diff, xMin, xMax);

  // Evaluate y at the intersection using fn1
  return rootPoints.map((p) => ({
    x: p.x,
    y: safeEval(fn1, p.x),
  })).filter((p) => isFinite(p.y));
}

// ── Orchestrator ──────────────────────────────────────────────────────

/**
 * Detect all points of interest for a given PlotSpec.
 * Only processes explicit_2d expressions.
 */
export function detectPOIs(spec: PlotSpec): POI[] {
  const pois: POI[] = [];
  const xMin = spec.ranges.x[0];
  const xMax = spec.ranges.x[1];

  // Collect explicit_2d functions
  const explicitFns: { fn: (x: number) => number; index: number }[] = [];
  for (let i = 0; i < spec.data.length; i++) {
    const pd = spec.data[i];
    if (pd.type === "explicit_2d" && pd.compiledFns[0]) {
      explicitFns.push({ fn: pd.compiledFns[0], index: i });
    }
  }

  // Roots and extrema for each expression
  for (const { fn, index } of explicitFns) {
    for (const root of findRoots(fn, xMin, xMax)) {
      pois.push({ type: "root", x: root.x, y: root.y, exprIndex: index });
    }
    for (const ext of findExtrema(fn, xMin, xMax)) {
      pois.push({ type: ext.type, x: ext.x, y: ext.y, exprIndex: index });
    }
  }

  // Pairwise intersections
  for (let i = 0; i < explicitFns.length; i++) {
    for (let j = i + 1; j < explicitFns.length; j++) {
      const inters = findIntersections(
        explicitFns[i].fn,
        explicitFns[j].fn,
        xMin,
        xMax,
      );
      for (const pt of inters) {
        pois.push({
          type: "intersection",
          x: pt.x,
          y: pt.y,
          exprIndex: explicitFns[i].index,
          otherExprIndex: explicitFns[j].index,
        });
      }
    }
  }

  return pois;
}

// ── Internal Helpers ──────────────────────────────────────────────────

function safeEval(fn: (x: number) => number, x: number): number {
  try {
    return fn(x);
  } catch {
    return NaN;
  }
}

function numericalDerivative(fn: (x: number) => number, x: number): number {
  const y1 = safeEval(fn, x + DERIV_H);
  const y0 = safeEval(fn, x - DERIV_H);
  if (!isFinite(y1) || !isFinite(y0)) return NaN;
  return (y1 - y0) / (2 * DERIV_H);
}

function numericalSecondDerivative(fn: (x: number) => number, x: number): number {
  const y2 = safeEval(fn, x + DERIV_H);
  const y1 = safeEval(fn, x);
  const y0 = safeEval(fn, x - DERIV_H);
  if (!isFinite(y2) || !isFinite(y1) || !isFinite(y0)) return NaN;
  return (y2 - 2 * y1 + y0) / (DERIV_H * DERIV_H);
}

function bisect(
  fn: (x: number) => number,
  a: number,
  b: number,
): number | null {
  let lo = a;
  let hi = b;
  let fLo = safeEval(fn, lo);
  if (!isFinite(fLo)) return null;

  for (let i = 0; i < BISECTION_ITERS; i++) {
    const mid = (lo + hi) / 2;
    const fMid = safeEval(fn, mid);
    if (!isFinite(fMid)) return null;
    if (Math.abs(fMid) < 1e-12) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return (lo + hi) / 2;
}

/** Remove duplicate points within DEDUP_THRESHOLD distance. */
function dedup<T extends { x: number }>(points: T[]): T[] {
  const result: T[] = [];
  for (const p of points) {
    const isDup = result.some(
      (r) => Math.abs(r.x - p.x) < DEDUP_THRESHOLD,
    );
    if (!isDup) result.push(p);
  }
  return result;
}
