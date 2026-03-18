@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo Abhaengigkeiten fehlen. Bitte zuerst "npm install" ausfuehren.
  pause
  exit /b 1
)

echo Erzeuge den Web-Build...
call npm run web:build

if errorlevel 1 (
  echo.
  echo Der Web-Build ist fehlgeschlagen.
  pause
  exit /b 1
)

echo.
echo Starte die gebaute Web-App im Preview-Modus...
echo Nach dem Start ist die App typischerweise unter http://localhost:4173 erreichbar.
call npm run web:preview

if errorlevel 1 (
  echo.
  echo Der Web-Preview-Start ist fehlgeschlagen.
  pause
  exit /b 1
)

endlocal
