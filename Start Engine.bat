@echo off
echo Starting Kings CalcLatex Engine on port 3210...
cd /d "%~dp0repo\packages\engine-python"
python -m uvicorn app.main:app --host 127.0.0.1 --port 3210
pause
