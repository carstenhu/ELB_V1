@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo ELB_V1 Vercel Einrichtung
echo ==========================================
echo.
echo Dieser Schritt meldet dich bei Vercel an und verknuepft
echo dieses Repo mit einem Vercel-Projekt.
echo.

if not exist node_modules (
  echo node_modules fehlt. Bitte zuerst npm install ausfuehren.
  pause
  exit /b 1
)

call npm run vercel:login
if errorlevel 1 (
  echo.
  echo Vercel Login fehlgeschlagen oder abgebrochen.
  pause
  exit /b 1
)

call npm run vercel:link
if errorlevel 1 (
  echo.
  echo Vercel Projekt-Link fehlgeschlagen oder abgebrochen.
  pause
  exit /b 1
)

echo.
echo Einrichtung abgeschlossen.
echo Danach kannst du die Deploy-Batch-Dateien verwenden.
pause
