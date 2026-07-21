import sympy as sp
import re
from app.engine import parse_latex, evaluate, plot, PlotRange

def test_repro():
    print("--- Testing Implicit Plots ---")
    # Case 1: Sphere
    res1 = plot("x^{2}+y^{2}+z^{2}=9", "plot3d")
    print(f"Sphere Plot OK: {res1.ok}")
    if not res1.ok: print(f"Error: {res1.diagnostics[0].message}")

    # Case 2: Heart 2D
    res2 = plot("(x^{2}+y^{2}-1)^{3}-x^{2}y^{3}=0", "plot2d")
    print(f"Heart 2D OK: {res2.ok}")
    if not res2.ok: print(f"Error: {res2.diagnostics[0].message}")

    print("\n--- Testing Matrix Cross Product ---")
    # Case 3: Matrix multiplication
    latex_matrix = r"\begin{pmatrix} 1 \\ 0 \\ 0 \end{pmatrix} \times \begin{pmatrix} 0 \\ 1 \\ 0 \end{pmatrix}"
    res3 = evaluate(latex_matrix, "exact")
    print(f"Matrix Cross OK: {res3.ok}")
    if res3.ok:
        print(f"Result: {res3.result_text}")
    else:
        print(f"Error: {res3.diagnostics[0].message}")

if __name__ == "__main__":
    test_repro()
