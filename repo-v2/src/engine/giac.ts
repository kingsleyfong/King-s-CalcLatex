/**
 * King's CalcLatex v2 — Giac WASM Bridge
 *
 * Lazy-loads the Giac computer algebra system via WASM.
 * Provides a clean async API for CAS operations.
 * Falls back gracefully when Giac is not available.
 *
 * Setup: place `giacwasm.js` in the Obsidian plugin folder
 * (.obsidian/plugins/kings-calclatex/giacwasm.js).
 */

import { parseLatex, getCE, jsonToLatex } from "./parser";
import { latexToReadable } from "./cas";
import type { EvalResult, Result, Diagnostic } from "../types";
import { ok, err } from "../types";

// ══════════════════════════════════════════════════════════════
//  GIAC RUNTIME STATE
// ══════════════════════════════════════════════════════════════

let giacReady = false;
let caseval: ((s: string) => string) | null = null;
let loadPromise: Promise<boolean> | null = null;

/** Check if Giac is loaded and ready. */
export function isGiacReady(): boolean {
  return giacReady;
}

/**
 * Initialize Giac WASM by loading giacwasm.js from the plugin folder.
 * Returns true if Giac loaded successfully, false otherwise.
 * Safe to call multiple times — only loads once.
 *
 * Loading strategy: Electron's CSP blocks `file://` URLs in <script src>,
 * so we read the file via Node `fs` and inject it as an inline <script>.
 * This executes in the global scope, allowing the Emscripten code to find
 * our pre-configured `window.Module` object.
 */
export function initGiac(pluginDir: string): Promise<boolean> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    try {
      const giacPath = pluginDir.replace(/\\/g, "/") + "/giacwasm.js";

      // Check if file exists (Electron has access to require('fs'))
      let fs: any;
      try {
        fs = (window as any).require("fs");
        if (!fs.existsSync(giacPath)) {
          console.log("KCL: giacwasm.js not found at", giacPath);
          resolve(false);
          return;
        }
      } catch {
        console.log("KCL: Cannot check for giacwasm.js (no fs access)");
        resolve(false);
        return;
      }

      // Save any existing Module global
      const oldModule = (window as any).Module;

      // Timeout: WASM compilation can be slow on first load
      const timeout = setTimeout(() => {
        if (!giacReady) {
          console.warn("KCL: Giac WASM initialization timed out (60s)");
          resolve(false);
        }
      }, 60000);

      // Set up Emscripten Module config BEFORE executing the script.
      // The Emscripten glue code checks `typeof Module !== 'undefined'`
      // and picks up this pre-configured object.
      (window as any).Module = {
        ready: false,
        worker: false,
        print: () => {},
        printErr: () => {},
        canvas: null,
        setStatus: () => {},
        onRuntimeInitialized: () => {
          clearTimeout(timeout);
          try {
            caseval = (window as any).Module.cwrap(
              "caseval",
              "string",
              ["string"],
            );
            giacReady = true;
            console.log("KCL: Giac WASM initialized successfully");
            resolve(true);
          } catch (e) {
            console.error("KCL: Giac cwrap failed:", e);
            if (oldModule) (window as any).Module = oldModule;
            resolve(false);
          }
        },
      };

      // Read the script and execute as inline <script> in global scope.
      // Cannot use <script src="file://..."> — Electron blocks file:// URLs.
      // Cannot use require() — module wrapper shadows the global Module var.
      console.log("KCL: Loading giacwasm.js…", giacPath);
      const code = fs.readFileSync(giacPath, "utf8");

      const script = document.createElement("script");
      script.textContent = code;
      document.head.appendChild(script);
      document.head.removeChild(script); // clean up DOM
      console.log("KCL: giacwasm.js executed, waiting for WASM init…");
    } catch (e) {
      console.error("KCL: Giac initialization error:", e);
      resolve(false);
    }
  });

  return loadPromise;
}

// ══════════════════════════════════════════════════════════════
//  RAW GIAC EVAL
// ══════════════════════════════════════════════════════════════

/**
 * Evaluate a raw Giac expression string.
 * Returns null if Giac is not ready or the expression fails.
 */
