@echo off
echo ============================================
echo  King's CalcLatex v2 — Build and Sync
echo ============================================

cd /d "%~dp0\..\repo-v2"

echo.
echo [1/3] Building plugin...
call npm run build
if errorlevel 1 (
    echo.
    echo BUILD FAILED. Fix errors above and retry.
    exit /b 1
)

echo.
echo [2/3] Syncing to Obsidian plugin directory...
set VAULT=%~dp0\..\..\..\..\..
set PLUGIN_DIR=%VAULT%\.obsidian\plugins\kings-calclatex

if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"

copy /y "main.js" "%PLUGIN_DIR%\main.js" >nul
copy /y "manifest.json" "%PLUGIN_DIR%\manifest.json" >nul
copy /y "styles\main.css" "%PLUGIN_DIR%\styles.css" >nul

echo.
echo [3/3] Done!
echo    main.js    → %PLUGIN_DIR%\main.js
echo    manifest   → %PLUGIN_DIR%\manifest.json
echo    styles     → %PLUGIN_DIR%\styles.css
echo.
echo Reload Obsidian or use Ctrl+P → "Reload app without saving"
