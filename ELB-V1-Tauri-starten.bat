@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo Abhaengigkeiten fehlen. Bitte zuerst "npm install" ausfuehren.
  pause
  exit /b 1
)

if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo Rust / Cargo ist nicht installiert.
  echo Bitte zuerst Rust installieren: https://www.rust-lang.org/tools/install
  pause
  exit /b 1
)

echo Starte ELB V1 als echte Tauri-App...
call npm run desktop:tauri

if errorlevel 1 (
  echo.
  echo Der Tauri-Start ist fehlgeschlagen.
  pause
  exit /b 1
)

endlocal
