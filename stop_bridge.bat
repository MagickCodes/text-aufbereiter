@echo off
cd /d "%~dp0"
echo Beende EchoForge Bridge (Port 5173)...
call npx kill-port 5173
echo Server gestoppt.
timeout /t 3
