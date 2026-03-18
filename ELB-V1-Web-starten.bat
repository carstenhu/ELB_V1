@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo Abhaengigkeiten fehlen. Bitte zuerst "npm install" ausfuehren.
  pause
  exit /b 1
)

echo Starte ELB V1 Web-App im Browsermodus...
echo Nach dem Start ist die App typischerweise unter http://localhost:5173 erreichbar.
call npm run web:dev

if errorlevel 1 (
  echo.
  echo Der Web-Start ist fehlgeschlagen.
  pause
  exit /b 1
)

endlocal