function giacRawEval(expr: string): string | null {
  if (!giacReady || !caseval) return null;
  try {
    const result = caseval(expr);
    if (!result || result.startsWith("GIAC_ERROR")) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * Evaluate a Giac expression and return LaTeX.
 * Wraps the expression in latex() for LaTeX output.
 */
function giacLatex(expr: string): string | null {
  return giacRawEval(`latex(${expr})`);
}

// ══════════════════════════════════════════════════════════════
//  MathJSON → GIAC SYNTAX CONVERSION
// ══════════════════════════════════════════════════════════════

/**
 * Convert a MathJSON node to Giac-compatible syntax string.
 * Giac uses standard math notation: x^3, sin(x), pi, e, etc.
 */
export function jsonToGiac(node: unknown): string {
  if (typeof node === "number") return node.toString();

  if (typeof node === "string") {
    switch (node) {
      case "Pi": return "pi";
      case "ExponentialE": case "E": return "e";
      case "ImaginaryUnit": return "i";
      case "Infinity": case "PositiveInfinity": return "inf";
      case "NegativeInfinity": return "-inf";
      case "Nothing": return "undef";
      default: return node;
    }
  }

  if (typeof node === "object" && node !== null && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    if ("num" in obj && typeof obj.num === "string") return obj.num;
    return String(node);
  }

  if (!Array.isArray(node)) return String(node);

  const [head, ...args] = node as [string, ...unknown[]];

  switch (head) {
    case "Add": return "(" + args.map(jsonToGiac).join("+") + ")";
    case "Subtract":
      if (args.length === 2) return "(" + jsonToGiac(args[0]) + "-(" + jsonToGiac(args[1]) + "))";
      return "(-" + jsonToGiac(args[0]) + ")";
    case "Negate": return "(-(" + jsonToGiac(args[0]) + "))";
    case "Multiply": return "(" + args.map(jsonToGiac).join("*") + ")";
    case "Divide":
      if (args.length === 2) return "((" + jsonToGiac(args[0]) + ")/(" + jsonToGiac(args[1]) + "))";
      return args.map(jsonToGiac).join("/");
    case "Power":
      if (args.length === 2) return "((" + jsonToGiac(args[0]) + ")^(" + jsonToGiac(args[1]) + "))";
      return String(node);
    case "Square": return "((" + jsonToGiac(args[0]) + ")^2)";
    case "Cube": return "((" + jsonToGiac(args[0]) + ")^3)";
    case "Sqrt": return "sqrt(" + jsonToGiac(args[0]) + ")";
    case "Root":
      if (args.length === 2) return "surd(" + jsonToGiac(args[0]) + "," + jsonToGiac(args[1]) + ")";
      return String(node);
    case "Rational":
      if (args.length === 2) return "((" + jsonToGiac(args[0]) + ")/(" + jsonToGiac(args[1]) + "))";
      return String(node);

    // Trig
    case "Sin": return "sin(" + jsonToGiac(args[0]) + ")";
    case "Cos": return "cos(" + jsonToGiac(args[0]) + ")";
    case "Tan": return "tan(" + jsonToGiac(args[0]) + ")";
    case "Cot": return "cot(" + jsonToGiac(args[0]) + ")";
    case "Sec": return "1/cos(" + jsonToGiac(args[0]) + ")";
    case "Csc": return "1/sin(" + jsonToGiac(args[0]) + ")";
    case "Arcsin": return "asin(" + jsonToGiac(args[0]) + ")";
    case "Arccos": return "acos(" + jsonToGiac(args[0]) + ")";
    case "Arctan": case "ArcTan": return "atan(" + jsonToGiac(args[0]) + ")";
    case "Sinh": return "sinh(" + jsonToGiac(args[0]) + ")";
    case "Cosh": return "cosh(" + jsonToGiac(args[0]) + ")";
    case "Tanh": return "tanh(" + jsonToGiac(args[0]) + ")";

    // Exp / Log
    case "Exp": return "exp(" + jsonToGiac(args[0]) + ")";
    case "Ln": return "ln(" + jsonToGiac(args[0]) + ")";
    case "Log":
      if (args.length === 1) return "log(" + jsonToGiac(args[0]) + ")";
      if (args.length === 2) return "log(" + jsonToGiac(args[0]) + ")/log(" + jsonToGiac(args[1]) + ")";
      return String(node);
    case "Log2": return "log((" + jsonToGiac(args[0]) + "))/log(2)";

    // Misc
    case "Abs": return "abs(" + jsonToGiac(args[0]) + ")";
    case "Floor": return "floor(" + jsonToGiac(args[0]) + ")";
    case "Ceiling": return "ceil(" + jsonToGiac(args[0]) + ")";
    case "Half": return "((" + jsonToGiac(args[0]) + ")/2)";

    // Containers
    case "Sequence": case "List": return args.map(jsonToGiac).join(",");
    case "Delimiter": return args.length >= 1 ? jsonToGiac(args[0]) : "";

    // Relations
    case "Equal": case "Assign": case "Equation":
      if (args.length === 2) return jsonToGiac(args[0]) + "=" + jsonToGiac(args[1]);
      return args.map(jsonToGiac).join("=");

    default:
      // Try lowercase function name
      if (args.length > 0)
        return head.toLowerCase() + "(" + args.map(jsonToGiac).join(",") + ")";
      return head;
  }
}

/**
 * Convert LaTeX to Giac syntax via CortexJS MathJSON intermediate.
 */
export function latexToGiac(latex: string): string {
  try {
    const expr = parseLatex(latex);
    return jsonToGiac(expr.json);
  } catch {
    // Fallback: basic string-level conversion
    return latex
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))")
      .replace(/\\sin/g, "sin").replace(/\\cos/g, "cos").replace(/\\tan/g, "tan")
      .replace(/\\ln/g, "ln").replace(/\\log/g, "log").replace(/\\exp/g, "exp")
      .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
      .replace(/\\pi/g, "pi")
      .replace(/\\left/g, "").replace(/\\right/g, "")
      .replace(/\{/g, "(").replace(/\}/g, ")")
      .replace(/\\cdot/g, "*")
      .replace(/\\,/g, "").replace(/\\ /g, " ");
  }
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
//  HIGH-LEVEL CAS OPERATIONS (Giac-powered)
// ══════════════════════════════════════════════════════════════

function makeResult(giacLatexResult: string, diagnostics: Diagnostic[]): Result<EvalResult> {
  // Giac's latex() output may have surrounding quotes or $ — strip them
  let latex = giacLatexResult.trim();
  if (latex.startsWith('"') && latex.endsWith('"')) latex = latex.slice(1, -1);
  if (latex.startsWith("$") && latex.endsWith("$")) latex = latex.slice(1, -1);
  // Clean up Giac-specific LaTeX oddities
  latex = latex
    .replace(/\\mathit\{([^{}]+)\}/g, "$1")
    .replace(/\\mathrm\{([^{}]+)\}/g, "\\operatorname{$1}");

  const text = latexToReadable(latex);
  return ok({ latex, text }, diagnostics);
}

/** Differentiate using Giac. Returns null if Giac unavailable. */
export function giacDifferentiate(latex: string, variable?: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const v = resolveVariable(latex, variable);
  const giacExpr = latexToGiac(latex);
  const result = giacLatex(`diff(${giacExpr},${v})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Differentiated w.r.t. ${v} (Giac)` }]);
}

