@echo off
call "%~dp0scripts\setenv.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%
cd /d "%~dp0"
title GB Dev Portable Shell
cmd.exe /k
