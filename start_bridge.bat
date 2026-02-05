@echo off
cd /d "%~dp0"
echo Starte EchoForge Bridge...
echo Bitte warten, der Browser oeffnet sich gleich automatisch.
echo Fenster nicht schliessen! (Zum Beenden 'stop_bridge.bat' nutzen oder Fenster schliessen)
npm run dev
