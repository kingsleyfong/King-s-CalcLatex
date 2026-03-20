/**
 * King's CalcLatex v2 — Shared Type Definitions
 *
 * This file is the single source of truth for all type contracts
 * between the engine, renderer, editor, and view modules.
 */

// ══════════════════════════════════════════════════════════════
//  TRIGGER SYSTEM
// ══════════════════════════════════════════════════════════════

export type TriggerKind = "evaluate" | "plot" | "persist" | "convert";

export interface TriggerMatch {
  kind: TriggerKind;
  /** The LaTeX expression (without the trigger suffix) */
  latex: string;
  /** Evaluation/plot mode (exact, approximate, simplify, plot2d, plot3d, etc.) */
  mode: string;
  /** Absolute document position of the trigger keyword */
  from: number;
  to: number;
  /** If inside $...$ or $$...$$, the full range of the math delimiters */
  mathRange: { from: number; to: number } | null;
}

// ══════════════════════════════════════════════════════════════
//  RESULT TYPES (Discriminated Union — engine NEVER throws)
// ══════════════════════════════════════════════════════════════

export interface Diagnostic {
  level: "info" | "warning" | "error";
  message: string;
}

export type Result<T> =
  | { ok: true; value: T; diagnostics: Diagnostic[] }
  | { ok: false; error: string; diagnostics: Diagnostic[] };

/** Helper to create success results */
export function ok<T>(value: T, diagnostics: Diagnostic[] = []): Result<T> {
  return { ok: true, value, diagnostics };
}

/** Helper to create error results */
export function err<T>(error: string, diagnostics: Diagnostic[] = []): Result<T> {
  return { ok: false, error, diagnostics };
}

// ══════════════════════════════════════════════════════════════
//  ENGINE TYPES
// ══════════════════════════════════════════════════════════════

export type EvalMode = "exact" | "approximate" | "simplify" | "solve" | "factor"
  | "differentiate" | "integrate"
  | "partial_x" | "partial_y" | "partial_z"
  | "gradient" | "normal"
  | "limit" | "taylor" | "partfrac" | "expand";
export type PlotMode = "plot2d" | "plot3d" | "geometry"
  | "contour" | "vecfield" | "gradient" | "tangent" | "region";

export interface EvalResult {
  /** LaTeX-formatted result (for display) */
  latex: string;
  /** Plain text result (for clipboard/fallback) */
  text: string;
}

export type ExprType =
  | "explicit_2d"    // y = f(x) or bare expression treated as f(x)
  | "implicit_2d"    // f(x,y) = g(x,y) → rendered via interval arithmetic
  | "parametric_2d"  // (x(t), y(t))
  | "polar"          // r = f(θ)
  | "inequality_2d"  // y > f(x), y < f(x), y >= f(x), y <= f(x)
  | "explicit_3d"    // z = f(x,y) or bare expression treated as f(x,y)
  | "implicit_3d"    // f(x,y,z) = g(x,y,z) → rendered via marching cubes / raycasting
  | "parametric_3d"  // (x(t), y(t), z(t))
  | "vector_3d"      // literal vector like <1, 2, 3>
  | "point_2d"       // literal numeric 2D point (5, 5) — rendered as filled dot
  | "point_3d"       // literal numeric 3D point (1, 2, 3) — rendered as sphere
  | "contour_2d"     // z=f(x,y) rendered as iso-level curves in 2D
  | "vector_field_2d"  // (P(x,y), Q(x,y)) rendered as arrow grid in 2D
  | "vector_field_3d"  // (P,Q,R)(x,y,z) rendered as 3D arrow grid
  | "region_2d";     // area between curves shaded in 2D

/**
 * A single plottable expression, prepared by the engine for the renderer.
 */
