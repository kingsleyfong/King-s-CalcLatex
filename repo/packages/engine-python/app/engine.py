"""Kings CalcLatex Engine — core math engine.

Handles LaTeX parsing, symbolic evaluation, plotting, persistence, and unit conversion.
"""

from __future__ import annotations

import math
import re
import sys
import typing
from typing import Dict, List, Optional, Tuple

import numpy as np
import plotly.graph_objects as go
import sympy as sp

# Python 3.13 compatibility: typing.io was removed
typing.io = typing  # type: ignore
sys.modules["typing.io"] = typing

try:
    from latex2sympy2 import latex2sympy
except Exception:
    latex2sympy = None

from .models import (
    ConvertRequest,
    ConvertResponse,
    Diagnostic,
    EvaluateResponse,
    PersistResponse,
    PlotRange,
    PlotResponse,
)


# ── Global State ──────────────────────────────────────────────────

_SYMBOLS: Dict[str, sp.Expr] = {}

LATEX_NAME_MAP = {
    r"\sin": "sin", r"\cos": "cos", r"\tan": "tan",
    r"\log": "log", r"\ln": "log", r"\exp": "exp",
    r"\pi": "pi", r"\arcsin": "asin", r"\arccos": "acos",
    r"\arctan": "atan", r"\sec": "sec", r"\csc": "csc",
    r"\cot": "cot", r"\sinh": "sinh", r"\cosh": "cosh",
    r"\tanh": "tanh",
}


# ══════════════════════════════════════════════════════════════════
#  PARSING
# ══════════════════════════════════════════════════════════════════

def parse_latex(raw: str, params: Optional[Dict[str, float]] = None) -> sp.Expr:
    """Parse a LaTeX string into a SymPy expression with delimiter stripping."""
    candidate = raw.strip()
    # Strip delimiters: $$, $, \(, \[, \), \]
    candidate = re.sub(r"^\$\$?|^\\\(|^\\\[", "", candidate)
    candidate = re.sub(r"\$\$?|\\\)|\\\]$", "", candidate)
    candidate = candidate.strip()

    if not candidate:
        return sp.Integer(0)

    # Special handling for @CROSS@ (cross product)
    # Check preprocessed version for @CROSS@ to catch \times placeholders
    processed = _preprocess_latex(candidate)
    if "@CROSS@" in processed:
        parts = processed.split("@CROSS@")
        if len(parts) == 2:
            left = parse_latex(parts[0], params)
            right = parse_latex(parts[1], params)
            if hasattr(left, "cross"):
                return left.cross(right)
            return left * right

    expr = _try_latex2sympy(candidate, params)
    if expr is not None:
        return expr
    return _fallback_parse(candidate, params)


def _try_latex2sympy(raw: str, params: Optional[Dict[str, float]] = None) -> Optional[sp.Expr]:
    if latex2sympy is None:
        return None
    candidate = raw.strip()
    if not candidate:
        return None
    # Only use latex2sympy when there are LaTeX commands
    if "\\" not in candidate and ("{" not in candidate or "}" not in candidate):
        return None
    try:
        parsed = latex2sympy(candidate)
        if isinstance(parsed, list):
            if len(parsed) == 1:
                parsed = parsed[0]
            else:
                return None
        # Substitute persisted variables
        subs = {sp.Symbol(k): v for k, v in _SYMBOLS.items()}
        if params:
            subs.update({sp.Symbol(k): v for k, v in params.items()})
        if subs and hasattr(parsed, "subs"):
            parsed = parsed.subs(subs)
        return parsed
    except Exception:
        return None


def _fallback_parse(raw: str, params: Optional[Dict[str, float]] = None) -> sp.Expr:
    text = _preprocess_latex(raw)
    local_ns = {name: sp.Symbol(name) for name in re.findall(r"[A-Za-z_]\w*", text)}
    local_ns.update(_SYMBOLS)
    if params:
        local_ns.update(params)
    local_ns.update({
        "sin": sp.sin, "cos": sp.cos, "tan": sp.tan,
        "log": sp.log, "exp": sp.exp, "sqrt": sp.sqrt,
        "pi": sp.pi, "asin": sp.asin, "acos": sp.acos,
        "atan": sp.atan, "sec": sp.sec, "csc": sp.csc,
        "cot": sp.cot, "sinh": sp.sinh, "cosh": sp.cosh,
        "tanh": sp.tanh, "abs": sp.Abs, "e": sp.E,
        "Matrix": sp.Matrix,
    })
    return sp.sympify(text, locals=local_ns)


