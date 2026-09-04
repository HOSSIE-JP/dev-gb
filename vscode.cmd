@echo off
setlocal
set "GBDEV_ROOT=%~dp0"
set "CODE_EXE=%GBDEV_ROOT%.tools\vscode\Code.exe"
if not exist "%CODE_EXE%" (
  echo [FAIL] Portable VS Code was not found. Run bootstrap.cmd first.
  exit /b 1
)
if not exist "%GBDEV_ROOT%.tools\vscode\data" mkdir "%GBDEV_ROOT%.tools\vscode\data"
if not exist "%GBDEV_ROOT%.tools\vscode\data" (
  echo [FAIL] Could not create the portable VS Code data directory.
  exit /b 1
)
if not exist "%GBDEV_ROOT%.tools\vscode\data\tmp" mkdir "%GBDEV_ROOT%.tools\vscode\data\tmp"
if not exist "%GBDEV_ROOT%.tools\vscode\data\tmp" (
  echo [FAIL] Could not create the portable VS Code temporary directory.
  exit /b 1
)
start "GB Dev VS Code" /D "%GBDEV_ROOT%.tools\vscode" "%CODE_EXE%" "%GBDEV_ROOT%."
exit /b 0
