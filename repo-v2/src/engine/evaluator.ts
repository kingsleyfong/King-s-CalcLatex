/**
 * King's CalcLatex v2 — Expression Evaluator
 *
 * Evaluates LaTeX expressions in various modes: exact, approximate,
 * simplify, solve, factor. Always returns Result<EvalResult>, never throws.
 */

import type { BoxedExpression } from "@cortex-js/compute-engine";
import { parseLatex, getCE, compileToFunction, jsonToLatex } from "./parser";
import {
  differentiate as casDifferentiate,
  integrate as casIntegrate,
  solveEquation as casSolve,
  factorExpression as casFactor,
  partialDerivative,
  computeGradient,
  computeNormal,
  latexToReadable,
} from "./cas";
import {
  giacSimplify,
  giacLimit,
  giacTaylor,
  giacPartfrac,
  giacExpand,
  giacSteps,
  giacIntegrate,
  latexToGiac,
  isGiacReady,
} from "./giac";
import type { EvalMode, EvalResult, Result, Diagnostic } from "../types";
import { ok, err } from "../types";
import { convertUnits as convertUnitsFromEngine, formatUnitResultAsLatex } from "./units";

function giacOnlyError(opName: string): string {
  if (isGiacReady()) {
    return `${opName} failed. The expression may not be supported.`;
  }
  return `${opName} requires Giac CAS engine. Enable in Settings and place giacwasm.js in the plugin folder.`;
}

/**
 * Extract a standard LaTeX string from a BoxedExpression.
 * Uses custom jsonToLatex() to avoid CortexJS non-standard output.
 */
function exprToLatex(expr: BoxedExpression): string {
  try {
    if (expr.json !== undefined) return jsonToLatex(expr.json);
  } catch { /* fall through */ }
  try {
    const latex = expr.latex;
    if (typeof latex === "string" && latex.length > 0) return latex;
  } catch { /* fall through */ }
  return String(expr);
}

/**
 * Build an EvalResult from a BoxedExpression.
 * Uses LaTeX→readable conversion for the text field instead of String(expr)
 * which gives CortexJS MathJSON internal format.
 */
function toEvalResult(expr: BoxedExpression): EvalResult {
  const latex = exprToLatex(expr);
  return {
    latex,
    text: latexToReadable(latex),
  };
}

// ── Definite Integral Detection & Evaluation ─────────────────────

/**
 * Parse a definite integral from stripped LaTeX.
 * Returns { lo, hi, integrand, variable } or null if not a definite integral.
 */
function parseDefiniteIntegralEval(
  latex: string,
): { lo: string; hi: string; integrand: string; variable: string } | null {
  // Braced form: \int_{lo}^{hi} f(x) \, dx
  let m = latex.match(
    /^\\int\s*_\{([^{}]+)\}\s*\^\{([^{}]+)\}\s*([\s\S]+?)\\?[,]?\s*d([a-z])\s*$/,
  );
  if (m) {
    return {
      lo: m[1].trim(),
      hi: m[2].trim(),
      integrand: m[3].trim(),
      variable: m[4],
    };
  }

  // Unbraced single-token form: \int_a^b f(x) \, dx
  m = latex.match(
    /^\\int\s*_([^\\{}\s])\s*\^([^\\{}\s])\s*([\s\S]+?)\\?[,]?\s*d([a-z])\s*$/,
  );
  if (m) {
    return {
      lo: m[1].trim(),
      hi: m[2].trim(),
      integrand: m[3].trim(),
      variable: m[4],
    };
  }

  return null;
}

/**
 * Numeric definite integral via composite Simpson's rule.
 * Used as a fallback when symbolic antiderivative fails.
 *
 * @param fn - Compiled JS function f(x) for the integrand
 * @param lo - Lower bound
 * @param hi - Upper bound
 * @param n  - Number of subdivisions (must be even; default 1000)
 */
function simpsonIntegrate(
  fn: (x: number) => number,
  lo: number,
  hi: number,
  n = 1000,
): number {
  if (n % 2 !== 0) n++;
  const h = (hi - lo) / n;
  let sum = fn(lo) + fn(hi);
  for (let i = 1; i < n; i++) {
    const x = lo + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * fn(x);
  }
  return (h / 3) * sum;
}

/**
 * Attempt to evaluate a definite integral from the raw LaTeX.
 *
 * Strategy:
 * 1. Try Giac CAS (full symbolic integration with bounds)
 * 2. Try CortexJS: get antiderivative via casIntegrate, evaluate at bounds
 * 3. Fall back to composite Simpson's rule (~1000 subdivisions)
 *
 * For exact mode: show \int_{a}^{b} f(x)\,dx = F(b) - F(a) = result
 * For approximate mode: show numeric result only
 *
 * Returns null if the expression is not a definite integral.
 */
