@echo off
title Formula Copilot Server
echo Starting local server for Formula Copilot...
echo https://localhost:3000  (open this in a browser to verify)
echo Press Ctrl+C to stop.
cd /d "%~dp0"
node server\serve.mjs
pause
