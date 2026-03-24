/**
 * King's CalcLatex v2 — ODE Solver
 *
 * Numerical ODE solving via RK4 for y' = f(x, y).
 * Used for @phase (direction field + solution curves) and @ode (solve + plot).
 */

/**
 * Solve y' = f(x, y) using 4th-order Runge-Kutta.
 * Returns array of [x, y] points.
 */
export function solveODE_RK4(
  f: (x: number, y: number) => number,
  x0: number,
  y0: number,
  xEnd: number,
  stepSize: number = 0.02,
): [number, number][] {
  const points: [number, number][] = [[x0, y0]];
  let x = x0, y = y0;
  const h = xEnd > x0 ? Math.abs(stepSize) : -Math.abs(stepSize);
  const maxSteps = 10000;
  let steps = 0;

  while ((h > 0 ? x < xEnd : x > xEnd) && steps < maxSteps) {
    const k1 = f(x, y);
    const k2 = f(x + h / 2, y + h * k1 / 2);
    const k3 = f(x + h / 2, y + h * k2 / 2);
    const k4 = f(x + h, y + h * k3);

    y += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    x += h;
    steps++;

    // Bail if solution diverges
    if (!isFinite(y) || Math.abs(y) > 1e6) break;

    points.push([x, y]);
  }
  return points;
}

/**
 * Generate direction field arrows for y' = f(x, y).
 * Returns array of { x, y, dx, dy } for arrow rendering.
 */
export function computeDirectionField(
  f: (x: number, y: number) => number,
  xRange: [number, number],
  yRange: [number, number],
  gridSize: number = 20,
): { x: number; y: number; dx: number; dy: number }[] {
  const arrows: { x: number; y: number; dx: number; dy: number }[] = [];
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const xStep = (xMax - xMin) / gridSize;
  const yStep = (yMax - yMin) / gridSize;

  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const x = xMin + i * xStep;
      const y = yMin + j * yStep;
      let slope: number;
      try { slope = f(x, y); } catch { continue; }
      if (!isFinite(slope)) continue;

      // Normalize arrow length
      const len = Math.sqrt(1 + slope * slope);
      const scale = Math.min(xStep, yStep) * 0.4;
      const dx = scale / len;
      const dy = scale * slope / len;

      arrows.push({ x, y, dx, dy });
    }
  }
  return arrows;
}

/**
 * Generate multiple solution curves from various initial conditions.
 */
export function generateSolutionCurves(
  f: (x: number, y: number) => number,
  xRange: [number, number],
  yRange: [number, number],
  numCurves: number = 12,
): [number, number][][] {
  const curves: [number, number][][] = [];
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const yStep = (yMax - yMin) / (numCurves + 1);
  const xMid = (xMin + xMax) / 2;

  for (let i = 1; i <= numCurves; i++) {
    const y0 = yMin + i * yStep;
    // Integrate forward from midpoint
    const forward = solveODE_RK4(f, xMid, y0, xMax, 0.02);
    // Integrate backward from midpoint
    const backward = solveODE_RK4(f, xMid, y0, xMin, 0.02);
    // Combine: reverse backward + forward (skip duplicate midpoint)
    const curve = [...backward.reverse(), ...forward.slice(1)];
    if (curve.length > 2) curves.push(curve);
  }
  return curves;
}
