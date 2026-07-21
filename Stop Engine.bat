@echo off
echo Stopping Kings CalcLatex Engine...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3210 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)
echo Engine stopped.
pause