def _preprocess_latex(raw: str) -> str:
    text = raw.strip()
    for latex_cmd, plain in LATEX_NAME_MAP.items():
        text = text.replace(latex_cmd, plain)
    
    text = text.replace(r"\left", "").replace(r"\right", "")
    
    # Replace \frac{a}{b} → (a)/(b)
    frac_re = re.compile(r"\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}")
    while frac_re.search(text):
        text = frac_re.sub(r"(\1)/(\2)", text)
    # Replace \sqrt{a} → sqrt(a)
    sqrt_re = re.compile(r"\\sqrt\s*\{([^{}]+)\}")
    while sqrt_re.search(text):
        text = sqrt_re.sub(r"sqrt(\1)", text)
        
    # Standard multiplication
    text = text.replace(r"\cdot", "*")
    
    # If we see \times, it might be a cross product. 
    # We'll use a placeholder and then fix it in parse_latex
    text = text.replace(r"\times", "@CROSS@")
    
    # Matrix environments to SymPy Matrix notation
    # \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix} -> Matrix([[1, 2], [3, 4]])
    def _matrix_sub(m):
        content = m.group(1).strip()
        rows = content.split(r"\\")
        formatted_rows = []
        for r in rows:
            if not r.strip(): continue
            cols = [c.strip() for c in r.split("&")]
            formatted_rows.append("[" + ",".join(cols) + "]")
        return f"Matrix([{','.join(formatted_rows)}])"

    text = re.sub(r"\\begin\{[pa]?matrix\}(.*?)\\end\{[pa]?matrix\}", _matrix_sub, text, flags=re.DOTALL)
    
    # Vector notation <1, 2, 3> -> Matrix([[1], [2], [3]])
    text = re.sub(r"<(.*?)>", lambda m: f"Matrix([[{m.group(1).replace(',', '],[')}]])", text)

    text = text.replace("^", "**")
    text = text.replace("{", "(").replace("}", ")")
        
    # Insert implicit multiplication for variables/numbers
    # (But avoid breaking Matrix([...]) notation)
    text = re.sub(r"(\d)([A-Za-z(])", r"\1*\2", text)
    text = re.sub(r"(\))([A-Za-z(\d])", r"\1*\2", text)
    
    return text


# ══════════════════════════════════════════════════════════════════
#  EVALUATION
# ══════════════════════════════════════════════════════════════════

def evaluate(latex: str, mode: str) -> EvaluateResponse:
    diags = [Diagnostic("info", "Evaluated by Kings CalcLatex engine.")]
    try:
        expr = parse_latex(latex)
        if hasattr(expr, "doit"):
            expr = expr.doit()

        if mode == "approximate":
            result = sp.N(expr, 12)
        elif mode == "simplify":
            result = sp.simplify(expr)
        elif mode == "solve":
            # Try to detect the variable and solve
            free = list(expr.free_symbols)
            var = free[0] if free else sp.Symbol("x")
            solutions = sp.solve(expr, var)
            result_text = ", ".join(f"{var} = {s}" for s in solutions)
            return EvaluateResponse(
                ok=True,
                result_latex=sp.latex(solutions) if solutions else "\\text{No solution}",
                result_text=result_text or "No solution",
                diagnostics=diags,
            )
        elif mode == "factor":
            result = sp.factor(expr)
        else:  # exact
            result = sp.simplify(expr)

        return EvaluateResponse(
            ok=True,
            result_latex=sp.latex(result),
            result_text=str(result),
            diagnostics=diags,
        )
    except Exception as e:
        return EvaluateResponse(
            ok=False,
            diagnostics=[Diagnostic("error", f"Evaluation failed: {e}"), *diags],
        )


# ══════════════════════════════════════════════════════════════════
#  PERSISTENCE
# ══════════════════════════════════════════════════════════════════