/** Integrate using Giac. */
export function giacIntegrate(latex: string, variable?: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const v = resolveVariable(latex, variable);
  const giacExpr = latexToGiac(latex);
  const result = giacLatex(`integrate(${giacExpr},${v})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Integrated w.r.t. ${v} (Giac)` }]);
}

/** Solve an equation using Giac. */
export function giacSolve(latex: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  const v = resolveVariable(latex);

  // If it's already an equation (contains =), solve directly
  // Otherwise, solve expr = 0
  const solveExpr = giacExpr.includes("=") ? giacExpr : `${giacExpr}=0`;
  const result = giacLatex(`solve(${solveExpr},${v})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Solved for ${v} (Giac)` }]);
}

/** Factor using Giac. */
export function giacFactor(latex: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  const result = giacLatex(`factor(${giacExpr})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: "Factored (Giac)" }]);
}

/** Simplify using Giac. */
export function giacSimplify(latex: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  const result = giacLatex(`simplify(${giacExpr})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: "Simplified (Giac)" }]);
}

/** Expand using Giac. */
export function giacExpand(latex: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  const result = giacLatex(`expand(${giacExpr})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: "Expanded (Giac)" }]);
}

/** Compute limit using Giac. */
export function giacLimit(latex: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const v = resolveVariable(latex);

  // Try to extract "as x->a" pattern from the expression
  // Format: "expr" with variable approaching a value
  // For now, default to limit as v→0 if no target specified
  // Users can write expressions like "sin(x)/x" and the limit is at 0
  const giacExpr = latexToGiac(latex);
  const result = giacLatex(`limit(${giacExpr},${v},0)`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Limit as ${v}→0 (Giac)` }]);
}

/** Taylor series using Giac. */
export function giacTaylor(latex: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const v = resolveVariable(latex);
  const giacExpr = latexToGiac(latex);
  // Default: Taylor expansion around 0, order 5
  const result = giacLatex(`taylor(${giacExpr},${v}=0,5)`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Taylor series in ${v} around 0, order 5 (Giac)` }]);
}

/** Partial fraction decomposition using Giac. */
export function giacPartfrac(latex: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const v = resolveVariable(latex);
  const giacExpr = latexToGiac(latex);
  const result = giacLatex(`partfrac(${giacExpr},${v})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Partial fractions in ${v} (Giac)` }]);
}

/** Partial derivative using Giac. */
export function giacPartialDerivative(latex: string, variable: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  const result = giacLatex(`diff(${giacExpr},${variable})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `∂/∂${variable} (Giac)` }]);
}

/** Gradient using Giac. */
export function giacGradient(latex: string): Result<EvalResult> | null {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);

  // Detect variables present
  const v = resolveVariable(latex);
  const expr = parseLatex(latex);
  const freeVars = expr.freeVariables || [];
  const vars: string[] = [];
  if (freeVars.includes("x")) vars.push("x");
  if (freeVars.includes("y")) vars.push("y");
  if (freeVars.includes("z")) vars.push("z");
  if (vars.length === 0) vars.push("x", "y");

  // Compute each partial derivative
  const components: string[] = [];
  for (const vi of vars) {
    const comp = giacLatex(`diff(${giacExpr},${vi})`);
    if (!comp) return null;
    components.push(comp.replace(/^\$/, "").replace(/\$$/, "").replace(/^"|"$/g, ""));
  }

  const resultLatex = `\\nabla f = \\left(${components.join(",\\, ")}\\right)`;
  const resultText = latexToReadable(resultLatex);
  return ok(
    { latex: resultLatex, text: resultText },
    [{ level: "info", message: `Gradient in ${vars.length}D (Giac)` }],
  );
}
