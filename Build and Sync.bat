@echo off
set PLUGIN_DIR=%~dp0repo\packages\obsidian-plugin
set VAULT_PLUGIN_DIR=%~dp0..\..\..\.obsidian\plugins\kings-calclatex

echo Building King's CalcLatex Plugin...
cd /d "%PLUGIN_DIR%"
call npm install
call npm run build

echo Syncing to Vault...
if not exist "%VAULT_PLUGIN_DIR%" mkdir "%VAULT_PLUGIN_DIR%"
copy /y main.js "%VAULT_PLUGIN_DIR%\"
copy /y manifest.json "%VAULT_PLUGIN_DIR%\"
copy /y styles.css "%VAULT_PLUGIN_DIR%\"

echo Done! Restart Obsidian to see changes.
pause