async function tryDefiniteIntegral(
  rawLatex: string,
  mode: EvalMode,
  diagnostics: Diagnostic[],
  precision?: number,
): Promise<Result<EvalResult> | null> {
  // Strip outer delimiters
  let latex = rawLatex.trim();
  if (latex.startsWith("$$") && latex.endsWith("$$")) latex = latex.slice(2, -2).trim();
  else if (latex.startsWith("$") && latex.endsWith("$")) latex = latex.slice(1, -1).trim();
  else if (latex.startsWith("\\[") && latex.endsWith("\\]")) latex = latex.slice(2, -2).trim();
  else if (latex.startsWith("\\(") && latex.endsWith("\\)")) latex = latex.slice(2, -2).trim();

  const parsed = parseDefiniteIntegralEval(latex);
  if (!parsed) return null;

  const { lo, hi, integrand, variable } = parsed;

  // ── Strategy 1: Giac CAS (symbolic, handles most integrals) ──────
  try {
    const fullIntLatex = `\\int_{${lo}}^{${hi}} ${integrand} \\, d${variable}`;
    const giacResult = await giacIntegrate(fullIntLatex, variable);
    if (giacResult && giacResult.ok) {
      if (mode === "exact") {
        const enrichedLatex =
          `\\int_{${lo}}^{${hi}} ${integrand}\\,d${variable} = ${giacResult.value.latex}`;
        diagnostics.push({
          level: "info",
          message: `Definite integral evaluated symbolically (Giac)`,
        });
        return ok(
          { latex: enrichedLatex, text: latexToReadable(enrichedLatex) },
          diagnostics,
        );
      }
      diagnostics.push({
        level: "info",
        message: `Definite integral evaluated (Giac)`,
      });
      return giacResult;
    }
  } catch { /* Giac not available or failed — continue */ }

  // ── Strategy 2: CortexJS antiderivative + evaluate at bounds ─────
  try {
    const integrandExpr = parseLatex(integrand);
    if (integrandExpr.isValid !== false) {
      const antiderivResult = await casIntegrate(integrand, variable);
      if (antiderivResult.ok) {
        const antiderivLatex = antiderivResult.value.latex;
        const loExpr = parseLatex(lo);
        const hiExpr = parseLatex(hi);
        const loNum = forceNumber(loExpr.N());
        const hiNum = forceNumber(hiExpr.N());

        if (loNum !== null && hiNum !== null && Number.isFinite(loNum) && Number.isFinite(hiNum)) {
          const ce = getCE();
          const antiderivParsed = parseLatex(antiderivLatex);
          const fHi = forceNumber(
            antiderivParsed.subs({ [variable]: ce.number(hiNum) } as any).evaluate(),
          );
          const fLo = forceNumber(
            antiderivParsed.subs({ [variable]: ce.number(loNum) } as any).evaluate(),
          );

          if (fHi !== null && fLo !== null && Number.isFinite(fHi) && Number.isFinite(fLo)) {
            const result = fHi - fLo;
            const p = (precision !== undefined && precision > 0) ? precision : 12;
            const rounded = parseFloat(result.toFixed(p));
            const numStr = rounded.toString();

            if (mode === "exact") {
              const resultLatex =
                `\\int_{${lo}}^{${hi}} ${integrand}\\,d${variable} = \\left[${antiderivLatex}\\right]_{${lo}}^{${hi}} = ${numStr}`;
              diagnostics.push({
                level: "info",
                message: `Definite integral: F(${hi}) - F(${lo}) = ${numStr}`,
              });
              return ok(
                { latex: resultLatex, text: latexToReadable(resultLatex) },
                diagnostics,
              );
            }
            diagnostics.push({
              level: "info",
              message: `Definite integral evaluated numerically`,
            });
            return ok({ latex: numStr, text: numStr }, diagnostics);
          }
        }
      }
    }
  } catch { /* fall through to numeric */ }

  // ── Strategy 3: Simpson's rule numeric fallback ──────────────────
  try {
    const integrandExpr = parseLatex(integrand);
    const fn = compileToFunction(integrandExpr, [variable]);

    const loExpr = parseLatex(lo);
    const hiExpr = parseLatex(hi);
    const loNum = forceNumber(loExpr.N());
    const hiNum = forceNumber(hiExpr.N());

    if (loNum !== null && hiNum !== null && Number.isFinite(loNum) && Number.isFinite(hiNum)) {
      const result = simpsonIntegrate(fn, loNum, hiNum, 1000);
      if (Number.isFinite(result)) {
        const p = (precision !== undefined && precision > 0) ? precision : 8;
        const rounded = parseFloat(result.toPrecision(p));
        const numStr = rounded.toString();

        diagnostics.push({
          level: "info",
          message: `Definite integral evaluated via numeric quadrature (Simpson's rule, n=1000)`,
        });

        if (mode === "exact") {
          const resultLatex =
            `\\int_{${lo}}^{${hi}} ${integrand}\\,d${variable} \\approx ${numStr}`;
          return ok(
            { latex: resultLatex, text: latexToReadable(resultLatex) },
            diagnostics,
          );
        }
        return ok({ latex: numStr, text: numStr }, diagnostics);
      }
    }
  } catch { /* numeric quadrature failed */ }

  return null;
}

/**
 * Evaluate a LaTeX expression in the given mode.
 *
 * Modes:
 * - "exact": symbolic evaluation (simplify rationals, reduce fractions)
 * - "approximate": numeric floating-point evaluation
 * - "simplify": algebraic simplification
 * - "solve": attempt to solve for a variable
 * - "factor": attempt to factor the expression
 *
 * @param precision - Decimal places for approximate mode (optional)
 * @returns Promise<Result<EvalResult>> — never throws
 */
