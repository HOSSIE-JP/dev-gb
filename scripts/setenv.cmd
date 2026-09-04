@echo off
for %%I in ("%~dp0..") do set "GBDEV_ROOT=%%~fI"
set "GBDK_HOME=%GBDEV_ROOT%\.tools\gbdk"
set "RGBDS_HOME=%GBDEV_ROOT%\.tools\rgbds"
set "BGB_HOME=%GBDEV_ROOT%\.tools\bgb"
set "EMULICIOUS_HOME=%GBDEV_ROOT%\.tools\emulicious"
set "VSCODE_HOME=%GBDEV_ROOT%\.tools\vscode"
set "TEMP=%GBDEV_ROOT%\.cache\tmp"
set "TMP=%TEMP%"
if not exist "%TEMP%" mkdir "%TEMP%"

if exist "%EMULICIOUS_HOME%\java\bin\java.exe" set "JAVA_HOME=%EMULICIOUS_HOME%\java"
if exist "%EMULICIOUS_HOME%\jre\bin\java.exe" set "JAVA_HOME=%EMULICIOUS_HOME%\jre"
if exist "%EMULICIOUS_HOME%\Java\bin\java.exe" set "JAVA_HOME=%EMULICIOUS_HOME%\Java"

if defined GBDEV_ENV_ACTIVE goto gbdev_path_ready
set "PATH=%GBDK_HOME%\bin;%RGBDS_HOME%;%BGB_HOME%;%EMULICIOUS_HOME%;%VSCODE_HOME%;%PATH%"
set "GBDEV_ENV_ACTIVE=1"
:gbdev_path_ready

if not defined JAVA_HOME goto gbdev_java_ready
if defined GBDEV_JAVA_ENV_ACTIVE goto gbdev_java_ready
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "GBDEV_JAVA_ENV_ACTIVE=1"
:gbdev_java_ready

if not exist "%GBDK_HOME%\bin\lcc.exe" echo [WARN] GBDK is missing. Run bootstrap.cmd.
if not exist "%RGBDS_HOME%\rgbasm.exe" echo [WARN] RGBDS is missing. Run bootstrap.cmd.
