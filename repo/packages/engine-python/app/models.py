"""Kings CalcLatex Engine — typed request/response models."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ── shared primitives ──────────────────────────────────────────────

@dataclass
class PlotRange:
    min: float = -10.0
    max: float = 10.0


@dataclass
class Diagnostic:
    level: str = "info"  # "info" | "warning" | "error"
    message: str = ""


# ── evaluate ───────────────────────────────────────────────────────

@dataclass
class EvaluateRequest:
    latex: str = ""
    mode: str = "exact"  # "exact" | "approximate" | "simplify" | "solve" | "factor"


@dataclass
class EvaluateResponse:
    ok: bool = False
    result_latex: str = ""
    result_text: str = ""
    diagnostics: List[Diagnostic] = field(default_factory=list)


# ── persist ────────────────────────────────────────────────────────

@dataclass
class PersistRequest:
    latex: str = ""


@dataclass
class PersistResponse:
    ok: bool = False
    stored_symbol: str = ""
    diagnostics: List[Diagnostic] = field(default_factory=list)


# ── plot ───────────────────────────────────────────────────────────

@dataclass
class PlotRequest:
    latex: str = ""
    mode: str = "plot2d"  # "plot2d" | "plot3d" | "geometry"
    ranges: Optional[Dict[str, PlotRange]] = None
    parameters: Optional[Dict[str, float]] = None


@dataclass
class PlotResponse:
    ok: bool = False
    render_html: str = ""
    variables: List[str] = field(default_factory=list)
    diagnostics: List[Diagnostic] = field(default_factory=list)


# ── convert ────────────────────────────────────────────────────────

@dataclass
class ConvertRequest:
    value: float = 0.0
    from_unit: str = ""
    to_unit: str = ""


@dataclass
class ConvertResponse:
    ok: bool = False
    result_value: float = 0.0
    result_text: str = ""
    diagnostics: List[Diagnostic] = field(default_factory=list)
