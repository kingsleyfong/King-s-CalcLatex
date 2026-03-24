/**
 * King's CalcLatex v2 — LaTeX Parser & Expression Compiler
 *
 * Parses LaTeX strings into CortexJS BoxedExpressions, classifies them
 * by type (explicit 2D, implicit 2D, 3D, etc.), and compiles them into
 * function-plot-compatible strings and JS evaluator functions.
 */

import { ComputeEngine, type BoxedExpression } from "@cortex-js/compute-engine";
import type { ExprType } from "../types";

// ── Singleton Compute Engine ────────────────────────────────────────

let _ce: ComputeEngine | null = null;

/** Return the shared ComputeEngine instance (lazy-initialized). */
export function getCE(): ComputeEngine {
  if (!_ce) {
    _ce = new ComputeEngine();
  }
  return _ce;
}

// ── LaTeX Parsing ───────────────────────────────────────────────────

/** Strip math delimiters ($, $$, \(, \), \[, \]) from a LaTeX string. */
function stripDelimiters(latex: string): string {
  let s = latex.trim();
  if (s.startsWith("$$") && s.endsWith("$$")) return s.slice(2, -2).trim();
  if (s.startsWith("$") && s.endsWith("$")) return s.slice(1, -1).trim();
  if (s.startsWith("\\[") && s.endsWith("\\]")) return s.slice(2, -2).trim();
  if (s.startsWith("\\(") && s.endsWith("\\)")) return s.slice(2, -2).trim();
  return s;
}

/**
 * Attempt to manually parse a \begin{cases}...\end{cases} block that
 * CortexJS may not handle correctly. Returns a BoxedExpression with head
 * "Piecewise" on success, or null if no cases block is present.
 */
function tryParsePiecewise(
  latex: string,
  ce: ComputeEngine,
): BoxedExpression | null {
  const casesMatch = latex.match(/\\begin\{cases\}([\s\S]+?)\\end\{cases\}/);
  if (!casesMatch) return null;

  const casesBody = casesMatch[1];
  // Split rows on \\ (LaTeX row separator), filter empty
  const rows = casesBody.split(/\\\\/).map(r => r.trim()).filter(r => r.length > 0);

  const branches: [unknown, unknown][] = [];
  for (const row of rows) {
    // Each row: "expression & condition" or "expression & \text{otherwise}"
    const parts = row.split("&").map(p => p.trim());
    if (parts.length < 2) {
      // No & separator — treat as unconditional default branch
      const expr = ce.parse(parts[0]);
      branches.push([expr.json, "True"]);
    } else {
      const expr = ce.parse(parts[0]);
      const rawCond = parts[1]
        .replace(/\\text\{otherwise\}/gi, "")
        .replace(/\\text\{else\}/gi, "")
        .replace(/\\text\{[^}]*\}/gi, "") // strip any other \text{...}
        .trim();
      if (
        rawCond === "" ||
        rawCond.toLowerCase() === "otherwise" ||
        rawCond.toLowerCase() === "else"
      ) {
        branches.push([expr.json, "True"]);
      } else {
        const cond = ce.parse(rawCond);
        branches.push([expr.json, cond.json]);
      }
    }
  }

  if (branches.length === 0) return null;
  return ce.box(["Piecewise", ...branches] as any);
}

/**
 * Parse a LaTeX string into a CortexJS BoxedExpression.
 * Strips math delimiters automatically.
 * Intercepts \begin{cases}...\end{cases} before CortexJS sees it,
 * building a Piecewise expression manually for reliable branch handling.
 */
export function parseLatex(latex: string): BoxedExpression {
  const ce = getCE();
  const clean = stripDelimiters(latex);

  // Handle \begin{cases}...\end{cases} manually — CortexJS may not parse it
  const piecewiseResult = tryParsePiecewise(clean, ce);
  if (piecewiseResult) return piecewiseResult;

  return ce.parse(clean);
}

// ── MathJSON → Infix String (function-plot compatible) ──────────────

/**
 * Operator mapping from MathJSON head names to infix/function-call format.
 * function-plot understands: x, y, t, sin(), cos(), tan(), sqrt(), log(),
 * exp(), abs(), ^ for power, and standard arithmetic operators.
 *
 * NOTE: CortexJS auto-normalizes some expressions at parse time:
 *   x^2 → ["Square", x]     (handled specially below, not via this map)
 *   x^3 → ["Cube", x]       (same)
 *   These are NOT in this map to allow the Power fallback to remain clean.
 */
const UNARY_FN_MAP: Record<string, string> = {
  Sin: "sin",
  Cos: "cos",
  Tan: "tan",
  Cot: "cot",
  Sec: "sec",
  Csc: "csc",
  Sqrt: "sqrt",
  Ln: "log",       // function-plot uses log() for natural log
  Log: "log",
  Log2: "log2",
  Exp: "exp",
  Abs: "abs",
  Arcsin: "asin",
  Arccos: "acos",
  Arctan: "atan",
  ArcTan: "atan",
  Arcsinh: "asinh",
  Arccosh: "acosh",
  Arctanh: "atanh",
  Sinh: "sinh",
  Cosh: "cosh",
  Tanh: "tanh",
  Floor: "floor",
  Ceiling: "ceil",
  Round: "round",
  Sign: "sign",
};

/**
 * Convert a MathJSON condition node (inside Piecewise/Which branches) into
 * a JS-evaluable boolean expression string.
 *
 * Handles: Less, Greater, LessEqual, GreaterEqual, Equal, And, Or, Not,
 * Element, NotElement, True, False, Otherwise.
 * Falls back to jsonToInfix for unknown numeric nodes.
 */