export async function evaluate(
  latex: string,
  mode: EvalMode,
  precision?: number,
): Promise<Result<EvalResult>> {
  const diagnostics: Diagnostic[] = [];

  let expr: BoxedExpression;
  try {
    expr = parseLatex(latex);
  } catch (e) {
    return err(
      `Failed to parse LaTeX: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Check for parsing errors in the expression
  if (expr.isValid === false) {
    diagnostics.push({
      level: "warning",
      message: "Expression may not have parsed correctly",
    });
  }

  // ── Definite integral detection ──────────────────────────────────
  // Detect \int_{a}^{b} f(x)\,dx before the mode switch. This handles
  // definite integrals in both exact and approximate modes, using Giac
  // CAS, CortexJS antiderivative, or Simpson's rule as fallback.
  if (mode === "exact" || mode === "approximate") {
    const defIntResult = await tryDefiniteIntegral(latex, mode, diagnostics, precision);
    if (defIntResult) return defIntResult;
  }

  // ── Raw-LaTeX linear algebra pre-processing ───────────────────────
  // CortexJS v0.24 does NOT recognise \det as a built-in command — it
  // emits an "unexpected-command" Error node and the matrix is lost.
  // Intercept \det before calling ce.parse() by inspecting the raw string.
  const rawLinalgResult = tryLinearAlgebraFromLatex(latex, diagnostics);
  if (rawLinalgResult) return rawLinalgResult;

  // ── Cross product detection ────────────────────────────────────────
  // CortexJS does not natively support cross product. \times between
  // two matrices/vectors is parsed as ["Multiply", m1, m2] which fails,
  // or may surface as an Error node. Detect this case and compute the
  // cross product manually for 3-element vectors.
  const crossResult = tryCrossProduct(expr, diagnostics);
  if (crossResult) return crossResult;

  // ── Linear algebra operations ──────────────────────────────────────
  // Determinant, transpose, inverse, dot product, matrix multiplication.
  const linalgResult = tryLinearAlgebra(expr, diagnostics);
  if (linalgResult) return linalgResult;

  try {
    switch (mode) {
      case "exact":
        return evaluateExact(expr, diagnostics);
      case "approximate":
        return evaluateApproximate(expr, diagnostics, precision);
      case "simplify": {
        const giacSimp = await giacSimplify(latex);
        if (giacSimp) return giacSimp;
        return evaluateSimplify(expr, diagnostics);
      }
      case "solve":
        return await casSolve(latex);
      case "factor":
        return await casFactor(latex);

      // CAS operations — delegate to cas.ts
      case "differentiate":
        return await casDifferentiate(latex);
      case "integrate":
        return await casIntegrate(latex);
      case "partial_x":
        return await partialDerivative(latex, "x");
      case "partial_y":
        return await partialDerivative(latex, "y");
      case "partial_z":
        return await partialDerivative(latex, "z");
      case "gradient":
        return await computeGradient(latex);
      case "normal":
        return await computeNormal(latex);

      // Giac-only operations
      case "limit":
        return (await giacLimit(latex)) ?? err(giacOnlyError("Limit"));
      case "taylor":
        return (await giacTaylor(latex)) ?? err(giacOnlyError("Taylor series"));
      case "partfrac":
        return (await giacPartfrac(latex)) ?? err(giacOnlyError("Partial fractions"));
      case "expand":
        return (await giacExpand(latex)) ?? err(giacOnlyError("Expand"));
      case "steps":
        return (await giacSteps(latex)) ?? err(giacOnlyError("Step-by-step"));

      case "convert": {
        // Expected syntax: `5 \text{ft} \to \text{m}` or `5\,\text{ft} \to \text{m}` or `5 ft \to m`
        // \to and \rightarrow are both accepted as the separator.
        const arrowMatch = latex.match(/(.*?)\\(?:to|rightarrow)\s*(.*)/);
        if (!arrowMatch) {
          return err(
            "Use format: value unit \\to unit (e.g., 5\\text{ft} \\to \\text{m})",
          );
        }

        const sourcePart = arrowMatch[1].trim();
        const targetPart = arrowMatch[2].trim();

        // Strip LaTeX formatting from unit strings so math.js can parse them.
        const cleanUnit = (s: string) =>
          s
            .replace(/\\text\{([^{}]+)\}/g, "$1")
            .replace(/\\mathrm\{([^{}]+)\}/g, "$1")
            .replace(/\\,/g, "")
            .replace(/\\ /g, " ")
            .replace(/\{/g, "")
            .replace(/\}/g, "")
            .trim();

        // Extract leading number and the rest (unit) from the source part.
        const numMatch = sourcePart.match(
          /^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*(.*)/,
        );
        if (!numMatch) {
          return err(
            "Could not parse value. Use format: 5\\text{ft} \\to \\text{m}",
          );
        }

        const value = parseFloat(numMatch[1]);
        const fromUnit = cleanUnit(numMatch[2]);
        const toUnit = cleanUnit(targetPart);

        const convResult = convertUnitsFromEngine(value, fromUnit, toUnit);
        if (!convResult.ok) {
          // Pass diagnostics from units.ts through alongside the error.
          return err(convResult.error, convResult.diagnostics);
        }

        const rawText = convResult.value;
        const resultLatex = formatUnitResultAsLatex(rawText);

        return ok(
          { latex: resultLatex, text: rawText },
          convResult.diagnostics,
        );
      }

      default:
        return err(`Unknown evaluation mode: ${mode as string}`);
    }
  } catch (e) {
    return err(
      `Evaluation failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}

// ── Cross Product ────────────────────────────────────────────────────

/**
 * Extract a numeric vector (array of numbers) from a CortexJS MathJSON
 * matrix/vector representation.
 *
 * CortexJS represents \begin{pmatrix}1 & 3 & 5\end{pmatrix} as:
 *   ["Matrix", ["List", ["List", 1, 3, 5]]]            — 1-row matrix
 *   ["List", ["List", 1, 3, 5]]                        — list of lists
 *   ["Matrix", ["List", 1, 3, 5]]                      — flat matrix
 *   ["List", 1, 3, 5]                                  — flat list
 *
 * Returns the extracted number array, or null if the node is not a
 * recognizable vector/1-row-matrix of numbers.
 */
function extractVector(json: unknown): number[] | null {
  if (!Array.isArray(json)) return null;
  const [head, ...args] = json as [string, ...unknown[]];

  // Unwrap Error nodes: ["Error", errorCode, actualValue] or ["Error", actualValue, ...]
  // CortexJS wraps failed operations in Error nodes. The matrix payload can be
  // in any of the trailing arguments.
  if (head === "Error") {
    for (const arg of args) {
      const attempt = extractVector(arg);
      if (attempt) return attempt;
    }
    return null;
  }

  // ["Matrix", inner] or ["List", inner]
  if ((head === "Matrix" || head === "List") && args.length === 1 && Array.isArray(args[0])) {
    const inner = args[0] as [string, ...unknown[]];
    const innerHead = inner[0];
    const innerArgs = inner.slice(1);

    // ["Matrix", ["List", ["List", a, b, c]]] — 1-row matrix
    if (
      (innerHead === "List") &&
      innerArgs.length === 1 &&
      Array.isArray(innerArgs[0])
    ) {
      const row = innerArgs[0] as [string, ...unknown[]];
      if (row[0] === "List") {
        const elems = row.slice(1);
        if (elems.every((e) => typeof e === "number")) return elems as number[];
      }
    }

    // ["Matrix", ["List", ["List", a], ["List", b], ["List", c]]] — column vector (Nx1 matrix)
    // Each inner list has exactly 1 numeric element. Extract the single element from each row.
    if (
      innerHead === "List" &&
      innerArgs.length >= 2 &&
      innerArgs.every(
        (row) =>
          Array.isArray(row) &&
          (row as unknown[])[0] === "List" &&
          (row as unknown[]).length === 2 &&
          typeof (row as unknown[])[1] === "number",
      )
    ) {
      return innerArgs.map((row) => (row as [string, number])[1]);
    }

    // ["Matrix", ["List", a, b, c]] or ["List", ["List", a, b, c]]
    if (innerHead === "List" && innerArgs.every((e) => typeof e === "number")) {
      return innerArgs as number[];
    }
  }

  // ["List", a, b, c] — flat list of numbers
  if (head === "List" && args.length >= 2 && args.every((e) => typeof e === "number")) {
    return args as number[];
  }

  // ["Matrix", a, b, c] — flat matrix of numbers (unlikely but defensive)
  if (head === "Matrix" && args.length >= 2 && args.every((e) => typeof e === "number")) {
    return args as number[];
  }

  return null;
}

/**
 * Detect and compute a cross product between two 3D vectors.
 *
 * CortexJS parses `\begin{pmatrix}...\end{pmatrix} \times \begin{pmatrix}...\end{pmatrix}`
 * as a Multiply (or sometimes Cross) node. The multiply of two matrices
 * often fails, producing an Error-containing expression. This function:
 *
 * 1. Checks if the expression head is Multiply, Cross, or contains an Error
 *    wrapping a multiply of two matrices.
 * 2. Extracts both operands as 3-element numeric vectors.
 * 3. Computes the cross product: a x b = (a2*b3-a3*b2, a3*b1-a1*b3, a1*b2-a2*b1).
 * 4. Returns the result formatted as a pmatrix LaTeX string.
 *
 * Returns null if the expression is not a cross product candidate.
 */
function tryCrossProduct(
  expr: BoxedExpression,
  diagnostics: Diagnostic[],
): Result<EvalResult> | null {
  const json = expr.json;
  if (!Array.isArray(json)) return null;

  const head = json[0] as string;
  let operands: unknown[] | null = null;

  // Case 1: ["Multiply", vec1, vec2] or ["Cross", vec1, vec2]
  if ((head === "Multiply" || head === "Cross") && json.length === 3) {
    operands = [json[1], json[2]];
  }

  // Case 2: ["Error", ["Multiply", vec1, vec2], ...] — failed multiply
  if (head === "Error" && json.length >= 2 && Array.isArray(json[1])) {
    const inner = json[1] as [string, ...unknown[]];
    if (
      (inner[0] === "Multiply" || inner[0] === "Cross") &&
      inner.length === 3
    ) {
      operands = [inner[1], inner[2]];
    }
  }

  // Case 3: ["Error", ["ErrorCode", ...], ["Multiply", vec1, vec2]]
  if (
    head === "Error" &&
    json.length >= 3 &&
    Array.isArray(json[2])
  ) {
    const inner = json[2] as [string, ...unknown[]];
    if (
      (inner[0] === "Multiply" || inner[0] === "Cross") &&
      inner.length === 3
    ) {
      operands = [inner[1], inner[2]];
    }
  }

  if (!operands) return null;

  const vecA = extractVector(operands[0]);
  const vecB = extractVector(operands[1]);

  if (!vecA || !vecB) return null;
  if (vecA.length !== 3 || vecB.length !== 3) return null;

  // Compute cross product: a x b
  const [a1, a2, a3] = vecA;
  const [b1, b2, b3] = vecB;
  const cross = [
    a2 * b3 - a3 * b2,
    a3 * b1 - a1 * b3,
    a1 * b2 - a2 * b1,
  ];

  diagnostics.push({
    level: "info",
    message: "Computed cross product of two 3D vectors",
  });

  const latex = `\\begin{pmatrix}${cross.join(" & ")}\\end{pmatrix}`;
  const text = `(${cross.join(", ")})`;

  return ok({ latex, text }, diagnostics);
}

// ── Linear Algebra Helpers ─────────────────────────────────────────

/**
 * Extract a 2D numeric matrix from CortexJS MathJSON.
 *
 * CortexJS represents matrices as:
 *   ["Matrix", ["List", ["List", a, b], ["List", c, d]]]  — standard NxM
 *   ["Matrix", ["List", ["List", a, b, c]]]                — 1-row matrix
 *   ["Matrix", ["List", ["List", a], ["List", b]]]         — column vector (Nx1)
 *
 * Also unwraps Error nodes the same way extractVector does.
 *
 * Returns a 2D array of numbers (rows x cols), or null if not a matrix of numbers.
 */
function extractMatrix(json: unknown): number[][] | null {
  if (!Array.isArray(json)) return null;
  const [head, ...args] = json as [string, ...unknown[]];

  // Unwrap Error nodes
  if (head === "Error") {
    for (const arg of args) {
      const attempt = extractMatrix(arg);
      if (attempt) return attempt;
    }
    return null;
  }

  // Must be ["Matrix", inner] or ["List", inner]
  if ((head !== "Matrix" && head !== "List") || args.length !== 1 || !Array.isArray(args[0])) {
    return null;
  }

  const inner = args[0] as [string, ...unknown[]];
  const innerHead = inner[0];
  const innerArgs = inner.slice(1);

  if (innerHead !== "List" || innerArgs.length === 0) return null;

  // Each innerArg should be a ["List", ...numbers] representing a row
  const rows: number[][] = [];
  for (const rowNode of innerArgs) {
    if (!Array.isArray(rowNode)) return null;
    const rowArr = rowNode as [string, ...unknown[]];
    if (rowArr[0] !== "List") return null;
    const elems = rowArr.slice(1);
    if (!elems.every((e) => typeof e === "number")) return null;
    rows.push(elems as number[]);
  }

  // Validate all rows have equal length
  if (rows.length === 0) return null;
  const cols = rows[0].length;
  if (cols === 0) return null;
  if (!rows.every((r) => r.length === cols)) return null;

  return rows;
}

/**
 * Compute the determinant of an NxN matrix via cofactor expansion.
 * For 1x1: det = a. For 2x2: ad - bc. For larger: recursive cofactor along first row.
 */
function determinant(m: number[][]): number {
  const n = m.length;
  if (n === 1) return m[0][0];
  if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];

  let det = 0;
  for (let col = 0; col < n; col++) {
    // Build the (n-1)x(n-1) minor by removing row 0 and column `col`
    const minor: number[][] = [];
    for (let r = 1; r < n; r++) {
      const row: number[] = [];
      for (let c = 0; c < n; c++) {
        if (c !== col) row.push(m[r][c]);
      }
      minor.push(row);
    }
    const sign = col % 2 === 0 ? 1 : -1;
    det += sign * m[0][col] * determinant(minor);
  }
  return det;
}

/**
 * Multiply two matrices: a (MxN) * b (NxP) = result (MxP).
 * Returns null if dimensions are incompatible.
 */
function matMul(a: number[][], b: number[][]): number[][] | null {
  const m = a.length;
  const n = a[0].length;
  const p = b[0].length;

  if (b.length !== n) return null; // incompatible dimensions

  const result: number[][] = [];
  for (let i = 0; i < m; i++) {
    const row: number[] = [];
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += a[i][k] * b[k][j];
      }
      row.push(sum);
    }
    result.push(row);
  }
  return result;
}