export interface PlotData {
  /** Original LaTeX string */
  latex: string;
  /** How the expression was classified */
  type: ExprType;
  /**
   * Expression string(s) in renderer-compatible format.
   * - explicit_2d: ["x^2 + 1"] (function-plot evaluable string)
   * - implicit_2d: ["x^2 + y^2 - 25"] (function-plot implicit)
   * - parametric_2d: ["cos(t)", "sin(t)"] (x(t), y(t))
   * - explicit_3d: ["sin(x) * cos(y)"] (for Three.js evaluation)
   * - parametric_3d: ["cos(t)", "sin(t)", "t"] (x(t), y(t), z(t))
   */
  fnStrings: string[];
  /**
   * Compiled JS evaluator functions for numeric evaluation.
   * - explicit_2d: [(x: number) => number]
   * - implicit_2d: [(x: number, y: number) => number]
   * - explicit_3d: [(x: number, y: number) => number]
   * - implicit_3d: [(x: number, y: number, z: number) => number]
   */
  compiledFns: ((...args: number[]) => number)[];
  /** For inequality_2d: the relational operator and which variable is on the LHS */
  inequality?: {
    operator: ">" | "<" | ">=" | "<=";
    variable: "y" | "x";
  };
  /** When a 2D expression is promoted to 3D, track the original type */
  originalType?: ExprType;
}

/**
 * Complete specification for rendering a graph.
 * Produced by the engine, consumed by the renderer.
 */
export interface PlotSpec {
  /** One or more plottable expressions (multi-equation overlay) */
  data: PlotData[];
  /** Free variables detected (excluding coordinate vars x, y, z, t) — for parameter sliders */
  freeVars: string[];
  /** Axis ranges (auto-computed or from settings) */
  ranges: AxisRanges;
  /** Optional arrow scale factor for vector fields (default 1.0) */
  arrowScale?: number;
}

export interface AxisRanges {
  x: [number, number];
  y: [number, number];
  z?: [number, number];
  t?: [number, number];
}

// ══════════════════════════════════════════════════════════════
//  RENDERER TYPES
// ══════════════════════════════════════════════════════════════

/**
 * Handle returned by renderer.create*Graph().
 * The caller uses this to update or destroy the graph.
 */
export interface GraphHandle {
  /** Re-render with a new spec (e.g., expression changed) */
  update(spec: PlotSpec): void;
  /** Destroy the graph and free all resources (WebGL, DOM, etc.) */
  destroy(): void;
  /** Resize to container dimensions (3D only) */
  resize?(width: number, height: number): void;
}

// ══════════════════════════════════════════════════════════════
//  INSPECTOR STATE
// ══════════════════════════════════════════════════════════════

export interface InspectorState {
  title: string;
  summary: string;
  diagnostics: string[];
  latex?: string;
  mode?: string;
  spec?: PlotSpec;
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════

export interface KCLSettings {
  /** Default x/y range for 2D graphs */
  default2dRange: [number, number];
  /** Default x/y/z range for 3D graphs */
  default3dRange: [number, number];
  /** Decimal places for approximate mode */
  numericPrecision: number;
  /** Auto-determine graph viewport from expression analysis */
  autoRange: boolean;
  /** Graph color theme */
  graphTheme: "auto" | "light" | "dark";
  /** 3D zoom behavior: "origin" keeps axes at 0,0,0; "range-center" zooms around range midpoint */
  zoom3dMode: "origin" | "range-center";
  /** How 2D curves render on @plot3d: "curtain" extrudes as wall, "plane-curve" draws at z=0 */
  plot3d2dMode: "curtain" | "plane-curve";
  /** Show points of interest (roots, extrema, intersections) on 2D graphs */
  showPOIs: boolean;
  /** Default arrow scale for vector fields (1.0 = normal) */
  vecfieldArrowScale: number;
  /** Show tick marks and numeric labels along the 3D axes */
  show3DAxisTicks: boolean;
  /** Enable Giac WASM CAS engine (requires giacwasm.js in plugin folder) */
  enableGiac: boolean;
}

export const DEFAULT_SETTINGS: KCLSettings = {
  default2dRange: [-10, 10],
  default3dRange: [-5, 5],
  numericPrecision: 12,
  autoRange: true,
  graphTheme: "auto",
  zoom3dMode: "origin",
  plot3d2dMode: "curtain",
  showPOIs: true,
  vecfieldArrowScale: 1.0,
  show3DAxisTicks: true,
  enableGiac: true,
};
