/**
 * King's CalcLatex v2 — Higher-Level CAS Operations
 *
 * Provides symbolic differentiation, integration, and equation solving
 * via CortexJS Compute Engine. Returns clear error messages when an
 * operation exceeds CortexJS's capabilities (placeholder for future
 * Giac WASM integration).
 */

import { parseLatex, getCE, detectFreeVars, toFnString } from "./parser";
import type { EvalResult, Result, Diagnostic } from "../types";
import { ok, err } from "../types";

/**
 * Extract a LaTeX string from a BoxedExpression.
 */
function exprToLatex(expr: { latex?: string }): string {
  try {
    if (typeof expr.latex === "string" && expr.latex.length > 0) return expr.latex;
  } catch {
    // fall through
  }
  return String(expr);
}

/**
 * Build an EvalResult from a BoxedExpression-like object.
 */
function toEvalResult(expr: { latex?: string }): EvalResult {
  const latex = exprToLatex(expr);
  return { latex, text: String(expr) };
}

/**
 * Detect the target variable for a calculus operation.
 * If `variable` is provided, uses that. Otherwise guesses from the
 * expression's free variables (prefers x, then t, then first available).
 */
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
  } catch {
    // fall through
  }

  return "x"; // default
}

/**
 * Symbolic differentiation: d/d(var) of expression.
 *
 * Uses CortexJS `["D", expr, var]` construct. If CortexJS cannot
 * evaluate the derivative, returns an informative error.
 *
 * @param latex - LaTeX expression to differentiate
 * @param variable - Variable to differentiate with respect to (auto-detected if omitted)
 */