/**
 * Transpose a matrix: swap rows and columns.
 */
function transpose(m: number[][]): number[][] {
  const rows = m.length;
  const cols = m[0].length;
  const result: number[][] = [];
  for (let j = 0; j < cols; j++) {
    const row: number[] = [];
    for (let i = 0; i < rows; i++) {
      row.push(m[i][j]);
    }
    result.push(row);
  }
  return result;
}

/**
 * Compute the inverse of an NxN matrix using Gauss-Jordan elimination.
 * Returns null if the matrix is singular (determinant ≈ 0).
 */
function matInverse(m: number[][]): number[][] | null {
  const n = m.length;
  if (n === 0 || m[0].length !== n) return null; // must be square

  // Build augmented matrix [m | I]
  const aug: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [...m[i]];
    for (let j = 0; j < n; j++) {
      row.push(i === j ? 1 : 0);
    }
    aug.push(row);
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }

    if (maxVal < 1e-12) return null; // singular

    // Swap rows
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    // Scale pivot row
    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivot;
    }

    // Eliminate column in all other rows
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Extract the right half (the inverse)
  const inv: number[][] = [];
  for (let i = 0; i < n; i++) {
    inv.push(aug[i].slice(n));
  }
  return inv;
}

/**
 * Format a 2D numeric matrix as LaTeX using pmatrix environment.
 */
