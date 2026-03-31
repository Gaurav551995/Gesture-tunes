@echo off
setlocal

cd /d "%~dp0"

set "PORT=8000"
set "SERVER_CMD="

where py >nul 2>nul
if %errorlevel%==0 (
    set "SERVER_CMD=py -m http.server %PORT%"
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        set "SERVER_CMD=python -m http.server %PORT%"
    )
)

if not defined SERVER_CMD (
    echo Python was not found on this machine.
    echo Install Python and then run this file again.
    pause
    exit /b 1
)

echo Starting Gesture Tunes at http://localhost:%PORT%
start "Gesture Tunes Server" cmd /k %SERVER_CMD%

timeout /t 2 /nobreak >nul
start "" http://localhost:%PORT%

echo Gesture Tunes is opening in your browser.
echo Keep the server window open while you use the app.
endlocal
