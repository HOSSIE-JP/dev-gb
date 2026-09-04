@echo off
setlocal
set "GBDEV_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%GBDEV_ROOT%scripts\run.ps1" %*
exit /b %ERRORLEVEL%
