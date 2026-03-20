/**
 * King's CalcLatex v2 — Higher-Level CAS Operations
 *
 * Provides symbolic differentiation, integration, equation solving, and
 * factoring. Uses CortexJS Compute Engine as primary engine with manual
 * rule-based fallbacks for operations CortexJS 0.24 can't handle
 * (integration, solving, factoring).
 */

import { parseLatex, getCE, detectFreeVars, toFnString, jsonToLatex } from "./parser";
import {
  giacDifferentiate,
  giacIntegrate,
  giacSolve,
  giacFactor,
  giacSimplify,
  giacPartialDerivative,
  giacGradient,
} from "./giac";
import type { EvalResult, Result, Diagnostic } from "../types";
import { ok, err } from "../types";

// ══════════════════════════════════════════════════════════════
//  DISPLAY HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Extract a standard LaTeX string from a BoxedExpression.
 * Uses custom jsonToLatex() to avoid CortexJS non-standard output
 * like \mathrm{Cube}(x), \exponentialE, \exp(3t).
 */
function exprToLatex(expr: { json?: unknown; latex?: string }): string {
  try {
    if (expr.json !== undefined) return jsonToLatex(expr.json);
  } catch { /* fall through */ }
  try {
    if (typeof expr.latex === "string" && expr.latex.length > 0) return expr.latex;
  } catch { /* fall through */ }
  return String(expr);
}

/**
 * Convert LaTeX to human-readable plain text.
 * Used for the `text` field displayed in result widgets.
 */
export function latexToReadable(latex: string): string {
  return latex
    // Fractions: \frac{a}{b} → (a)/(b)
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    // Trig / math function commands
    .replace(/\\operatorname\{([^{}]+)\}/g, "$1")
    .replace(/\\sin/g, "sin").replace(/\\cos/g, "cos").replace(/\\tan/g, "tan")
    .replace(/\\sec/g, "sec").replace(/\\csc/g, "csc").replace(/\\cot/g, "cot")
    .replace(/\\arcsin/g, "arcsin").replace(/\\arccos/g, "arccos").replace(/\\arctan/g, "arctan")
    .replace(/\\sinh/g, "sinh").replace(/\\cosh/g, "cosh").replace(/\\tanh/g, "tanh")
    .replace(/\\ln/g, "ln").replace(/\\log/g, "log").replace(/\\exp/g, "exp")
    .replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, "($2)^(1/$1)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    // Greek letters
    .replace(/\\pi/g, "π").replace(/\\theta/g, "θ").replace(/\\phi/g, "φ")
    .replace(/\\alpha/g, "α").replace(/\\beta/g, "β").replace(/\\gamma/g, "γ")
    .replace(/\\delta/g, "δ").replace(/\\epsilon/g, "ε").replace(/\\lambda/g, "λ")
    .replace(/\\mu/g, "μ").replace(/\\sigma/g, "σ").replace(/\\omega/g, "ω")
    // Symbols
    .replace(/\\nabla/g, "∇").replace(/\\partial/g, "∂")
    .replace(/\\vec\{([^{}]+)\}/g, "$1")
    .replace(/\\cdot/g, "·").replace(/\\times/g, "×")
    .replace(/\\pm/g, "±").replace(/\\mp/g, "∓").replace(/\\infty/g, "∞")
    // Superscripts (common Unicode)
    .replace(/\^{2}/g, "²").replace(/\^{3}/g, "³")
    .replace(/\^{4}/g, "⁴").replace(/\^{5}/g, "⁵")
    .replace(/\^{n}/g, "ⁿ")
    // Text commands
    .replace(/\\text\{([^{}]+)\}/g, "$1")
    // Clean up LaTeX braces and spacing
    .replace(/\\left\s*/g, "").replace(/\\right\s*/g, "")
    .replace(/\{/g, "").replace(/\}/g, "")
    .replace(/\\\\/g, "").replace(/\\,/g, " ").replace(/\\ /g, " ")
    .replace(/\s+/g, " ").trim();
}

/**
 * Build an EvalResult from a BoxedExpression-like object.
 * Uses LaTeX→readable conversion instead of String(expr) which gives MathJSON format.
 */
function toEvalResult(expr: { latex?: string }): EvalResult {
  const latex = exprToLatex(expr);
  return { latex, text: latexToReadable(latex) };
}

