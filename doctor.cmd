@echo off
setlocal
set "GBDEV_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%GBDEV_ROOT%scripts\doctor.ps1" %*
exit /b %ERRORLEVEL%