function matrixToLatex(m: number[][]): string {
  const rows = m.map((row) => row.map(formatNum).join(" & "));
  return `\\begin{pmatrix}${rows.join(" \\\\ ")}\\end{pmatrix}`;
}

/**
 * Format a 2D numeric matrix as plain text.
 */
function matrixToText(m: number[][]): string {
  const rows = m.map((row) => `[${row.map(formatNum).join(", ")}]`);
  return `[${rows.join(", ")}]`;
}

/**
 * Format a number for display: use integers when possible, otherwise fixed decimals.
 */
function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  // Round to 10 decimal places to avoid floating-point noise
  const rounded = parseFloat(n.toFixed(10));
  if (Number.isInteger(rounded)) return rounded.toString();
  return rounded.toString();
}

// ── Raw-LaTeX Linear Algebra Pre-Processing ──────────────────────

/**
 * Extract a numeric matrix directly from a LaTeX pmatrix/bmatrix/vmatrix string.
 *
 * CortexJS correctly parses \begin{pmatrix}…\end{pmatrix} when given it
 * as a standalone expression, so we strip the surrounding operation keyword,
 * re-parse just the matrix block, and then call extractMatrix() on the result.
 *
 * Returns a 2D number array or null if the string doesn't contain a parseable
 * matrix environment.
 */
function extractMatrixFromLatex(matrixLatex: string): number[][] | null {
  try {
    const expr = parseLatex(matrixLatex.trim());
    return extractMatrix(expr.json);
  } catch {
    return null;
  }
}

/**
 * Intercept linear algebra operations that CortexJS cannot parse correctly
 * due to missing command definitions (e.g. \det in v0.24).
 *
 * Currently handles:
 *   \det\begin{pmatrix}…\end{pmatrix}  →  determinant computation
 *
 * Must be called with the STRIPPED (no $ delimiters) LaTeX string BEFORE
 * passing the expression to tryLinearAlgebra().
 *
 * Returns a Result<EvalResult> if it handled the expression, or null if the
 * expression is not a recognised raw-LaTeX linear algebra operation.
 */
function tryLinearAlgebraFromLatex(
  rawLatex: string,
  diagnostics: Diagnostic[],
): Result<EvalResult> | null {
  // Strip outer $ or $$ delimiters (same as parser.ts stripDelimiters)
  let latex = rawLatex.trim();
  if (latex.startsWith("$$") && latex.endsWith("$$")) latex = latex.slice(2, -2).trim();
  else if (latex.startsWith("$") && latex.endsWith("$")) latex = latex.slice(1, -1).trim();
  else if (latex.startsWith("\\[") && latex.endsWith("\\]")) latex = latex.slice(2, -2).trim();
  else if (latex.startsWith("\\(") && latex.endsWith("\\)")) latex = latex.slice(2, -2).trim();

  // ── \det\begin{...} ────────────────────────────────────────────────
  // Match: \det followed by optional whitespace and a matrix environment.
  // Supported environments: pmatrix, bmatrix, vmatrix, Bmatrix, Vmatrix, matrix
  const detMatch = latex.match(
    /^\\det\s*(\\.+)$/s,
  );
  if (detMatch) {
    const matLatex = detMatch[1].trim();
    // Verify it's actually a matrix environment
    if (/^\\begin\{[pPbBvV]?matrix\}/.test(matLatex)) {
      const mat = extractMatrixFromLatex(matLatex);
      if (mat) {
        if (mat.length !== mat[0].length) {
          return err("Determinant requires a square matrix", diagnostics);
        }
        const det = determinant(mat);
        diagnostics.push({
          level: "info",
          message: `Computed determinant of ${mat.length}×${mat.length} matrix (raw-LaTeX path)`,
        });
        const s = formatNum(det);
        return ok({ latex: s, text: s }, diagnostics);
      }
    }
  }

  return null;
}

// ── Linear Algebra Detection ──────────────────────────────────────