def persist(latex: str) -> PersistResponse:
    if "=" not in latex:
        return PersistResponse(
            ok=False,
            diagnostics=[Diagnostic("error", "Persist expects 'name = expression'.")],
        )
    left, right = latex.split("=", 1)
    name = re.sub(r"[^A-Za-z0-9_]", "", left.strip())
    try:
        value = parse_latex(right)
        _SYMBOLS[name] = value
        return PersistResponse(
            ok=True, stored_symbol=name,
            diagnostics=[Diagnostic("info", f"Stored {name}.")],
        )
    except Exception as e:
        return PersistResponse(
            ok=False,
            diagnostics=[Diagnostic("error", f"Persist failed: {e}")],
        )


# ══════════════════════════════════════════════════════════════════
#  UNIT CONVERSION
# ══════════════════════════════════════════════════════════════════

def convert_units(req: ConvertRequest) -> ConvertResponse:
    try:
        import pint
        ureg = pint.UnitRegistry()
        quantity = req.value * ureg(req.from_unit)
        converted = quantity.to(req.to_unit)
        return ConvertResponse(
            ok=True,
            result_value=float(converted.magnitude),
            result_text=f"{converted.magnitude:.6g} {req.to_unit}",
            diagnostics=[Diagnostic("info", f"Converted {req.value} {req.from_unit} → {req.to_unit}.")],
        )
    except Exception as e:
        return ConvertResponse(
            ok=False,
            diagnostics=[Diagnostic("error", f"Conversion failed: {e}")],
        )


# ══════════════════════════════════════════════════════════════════
#  PLOTTING — 2D
# ══════════════════════════════════════════════════════════════════

def plot(latex: str, mode: str, ranges: Optional[Dict[str, PlotRange]] = None,
         params: Optional[Dict[str, float]] = None) -> PlotResponse:
    diags: List[Diagnostic] = []
    defaults = ranges or {}
    try:
        # Detect free variables that aren't coordinate system standards
        # Split equation to avoid sympify error on '='
        detect_text = latex.split("=")[0] if "=" in latex else latex
        full_expr = parse_latex(detect_text)
        all_free = {str(s) for s in full_expr.free_symbols}
        coordinate_vars = {"x", "y", "z", "t", "pi", "e"}
        detected_vars = sorted(list(all_free - coordinate_vars))

        if mode == "plot2d":
            html = _build_2d(latex, defaults, params, diags)
        elif mode == "plot3d":
            html = _build_3d(latex, defaults, params, diags)
        elif mode == "geometry":
            html = _build_3d(latex, defaults, params, diags)
        else:
            return PlotResponse(ok=False, diagnostics=[Diagnostic("error", f"Unknown mode: {mode}")])

        return PlotResponse(ok=True, render_html=html, variables=detected_vars, diagnostics=diags)
    except Exception as e:
        return PlotResponse(ok=False, diagnostics=[Diagnostic("error", f"Plot failed: {e}"), *diags])


