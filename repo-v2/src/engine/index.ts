/**
 * King's CalcLatex v2 — Engine Module Public Facade
 *
 * Wires together the parser, evaluator, CAS, and units modules into
 * a single ExpressionEngine class that the rest of the plugin consumes.
 */

import type { BoxedExpression } from "@cortex-js/compute-engine";
import {
  parseLatex,
  getCE,
  toFnString,
  compileToFunction,
  classifyExpression,
  detectFreeVars,
  extractTupleComponents,
  detectInequality,
} from "./parser";
import { evaluate } from "./evaluator";
import { differentiate, integrate, solveEquation, factorExpression } from "./cas";
import { convertUnits } from "./units";
import type {
  EvalMode,
  EvalResult,
  PlotSpec,
  PlotData,
  ExprType,
  AxisRanges,
  Result,
  Diagnostic,
} from "../types";
import { ok, err } from "../types";

/**
 * The main computation engine for King's CalcLatex.
 *
 * All public methods return `Result<T>` — they never throw exceptions.
 * The engine maintains an in-memory variable store for persisted assignments
 * (e.g., `a = 5` can be referenced in later expressions).
 */
export class ExpressionEngine {
  /** Persisted variable assignments: symbol name → BoxedExpression. */
  private variables = new Map<string, BoxedExpression>();
  private settings: any;

  constructor(settings?: any) {
    this.settings = settings || {};
  }

  // ── Evaluation ──────────────────────────────────────────────────

  /**
   * Evaluate a LaTeX expression in the given mode.
   * Delegates to the evaluator module, passing numericPrecision from settings.
   */
  evaluate(latex: string, mode: EvalMode): Result<EvalResult> {
    return evaluate(latex, mode, this.settings?.numericPrecision);
  }

  // ── CAS Operations ─────────────────────────────────────────────

  /** Symbolic differentiation. */
  differentiate(latex: string, variable?: string): Result<EvalResult> {
    return differentiate(latex, variable);
  }

  /** Symbolic integration. */
  integrate(latex: string, variable?: string): Result<EvalResult> {
    return integrate(latex, variable);
  }

  /** Solve an equation. */
  solve(latex: string): Result<EvalResult> {
    return solveEquation(latex);
  }

  // ── Plot Preparation ───────────────────────────────────────────

  /**
   * Parse, classify, compile, and auto-range a LaTeX expression for
   * graph rendering. Returns a complete PlotSpec ready for the renderer.
   *
   * Supports multi-equation syntax: semicolon-separated expressions
   * (e.g., `y=\sin(x); y=\cos(x)`) produce multiple entries in data[].
   *
   * @param latex - Raw LaTeX expression (may include `y=...`, `=`, etc.)
   * @param mode - Plot mode (plot2d, plot3d, geometry)
   */
  preparePlot(latex: string, mode: string): Result<PlotSpec> {
    const diagnostics: Diagnostic[] = [];

    try {
      // ── Geometry mode: vectors, points, planes ────────────────────
      if (mode === "geometry") {
        const geomSpec = buildGeomSpec(latex, diagnostics);
        if (geomSpec) return ok(geomSpec, diagnostics);
      }

      // ── Contour mode: f(x,y) → level curves ────────────────────
      if (mode === "contour") {
        return this.buildContourSpec(latex, diagnostics);
      }

      // ── Vector field mode ─────────────────────────────────────────
      if (mode === "vecfield" || mode.startsWith("vecfield:")) {
        const scaleStr = mode.includes(":") ? mode.split(":")[1] : undefined;
        const suffixScale = scaleStr ? parseFloat(scaleStr) : undefined;
        const globalScale = this.settings?.vecfieldArrowScale ?? 1.0;
        const arrowScale = globalScale * (isFinite(suffixScale!) ? suffixScale! : 1.0);
        return this.buildVecFieldSpec(latex, diagnostics, arrowScale !== 1.0 ? arrowScale : undefined);
      }

      // ── Gradient mode: f(x,y) → contour lines + ∇f arrows ──────
      if (mode === "gradient") {
        return this.buildGradientSpec(latex, diagnostics);
      }

      // ── Tangent plane mode ────────────────────────────────────────
      if (mode === "tangent") {
        return this.buildTangentSpec(latex, diagnostics);
      }

      // ── Region mode: shade area between curves ──────────────────
      // Falls through to multi-eq handling below; type override happens after the loop.

      // ── Multi-equation: split on semicolons ────────────────────────
      const subExpressions = latex.split(";").map((s) => s.trim()).filter(Boolean);
      const allData: PlotData[] = [];
      const allFreeVars = new Set<string>();
      let mergedRanges: AxisRanges | null = null;
      let anyIs3d = mode === "plot3d";

      const plot3d2dMode = this.settings?.plot3d2dMode ?? "curtain";

      for (const subLatex of subExpressions) {
        const exprType = classifyExpression(subLatex);
        const is3d = mode === "plot3d" || is3dType(exprType);
        if (is3d) anyIs3d = true;

        // Override classification if user explicitly requests 3D
        let finalType: ExprType = exprType;
        if (mode === "plot3d" && !is3dType(exprType)) {
          if (plot3d2dMode === "plane-curve" && exprType === "explicit_2d") {
            // Keep as explicit_2d but mark originalType for 3D renderer
            finalType = "explicit_2d";
          } else if (exprType === "inequality_2d") {
            // Inequalities don't make sense in 3D; keep as-is
            finalType = "inequality_2d";
          } else {
            finalType = promoteToExplicit3d(exprType);
          }
        }

        const plotData = buildPlotData(subLatex, finalType, diagnostics);
        if (!plotData) continue;

        // Mark original type for plane-curve mode
        if (mode === "plot3d" && plot3d2dMode === "plane-curve" && exprType === "explicit_2d") {
          plotData.originalType = "explicit_2d";
        }

        allData.push(plotData);

        // Detect free variables
        try {
          const expr = parseLatex(subLatex);
          for (const v of detectFreeVars(expr)) {
            allFreeVars.add(v);
          }
        } catch { /* Non-critical */ }

        // Compute and merge ranges
        const subRanges = computeRanges(finalType, plotData, anyIs3d);
        mergedRanges = mergedRanges ? mergeRanges(mergedRanges, subRanges) : subRanges;
      }

      // ── Region mode: override first two explicit_2d types to region_2d ──
      if (mode === "region") {
        let regionCount = 0;
        for (const d of allData) {
          if (regionCount >= 2) break;
          if (d.type === "explicit_2d") {
            d.type = "region_2d";
            regionCount++;
          }
        }
      }

      if (allData.length === 0) {
        return err("Could not compile any expressions for plotting", diagnostics);
      }

      const spec: PlotSpec = {
        data: allData,
        freeVars: Array.from(allFreeVars),
        ranges: mergedRanges!,
      };

      return ok(spec, diagnostics);
    } catch (e) {
      return err(
        `Plot preparation failed: ${e instanceof Error ? e.message : String(e)}`,
        diagnostics,
      );
    }
  }