// ══════════════════════════════════════════════════════════════
//  VARIABLE DETECTION
// ══════════════════════════════════════════════════════════════

function resolveVariable(latex: string, variable?: string): string {
  if (variable) return variable;
  try {
    const expr = parseLatex(latex);
    const freeVars = expr.freeVariables;
    if (freeVars && freeVars.length > 0) {
      if (freeVars.includes("x")) return "x";
      if (freeVars.includes("t")) return "t";
      if (freeVars.includes("y")) return "y";
      return freeVars[0];
    }
  } catch { /* fall through */ }
  return "x";
}

// ══════════════════════════════════════════════════════════════
//  MANUAL INTEGRATION (MathJSON tree rules)
// ══════════════════════════════════════════════════════════════

/** Check if a MathJSON node is constant (does not contain the variable). */
function isConst(json: unknown, v: string): boolean {
  if (typeof json === "number") return true;
  if (typeof json === "string") return json !== v;
  if (json != null && typeof json === "object" && !Array.isArray(json)) return true;
  if (!Array.isArray(json)) return true;
  return (json as unknown[]).slice(1).every(a => isConst(a, v));
}

/**
 * Rule-based symbolic integration on CortexJS MathJSON AST.
 * Returns the integral as MathJSON, or null if the expression can't be handled.
 *
 * Covers: power rule, trig, exp, ln, sqrt, constant multiples, sums.
 */
function manualIntegrate(json: unknown, v: string): unknown | null {
  // Constant → k * variable
  if (isConst(json, v)) {
    if (json === 0) return 0;
    if (json === 1) return v;
    return ["Multiply", json, v];
  }
  // Just the variable → x²/2
  if (json === v) return ["Divide", ["Square", v], 2];

  if (!Array.isArray(json)) return null;
  const [head, ...args] = json as [string, ...unknown[]];

  switch (head) {
    case "Negate": {
      const r = manualIntegrate(args[0], v);
      return r ? ["Negate", r] : null;
    }

    case "Add": {
      const results = args.map(a => manualIntegrate(a, v));
      if (results.some(r => r === null)) return null;
      return ["Add", ...results];
    }

    case "Subtract": {
      if (args.length !== 2) return null;
      const r0 = manualIntegrate(args[0], v);
      const r1 = manualIntegrate(args[1], v);
      if (!r0 || !r1) return null;
      return ["Subtract", r0, r1];
    }

    case "Multiply": {
      const consts: unknown[] = [];
      const varTerms: unknown[] = [];
      for (const a of args) {
        if (isConst(a, v)) consts.push(a);
        else varTerms.push(a);
      }
      if (varTerms.length === 0) {
        return ["Multiply", ...args, v];
      }
      if (varTerms.length === 1) {
        const integral = manualIntegrate(varTerms[0], v);
        if (!integral) return null;
        return consts.length > 0 ? ["Multiply", ...consts, integral] : integral;
      }
      // x * x = x²
      if (varTerms.length === 2 && varTerms[0] === v && varTerms[1] === v) {
        const integral = manualIntegrate(["Square", v], v);
        return integral && consts.length > 0 ? ["Multiply", ...consts, integral] : integral;
      }
      return null;
    }

    case "Divide": {
      if (args.length !== 2) return null;
      const [num, den] = args;
      // f(x)/k → (1/k)∫f
      if (isConst(den, v)) {
        const r = manualIntegrate(num, v);
        return r ? ["Divide", r, den] : null;
      }
      // k/x → k·ln|x|
      if (isConst(num, v) && den === v) {
        return num === 1
          ? ["Ln", ["Abs", v]]
          : ["Multiply", num, ["Ln", ["Abs", v]]];
      }
      // 1/x² → x^(-2) → -1/x
      if (isConst(num, v)) {
        if (Array.isArray(den) && den[0] === "Square" && den[1] === v) {
          const r = manualIntegrate(["Power", v, -2], v);
          return r && num !== 1 ? ["Multiply", num, r] : r;
        }
        if (Array.isArray(den) && den[0] === "Power" && den[1] === v && isConst(den[2], v)) {
          const r = manualIntegrate(["Power", v, ["Negate", den[2]]], v);
          return r && num !== 1 ? ["Multiply", num, r] : r;
        }
      }
      return null;
    }

    case "Power": {
      if (args.length !== 2) return null;
      const [base, exp] = args;
      // x^n → x^(n+1)/(n+1) for constant n ≠ -1
      if (base === v && isConst(exp, v)) {
        if (exp === -1 || (typeof exp === "number" && exp === -1))
          return ["Ln", ["Abs", v]];
        const n1 = typeof exp === "number" ? exp + 1 : ["Add", exp, 1];
        return ["Divide", ["Power", v, n1], n1];
      }
      // e^x → e^x
      if ((base === "ExponentialE" || base === "e") && exp === v) return json;
      // a^x → a^x / ln(a)
      if (isConst(base, v) && exp === v) return ["Divide", json, ["Ln", base]];
      // e^(kx) → e^(kx)/k
      if ((base === "ExponentialE" || base === "e") && Array.isArray(exp)) {
        const lin = extractLinear(exp as unknown[], v);
        if (lin) return ["Divide", json, lin.a];
      }
      return null;
    }

    case "Square":
      if (args[0] === v) return ["Divide", ["Cube", v], 3];
      return null;

    case "Cube":
      if (args[0] === v) return ["Divide", ["Power", v, 4], 4];
      return null;

    case "Sqrt":
      if (args[0] === v) return ["Multiply", ["Rational", 2, 3], ["Power", v, ["Rational", 3, 2]]];
      return null;

    case "Sin": {
      if (args[0] === v) return ["Negate", ["Cos", v]];
      // sin(kx) → -cos(kx)/k
      if (Array.isArray(args[0])) {
        const lin = extractLinear(args[0] as unknown[], v);
        if (lin) return ["Divide", ["Negate", ["Cos", args[0]]], lin.a];
      }
      return null;
    }

    case "Cos": {
      if (args[0] === v) return ["Sin", v];
      if (Array.isArray(args[0])) {
        const lin = extractLinear(args[0] as unknown[], v);
        if (lin) return ["Divide", ["Sin", args[0]], lin.a];
      }
      return null;
    }

    case "Tan":
      if (args[0] === v) return ["Negate", ["Ln", ["Abs", ["Cos", v]]]];
      return null;

    case "Exp": {
      if (args[0] === v) return ["Exp", v];
      if (Array.isArray(args[0])) {
        const lin = extractLinear(args[0] as unknown[], v);
        if (lin) return ["Divide", ["Exp", args[0]], lin.a];
      }
      return null;
    }

    case "Ln":
      if (args[0] === v) return ["Subtract", ["Multiply", v, ["Ln", v]], v];
      return null;

    case "Rational":
      if (isConst(json, v)) return ["Multiply", json, v];
      return null;

    default:
      return null;
  }
}