def _build_2d(latex: str, ranges: Dict[str, PlotRange],
              params: Optional[Dict[str, float]], diags: List[Diagnostic]) -> str:
    xr = ranges.get("x", PlotRange(-10, 10))
    yr = ranges.get("y", PlotRange(-10, 10))
    tr = ranges.get("t", PlotRange(-10, 10))
    x, y, t = sp.Symbol("x"), sp.Symbol("y"), sp.Symbol("t")
    fig = go.Figure()

    # ── Parametric 2D ──
    parametric = _try_parametric(latex, expected_dim=2, params=params)
    if parametric is not None:
        t_vals = np.linspace(tr.min, tr.max, 700)
        fx = sp.lambdify(t, parametric[0], "numpy")
        fy = sp.lambdify(t, parametric[1], "numpy")
        xs = np.asarray(fx(t_vals), dtype=float)
        ys = np.asarray(fy(t_vals), dtype=float)
        fig.add_trace(go.Scatter(x=xs, y=ys, mode="lines",
                                 line=dict(width=2.5, color="#636EFA"), name=latex))
        diags.append(Diagnostic("info", "Rendered parametric 2D curve."))
        return _style_2d(fig, xr, yr)

    # ── Equations (explicit or implicit) ──
    if "=" in latex:
        left_str, right_str = latex.split("=", 1)
        left_stripped = left_str.strip()

        # Explicit: y = f(x)
        if left_stripped == "y":
            expr = parse_latex(right_str, params)
            fn = sp.lambdify(x, expr, "numpy")
            x_vals = np.linspace(xr.min, xr.max, 700)
            y_vals = np.asarray(fn(x_vals), dtype=float)
            y_vals = np.where(np.isfinite(y_vals), y_vals, np.nan)
            fig.add_trace(go.Scatter(x=x_vals, y=y_vals, mode="lines",
                                     line=dict(width=2.5, color="#636EFA"), name=latex))
            diags.append(Diagnostic("info", "Rendered explicit 2D curve y=f(x)."))
            return _style_2d(fig, xr, yr)

        # Explicit: x = f(y)
        if left_stripped == "x":
            expr = parse_latex(right_str, params)
            fn = sp.lambdify(y, expr, "numpy")
            y_vals = np.linspace(yr.min, yr.max, 700)
            x_vals = np.asarray(fn(y_vals), dtype=float)
            x_vals = np.where(np.isfinite(x_vals), x_vals, np.nan)
            fig.add_trace(go.Scatter(x=x_vals, y=y_vals, mode="lines",
                                     line=dict(width=2.5, color="#636EFA"), name=latex))
            diags.append(Diagnostic("info", "Rendered explicit 2D curve x=f(y)."))
            return _style_2d(fig, xr, yr)

        # Implicit 2D: f(x,y) = g(x,y) → Contour at 0
        lhs = parse_latex(left_str, params)
        rhs = parse_latex(right_str, params)
        relation = sp.simplify(lhs - rhs)
        fn = sp.lambdify((x, y), relation, "numpy")
        res = 500
        x_vals = np.linspace(xr.min, xr.max, res)
        y_vals = np.linspace(yr.min, yr.max, res)
        X, Y = np.meshgrid(x_vals, y_vals)
        Z = np.asarray(fn(X, Y), dtype=float)
        Z = np.nan_to_num(Z, nan=1e12, posinf=1e12, neginf=-1e12)
        fig.add_trace(go.Contour(
            x=x_vals, y=y_vals, z=Z,
            autocontour=False,
            contours=dict(start=0, end=0, size=1, coloring="lines"),
            line=dict(width=2.5, color="#636EFA"),
            showscale=False, name=latex,
        ))
        diags.append(Diagnostic("info", "Rendered implicit 2D curve via High-Density Contour Engine (500×500)."))
        return _style_2d(fig, xr, yr)

    # ── Bare expression: treat as y = f(x) ──
    expr = parse_latex(latex, params)
    fn = sp.lambdify(x, expr, "numpy")
    x_vals = np.linspace(xr.min, xr.max, 700)
    y_vals = np.asarray(fn(x_vals), dtype=float)
    y_vals = np.where(np.isfinite(y_vals), y_vals, np.nan)
    fig.add_trace(go.Scatter(x=x_vals, y=y_vals, mode="lines",
                             line=dict(width=2.5, color="#636EFA"), name=latex))
    diags.append(Diagnostic("info", "Rendered 2D expression as y=f(x)."))
    return _style_2d(fig, xr, yr)


# ══════════════════════════════════════════════════════════════════
#  PLOTTING — 3D
# ══════════════════════════════════════════════════════════════════

