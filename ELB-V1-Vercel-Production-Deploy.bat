@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo ELB_V1 Vercel Production Deploy
echo ==========================================
echo.

if not exist node_modules (
  echo node_modules fehlt. Bitte zuerst npm install ausfuehren.
  pause
  exit /b 1
)

if not exist .vercel\project.json (
  echo Dieses Repo ist noch nicht mit Vercel verknuepft.
  echo Bitte zuerst ELB-V1-Vercel-Einrichten.bat ausfuehren.
  pause
  exit /b 1
)

call npm run verify:web
if errorlevel 1 (
  echo.
  echo verify:web ist fehlgeschlagen. Deploy wird abgebrochen.
  pause
  exit /b 1
)

call npm run vercel:prod
if errorlevel 1 (
  echo.
  echo Production Deploy fehlgeschlagen.
  pause
  exit /b 1
)

echo.
echo Production Deploy abgeschlossen.
pause
