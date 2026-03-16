@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo Abhaengigkeiten fehlen. Bitte zuerst "npm install" ausfuehren.
  pause
  exit /b 1
)

echo Starte ELB V1 im Entwicklungsmodus...
call npm run desktop:dev

if errorlevel 1 (
  echo.
  echo Der Start ist fehlgeschlagen.
  pause
  exit /b 1
)

endlocal
