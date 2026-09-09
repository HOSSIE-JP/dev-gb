@echo off
setlocal
set "GBDEV_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%GBDEV_ROOT%scripts\setup.ps1" %*
exit /b %ERRORLEVEL%