def _build_3d(latex: str, ranges: Dict[str, PlotRange],
              params: Optional[Dict[str, float]], diags: List[Diagnostic]) -> str:
    xr = ranges.get("x", PlotRange(-5, 5))
    yr = ranges.get("y", PlotRange(-5, 5))
    zr = ranges.get("z", PlotRange(-5, 5))
    tr = ranges.get("t", PlotRange(-6.28, 6.28))
    x, y, z, t = sp.Symbol("x"), sp.Symbol("y"), sp.Symbol("z"), sp.Symbol("t")
    fig = go.Figure()

    # ── Vector / Point ──
    vec = _try_vector(latex, params)
    if vec is not None:
        if len(vec) == 2:
            vec = [vec[0], vec[1], 0.0]
        fig.add_trace(go.Scatter3d(
            x=[0.0, vec[0]], y=[0.0, vec[1]], z=[0.0, vec[2]],
            mode="lines+markers",
            line=dict(width=8, color="#636EFA"),
            marker=dict(size=4, color="#1d4ed8"),
            name=latex,
        ))
        diags.append(Diagnostic("info", "Rendered vector/point in 3D."))
        return _style_3d(fig, xr, yr, zr)

    # ── Parametric 3D ──
    parametric = _try_parametric(latex, expected_dim=3, params=params)
    if parametric is not None:
        t_vals = np.linspace(tr.min, tr.max, 700)
        fx = sp.lambdify(t, parametric[0], "numpy")
        fy = sp.lambdify(t, parametric[1], "numpy")
        fz = sp.lambdify(t, parametric[2], "numpy")
        fig.add_trace(go.Scatter3d(
            x=np.asarray(fx(t_vals), dtype=float),
            y=np.asarray(fy(t_vals), dtype=float),
            z=np.asarray(fz(t_vals), dtype=float),
            mode="lines", line=dict(width=6, color="#636EFA"), name=latex,
        ))
        diags.append(Diagnostic("info", "Rendered parametric 3D curve."))
        return _style_3d(fig, xr, yr, zr)

    # ── Equations ──
    if "=" in latex:
        left_str, right_str = latex.split("=", 1)

        # Explicit: z = f(x, y)
        if left_str.strip() == "z":
            expr = parse_latex(right_str, params)
            fn = sp.lambdify((x, y), expr, "numpy")
            res = 120
            x_vals = np.linspace(xr.min, xr.max, res)
            y_vals = np.linspace(yr.min, yr.max, res)
            X, Y = np.meshgrid(x_vals, y_vals)
            Z = np.asarray(fn(X, Y), dtype=float)
            Z = np.where(np.isfinite(Z), Z, np.nan)
            fig.add_trace(go.Surface(
                x=X, y=Y, z=Z,
                colorscale="Viridis", showscale=False, name=latex,
                lighting=dict(ambient=0.4, diffuse=0.6, specular=0.5, roughness=0.3, fresnel=0.5),
            ))
            diags.append(Diagnostic("info", "Rendered explicit 3D surface z=f(x,y)."))
            return _style_3d(fig, xr, yr, zr)

        # Implicit 3D: f(x,y,z) = g(x,y,z) → Isosurface at 0
        lhs = parse_latex(left_str, params)
        rhs = parse_latex(right_str, params)
        relation = sp.simplify(lhs - rhs)
        if relation == 0:
            return _style_3d(fig, xr, yr, zr)
        
        fn = sp.lambdify((x, y, z), relation, "numpy")
        res = 60 # Reduced from 85 for better memory/CPU stability
        x_vals = np.linspace(xr.min, xr.max, res)
        y_vals = np.linspace(yr.min, yr.max, res)
        z_vals = np.linspace(zr.min, zr.max, res)
        X, Y, Z = np.meshgrid(x_vals, y_vals, z_vals, indexing="ij")
        values = np.asarray(fn(X, Y, Z), dtype=float)
        values = np.nan_to_num(values, nan=1e12, posinf=1e12, neginf=-1e12)
        fig.add_trace(go.Isosurface(
            x=X.flatten(), y=Y.flatten(), z=Z.flatten(),
            value=values.flatten(),
            isomin=0, isomax=0, surface_count=1,
            opacity=0.9, colorscale="Viridis",
            caps=dict(x_show=False, y_show=False, z_show=False),
            showscale=False, name=latex,
            lighting=dict(ambient=0.4, diffuse=0.6, specular=0.5, roughness=0.3, fresnel=0.5),
        ))
        diags.append(Diagnostic("info", f"Rendered implicit 3D surface via High-Density Isosurface Engine ({res}³)."))
        return _style_3d(fig, xr, yr, zr)

    # Bare expression → try as z = f(x,y)
    expr = parse_latex(latex, params)
    fn = sp.lambdify((x, y), expr, "numpy")
    res = 120
    x_vals = np.linspace(xr.min, xr.max, res)
    y_vals = np.linspace(yr.min, yr.max, res)
    X, Y = np.meshgrid(x_vals, y_vals)
    Z = np.asarray(fn(X, Y), dtype=float)
    Z = np.where(np.isfinite(Z), Z, np.nan)
    fig.add_trace(go.Surface(
        x=X, y=Y, z=Z, colorscale="Viridis", showscale=False, name=latex,
    ))
    diags.append(Diagnostic("info", "Rendered 3D expression as z=f(x,y)."))
    return _style_3d(fig, xr, yr, zr)


