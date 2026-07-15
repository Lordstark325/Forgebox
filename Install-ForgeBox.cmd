@echo off
setlocal
title ForgeBox Installer
cd /d "%~dp0"

echo ============================================================
echo  ForgeBox - Independent Container Engine Installer
echo ============================================================
echo.
echo This installs a dedicated ForgeBox WSL2 engine using:
echo  - Ubuntu 24.04 LTS
echo  - Open-source Moby/Docker Engine
echo  - BuildKit
echo  - Compose v2
echo.
echo Docker Desktop is not required.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0engine\install-engine.ps1"
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo ForgeBox installed successfully.
  echo Run start.ps1 to open the dashboard.
) else (
  echo ForgeBox installation did not complete. Error code: %RESULT%
  echo Review the message above, then run this installer again.
)
echo.
pause
exit /b %RESULT%
