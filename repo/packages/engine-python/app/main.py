"""Kings CalcLatex Engine — FastAPI server.

Run with: uvicorn app.main:app --host 127.0.0.1 --port 3210
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional

from .engine import evaluate, persist, plot, convert_units
from .models import PlotRange, ConvertRequest

app = FastAPI(
    title="Kings CalcLatex Engine",
    version="0.1.0",
    description="Local math engine for Kings CalcLatex Obsidian plugin.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic request schemas (for FastAPI auto-validation) ────────

class EvalBody(BaseModel):
    latex: str
    mode: str = "exact"  # exact | approximate | simplify | solve | factor


class PersistBody(BaseModel):
    latex: str


class RangeBody(BaseModel):
    min: float = -10.0
    max: float = 10.0


class PlotBody(BaseModel):
    latex: str
    mode: str = "plot2d"  # plot2d | plot3d | geometry
    ranges: Optional[Dict[str, RangeBody]] = None
    parameters: Optional[Dict[str, float]] = None


class ConvertBody(BaseModel):
    value: float
    from_unit: str
    to_unit: str


# ── Endpoints ─────────────────────────────────────────────────────

@app.get("/api/v1/health")
async def health():
    return {"ok": True, "engine": "Kings CalcLatex", "version": "0.1.0"}


@app.post("/api/v1/evaluate")
async def api_evaluate(body: EvalBody):
    result = evaluate(body.latex, body.mode)
    return {
        "ok": result.ok,
        "resultLatex": result.result_latex,
        "resultText": result.result_text,
        "diagnostics": [{"level": d.level, "message": d.message} for d in result.diagnostics],
    }


@app.post("/api/v1/persist")
async def api_persist(body: PersistBody):
    result = persist(body.latex)
    return {
        "ok": result.ok,
        "storedSymbol": result.stored_symbol,
        "diagnostics": [{"level": d.level, "message": d.message} for d in result.diagnostics],
    }


@app.post("/api/v1/plot")
async def api_plot(body: PlotBody):
    ranges_dict = None
    if body.ranges:
        ranges_dict = {k: PlotRange(v.min, v.max) for k, v in body.ranges.items()}
    result = plot(body.latex, body.mode, ranges_dict, body.parameters)
    return {
        "ok": result.ok,
        "renderHtml": result.render_html,
        "diagnostics": [{"level": d.level, "message": d.message} for d in result.diagnostics],
    }


@app.post("/api/v1/convert")
async def api_convert(body: ConvertBody):
    req = ConvertRequest(value=body.value, from_unit=body.from_unit, to_unit=body.to_unit)
    result = convert_units(req)
    return {
        "ok": result.ok,
        "resultValue": result.result_value,
        "resultText": result.result_text,
        "diagnostics": [{"level": d.level, "message": d.message} for d in result.diagnostics],
    }