/**
 * Detect and compute linear algebra operations:
 * - Determinant: ["Determinant", matrix]
 *   NOTE: CortexJS 0.24 does NOT recognise \det as a built-in command.
 *   \det\begin{pmatrix}…\end{pmatrix} parses to:
 *     ["Error", ["ErrorCode", "'unexpected-command'", "'\\det'"], ["LatexString", "'\\det'"]]
 *   The matrix is NOT inside that error node; it is absent from the JSON.
 *   We must pre-process the raw LaTeX string and extract the matrix manually.
 *   See tryLinearAlgebraFromLatex() which is called BEFORE this function.
 *
 * - Transpose: ["Transpose", matrix]   ← CortexJS does emit this for ^T
 * - Inverse: ["Inverse", matrix] or ["Power", matrix, -1]
 *   NOTE: CortexJS wraps the matrix in an Error for ^{-1}:
 *     ["Power", ["Error", ["ErrorCode", "'incompatible-domain'", …], matrix], -1]
 *   extractMatrix() unwraps Error nodes, so this still works.
 *
 * - Dot product: ["Dot", vec1, vec2]
 * - Matrix multiplication: CortexJS parses two adjacent matrices as
 *   ["Pair", matrix1, matrix2] (NOT ["Multiply", …]).
 *   We handle "Pair" here.
 *
 * Returns null if the expression is not a recognized linear algebra operation.
 */
function tryLinearAlgebra(
  expr: BoxedExpression,
  diagnostics: Diagnostic[],
): Result<EvalResult> | null {
  const json = expr.json;
  if (!Array.isArray(json)) return null;

  const head = json[0] as string;
  const args = json.slice(1) as unknown[];

  // ── Determinant ────────────────────────────────────────────────────
  // CortexJS emits ["Determinant", matrix] if the symbol is defined;
  // in practice (v0.24) \det is an unexpected-command — handled by
  // tryLinearAlgebraFromLatex() via raw-LaTeX pre-processing instead.
  if (head === "Determinant" && args.length === 1) {
    const mat = extractMatrix(args[0]);
    if (!mat) return null;
    if (mat.length !== mat[0].length) {
      return err("Determinant requires a square matrix", diagnostics);
    }
    const det = determinant(mat);
    diagnostics.push({ level: "info", message: `Computed determinant of ${mat.length}×${mat.length} matrix` });
    const s = formatNum(det);
    return ok({ latex: s, text: s }, diagnostics);
  }

  // ── Transpose ──────────────────────────────────────────────────────
  // CortexJS correctly emits ["Transpose", matrix] for M^T.
  if (head === "Transpose" && args.length === 1) {
    const mat = extractMatrix(args[0]);
    if (!mat) return null;
    const t = transpose(mat);
    diagnostics.push({ level: "info", message: `Transposed ${mat.length}×${mat[0].length} matrix` });
    return ok({ latex: matrixToLatex(t), text: matrixToText(t) }, diagnostics);
  }

  // ── Inverse: ["Inverse", matrix] ───────────────────────────────────
  if (head === "Inverse" && args.length === 1) {
    const mat = extractMatrix(args[0]);
    if (!mat) return null;
    if (mat.length !== mat[0].length) {
      return err("Inverse requires a square matrix", diagnostics);
    }
    const inv = matInverse(mat);
    if (!inv) {
      return err("Matrix is singular (determinant ≈ 0), no inverse exists", diagnostics);
    }
    diagnostics.push({ level: "info", message: `Computed inverse of ${mat.length}×${mat.length} matrix` });
    return ok({ latex: matrixToLatex(inv), text: matrixToText(inv) }, diagnostics);
  }

  // ── Inverse: ["Power", matrix_or_Error(matrix), -1] ───────────────
  // CortexJS v0.24 wraps the matrix in an incompatible-domain Error:
  //   ["Power", ["Error", ["ErrorCode","'incompatible-domain'","Numbers","Lists"], matrix], -1]
  // extractMatrix() already unwraps Error nodes, so no special casing needed.
  if (head === "Power" && args.length === 2 && args[1] === -1) {
    const mat = extractMatrix(args[0]);
    if (!mat) return null;
    if (mat.length !== mat[0].length) {
      return err("Inverse requires a square matrix", diagnostics);
    }
    const inv = matInverse(mat);
    if (!inv) {
      return err("Matrix is singular (determinant ≈ 0), no inverse exists", diagnostics);
    }
    diagnostics.push({ level: "info", message: `Computed inverse of ${mat.length}×${mat.length} matrix` });
    return ok({ latex: matrixToLatex(inv), text: matrixToText(inv) }, diagnostics);
  }

  // ── Dot product: ["Dot", vec1, vec2] ───────────────────────────────
  if (head === "Dot" && args.length === 2) {
    const vecA = extractVector(args[0]);
    const vecB = extractVector(args[1]);
    if (!vecA || !vecB) return null;
    if (vecA.length !== vecB.length) {
      return err(
        `Dot product requires vectors of equal length (got ${vecA.length} and ${vecB.length})`,
        diagnostics,
      );
    }
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    diagnostics.push({ level: "info", message: `Computed dot product of two ${vecA.length}D vectors` });
    const s = formatNum(dot);
    return ok({ latex: s, text: s }, diagnostics);
  }

  // ── Matrix multiplication ──────────────────────────────────────────
  // CortexJS v0.24 parses two adjacent matrices (AB written in LaTeX as
  // \begin{pmatrix}…\end{pmatrix}\begin{pmatrix}…\end{pmatrix}) as:
  //   ["Pair", matrix1, matrix2]
  // NOT as ["Multiply", …]. Handle "Pair" in addition to "Multiply".
  //
  // Also handle Error-wrapped Multiply for edge cases where CortexJS
  // does produce Multiply but wraps one or both args in an Error node.
  if ((head === "Pair" || head === "Multiply" || head === "Error") && args.length >= 2) {
    let mulArgs: unknown[] | null = null;

    if (head === "Pair" || head === "Multiply") {
      // Pair and Multiply both carry the two matrix operands as direct args
      mulArgs = args.length === 2 ? args : null;
    } else if (head === "Error") {
      // ["Error", ["Multiply", m1, m2], ...] or ["Error", errCode, ["Multiply", m1, m2]]
      for (const arg of args) {
        if (Array.isArray(arg) && (arg as unknown[])[0] === "Multiply") {
          mulArgs = (arg as unknown[]).slice(1);
          break;
        }
      }
    }

    if (mulArgs && mulArgs.length === 2) {
      const matA = extractMatrix(mulArgs[0]);
      const matB = extractMatrix(mulArgs[1]);

      // Only proceed if both are genuine 2D matrices (at least one of rows or
      // cols > 1 for each operand). Pure 1×1 scalars fall through to normal eval.
      if (matA && matB && (matA[0].length > 1 || matA.length > 1) && (matB[0].length > 1 || matB.length > 1)) {
        // Require at least one true NxM (N>1 AND M>1) matrix — reject Nx1 ⊗ Nx1
        const aIsMatrix = matA.length > 1 && matA[0].length > 1;
        const bIsMatrix = matB.length > 1 && matB[0].length > 1;

        if (aIsMatrix || bIsMatrix) {
          const product = matMul(matA, matB);
          if (!product) {
            return err(
              `Matrix dimensions incompatible for multiplication: ${matA.length}×${matA[0].length} * ${matB.length}×${matB[0].length}`,
              diagnostics,
            );
          }
          diagnostics.push({
            level: "info",
            message: `Computed ${matA.length}×${matA[0].length} * ${matB.length}×${matB[0].length} matrix multiplication`,
          });
          return ok({ latex: matrixToLatex(product), text: matrixToText(product) }, diagnostics);
        }
      }
    }
  }

  return null;
}

