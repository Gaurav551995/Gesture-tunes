@echo off
setlocal

cd /d "%~dp0"

set "PORT=8000"

echo Starting Gesture Tunes at http://localhost:%PORT%
start "Gesture Tunes Server" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port %PORT%

timeout /t 2 /nobreak >nul
start "" http://localhost:%PORT%

echo Gesture Tunes is opening in your browser.
echo Keep the PowerShell server window open while you use the app.
endlocal
