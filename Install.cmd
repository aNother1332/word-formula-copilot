@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1"
if errorlevel 1 (echo Installation failed. Please read the error above.) else (echo Installation completed. Open Word normally.)
pause