function conditionToInfix(node: unknown): string {
  if (typeof node === "string") {
    if (node === "True" || node === "Otherwise") return "true";
    if (node === "False") return "false";
    return node;
  }
  if (!Array.isArray(node)) return "true";

  const [head, ...args] = node as [string, ...unknown[]];

  if (head === "Less" && args.length === 2)
    return `(${jsonToInfix(args[0])} < ${jsonToInfix(args[1])})`;
  if (head === "Greater" && args.length === 2)
    return `(${jsonToInfix(args[0])} > ${jsonToInfix(args[1])})`;
  if (head === "LessEqual" && args.length === 2)
    return `(${jsonToInfix(args[0])} <= ${jsonToInfix(args[1])})`;
  if (head === "GreaterEqual" && args.length === 2)
    return `(${jsonToInfix(args[0])} >= ${jsonToInfix(args[1])})`;
  if (head === "Equal" && args.length === 2)
    return `(${jsonToInfix(args[0])} === ${jsonToInfix(args[1])})`;
  if (head === "And")
    return "(" + args.map(conditionToInfix).join(" && ") + ")";
  if (head === "Or")
    return "(" + args.map(conditionToInfix).join(" || ") + ")";
  if (head === "Not" && args.length === 1)
    return `(!${conditionToInfix(args[0])})`;
  if (head === "Element" || head === "NotElement")
    return "true"; // unsupported membership test — pass through

  // Fallback: numeric expression used directly as condition value
  return jsonToInfix(node);
}

/**
 * Convert a MathJSON node (from `expr.json`) into an infix string that
 * function-plot can evaluate directly.
 */
function jsonToInfix(node: unknown): string {
  // Number literal
  if (typeof node === "number") return node.toString();

  // String symbol (e.g. "x", "y", "Pi")
  if (typeof node === "string") {
    if (node === "Pi") return "(Math.PI)";
    if (node === "ExponentialE" || node === "E") return "(Math.E)";
    return node;
  }

  // Array expression: ["Head", ...args]
  if (Array.isArray(node)) {
    const [head, ...args] = node as [string, ...unknown[]];

    // Binary arithmetic
    if (head === "Add") {
      return "(" + args.map(jsonToInfix).join(" + ") + ")";
    }
    if (head === "Subtract" && args.length === 2) {
      return "(" + jsonToInfix(args[0]) + " - " + jsonToInfix(args[1]) + ")";
    }
    if (head === "Multiply") {
      return "(" + args.map(jsonToInfix).join(" * ") + ")";
    }
    if (head === "Divide" && args.length === 2) {
      return "(" + jsonToInfix(args[0]) + " / " + jsonToInfix(args[1]) + ")";
    }
    if (head === "Power" && args.length === 2) {
      return "(" + jsonToInfix(args[0]) + " ^ " + jsonToInfix(args[1]) + ")";
    }
    if (head === "Negate" && args.length === 1) {
      return "(-" + jsonToInfix(args[0]) + ")";
    }

    // ── CortexJS list/sequence heads ────────────────────────────────
    // CortexJS parses (a, b, c) tuples as ["Sequence", a, b, c] or
    // ["List", a, b, c]. Used for parametric curves. Render as a
    // parenthesized comma list so callers can detect and split them.
    if ((head === "Sequence" || head === "List") && args.length > 0) {
      return "(" + args.map(jsonToInfix).join(", ") + ")";
    }
    // ["Delimiter", inner, open, close] — parenthesized expression
    if (head === "Delimiter" && args.length >= 1) {
      return jsonToInfix(args[0]);
    }
    // ────────────────────────────────────────────────────────────────

    // ── Piecewise / Which → nested JS ternary ──────────────────────
    // CortexJS parses \begin{cases}...\end{cases} into one of:
    //   ["Piecewise", [expr1, cond1], [expr2, cond2], ...]
    //   ["Which", cond1, expr1, cond2, expr2, ...]
    if (head === "Piecewise") {
      const branches = args.map(a => {
        if (Array.isArray(a) && a.length >= 2) {
          return { expr: jsonToInfix(a[0]), cond: conditionToInfix(a[1]) };
        }
        return { expr: jsonToInfix(a), cond: "true" };
      });
      // Build nested ternary: (cond1 ? expr1 : (cond2 ? expr2 : (0/0)))
      let result = "(0/0)"; // NaN sentinel for unmatched branch
      for (let i = branches.length - 1; i >= 0; i--) {
        const b = branches[i];
        if (b.cond === "true") {
          result = b.expr; // default/else branch — no conditional needed
        } else {
          result = `(${b.cond} ? ${b.expr} : ${result})`;
        }
      }
      return result;
    }

    if (head === "Which") {
      // ["Which", cond1, expr1, cond2, expr2, ...]  (alternating cond/expr pairs)
      let result = "(0/0)";
      for (let i = args.length - 2; i >= 0; i -= 2) {
        const cond = conditionToInfix(args[i]);
        const expr = jsonToInfix(args[i + 1]);
        if (cond === "true") {
          result = expr;
        } else {
          result = `(${cond} ? ${expr} : ${result})`;
        }
      }
      return result;
    }
    // ────────────────────────────────────────────────────────────────

    // ── CortexJS auto-normalization heads ───────────────────────────
    // CortexJS simplifies x^2 → ["Square", x] and x^3 → ["Cube", x]
    // at parse time. These MUST be handled before the generic fallback,
    // or they produce invalid output like "square(x)" / "cube(x)".
    if (head === "Square" && args.length === 1) {
      return "(" + jsonToInfix(args[0]) + " ^ 2)";
    }
    if (head === "Cube" && args.length === 1) {
      return "(" + jsonToInfix(args[0]) + " ^ 3)";
    }
    // ["Root", x, n] = x^(1/n), e.g. cube root: ["Root", x, 3]
    if (head === "Root" && args.length === 2) {
      return "((" + jsonToInfix(args[0]) + ") ^ (1 / " + jsonToInfix(args[1]) + "))";
    }
    // ["Exp", x] = e^x (some CortexJS versions use this instead of Exp in UNARY_FN_MAP)
    if (head === "Exp" && args.length === 1) {
      return "exp(" + jsonToInfix(args[0]) + ")";
    }
    // ["Log", x, base] — two-argument log
    if (head === "Log" && args.length === 2) {
      return "(log(" + jsonToInfix(args[0]) + ") / log(" + jsonToInfix(args[1]) + "))";
    }
    // ["Half", x] = x/2  (CortexJS sometimes emits this)
    if (head === "Half" && args.length === 1) {
      return "(" + jsonToInfix(args[0]) + " / 2)";
    }
    // ────────────────────────────────────────────────────────────────

    // Unary math functions
    const fnName = UNARY_FN_MAP[head];
    if (fnName && args.length === 1) {
      return fnName + "(" + jsonToInfix(args[0]) + ")";
    }

    // Rational number: ["Rational", num, den]
    if (head === "Rational" && args.length === 2) {
      return "(" + jsonToInfix(args[0]) + " / " + jsonToInfix(args[1]) + ")";
    }

    // Fallback: treat as a function call — log the unknown head in dev builds
    if (typeof head === "string" && args.length > 0) {
      // Unknown CortexJS head: produce (0/0) which evaluates to NaN in both
      // JS and function-plot math. "NaN" (the JS identifier) is NOT recognised
      // by function-plot and throws "symbol 'NaN' is undefined".
      const knownHeadPattern = /^[A-Z][a-zA-Z]+$/;
      if (knownHeadPattern.test(head)) {
        return "(0/0)";
      }
      return head.toLowerCase() + "(" + args.map(jsonToInfix).join(", ") + ")";
    }
  }

  // Object form: { num: "..." } for large numbers or decimals
  if (typeof node === "object" && node !== null) {
    const obj = node as Record<string, unknown>;
    if ("num" in obj && typeof obj.num === "string") return obj.num;
  }

  return String(node);
}