export function differentiate(
  latex: string,
  variable?: string,
): Result<EvalResult> {
  const diagnostics: Diagnostic[] = [];
  const ce = getCE();
  const v = resolveVariable(latex, variable);

  try {
    const expr = parseLatex(latex);

    if (expr.isValid === false) {
      return err("Failed to parse expression for differentiation", diagnostics);
    }

    // CortexJS differentiation: D(expr, var)
    const diffExpr = ce.box(["D", expr.json, v]);
    const result = diffExpr.evaluate();

    // Check if CortexJS actually computed the derivative
    const resultStr = String(result);
    if (resultStr.includes("[\"D\"") || resultStr === "D") {
      diagnostics.push({
        level: "info",
        message: `CortexJS cannot symbolically differentiate this expression with respect to ${v}. Giac WASM support is planned for a future release.`,
      });
      return err(
        `Symbolic differentiation not supported for this expression. Try a simpler form.`,
        diagnostics,
      );
    }

    diagnostics.push({
      level: "info",
      message: `Differentiated with respect to ${v}`,
    });

    return ok(toEvalResult(result), diagnostics);
  } catch (e) {
    return err(
      `Differentiation failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}

/**
 * Symbolic integration: integral of expression d(var).
 *
 * Uses CortexJS `["Integrate", expr, var]` construct. CortexJS has
 * limited integration support, so many expressions will fall back to
 * an error with a message about future Giac WASM support.
 *
 * @param latex - LaTeX expression to integrate
 * @param variable - Variable of integration (auto-detected if omitted)
 */
export function integrate(
  latex: string,
  variable?: string,
): Result<EvalResult> {
  const diagnostics: Diagnostic[] = [];
  const ce = getCE();
  const v = resolveVariable(latex, variable);

  try {
    const expr = parseLatex(latex);

    if (expr.isValid === false) {
      return err("Failed to parse expression for integration", diagnostics);
    }

    // CortexJS integration: Integrate(expr, var)
    const intExpr = ce.box(["Integrate", expr.json, v]);
    const result = intExpr.evaluate();

    // Check if CortexJS actually computed the integral
    const resultStr = String(result);
    if (resultStr.includes("Integrate") || resultStr === "Integrate") {
      diagnostics.push({
        level: "info",
        message: `CortexJS cannot symbolically integrate this expression with respect to ${v}. Giac WASM support is planned for a future release.`,
      });
      return err(
        `Symbolic integration not supported for this expression. Try a simpler form, or wait for Giac WASM integration.`,
        diagnostics,
      );
    }

    diagnostics.push({
      level: "info",
      message: `Integrated with respect to ${v}`,
    });

    return ok(toEvalResult(result), diagnostics);
  } catch (e) {
    return err(
      `Integration failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}

/**
 * Solve an equation for the target variable.
 *
 * If the LaTeX contains `=`, it is treated as an equation. Otherwise
 * the expression is set equal to zero: `expr = 0`.
 *
 * @param latex - LaTeX equation or expression to solve
 */
export function solveEquation(latex: string): Result<EvalResult> {
  const diagnostics: Diagnostic[] = [];
  const ce = getCE();

  try {
    const expr = parseLatex(latex);

    if (expr.isValid === false) {
      return err("Failed to parse expression for solving", diagnostics);
    }

    // Determine what to solve and for which variable
    const json = expr.json;
    let solveTarget = expr.json;
    let variable = "x";

    // If expression is an equation, extract LHS - RHS
    if (Array.isArray(json) && json[0] === "Equal" && json.length === 3) {
      solveTarget = ["Subtract", json[1], json[2]];
    }

    // Find the primary variable
    const targetExpr = ce.box(solveTarget);
    const freeVars = targetExpr.freeVariables;
    if (freeVars && freeVars.length > 0) {
      if (freeVars.includes("x")) variable = "x";
      else if (freeVars.includes("y")) variable = "y";
      else variable = freeVars[0];
    }

    // Attempt to solve via CortexJS
    const solveExpr = ce.box(["Solve", solveTarget, variable]);
    const result = solveExpr.evaluate();

    // Check if CortexJS actually solved it
    const resultStr = String(result);
    if (
      resultStr.includes("Solve") ||
      resultStr === "Nothing" ||
      resultStr === "EmptySet"
    ) {
      diagnostics.push({
        level: "info",
        message: `CortexJS could not solve for ${variable}. Giac WASM support is planned for a future release.`,
      });
      return err(
        `Cannot solve this equation for ${variable}. The expression may be too complex for the current CAS engine.`,
        diagnostics,
      );
    }

    diagnostics.push({
      level: "info",
      message: `Solved for ${variable}`,
    });

    return ok(toEvalResult(result), diagnostics);
  } catch (e) {
    return err(
      `Solve failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}

/**
 * Partial derivative: ∂f/∂(variable).
 *
 * Unlike `differentiate()` which auto-detects the variable, this always
 * differentiates with respect to the specified coordinate variable.
 * Useful for multivariable calculus: ∂f/∂x, ∂f/∂y, ∂f/∂z.
 */
export function partialDerivative(
  latex: string,
  variable: string,
): Result<EvalResult> {
  const diagnostics: Diagnostic[] = [];
  const ce = getCE();

  try {
    const expr = parseLatex(latex);

    if (expr.isValid === false) {
      return err("Failed to parse expression for partial derivative", diagnostics);
    }

    // If it's an equation like z = f(x,y), differentiate the RHS
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
      return err(
        `Cannot compute ∂/∂${variable} symbolically for this expression.`,
        diagnostics,
      );
    }

    diagnostics.push({
      level: "info",
      message: `Computed ∂/∂${variable}`,
    });

    return ok(toEvalResult(result), diagnostics);
  } catch (e) {
    return err(
      `Partial derivative failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}

/**
 * Gradient vector: ∇f = (∂f/∂x, ∂f/∂y) or (∂f/∂x, ∂f/∂y, ∂f/∂z).
 *
 * Auto-detects dimensionality from the variables present in the expression.
 * Returns the result as a LaTeX vector (parenthesized tuple).
 */
export function computeGradient(latex: string): Result<EvalResult> {
  const diagnostics: Diagnostic[] = [];
  const ce = getCE();

  try {
    const expr = parseLatex(latex);

    if (expr.isValid === false) {
      return err("Failed to parse expression for gradient", diagnostics);
    }

    // If it's an equation, differentiate the RHS
    const json = expr.json;
    let targetJson = expr.json;
    if (
      Array.isArray(json) &&
      (json[0] === "Equal" || json[0] === "Assign" || json[0] === "Equation") &&
      json.length === 3
    ) {
      targetJson = json[2];
    }

    // Detect which coordinate variables are present
    const targetExpr = ce.box(targetJson);
    const freeVars = targetExpr.freeVariables || [];
    const hasX = freeVars.includes("x");
    const hasY = freeVars.includes("y");
    const hasZ = freeVars.includes("z");

    const vars: string[] = [];
    if (hasX) vars.push("x");
    if (hasY) vars.push("y");
    if (hasZ) vars.push("z");

    // Fall back to (x, y) if no coordinate vars detected
    if (vars.length === 0) vars.push("x", "y");

    const components: string[] = [];
    const textComponents: string[] = [];

    for (const v of vars) {
      const diffExpr = ce.box(["D", targetJson, v]);
      const result = diffExpr.evaluate();
      const resultStr = String(result);

      if (resultStr.includes("[\"D\"") || resultStr === "D") {
        return err(
          `Cannot compute ∂/∂${v} symbolically for gradient. Try a simpler expression.`,
          diagnostics,
        );
      }

      components.push(exprToLatex(result));
      textComponents.push(resultStr);
    }

    const resultLatex = `\\nabla f = \\left(${components.join(",\\, ")}\\right)`;
    const resultText = `∇f = (${textComponents.join(", ")})`;

    diagnostics.push({
      level: "info",
      message: `Computed gradient in ${vars.length}D: variables (${vars.join(", ")})`,
    });

    return ok({ latex: resultLatex, text: resultText }, diagnostics);
  } catch (e) {
    return err(
      `Gradient failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}

/**
 * Surface normal vector.
 *
 * For an implicit surface F(x,y,z) = 0: normal = ∇F = (∂F/∂x, ∂F/∂y, ∂F/∂z).
 * For an explicit surface z = f(x,y): rewrite as F = f(x,y) - z, so
 *   normal = (∂f/∂x, ∂f/∂y, -1).
 *
 * Returns the symbolic normal vector (not normalized).
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

    // Check if it's an equation
    if (
      Array.isArray(json) &&
      (json[0] === "Equal" || json[0] === "Assign" || json[0] === "Equation") &&
      json.length === 3
    ) {
      const lhsStr = String(ce.box(json[1]));
      const rhsStr = String(ce.box(json[2]));

      // z = f(x,y) → explicit surface, normal = (∂f/∂x, ∂f/∂y, -1)
      if (lhsStr === "z") {
        targetJson = json[2];
        isImplicit = false;
      } else if (rhsStr === "z") {
        targetJson = json[1];
        isImplicit = false;
      } else {
        // F(x,y,z) = G(x,y,z) → implicit: normal = ∇(F - G)
        targetJson = ["Subtract", json[1], json[2]];
        isImplicit = true;
      }
    } else {
      // Bare expression: check if z is present
      const freeVars = expr.freeVariables || [];
      if (freeVars.includes("z")) {
        // Treat as implicit F(x,y,z) = 0
        targetJson = json;
        isImplicit = true;
      } else {
        // Treat as explicit f(x,y), normal = (∂f/∂x, ∂f/∂y, -1)
        targetJson = json;
        isImplicit = false;
      }
    }

    if (isImplicit) {
      // Implicit surface: normal = (∂F/∂x, ∂F/∂y, ∂F/∂z)
      const vars = ["x", "y", "z"];
      const components: string[] = [];
      const textComponents: string[] = [];

      for (const v of vars) {
        const diffExpr = ce.box(["D", targetJson, v]);
        const result = diffExpr.evaluate();
        const resultStr = String(result);

        if (resultStr.includes("[\"D\"") || resultStr === "D") {
          return err(
            `Cannot compute ∂F/∂${v} symbolically for normal vector.`,
            diagnostics,
          );
        }

        components.push(exprToLatex(result));
        textComponents.push(resultStr);
      }

      const resultLatex = `\\vec{n} = \\left(${components.join(",\\, ")}\\right)`;
      const resultText = `n = (${textComponents.join(", ")})`;

      diagnostics.push({
        level: "info",
        message: "Computed normal vector for implicit surface F(x,y,z) = 0",
      });

      return ok({ latex: resultLatex, text: resultText }, diagnostics);
    } else {
      // Explicit surface z = f(x,y): normal = (∂f/∂x, ∂f/∂y, -1)
      const dxExpr = ce.box(["D", targetJson, "x"]).evaluate();
      const dyExpr = ce.box(["D", targetJson, "y"]).evaluate();

      const dxStr = String(dxExpr);
      const dyStr = String(dyExpr);

      if (dxStr.includes("[\"D\"") || dyStr.includes("[\"D\"")) {
        return err(
          "Cannot compute partial derivatives symbolically for normal vector.",
          diagnostics,
        );
      }

      const dxLatex = exprToLatex(dxExpr);
      const dyLatex = exprToLatex(dyExpr);

      const resultLatex = `\\vec{n} = \\left(${dxLatex},\\, ${dyLatex},\\, -1\\right)`;
      const resultText = `n = (${dxStr}, ${dyStr}, -1)`;

      diagnostics.push({
        level: "info",
        message: "Computed normal vector for explicit surface z = f(x,y): (∂f/∂x, ∂f/∂y, -1)",
      });

      return ok({ latex: resultLatex, text: resultText }, diagnostics);
    }
  } catch (e) {
    return err(
      `Normal vector failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    );
  }
}