/** Exact symbolic evaluation. */
function evaluateExact(
  expr: BoxedExpression,
  diagnostics: Diagnostic[],
): Result<EvalResult> {
  try {
    // Try .evaluate() first (symbolic simplification)
    const result = expr.evaluate();
    const evalResult = toEvalResult(result);

    // If the result is purely numeric (no free variables), ensure it's simplified.
    // CortexJS sometimes leaves arithmetic unsimplified (e.g. -8/(1+576) stays as-is).
    // Force a numeric check and present the simplified fraction or integer.
    const jsNum = forceNumber(result);
    if (jsNum !== null && Number.isFinite(jsNum)) {
      // Check if it's an integer
      if (Number.isInteger(jsNum)) {
        const s = jsNum.toString();
        return ok({ latex: s, text: s }, diagnostics);
      }
      // Check if it's a clean fraction — keep the CortexJS symbolic form
      // (it may show \frac{-8}{577} which is correct for exact mode)
      // Only override if CortexJS result looks unsimplified
      const resultText = evalResult.text;
      if (resultText.includes("+") || resultText.includes("(1+") || resultText.includes("(1 +")) {
        // Denominator wasn't simplified — force simplification
        // Try to express as a/b with simplified terms
        const simplified = expr.simplify();
        const simpResult = toEvalResult(simplified);
        if (simpResult.text !== evalResult.text) {
          return ok(simpResult, diagnostics);
        }
      }
    }

    return ok(evalResult, diagnostics);
  } catch (e) {
    return err(
      `Exact evaluation failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}

/**
 * Extract a JS number from a CortexJS BoxedExpression using every available
 * strategy. CortexJS may return JS numbers, Decimal objects, Rationals, or
 * symbolic expressions — we try them all before giving up.
 */
function forceNumber(expr: BoxedExpression): number | null {
  // Strategy 1: direct numericValue
  try {
    const nv = expr.numericValue;
    // Plain JS number
    if (typeof nv === "number" && Number.isFinite(nv)) return nv;
    // CortexJS rational pair: [numerator, denominator]
    if (Array.isArray(nv) && nv.length === 2 &&
        typeof nv[0] === "number" && typeof nv[1] === "number" && nv[1] !== 0) {
      const val = nv[0] / nv[1];
      if (Number.isFinite(val)) return val;
    }
    // Decimal / BigNumber objects with .toNumber()
    if (nv != null && typeof nv === "object" && !Array.isArray(nv) && "toNumber" in nv) {
      const n = (nv as { toNumber(): number }).toNumber();
      if (Number.isFinite(n)) return n;
    }
    // Decimal / BigNumber — try toString() then parseFloat
    if (nv != null && typeof nv === "object" && !Array.isArray(nv)) {
      const s = String(nv);
      const parsed = parseFloat(s);
      if (Number.isFinite(parsed)) return parsed;
    }
  } catch { /* continue */ }

  // Strategy 2: CortexJS .value property (some versions)
  try {
    const v = (expr as any).value;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  } catch { /* continue */ }

  // Strategy 3: parse String(expr) — handles "a/b", "-a/b", "(-a/b)", etc.
  try {
    const s = String(expr).replace(/\s/g, "");
    // Strip outer parens: "(-8/577)" → "-8/577"
    const stripped = s.replace(/^\((.+)\)$/, "$1");

    // Handle fraction notation: "a/b" or "-a/b"
    const fracMatch = stripped.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\/(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/);
    if (fracMatch) {
      const num = parseFloat(fracMatch[1]);
      const den = parseFloat(fracMatch[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
        return num / den;
      }
    }

    // Plain number
    const parsed = parseFloat(stripped);
    if (Number.isFinite(parsed)) return parsed;
  } catch { /* continue */ }

  // Strategy 4: compile to zero-arg JS function and evaluate
  try {
    const fn = compileToFunction(expr, []);
    const val = fn();
    if (Number.isFinite(val)) return val;
  } catch { /* continue */ }

  return null;
}

/** Numeric (floating-point) evaluation — Casio-style: always returns a decimal. */
function evaluateApproximate(
  expr: BoxedExpression,
  diagnostics: Diagnostic[],
  precision?: number,
): Result<EvalResult> {
  const p = (precision !== undefined && precision > 0) ? precision : 12;

  try {
    // Try CortexJS .N() first, then .evaluate(), then raw expr
    let jsNum: number | null = null;

    try {
      const nResult = expr.N();
      jsNum = forceNumber(nResult);
    } catch { /* continue */ }

    if (jsNum === null) {
      try {
        const evResult = expr.evaluate();
        jsNum = forceNumber(evResult);
      } catch { /* continue */ }
    }

    if (jsNum === null) {
      jsNum = forceNumber(expr);
    }

    if (jsNum !== null && Number.isFinite(jsNum)) {
      // Format to requested precision, strip trailing zeros
      const rounded = parseFloat(jsNum.toFixed(p));
      const str = rounded.toString();
      return ok({ latex: str, text: str }, diagnostics);
    }

    // Fallback: return symbolic form with a warning
    const result = expr.N();
    diagnostics.push({
      level: "warning",
      message: "Could not reduce to a decimal number — showing symbolic form",
    });
    return ok(toEvalResult(result), diagnostics);
  } catch (e) {
    return err(
      `Numeric evaluation failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}

/** Algebraic simplification. */
function evaluateSimplify(
  expr: BoxedExpression,
  diagnostics: Diagnostic[],
): Result<EvalResult> {
  try {
    let result = expr.simplify();
    // Post-process: apply common trig identities that CortexJS 0.24 misses
    result = applyTrigIdentities(result);
    return ok(toEvalResult(result), diagnostics);
  } catch (e) {
    return err(
      `Simplification failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}

/**
 * Apply common trig identities that CortexJS 0.24 does not handle.
 * Checks the MathJSON structure for patterns like sin²(a)+cos²(a) → 1.
 */
function applyTrigIdentities(expr: BoxedExpression): BoxedExpression {
  const json = expr.json;
  if (!Array.isArray(json)) return expr;
  const [head, ...args] = json as [string, ...unknown[]];
  const ce = getCE();

  if (head === "Add" && args.length === 2) {
    const pair = identifyPythagoreanPair(args[0], args[1]);
    if (pair) return ce.box(1);
  }

  // cos²(a) - sin²(a) → cos(2a)
  if (head === "Subtract" && args.length === 2) {
    const cosArg = extractSquaredTrig(args[0], "Cos");
    const sinArg = extractSquaredTrig(args[1], "Sin");
    if (cosArg !== null && sinArg !== null && jsonEqual(cosArg, sinArg)) {
      return ce.box(["Cos", ["Multiply", 2, cosArg]]);
    }
  }

  // 2·sin(a)·cos(a) → sin(2a)
  if (head === "Multiply") {
    const sinCosArg = extractDoubleAngleSine(args);
    if (sinCosArg !== null) {
      return ce.box(["Sin", ["Multiply", 2, sinCosArg]]);
    }
  }

  return expr;
}

function extractDoubleAngleSine(factors: unknown[]): unknown | null {
  let hasCoeff2 = false;
  let sinArg: unknown | null = null;
  let cosArg: unknown | null = null;

  for (const f of factors) {
    if (f === 2) {
      hasCoeff2 = true;
      continue;
    }
    if (Array.isArray(f)) {
      const [h, ...a] = f as [string, ...unknown[]];
      if (h === "Sin" && a.length === 1 && sinArg === null) {
        sinArg = a[0];
        continue;
      }
      if (h === "Cos" && a.length === 1 && cosArg === null) {
        cosArg = a[0];
        continue;
      }
    }
    return null;
  }

  if (hasCoeff2 && sinArg !== null && cosArg !== null && jsonEqual(sinArg, cosArg)) {
    return sinArg;
  }
  return null;
}

/**
 * Check if two MathJSON nodes form a sin²(a)+cos²(a) pair (in either order).
 * Returns the argument `a` if matched, null otherwise.
 */
function identifyPythagoreanPair(a: unknown, b: unknown): unknown | null {
  const sinArg = extractSquaredTrig(a, "Sin");
  const cosArg = extractSquaredTrig(b, "Cos");
  if (sinArg !== null && cosArg !== null && jsonEqual(sinArg, cosArg)) return sinArg;

  const sinArg2 = extractSquaredTrig(b, "Sin");
  const cosArg2 = extractSquaredTrig(a, "Cos");
  if (sinArg2 !== null && cosArg2 !== null && jsonEqual(sinArg2, cosArg2)) return sinArg2;

  return null;
}

/**
 * If `node` is ["Square", ["Sin", arg]] or ["Power", ["Sin", arg], 2],
 * return `arg`. Otherwise null.
 */
function extractSquaredTrig(node: unknown, fnName: string): unknown | null {
  if (!Array.isArray(node)) return null;
  const [h, ...a] = node as [string, ...unknown[]];

  // ["Square", ["Sin", arg]]
  if (h === "Square" && a.length === 1 && Array.isArray(a[0])) {
    const inner = a[0] as [string, ...unknown[]];
    if (inner[0] === fnName && inner.length === 2) return inner[1];
  }

  // ["Power", ["Sin", arg], 2]
  if (h === "Power" && a.length === 2 && a[1] === 2 && Array.isArray(a[0])) {
    const inner = a[0] as [string, ...unknown[]];
    if (inner[0] === fnName && inner.length === 2) return inner[1];
  }

  return null;
}

/** Deep-equal check for MathJSON nodes. */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => jsonEqual(v, b[i]));
  }
  return false;
}

/**
 * Solve an equation for a variable.
 *
 * Attempts to detect the solve target variable automatically. If the
 * expression contains `=`, treats it as an equation. Otherwise wraps
 * the expression as `expr = 0`.
 */
function evaluateSolve(
  expr: BoxedExpression,
  latex: string,
  diagnostics: Diagnostic[],
): Result<EvalResult> {
  const ce = getCE();

  try {
    // Detect the variable to solve for
    const json = expr.json;
    let solveExpr: BoxedExpression = expr;
    let variable = "x"; // default

    // If the expression is an equation (Equal), extract it
    if (Array.isArray(json) && json[0] === "Equal" && json.length === 3) {
      // Build: LHS - RHS = 0, then solve
      const lhs = ce.box(json[1]);
      const rhs = ce.box(json[2]);
      solveExpr = ce.box(["Subtract", lhs.json, rhs.json]);
    }

    // Try to find the primary variable
    const symbols = solveExpr.freeVariables;
    if (symbols && symbols.length > 0) {
      // Prefer x, then y, then first available
      if (symbols.includes("x")) variable = "x";
      else if (symbols.includes("y")) variable = "y";
      else variable = symbols[0];
    }

    // Attempt CortexJS solve
    const solutions = ce.box(["Solve", solveExpr.json, variable]);
    const result = solutions.evaluate();

    // Check if we got a meaningful result
    const resultStr = String(result);
    if (
      resultStr === "Solve" ||
      resultStr.includes("Solve") ||
      resultStr === "Nothing"
    ) {
      diagnostics.push({
        level: "info",
        message:
          "CortexJS could not solve this equation. Future versions will use Giac WASM for advanced solving.",
      });
      return err(
        "Equation solving not supported for this expression type yet",
        diagnostics,
      );
    }

    return ok(toEvalResult(result), diagnostics);
  } catch (e) {
    diagnostics.push({
      level: "info",
      message:
        "Solve operation failed. This may require Giac WASM (planned for future release).",
    });
    return err(
      `Solve failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}

// evaluateFactor removed — factoring now handled entirely by cas.ts (casFactor)