/**
 * Convert a BoxedExpression to a renderer-compatible infix string.
 * The output is understood by function-plot (2D) and can be parsed for 3D.
 */
export function toFnString(expr: BoxedExpression): string {
  return jsonToInfix(expr.json);
}

// ── Compile to JS Function ──────────────────────────────────────────

/**
 * Compile a BoxedExpression into a callable JS function.
 *
 * Converts the expression to an infix string and builds a native JS function
 * via `new Function()`. This is reliable for multi-variable expressions (e.g.
 * f(x,y) for 3D surfaces) where CortexJS's own compile path has scope issues.
 *
 * @param expr - The parsed expression
 * @param vars - Variable names the function accepts (e.g. ["x"] or ["x","y","z"])
 * @returns A JS function that maps numeric variable values to a number
 */
export function compileToFunction(
  expr: BoxedExpression,
  vars: string[],
): (...args: number[]) => number {
  // Build JS function from infix string via Function constructor.
  // We intentionally skip CortexJS's native .compile() because its .evaluate()
  // only accepts a single-variable scope object — passing { x } leaves y/z
  // unresolved for multi-variable expressions, producing all-NaN surfaces.
  const fnStr = toFnString(expr);

  // Replace function-plot-style names with Math.* equivalents
  const jsStr = fnStr
    .replace(/\bsin\(/g, "Math.sin(")
    .replace(/\bcos\(/g, "Math.cos(")
    .replace(/\btan\(/g, "Math.tan(")
    .replace(/\bsqrt\(/g, "Math.sqrt(")
    .replace(/\blog\(/g, "Math.log(")
    .replace(/\bexp\(/g, "Math.exp(")
    .replace(/\babs\(/g, "Math.abs(")
    .replace(/\basin\(/g, "Math.asin(")
    .replace(/\bacos\(/g, "Math.acos(")
    .replace(/\batan\(/g, "Math.atan(")
    .replace(/\batan2\(/g, "Math.atan2(")
    .replace(/\bsinh\(/g, "Math.sinh(")
    .replace(/\bcosh\(/g, "Math.cosh(")
    .replace(/\btanh\(/g, "Math.tanh(")
    .replace(/\basin\(/g, "Math.asin(")
    .replace(/\bacos\(/g, "Math.acos(")
    .replace(/\batan\(/g, "Math.atan(")
    .replace(/\basinh\(/g, "Math.asinh(")
    .replace(/\bacosh\(/g, "Math.acosh(")
    .replace(/\batanh\(/g, "Math.atanh(")
    .replace(/\bfloor\(/g, "Math.floor(")
    .replace(/\bceil\(/g, "Math.ceil(")
    .replace(/\bround\(/g, "Math.round(")
    .replace(/\bsign\(/g, "Math.sign(")
    .replace(/\blog2\(/g, "Math.log2(")
    .replace(/\bpi\b/g, "Math.PI")
    .replace(/\^/g, "**");

  // ── Free-variable injection ────────────────────────────────────────
  // Any identifier remaining in jsStr that is NOT in `vars` and NOT a
  // Math.* property is an unbound parameter (e.g. c, r in a torus).
  // Inject `const name = value;` bindings so the function doesn't throw.
  // Values come from the CortexJS engine if previously @persist'd, else 1.
  const jsStrForAnalysis = jsStr.replace(/\bMath\.[a-zA-Z_][a-zA-Z0-9_]*/g, "__MATH__");
  const wordPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  const SKIP_IDENTIFIERS = new Set([
    ...vars,
    "__MATH__", "NaN", "Infinity", "undefined", "null", "true", "false",
  ]);
  const freeVars = new Set<string>();
  let wm: RegExpExecArray | null;
  while ((wm = wordPattern.exec(jsStrForAnalysis)) !== null) {
    if (!SKIP_IDENTIFIERS.has(wm[1])) freeVars.add(wm[1]);
  }

  let freeVarBindings = "";
  if (freeVars.size > 0) {
    const ce = getCE();
    const parts: string[] = [];
    for (const v of freeVars) {
      let defaultVal = 1;
      try {
        // .N() forces numeric evaluation, picking up ce.assign() values
        const assigned = ce.box(v).N();
        const nv = assigned.numericValue;
        if (typeof nv === "number" && isFinite(nv)) defaultVal = nv;
      } catch { /* use 1 */ }
      parts.push(`const ${v} = ${defaultVal};`);
    }
    freeVarBindings = parts.join(" ") + " ";
  }
  // ──────────────────────────────────────────────────────────────────

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(...vars, `"use strict"; ${freeVarBindings}return (${jsStr});`);
    return (...args: number[]): number => {
      try {
        const result = fn(...args) as number;
        return typeof result === "number" ? result : NaN;
      } catch {
        return NaN;
      }
    };
  } catch {
    return () => NaN;
  }
}

// ── Tuple Component Extraction ───────────────────────────────────────

/**
 * Extract N component BoxedExpressions from a CortexJS tuple/sequence.
 *
 * CortexJS represents `(\cos(t), \sin(t), t/3)` as one of:
 *   ["Sequence", a, b, c]
 *   ["List", a, b, c]
 *   ["Delimiter", ["Sequence", a, b, c], "(", ")"]
 *
 * Returns the first `n` components as BoxedExpressions, or null if the
 * expression doesn't have the expected structure.
 */
export function extractTupleComponents(
  expr: BoxedExpression,
  n: number,
): BoxedExpression[] | null {
  const ce = getCE();
  const json = expr.json;

  if (!Array.isArray(json)) return null;
  const [head, ...args] = json as [string, ...unknown[]];

  // ── Direct sequence/list ─────────────────────────────────────────
  // ["Sequence", a, b, c] or ["List", a, b, c]
  if ((head === "Sequence" || head === "List") && args.length >= n) {
    return args.slice(0, n).map((a) => ce.box(a as any));
  }

  // ── Delimited sequence ───────────────────────────────────────────
  // ["Delimiter", ["Sequence", a, b, c], "(", ")"]
  if (head === "Delimiter" && Array.isArray(args[0])) {
    const inner = args[0] as unknown[];
    const innerHead = inner[0];
    const innerArgs = inner.slice(1);
    if (
      (innerHead === "Sequence" || innerHead === "List") &&
      innerArgs.length >= n
    ) {
      return innerArgs.slice(0, n).map((a) => ce.box(a as any));
    }
    // ["Delimiter", inner, "(", ")"] where inner is a single non-sequence expr
    // (e.g. wrapping a "Divide" expression) — unwrap and recurse
    if (innerArgs.length === 1) {
      return extractTupleComponents(ce.box(innerArgs[0] as any), n);
    }
  }

  // ── Divided tuple ────────────────────────────────────────────────
  // Handles \frac{x(t), y(t), z(t)}{n} → LaTeX writes the whole tuple
  // divided by a scalar. CortexJS produces ["Divide", ["Sequence",...], n].
  // We extract the components and wrap each as (component / scalar).
  // NOTE: this divides ALL components by n. If you want only the last
  // component divided, use inline division: (\cos(t), \sin(t), t/3).
  if (head === "Divide" && args.length === 2 && Array.isArray(args[0])) {
    // CortexJS may wrap the numerator in a Delimiter: ["Delimiter", ["Sequence",...], "{", "}"]
    // Unwrap before checking for Sequence.
    let seqJson = args[0] as unknown[];
    if (seqJson[0] === "Delimiter" && Array.isArray(seqJson[1])) {
      seqJson = seqJson[1] as unknown[];
    }
    const seqHead = seqJson[0] as string;
    const seqArgs = seqJson.slice(1);
    if (
      (seqHead === "Sequence" || seqHead === "List") &&
      seqArgs.length >= n
    ) {
      const scalar = args[1];
      return seqArgs
        .slice(0, n)
        .map((a) => ce.box(["Divide", a, scalar] as any));
    }
  }

  // ── Multiply with sequence ───────────────────────────────────────
  // Some CortexJS versions emit ["Multiply", ["Sequence",...], 1/n]
  if (head === "Multiply" && args.length === 2) {
    for (let seqIdx = 0; seqIdx <= 1; seqIdx++) {
      let maybeSeq = args[seqIdx] as unknown[];
      const scalar = args[1 - seqIdx];
      if (!Array.isArray(maybeSeq)) continue;
      // Unwrap Delimiter wrapper if present
      if (maybeSeq[0] === "Delimiter" && Array.isArray(maybeSeq[1])) {
        maybeSeq = maybeSeq[1] as unknown[];
      }
      if (
        (maybeSeq[0] === "Sequence" || maybeSeq[0] === "List") &&
        maybeSeq.length - 1 >= n
      ) {
        return maybeSeq
          .slice(1, n + 1)
          .map((a) => ce.box(["Multiply", a, scalar] as any));
      }
    }
  }

  return null;
}

// ── MathJSON → Standard LaTeX ────────────────────────────────────────

/**
 * Convert a MathJSON node to standard mathematical LaTeX.
 *
 * Bypasses CortexJS's `.latex` property which outputs non-standard forms
 * like `\mathrm{Cube}(x)`, `\exponentialE`, `\exp(3t)`.
 */
export function jsonToLatex(node: unknown): string {
  // Number literal
  if (typeof node === "number") return formatLatexNum(node);

  // String symbol
  if (typeof node === "string") {
    switch (node) {
      case "Pi": return "\\pi";
      case "ExponentialE": case "E": return "e";
      case "ImaginaryUnit": return "i";
      case "Infinity": case "PositiveInfinity": return "\\infty";
      case "NegativeInfinity": return "-\\infty";
      case "Nothing": return "\\emptyset";
      case "alpha": return "\\alpha"; case "beta": return "\\beta";
      case "gamma": return "\\gamma"; case "delta": return "\\delta";
      case "epsilon": return "\\epsilon"; case "theta": return "\\theta";
      case "lambda": return "\\lambda"; case "mu": return "\\mu";
      case "sigma": return "\\sigma"; case "phi": return "\\phi";
      case "omega": return "\\omega";
      default: return node;
    }
  }

  // Object form: { num: "..." } for big numbers/decimals
  if (typeof node === "object" && node !== null && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    if ("num" in obj && typeof obj.num === "string") return obj.num;
    return String(node);
  }

  if (!Array.isArray(node)) return String(node);

  const [head, ...args] = node as [string, ...unknown[]];

  switch (head) {
    case "Add": {
      if (args.length === 0) return "0";
      let result = jsonToLatex(args[0]);
      for (let i = 1; i < args.length; i++) {
        const a = args[i];
        if (_isNeg(a)) {
          result += " - " + jsonToLatex(_negateNode(a));
        } else {
          result += " + " + jsonToLatex(a);
        }
      }
      return result;
    }

    case "Subtract":
      if (args.length === 1) return "-" + _wrapAdd(args[0]);
      if (args.length === 2) return jsonToLatex(args[0]) + " - " + _wrapAdd(args[1]);
      return args.map(jsonToLatex).join(" - ");

    case "Negate":
      if (args.length === 1) {
        if (Array.isArray(args[0]) && (args[0][0] === "Add" || args[0][0] === "Subtract"))
          return "-\\left(" + jsonToLatex(args[0]) + "\\right)";
        return "-" + jsonToLatex(args[0]);
      }
      return "-" + jsonToLatex(args[0]);

    case "Multiply": return _renderMul(args);

    case "Divide":
      if (args.length === 2)
        return "\\frac{" + jsonToLatex(args[0]) + "}{" + jsonToLatex(args[1]) + "}";
      return args.map(jsonToLatex).join(" / ");

    case "Rational":
      if (args.length === 2 && typeof args[0] === "number" && typeof args[1] === "number") {
        if (args[1] === 1) return formatLatexNum(args[0]);
        if (args[0] < 0) return "-\\frac{" + (-args[0]) + "}{" + args[1] + "}";
        return "\\frac{" + args[0] + "}{" + args[1] + "}";
      }
      return "\\frac{" + jsonToLatex(args[0]) + "}{" + jsonToLatex(args[1]) + "}";

    case "Power":
      if (args.length === 2) {
        const [base, exp] = args;
        // x^{1/2} → \sqrt{x}
        if (_isHalf(exp)) return "\\sqrt{" + jsonToLatex(base) + "}";
        // x^{1/n} → \sqrt[n]{x}
        const rd = _rationalDenom(exp);
        if (rd !== null && rd > 2)
          return "\\sqrt[" + rd + "]{" + jsonToLatex(base) + "}";
        // e^{...}
        if (base === "ExponentialE" || base === "E")
          return "e^{" + jsonToLatex(exp) + "}";
        return _wrapBase(base) + "^{" + jsonToLatex(exp) + "}";
      }
      return String(node);

    case "Square": return args.length === 1 ? _wrapBase(args[0]) + "^{2}" : String(node);
    case "Cube":   return args.length === 1 ? _wrapBase(args[0]) + "^{3}" : String(node);
    case "Sqrt":   return args.length === 1 ? "\\sqrt{" + jsonToLatex(args[0]) + "}" : String(node);
    case "Root":
      return args.length === 2
        ? "\\sqrt[" + jsonToLatex(args[1]) + "]{" + jsonToLatex(args[0]) + "}"
        : String(node);

    // Trig
    case "Sin": return "\\sin\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Cos": return "\\cos\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Tan": return "\\tan\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Cot": return "\\cot\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Sec": return "\\sec\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Csc": return "\\csc\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Arcsin": return "\\arcsin\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Arccos": return "\\arccos\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Arctan": case "ArcTan":
      return "\\arctan\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Sinh": return "\\sinh\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Cosh": return "\\cosh\\left(" + jsonToLatex(args[0]) + "\\right)";
    case "Tanh": return "\\tanh\\left(" + jsonToLatex(args[0]) + "\\right)";

    // Exp / Log
    case "Exp": return args.length === 1 ? "e^{" + jsonToLatex(args[0]) + "}" : String(node);
    case "Ln":  return args.length === 1 ? "\\ln\\left(" + jsonToLatex(args[0]) + "\\right)" : String(node);
    case "Log":
      if (args.length === 1) return "\\log\\left(" + jsonToLatex(args[0]) + "\\right)";
      if (args.length === 2) return "\\log_{" + jsonToLatex(args[1]) + "}\\left(" + jsonToLatex(args[0]) + "\\right)";
      return String(node);
    case "Log2": return args.length === 1 ? "\\log_{2}\\left(" + jsonToLatex(args[0]) + "\\right)" : String(node);

    // Misc
    case "Abs":     return args.length === 1 ? "\\left|" + jsonToLatex(args[0]) + "\\right|" : String(node);
    case "Half":    return args.length === 1 ? "\\frac{" + jsonToLatex(args[0]) + "}{2}" : String(node);
    case "Floor":   return args.length === 1 ? "\\lfloor " + jsonToLatex(args[0]) + "\\rfloor" : String(node);
    case "Ceiling": return args.length === 1 ? "\\lceil " + jsonToLatex(args[0]) + "\\rceil" : String(node);

    // Containers
    case "Sequence": case "List": return args.map(jsonToLatex).join(", ");
    case "Delimiter": return args.length >= 1 ? jsonToLatex(args[0]) : "";

    // Relations
    case "Equal": case "Assign": case "Equation":
      return args.map(jsonToLatex).join(" = ");

    // Matrix
    case "Matrix":
      return _renderMatrix(args);

    default:
      if (args.length > 0)
        return "\\operatorname{" + head + "}\\left(" + args.map(jsonToLatex).join(", ") + "\\right)";
      return head;
  }
}

// ── jsonToLatex helpers (private) ─────────────────────────────────────

function formatLatexNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toPrecision(10)).toString();
}

function _isNeg(node: unknown): boolean {
  if (typeof node === "number") return node < 0;
  if (Array.isArray(node) && node[0] === "Negate") return true;
  if (Array.isArray(node) && node[0] === "Multiply") {
    const first = node[1];
    if (first === -1 || (typeof first === "number" && first < 0)) return true;
  }
  return false;
}

function _negateNode(node: unknown): unknown {
  if (typeof node === "number") return -node;
  if (Array.isArray(node) && node[0] === "Negate") return node[1];
  if (Array.isArray(node) && node[0] === "Multiply") {
    if (node[1] === -1) return node.length === 3 ? node[2] : ["Multiply", ...node.slice(2)];
    if (typeof node[1] === "number" && node[1] < 0)
      return ["Multiply", -node[1], ...node.slice(2)];
  }
  return node;
}

/** Wrap Add/Subtract in parens (for subtraction RHS). */
function _wrapAdd(node: unknown): string {
  const s = jsonToLatex(node);
  if (Array.isArray(node) && (node[0] === "Add" || node[0] === "Subtract"))
    return "\\left(" + s + "\\right)";
  return s;
}

/** Wrap complex nodes in parens when used as a power base. */
function _wrapBase(node: unknown): string {
  const s = jsonToLatex(node);
  if (!Array.isArray(node)) return s;
  const h = node[0];
  if (h === "Add" || h === "Subtract" || h === "Negate" ||
      (h === "Multiply" && node.length > 2))
    return "\\left(" + s + "\\right)";
  return s;
}

function _isHalf(n: unknown): boolean {
  if (n === 0.5) return true;
  if (Array.isArray(n) && n[0] === "Rational" && n[1] === 1 && n[2] === 2) return true;
  if (Array.isArray(n) && n[0] === "Divide" && n[1] === 1 && n[2] === 2) return true;
  return false;
}

function _rationalDenom(n: unknown): number | null {
  if (Array.isArray(n) && n[0] === "Rational" && n[1] === 1 && typeof n[2] === "number")
    return n[2] as number;
  return null;
}

/** Render a Multiply node with smart implicit vs explicit multiplication. */
function _renderMul(args: unknown[]): string {
  if (args.length === 0) return "1";
  if (args.length === 1) return jsonToLatex(args[0]);

  let coeff: number | null = null;
  let rest = args;
  if (typeof args[0] === "number") {
    coeff = args[0] as number;
    rest = args.slice(1);
  }

  if (coeff === -1) {
    const inner = rest.length === 1 ? jsonToLatex(rest[0]) : _renderMulTerms(rest);
    return "-" + inner;
  }
  if (coeff === 1) {
    return rest.length === 1 ? jsonToLatex(rest[0]) : _renderMulTerms(rest);
  }

  if (rest.length === 0) return coeff !== null ? formatLatexNum(coeff) : "1";

  const restStr = _renderMulTerms(rest);
  if (coeff === null) return restStr;

  // Implicit multiplication for coeff·var/func (e.g. 3x, 2\sin(x))
  if (rest.length >= 1 && _isSimpleLatex(rest[0]))
    return formatLatexNum(coeff) + restStr;
  return formatLatexNum(coeff) + " \\cdot " + restStr;
}

function _renderMulTerms(terms: unknown[]): string {
  return terms.map(t => {
    const s = jsonToLatex(t);
    if (Array.isArray(t) && (t[0] === "Add" || t[0] === "Subtract"))
      return "\\left(" + s + "\\right)";
    return s;
  }).join("");
}

/** Check if node renders simply enough for implicit multiplication. */
function _isSimpleLatex(node: unknown): boolean {
  if (typeof node === "string") return true;
  if (!Array.isArray(node)) return false;
  const h = (node as unknown[])[0];
  return typeof h === "string" && [
    "Sin","Cos","Tan","Cot","Sec","Csc","Arcsin","Arccos","Arctan","ArcTan",
    "Sinh","Cosh","Tanh","Ln","Log","Exp","Sqrt","Root","Square","Cube","Power","Abs",
  ].includes(h);
}

function _renderMatrix(args: unknown[]): string {
  if (args.length !== 1 || !Array.isArray(args[0])) return String(args);
  const inner = args[0] as [string, ...unknown[]];
  if (inner[0] !== "List") return String(args);
  const rows = inner.slice(1);
  const rowStrs = rows.map(row => {
    if (Array.isArray(row) && row[0] === "List")
      return (row as unknown[]).slice(1).map(jsonToLatex).join(" & ");
    return jsonToLatex(row);
  });
  return "\\begin{pmatrix}" + rowStrs.join(" \\\\ ") + "\\end{pmatrix}";
}

// ── Expression Classification ───────────────────────────────────────

/** Standard coordinate/constant symbols that are NOT free parameters. */
const COORDINATE_VARS = new Set(["x", "y", "z", "t", "theta", "r"]);
const KNOWN_CONSTANTS = new Set([
  "Pi", "ExponentialE", "E", "pi", "e", "True", "False",
  "ImaginaryUnit", "i",
]);

/** Recursively collect all symbol names from a MathJSON tree. */
function collectSymbols(node: unknown, symbols: Set<string>): void {
  if (typeof node === "string") {
    if (!KNOWN_CONSTANTS.has(node)) {
      symbols.add(node);
    }
    return;
  }
  if (Array.isArray(node)) {
    const [, ...args] = node;
    for (const arg of args) {
      collectSymbols(arg, symbols);
    }
  }
}

/**
 * Detect all free variables in an expression — symbols that are not
 * standard coordinates (x, y, z, t) or known constants (pi, e).
 * These become slider parameters in the UI.
 */
export function detectFreeVars(expr: BoxedExpression): string[] {
  const symbols = new Set<string>();
  collectSymbols(expr.json, symbols);
  return Array.from(symbols).filter(
    (s) => !COORDINATE_VARS.has(s) && !KNOWN_CONSTANTS.has(s),
  );
}

/**
 * Detect if a LaTeX string contains an inequality operator.
 * Returns the operator and the cleaned parts, or null if not an inequality.
 */
export function detectInequality(latex: string): {
  operator: ">" | "<" | ">=" | "<=";
  lhs: string;
  rhs: string;
  variable: "y" | "x";
} | null {
  const clean = stripDelimiters(latex);

  // Order matters: check multi-char operators first
  const patterns: { re: RegExp; op: ">" | "<" | ">=" | "<=" }[] = [
    { re: /\\geq\b|\\ge\b/, op: ">=" },
    { re: /\\leq\b|\\le\b/, op: "<=" },
    { re: /\\gt\b/, op: ">" },
    { re: /\\lt\b/, op: "<" },
    { re: />=/, op: ">=" },
    { re: /<=/, op: "<=" },
  ];

  for (const { re, op } of patterns) {
    const match = clean.match(re);
    if (match && match.index !== undefined) {
      const lhs = clean.slice(0, match.index).trim();
      const rhs = clean.slice(match.index + match[0].length).trim();
      // Determine which variable is on the LHS
      const variable = /^x$/.test(lhs) ? "x" : "y";
      return { operator: op, lhs, rhs, variable };
    }
  }

  // Check bare > and < AFTER removing any LaTeX commands that use them
  // (like \langle \rangle). Must not be inside angle brackets.
  const noLatex = clean.replace(/\\[a-zA-Z]+/g, "");
  const gtIdx = noLatex.indexOf(">");
  if (gtIdx > 0 && noLatex[gtIdx - 1] !== "<") {
    const lhs = clean.slice(0, gtIdx).trim();
    const rhs = clean.slice(gtIdx + 1).trim();
    const variable = /^x$/.test(lhs) ? "x" : "y";
    return { operator: ">", lhs, rhs, variable };
  }
  const ltIdx = noLatex.indexOf("<");
  if (ltIdx > 0) {
    const lhs = clean.slice(0, ltIdx).trim();
    const rhs = clean.slice(ltIdx + 1).trim();
    const variable = /^x$/.test(lhs) ? "x" : "y";
    return { operator: "<", lhs, rhs, variable };
  }

  return null;
}

/**
 * Classify a LaTeX expression by its plotting type.
 *
 * Detection heuristics:
 * 0. If the expression contains an inequality → inequality_2d.
 * 1. If the expression contains `=`, split LHS/RHS and check variable sets.
 * 2. If it contains z or is mode-forced to 3D → 3D types.
 * 3. If it contains both x and y on the same side of `=` → implicit_2d.
 * 4. If it's `y = f(x)` or bare `f(x)` → explicit_2d.
 * 5. Parametric if (x(t), y(t)) tuple form is detected.
 */
export function classifyExpression(latex: string): ExprType {
  const clean = stripDelimiters(latex);

  // ── Vector detection ──────────────────────────────────────────────────
  // <a,b,c> or \langle a,b,c \rangle — MUST be before inequality check
  // because <1,2,3> contains < and > which would falsely trigger detectInequality.
  const vecClean = clean
    .replace(/\\langle/g, "<").replace(/\\rangle/g, ">")
    .replace(/\\left\s*</g, "<").replace(/\\right\s*>/g, ">")
    .trim();
  if (/^<[^<>]+,[^<>]+,[^<>]+>$/.test(vecClean)) return "vector_3d";

  // ── Point detection ───────────────────────────────────────────────────
  // (a,b) or (a,b,c) with NO coordinate variables → literal point, not parametric.
  // Must be before inequality (which checks for bare < >) and before the
  // bare-expression fallback that would classify (5,5) as explicit_2d.
  try {
    const testExpr = getCE().parse(clean);
    for (const n of [3, 2] as const) {
      const comps = extractTupleComponents(testExpr, n);
      if (comps && comps.length >= n) {
        const syms = new Set<string>();
        comps.forEach(c => collectSymbols(c.json, syms));
        const hasCoordVar = [...syms].some(s => COORDINATE_VARS.has(s));
        if (!hasCoordVar) return n === 3 ? "point_3d" : "point_2d";
      }
    }
  } catch { /* fall through to normal classification */ }

  // Check for inequality BEFORE equality (since >= contains =)
  if (detectInequality(clean)) return "inequality_2d";
  const ce = getCE();

  // Check for polar form: r = f(theta) or r = f(t)
  const polarMatch = clean.match(/^\\?r\s*=/);
  if (polarMatch) return "polar";

  // Check for equality: split on = that is not <= or >= or \neq
  const eqParts = splitOnEquals(clean);

  if (eqParts) {
    const [lhs, rhs] = eqParts;
    const lhsTrimmed = lhs.trim();
    const rhsTrimmed = rhs.trim();

    // ── String-level fast path ───────────────────────────────────────
    // Detect the most common forms by inspecting the raw LHS/RHS strings
    // directly. This bypasses CortexJS JSON representation quirks where
    // a single-symbol expression like "z" might not serialize as the plain
    // string "z" (causing collectSymbols to miss it and forcing a wrong
    // implicit_3d classification).
    //
    // Rules:
    //   z = f(x,y)  or  f(x,y) = z  →  explicit_3d
    //   y = f(x)    or  f(x) = y    →  explicit_2d
    //   x = f(y)                    →  explicit_2d
    //   r = f(theta)                →  polar (already handled above)

    if (/^z$/.test(lhsTrimmed) || /^z$/.test(rhsTrimmed)) return "explicit_3d";
    if (/^y$/.test(lhsTrimmed) || /^y$/.test(rhsTrimmed)) return "explicit_2d";
    if (/^x$/.test(lhsTrimmed)) return "explicit_2d";

    // ── Symbol-level analysis for compound LHS expressions ──────────
    // Handles cases like "x^2 + z = y^2 + 1" (implicit_3d) where the
    // string-level check doesn't apply.
    const lhsExpr = ce.parse(lhsTrimmed);
    const rhsExpr = ce.parse(rhsTrimmed);

    const lhsSyms = new Set<string>();
    const rhsSyms = new Set<string>();
    collectSymbols(lhsExpr.json, lhsSyms);
    collectSymbols(rhsExpr.json, rhsSyms);
    const allSyms = new Set([...lhsSyms, ...rhsSyms]);

    const hasX = allSyms.has("x");
    const hasY = allSyms.has("y");
    const hasZ = allSyms.has("z");
    const hasT = allSyms.has("t") || allSyms.has("theta");

    // 3D cases
    if (hasZ && (hasX || hasY)) {
      return "implicit_3d"; // compound LHS/RHS — neither side is just "z"
    }

    // Parametric 2D: t is the only coordinate variable
    if (hasT && !hasX && !hasY && !hasZ) {
      return "parametric_2d";
    }

    // 2D cases
    if (hasX && hasY) {
      return "implicit_2d"; // compound — neither side is just "y" or "x"
    }

    // Single variable equations: treat as explicit_2d if x present
    if (hasX) return "explicit_2d";
    if (hasY) return "explicit_2d";
  }

  // No equals sign — bare expression, analyze variables
  const expr = ce.parse(clean);
  const syms = new Set<string>();
  collectSymbols(expr.json, syms);

  const hasX = syms.has("x");
  const hasY = syms.has("y");
  const hasZ = syms.has("z");
  const hasT = syms.has("t") || syms.has("theta");

  if (hasZ || (hasX && hasY)) return "explicit_3d";
  if (hasT && !hasX && !hasY) return "parametric_2d";
  return "explicit_2d"; // Default: treat as y = f(x)
}

/** Check if a set of symbols is exactly {"z"} (or another single var) → simple LHS. */
function isSimpleLHS(syms: Set<string>, target: string): boolean {
  return syms.size === 1 && syms.has(target);
}

/**
 * Split a LaTeX string on the first top-level `=` sign.
 * Returns null if no `=` is found. Skips `\leq`, `\geq`, `\neq`, `\equiv`.
 */
function splitOnEquals(latex: string): [string, string] | null {
  // Remove relational commands that contain = but aren't equality
  const cleaned = latex
    .replace(/\\leq/g, "##LEQ##")
    .replace(/\\geq/g, "##GEQ##")
    .replace(/\\neq/g, "##NEQ##")
    .replace(/\\equiv/g, "##EQUIV##");

  const idx = cleaned.indexOf("=");
  if (idx === -1) return null;

  // Map index back to original string (same positions since replacements are same length... not exactly)
  // Simpler approach: find = in the original string that isn't part of \leq, \geq, \neq, \equiv
  for (let i = 0; i < latex.length; i++) {
    if (latex[i] === "=") {
      // Check it's not preceded by \leq, \geq, \neq
      const before = latex.slice(Math.max(0, i - 5), i);
      if (before.endsWith("\\leq") || before.endsWith("\\geq") || before.endsWith("\\neq")) {
        continue;
      }
      // Check it's not part of \equiv (= follows \equiv)
      if (before.endsWith("\\equiv")) continue;

      return [latex.slice(0, i).trim(), latex.slice(i + 1).trim()];
    }
  }

  return null;
}
