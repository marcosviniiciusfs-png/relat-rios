@echo off
cd /d "%~dp0"
if not exist node_modules\playwright-core call npm install --no-audit --no-fund
start "" http://localhost:5174
node server.js
