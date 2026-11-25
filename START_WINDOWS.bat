@echo off
cd /d "%~dp0"
title Healing Lounge
echo.
echo === Healing Lounge local server ===
where node >/dev/null 2>nul
if errorlevel 1 goto nonode
if not exist node_modules (
  echo Installing packages. First time only, please wait...
  call npm install --omit=dev
)
echo.
echo Starting server. Browser opens in a few seconds.
echo Close this window to stop the server.
echo.
start "" cmd /c "ping 127.0.0.1 -n 5 >/dev/null & start http://localhost:3000"
node server\index.js
echo.
echo Server stopped. See the message above.
pause
exit /b
:nonode
echo.
echo Node.js is not installed.
echo Install the LTS version from https://nodejs.org then double-click this file again.
start https://nodejs.org
pause