# ══════════════════════════════════════════════════════════════════
#  STYLE HELPERS
# ══════════════════════════════════════════════════════════════════

def _style_2d(fig: go.Figure, xr: PlotRange, yr: PlotRange) -> str:
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=12, r=12, t=8, b=12),
        showlegend=False,
        dragmode="pan",
        xaxis=dict(
            range=[xr.min, xr.max],
            showgrid=True, gridcolor="rgba(255,255,255,0.08)",
            zeroline=True, zerolinewidth=1.5, zerolinecolor="rgba(255,255,255,0.25)",
            scaleanchor="y", scaleratio=1,
        ),
        yaxis=dict(
            range=[yr.min, yr.max],
            showgrid=True, gridcolor="rgba(255,255,255,0.08)",
            zeroline=True, zerolinewidth=1.5, zerolinecolor="rgba(255,255,255,0.25)",
        ),
    )
    return fig.to_html(
        include_plotlyjs="cdn", full_html=False,
        config=dict(displaylogo=False, displayModeBar=False, scrollZoom=True, responsive=True),
    )


def _style_3d(fig: go.Figure, xr: PlotRange, yr: PlotRange, zr: PlotRange) -> str:
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=0, r=0, t=8, b=0),
        showlegend=False,
        scene=dict(
            xaxis=dict(range=[xr.min, xr.max], backgroundcolor="rgba(0,0,0,0)",
                       gridcolor="rgba(255,255,255,0.08)", zerolinecolor="rgba(255,255,255,0.2)"),
            yaxis=dict(range=[yr.min, yr.max], backgroundcolor="rgba(0,0,0,0)",
                       gridcolor="rgba(255,255,255,0.08)", zerolinecolor="rgba(255,255,255,0.2)"),
            zaxis=dict(range=[zr.min, zr.max], backgroundcolor="rgba(0,0,0,0)",
                       gridcolor="rgba(255,255,255,0.08)", zerolinecolor="rgba(255,255,255,0.2)"),
            aspectmode="cube",
        ),
    )
    return fig.to_html(
        include_plotlyjs="cdn", full_html=False,
        config=dict(displaylogo=False, displayModeBar=True, scrollZoom=True, responsive=True),
    )


# ══════════════════════════════════════════════════════════════════
#  PARAMETRIC & VECTOR HELPERS
# ══════════════════════════════════════════════════════════════════

def _try_vector(text: str, params: Optional[Dict[str, float]] = None) -> Optional[List[float]]:
    # Delimiter stripping is already handled by parse_latex, but we call it on parts
    stripped = text.strip()
    # Handle <1, 2, 3> notation
    if stripped.startswith("<") and stripped.endswith(">"):
        parts = [p.strip() for p in stripped[1:-1].split(",")]
        try:
            return [float(parse_latex(p, params)) for p in parts]
        except Exception:
            return None
    # Handle \langle ... \rangle notation
    m = re.match(r"\\langle\s*(.*?)\s*\\rangle", stripped)
    if m:
        parts = [p.strip() for p in m.group(1).split(",")]
        try:
            return [float(parse_latex(p, params)) for p in parts]
        except Exception:
            return None
    # Handle Matrix result (e.g. from cross product)
    try:
        expr = parse_latex(text, params)
        if isinstance(expr, sp.Matrix):
            if expr.shape == (3, 1) or expr.shape == (1, 3):
                return [float(x) for x in expr]
    except Exception:
        pass
    return None


def _try_parametric(text: str, expected_dim: int,
                    params: Optional[Dict[str, float]] = None) -> Optional[List[sp.Expr]]:
    stripped = text.strip()
    if not (stripped.startswith("(") and stripped.endswith(")")):
        return None
    parts = _split_top_commas(stripped[1:-1])
    if len(parts) != expected_dim:
        return None
    try:
        return [parse_latex(p, params) for p in parts]
    except Exception:
        return None


def _split_top_commas(text: str) -> List[str]:
    """Split on commas that are not inside parentheses or braces."""
    parts, depth, current = [], 0, []
    for ch in text:
        if ch in "({[":
            depth += 1
        elif ch in ")}]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    parts.append("".join(current).strip())
    return parts
