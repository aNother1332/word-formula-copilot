@echo off
title Formula Copilot Launcher
echo ============================================
echo   Formula Copilot Launcher
echo ============================================

rem Word must NOT be running: the dev sideload is read when Word starts.
tasklist | find /I "WINWORD.EXE" >nul
if %errorlevel%==0 (
  echo.
  echo [!] Word is currently running. Please close Word completely first,
  echo     then run this launcher again.
  echo.
  pause
  exit /b 0
)

echo Loading the add-in and starting Word...
cd /d "%~dp0"
call npx -y office-addin-debugging start manifest.xml

echo.
echo Done. Word should open with the Formula Copilot task pane on the right.
echo If no pane appears, click the "Formula Copilot" button on the right
echo side of the HOME tab in Word.
echo.
echo Tip: create a desktop shortcut to this file - it is the daily entry
echo point of the add-in on Office builds that ignore dev sideloads.
echo.
echo (This window can be closed.)
pause