  // ── Variable Persistence ───────────────────────────────────────

  /**
   * Parse a variable assignment (e.g., `a = 5`) and store it.
   * The variable can then be referenced in subsequent expressions.
   *
   * @param latex - LaTeX of the form `symbol = expression`
   * @returns The symbol name that was persisted
   */
  persist(latex: string): Result<{ symbol: string }> {
    try {
      const expr = parseLatex(latex);
      const json = expr.json;

      // CortexJS may produce "Equal", "Assign", or "Equation" for `a = 5`.
      // Accept all three to prevent silent failures.
      if (
        !Array.isArray(json) ||
        (json[0] !== "Equal" && json[0] !== "Assign" && json[0] !== "Equation") ||
        json.length !== 3
      ) {
        return err(
          "Expected an assignment of the form 'symbol = expression'",
        );
      }

      const lhs = json[1];
      if (typeof lhs !== "string") {
        return err(
          "Left side of assignment must be a single symbol (e.g., a, k, n)",
        );
      }

      const symbol = lhs;
      const ce = getCE();
      const valueExpr = ce.box(json[2]);

      // Evaluate the RHS to a concrete value if possible
      const evaluated = valueExpr.evaluate();
      this.variables.set(symbol, evaluated);

      // Also assign in the CortexJS engine so subsequent parses see it
      ce.assign(symbol, evaluated);

      return ok({ symbol });
    } catch (e) {
      return err(
        `Persist failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Set a variable directly by name and numeric value.
   * Bypasses LaTeX parsing — used by slider handlers for performance.
   */
  setVariable(name: string, value: number): void {
    const ce = getCE();
    const boxed = ce.box(value);
    this.variables.set(name, boxed);
    ce.assign(name, boxed);
  }

  /**
   * Retrieve a persisted variable's current value.
   */
  getVariable(symbol: string): BoxedExpression | undefined {
    return this.variables.get(symbol);
  }

  /**
   * Clear all persisted variables.
   */
  clearVariables(): void {
    this.variables.clear();
  }

  /**
   * Return engine status for diagnostics.
   */
  getStatus(): { cortexLoaded: boolean; variableCount: number } {
    let cortexLoaded = false;
    try {
      getCE();
      cortexLoaded = true;
    } catch { /* CortexJS not available */ }
    return { cortexLoaded, variableCount: this.variables.size };
  }

  // ── Unit Conversion ────────────────────────────────────────────

  /**
   * Convert a value between units.
   *
   * @param value - Numeric value
   * @param from - Source unit (e.g., "m", "ft", "degC")
   * @param to - Target unit (e.g., "cm", "in", "degF")
   */
  convert(value: number, from: string, to: string): Result<string> {
    return convertUnits(value, from, to);
  }

  // ── New Plot Mode Builders ─────────────────────────────────────

  /**
   * Build a PlotSpec for contour mode: f(x,y) rendered as iso-level curves.
   */
  private buildContourSpec(
    latex: string,
    diagnostics: Diagnostic[],
  ): Result<PlotSpec> {
    try {
      const expr = parseLatex(latex);
      const fn = compileToFunction(expr, ["x", "y"]);
      const fnStr = toFnString(expr);

      const plotData: PlotData = {
        latex,
        type: "contour_2d",
        fnStrings: [fnStr],
        compiledFns: [fn],
      };

      return ok(
        {
          data: [plotData],
          freeVars: [],
          ranges: { x: [-10, 10], y: [-10, 10] },
        },
        diagnostics,
      );
    } catch (e) {
      return err(
        `Contour mode failed: ${e instanceof Error ? e.message : String(e)}`,
        diagnostics,
      );
    }
  }

  /**
   * Build a PlotSpec for vector field mode.
   *
   * Supports:
   *   - Semicolon-separated components: "P(x,y); Q(x,y)"
   *   - Single tuple expression: "(P(x,y), Q(x,y))"
   *   - 3D if z appears in the components: results in vector_field_3d
   */
  private buildVecFieldSpec(
    latex: string,
    diagnostics: Diagnostic[],
    arrowScale?: number,
  ): Result<PlotSpec> {
    try {
      const parts = latex.split(";").map((s) => s.trim()).filter(Boolean);

      let compExprs: BoxedExpression[];
      let is3d = false;

      if (parts.length >= 2) {
        // Semicolon-separated: "P; Q" or "P; Q; R"
        compExprs = parts.map((p) => parseLatex(p));
        is3d = parts.length >= 3 || compExprs.some((e) => {
          const s = toFnString(e);
          return /\bz\b/.test(s);
        });
      } else {
        // Single expression — try to extract tuple components
        const expr = parseLatex(latex);
        const n3 = extractTupleComponents(expr, 3);
        const n2 = extractTupleComponents(expr, 2);
        if (n3 && n3.length >= 3) {
          compExprs = n3.slice(0, 3);
          is3d = true;
        } else if (n2 && n2.length >= 2) {
          compExprs = n2.slice(0, 2);
          // Check if any component references z
          is3d = compExprs.some((e) => /\bz\b/.test(toFnString(e)));
        } else {
          return err(
            "Vector field: expected two or three components separated by ';' or as a tuple (P, Q) / (P, Q, R)",
            diagnostics,
          );
        }
      }

      const vars = is3d ? ["x", "y", "z"] : ["x", "y"];
      const compiledFns = compExprs.map((e) => compileToFunction(e, vars));
      const fnStrings = compExprs.map((e) => toFnString(e));
      const type: ExprType = is3d ? "vector_field_3d" : "vector_field_2d";

      const plotData: PlotData = {
        latex,
        type,
        fnStrings,
        compiledFns,
      };

      const ranges = is3d
        ? { x: [-5, 5] as [number, number], y: [-5, 5] as [number, number], z: [-5, 5] as [number, number] }
        : { x: [-10, 10] as [number, number], y: [-10, 10] as [number, number] };

      return ok({ data: [plotData], freeVars: [], ranges, arrowScale }, diagnostics);
    } catch (e) {
      return err(
        `Vector field mode failed: ${e instanceof Error ? e.message : String(e)}`,
        diagnostics,
      );
    }
  }

  /**
   * Build a PlotSpec for gradient mode: f(x,y) → contour_2d + vector_field_2d (∇f arrows).
   *
   * Uses CortexJS D() operator for symbolic partial derivatives.
   * Falls back to central-difference numeric derivatives if symbolic differentiation fails.
   */
  private buildGradientSpec(
    latex: string,
    diagnostics: Diagnostic[],
  ): Result<PlotSpec> {
    try {
      const ce = getCE();
      const expr = parseLatex(latex);
      const fn = compileToFunction(expr, ["x", "y"]);
      const fnStr = toFnString(expr);

      // ── Contour data (f itself) ───────────────────────────────────
      const contourData: PlotData = {
        latex,
        type: "contour_2d",
        fnStrings: [fnStr],
        compiledFns: [fn],
      };

      // ── Partial derivatives via CortexJS D() ─────────────────────
      let dxFn: (...args: number[]) => number;
      let dyFn: (...args: number[]) => number;
      let dxStr: string;
      let dyStr: string;

      try {
        const dxExpr = ce.box(["D", expr.json, "x"]).evaluate();
        const dyExpr = ce.box(["D", expr.json, "y"]).evaluate();
        dxStr = toFnString(dxExpr);
        dyStr = toFnString(dyExpr);
        dxFn = compileToFunction(dxExpr, ["x", "y"]);
        dyFn = compileToFunction(dyExpr, ["x", "y"]);
        diagnostics.push({ level: "info", message: "Gradient: symbolic partial derivatives computed" });
      } catch {
        // Fallback: central differences
        const H = 1e-5;
        dxFn = (x: number, y: number) => (fn(x + H, y) - fn(x - H, y)) / (2 * H);
        dyFn = (x: number, y: number) => (fn(x, y + H) - fn(x, y - H)) / (2 * H);
        dxStr = `(${fnStr} dx-numeric)`;
        dyStr = `(${fnStr} dy-numeric)`;
        diagnostics.push({ level: "info", message: "Gradient: using numeric central differences (symbolic D() failed)" });
      }

      const gradData: PlotData = {
        latex,
        type: "vector_field_2d",
        fnStrings: [dxStr, dyStr],
        compiledFns: [dxFn, dyFn],
      };

      return ok(
        {
          data: [contourData, gradData],
          freeVars: [],
          ranges: { x: [-10, 10], y: [-10, 10] },
        },
        diagnostics,
      );
    } catch (e) {
      return err(
        `Gradient mode failed: ${e instanceof Error ? e.message : String(e)}`,
        diagnostics,
      );
    }
  }

  /**
   * Build a PlotSpec for tangent plane mode.
   *
   * Input format: "f(x,y); (a,b)" — surface expression + evaluation point.
   * Returns: [explicit_3d surface, explicit_3d tangent plane, point_3d].
   */
  private buildTangentSpec(
    latex: string,
    diagnostics: Diagnostic[],
  ): Result<PlotSpec> {
    try {
      const parts = latex.split(";").map((s) => s.trim()).filter(Boolean);

      if (parts.length < 2) {
        return err(
          "Tangent plane: expected format 'f(x,y); (a,b)' — surface expression then point",
          diagnostics,
        );
      }

      const surfaceLatex = parts[0];
      const pointLatex = parts[1];

      // ── Parse and compile surface f(x,y) ─────────────────────────
      const surfaceExpr = parseLatex(surfaceLatex);
      const surfaceFn = compileToFunction(surfaceExpr, ["x", "y"]);
      const surfaceFnStr = toFnString(surfaceExpr);

      const surfaceData: PlotData = {
        latex: surfaceLatex,
        type: "explicit_3d",
        fnStrings: [surfaceFnStr],
        compiledFns: [surfaceFn],
      };

      // ── Extract numeric point (a, b) ───────────────────────────────
      const pointExpr = parseLatex(pointLatex);
      const comps = extractTupleComponents(pointExpr, 2);
      if (!comps || comps.length < 2) {
        return err(
          "Tangent plane: could not extract point coordinates from '" + pointLatex + "'",
          diagnostics,
        );
      }
      const aFn = compileToFunction(comps[0], []);
      const bFn = compileToFunction(comps[1], []);
      const a = aFn();
      const b = bFn();

      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return err(
          `Tangent plane: point coordinates must be finite numbers, got (${a}, ${b})`,
          diagnostics,
        );
      }

      // ── Evaluate f(a,b) and partial derivatives via central differences ──
      const fa_b = surfaceFn(a, b);
      const H = 1e-5;
      const fx = (surfaceFn(a + H, b) - surfaceFn(a - H, b)) / (2 * H);
      const fy = (surfaceFn(a, b + H) - surfaceFn(a, b - H)) / (2 * H);

      if (!Number.isFinite(fa_b)) {
        return err(
          `Tangent plane: f(${a}, ${b}) is not finite — cannot compute tangent plane`,
          diagnostics,
        );
      }

      diagnostics.push({
        level: "info",
        message: `Tangent plane at (${a}, ${b}): f=${fa_b.toFixed(4)}, ∂f/∂x=${fx.toFixed(4)}, ∂f/∂y=${fy.toFixed(4)}`,
      });

      // ── Build tangent plane: z = fa_b + fx*(x-a) + fy*(y-b) ──────
      const planeFn = (x: number, y: number) => fa_b + fx * (x - a) + fy * (y - b);
      const planeFnStr = `(${fa_b} + ${fx} * (x - ${a}) + ${fy} * (y - ${b}))`;

      const planeData: PlotData = {
        latex: planeFnStr,
        type: "explicit_3d",
        fnStrings: [planeFnStr],
        compiledFns: [planeFn],
      };

      // ── Build point (a, b, f(a,b)) ────────────────────────────────
      const pointData: PlotData = {
        latex: `(${a}, ${b}, ${fa_b})`,
        type: "point_3d",
        fnStrings: [String(a), String(b), String(fa_b)],
        compiledFns: [() => a, () => b, () => fa_b],
      };

      // ── Compute a sensible z range from surface samples ───────────
      const range3d: [number, number] = [-5, 5];
      let zMin = Infinity;
      let zMax = -Infinity;
      const SAMPLES = 15;
      const dx = (range3d[1] - range3d[0]) / SAMPLES;
      for (let i = 0; i <= SAMPLES; i++) {
        for (let j = 0; j <= SAMPLES; j++) {
          const x = range3d[0] + i * dx;
          const y = range3d[0] + j * dx;
          const z = surfaceFn(x, y);
          if (Number.isFinite(z)) {
            if (z < zMin) zMin = z;
            if (z > zMax) zMax = z;
          }
        }
      }
      const zSpan = Number.isFinite(zMin) && Number.isFinite(zMax)
        ? Math.max(zMax - zMin, 1)
        : 10;
      const zPad = zSpan * 0.2;
      const zRange: [number, number] = Number.isFinite(zMin)
        ? [zMin - zPad, zMax + zPad]
        : [-5, 5];

      return ok(
        {
          data: [surfaceData, planeData, pointData],
          freeVars: [],
          ranges: { x: range3d, y: range3d, z: zRange },
        },
        diagnostics,
      );
    } catch (e) {
      return err(
        `Tangent plane mode failed: ${e instanceof Error ? e.message : String(e)}`,
        diagnostics,
      );
    }
  }
}

// ── Internal Helpers ──────────────────────────────────────────────

function is3dType(t: ExprType): boolean {
  return t === "explicit_3d" || t === "implicit_3d" || t === "parametric_3d"
    || t === "vector_3d" || t === "point_3d" || t === "vector_field_3d";
}

/**
 * Promote a 2D type to a 3D equivalent when the user explicitly
 * requests @plot3d on a 2D expression.
 */
function promoteToExplicit3d(t: ExprType): ExprType {
  switch (t) {
    case "explicit_2d":
    case "implicit_2d":
    case "inequality_2d":
      return "explicit_3d";
    case "parametric_2d":
      return "parametric_3d";
    case "point_2d":
      return "point_3d";
    default:
      return t;
  }
}

/**
 * Build a PlotData object from LaTeX and its classified type.
 *
 * Handles splitting equations on `=`, extracting the appropriate side
 * for compilation, and choosing the right variable set for compilation.
 */
function buildPlotData(
  latex: string,
  exprType: ExprType,
  diagnostics: Diagnostic[],
): PlotData | null {
  try {
    // ── Inequality handling ──────────────────────────────────────
    if (exprType === "inequality_2d") {
      return buildInequalityPlotData(latex, diagnostics);
    }

    // ── Vector and point handling (zero-arg compiled fns) ────────
    if (exprType === "vector_3d") {
      return buildVectorPlotData(latex, diagnostics);
    }
    if (exprType === "point_2d" || exprType === "point_3d") {
      return buildPointPlotData(latex, exprType, diagnostics);
    }

    const expr = parseLatex(latex);
    const json = expr.json;

    // Determine what to plot based on type and equation structure
    let plotExpr = expr;
    const ce = getCE();

    // CortexJS may return "Equal" or "Assign" as the head for `lhs = rhs`.
    // Accept both to avoid silent failures when the representation changes.
    const isEquation =
      Array.isArray(json) &&
      (json[0] === "Equal" || json[0] === "Assign" || json[0] === "Equation") &&
      json.length === 3;

    // If it's an equation, extract the plottable part
    if (isEquation) {
      switch (exprType) {
        case "explicit_2d": {
          // y = f(x) → plot f(x)
          // or x = f(y) → still an explicit form, plot the RHS
          plotExpr = ce.box(json[2]);
          break;
        }
        case "explicit_3d": {
          // z = f(x,y) → plot f(x,y)
          plotExpr = ce.box(json[2]);
          break;
        }
        case "polar": {
          // r = f(theta) → plot f(theta)
          plotExpr = ce.box(json[2]);
          break;
        }
        case "implicit_2d": {
          // f(x,y) = g(x,y) → plot f(x,y) - g(x,y) = 0
          plotExpr = ce.box(["Subtract", json[1], json[2]]);
          diagnostics.push({
            level: "info",
            message: "Implicit curve: rendering via interval arithmetic",
          });
          break;
        }
        case "implicit_3d": {
          // f(x,y,z) = g(x,y,z) → plot f - g = 0
          plotExpr = ce.box(["Subtract", json[1], json[2]]);
          break;
        }
        default:
          // Use the full expression as-is
          break;
      }
    }

    // ── Parametric curves: extract tuple components (x(t), y(t), z(t)) ──
    // The renderer expects compiledFns = [fnX, fnY, fnZ] (3 separate fns).
    // A tuple expression like (\cos(t), \sin(t), t/3) must be split here.
    if (exprType === "parametric_2d" || exprType === "parametric_3d") {
      const componentCount = exprType === "parametric_3d" ? 3 : 2;
      const components = extractTupleComponents(plotExpr, componentCount);
      if (components && components.length >= componentCount) {
        return {
          latex,
          type: exprType,
          fnStrings: components.map((c) => toFnString(c)),
          compiledFns: components.map((c) => compileToFunction(c, ["t"])),
        };
      }
      // Fall through: single-expression parametric (rare) uses default build
    }

    // Polar: detect whether expression uses "theta" or "t" for the angle variable
    if (exprType === "polar") {
      const fnStr = toFnString(plotExpr);
      const usesTheta = /\btheta\b/.test(fnStr);
      const vars = usesTheta ? ["theta"] : ["t"];
      const compiledFn = compileToFunction(plotExpr, vars);
      return { latex, type: "polar", fnStrings: [fnStr], compiledFns: [compiledFn] };
    }

    // Build fnStrings and compiled functions based on type
    const fnStr = toFnString(plotExpr);
    const vars = getVarsForType(exprType);
    const compiledFn = compileToFunction(plotExpr, vars);

    return {
      latex,
      type: exprType,
      fnStrings: [fnStr],
      compiledFns: [compiledFn],
    };
  } catch (e) {
    diagnostics.push({
      level: "error",
      message: `Failed to build plot data: ${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  }
}

/**
 * Build PlotData for an inequality expression (y > f(x), y < f(x), etc.).
 * Compiles the boundary function and attaches operator metadata.
 */
function buildInequalityPlotData(
  latex: string,
  diagnostics: Diagnostic[],
): PlotData | null {
  const ineq = detectInequality(latex);
  if (!ineq) return null;

  try {
    // Parse the RHS as the boundary function
    const ce = getCE();
    const rhsExpr = ce.parse(ineq.rhs);
    const fnStr = toFnString(rhsExpr);
    const compiledFn = compileToFunction(rhsExpr, ["x"]);

    diagnostics.push({
      level: "info",
      message: `Inequality: ${ineq.variable} ${ineq.operator} f(x)`,
    });

    return {
      latex,
      type: "inequality_2d",
      fnStrings: [fnStr],
      compiledFns: [compiledFn],
      inequality: {
        operator: ineq.operator,
        variable: ineq.variable,
      },
    };
  } catch (e) {
    diagnostics.push({
      level: "error",
      message: `Failed to build inequality: ${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  }
}

/** Return the coordinate variable names for a given expression type. */
function getVarsForType(t: ExprType): string[] {
  switch (t) {
    case "explicit_2d":
    case "inequality_2d":
      return ["x"];
    case "implicit_2d":
      return ["x", "y"];
    case "parametric_2d":
      return ["t"];
    case "polar":
      return ["t"];
    case "explicit_3d":
      return ["x", "y"];
    case "implicit_3d":
      return ["x", "y", "z"];
    case "parametric_3d":
      return ["t"];
    case "vector_3d":
    case "point_2d":
    case "point_3d":
      return [];
    case "contour_2d":
    case "vector_field_2d":
    case "region_2d":
      return ["x", "y"];
    case "vector_field_3d":
      return ["x", "y", "z"];
  }
}

/**
 * Compute reasonable axis ranges for the plot.
 */
function computeRanges(
  exprType: ExprType,
  plotData: PlotData,
  is3d: boolean,
): AxisRanges {
  // Default ranges
  const range2d: [number, number] = [-10, 10];
  const range3d: [number, number] = [-5, 5];
  const tRange: [number, number] = [0, 2 * Math.PI];

  if (is3d) {
    const base3d: AxisRanges = {
      x: range3d,
      y: range3d,
      z: range3d,
      ...(exprType === "parametric_3d" ? { t: tRange } : {}),
    };

    // Auto-compute z range for explicit_3d surfaces (z = f(x,y)).
    if (exprType === "explicit_3d" && plotData.compiledFns.length > 0) {
      try {
        const fn = plotData.compiledFns[0];
        let zMin = Infinity;
        let zMax = -Infinity;
        const SAMPLES = 20;
        const [xLo, xHi] = range3d;
        const dx = (xHi - xLo) / SAMPLES;

        for (let i = 0; i <= SAMPLES; i++) {
          for (let j = 0; j <= SAMPLES; j++) {
            const x = xLo + i * dx;
            const y = xLo + j * dx;
            const z = fn(x, y);
            if (Number.isFinite(z)) {
              if (z < zMin) zMin = z;
              if (z > zMax) zMax = z;
            }
          }
        }

        if (Number.isFinite(zMin) && Number.isFinite(zMax)) {
          const span = zMax - zMin;
          const padding = Math.max(span * 0.1, 0.5);
          base3d.z = [zMin - padding, zMax + padding];
        }
      } catch {
        // Keep default z range on any error
      }
    }

    // Auto-range for implicit_3d: estimate z extent by solving f(x,y,z)=0 along sample lines
    if (exprType === "implicit_3d" && plotData.compiledFns.length > 0) {
      try {
        const fn = plotData.compiledFns[0];
        let zMin = Infinity;
        let zMax = -Infinity;
        const SAMPLES = 20;
        const [xLo, xHi] = base3d.x;
        const [yLo, yHi] = base3d.y;
        const dx = (xHi - xLo) / SAMPLES;
        const zSearchLo = -50, zSearchHi = 50;
        const dz = (zSearchHi - zSearchLo) / 100;

        // Sample (x,y) grid and find z where sign changes (f crosses 0)
        for (let i = 0; i <= SAMPLES; i++) {
          for (let j = 0; j <= SAMPLES; j++) {
            const x = xLo + i * dx;
            const y = yLo + j * dx;
            let prevVal = fn(x, y, zSearchLo);
            for (let z = zSearchLo + dz; z <= zSearchHi; z += dz) {
              const val = fn(x, y, z);
              if (Number.isFinite(prevVal) && Number.isFinite(val) && prevVal * val <= 0) {
                if (z < zMin) zMin = z;
                if (z > zMax) zMax = z;
              }
              prevVal = val;
            }
          }
        }

        if (Number.isFinite(zMin) && Number.isFinite(zMax)) {
          const span = Math.max(zMax - zMin, 1);
          const padding = span * 0.2;
          base3d.z = [zMin - padding, zMax + padding];
        }
      } catch { /* keep default z range */ }
    }

    // Auto-range for 3D points: ensure point is visible.
    if (exprType === "point_3d" && plotData.compiledFns.length >= 3) {
      try {
        const px_val = plotData.compiledFns[0]();
        const py_val = plotData.compiledFns[1]();
        const pz_val = plotData.compiledFns[2]();
        if (Number.isFinite(px_val) && Number.isFinite(py_val) && Number.isFinite(pz_val)) {
          const pad = Math.max(Math.abs(px_val), Math.abs(py_val), Math.abs(pz_val), 1) * 0.3;
          base3d.x = [Math.min(base3d.x[0], px_val - pad), Math.max(base3d.x[1], px_val + pad)];
          base3d.y = [Math.min(base3d.y[0], py_val - pad), Math.max(base3d.y[1], py_val + pad)];
          base3d.z = [Math.min((base3d.z || base3d.y)[0], pz_val - pad), Math.max((base3d.z || base3d.y)[1], pz_val + pad)];
        }
      } catch { /* keep defaults */ }
    }

    // Auto-range for vector_3d: expand cube to fit vector tip.
    if (exprType === "vector_3d" && plotData.compiledFns.length >= 3) {
      try {
        const a = plotData.compiledFns[0]();
        const b = plotData.compiledFns[1]();
        const c = plotData.compiledFns[2]();
        if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) {
          const maxComp = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), 1);
          const pad = maxComp * 1.5;
          base3d.x = [-pad, pad];
          base3d.y = [-pad, pad];
          base3d.z = [-pad, pad];
        }
      } catch { /* keep defaults */ }
    }

    return base3d;
  }

  const base: AxisRanges = {
    x: range2d,
    y: range2d,
  };

  if (exprType === "parametric_2d" || exprType === "polar") {
    base.t = tRange;
  }

  // Contour, vector field 2D, and region: use default 2D ranges (already set above).
  // No additional logic needed — fall through to return base.

  // Auto-range for 2D points: ensure point is visible.
  if (exprType === "point_2d" && plotData.compiledFns.length >= 2) {
    try {
      const px_val = plotData.compiledFns[0]();
      const py_val = plotData.compiledFns[1]();
      if (Number.isFinite(px_val) && Number.isFinite(py_val)) {
        const pad = Math.max(Math.abs(px_val), Math.abs(py_val), 2) * 0.3;
        base.x = [Math.min(base.x[0], px_val - pad), Math.max(base.x[1], px_val + pad)];
        base.y = [Math.min(base.y[0], py_val - pad), Math.max(base.y[1], py_val + pad)];
      }
    } catch { /* keep defaults */ }
  }

  // Simple auto-ranging: sample the function at a few points and extend
  // the y-range if values go out of bounds
  if ((exprType === "explicit_2d" || exprType === "inequality_2d") && plotData.compiledFns.length > 0) {
    try {
      const fn = plotData.compiledFns[0];
      let yMin = Infinity;
      let yMax = -Infinity;
      const SAMPLES = 50;
      const xLo = range2d[0];
      const xHi = range2d[1];
      const step = (xHi - xLo) / SAMPLES;

      for (let i = 0; i <= SAMPLES; i++) {
        const x = xLo + i * step;
        const y = fn(x);
        if (Number.isFinite(y)) {
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }

      if (Number.isFinite(yMin) && Number.isFinite(yMax)) {
        const padding = Math.max((yMax - yMin) * 0.1, 1);
        base.y = [
          Math.min(yMin - padding, range2d[0]),
          Math.max(yMax + padding, range2d[1]),
        ];
      }
    } catch {
      // Auto-range failed; keep defaults
    }
  }

  return base;
}

/**
 * Merge two AxisRanges by expanding to encompass both.
 */
function mergeRanges(a: AxisRanges, b: AxisRanges): AxisRanges {
  const merged: AxisRanges = {
    x: [Math.min(a.x[0], b.x[0]), Math.max(a.x[1], b.x[1])],
    y: [Math.min(a.y[0], b.y[0]), Math.max(a.y[1], b.y[1])],
  };
  if (a.z || b.z) {
    const az = a.z || a.y;
    const bz = b.z || b.y;
    merged.z = [Math.min(az[0], bz[0]), Math.max(az[1], bz[1])];
  }
  if (a.t || b.t) {
    const at = a.t || [0, 2 * Math.PI];
    const bt = b.t || [0, 2 * Math.PI];
    merged.t = [Math.min(at[0], bt[0]), Math.max(at[1], bt[1])];
  }
  return merged;
}

// ── Vector and Point PlotData Builders ───────────────────────────────

/**
 * Build a PlotData for a vector expression like <1,2,3> or \langle a,b,c \rangle.
 * Returns zero-arg compiledFns so the renderer can evaluate the components.
 */
function buildVectorPlotData(
  latex: string,
  diagnostics: Diagnostic[],
): PlotData | null {
  const clean = latex
    .replace(/\\langle/g, "<").replace(/\\rangle/g, ">")
    .replace(/\\left\s*</g, "<").replace(/\\right\s*>/g, ">")
    .trim();

  const vecMatch = clean.match(/^[<(]\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^>)]+)\s*[>)]$/);
  if (!vecMatch) return null;

  const [, rawA, rawB, rawC] = vecMatch;
  try {
    const ce = getCE();
    const exprA = ce.parse(rawA.trim());
    const exprB = ce.parse(rawB.trim());
    const exprC = ce.parse(rawC.trim());

    const fnA = compileToFunction(exprA, []);
    const fnB = compileToFunction(exprB, []);
    const fnC = compileToFunction(exprC, []);

    return {
      latex,
      type: "vector_3d",
      fnStrings: [toFnString(exprA), toFnString(exprB), toFnString(exprC)],
      compiledFns: [fnA, fnB, fnC],
    };
  } catch {
    return null;
  }
}

/**
 * Build a PlotData for a literal point: (a,b) → point_2d or (a,b,c) → point_3d.
 * Handles promotion from point_2d to point_3d by appending z=0.
 */
function buildPointPlotData(
  latex: string,
  exprType: "point_2d" | "point_3d",
  diagnostics: Diagnostic[],
): PlotData | null {
  try {
    const expr = parseLatex(latex);
    const n = exprType === "point_3d" ? 3 : 2;
    let components = extractTupleComponents(expr, n);

    // point_3d promoted from point_2d: try 2 components + z=0
    if (!components && exprType === "point_3d") {
      const comps2 = extractTupleComponents(expr, 2);
      if (comps2 && comps2.length >= 2) {
        const ce = getCE();
        components = [...comps2, ce.box(0)];
      }
    }

    if (!components || components.length < n) {
      diagnostics.push({ level: "warning", message: `Could not extract ${n} components from point` });
      return null;
    }

    return {
      latex,
      type: exprType,
      fnStrings: components.map(c => toFnString(c)),
      compiledFns: components.map(c => compileToFunction(c, [])),
    };
  } catch {
    return null;
  }
}

// ── Geometry Spec Builder ─────────────────────────────────────────────

/**
 * Parse a @geom expression and build a vector_3d PlotSpec.
 * Delegates PlotData construction to buildVectorPlotData.
 */
function buildGeomSpec(
  latex: string,
  diagnostics: Diagnostic[],
): PlotSpec | null {
  const vectorData = buildVectorPlotData(latex, diagnostics);
  if (!vectorData) return null;

  const a = vectorData.compiledFns[0]();
  const b = vectorData.compiledFns[1]();
  const c = vectorData.compiledFns[2]();

  if (!isFinite(a) || !isFinite(b) || !isFinite(c)) {
    diagnostics.push({
      level: "warning",
      message: "Vector components could not be evaluated to finite numbers",
    });
    return null;
  }

  const maxComp = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), 1);
  const pad = maxComp * 1.5;

  return {
    data: [vectorData],
    freeVars: [],
    ranges: {
      x: [-pad, pad],
      y: [-pad, pad],
      z: [-pad, pad],
    },
  };
}

// Re-export submodules for direct access if needed
export { parseLatex, toFnString, compileToFunction, classifyExpression, detectFreeVars } from "./parser";
export { evaluate } from "./evaluator";
export { differentiate, integrate, solveEquation } from "./cas";
export { convertUnits } from "./units";