/** Extract linear coefficient from kx or k*x form. Returns {a: k} or null. */
function extractLinear(json: unknown[], v: string): { a: unknown } | null {
  if (!Array.isArray(json)) return null;
  const [head, ...args] = json as [string, ...unknown[]];
  if (head === "Multiply" && args.length === 2) {
    if (isConst(args[0], v) && args[1] === v) return { a: args[0] };
    if (args[0] === v && isConst(args[1], v)) return { a: args[1] };
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
//  MANUAL POLYNOMIAL SOLVER
// ══════════════════════════════════════════════════════════════

/**
 * Extract polynomial coefficients from a MathJSON expression.
 * Returns Map<power, coefficient> or null if expression isn't polynomial.
 */
function extractPolyCoeffs(json: unknown, v: string): Map<number, number> | null {
  const coeffs = new Map<number, number>();

  function add(power: number, coeff: number): void {
    coeffs.set(power, (coeffs.get(power) || 0) + coeff);
  }

  function walk(j: unknown, sign: number): boolean {
    if (typeof j === "number") { add(0, j * sign); return true; }
    if (j === v) { add(1, sign); return true; }
    if (typeof j === "string" && j !== v) return false;
    if (!Array.isArray(j)) return false;

    const [head, ...args] = j as [string, ...unknown[]];
    switch (head) {
      case "Square":
        if (args[0] === v) { add(2, sign); return true; }
        return false;
      case "Cube":
        if (args[0] === v) { add(3, sign); return true; }
        return false;
      case "Power":
        if (args[0] === v && typeof args[1] === "number" && Number.isInteger(args[1])) {
          add(args[1] as number, sign); return true;
        }
        return false;
      case "Negate":
        return walk(args[0], -sign);
      case "Add":
        return args.every(a => walk(a, sign));
      case "Subtract":
        return args.length === 2 && walk(args[0], sign) && walk(args[1], -sign);
      case "Multiply": {
        let num = 1;
        let varPow: number | null = null;
        for (const a of args) {
          if (typeof a === "number") { num *= a; continue; }
          if (a === v) { varPow = (varPow ?? 0) + 1; continue; }
          if (Array.isArray(a)) {
            const [h, ...aa] = a as [string, ...unknown[]];
            if (h === "Square" && aa[0] === v) { varPow = (varPow ?? 0) + 2; continue; }
            if (h === "Cube" && aa[0] === v) { varPow = (varPow ?? 0) + 3; continue; }
            if (h === "Power" && aa[0] === v && typeof aa[1] === "number") {
              varPow = (varPow ?? 0) + (aa[1] as number); continue;
            }
            if (h === "Negate" && typeof aa[0] === "number") { num *= -(aa[0] as number); continue; }
            if (h === "Rational" && typeof aa[0] === "number" && typeof aa[1] === "number") {
              num *= (aa[0] as number) / (aa[1] as number); continue;
            }
          }
          return false;
        }
        add(varPow ?? 0, num * sign);
        return true;
      }
      case "Rational":
        if (typeof args[0] === "number" && typeof args[1] === "number") {
          add(0, ((args[0] as number) / (args[1] as number)) * sign);
          return true;
        }
        return false;
      case "Divide":
        if (args.length === 2 && typeof args[0] === "number" && typeof args[1] === "number") {
          add(0, ((args[0] as number) / (args[1] as number)) * sign);
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  if (walk(json, 1)) return coeffs;
  return null;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b > 0) { [a, b] = [b, a % b]; }
  return a;
}

/** Format a number as a clean string (integer or simple fraction notation). */
function fmtNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  for (let d = 2; d <= 100; d++) {
    const num = abs * d;
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      const sn = sign * Math.round(num);
      const g = gcd(Math.abs(sn), d);
      return `${sn / g}/${d / g}`;
    }
  }
  return parseFloat(n.toPrecision(6)).toString();
}

/** Format a number as LaTeX (integer or \frac). */
function fmtNumLatex(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  for (let d = 2; d <= 100; d++) {
    const num = abs * d;
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      const sn = sign * Math.round(num);
      const g = gcd(Math.abs(sn), d);
      const fn = sn / g;
      const fd = d / g;
      if (fn < 0) return `-\\frac{${-fn}}{${fd}}`;
      return `\\frac{${fn}}{${fd}}`;
    }
  }
  return parseFloat(n.toPrecision(6)).toString();
}

function manualSolve(
  json: unknown,
  v: string,
): { latex: string; text: string } | null {
  const coeffs = extractPolyCoeffs(json, v);
  if (!coeffs) return null;

  // Remove near-zero coefficients
  for (const [k, val] of coeffs) {
    if (Math.abs(val) < 1e-12) coeffs.delete(k);
  }
  if (coeffs.size === 0) return null;

  const degree = Math.max(...coeffs.keys());

  if (degree === 1) {
    const a = coeffs.get(1) || 0;
    const b = coeffs.get(0) || 0;
    if (Math.abs(a) < 1e-12) return null;
    const x = -b / a;
    return {
      latex: `${v} = ${fmtNumLatex(x)}`,
      text: `${v} = ${fmtNum(x)}`,
    };
  }

  if (degree === 2) {
    const a = coeffs.get(2) || 0;
    const b = coeffs.get(1) || 0;
    const c = coeffs.get(0) || 0;
    if (Math.abs(a) < 1e-12) return null;

    const disc = b * b - 4 * a * c;

    if (disc < -1e-12) {
      // Complex roots
      const re = -b / (2 * a);
      const im = Math.sqrt(-disc) / (2 * a);
      return {
        latex: `${v} = ${fmtNumLatex(re)} \\pm ${fmtNumLatex(Math.abs(im))}\\,i`,
        text: `${v} = ${fmtNum(re)} ± ${fmtNum(Math.abs(im))}i`,
      };
    }

    if (Math.abs(disc) < 1e-12) {
      const x = -b / (2 * a);
      return {
        latex: `${v} = ${fmtNumLatex(x)}`,
        text: `${v} = ${fmtNum(x)}`,
      };
    }

    const sq = Math.sqrt(disc);
    const x1 = (-b + sq) / (2 * a);
    const x2 = (-b - sq) / (2 * a);

    // Symmetric roots like ±2
    if (Math.abs(b) < 1e-12 && Math.abs(x1 + x2) < 1e-12) {
      const absX = Math.abs(x1);
      return {
        latex: `${v} = \\pm ${fmtNumLatex(absX)}`,
        text: `${v} = ±${fmtNum(absX)}`,
      };
    }

    return {
      latex: `${v} = ${fmtNumLatex(x1)} \\text{ or } ${v} = ${fmtNumLatex(x2)}`,
      text: `${v} = ${fmtNum(x1)} or ${v} = ${fmtNum(x2)}`,
    };
  }

  return null; // degree > 2 not supported yet
}

function manualFactor(
  json: unknown,
  v: string,
): { latex: string; text: string } | null {
  const coeffs = extractPolyCoeffs(json, v);
  if (!coeffs) return null;

  const degree = Math.max(...coeffs.keys(), 0);
  if (degree !== 2) return null;

  const a = coeffs.get(2) || 0;
  const b = coeffs.get(1) || 0;
  const c = coeffs.get(0) || 0;
  if (Math.abs(a) < 1e-12) return null;

  const disc = b * b - 4 * a * c;
  if (disc < -1e-12) return null; // Complex roots — can't factor over reals

  const sq = Math.sqrt(Math.max(disc, 0));
  const r1 = (-b + sq) / (2 * a);
  const r2 = (-b - sq) / (2 * a);

  // Only produce clean factored form for "nice" roots
  const isNice = (n: number): boolean => {
    if (Number.isInteger(n)) return true;
    for (let d = 2; d <= 12; d++) {
      if (Math.abs(n * d - Math.round(n * d)) < 1e-10) return true;
    }
    return false;
  };
  if (!isNice(r1) || !isNice(r2)) return null;

  // Build (x - r1)(x - r2) form with clean signs
  function termStr(r: number, fmt: (n: number) => string): string {
    if (Math.abs(r) < 1e-12) return v;
    if (r < 0) return `(${v} + ${fmt(-r)})`;
    return `(${v} - ${fmt(r)})`;
  }

  const t1Latex = termStr(r1, fmtNumLatex);
  const t2Latex = termStr(r2, fmtNumLatex);
  const t1Text = termStr(r1, fmtNum);
  const t2Text = termStr(r2, fmtNum);

  const prefix = Math.abs(a - 1) < 1e-12 ? "" : fmtNumLatex(a);
  const prefixT = Math.abs(a - 1) < 1e-12 ? "" : fmtNum(a);

  return {
    latex: `${prefix}${t1Latex}${t2Latex}`,
    text: `${prefixT}${t1Text}${t2Text}`,
  };
}

// ══════════════════════════════════════════════════════════════
//  PUBLIC CAS FUNCTIONS
// ══════════════════════════════════════════════════════════════

/**
 * Symbolic differentiation: d/d(var) of expression.
 * CortexJS handles this well — just fix display.
 */
export function differentiate(
  latex: string,
  variable?: string,
): Result<EvalResult> {
  // Try Giac first — returns null if unavailable
  const giacResult = giacDifferentiate(latex, variable);
  if (giacResult) return giacResult;

  const diagnostics: Diagnostic[] = [];
  const ce = getCE();
  const v = resolveVariable(latex, variable);

  try {
    const expr = parseLatex(latex);
    if (expr.isValid === false) {
      return err("Failed to parse expression for differentiation", diagnostics);
    }

    const diffExpr = ce.box(["D", expr.json, v]);
    const result = diffExpr.evaluate();

    const resultStr = String(result);
    if (resultStr.includes("[\"D\"") || resultStr === "D") {
      diagnostics.push({
        level: "info",
        message: `CortexJS cannot symbolically differentiate this expression with respect to ${v}.`,
      });
      return err(
        `Symbolic differentiation not supported for this expression. Try a simpler form.`,
        diagnostics,
      );
    }

    diagnostics.push({ level: "info", message: `Differentiated with respect to ${v}` });
    return ok(toEvalResult(result), diagnostics);
  } catch (e) {
    return err(`Differentiation failed: ${e instanceof Error ? e.message : String(e)}`, diagnostics);
  }
}

/**
 * Symbolic integration: ∫ expression d(var).
 * CortexJS 0.24 cannot integrate — falls back to manual rule-based integration.
 */
export function integrate(
  latex: string,
  variable?: string,
): Result<EvalResult> {
  // Try Giac first
  const giacResult = giacIntegrate(latex, variable);
  if (giacResult) return giacResult;

  const diagnostics: Diagnostic[] = [];
  const ce = getCE();
  const v = resolveVariable(latex, variable);

  try {
    const expr = parseLatex(latex);
    if (expr.isValid === false) {
      return err("Failed to parse expression for integration", diagnostics);
    }

    // Try CortexJS first (unlikely to work in 0.24)
    try {
      const intExpr = ce.box(["Integrate", expr.json, v]);
      const result = intExpr.evaluate();
      const resultStr = String(result);
      if (!resultStr.includes("Integrate") && resultStr !== "Integrate") {
        diagnostics.push({ level: "info", message: `Integrated with respect to ${v}` });
        return ok(toEvalResult(result), diagnostics);
      }
    } catch { /* CortexJS can't — try manual */ }

    // Manual rule-based integration
    const resultJson = manualIntegrate(expr.json, v);
    if (resultJson !== null) {
      const resultExpr = ce.box(resultJson as any);
      const simplified = resultExpr.simplify();
      diagnostics.push({ level: "info", message: `Integrated with respect to ${v}` });
      return ok(toEvalResult(simplified), diagnostics);
    }

    return err(
      `Cannot integrate this expression symbolically. Supported: polynomials, trig, exp, ln, and their linear compositions.`,
      diagnostics,
    );
  } catch (e) {
    return err(`Integration failed: ${e instanceof Error ? e.message : String(e)}`, diagnostics);
  }
}

/**
 * Solve an equation for the target variable.
 * CortexJS 0.24 cannot solve — falls back to manual polynomial solver.
 */
export function solveEquation(latex: string): Result<EvalResult> {
  // Try Giac first
  const giacResult = giacSolve(latex);
  if (giacResult) return giacResult;

  const diagnostics: Diagnostic[] = [];
  const ce = getCE();

  try {
    const expr = parseLatex(latex);
    if (expr.isValid === false) {
      return err("Failed to parse expression for solving", diagnostics);
    }

    const json = expr.json;
    let solveTarget = expr.json;
    let variable = "x";

    // If equation, compute LHS - RHS
    if (
      Array.isArray(json) &&
      (json[0] === "Equal" || json[0] === "Assign" || json[0] === "Equation") &&
      json.length === 3
    ) {
      solveTarget = ["Subtract", json[1], json[2]];
    }

    // Find the variable
    const targetExpr = ce.box(solveTarget as any);
    const freeVars = targetExpr.freeVariables;
    if (freeVars && freeVars.length > 0) {
      if (freeVars.includes("x")) variable = "x";
      else if (freeVars.includes("y")) variable = "y";
      else variable = freeVars[0];
    }

    // Try CortexJS first
    try {
      const solveExpr = ce.box(["Solve", solveTarget, variable]);
      const result = solveExpr.evaluate();
      const resultStr = String(result);
      if (
        !resultStr.includes("Solve") &&
        resultStr !== "Nothing" &&
        resultStr !== "EmptySet"
      ) {
        diagnostics.push({ level: "info", message: `Solved for ${variable}` });
        return ok(toEvalResult(result), diagnostics);
      }
    } catch { /* CortexJS can't — try manual */ }

    // Manual polynomial solver
    // Evaluate/simplify the target first to normalize
    let solveJson = solveTarget;
    try {
      const simplified = ce.box(solveTarget as any).evaluate();
      solveJson = simplified.json;
    } catch { /* use original */ }

    const solution = manualSolve(solveJson, variable);
    if (solution) {
      diagnostics.push({ level: "info", message: `Solved for ${variable}` });
      return ok(solution, diagnostics);
    }

    return err(
      `Cannot solve for ${variable}. Supported: linear and quadratic equations.`,
      diagnostics,
    );
  } catch (e) {
    return err(`Solve failed: ${e instanceof Error ? e.message : String(e)}`, diagnostics);
  }
}

/**
 * Factor a polynomial expression.
 */
export function factorExpression(latex: string): Result<EvalResult> {
  // Try Giac first
  const giacResult = giacFactor(latex);
  if (giacResult) return giacResult;

  const diagnostics: Diagnostic[] = [];
  const ce = getCE();

  try {
    const expr = parseLatex(latex);
    if (expr.isValid === false) {
      return err("Failed to parse expression for factoring", diagnostics);
    }

    // Try CortexJS first
    try {
      const factored = ce.box(["Factor", expr.json]);
      const result = factored.evaluate();
      const resultStr = String(result);
      // Reject if CortexJS returned unevaluated "Factor", trivial "1", or just a number
      const isTrivial = resultStr === "1" || resultStr === "0" ||
        (!isNaN(Number(resultStr)) && !resultStr.includes("("));
      if (!resultStr.includes("Factor") && !isTrivial) {
        diagnostics.push({ level: "info", message: "Factored expression" });
        return ok(toEvalResult(result), diagnostics);
      }
    } catch { /* try manual */ }

    // Find variable
    let variable = "x";
    const freeVars = expr.freeVariables;
    if (freeVars && freeVars.length > 0) {
      if (freeVars.includes("x")) variable = "x";
      else if (freeVars.includes("y")) variable = "y";
      else variable = freeVars[0];
    }

    // Manual quadratic factoring
    const factored = manualFactor(expr.json, variable);
    if (factored) {
      diagnostics.push({ level: "info", message: "Factored quadratic expression" });
      return ok(factored, diagnostics);
    }

    return err(
      "Cannot factor this expression. Supported: quadratic polynomials with rational roots.",
      diagnostics,
    );
  } catch (e) {
    return err(`Factor failed: ${e instanceof Error ? e.message : String(e)}`, diagnostics);
  }
}

/**
 * Partial derivative: ∂f/∂(variable).
 */
export function partialDerivative(
  latex: string,
  variable: string,
): Result<EvalResult> {
  // Try Giac first
  const giacResult = giacPartialDerivative(latex, variable);
  if (giacResult) return giacResult;

  const diagnostics: Diagnostic[] = [];
  const ce = getCE();

  try {
    const expr = parseLatex(latex);
    if (expr.isValid === false) {
      return err("Failed to parse expression for partial derivative", diagnostics);
    }

    const json = expr.json;
    let targetJson = expr.json;
    if (
      Array.isArray(json) &&
      (json[0] === "Equal" || json[0] === "Assign" || json[0] === "Equation") &&
      json.length === 3
    ) {
      targetJson = json[2];
    }

    const diffExpr = ce.box(["D", targetJson, variable]);
    const result = diffExpr.evaluate();

    const resultStr = String(result);
    if (resultStr.includes("[\"D\"") || resultStr === "D") {
      return err(`Cannot compute ∂/∂${variable} symbolically for this expression.`, diagnostics);
    }

    diagnostics.push({ level: "info", message: `Computed ∂/∂${variable}` });
    return ok(toEvalResult(result), diagnostics);
  } catch (e) {
    return err(`Partial derivative failed: ${e instanceof Error ? e.message : String(e)}`, diagnostics);
  }
}

/**
 * Gradient vector: ∇f = (∂f/∂x, ∂f/∂y) or (∂f/∂x, ∂f/∂y, ∂f/∂z).
 */
export function computeGradient(latex: string): Result<EvalResult> {
  // Try Giac first
  const giacResult = giacGradient(latex);
  if (giacResult) return giacResult;

  const diagnostics: Diagnostic[] = [];
  const ce = getCE();

  try {
    const expr = parseLatex(latex);
    if (expr.isValid === false) {
      return err("Failed to parse expression for gradient", diagnostics);
    }

    const json = expr.json;
    let targetJson = expr.json;
    if (
      Array.isArray(json) &&
      (json[0] === "Equal" || json[0] === "Assign" || json[0] === "Equation") &&
      json.length === 3
    ) {
      targetJson = json[2];
    }

    const targetExpr = ce.box(targetJson);
    const freeVars = targetExpr.freeVariables || [];
    const hasX = freeVars.includes("x");
    const hasY = freeVars.includes("y");
    const hasZ = freeVars.includes("z");

    const vars: string[] = [];
    if (hasX) vars.push("x");
    if (hasY) vars.push("y");
    if (hasZ) vars.push("z");
    if (vars.length === 0) vars.push("x", "y");

    const latexComponents: string[] = [];
    const textComponents: string[] = [];

    for (const v of vars) {
      const diffExpr = ce.box(["D", targetJson, v]);
      const result = diffExpr.evaluate();
      const resultStr = String(result);

      if (resultStr.includes("[\"D\"") || resultStr === "D") {
        return err(`Cannot compute ∂/∂${v} symbolically for gradient.`, diagnostics);
      }

      const compLatex = exprToLatex(result);
      latexComponents.push(compLatex);
      textComponents.push(latexToReadable(compLatex));
    }

    const resultLatex = `\\nabla f = \\left(${latexComponents.join(",\\, ")}\\right)`;
    const resultText = `∇f = (${textComponents.join(", ")})`;

    diagnostics.push({
      level: "info",
      message: `Computed gradient in ${vars.length}D: variables (${vars.join(", ")})`,
    });

    return ok({ latex: resultLatex, text: resultText }, diagnostics);
  } catch (e) {
    return err(`Gradient failed: ${e instanceof Error ? e.message : String(e)}`, diagnostics);
  }
}

/**
 * Surface normal vector.
 */
export function computeNormal(latex: string): Result<EvalResult> {
  const diagnostics: Diagnostic[] = [];
  const ce = getCE();

  try {
    const expr = parseLatex(latex);
    if (expr.isValid === false) {
      return err("Failed to parse expression for normal vector", diagnostics);
    }

    const json = expr.json;
    let targetJson: unknown;
    let isImplicit = false;

    if (
      Array.isArray(json) &&
      (json[0] === "Equal" || json[0] === "Assign" || json[0] === "Equation") &&
      json.length === 3
    ) {
      const lhsStr = String(ce.box(json[1]));
      const rhsStr = String(ce.box(json[2]));

      if (lhsStr === "z") { targetJson = json[2]; isImplicit = false; }
      else if (rhsStr === "z") { targetJson = json[1]; isImplicit = false; }
      else { targetJson = ["Subtract", json[1], json[2]]; isImplicit = true; }
    } else {
      const freeVars = expr.freeVariables || [];
      if (freeVars.includes("z")) { targetJson = json; isImplicit = true; }
      else { targetJson = json; isImplicit = false; }
    }

    if (isImplicit) {
      const vars = ["x", "y", "z"];
      const latexComponents: string[] = [];
      const textComponents: string[] = [];

      for (const v of vars) {
        const diffExpr = ce.box(["D", targetJson, v]);
        const result = diffExpr.evaluate();
        const resultStr = String(result);

        if (resultStr.includes("[\"D\"") || resultStr === "D") {
          return err(`Cannot compute ∂F/∂${v} symbolically for normal vector.`, diagnostics);
        }

        const compLatex = exprToLatex(result);
        latexComponents.push(compLatex);
        textComponents.push(latexToReadable(compLatex));
      }

      const resultLatex = `\\vec{n} = \\left(${latexComponents.join(",\\, ")}\\right)`;
      const resultText = `n = (${textComponents.join(", ")})`;

      diagnostics.push({ level: "info", message: "Computed normal vector for implicit surface" });
      return ok({ latex: resultLatex, text: resultText }, diagnostics);
    } else {
      const dxExpr = ce.box(["D", targetJson, "x"]).evaluate();
      const dyExpr = ce.box(["D", targetJson, "y"]).evaluate();

      const dxStr = String(dxExpr);
      const dyStr = String(dyExpr);

      if (dxStr.includes("[\"D\"") || dyStr.includes("[\"D\"")) {
        return err("Cannot compute partial derivatives symbolically for normal vector.", diagnostics);
      }

      const dxLatex = exprToLatex(dxExpr);
      const dyLatex = exprToLatex(dyExpr);

      const resultLatex = `\\vec{n} = \\left(${dxLatex},\\, ${dyLatex},\\, -1\\right)`;
      const resultText = `n = (${latexToReadable(dxLatex)}, ${latexToReadable(dyLatex)}, -1)`;

      diagnostics.push({ level: "info", message: "Computed normal for z = f(x,y): (∂f/∂x, ∂f/∂y, -1)" });
      return ok({ latex: resultLatex, text: resultText }, diagnostics);
    }
  } catch (e) {
    return err(`Normal vector failed: ${e instanceof Error ? e.message : String(e)}`, diagnostics);
  }
}
